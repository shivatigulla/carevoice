"""Speak times the way patients say them, in Telugu, Hindi and English (IST)."""

from datetime import datetime, timedelta

from app.core.time import IST, utcnow

TE_DAYS = ["సోమవారం", "మంగళవారం", "బుధవారం", "గురువారం", "శుక్రవారం", "శనివారం", "ఆదివారం"]
HI_DAYS = ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"]
EN_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _period(hour: int) -> tuple[str, str]:
    if hour < 12:
        return "ఉదయం", "सुबह"
    if hour < 16:
        return "మధ్యాహ్నం", "दोपहर"
    if hour < 19:
        return "సాయంత్రం", "शाम"
    return "రాత్రి", "रात"


def spoken(dt: datetime, now: datetime | None = None) -> dict[str, str]:
    local = dt.astimezone(IST)
    today = (now or utcnow()).astimezone(IST).date()
    delta = (local.date() - today).days
    h12 = local.hour % 12 or 12
    m = local.minute
    te_p, hi_p = _period(local.hour)

    if delta == 0:
        te_d, hi_d, en_d = "ఈరోజు", "आज", "today"
    elif delta == 1:
        te_d, hi_d, en_d = "రేపు", "कल", "tomorrow"
    elif delta == 2:
        te_d, hi_d, en_d = "ఎల్లుండి", "परसों", "day after tomorrow"
    else:
        wd = local.weekday()
        te_d = f"{local.day} తేదీ {TE_DAYS[wd]}"
        hi_d = f"{local.day} तारीख {HI_DAYS[wd]}"
        en_d = f"{EN_DAYS[wd]} {local.day} {local.strftime('%B')}"

    te_t = f"{h12} గంటలకు" if m == 0 else f"{h12} గంటల {m} నిమిషాలకు"
    hi_t = f"{h12} बजे" if m == 0 else f"{h12} बजकर {m} मिनट पर"
    en_t = f"{h12}{'' if m == 0 else f':{m:02d}'} {'AM' if local.hour < 12 else 'PM'}"
    return {"te": f"{te_d} {te_p} {te_t}", "hi": f"{hi_d} {hi_p} {hi_t}", "en": f"{en_d} at {en_t}"}


def day_bounds(date_str: str | None) -> tuple[datetime, datetime]:
    """UTC bounds for an IST calendar date (YYYY-MM-DD); default = now → +7 days."""
    now = utcnow()
    if not date_str:
        return now, now + timedelta(days=7)
    d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=IST)
    return max(d, now), d + timedelta(days=1)
