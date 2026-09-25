"""Outbound calls via Bolna: start a call with the patient's context, then sync status/transcript back."""

import json
import re
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.providers.bolna import DONE, FAILED, LIVE_STATUSES, NO_ANSWER, BolnaProvider
from app.core.time import IST, utcnow
from app.services.spoken_time import spoken

PURPOSES = {
    "reminder": ("appointment reminder",
                 "Remind them about their upcoming appointment and ask if they will come. If they cannot come, "
                 "say the front desk will call back to fix a new time."),
    "missed": ("missed appointment follow-up",
               "They missed this appointment. Kindly ask if everything is okay and whether they would like to rebook; "
               "if yes, say the front desk will call back with a new time."),
    "post_visit": ("post-visit follow-up",
                   "They recently visited the hospital. Ask how they are feeling now and whether they need a follow-up "
                   "appointment. Do not give any medical advice; if they feel worse, say a nurse will call them."),
    "booking": ("appointment booking",
                "Ask whether they would like to book an appointment and with which department or doctor; "
                "say the front desk will confirm the exact time."),
}

STAGE = {"queued": "queued", "initiated": "dialing", "ringing": "ringing", "in-progress": "in conversation"}
_TURN = re.compile(r"^\s*(assistant|agent|bot|user|human|customer)\s*:\s*(.+)$", re.I)


def detect_language(s: str) -> str:
    if re.search(r"[ఀ-౿]", s):
        return "te"
    if re.search(r"[ऀ-ॿ]", s):
        return "hi"
    return "en"


def parse_transcript(raw: str) -> list[tuple[str, str]]:
    """Bolna transcript text ("assistant: …\\nuser: …") → [(speaker, text)]; continuation lines join the turn."""
    turns: list[tuple[str, str]] = []
    for line in (raw or "").splitlines():
        m = _TURN.match(line)
        if m:
            who = "agent" if m.group(1).lower() in ("assistant", "agent", "bot") else "patient"
            turns.append((who, m.group(2).strip()))
        elif line.strip() and turns:
            turns[-1] = (turns[-1][0], f"{turns[-1][1]} {line.strip()}")
    return [t for t in turns if t[1]]


