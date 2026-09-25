"""One Pipecat voice session per call.

transport → Sarvam STT (saaras, code-mix) → language tracker → user aggregator (Silero VAD)
  → OpenAI LLM (tools via backend Policy Engine) → assistant-text logger → Sarvam TTS (bulbul)
  → transport → assistant aggregator

The LLM never touches the database: every tool call is POSTed to BACKEND_URL/internal/tools/{name}.
"""

import asyncio
from collections import Counter, deque
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TranscriptionFrame,
    TTSSpeakFrame,
    TTSUpdateSettingsFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.llm_service import FunctionCallParams
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.services.sarvam.tts import SarvamTTSService
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

IST = ZoneInfo("Asia/Kolkata")
TTS_LANG = {"te": Language.TE_IN, "hi": Language.HI_IN, "en": Language.EN_IN}
FILLER = {
    "te": "ఒక్క నిమిషం, చెక్ చేస్తున్నాను.",
    "hi": "एक मिनट, मैं चेक कर रही हूँ।",
    "en": "One moment, let me check.",
}

STYLE = """
Speaking style (this is a phone call):
- Reply in the patient's language and mirror their mixing. Telugu words in Telugu script, Hindi words in
  Devanagari, English words in English letters (e.g. "మీ appointment రేపు ఉదయం 10 గంటలకు confirm అయింది").
- At most two short sentences per reply. No lists, no markdown, no emojis.
- Be warm and respectful: "garu" in Telugu, "ji" in Hindi.
- Never give medical advice, diagnose, or name medicines. Never invent doctors, times, prices or policies:
  say only what a tool returned. Use the "spoken" field for times, in the patient's language.
- Emergencies (chest pain, cannot breathe, unconscious, heavy bleeding, self-harm): tell them to call 108 or go
  to the nearest emergency now, then call escalate with priority critical.

Booking procedure: verify the caller first (verify_patient with birth year or date of birth), then
search_doctors, get_available_slots (offer at most two), hold_slot, read back doctor + day + time, and only
after a clear yes call create_appointment. Then ask if they need anything else, and call record_outcome
before saying goodbye.
"""


def lang_code(language: Any) -> str | None:
    if not language:
        return None
    code = str(getattr(language, "value", language)).lower()[:2]
    return code if code in TTS_LANG else None


