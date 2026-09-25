"""Postgres-backed job queue. No Redis: jobs are rows in `public.jobs`, claimed with
SELECT ... FOR UPDATE SKIP LOCKED so several workers could run safely side by side."""

import json
import logging
import traceback
import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.time import utcnow

log = logging.getLogger("carevoice.jobs")

JobHandler = Callable[[AsyncSession, dict[str, Any]], Awaitable[None]]

# kind -> handler. Feature modules register handlers here (e.g. "follow_up.place_call").
HANDLERS: dict[str, JobHandler] = {}


def job_handler(kind: str) -> Callable[[JobHandler], JobHandler]:
    def register(fn: JobHandler) -> JobHandler:
        HANDLERS[kind] = fn
        return fn

    return register


async def enqueue(
    session: AsyncSession, *, tenant_id: uuid.UUID, kind: str, payload: dict[str, Any], delay: timedelta | None = None
) -> uuid.UUID:
    row = await session.execute(
        text(
            "insert into public.jobs (tenant_id, kind, payload, run_at) "
            "values (:tenant_id, :kind, cast(:payload as jsonb), :run_at) returning id"
        ),
        {
            "tenant_id": tenant_id,
            "kind": kind,
            "payload": json.dumps(payload),
            "run_at": utcnow() + (delay or timedelta()),
        },
    )
    return row.scalar_one()


_CLAIM_SQL = text(
    """
    update public.jobs j
       set status = 'running', locked_at = now(), locked_by = :worker_id, attempts = j.attempts + 1
     where j.id in (
            select id from public.jobs
             where status = 'pending' and run_at <= now()
             order by run_at
             limit :limit
             for update skip locked
           )
    returning j.id, j.tenant_id, j.kind, j.payload, j.attempts, j.max_attempts
    """
)


async def run_due_jobs(sessionmaker: async_sessionmaker[AsyncSession], worker_id: str, limit: int = 10) -> int:
    """Claim up to `limit` due jobs and run each in its own transaction. Returns jobs processed."""
    async with sessionmaker() as session, session.begin():
        claimed = (await session.execute(_CLAIM_SQL, {"worker_id": worker_id, "limit": limit})).mappings().all()

    for job in claimed:
        handler = HANDLERS.get(job["kind"])
        try:
            if handler is None:
                raise LookupError(f"no handler registered for job kind {job['kind']!r}")
            async with sessionmaker() as session, session.begin():
                await handler(session, {**job["payload"], "tenant_id": str(job["tenant_id"])})
                await session.execute(
                    text("update public.jobs set status = 'succeeded', last_error = null where id = :id"),
                    {"id": job["id"]},
                )
        except Exception:  # noqa: BLE001 — a failing job must never kill the worker
            err = traceback.format_exc(limit=5)
            retry = handler is not None and job["attempts"] < job["max_attempts"]
            log.warning("job %s (%s) failed%s", job["id"], job["kind"], ", will retry" if retry else "")
            backoff = timedelta(seconds=30 * 2 ** (job["attempts"] - 1))
            async with sessionmaker() as session, session.begin():
                await session.execute(
                    text(
                        "update public.jobs set status = :status, last_error = :err, run_at = :run_at, "
                        "locked_at = null, locked_by = null where id = :id"
                    ),
                    {
                        "id": job["id"],
                        "status": "pending" if retry else "failed",
                        "err": err[-4000:],
                        "run_at": utcnow() + backoff,
                    },
                )
    return len(claimed)


async def release_stale_jobs(sessionmaker: async_sessionmaker[AsyncSession], stale_after: timedelta) -> int:
    """Return jobs stuck in 'running' (worker crashed mid-job) to the queue."""
    async with sessionmaker() as session, session.begin():
        result = await session.execute(
            text(
                "update public.jobs set status = 'pending', locked_at = null, locked_by = null "
                "where status = 'running' and locked_at < :cutoff"
            ),
            {"cutoff": utcnow() - stale_after},
        )
    return result.rowcount or 0
