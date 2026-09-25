"""Staff appointment actions (writes go through the backend, never directly from the browser)."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import StaffContext, require_roles
from app.core.time import IST, utcnow
from app.db.session import get_session
from app.services.audit import write_audit

router = APIRouter(prefix="/api/appointments", tags=["appointments"])

CHECK_IN_FROM = ("booked", "confirmed")


class AppointmentOut(BaseModel):
    id: uuid.UUID
    status: str
    checked_in_at: datetime | None


@router.post("/{appointment_id}/check-in", response_model=AppointmentOut)
async def check_in(
    appointment_id: uuid.UUID,
    staff: StaffContext = Depends(require_roles("admin", "reception")),
    session: AsyncSession = Depends(get_session),
) -> AppointmentOut:
    """Mark a patient as arrived for today's appointment."""
    appt = (
        await session.execute(
            text(
                "select id, status, starts_at from public.appointments "
                "where id = :id and tenant_id = :t for update"
            ),
            {"id": appointment_id, "t": staff.tenant_id},
        )
    ).first()
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="appointment not found")
    if appt.status not in CHECK_IN_FROM:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"cannot check in an appointment that is {appt.status}")
    if appt.starts_at.astimezone(IST).date() != utcnow().astimezone(IST).date():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="only today's appointments can be marked as arrived")

    row = (
        await session.execute(
            text(
                "update public.appointments set status = 'checked_in', checked_in_at = now() "
                "where id = :id returning id, status, checked_in_at"
            ),
            {"id": appointment_id},
        )
    ).one()
    await write_audit(
        session,
        tenant_id=staff.tenant_id,
        actor_type="staff",
        actor_id=str(staff.user_id),
        action="appointment.check_in",
        entity_type="appointment",
        entity_id=appointment_id,
        before={"status": appt.status},
        after={"status": "checked_in"},
    )
    await session.commit()
    return AppointmentOut(id=row.id, status=row.status, checked_in_at=row.checked_in_at)
