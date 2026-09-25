"""Agent tools. The LLM never touches the database: the voice service calls POST /internal/tools/{name},
which runs PolicyEngine checks here, then the handler inside one transaction, then records
agent_actions + call_events (+ audit_logs for writes).

Every handler returns ToolResult(ok, data | error_code, message_for_agent).
"""

import json
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import IST, utcnow
from app.services.audit import write_audit
from app.services.spoken_time import day_bounds, spoken

HOLD_MINUTES = 3
VERIFY_MINUTES = 30

# Symptom words → department (static mapping only; the agent never diagnoses).
SYMPTOM_DEPARTMENT = {
    "fever": "General Medicine", "cold": "General Medicine", "sugar": "General Medicine", "bp": "General Medicine",
    "jwaram": "General Medicine", "జ్వరం": "General Medicine", "bukhar": "General Medicine", "बुखार": "General Medicine",
    "heart": "Cardiology", "gunde": "Cardiology", "గుండె": "Cardiology", "दिल": "Cardiology",
    "knee": "Orthopedics", "back pain": "Orthopedics", "bone": "Orthopedics", "mokalu": "Orthopedics", "joint": "Orthopedics",
    "child": "Pediatrics", "baby": "Pediatrics", "pillalu": "Pediatrics", "बच्चा": "Pediatrics",
    "pregnancy": "Gynecology", "periods": "Gynecology",
    "skin": "Dermatology", "rash": "Dermatology", "hair": "Dermatology", "charmam": "Dermatology",
    "ear": "ENT", "nose": "ENT", "throat": "ENT", "chevi": "ENT", "గొంతు": "ENT", "गला": "ENT",
}


@dataclass
class ToolResult:
    ok: bool
    message_for_agent: str
    data: Any = None
    error_code: str | None = None


@dataclass
class Ctx:
    session: AsyncSession
    tenant_id: uuid.UUID
    call_id: uuid.UUID
    session_id: uuid.UUID
    agent_type: str
    verified_patient_id: uuid.UUID | None
    caller_phone: str | None
    extra: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[Ctx, dict[str, Any]], Awaitable[ToolResult]]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Handler
    requires_verified_patient: bool = False
    writes: bool = False


def fail(code: str, msg: str) -> ToolResult:
    return ToolResult(ok=False, error_code=code, message_for_agent=msg)


