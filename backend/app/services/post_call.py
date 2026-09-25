"""After a phone call ends: work out from the transcript what the patient agreed to, and apply it.

The phone agent (Bolna) offered slots from an availability snapshot with codes S1, S2, … (stored in the
call's `availability` event). An LLM reads the transcript and returns structured JSON; the booking itself is
done here with the same rules as the live tools: the slot must still be open, no second active appointment
with the same doctor on the same day, and everything is audited.
"""

import json
import uuid
from datetime import timedelta
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.time import IST
from app.services.audit import write_audit

EXTRACT_PROMPT = """You read a hospital phone call transcript and report what the patient AGREED to.
Offered slots (code: description):
{offers}

Return JSON only:
{{"booked_slot_code": "S1".."Sn" or null,   // only if the patient clearly said yes to exactly that slot
  "confirmed_existing": true|false,          // patient confirmed they will attend their existing appointment
  "reason": short reason for visit if mentioned, else null}}
Never guess: if the patient did not clearly confirm a specific offered slot, booked_slot_code is null."""


async def _event(db: AsyncSession, tenant_id: uuid.UUID, call_id: uuid.UUID, type_: str, label: str, payload: dict[str, Any]) -> None:
    await db.execute(
        text("insert into public.call_events (tenant_id, call_id, type, label, payload) values (:t, :c, :ty, :l, cast(:p as jsonb))"),
        {"t": tenant_id, "c": call_id, "ty": type_, "l": label, "p": json.dumps(payload, ensure_ascii=False, default=str)},
    )


async def extract_decision(transcript: str, offers: dict[str, str]) -> dict[str, Any]:
    s = get_settings()
    client = AsyncOpenAI(api_key=s.openai_api_key)
    resp = await client.chat.completions.create(
        model=s.openai_summary_model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EXTRACT_PROMPT.format(offers="\n".join(f"{k}: {v}" for k, v in offers.items()) or "(none)")},
            {"role": "user", "content": transcript},
        ],
    )
    return json.loads(resp.choices[0].message.content or "{}")


async def apply_call_outcome(db: AsyncSession, call_id: uuid.UUID) -> str | None:
    """Book / confirm based on the finished call. Returns the outcome applied, if any."""
    call = (
        await db.execute(
            text("select id, tenant_id, patient_id, intent from public.calls where id = :c and status = 'completed'"),
            {"c": call_id},
        )
    ).first()
    if not call or not call.patient_id or not get_settings().openai_api_key:
        return None
    offer = (
        await db.execute(
            text("select payload from public.call_events where call_id = :c and type = 'availability' order by at desc limit 1"),
            {"c": call_id},
        )
    ).scalar()
    turns = (
        await db.execute(
            text("select speaker, text from public.call_transcripts where call_id = :c order by start_ms nulls first, created_at"),
            {"c": call_id},
        )
    ).all()
    if not turns or not any(t.speaker == "patient" for t in turns):
        return None

    codes: dict[str, str] = (offer or {}).get("codes", {})
    labels: dict[str, str] = (offer or {}).get("labels", {})
    convo = "\n".join(f"{'Agent' if t.speaker == 'agent' else 'Patient'}: {t.text}" for t in turns)
    decision = await extract_decision(convo, labels)
    await _event(db, call.tenant_id, call.id, "extraction", "Call outcome extracted", decision)

    code = decision.get("booked_slot_code")
    if code and code in codes:
        return await _book(db, call, uuid.UUID(codes[code]), decision.get("reason"), labels.get(code, code))
    if decision.get("confirmed_existing"):
        appt = (
            await db.execute(
                text(
                    "update public.appointments set status = 'confirmed' where id = ("
                    "select id from public.appointments where patient_id = :p and starts_at > now() and status = 'booked' "
                    "order by starts_at limit 1) returning id"
                ),
                {"p": call.patient_id},
            )
        ).scalar()
        if appt:
            await db.execute(text("update public.calls set outcome = 'CONFIRMED' where id = :c"), {"c": call.id})
            await _event(db, call.tenant_id, call.id, "action", "Appointment confirmed by patient", {"appointment_id": str(appt)})
            await db.commit()
            return "CONFIRMED"
    await db.commit()
    return None


async def _book(db: AsyncSession, call: Any, slot_id: uuid.UUID, reason: str | None, label: str) -> str | None:
    slot = (
        await db.execute(
            text("select id, doctor_id, starts_at from public.appointment_slots where id = :s and status = 'open' for update"),
            {"s": slot_id},
        )
    ).first()
    if not slot:
        await _event(db, call.tenant_id, call.id, "action", "Chosen slot was taken — staff follow-up needed", {"slot": label})
        await db.execute(
            text(
                "insert into public.escalations (tenant_id, call_id, patient_id, priority, category, reason, sla_due_at) "
                "values (:t, :c, :p, 'medium', 'other', :r, now() + interval '1 hour')"
            ),
            {"t": call.tenant_id, "c": call.id, "p": call.patient_id, "r": f"Patient chose {label} on a call but it was taken; call back with a new time."},
        )
        await db.commit()
        return None

    day0 = slot.starts_at.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    # Reminder / missed calls that end with a new time are reschedules of the existing appointment.
    old = (
        await db.execute(
            text(
                "select id, slot_id from public.appointments where patient_id = :p and status in ('booked','confirmed') "
                "and starts_at > now() order by starts_at limit 1"
            ),
            {"p": call.patient_id},
        )
    ).first()
    reschedule = old is not None and (call.intent or "").startswith(("appointment reminder", "missed"))
    if not reschedule:
        dup = (
            await db.execute(
                text(
                    "select 1 from public.appointments where patient_id = :p and doctor_id = :d and status in ('booked','confirmed') "
                    "and starts_at >= :a and starts_at < :b"
                ),
                {"p": call.patient_id, "d": slot.doctor_id, "a": day0, "b": day0 + timedelta(days=1)},
            )
        ).first()
        if dup:
            await _event(db, call.tenant_id, call.id, "action", "Not booked: already has an appointment with this doctor that day", {"slot": label})
            await db.commit()
            return None
    else:
        await db.execute(text("update public.appointments set status = 'rescheduled' where id = :a"), {"a": old.id})
        await db.execute(text("update public.appointment_slots set status = 'open' where id = :s"), {"s": old.slot_id})

    appt_id = (
        await db.execute(
            text(
                "insert into public.appointments (tenant_id, patient_id, doctor_id, slot_id, starts_at, status, source, reason, call_id, rescheduled_from_id) "
                "values (:t, :p, :d, :s, :at, 'booked', 'voice', :r, :c, :old) returning id"
            ),
            {"t": call.tenant_id, "p": call.patient_id, "d": slot.doctor_id, "s": slot.id, "at": slot.starts_at,
             "r": reason, "c": call.id, "old": old.id if reschedule else None},
        )
    ).scalar_one()
    await db.execute(text("update public.appointment_slots set status = 'booked' where id = :s"), {"s": slot.id})
    outcome = "RESCHEDULED" if reschedule else "BOOKED"
    await db.execute(text("update public.calls set outcome = :o where id = :c"), {"o": outcome, "c": call.id})
    await _event(db, call.tenant_id, call.id, "action", f"Appointment {outcome.lower()}: {label}", {"appointment_id": str(appt_id)})
    await write_audit(db, tenant_id=call.tenant_id, actor_type="agent", actor_id="phone_agent",
                      action=f"appointment.{'reschedule' if reschedule else 'create'}", entity_type="appointment",
                      entity_id=appt_id, after={"slot_id": str(slot.id), "call_id": str(call.id)})
    await db.commit()
    return outcome
