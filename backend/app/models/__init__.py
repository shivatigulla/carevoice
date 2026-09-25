"""ORM models mirroring supabase/migrations (the SQL is the source of truth).

Import from here: `from app.models import Appointment`.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import ARRAY, Boolean, Computed, Date, DateTime, ForeignKey, Integer, Numeric, Text, Time
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TenantMixin, TimestampMixin

UUIDCol = UUID(as_uuid=True)
TS = DateTime(timezone=True)


def fk(target: str) -> Any:
    return mapped_column(UUIDCol, ForeignKey(target), nullable=True)


class Tenant(IdMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, Computed("id", persisted=True))
    name: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    city: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(Text, server_default="Asia/Kolkata")
    calling_window_start: Mapped[time] = mapped_column(Time)
    calling_window_end: Mapped[time] = mapped_column(Time)
    languages: Mapped[list[str]] = mapped_column(ARRAY(Text))
    on_duty_phone: Mapped[str | None] = mapped_column(Text)
    recording_disclosure: Mapped[dict[str, Any]] = mapped_column(JSONB)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Staff(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "staff"

    user_id: Mapped[uuid.UUID] = mapped_column(UUIDCol)
    role: Mapped[str] = mapped_column(Text)
    full_name: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class Department(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(Text)
    name_te: Mapped[str | None] = mapped_column(Text)
    name_hi: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class Doctor(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "doctors"

    department_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("departments.id"))
    name: Mapped[str] = mapped_column(Text)
    name_te: Mapped[str | None] = mapped_column(Text)
    name_hi: Mapped[str | None] = mapped_column(Text)
    qualification: Mapped[str | None] = mapped_column(Text)
    languages_spoken: Mapped[list[str]] = mapped_column(ARRAY(Text))
    fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    schedule: Mapped[dict[str, Any]] = mapped_column(JSONB)
    slot_minutes: Mapped[int] = mapped_column(Integer, server_default="15")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class Patient(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "patients"

    mrn: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text)
    dob: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(Text)
    preferred_language: Mapped[str] = mapped_column(Text, server_default="te")
    caregiver_name: Mapped[str | None] = mapped_column(Text)
    caregiver_phone: Mapped[str | None] = mapped_column(Text)
    opt_out: Mapped[bool] = mapped_column(Boolean, server_default="false")
    dnd: Mapped[bool] = mapped_column(Boolean, server_default="false")
    notes: Mapped[str | None] = mapped_column(Text)


class AppointmentSlot(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "appointment_slots"

    doctor_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("doctors.id"))
    starts_at: Mapped[datetime] = mapped_column(TS)
    ends_at: Mapped[datetime] = mapped_column(TS)
    status: Mapped[str] = mapped_column(Text, server_default="open")
    held_by_session: Mapped[uuid.UUID | None] = fk("call_sessions.id")
    held_until: Mapped[datetime | None] = mapped_column(TS)


class Agent(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "agents"

    type: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")
    config: Mapped[dict[str, Any]] = mapped_column(JSONB)


class WorkflowRule(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "workflow_rules"

    name: Mapped[str] = mapped_column(Text)
    event_type: Mapped[str] = mapped_column(Text)
    conditions: Mapped[dict[str, Any]] = mapped_column(JSONB)
    agent_type: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text)
    delay_minutes: Mapped[int | None] = mapped_column(Integer)
    at_time: Mapped[time | None] = mapped_column(Time)
    max_attempts: Mapped[int] = mapped_column(Integer, server_default="3")
    retry_intervals: Mapped[list[int]] = mapped_column(ARRAY(Integer))
    enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")


class DomainEvent(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "domain_events"

    event_type: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUIDCol)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    idempotency_key: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(TS)
    processed_at: Mapped[datetime | None] = mapped_column(TS)


class CallTask(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "call_tasks"

    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("patients.id"))
    agent_type: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="scheduled")
    scheduled_for: Mapped[datetime] = mapped_column(TS)
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, server_default="3")
    next_attempt_at: Mapped[datetime | None] = mapped_column(TS)
    last_call_id: Mapped[uuid.UUID | None] = fk("calls.id")
    workflow_rule_id: Mapped[uuid.UUID | None] = fk("workflow_rules.id")
    domain_event_id: Mapped[uuid.UUID | None] = fk("domain_events.id")
    appointment_id: Mapped[uuid.UUID | None] = fk("appointments.id")
    context_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUIDCol)


class Call(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "calls"

    direction: Mapped[str] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(Text, server_default="phone")
    provider: Mapped[str | None] = mapped_column(Text)
    provider_call_id: Mapped[str | None] = mapped_column(Text)
    patient_id: Mapped[uuid.UUID | None] = fk("patients.id")
    task_id: Mapped[uuid.UUID | None] = fk("call_tasks.id")
    from_number: Mapped[str | None] = mapped_column(Text)
    to_number: Mapped[str | None] = mapped_column(Text)
    agent_type: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="live")
    languages: Mapped[list[str]] = mapped_column(ARRAY(Text))
    intent: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(Text)
    current_stage: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(TS)
    ended_at: Mapped[datetime | None] = mapped_column(TS)
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    recording_path: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    cost_breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class CallSession(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "call_sessions"

    call_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("calls.id"))
    verified_patient_id: Mapped[uuid.UUID | None] = fk("patients.id")
    verified_at: Mapped[datetime | None] = mapped_column(TS)
    verification_attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(TS)


class Appointment(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "appointments"

    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("patients.id"))
    doctor_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("doctors.id"))
    slot_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("appointment_slots.id"))
    starts_at: Mapped[datetime] = mapped_column(TS)
    status: Mapped[str] = mapped_column(Text, server_default="booked")
    source: Mapped[str] = mapped_column(Text, server_default="staff")
    reason: Mapped[str | None] = mapped_column(Text)
    call_id: Mapped[uuid.UUID | None] = fk("calls.id")
    rescheduled_from_id: Mapped[uuid.UUID | None] = fk("appointments.id")
    cancelled_reason: Mapped[str | None] = mapped_column(Text)
    checked_in_at: Mapped[datetime | None] = mapped_column(TS)


class CallEvent(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "call_events"

    call_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("calls.id"))
    type: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    at: Mapped[datetime] = mapped_column(TS)


class CallTranscript(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "call_transcripts"

    call_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("calls.id"))
    speaker: Mapped[str] = mapped_column(Text)
    text: Mapped[str] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(Text)
    start_ms: Mapped[int | None] = mapped_column(Integer)
    end_ms: Mapped[int | None] = mapped_column(Integer)


class CallMetric(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "call_metrics"

    call_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("calls.id"))
    turn_index: Mapped[int] = mapped_column(Integer)
    stt_ms: Mapped[int | None] = mapped_column(Integer)
    llm_ttfb_ms: Mapped[int | None] = mapped_column(Integer)
    llm_total_ms: Mapped[int | None] = mapped_column(Integer)
    tts_ttfb_ms: Mapped[int | None] = mapped_column(Integer)
    e2e_ms: Mapped[int | None] = mapped_column(Integer)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    tts_chars: Mapped[int | None] = mapped_column(Integer)
    stt_seconds: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))


class Escalation(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "escalations"

    call_id: Mapped[uuid.UUID | None] = fk("calls.id")
    patient_id: Mapped[uuid.UUID | None] = fk("patients.id")
    priority: Mapped[str] = mapped_column(Text, server_default="medium")
    category: Mapped[str] = mapped_column(Text, server_default="other")
    reason: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    transcript_excerpt: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="open")
    sla_due_at: Mapped[datetime | None] = mapped_column(TS)
    taken_by: Mapped[uuid.UUID | None] = mapped_column(UUIDCol)
    taken_at: Mapped[datetime | None] = mapped_column(TS)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(UUIDCol)
    resolved_at: Mapped[datetime | None] = mapped_column(TS)
    resolution_note: Mapped[str | None] = mapped_column(Text)


class AgentAction(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "agent_actions"

    call_id: Mapped[uuid.UUID | None] = fk("calls.id")
    agent_type: Mapped[str] = mapped_column(Text)
    tool_name: Mapped[str] = mapped_column(Text)
    arguments: Mapped[dict[str, Any]] = mapped_column(JSONB)
    decision: Mapped[str] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    latency_ms: Mapped[int | None] = mapped_column(Integer)


class AuditLog(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"

    actor_type: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUIDCol)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    at: Mapped[datetime] = mapped_column(TS)


class KnowledgeArticle(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_articles"

    type: Mapped[str] = mapped_column(Text)
    scope: Mapped[str] = mapped_column(Text, server_default="global")
    department_id: Mapped[uuid.UUID | None] = fk("departments.id")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id")
    procedure: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, server_default="draft")
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    parent_id: Mapped[uuid.UUID | None] = fk("knowledge_articles.id")
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUIDCol)
    approved_at: Mapped[datetime | None] = mapped_column(TS)


class Discharge(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "discharges"

    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDCol, ForeignKey("patients.id"))
    department_id: Mapped[uuid.UUID | None] = fk("departments.id")
    doctor_id: Mapped[uuid.UUID | None] = fk("doctors.id")
    discharged_at: Mapped[datetime] = mapped_column(TS)
    notes: Mapped[str | None] = mapped_column(Text)
    checklist_results: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(UUIDCol)


class EvalRun(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "eval_runs"

    status: Mapped[str] = mapped_column(Text, server_default="running")
    scenarios_total: Mapped[int] = mapped_column(Integer, server_default="0")
    scenarios_passed: Mapped[int] = mapped_column(Integer, server_default="0")
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    report_path: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(TS)
    finished_at: Mapped[datetime | None] = mapped_column(TS)


class Job(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "jobs"

    kind: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    run_at: Mapped[datetime] = mapped_column(TS)
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, server_default="3")
    locked_at: Mapped[datetime | None] = mapped_column(TS)
    locked_by: Mapped[str | None] = mapped_column(Text)
    last_error: Mapped[str | None] = mapped_column(Text)


__all__ = [
    "Agent", "AgentAction", "Appointment", "AppointmentSlot", "AuditLog", "Call", "CallEvent", "CallMetric",
    "CallSession", "CallTask", "CallTranscript", "Department", "Discharge", "Doctor", "DomainEvent", "Escalation",
    "EvalRun", "Job", "KnowledgeArticle", "Patient", "Staff", "Tenant", "WorkflowRule",
]
