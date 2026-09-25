"""Staff authentication for FastAPI writes: verify the Supabase access token, then load the staff row.

Supabase signs user JWTs either with asymmetric keys (ES256/RS256, published at
/auth/v1/.well-known/jwks.json) or, on older projects, with the shared HS256 secret
(SUPABASE_JWT_SECRET). Both are supported.
"""

import asyncio
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import get_sessionmaker

AUDIENCE = "authenticated"
ASYMMETRIC_ALGS = ["ES256", "RS256", "EdDSA"]


@dataclass(frozen=True)
class StaffContext:
    user_id: uuid.UUID
    staff_id: uuid.UUID
    tenant_id: uuid.UUID
    role: str
    email: str | None


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """Return the token's claims, or raise jwt.InvalidTokenError."""
    s = get_settings()
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256":
        if not s.supabase_jwt_secret:
            raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
        return jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience=AUDIENCE)
    if alg in ASYMMETRIC_ALGS:
        if not s.supabase_url:
            raise jwt.InvalidTokenError("SUPABASE_URL is not set")
        key = _jwks_client(s.supabase_url).get_signing_key_from_jwt(token)
        return jwt.decode(token, key.key, algorithms=ASYMMETRIC_ALGS, audience=AUDIENCE)
    raise jwt.InvalidTokenError(f"unsupported alg {alg!r}")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


async def get_current_staff(authorization: str = Header(default="")) -> StaffContext:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("missing bearer token")
    try:
        claims = await asyncio.to_thread(verify_supabase_jwt, token)  # JWKS fetch is blocking I/O
    except jwt.PyJWTError as e:
        raise _unauthorized(f"invalid token: {e}") from e

    # Own short-lived session: the token is checked before any database work.
    async with get_sessionmaker()() as session:
        row = (
            await session.execute(
                text(
                    "select id, tenant_id, role, email from public.staff "
                    "where user_id = :uid and is_active order by created_at limit 1"
                ),
                {"uid": claims["sub"]},
            )
        ).first()
    if row is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="not a staff member of any hospital")
    return StaffContext(
        user_id=uuid.UUID(claims["sub"]), staff_id=row.id, tenant_id=row.tenant_id, role=row.role, email=row.email
    )


def require_roles(*roles: str):
    """Dependency factory: `Depends(require_roles("admin", "reception"))`."""

    async def check(staff: StaffContext = Depends(get_current_staff)) -> StaffContext:
        if staff.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"requires role: {', '.join(roles)}")
        return staff

    return check
