"""Telephony provider interface. Exotel and Twilio implement it; TELEPHONY_PROVIDER selects one."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class PlacedCall:
    provider: str
    provider_call_id: str
    raw: dict[str, Any] = field(default_factory=dict)


class TelephonyProvider(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    async def place_call(self, to_number: str, *, stream_url: str, status_callback_url: str) -> PlacedCall:
        """Start an outbound call whose audio is streamed to the voice service at `stream_url`."""

    @abstractmethod
    async def hangup(self, provider_call_id: str) -> None: ...
