"""Speech interfaces used outside the real-time pipeline (e.g. re-transcribing a recording, a TTS
preview in the dashboard). The live call path uses pipecat services inside /voice."""

from abc import ABC, abstractmethod
from typing import Literal

from app.core.config import Settings

Language = Literal["te", "hi", "en"]


class SpeechToText(ABC):
    @abstractmethod
    async def transcribe(self, audio: bytes, *, mime_type: str, language: Language | None = None) -> str: ...


class TextToSpeech(ABC):
    @abstractmethod
    async def synthesize(self, text: str, *, language: Language, speaker: str | None = None) -> bytes: ...


class SarvamSpeech(SpeechToText, TextToSpeech):
    """Sarvam AI — SARVAM_STT_MODEL / SARVAM_TTS_MODEL / SARVAM_SPEAKER."""

    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def is_configured(self) -> bool:
        return bool(self._s.sarvam_api_key)

    async def transcribe(self, audio: bytes, *, mime_type: str, language: Language | None = None) -> str:
        raise NotImplementedError("Sarvam STT is implemented in the voice milestone")

    async def synthesize(self, text: str, *, language: Language, speaker: str | None = None) -> bytes:
        raise NotImplementedError("Sarvam TTS is implemented in the voice milestone")
