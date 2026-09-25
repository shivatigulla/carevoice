"""GET /health — is every dependency this backend needs actually reachable/configured?"""

import asyncio
import time
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import DatabaseNotConfigured, get_engine
from app.services.supabase_admin import SupabaseAdmin, SupabaseNotConfigured

router = APIRouter(tags=["health"])

CheckStatus = Literal["ok", "error", "missing"]


class Check(BaseModel):
    status: CheckStatus
    detail: str | None = None
    latency_ms: int | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "down"]
    service: str = "carevoice-backend"
    checks: dict[str, Check]


async def _timed(coro: Any) -> Check:
    start = time.perf_counter()
    try:
        detail = await asyncio.wait_for(coro, timeout=8)
        return Check(status="ok", detail=detail, latency_ms=int((time.perf_counter() - start) * 1000))
    except (DatabaseNotConfigured, SupabaseNotConfigured) as e:
        return Check(status="missing", detail=str(e))
    except TimeoutError:
        return Check(status="error", detail="timed out")
    except Exception as e:  # noqa: BLE001 — surface any failure as a check result
        return Check(status="error", detail=f"{type(e).__name__}: {e}"[:300])


async def _check_db() -> str:
    async with get_engine().connect() as conn:
        await conn.execute(text("select 1"))
    return "connected"


async def _check_storage() -> str:
    buckets = await SupabaseAdmin().list_buckets()
    return f"{len(buckets)} bucket(s)"


def _key_present(value: str, name: str) -> Check:
    return Check(status="ok", detail="configured") if value.strip() else Check(status="missing", detail=f"{name} is not set")


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Always 200 so the dashboard can poll it quietly; read `status` / `checks` for the verdict."""
    s = get_settings()
    db, storage = await asyncio.gather(_timed(_check_db()), _timed(_check_storage()))
    checks = {
        "database": db,
        "storage": storage,
        "openai": _key_present(s.openai_api_key, "OPENAI_API_KEY"),
        "sarvam": _key_present(s.sarvam_api_key, "SARVAM_API_KEY"),
    }
    if db.status != "ok":
        overall = "down"
    elif all(c.status == "ok" for c in checks.values()):
        overall = "ok"
    else:
        overall = "degraded"
    return HealthResponse(status=overall, checks=checks)
