"""Bolna hosted voice agents (https://www.bolna.ai/docs): places real outbound phone calls.

Bolna runs telephony + STT + LLM + TTS on its side; we pass the patient's context as `user_data`
(variables used in the Bolna agent prompt) and read the result back from the execution.
"""

from typing import Any

import httpx

from app.core.config import Settings

BASE_URL = "https://api.bolna.ai"

# Bolna execution status → our calls.status / current_stage
LIVE_STATUSES = {"queued", "initiated", "ringing", "in-progress"}
NO_ANSWER = {"no-answer", "busy"}
FAILED = {"failed", "canceled", "stopped", "error", "balance-low"}
DONE = {"completed", "call-disconnected"}


class BolnaError(RuntimeError):
    pass


class BolnaProvider:
    name = "bolna"

    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def is_configured(self) -> bool:
        return bool(self._s.bolna_api_key and self._s.bolna_agent_id)

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=BASE_URL, headers={"Authorization": f"Bearer {self._s.bolna_api_key}"}, timeout=20
        )

    async def place_call(self, to_number: str, user_data: dict[str, Any]) -> str:
        """Start an outbound call. Returns Bolna's execution_id."""
        body: dict[str, Any] = {
            "agent_id": self._s.bolna_agent_id,
            "recipient_phone_number": to_number,
            "user_data": user_data,
        }
        if self._s.bolna_from_number:
            body["from_phone_number"] = self._s.bolna_from_number
        async with self._client() as c:
            r = await c.post("/call", json=body)
        if r.status_code >= 400:
            raise BolnaError(f"Bolna {r.status_code}: {r.text[:300]}")
        data = r.json()
        if not data.get("execution_id"):
            raise BolnaError(f"Bolna did not return an execution_id: {data}")
        return str(data["execution_id"])

    async def get_execution(self, execution_id: str) -> dict[str, Any]:
        async with self._client() as c:
            r = await c.get(f"/executions/{execution_id}")
        if r.status_code >= 400:
            raise BolnaError(f"Bolna {r.status_code}: {r.text[:300]}")
        return r.json()
