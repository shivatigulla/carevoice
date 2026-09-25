"""Staff call actions: place a real outbound call (Bolna)."""

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import StaffContext, require_roles
from app.core.phone import normalize_phone
from app.db.session import get_session
from app.providers.bolna import BolnaError
from app.services.outbound import start_outbound_call

router = APIRouter(prefix="/api/calls", tags=["calls"])


class OutboundIn(BaseModel):
    phone: str | None = None
    patient_id: uuid.UUID | None = None
    appointment_id: uuid.UUID | None = None
    purpose: Literal["reminder", "missed", "post_visit", "booking"] = "reminder"

    @model_validator(mode="after")
    def one_of(self) -> "OutboundIn":
        if not self.phone and not self.patient_id:
            raise ValueError("phone or patient_id is required")
        return self


@router.post("/outbound")
async def outbound(
    body: OutboundIn,
    staff: StaffContext = Depends(require_roles("admin", "reception")),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    phone = None
    if body.phone:
        try:
            phone = normalize_phone(body.phone)
        except ValueError as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e)) from e
    if body.patient_id and not phone:
        from sqlalchemy import text

        phone = (
            await session.execute(
                text("select phone from public.patients where id = :p and tenant_id = :t"), {"p": body.patient_id, "t": staff.tenant_id}
            )
        ).scalar()
        if not phone:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "patient not found")
    try:
        return await start_outbound_call(
            session, tenant_id=staff.tenant_id, phone=phone, patient_id=body.patient_id, actor=str(staff.user_id),
            purpose=body.purpose, appointment_id=body.appointment_id,
        )
    except BolnaError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
