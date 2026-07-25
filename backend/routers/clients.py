"""
Clients endpoints (owner only):
  GET  /clients                – list all clients
  GET  /clients/{id}           – single client profile with bookings + sessions
  PATCH /clients/{id}          – update client info
  GET  /clients/{id}/no-show-fees  – list fees
  PATCH /clients/{id}/no-show-fees/{fee_id} – mark paid or waive
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
import models
from auth_utils import require_owner

router = APIRouter()


class ClientUpdate(BaseModel):
    first_name: str | None = None
    last_name:  str | None = None
    phone:      str | None = None
    is_active:  bool | None = None

class FeeUpdate(BaseModel):
    status:        str          # "paid" or "waived"
    waived_reason: str | None = None


@router.get("")
async def list_clients(
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.User)
        .where(models.User.role == "client")
        .order_by(models.User.last_name)
    )
    clients = result.scalars().all()
    return [_client_summary(c) for c in clients]


@router.get("/{client_id}")
async def get_client(
    client_id: uuid.UUID,
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.User).where(models.User.id == client_id))
    client = result.scalar_one_or_none()
    if not client or client.role != "client":
        raise HTTPException(404, "Client not found")

    bookings_result = await db.execute(
        select(models.Booking)
        .where(models.Booking.client_id == client_id)
        .order_by(models.Booking.date.desc())
    )
    sessions_result = await db.execute(
        select(models.Session)
        .where(models.Session.client_id == client_id)
        .order_by(models.Session.session_date.desc())
    )
    photos_result = await db.execute(
        select(models.Photo)
        .where(models.Photo.client_id == client_id)
        .order_by(models.Photo.uploaded_at.desc())
    )
    fees_result = await db.execute(
        select(models.NoShowFee)
        .where(models.NoShowFee.client_id == client_id)
    )

    return {
        **_client_summary(client),
        "bookings": [_booking_mini(b) for b in bookings_result.scalars().all()],
        "sessions": [{"id": str(s.id), "date": str(s.session_date), "notes": s.owner_notes}
                     for s in sessions_result.scalars().all()],
        "photos":   [_photo_dict(p) for p in photos_result.scalars().all()],
        "no_show_fees": [_fee_dict(f) for f in fees_result.scalars().all()],
    }


@router.patch("/{client_id}")
async def update_client(
    client_id: uuid.UUID,
    body: ClientUpdate,
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.User).where(models.User.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Client not found")
    if body.first_name is not None: client.first_name = body.first_name
    if body.last_name  is not None: client.last_name  = body.last_name
    if body.phone      is not None: client.phone      = body.phone
    if body.is_active  is not None: client.is_active  = body.is_active
    await db.commit()
    return _client_summary(client)


@router.get("/{client_id}/no-show-fees")
async def list_fees(
    client_id: uuid.UUID,
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.NoShowFee).where(models.NoShowFee.client_id == client_id)
    )
    return [_fee_dict(f) for f in result.scalars().all()]


@router.patch("/{client_id}/no-show-fees/{fee_id}")
async def update_fee(
    client_id: uuid.UUID,
    fee_id:    uuid.UUID,
    body: FeeUpdate,
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.NoShowFee).where(
            models.NoShowFee.id == fee_id,
            models.NoShowFee.client_id == client_id,
        )
    )
    fee = result.scalar_one_or_none()
    if not fee:
        raise HTTPException(404, "Fee not found")

    if body.status not in ("paid", "waived"):
        raise HTTPException(400, "status must be 'paid' or 'waived'")

    fee.status = body.status
    if body.status == "waived":
        fee.waived_reason = body.waived_reason
    if body.status == "paid":
        from datetime import datetime, timezone
        fee.paid_at = datetime.now(timezone.utc)

    await db.commit()
    return _fee_dict(fee)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _client_summary(c: models.User) -> dict:
    return {
        "id":         str(c.id),
        "email":      c.email,
        "first_name": c.first_name,
        "last_name":  c.last_name,
        "phone":      c.phone,
        "is_active":  c.is_active,
        "created_at": str(c.created_at),
    }

def _booking_mini(b: models.Booking) -> dict:
    return {
        "id": str(b.id), "date": str(b.date),
        "start_time": str(b.start_time),
        "service_name": b.service_name, "status": b.status,
    }

def _photo_dict(p: models.Photo) -> dict:
    return {
        "id": str(p.id), "s3_url": p.s3_url, "type": p.type,
        "treatment_area": p.treatment_area, "caption": p.caption,
        "is_visible_to_client": p.is_visible_to_client,
        "uploaded_at": str(p.uploaded_at),
    }

def _fee_dict(f: models.NoShowFee) -> dict:
    return {
        "id": str(f.id), "booking_id": str(f.booking_id),
        "amount_cents": f.amount_cents, "status": f.status,
        "waived_reason": f.waived_reason, "created_at": str(f.created_at),
        "paid_at": str(f.paid_at) if f.paid_at else None,
    }
