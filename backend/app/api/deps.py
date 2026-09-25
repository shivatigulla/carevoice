"""Shared FastAPI dependencies."""

import secrets

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


async def require_internal_key(x_internal_key: str = Header(default="", alias="X-Internal-Key")) -> None:
    """Guard for service-to-service endpoints (voice service → backend)."""
    expected = get_settings().internal_api_key
    if not expected or not secrets.compare_digest(x_internal_key, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid internal api key")
