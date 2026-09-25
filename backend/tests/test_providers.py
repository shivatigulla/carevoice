import pytest

from app.core.config import get_settings
from app.providers.telephony import ExotelProvider, TwilioProvider, get_telephony_provider


def test_exotel_is_the_default_provider() -> None:
    p = get_telephony_provider()
    assert isinstance(p, ExotelProvider)
    assert not p.is_configured()


def test_twilio_selected_by_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEPHONY_PROVIDER", "twilio")
    get_settings.cache_clear()
    assert isinstance(get_telephony_provider(), TwilioProvider)
