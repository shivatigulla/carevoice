"""CareVoice background worker — a separate process from the API.

Runs APScheduler jobs that drain the Postgres job queue (SELECT ... FOR UPDATE SKIP LOCKED) and do
periodic housekeeping. Start with `npm run dev:worker` (or `python worker.py` inside the venv).
"""

import asyncio
import logging
import os
import signal
import socket
from datetime import timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.logging import configure_logging
from app.db.session import DatabaseNotConfigured, dispose_engine, get_sessionmaker
from app.jobs.queue import release_stale_jobs, run_due_jobs

configure_logging()
logging.getLogger("apscheduler").setLevel(logging.WARNING)  # it logs every tick at INFO
log = logging.getLogger("carevoice.worker")

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


async def main() -> None:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(drain_job_queue, "interval", seconds=5, id="drain_job_queue", max_instances=1, coalesce=True)
    scheduler.add_job(reap_stale_jobs, "interval", minutes=2, id="reap_stale_jobs", max_instances=1, coalesce=True)
    scheduler.start()
    log.info("worker %s started (%d scheduled jobs)", WORKER_ID, len(scheduler.get_jobs()))

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows: KeyboardInterrupt handled below
            pass
    try:
        await stop.wait()
    finally:
        scheduler.shutdown(wait=False)
        await dispose_engine()
        log.info("worker stopped")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
