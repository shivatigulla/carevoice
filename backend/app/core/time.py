"""Time helpers. Store UTC everywhere; convert to the hospital's zone (Asia/Kolkata) only for display."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_ist(dt: datetime) -> datetime:
    return dt.astimezone(IST)