async def start_outbound_call(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    phone: str,
    patient_id: uuid.UUID | None,
    actor: str,
    purpose: str = "reminder",
    appointment_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    provider = BolnaProvider(get_settings())
    if not provider.is_configured():
        raise RuntimeError("Bolna is not configured: set BOLNA_API_KEY and BOLNA_AGENT_ID in backend/.env")

    tenant = (await db.execute(text("select name from public.tenants where id = :t"), {"t": tenant_id})).one()
    patient = (
        await db.execute(
            text(
                "select id, name, preferred_language from public.patients where tenant_id = :t and "
                + ("id = :p" if patient_id else "phone = :ph")
                + " order by created_at limit 1"
            ),
            {"t": tenant_id, "p": patient_id, "ph": phone},
        )
    ).first()
    lang = patient.preferred_language if patient else "te"
    purpose = purpose if purpose in PURPOSES else "reminder"
    appt = None
    if patient:
        select = (
            "select a.starts_at, a.reason, d.name as doctor, dp.name as department from public.appointments a "
            "join public.doctors d on d.id = a.doctor_id join public.departments dp on dp.id = d.department_id "
        )
        if appointment_id:
            appt = (await db.execute(text(select + "where a.id = :a and a.patient_id = :p"), {"a": appointment_id, "p": patient.id})).first()
        else:
            appt = (
                await db.execute(
                    text(select + "where a.patient_id = :p and a.starts_at > now() and a.status in ('booked','confirmed') "
                         "order by a.starts_at limit 1"),
                    {"p": patient.id},
                )
            ).first()
    if appt:
        when = spoken(appt.starts_at)[lang] if appt.starts_at > utcnow() else appt.starts_at.astimezone(IST).strftime("%d %B")
        details = f"with {appt.doctor} ({appt.department}) {when}" + (f", for {appt.reason}" if appt.reason else "")
    else:
        details = "no appointment on record"
        if purpose == "reminder":
            purpose = "booking"
    intent, purpose_text = PURPOSES[purpose]

    user_data = {
        "patient_name": patient.name.split()[0] if patient else "sir/madam",
        "hospital_name": tenant.name,
        "appointment_details": details,
        "language": {"te": "Telugu", "hi": "Hindi", "en": "English"}[lang],
        "call_purpose": purpose_text,
    }

    call_id = (
        await db.execute(
            text(
                "insert into public.calls (tenant_id, direction, channel, provider, patient_id, to_number, agent_type, "
                "status, current_stage, intent, languages) values (:t, 'outbound', 'phone', 'bolna', :p, :to, 'follow_up', "
                "'live', 'queued', :intent, :langs) returning id"
            ),
            {"t": tenant_id, "p": patient.id if patient else None, "to": phone, "langs": [lang], "intent": intent},
        )
    ).scalar_one()
    await db.commit()

    try:
        execution_id = await provider.place_call(phone, user_data)
    except Exception as e:
        await db.execute(
            text("update public.calls set status = 'failed', current_stage = 'failed', ended_at = now(), outcome = 'FAILED' where id = :c"),
            {"c": call_id},
        )
        await _event(db, tenant_id, call_id, "system", "Call failed to start", {"error": str(e)[:300]})
        await db.commit()
        raise

    await db.execute(text("update public.calls set provider_call_id = :x where id = :c"), {"x": execution_id, "c": call_id})
    await _event(db, tenant_id, call_id, "system", "Outbound call requested", {"by": actor, "user_data": user_data})
    await db.commit()
    return {"call_id": str(call_id), "execution_id": execution_id, "patient": patient.name if patient else None}


async def _event(db: AsyncSession, tenant_id: uuid.UUID, call_id: uuid.UUID, type_: str, label: str, payload: dict[str, Any]) -> None:
    await db.execute(
        text("insert into public.call_events (tenant_id, call_id, type, label, payload) values (:t, :c, :ty, :l, cast(:p as jsonb))"),
        {"t": tenant_id, "c": call_id, "ty": type_, "l": label, "p": json.dumps(payload, ensure_ascii=False, default=str)},
    )


async def sync_bolna_calls(db: AsyncSession) -> int:
    """Worker job: poll live Bolna calls and mirror status, transcript, recording and summary."""
    s = get_settings()
    if not (s.bolna_api_key and s.bolna_agent_id):
        return 0
    provider = BolnaProvider(s)
    live = (
        await db.execute(
            text(
                "select id, tenant_id, provider_call_id, current_stage from public.calls "
                "where provider = 'bolna' and status = 'live' and provider_call_id is not null"
            )
        )
    ).all()
    for call in live:
        ex = await provider.get_execution(call.provider_call_id)
        st = ex.get("status") or ""
        if st in LIVE_STATUSES:
            stage = STAGE.get(st, st)
            if stage != call.current_stage:
                await db.execute(text("update public.calls set current_stage = :s where id = :c"), {"s": stage, "c": call.id})
                await _event(db, call.tenant_id, call.id, "stage_change", stage.capitalize(), {"bolna_status": st})
            continue

        tel = ex.get("telephony_data") or {}
        if st in DONE:
            final, outcome = "completed", None
        elif st in NO_ANSWER:
            final, outcome = "no_answer", "NO_ANSWER"
        elif st in FAILED:
            final, outcome = "failed", "FAILED"
        else:
            continue  # unknown status: check again next tick

        turns = parse_transcript(ex.get("transcript") or "")
        langs = sorted({detect_language(t) for _, t in turns if _ == "patient"}) or None
        for i, (who, said) in enumerate(turns):
            await db.execute(
                text("insert into public.call_transcripts (tenant_id, call_id, speaker, text, language, start_ms) values (:t, :c, :s, :x, :l, :i)"),
                {"t": call.tenant_id, "c": call.id, "s": who, "x": said, "l": detect_language(said), "i": i},
            )
        summary = {"summary_en": ex.get("summary"), "extracted": ex.get("extracted_data"), "bolna_status": st,
                   "hangup_by": tel.get("hangup_by"), "answered_by_voice_mail": ex.get("answered_by_voice_mail")}
        duration = ex.get("conversation_duration") or tel.get("duration")
        await db.execute(
            text(
                "update public.calls set status = :st, current_stage = 'ended', ended_at = now(), "
                "outcome = coalesce(outcome, :o, 'INFO_PROVIDED'), duration_sec = :d, recording_path = :rec, "
                "summary = cast(:sum as jsonb), cost_breakdown = cast(:cost as jsonb), "
                "languages = coalesce(:langs, languages) where id = :c"
            ),
            {"st": final, "o": outcome, "d": int(float(duration)) if duration else None, "rec": tel.get("recording_url"),
             "sum": json.dumps(summary, ensure_ascii=False, default=str),
             "cost": json.dumps(ex.get("cost_breakdown") or {}, default=str), "langs": langs, "c": call.id},
        )
        await _event(db, call.tenant_id, call.id, "system", f"Call {final.replace('_', ' ')}", {"bolna_status": st})
    await db.commit()
    return len(live)
