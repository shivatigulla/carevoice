"""Appointment slot generation from each doctor's weekly schedule.

A doctor's `schedule` JSON maps weekday keys to a working window (IST, the hospital's zone):

    {"mon": {"start": "09:00", "end": "17:00", "lunch_start": "13:00", "lunch_end": "14:00"},
     "sun": null, ...}

Slots are stored in UTC. Generation is idempotent (unique (doctor_id, starts_at)), so it can run on
every worker tick to keep a rolling window of open slots.
"""

import uuid
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import IST, utcnow

WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
SLOT_HORIZON_DAYS = 14


def _t(value: str) -> time:
    hh, mm = value.split(":")
    return time(int(hh), int(mm))


def slot_times_for_day(
    schedule: dict[str, Any], day: date, slot_minutes: int, tz: ZoneInfo = IST
) -> list[tuple[datetime, datetime]]:
    """(start, end) pairs in UTC for one doctor on one local calendar day, skipping lunch."""
    window = schedule.get(WEEKDAY_KEYS[day.weekday()])
    if not window:
        return []
    start = datetime.combine(day, _t(window["start"]), tz)
    end = datetime.combine(day, _t(window["end"]), tz)
    lunch = None
    if window.get("lunch_start") and window.get("lunch_end"):
        lunch = (datetime.combine(day, _t(window["lunch_start"]), tz), datetime.combine(day, _t(window["lunch_end"]), tz))

    step = timedelta(minutes=slot_minutes)
    out: list[tuple[datetime, datetime]] = []
    cur = start
    while cur + step <= end:
        nxt = cur + step
        if not (lunch and cur < lunch[1] and nxt > lunch[0]):  # overlaps lunch -> skip
            out.append((cur.astimezone(ZoneInfo("UTC")), nxt.astimezone(ZoneInfo("UTC"))))
        cur = nxt
    return out


def local_days(start: date, days: int) -> Iterable[date]:
    for i in range(days):
        yield start + timedelta(days=i)


async def ensure_slots(
    session: AsyncSession, tenant_id: uuid.UUID, days: int = SLOT_HORIZON_DAYS, today: date | None = None
) -> int:
    """Create missing future slots for every active doctor of a tenant. Returns rows inserted."""
    now = utcnow()
    first_day = today or now.astimezone(IST).date()
    doctors = (
        await session.execute(
            text("select id, schedule, slot_minutes from public.doctors where tenant_id = :t and is_active"),
            {"t": tenant_id},
        )
    ).all()

    rows: list[dict[str, Any]] = []
    for doctor_id, schedule, slot_minutes in doctors:
        for day in local_days(first_day, days):
            for s, e in slot_times_for_day(schedule or {}, day, slot_minutes):
                if s > now:
                    rows.append({"tenant_id": tenant_id, "doctor_id": doctor_id, "starts_at": s, "ends_at": e})
    if not rows:
        return 0

    count_sql = text("select count(*) from public.appointment_slots where tenant_id = :t")
    before = (await session.execute(count_sql, {"t": tenant_id})).scalar_one()
    stmt = text(
        "insert into public.appointment_slots (tenant_id, doctor_id, starts_at, ends_at) "
        "values (:tenant_id, :doctor_id, :starts_at, :ends_at) on conflict (doctor_id, starts_at) do nothing"
    )
    for i in range(0, len(rows), 500):
        await session.execute(stmt, rows[i : i + 500])  # executemany: rowcount is not reliable
    return (await session.execute(count_sql, {"t": tenant_id})).scalar_one() - before