def _obj(props: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": required or []}


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------


async def verify_patient(c: Ctx, a: dict[str, Any]) -> ToolResult:
    if not c.caller_phone:
        return fail("NO_CALLER_ID", "Caller number unknown. Ask the caller to call from their registered number.")
    rows = (
        await c.session.execute(
            text("select id, name, dob from public.patients where tenant_id = :t and phone = :p"),
            {"t": c.tenant_id, "p": c.caller_phone},
        )
    ).all()
    if not rows:
        return fail("NOT_REGISTERED", "This number is not registered. Offer to connect them to the front desk.")
    dob, year, name = (a.get("date_of_birth") or "").strip(), a.get("birth_year"), (a.get("full_name") or "").strip().lower()
    match = None
    for r in rows:
        if dob and r.dob and r.dob.isoformat() == dob:
            match = r
        elif year and r.dob and int(year) == r.dob.year:
            match = r
        elif name and len(name) >= 3 and (name in r.name.lower() or r.name.lower().split()[0] in name):
            match = r
        if match:
            break
    await c.session.execute(
        text("update public.call_sessions set verification_attempts = verification_attempts + 1 where id = :s"),
        {"s": c.session_id},
    )
    if not match:
        return fail("VERIFICATION_FAILED", "Details did not match. Ask once more for date of birth or birth year.")
    await c.session.execute(
        text(
            "update public.call_sessions set verified_patient_id = :p, verified_at = now(), "
            "expires_at = now() + make_interval(mins => :m) where id = :s"
        ),
        {"p": match.id, "s": c.session_id, "m": VERIFY_MINUTES},
    )
    await c.session.execute(text("update public.calls set patient_id = :p where id = :c"), {"p": match.id, "c": c.call_id})
    return ToolResult(True, f"Verified {match.name}. Address them by first name with garu/ji.", {"patient_name": match.name})


async def list_departments(c: Ctx, a: dict[str, Any]) -> ToolResult:
    rows = (
        await c.session.execute(
            text("select name, name_te, name_hi from public.departments where tenant_id = :t and is_active order by name"),
            {"t": c.tenant_id},
        )
    ).mappings().all()
    return ToolResult(True, "Departments available.", [dict(r) for r in rows])


async def search_doctors(c: Ctx, a: dict[str, Any]) -> ToolResult:
    q = (a.get("query") or "").strip().lower()
    dept = (a.get("department") or "").strip()
    for word, d in SYMPTOM_DEPARTMENT.items():
        if q and word in q:
            dept = dept or d
    rows = (
        await c.session.execute(
            text(
                "select d.id, d.name, d.name_te, d.name_hi, dp.name as department, d.languages_spoken, d.fee "
                "from public.doctors d join public.departments dp on dp.id = d.department_id "
                "where d.tenant_id = :t and d.is_active"
            ),
            {"t": c.tenant_id},
        )
    ).mappings().all()

    def score(r: Any) -> int:
        hay = " ".join(str(x or "").lower() for x in (r["name"], r["name_te"], r["name_hi"], r["department"]))
        s = 0
        if dept and r["department"].lower() == dept.lower():
            s += 5
        if q:
            for tok in q.replace("dr.", "").replace("doctor", "").split():
                if len(tok) >= 3 and tok in hay:
                    s += 3
        return s

    ranked = sorted((r for r in rows if score(r) > 0), key=score, reverse=True)[:3] if (q or dept) else list(rows)[:3]
    if not ranked:
        return fail("NO_MATCH", "No matching doctor. Offer the list of departments instead.")
    data = [{**dict(r), "id": str(r["id"]), "fee": float(r["fee"]) if r["fee"] else None} for r in ranked]
    return ToolResult(True, "Offer at most two of these doctors by name.", data)


async def get_available_slots(c: Ctx, a: dict[str, Any]) -> ToolResult:
    try:
        start, end = day_bounds(a.get("date"))
    except ValueError:
        return fail("BAD_DATE", "Date must be YYYY-MM-DD. Use parse from what the patient said.")
    part = a.get("part_of_day")
    hours = {"morning": (0, 12), "afternoon": (12, 16), "evening": (16, 24)}.get(part or "", (0, 24))
    rows = (
        await c.session.execute(
            text(
                "select s.id, s.starts_at, d.name from public.appointment_slots s join public.doctors d on d.id = s.doctor_id "
                "where s.tenant_id = :t and s.doctor_id = :d and s.status = 'open' "
                "and s.starts_at >= greatest(:s, now() + interval '30 minutes') and s.starts_at < :e "
                "and extract(hour from s.starts_at at time zone 'Asia/Kolkata') >= :h0 "
                "and extract(hour from s.starts_at at time zone 'Asia/Kolkata') < :h1 "
                "order by s.starts_at limit 3"
            ),
            {"t": c.tenant_id, "d": uuid.UUID(a["doctor_id"]), "s": start, "e": end, "h0": hours[0], "h1": hours[1]},
        )
    ).all()
    if not rows:
        return fail("NO_SLOTS", "No open slots for that time. Offer another day or part of the day.")
    data = [{"slot_id": str(r.id), "starts_at": r.starts_at.isoformat(), "spoken": spoken(r.starts_at)} for r in rows]
    return ToolResult(True, "Offer at most two of these times, using the spoken form in the patient's language.", data)


async def hold_slot(c: Ctx, a: dict[str, Any]) -> ToolResult:
    row = (
        await c.session.execute(
            text(
                "update public.appointment_slots set status = 'held', held_by_session = :s, "
                "held_until = now() + make_interval(mins => :m) "
                "where id = :id and tenant_id = :t and starts_at > now() and "
                "(status = 'open' or (status = 'held' and (held_by_session = :s or held_until < now()))) "
                "returning starts_at"
            ),
            {"s": c.session_id, "m": HOLD_MINUTES, "id": uuid.UUID(a["slot_id"]), "t": c.tenant_id},
        )
    ).first()
    if not row:
        return fail("SLOT_TAKEN", "That time was just taken. Offer another slot.")
    return ToolResult(True, "Held for 3 minutes. Read back doctor, day and time; book only after a clear yes.",
                      {"slot_id": a["slot_id"], "spoken": spoken(row.starts_at)})


async def create_appointment(c: Ctx, a: dict[str, Any]) -> ToolResult:
    slot = (
        await c.session.execute(
            text(
                "select id, doctor_id, starts_at from public.appointment_slots where id = :id and tenant_id = :t "
                "and status = 'held' and held_by_session = :s and held_until > now() for update"
            ),
            {"id": uuid.UUID(a["slot_id"]), "t": c.tenant_id, "s": c.session_id},
        )
    ).first()
    if not slot:
        return fail("HOLD_REQUIRED", "Hold the slot first (or the hold expired). Call hold_slot again.")
    local_day = slot.starts_at.astimezone(IST).date()
    day_start = slot.starts_at.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    dup = (
        await c.session.execute(
            text(
                "select 1 from public.appointments where patient_id = :p and doctor_id = :d "
                "and status in ('booked','confirmed','checked_in') and starts_at >= :a and starts_at < :b"
            ),
            {"p": c.verified_patient_id, "d": slot.doctor_id, "a": day_start, "b": day_start + timedelta(days=1)},
        )
    ).first()
    if dup:
        return fail("ALREADY_BOOKED", f"Patient already has an appointment with this doctor on {local_day}.")
    appt_id = (
        await c.session.execute(
            text(
                "insert into public.appointments (tenant_id, patient_id, doctor_id, slot_id, starts_at, source, reason, call_id) "
                "values (:t, :p, :d, :s, :at, 'voice', :r, :c) returning id"
            ),
            {"t": c.tenant_id, "p": c.verified_patient_id, "d": slot.doctor_id, "s": slot.id, "at": slot.starts_at,
             "r": a.get("reason"), "c": c.call_id},
        )
    ).scalar_one()
    await c.session.execute(
        text("update public.appointment_slots set status = 'booked', held_by_session = null, held_until = null where id = :id"),
        {"id": slot.id},
    )
    await c.session.execute(text("update public.calls set outcome = 'BOOKED' where id = :c"), {"c": c.call_id})
    await write_audit(c.session, tenant_id=c.tenant_id, actor_type="agent", actor_id=c.agent_type,
                      action="appointment.create", entity_type="appointment", entity_id=appt_id,
                      after={"slot_id": str(slot.id), "call_id": str(c.call_id)})
    return ToolResult(True, "Booked. Confirm the day and time once, then ask if they need anything else.",
                      {"appointment_id": str(appt_id), "spoken": spoken(slot.starts_at)})


async def get_patient_appointments(c: Ctx, a: dict[str, Any]) -> ToolResult:
    rows = (
        await c.session.execute(
            text(
                "select a.id, a.starts_at, a.status, d.name as doctor from public.appointments a "
                "join public.doctors d on d.id = a.doctor_id where a.patient_id = :p and a.starts_at > now() "
                "and a.status in ('booked','confirmed') order by a.starts_at limit 5"
            ),
            {"p": c.verified_patient_id},
        )
    ).all()
    data = [{"appointment_id": str(r.id), "doctor": r.doctor, "status": r.status, "spoken": spoken(r.starts_at)} for r in rows]
    return ToolResult(True, "Upcoming appointments." if data else "No upcoming appointments.", data)


async def cancel_appointment(c: Ctx, a: dict[str, Any]) -> ToolResult:
    cutoff_h = int(c.extra.get("cancellation_cutoff_hours", 2))
    row = (
        await c.session.execute(
            text("select id, slot_id, starts_at, status from public.appointments where id = :id and patient_id = :p for update"),
            {"id": uuid.UUID(a["appointment_id"]), "p": c.verified_patient_id},
        )
    ).first()
    if not row or row.status not in ("booked", "confirmed"):
        return fail("NOT_FOUND", "No active appointment with that id for this patient.")
    if row.starts_at - utcnow() < timedelta(hours=cutoff_h):
        return fail("CUTOFF", f"Too close to the visit to cancel by phone (cutoff {cutoff_h} hours). Offer the front desk.")
    await c.session.execute(text("update public.appointments set status='cancelled', cancelled_reason=:r where id=:id"),
                            {"id": row.id, "r": a.get("reason") or "cancelled by patient on call"})
    await c.session.execute(text("update public.appointment_slots set status='open' where id=:s"), {"s": row.slot_id})
    await c.session.execute(text("update public.calls set outcome = 'CANCELLED' where id = :c"), {"c": c.call_id})
    await write_audit(c.session, tenant_id=c.tenant_id, actor_type="agent", actor_id=c.agent_type,
                      action="appointment.cancel", entity_type="appointment", entity_id=row.id,
                      before={"status": row.status}, after={"status": "cancelled"})
    return ToolResult(True, "Cancelled. Offer to book a new time.", {"spoken": spoken(row.starts_at)})


async def escalate(c: Ctx, a: dict[str, Any]) -> ToolResult:
    pr = a.get("priority") if a.get("priority") in ("low", "medium", "high", "critical") else "medium"
    await c.session.execute(
        text(
            "insert into public.escalations (tenant_id, call_id, patient_id, priority, category, reason, sla_due_at) "
            "values (:t, :c, :p, :pr, :cat, :r, now() + interval '15 minutes')"
        ),
        {"t": c.tenant_id, "c": c.call_id, "p": c.verified_patient_id, "pr": pr,
         "cat": a.get("category") if a.get("category") in ("emergency", "clinical_concern", "human_request", "frustration", "billing") else "other",
         "r": a.get("reason") or "Escalated by agent"},
    )
    await c.session.execute(text("update public.calls set outcome = 'ESCALATED' where id = :c"), {"c": c.call_id})
    return ToolResult(True, "Escalated to staff. Tell the caller a staff member will call them back shortly.")


async def record_outcome(c: Ctx, a: dict[str, Any]) -> ToolResult:
    await c.session.execute(text("update public.calls set outcome = coalesce(outcome, :o), intent = coalesce(:i, intent) where id = :c"),
                            {"o": a.get("outcome", "INFO_PROVIDED"), "i": a.get("intent"), "c": c.call_id})
    return ToolResult(True, "Recorded.")


async def get_hospital_info(c: Ctx, a: dict[str, Any]) -> ToolResult:
    t = (await c.session.execute(text("select name, city, calling_window_start, calling_window_end from public.tenants where id=:t"),
                                 {"t": c.tenant_id})).one()
    return ToolResult(True, "Share only these facts.", {"name": t.name, "city": t.city, "opd_hours": "Monday to Saturday, 9 AM to 8 PM",
                                                        "emergency": "24x7 emergency; for emergencies call 108"})


SLOT_ARGS = _obj({"slot_id": {"type": "string"}}, ["slot_id"])

TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        Tool("verify_patient", "Verify the caller (their phone number is known) using date of birth (YYYY-MM-DD), birth year, or full name.",
             _obj({"date_of_birth": {"type": "string"}, "birth_year": {"type": "integer"}, "full_name": {"type": "string"}}),
             verify_patient),
        Tool("list_departments", "List hospital departments.", _obj({}), list_departments),
        Tool("search_doctors", "Find doctors by doctor name (any script) or department or the patient's words. Returns up to 3.",
             _obj({"query": {"type": "string"}, "department": {"type": "string"}}), search_doctors),
        Tool("get_available_slots", "Open slots for a doctor. date is YYYY-MM-DD in IST (omit for next 7 days); part_of_day morning|afternoon|evening.",
             _obj({"doctor_id": {"type": "string"}, "date": {"type": "string"},
                   "part_of_day": {"type": "string", "enum": ["morning", "afternoon", "evening"]}}, ["doctor_id"]),
             get_available_slots),
        Tool("hold_slot", "Hold a slot for 3 minutes before reading it back to the patient.", SLOT_ARGS, hold_slot, True, True),
        Tool("create_appointment", "Book the held slot after the patient clearly says yes.",
             _obj({"slot_id": {"type": "string"}, "reason": {"type": "string"}}, ["slot_id"]), create_appointment, True, True),
        Tool("get_patient_appointments", "The verified patient's upcoming appointments.", _obj({}), get_patient_appointments, True),
        Tool("cancel_appointment", "Cancel one of the verified patient's appointments.",
             _obj({"appointment_id": {"type": "string"}, "reason": {"type": "string"}}, ["appointment_id"]),
             cancel_appointment, True, True),
        Tool("escalate", "Hand the call to hospital staff (emergency, human request, frustration, billing, anything you cannot answer).",
             _obj({"reason": {"type": "string"}, "priority": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                   "category": {"type": "string", "enum": ["emergency", "clinical_concern", "human_request", "frustration", "billing", "other"]}},
                  ["reason"]), escalate, False, True),
        Tool("record_outcome", "Record the call outcome before ending.",
             _obj({"outcome": {"type": "string", "enum": ["BOOKED", "RESCHEDULED", "CANCELLED", "INFO_PROVIDED", "ESCALATED", "INCOMPLETE"]},
                   "intent": {"type": "string"}}, ["outcome"]), record_outcome),
        Tool("get_hospital_info", "Approved hospital facts: name, city, OPD hours, emergency number.", _obj({}), get_hospital_info),
    ]
}


