"""LLM interface. The LLM only ever *proposes* tool calls; it never touches the database."""

from abc import ABC, abstractmethod
from typing import Literal, TypedDict

from openai import AsyncOpenAI

from app.core.config import Settings


class ChatMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, messages: list[ChatMessage], *, model: str | None = None) -> str: ...


class OpenAIProvider(LLMProvider):
    """OpenAI — OPENAI_MODEL for conversation, OPENAI_SUMMARY_MODEL for post-call summaries."""

    def __init__(self, settings: Settings) -> None:
        self._s = settings
        self._client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    async def complete(self, messages: list[ChatMessage], *, model: str | None = None) -> str:
        if self._client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")
        resp = await self._client.chat.completions.create(
            model=model or self._s.openai_model,
            messages=list(messages),  # type: ignore[arg-type]
        )
        return resp.choices[0].message.content or ""
