import time
import uuid

import httpx
import jwt
import pytest

from app.api.auth import verify_supabase_jwt
from app.core.config import get_settings
from app.main import app

SECRET = "test-secret-with-enough-length-for-hs256"


@pytest.fixture
def hs256_secret(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("SUPABASE_JWT_SECRET", SECRET)
    get_settings.cache_clear()
    return SECRET


def make_token(secret: str, **overrides) -> str:
    claims = {"sub": str(uuid.uuid4()), "aud": "authenticated", "exp": int(time.time()) + 300, "role": "authenticated"}
    claims.update(overrides)
    return jwt.encode(claims, secret, algorithm="HS256")


def test_valid_hs256_token(hs256_secret: str) -> None:
    token = make_token(hs256_secret)
    assert verify_supabase_jwt(token)["aud"] == "authenticated"


def test_expired_token_rejected(hs256_secret: str) -> None:
    with pytest.raises(jwt.ExpiredSignatureError):
        verify_supabase_jwt(make_token(hs256_secret, exp=int(time.time()) - 10))


def test_wrong_audience_rejected(hs256_secret: str) -> None:
    with pytest.raises(jwt.InvalidAudienceError):
        verify_supabase_jwt(make_token(hs256_secret, aud="anon"))


def test_wrong_secret_rejected(hs256_secret: str) -> None:
    with pytest.raises(jwt.InvalidSignatureError):
        verify_supabase_jwt(make_token("some-other-secret-that-is-long-enough"))


def test_hs256_without_secret_rejected() -> None:
    with pytest.raises(jwt.InvalidTokenError):
        verify_supabase_jwt(make_token(SECRET))


async def test_staff_endpoint_requires_bearer_token() -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as client:
        r = await client.post(f"/api/appointments/{uuid.uuid4()}/check-in")
    assert r.status_code == 401
