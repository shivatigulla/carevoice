"""ORM models mirroring supabase/migrations. Import from here: `from app.models import Call`."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import ARRAY, Boolean, Computed, Date, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TenantMixin, TimestampMixin


class Tenant(IdMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), Computed("id", persisted=True))
    name: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    timezone: Mapped[str] = mapped_column(Text, server_default="Asia/Kolkata")
    phone: Mapped[str | None] = mapped_column(Text)


class TenantMember(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "tenant_members"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    role: Mapped[str] = mapped_column(Text, server_default="staff")
    full_name: Mapped[str | None] = mapped_column(Text)


class Agent(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "agents"

    key: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="active")
    languages: Mapped[list[str]] = mapped_column(ARRAY(Text))
    system_prompt: Mapped[str] = mapped_column(Text, server_default="")
    allowed_tools: Mapped[list[str]] = mapped_column(ARRAY(Text))
    flow: Mapped[dict[str, Any]] = mapped_column(JSONB)


class Patient(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "patients"

    full_name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text)
    preferred_language: Mapped[str] = mapped_column(Text, server_default="te")
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(Text)
    mrn: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class Doctor(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "doctors"

    full_name: Mapped[str] = mapped_column(Text)
    department: Mapped[str] = mapped_column(Text)
    languages: Mapped[list[str]] = mapped_column(ARRAY(Text))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")


class Call(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "calls"

    agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    patient_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id"))
    direction: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="queued")
    from_number: Mapped[str | None] = mapped_column(Text)
    to_number: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(Text)
    provider_call_id: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    summary: Mapped[str | None] = mapped_column(Text)
    recording_path: Mapped[str | None] = mapped_column(Text)


class Appointment(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "appointments"

    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id"))
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("doctors.id"))
    department: Mapped[str | None] = mapped_column(Text)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int] = mapped_column(Integer, server_default="15")
    status: Mapped[str] = mapped_column(Text, server_default="booked")
    source_call_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calls.id"))
    notes: Mapped[str | None] = mapped_column(Text)


class FollowUp(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "follow_ups"

    patient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id"))
    appointment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    reason: Mapped[str] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, server_default="scheduled")
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    last_call_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calls.id"))


class Task(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "tasks"

    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="open")
    priority: Mapped[str] = mapped_column(Text, server_default="normal")
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    call_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calls.id"))
    patient_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id"))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Escalation(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "escalations"

    call_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calls.id"))
    patient_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("patients.id"))
    severity: Mapped[str] = mapped_column(Text, server_default="medium")
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="open")
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Job(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "jobs"

    kind: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, server_default="3")
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(Text)
    last_error: Mapped[str | None] = mapped_column(Text)


__all__ = [
    "Agent",
    "Appointment",
    "Call",
    "Doctor",
    "Escalation",
    "FollowUp",
    "Job",
    "Patient",
    "Task",
    "Tenant",
    "TenantMember",
]
