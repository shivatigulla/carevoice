from app.core.config import Settings
from app.providers.telephony.base import PlacedCall, TelephonyProvider


class ExotelProvider(TelephonyProvider):
    name = "exotel"

    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def is_configured(self) -> bool:
        s = self._s
        return all([s.exotel_sid, s.exotel_api_key, s.exotel_api_token, s.exotel_subdomain, s.exophone])

    async def place_call(self, to_number: str, *, stream_url: str, status_callback_url: str) -> PlacedCall:
        raise NotImplementedError("Exotel outbound calling is implemented in the telephony milestone")

    async def hangup(self, provider_call_id: str) -> None:
        raise NotImplementedError("Exotel hangup is implemented in the telephony milestone")
