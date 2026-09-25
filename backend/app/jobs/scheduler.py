"""Scheduled background jobs, shared by the standalone worker (worker.py) and, when RUN_SCHEDULER=true,
the API process itself (single-service deployments). Jobs use Postgres row locks / idempotent updates, so
running the scheduler in more than one process is safe but wasteful — enable it in one place."""

import logging
import os
import socket
from datetime import timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text

from app.db.session import DatabaseNotConfigured, get_sessionmaker
from app.jobs.queue import release_stale_jobs, run_due_jobs
from app.services.outbound import sync_bolna_calls
from app.services.summaries import summarize_finished_calls

log = logging.getLogger("carevoice.worker")
logging.getLogger("apscheduler").setLevel(logging.WARNING)  # it logs every tick at INFO

WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"

_warned: set[str] = set()


def _warn_once(key: str, msg: str, *args: object) -> None:
    if key not in _warned:
        _warned.add(key)
        log.warning(msg, *args)


async def drain_job_queue() -> None:
    try:
        processed = await run_due_jobs(get_sessionmaker(), WORKER_ID)
        _warned.discard("db")
        if processed:
            log.info("processed %d job(s)", processed)
    except DatabaseNotConfigured:
        _warn_once("db", "DATABASE_URL is not set; job queue idle until backend/.env is configured")
    except Exception as e:  # noqa: BLE001 — keep the scheduler alive through transient DB errors
        _warn_once("db", "job queue unavailable: %s: %s", type(e).__name__, e)


async def reap_stale_jobs() -> None:
    try:
        released = await release_stale_jobs(get_sessionmaker(), stale_after=timedelta(minutes=10))
        if released:
            log.warning("released %d stale running job(s)", released)
    except Exception:  # noqa: BLE001 — drain_job_queue already reports DB problems
        pass


async def housekeeping() -> None:
    """Release expired slot holds; close calls left 'live' by a crashed session."""
    try:
        async with get_sessionmaker()() as db:
            holds = await db.execute(text(
                "update public.appointment_slots set status = 'open', held_by_session = null, held_until = null "
                "where status = 'held' and held_until < now()"))
            calls = await db.execute(text(
                "update public.calls set status = 'completed', ended_at = now(), current_stage = 'ended', "
                "outcome = coalesce(outcome, 'INCOMPLETE'), duration_sec = extract(epoch from now() - started_at)::int "
                "where status = 'live' and started_at < now() - interval '30 minutes'"))
            await db.commit()
            if holds.rowcount or calls.rowcount:
                log.info("housekeeping: released %s hold(s), closed %s stale call(s)", holds.rowcount, calls.rowcount)
    except Exception:  # noqa: BLE001 — drain_job_queue already reports DB problems
        pass


async def sync_outbound() -> None:
    try:
        async with get_sessionmaker()() as db:
            await sync_bolna_calls(db)
    except Exception as e:  # noqa: BLE001 — Bolna/network hiccups must not stop the worker
        _warn_once("bolna", "Bolna sync failed: %s: %s", type(e).__name__, e)


async def summarize() -> None:
    try:
        async with get_sessionmaker()() as db:
            n = await summarize_finished_calls(db)
            if n:
                log.info("summarised %d call(s)", n)
    except Exception as e:  # noqa: BLE001
        _warn_once("summary", "call summaries failed: %s: %s", type(e).__name__, e)



def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(drain_job_queue, "interval", seconds=5, id="drain_job_queue", max_instances=1, coalesce=True)
    scheduler.add_job(reap_stale_jobs, "interval", minutes=2, id="reap_stale_jobs", max_instances=1, coalesce=True)
    scheduler.add_job(housekeeping, "interval", seconds=30, id="housekeeping", max_instances=1, coalesce=True)
    scheduler.add_job(sync_outbound, "interval", seconds=4, id="sync_outbound", max_instances=1, coalesce=True)
    scheduler.add_job(summarize, "interval", seconds=10, id="summarize", max_instances=1, coalesce=True)
    return scheduler
