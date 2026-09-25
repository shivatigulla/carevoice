import pytest

from app.core.config import get_settings
from app.db import session as db_session

# Every setting a test might care about, blanked so the developer's own backend/.env never leaks in.
_BLANK = [
    "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET",
    "OPENAI_API_KEY", "SARVAM_API_KEY", "INTERNAL_API_KEY", "TELEPHONY_PROVIDER",
]


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch):
    for name in _BLANK:
        monkeypatch.setenv(name, "")
    monkeypatch.setenv("TELEPHONY_PROVIDER", "exotel")
    get_settings.cache_clear()
    db_session._engine = None
    db_session._sessionmaker = None
    yield
    get_settings.cache_clear()
