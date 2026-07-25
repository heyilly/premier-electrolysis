"""
Availability endpoints:
  GET  /availability            – public: get weekly hours + blocked dates
  GET  /availability/slots      – public: available time slots for a given date
  PATCH /availability/{id}      – owner: update a day's hours
  POST /availability/block      – owner: block a specific date
"""

from datetime import date, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import uuid

from database import get_db
import models
from auth_utils import require_owner

router = APIRouter()

SLOT_INTERVAL_MINUTES = 30  # generate slots every 30 minutes


class HoursUpdate(BaseModel):
    open_time:  time
    close_time: time

class BlockDate(BaseModel):
    blocked_date: date
    note: str | None = None


@router.get("")
async def get_availability(db: AsyncSession = Depends(get_db)):
    """Returns weekly hours and any blocked dates — used by the public booking calendar."""
    result = await db.execute(select(models.Availability))
    rows = result.scalars().all()
    hours   = [r for r in rows if not r.is_blocked]
    blocked = [r for r in rows if r.is_blocked]
    return {
        "hours": [
            {
                "id":          str(h.id),
                "day_of_week": h.day_of_week,
                "open_time":   str(h.open_time),
                "close_time":  str(h.close_time),
            }
            for h in hours
        ],
        "blocked_dates": [str(b.blocked_date) for b in blocked if b.blocked_date],
    }


@router.get("/slots")
async def get_slots(
    date: date = Query(...),
    db:   AsyncSession = Depends(get_db),
):
    """
    Returns available 30-minute time slots for a given date.
    Excludes slots already booked (confirmed or pending).
    """
    day_name = date.strftime("%A").lower()

    # check if blocked
    blocked = await db.execute(
        select(models.Availability).where(
            models.Availability.is_blocked == True,
            models.Availability.blocked_date == date,
        )
    )
    if blocked.scalar_one_or_none():
        return {"date": str(date), "slots": []}

    # get hours for this weekday
    hours_result = await db.execute(
        select(models.Availability).where(
            models.Availability.day_of_week == day_name,
            models.Availability.is_blocked == False,
        )
    )
    hours = hours_result.scalar_one_or_none()
    if not hours:
        return {"date": str(date), "slots": []}

    # get already-booked times
    booked_result = await db.execute(
        select(models.Booking.start_time, models.Booking.duration_minutes)
        .where(
            models.Booking.date == date,
            models.Booking.status.in_(["pending", "confirmed"]),
        )
    )
    booked = booked_result.all()

    # generate all slots
    from datetime import datetime, timedelta
    open_dt  = datetime.combine(date, hours.open_time)
    close_dt = datetime.combine(date, hours.close_time)
    all_slots = []
    current   = open_dt
    while current < close_dt:
        slot_time = current.time()
        # check overlap with any booked session
        is_taken = False
        for b_time, b_dur in booked:
            b_start = datetime.combine(date, b_time)
            b_end   = b_start + timedelta(minutes=b_dur)
            if datetime.combine(date, slot_time) < b_end and current >= b_start:
                is_taken = True
                break
        if not is_taken:
            all_slots.append(slot_time.strftime("%H:%M"))
        current += timedelta(minutes=SLOT_INTERVAL_MINUTES)

    return {"date": str(date), "slots": all_slots}


@router.patch("/{avail_id}")
async def update_hours(
    avail_id: uuid.UUID,
    body: HoursUpdate,
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.Availability).where(models.Availability.id == avail_id)
    )
    avail = result.scalar_one_or_none()
    if not avail:
        raise HTTPException(404, "Availability record not found")
    avail.open_time  = body.open_time
    avail.close_time = body.close_time
    await db.commit()
    return {"message": "Hours updated"}


@router.post("/block", status_code=201)
async def block_date(
    body: BlockDate,
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    block = models.Availability(
        is_blocked=True,
        blocked_date=body.blocked_date,
        note=body.note,
    )
    db.add(block)
    await db.commit()
    return {"message": f"{body.blocked_date} blocked"}
