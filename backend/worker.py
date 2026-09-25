"""CareVoice background worker — a separate process from the API (local development).

In single-service deployments set RUN_SCHEDULER=true on the API instead of running this.
Start with `npm run dev:worker` (or `python worker.py` inside the venv).
"""

import asyncio
import logging
import signal

from app.core.logging import configure_logging
from app.db.session import dispose_engine
from app.jobs.scheduler import WORKER_ID, build_scheduler

configure_logging()
log = logging.getLogger("carevoice.worker")


async def main() -> None:
    scheduler = build_scheduler()
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
