"""Audit trail: every write by staff, agents or the system is recorded in audit_logs."""

import json
import uuid
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ActorType = Literal["agent", "staff", "system"]


async def write_audit(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    actor_type: ActorType,
    actor_id: str | None,
    action: str,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    await session.execute(
        text(
            "insert into public.audit_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, before, after) "
            "values (:tenant_id, :actor_type, :actor_id, :action, :entity_type, :entity_id, "
            "cast(:before as jsonb), cast(:after as jsonb))"
        ),
        {
            "tenant_id": tenant_id,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "before": json.dumps(before, default=str) if before is not None else None,
            "after": json.dumps(after, default=str) if after is not None else None,
        },
    )
