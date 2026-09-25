"""Server-side Supabase admin client (Storage + Auth admin) using the service role key.

The service role key bypasses RLS and must never leave the backend.
"""

from typing import Any

import httpx

from app.core.config import Settings, get_settings


class SupabaseNotConfigured(RuntimeError):
    pass


class SupabaseAdmin:
    def __init__(self, settings: Settings | None = None, timeout: float = 10.0) -> None:
        s = settings or get_settings()
        if not s.supabase_url or not s.supabase_service_role_key:
            raise SupabaseNotConfigured("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set")
        self._base = s.supabase_url.rstrip("/")
        key = s.supabase_service_role_key
        self._headers = {"apikey": key}
        # Legacy service_role keys are JWTs and go in Authorization too; new `sb_secret_…` keys are
        # not JWTs and must only be sent as `apikey`.
        if key.startswith("eyJ"):
            self._headers["Authorization"] = f"Bearer {key}"
        self._timeout = timeout

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base, headers=self._headers, timeout=self._timeout)

    # ---- Storage -----------------------------------------------------------------

    async def list_buckets(self) -> list[dict[str, Any]]:
        async with self._client() as c:
            r = await c.get("/storage/v1/bucket")
            r.raise_for_status()
            return r.json()

    async def ensure_bucket(self, name: str, public: bool = False) -> None:
        buckets = await self.list_buckets()
        if any(b.get("name") == name for b in buckets):
            return
        async with self._client() as c:
            r = await c.post("/storage/v1/bucket", json={"id": name, "name": name, "public": public})
            r.raise_for_status()

    # ---- Auth admin --------------------------------------------------------------

    async def find_user_by_email(self, email: str) -> dict[str, Any] | None:
        email = email.lower()
        page = 1
        async with self._client() as c:
            while True:
                r = await c.get("/auth/v1/admin/users", params={"page": page, "per_page": 200})
                r.raise_for_status()
                users = r.json().get("users", [])
                for u in users:
                    if (u.get("email") or "").lower() == email:
                        return u
                if len(users) < 200:
                    return None
                page += 1

    async def create_user(self, email: str, password: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        async with self._client() as c:
            r = await c.post(
                "/auth/v1/admin/users",
                json={"email": email, "password": password, "email_confirm": True, "user_metadata": metadata or {}},
            )
            r.raise_for_status()
            return r.json()
