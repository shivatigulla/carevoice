from datetime import date, datetime, timezone

from app.services.slots import slot_times_for_day

SCHEDULE = {
    "mon": {"start": "09:00", "end": "17:00", "lunch_start": "13:00", "lunch_end": "14:00"},
    "sat": {"start": "09:00", "end": "13:00"},
    "sun": None,
}
MONDAY = date(2026, 9, 28)


def test_slots_are_utc_and_skip_lunch() -> None:
    slots = slot_times_for_day(SCHEDULE, MONDAY, 15)
    # 09:00-13:00 (16) + 14:00-17:00 (12)
    assert len(slots) == 28
    # 09:00 IST == 03:30 UTC
    assert slots[0][0] == datetime(2026, 9, 28, 3, 30, tzinfo=timezone.utc)
    ist_starts = [s.astimezone().replace(tzinfo=None) for s, _ in slots]
    assert all(s.tzinfo == timezone.utc or s.utcoffset().total_seconds() == 0 for s, _ in slots)
    lunch_utc = (datetime(2026, 9, 28, 7, 30, tzinfo=timezone.utc), datetime(2026, 9, 28, 8, 30, tzinfo=timezone.utc))
    assert not any(s < lunch_utc[1] and e > lunch_utc[0] for s, e in slots)
    assert ist_starts  # sanity


def test_last_slot_ends_at_close() -> None:
    slots = slot_times_for_day(SCHEDULE, MONDAY, 20)
    assert slots[-1][1] <= datetime(2026, 9, 28, 11, 30, tzinfo=timezone.utc)  # 17:00 IST


def test_day_off_and_missing_day_have_no_slots() -> None:
    assert slot_times_for_day(SCHEDULE, date(2026, 9, 27), 15) == []  # Sunday: null
    assert slot_times_for_day(SCHEDULE, date(2026, 9, 29), 15) == []  # Tuesday: absent


def test_window_without_lunch() -> None:
    assert len(slot_times_for_day(SCHEDULE, date(2026, 10, 3), 15)) == 16  # Saturday 09-13