class Backend:
    def __init__(self, base_url: str, internal_key: str) -> None:
        self._http = httpx.AsyncClient(base_url=base_url, headers={"X-Internal-Key": internal_key}, timeout=15)

    async def post(self, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        r = await self._http.post(path, json=body or {})
        r.raise_for_status()
        return r.json()

    def fire(self, path: str, body: dict[str, Any]) -> None:
        """Fire-and-forget (transcripts): never block the audio pipeline."""

        async def _send() -> None:
            try:
                await self.post(path, body)
            except Exception as e:  # noqa: BLE001
                logger.warning(f"backend {path} failed: {e}")

        asyncio.create_task(_send())

    async def close(self) -> None:
        await self._http.aclose()


class LanguageTracker(FrameProcessor):
    """Logs patient turns and keeps TTS in the conversation's dominant language (last 3 patient turns)."""

    def __init__(self, backend: Backend, call_id: str, tts: SarvamTTSService, initial: str) -> None:
        super().__init__()
        self._backend, self._call_id, self._tts = backend, call_id, tts
        self._recent: deque[str] = deque([initial], maxlen=3)
        self.current = initial

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            lang = lang_code(frame.language)
            self._backend.fire(f"/internal/calls/{self._call_id}/transcript",
                               {"speaker": "patient", "text": frame.text, "language": lang})
            if lang:
                self._recent.append(lang)
                dominant = Counter(self._recent).most_common(1)[0][0]
                if dominant != self.current:
                    self.current = dominant
                    logger.info(f"conversation language -> {dominant}")
                    await self.push_frame(TTSUpdateSettingsFrame(delta=SarvamTTSService.Settings(language=TTS_LANG[dominant])))
        await self.push_frame(frame, direction)


class AssistantLogger(FrameProcessor):
    """Collects each LLM reply and logs it as an agent transcript turn."""

    def __init__(self, backend: Backend, call_id: str, tracker: LanguageTracker) -> None:
        super().__init__()
        self._backend, self._call_id, self._tracker = backend, call_id, tracker
        self._buf: list[str] = []

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._buf = []
        elif isinstance(frame, LLMTextFrame):
            self._buf.append(frame.text)
        elif isinstance(frame, LLMFullResponseEndFrame) and "".join(self._buf).strip():
            self._backend.fire(f"/internal/calls/{self._call_id}/transcript",
                               {"speaker": "agent", "text": "".join(self._buf).strip(), "language": self._tracker.current})
            self._buf = []
        await self.push_frame(frame, direction)


def greeting(start: dict[str, Any]) -> tuple[str, str]:
    lang = start["caller"]["preferred_language"] or "te"
    name = start["caller"]["first_name"]
    disclosure = (start.get("disclosure") or {}).get(lang, "")
    hello = {
        "te": f"{name} గారు, నమస్కారం! ఈరోజు మీకు ఎలా సహాయం చేయగలను?" if name else "ఈరోజు మీకు ఎలా సహాయం చేయగలను?",
        "hi": f"{name} जी, नमस्ते! आज मैं आपकी क्या मदद कर सकती हूँ?" if name else "आज मैं आपकी क्या मदद कर सकती हूँ?",
        "en": f"Hello {name}! How can I help you today?" if name else "How can I help you today?",
    }[lang]
    return lang, f"{disclosure} {hello}".strip()


async def run_bot(connection: Any, settings: Any) -> None:
    backend = Backend(settings.backend_url, settings.internal_api_key)
    start = await backend.post("/internal/calls/start", {"channel": "web"})
    call_id = start["call_id"]
    lang, first_line = greeting(start)
    logger.info(f"call {call_id} started (caller known={start['caller']['known']}, lang={lang})")

    transport = SmallWebRTCTransport(
        webrtc_connection=connection,
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
    )
    stt = SarvamSTTService(
        api_key=settings.sarvam_api_key,
        mode="codemix",
        settings=SarvamSTTService.Settings(model=settings.sarvam_stt_model),
    )
    tts = SarvamTTSService(
        api_key=settings.sarvam_api_key,
        settings=SarvamTTSService.Settings(
            model=settings.sarvam_tts_model, voice=settings.sarvam_speaker or "priya", language=TTS_LANG[lang]
        ),
    )
    llm = OpenAILLMService(api_key=settings.openai_api_key, settings=OpenAILLMService.Settings(model=settings.openai_model))

    tools = start["agent"]["tools"]
    for spec in tools:
        name = spec["name"]

        async def handler(params: FunctionCallParams, _name: str = name) -> None:
            try:
                result = await backend.post(f"/internal/tools/{_name}", {"call_id": call_id, "arguments": dict(params.arguments or {})})
            except Exception as e:  # noqa: BLE001
                result = {"ok": False, "error_code": "BACKEND_ERROR", "message_for_agent": f"System error: {e}. Apologise and offer staff callback."}
            logger.info(f"tool {_name} -> ok={result.get('ok')} {result.get('error_code') or ''}")
            await params.result_callback(result)

        llm.register_function(name, handler)

    now = datetime.now(IST)
    system = (
        f"{start['agent']['prompt']}\n{STYLE}\n"
        f"Hospital: {start['hospital']}. Today is {now:%A %d %B %Y}, time {now:%H:%M} IST (dates for tools: YYYY-MM-DD).\n"
        f"Caller: {'registered patient ' + start['caller']['first_name'] if start['caller']['known'] else 'unknown number'}; "
        f"preferred language {lang}. They are NOT verified yet.\n"
        f"You already said: \"{first_line}\""
    )
    context = LLMContext(
        messages=[{"role": "system", "content": system}, {"role": "assistant", "content": first_line}],
        tools=ToolsSchema(standard_tools=[FunctionSchema(s["name"], s["description"], s["parameters"].get("properties", {}),
                                                         s["parameters"].get("required", [])) for s in tools]),
    )
    aggregators = LLMContextAggregatorPair(context, user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()))
    tracker = LanguageTracker(backend, call_id, tts, lang)
    assistant_log = AssistantLogger(backend, call_id, tracker)

    pipeline = Pipeline([
        transport.input(), stt, tracker, aggregators.user(), llm, assistant_log, tts, transport.output(), aggregators.assistant(),
    ])
    task = PipelineTask(pipeline, params=PipelineParams(enable_metrics=True, allow_interruptions=True))

    @llm.event_handler("on_function_calls_started")
    async def on_tools(_service: Any, _calls: Any) -> None:
        await tts.queue_frame(TTSSpeakFrame(FILLER[tracker.current]))

    @transport.event_handler("on_client_connected")
    async def on_connected(_t: Any, _c: Any) -> None:
        backend.fire(f"/internal/calls/{call_id}/transcript", {"speaker": "agent", "text": first_line, "language": lang})
        backend.fire(f"/internal/calls/{call_id}/event", {"type": "stage_change", "label": "listening"})
        await task.queue_frames([TTSSpeakFrame(first_line)])

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(_t: Any, _c: Any) -> None:
        await task.cancel()

    try:
        await PipelineRunner(handle_sigint=False).run(task)
    finally:
        try:
            await backend.post(f"/internal/calls/{call_id}/end")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"end call failed: {e}")
        await backend.close()
        logger.info(f"call {call_id} ended")
