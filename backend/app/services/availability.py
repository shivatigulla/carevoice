"""Live doctor-availability snapshot handed to the phone agent at call start.

Each offered slot gets a short code (S1, S2, …). The agent speaks only these slots; after the call the
chosen code is mapped back to the real slot id and booked (app/services/post_call.py).
"""

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.spoken_time import spoken

MAX_DOCTORS_PER_DEPT = 3
SLOTS_PER_DOCTOR = 2
DAYS_AHEAD = 3


async def availability_snapshot(
    db: AsyncSession, tenant_id: uuid.UUID, lang: str, department: str | None = None
) -> dict[str, Any]:
    """Returns {"text": str for the prompt, "doctor_count": int, "codes": {code: slot_id}, "departments": [...]}."""
    params: dict[str, Any] = {"t": tenant_id, "days": DAYS_AHEAD}
    dept_filter = ""
    if department:
        dept_filter = "and dp.name = :dept"
        params["dept"] = department
    rows = (
        await db.execute(
            text(
                f"""
                with ranked as (
                  select s.id, s.starts_at, d.id as doctor_id, d.name, d.name_te, d.name_hi, dp.name as department,
                         row_number() over (partition by d.id order by s.starts_at) as rn
                    from public.appointment_slots s
                    join public.doctors d on d.id = s.doctor_id and d.is_active
                    join public.departments dp on dp.id = d.department_id
                   where s.tenant_id = :t and s.status = 'open'
                     and s.starts_at > now() + interval '2 hours'
                     and s.starts_at < now() + make_interval(days => :days)
                     {dept_filter}
                )
                select * from ranked where rn <= {SLOTS_PER_DOCTOR} order by department, name, starts_at
                """
            ),
            params,
        )
    ).all()

    by_dept: dict[str, dict[uuid.UUID, list[Any]]] = {}
    for r in rows:
        docs = by_dept.setdefault(r.department, {})
        if r.doctor_id in docs or len(docs) < MAX_DOCTORS_PER_DEPT:
            docs.setdefault(r.doctor_id, []).append(r)

    codes: dict[str, str] = {}
    labels: dict[str, str] = {}
    lines: list[str] = []
    n = 0
    doctor_count = 0
    for dept, docs in by_dept.items():
        lines.append(f"{dept} — {len(docs)} doctor(s) available:")
        for slots in docs.values():
            doctor_count += 1
            first = slots[0]
            local_name = {"te": first.name_te, "hi": first.name_hi}.get(lang) or first.name
            offers = []
            for s in slots:
                n += 1
                code = f"S{n}"
                codes[code] = str(s.id)
                labels[code] = f"{first.name} ({dept}) {spoken(s.starts_at)['en']}"
                offers.append(f"[{code}] {spoken(s.starts_at)[lang]}")
            lines.append(f"  • {first.name} ({local_name}): " + "; ".join(offers))
    if not lines:
        lines.append("No open slots in the next few days — say the front desk will call back with times.")
    return {"text": "\n".join(lines), "doctor_count": doctor_count, "codes": codes, "labels": labels, "departments": list(by_dept)}
