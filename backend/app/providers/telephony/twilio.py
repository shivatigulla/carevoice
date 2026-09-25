from app.core.config import Settings
from app.providers.telephony.base import PlacedCall, TelephonyProvider


class TwilioProvider(TelephonyProvider):
    name = "twilio"

    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def is_configured(self) -> bool:
        s = self._s
        return all([s.twilio_account_sid, s.twilio_auth_token, s.twilio_number])

    async def place_call(self, to_number: str, *, stream_url: str, status_callback_url: str) -> PlacedCall:
        raise NotImplementedError("Twilio outbound calling is implemented in the telephony milestone")

    async def hangup(self, provider_call_id: str) -> None:
        raise NotImplementedError("Twilio hangup is implemented in the telephony milestone")
