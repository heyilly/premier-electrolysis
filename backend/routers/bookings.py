"""
Bookings endpoints:
  POST /bookings/request        – public: new client submits booking request
  GET  /bookings/mine           – client: their own bookings
  GET  /bookings                – owner: all bookings (filterable)
  GET  /bookings/calendar       – owner: bookings for a month (calendar view)
  PATCH /bookings/{id}/status   – owner: confirm / complete / cancel / no_show
  PATCH /bookings/{id}/notes    – owner: update owner notes on a booking
"""

import uuid
from datetime import date, time
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel, EmailStr

from database import get_db
import models
from auth_utils import get_current_user, require_owner

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class PublicBookingRequest(BaseModel):
    """Submitted by a new client via the public booking form."""
    first_name:    str
    last_name:     str
    email:         EmailStr
    phone:         str | None = None
    service_name:  str
    date:          date
    start_time:    time
    treatment_area: str | None = None
    client_notes:  str | None = None
    is_first_visit: bool = True

class StatusUpdate(BaseModel):
    status: str   # confirmed | completed | cancelled | no_show

class OwnerNotesUpdate(BaseModel):
    owner_notes: str


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/request", status_code=201)
async def public_booking_request(req: PublicBookingRequest, db: AsyncSession = Depends(get_db)):
    """
    Anyone can call this — no auth required.
    Creates a user account if email is new, then creates a pending booking.
    """
    result = await db.execute(select(models.User).where(models.User.email == req.email))
    user = result.scalar_one_or_none()

    if not user:
        user = models.User(
            email=req.email,
            role="client",
            first_name=req.first_name,
            last_name=req.last_name,
            phone=req.phone,
        )
        db.add(user)
        await db.flush()  # get user.id before booking insert

    # resolve service price
    PRICES = {
        "Consultation": 0,
        "15-Minute Session": 4500,
        "30-Minute Session": 8000,
        "60-Minute Session": 14500,
        "90-Minute Session": 21000,
        "2-Hour Session": 27000,
    }
    duration_map = {
        "Consultation": 60,
        "15-Minute Session": 15,
        "30-Minute Session": 30,
        "60-Minute Session": 60,
        "90-Minute Session": 90,
        "2-Hour Session": 120,
    }

    booking = models.Booking(
        client_id=user.id,
        date=req.date,
        start_time=req.start_time,
        service_name=req.service_name,
        duration_minutes=duration_map.get(req.service_name, 60),
        amount_cents=PRICES.get(req.service_name, 0),
        status="pending",
        client_notes=req.client_notes,
        treatment_area=req.treatment_area,
        is_first_visit=req.is_first_visit,
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    return {"booking_id": str(booking.id), "message": "Booking request received"}


@router.get("/mine")
async def my_bookings(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.Booking)
        .where(models.Booking.client_id == current_user.id)
        .order_by(models.Booking.date.desc(), models.Booking.start_time.desc())
    )
    bookings = result.scalars().all()
    return [_booking_dict(b) for b in bookings]


@router.get("")
async def list_bookings(
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if status:
        filters.append(models.Booking.status == status)
    if date_from:
        filters.append(models.Booking.date >= date_from)
    if date_to:
        filters.append(models.Booking.date <= date_to)

    q = select(models.Booking).order_by(models.Booking.date.desc(), models.Booking.start_time)
    if filters:
        q = q.where(and_(*filters))

    result = await db.execute(q)
    bookings = result.scalars().all()
    return [_booking_dict(b) for b in bookings]


@router.get("/calendar")
async def calendar_bookings(
    year: int = Query(...),
    month: int = Query(...),
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Returns all bookings in a given month for the calendar view."""
    from calendar import monthrange
    _, last_day = monthrange(year, month)
    date_from = date(year, month, 1)
    date_to   = date(year, month, last_day)

    result = await db.execute(
        select(models.Booking, models.User)
        .join(models.User, models.Booking.client_id == models.User.id)
        .where(and_(
            models.Booking.date >= date_from,
            models.Booking.date <= date_to,
        ))
        .order_by(models.Booking.date, models.Booking.start_time)
    )
    rows = result.all()
    return [
        {**_booking_dict(b), "client_name": f"{u.first_name} {u.last_name}"}
        for b, u in rows
    ]


@router.patch("/{booking_id}/status")
async def update_status(
    booking_id: uuid.UUID,
    body: StatusUpdate,
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    valid = {"confirmed", "completed", "cancelled", "no_show", "pending"}
    if body.status not in valid:
        raise HTTPException(400, f"status must be one of {valid}")

    result = await db.execute(select(models.Booking).where(models.Booking.id == booking_id))
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(404, "Booking not found")

    # no_show fee is handled by the DB trigger
    booking.status = body.status
    await db.commit()
    await db.refresh(booking)
    return _booking_dict(booking)


@router.patch("/{booking_id}/notes")
async def update_owner_notes(
    booking_id: uuid.UUID,
    body: OwnerNotesUpdate,
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.Booking).where(models.Booking.id == booking_id))
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(404, "Booking not found")
    booking.owner_notes = body.owner_notes
    await db.commit()
    return {"message": "Notes updated"}


# ── Helper ────────────────────────────────────────────────────────────────────

def _booking_dict(b: models.Booking) -> dict:
    return {
        "id":               str(b.id),
        "client_id":        str(b.client_id),
        "date":             str(b.date),
        "start_time":       str(b.start_time),
        "duration_minutes": b.duration_minutes,
        "service_name":     b.service_name,
        "amount_cents":     b.amount_cents,
        "status":           b.status,
        "client_notes":     b.client_notes,
        "owner_notes":      b.owner_notes,
        "is_first_visit":   b.is_first_visit,
        "treatment_area":   b.treatment_area,
        "created_at":       str(b.created_at),
    }
