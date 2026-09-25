import httpx
import pytest

from app.main import app


async def get_health() -> httpx.Response:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get("/health")


async def test_health_reports_missing_configuration() -> None:
    r = await get_health()
    assert r.status_code == 200  # always 200; the verdict is in the body
    body = r.json()
    assert body["status"] == "down"
    assert set(body["checks"]) == {"database", "storage", "openai", "sarvam"}
    assert all(c["status"] == "missing" for c in body["checks"].values())


async def test_health_sees_api_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("SARVAM_API_KEY", "sarvam-test")
    get_settings.cache_clear()
    checks = (await get_health()).json()["checks"]
    assert checks["openai"]["status"] == "ok"
    assert checks["sarvam"]["status"] == "ok"
    assert checks["database"]["status"] == "missing"


async def test_health_reports_unreachable_database(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    # Nothing listens on port 1, so the connection is refused quickly.
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/postgres")
    get_settings.cache_clear()
    db = (await get_health()).json()["checks"]["database"]
    assert db["status"] == "error"
