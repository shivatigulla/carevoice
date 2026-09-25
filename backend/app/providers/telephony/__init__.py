from app.core.config import Settings, get_settings
from app.providers.telephony.base import PlacedCall, TelephonyProvider
from app.providers.telephony.exotel import ExotelProvider
from app.providers.telephony.twilio import TwilioProvider


def get_telephony_provider(settings: Settings | None = None) -> TelephonyProvider:
    """Provider selected by TELEPHONY_PROVIDER (exotel | twilio)."""
    s = settings or get_settings()
    if s.telephony_provider == "twilio":
        return TwilioProvider(s)
    return ExotelProvider(s)


__all__ = ["ExotelProvider", "PlacedCall", "TelephonyProvider", "TwilioProvider", "get_telephony_provider"]
