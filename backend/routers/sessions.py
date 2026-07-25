"""
Sessions endpoints:
  POST /sessions                   – owner: create session record after appointment
  GET  /sessions/client/{client_id} – owner: all sessions for a client
  GET  /sessions/mine              – client: their own session history
  PATCH /sessions/{id}             – owner: update notes / areas
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
import models
from auth_utils import get_current_user, require_owner

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class AreaIn(BaseModel):
    treatment_area:  str
    intensity_level: int

class SessionCreate(BaseModel):
    client_id:    str
    booking_id:   str | None = None
    session_date: datetime
    owner_notes:  str | None = None
    areas:        list[AreaIn] = []

class SessionUpdate(BaseModel):
    owner_notes: str | None = None
    areas:       list[AreaIn] | None = None


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_session(
    body: SessionCreate,
    owner: models.User = Depends(require_owner),
    db:    AsyncSession = Depends(get_db),
):
    session = models.Session(
        client_id=uuid.UUID(body.client_id),
        booking_id=uuid.UUID(body.booking_id) if body.booking_id else None,
        session_date=body.session_date,
        owner_notes=body.owner_notes,
    )
    db.add(session)
    await db.flush()

    for area in body.areas:
        db.add(models.SessionArea(
            session_id=session.id,
            treatment_area=area.treatment_area,
            intensity_level=area.intensity_level,
        ))

    # mark booking completed if linked
    if body.booking_id:
        result = await db.execute(
            select(models.Booking).where(models.Booking.id == uuid.UUID(body.booking_id))
        )
        booking = result.scalar_one_or_none()
        if booking:
            booking.status = "completed"

    await db.commit()
    await db.refresh(session)
    return _session_dict(session)


@router.get("/mine")
async def my_sessions(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.Session)
        .where(models.Session.client_id == current_user.id)
        .order_by(models.Session.session_date.desc())
    )
    sessions = result.scalars().all()
    # load areas
    for s in sessions:
        await db.refresh(s, ["areas"])
    return [_session_dict(s) for s in sessions]


@router.get("/client/{client_id}")
async def client_sessions(
    client_id: uuid.UUID,
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.Session)
        .where(models.Session.client_id == client_id)
        .order_by(models.Session.session_date.desc())
    )
    sessions = result.scalars().all()
    for s in sessions:
        await db.refresh(s, ["areas"])
    return [_session_dict(s) for s in sessions]


@router.patch("/{session_id}")
async def update_session(
    session_id: uuid.UUID,
    body: SessionUpdate,
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.Session).where(models.Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    if body.owner_notes is not None:
        session.owner_notes = body.owner_notes

    if body.areas is not None:
        # replace all areas
        existing = await db.execute(
            select(models.SessionArea).where(models.SessionArea.session_id == session_id)
        )
        for area in existing.scalars().all():
            await db.delete(area)
        for area in body.areas:
            db.add(models.SessionArea(
                session_id=session_id,
                treatment_area=area.treatment_area,
                intensity_level=area.intensity_level,
            ))

    await db.commit()
    await db.refresh(session, ["areas"])
    return _session_dict(session)


# ── Helper ────────────────────────────────────────────────────────────────────

def _session_dict(s: models.Session) -> dict:
    return {
        "id":           str(s.id),
        "client_id":    str(s.client_id),
        "booking_id":   str(s.booking_id) if s.booking_id else None,
        "session_date": str(s.session_date),
        "owner_notes":  s.owner_notes,
        "areas": [
            {"treatment_area": a.treatment_area, "intensity_level": a.intensity_level}
            for a in (s.areas or [])
        ],
        "created_at": str(s.created_at),
    }
