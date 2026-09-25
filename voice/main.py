"""CareVoice real-time voice service (pipecat-ai).

Placeholder for now. The telephony provider (Exotel / Twilio) will stream call audio to a websocket
here; each call runs ONE pipecat pipeline (Sarvam STT -> OpenAI LLM -> Sarvam TTS). Agent handoff swaps
the agent configuration (prompt + allowed tools + flow) inside that same session. The LLM never
touches the database: every tool call is sent to the backend's Policy Engine over HTTP
(BACKEND_URL + INTERNAL_API_KEY).
"""

import asyncio
import logging
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings, SettingsConfigDict

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    sarvam_api_key: str = ""
    sarvam_stt_model: str = "saaras:v3"
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_speaker: str = ""
    telephony_provider: str = "exotel"
    public_base_url: str = ""
    backend_url: str = "http://localhost:8000"
    internal_api_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


settings = Settings()

app = FastAPI(title="CareVoice Voice Service", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)


def _pipecat_version() -> str | None:
    try:
        return version("pipecat-ai")
    except PackageNotFoundError:
        return None


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "carevoice-voice",
        "pipecat": _pipecat_version(),
        "telephony_provider": settings.telephony_provider,
        "configured": {
            "openai": bool(settings.openai_api_key),
            "sarvam": bool(settings.sarvam_api_key),
            "internal_api_key": bool(settings.internal_api_key),
        },
    }


# ---------------------------------------------------------------------------
# Browser Test Call: SmallWebRTC signalling. One pipeline (bot.run_bot) per peer connection.
# ---------------------------------------------------------------------------

from pipecat.transports.smallwebrtc.request_handler import (  # noqa: E402
    IceCandidate,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

from bot import run_bot  # noqa: E402

webrtc = SmallWebRTCRequestHandler()


@app.post("/api/offer")
async def offer(request: Request, background: BackgroundTasks) -> dict[str, Any]:
    body = await request.json()

    async def on_connection(connection: Any) -> None:
        background.add_task(run_bot, connection, settings)

    answer = await webrtc.handle_web_request(SmallWebRTCRequest.from_dict(body), on_connection)
    return answer or {}


@app.patch("/api/offer")
async def offer_patch(request: Request) -> dict[str, str]:
    body = await request.json()
    candidates = [IceCandidate(**c) for c in body.get("candidates", [])]
    await webrtc.handle_patch_request(SmallWebRTCPatchRequest(pc_id=body["pc_id"], candidates=candidates))
    return {"status": "success"}


@app.on_event("shutdown")
async def _shutdown() -> None:
    await asyncio.shield(webrtc.close())