def openai_tool_specs(names: list[str]) -> list[dict[str, Any]]:
    return [{"name": n, "description": TOOLS[n].description, "parameters": TOOLS[n].parameters} for n in names if n in TOOLS]


async def run_tool(session: AsyncSession, *, call_id: uuid.UUID, name: str, arguments: dict[str, Any]) -> ToolResult:
    """Policy Engine: known tool → call/session → agent permission → verification → handler (one transaction) → log."""
    started = time.perf_counter()
    tool = TOOLS.get(name)
    call = (
        await session.execute(
            text(
                "select c.id, c.tenant_id, c.agent_type, c.from_number, s.id as session_id, s.verified_patient_id, "
                "s.expires_at > now() as session_valid, a.config->'allowed_tools' as allowed, t.settings "
                "from public.calls c join public.call_sessions s on s.call_id = c.id "
                "join public.tenants t on t.id = c.tenant_id "
                "left join public.agents a on a.tenant_id = c.tenant_id and a.type = c.agent_type "
                "where c.id = :c and c.status = 'live' order by s.created_at desc limit 1"
            ),
            {"c": call_id},
        )
    ).first()

    if tool is None:
        result = fail("UNKNOWN_TOOL", f"No tool named {name}.")
    elif call is None:
        result = fail("CALL_NOT_LIVE", "This call is not active.")
    elif name not in (call.allowed or []):
        result = fail("NOT_ALLOWED", f"Agent {call.agent_type} may not use {name}.")
    elif tool.requires_verified_patient and not (call.verified_patient_id and call.session_valid):
        result = fail("VERIFICATION_REQUIRED", "Verify the caller first with verify_patient (date of birth or birth year).")
    else:
        ctx = Ctx(session, call.tenant_id, call.id, call.session_id, call.agent_type, call.verified_patient_id,
                  call.from_number, extra=call.settings or {})
        try:
            result = await tool.handler(ctx, arguments)
        except (KeyError, ValueError) as e:
            await session.rollback()
            result = fail("BAD_ARGUMENTS", f"Invalid arguments: {e}")

    if call is not None:
        latency = int((time.perf_counter() - started) * 1000)
        payload = {"tool": name, "arguments": arguments, "ok": result.ok, "error_code": result.error_code,
                   "message": result.message_for_agent, "latency_ms": latency}
        await session.execute(
            text(
                "insert into public.agent_actions (tenant_id, call_id, agent_type, tool_name, arguments, decision, error_code, result, latency_ms) "
                "values (:t, :c, :a, :n, cast(:args as jsonb), :d, :e, cast(:r as jsonb), :l)"
            ),
            {"t": call.tenant_id, "c": call.id, "a": call.agent_type or "unknown", "n": name,
             "args": json.dumps(arguments, ensure_ascii=False, default=str),
             "d": "allowed" if result.ok else ("denied" if result.error_code in ("NOT_ALLOWED", "VERIFICATION_REQUIRED", "HOLD_REQUIRED") else "error"),
             "e": result.error_code, "r": json.dumps(result.data, ensure_ascii=False, default=str), "l": latency},
        )
        await session.execute(
            text("insert into public.call_events (tenant_id, call_id, type, label, payload) values (:t, :c, 'tool_call', :l, cast(:p as jsonb))"),
            {"t": call.tenant_id, "c": call.id, "l": name, "p": json.dumps(payload, ensure_ascii=False, default=str)},
        )
    await session.commit()
    return result

