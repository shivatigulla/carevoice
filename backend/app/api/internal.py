"""Service-to-service API for the voice service (X-Internal-Key): call lifecycle + tool execution."""

import json
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_internal_key
from app.db.session import get_session
from app.services.tools import TOOLS, openai_tool_specs, run_tool

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[Depends(require_internal_key)])


class StartCall(BaseModel):
    channel: Literal["web", "phone"] = "web"
    direction: Literal["inbound", "outbound"] = "inbound"
    from_number: str | None = None
    to_number: str | None = None
    provider: str | None = None
    provider_call_id: str | None = None
    agent_type: str = "appointment"


class TranscriptIn(BaseModel):
    speaker: Literal["patient", "agent", "system"]
    text: str
    language: Literal["te", "hi", "en"] | None = None


class EventIn(BaseModel):
    type: str
    label: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ToolIn(BaseModel):
    call_id: uuid.UUID
    arguments: dict[str, Any] = Field(default_factory=dict)


@router.post("/calls/start")
async def start_call(body: StartCall, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    tenant = (
        await session.execute(text("select id, name, recording_disclosure from public.tenants order by created_at limit 1"))
    ).first()
    if tenant is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "no hospital configured; run npm run db:seed")
    from_number = body.from_number
    if body.channel == "web" and not from_number:
        # The browser Test Call behaves like a call from the seeded test patient's phone (SEED_TEST_PHONE).
        from_number = (
            await session.execute(
                text("select phone from public.patients where tenant_id = :t and mrn = 'SUN-0001'"), {"t": tenant.id}
            )
        ).scalar()
    agent = (
        await session.execute(
            text("select display_name, config from public.agents where tenant_id = :t and type = :a and enabled"),
            {"t": tenant.id, "a": body.agent_type},
        )
    ).first()
    if agent is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"agent {body.agent_type} is not configured or disabled")
    patient = None
    if from_number:
        patient = (
            await session.execute(
                text(
                    "select id, name, preferred_language from public.patients "
                    "where tenant_id = :t and phone = :p order by created_at limit 1"
                ),
                {"t": tenant.id, "p": from_number},
            )
        ).first()

    call_id = (
        await session.execute(
            text(
                "insert into public.calls (tenant_id, direction, channel, provider, provider_call_id, from_number, to_number, "
                "agent_type, status, current_stage, languages) "
                "values (:t, :d, :ch, :pr, :pcid, :f, :to, :a, 'live', 'greeting', :langs) returning id"
            ),
            {
                "t": tenant.id, "d": body.direction, "ch": body.channel,
                "pr": body.provider or ("webrtc" if body.channel == "web" else None),
                "pcid": body.provider_call_id, "f": from_number, "to": body.to_number, "a": body.agent_type,
                "langs": [patient.preferred_language] if patient else [],
            },
        )
    ).scalar_one()
    await session.execute(text("insert into public.call_sessions (tenant_id, call_id) values (:t, :c)"), {"t": tenant.id, "c": call_id})
    await session.execute(
        text("insert into public.call_events (tenant_id, call_id, type, label) values (:t, :c, 'system', 'Call started')"),
        {"t": tenant.id, "c": call_id},
    )
    await session.commit()

    allowed = [t for t in (agent.config.get("allowed_tools") or []) if t in TOOLS]
    return {
        "call_id": str(call_id),
        "hospital": tenant.name,
        "agent": {"type": body.agent_type, "name": agent.display_name, "prompt": agent.config.get("prompt", ""),
                  "tools": openai_tool_specs(allowed)},
        "caller": {"known": patient is not None, "first_name": patient.name.split()[0] if patient else None,
                   "preferred_language": patient.preferred_language if patient else "te"},
        "disclosure": tenant.recording_disclosure,
    }


async def _tenant_of(session: AsyncSession, call_id: uuid.UUID) -> uuid.UUID:
    t = (await session.execute(text("select tenant_id from public.calls where id = :c"), {"c": call_id})).scalar()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "call not found")
    return t


@router.post("/calls/{call_id}/transcript")
async def add_transcript(call_id: uuid.UUID, body: TranscriptIn, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    t = await _tenant_of(session, call_id)
    await session.execute(
        text(
            "insert into public.call_transcripts (tenant_id, call_id, speaker, text, language, start_ms) values "
            "(:t, :c, :s, :x, :l, (extract(epoch from now() - (select started_at from public.calls where id = :c)) * 1000)::int)"
        ),
        {"t": t, "c": call_id, "s": body.speaker, "x": body.text, "l": body.language},
    )
    if body.language:
        await session.execute(
            text("update public.calls set languages = array(select distinct unnest(languages || array[cast(:l as text)])) where id = :c"),
            {"l": body.language, "c": call_id},
        )
    await session.commit()
    return {"ok": True}


@router.post("/calls/{call_id}/event")
async def add_event(call_id: uuid.UUID, body: EventIn, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    t = await _tenant_of(session, call_id)
    await session.execute(
        text("insert into public.call_events (tenant_id, call_id, type, label, payload) values (:t, :c, :ty, :l, cast(:p as jsonb))"),
        {"t": t, "c": call_id, "ty": body.type, "l": body.label, "p": json.dumps(body.payload, ensure_ascii=False)},
    )
    if body.type == "stage_change":
        await session.execute(text("update public.calls set current_stage = :s where id = :c"), {"s": body.label, "c": call_id})
    await session.commit()
    return {"ok": True}


@router.post("/calls/{call_id}/end")
async def end_call(call_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> dict[str, bool]:
    t = await _tenant_of(session, call_id)
    await session.execute(
        text(
            "update public.calls set status = 'completed', ended_at = now(), current_stage = 'ended', "
            "outcome = coalesce(outcome, 'INCOMPLETE'), duration_sec = extract(epoch from now() - started_at)::int "
            "where id = :c and status = 'live'"
        ),
        {"c": call_id},
    )
    await session.execute(
        text(
            "update public.appointment_slots set status = 'open', held_by_session = null, held_until = null "
            "where status = 'held' and held_by_session in (select id from public.call_sessions where call_id = :c)"
        ),
        {"c": call_id},
    )
    await session.execute(
        text("insert into public.call_events (tenant_id, call_id, type, label) values (:t, :c, 'system', 'Call ended')"),
        {"t": t, "c": call_id},
    )
    await session.commit()
    return {"ok": True}


@router.post("/tools/{name}")
async def call_tool(name: str, body: ToolIn, session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    r = await run_tool(session, call_id=body.call_id, name=name, arguments=body.arguments)
    return {"ok": r.ok, "data": r.data, "error_code": r.error_code, "message_for_agent": r.message_for_agent}
