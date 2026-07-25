"""
SQLAlchemy ORM models — mirror of schema.sql
"""

import uuid
from datetime import datetime, date, time
from sqlalchemy import (
    String, Boolean, Integer, Text, Date, Time,
    DateTime, ForeignKey, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id:              Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email:           Mapped[str]        = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    role:            Mapped[str]        = mapped_column(String, default="client")
    first_name:      Mapped[str]        = mapped_column(String, nullable=False)
    last_name:       Mapped[str]        = mapped_column(String, nullable=False)
    phone:           Mapped[str | None] = mapped_column(String, nullable=True)
    is_active:       Mapped[bool]       = mapped_column(Boolean, default=True)
    created_at:      Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:      Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    bookings:  Mapped[list["Booking"]]  = relationship("Booking",  back_populates="client")
    sessions:  Mapped[list["Session"]]  = relationship("Session",  back_populates="client")
    photos:    Mapped[list["Photo"]]    = relationship("Photo",    back_populates="client")
    no_show_fees: Mapped[list["NoShowFee"]] = relationship("NoShowFee", back_populates="client")


class Availability(Base):
    __tablename__ = "availability"

    id:           Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day_of_week:  Mapped[str | None]    = mapped_column(String, nullable=True)
    open_time:    Mapped[time | None]   = mapped_column(Time, nullable=True)
    close_time:   Mapped[time | None]   = mapped_column(Time, nullable=True)
    is_blocked:   Mapped[bool]          = mapped_column(Boolean, default=False)
    blocked_date: Mapped[date | None]   = mapped_column(Date, nullable=True)
    note:         Mapped[str | None]    = mapped_column(Text, nullable=True)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())


class Booking(Base):
    __tablename__ = "bookings"

    id:               Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id:        Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    date:             Mapped[date]       = mapped_column(Date, nullable=False)
    start_time:       Mapped[time]       = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int]        = mapped_column(Integer, default=60)
    service_name:     Mapped[str]        = mapped_column(String, nullable=False)
    amount_cents:     Mapped[int]        = mapped_column(Integer, default=0)
    status:           Mapped[str]        = mapped_column(String, default="pending")
    client_notes:     Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_notes:      Mapped[str | None] = mapped_column(Text, nullable=True)
    is_first_visit:   Mapped[bool]       = mapped_column(Boolean, default=False)
    treatment_area:   Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at:       Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:       Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    client:      Mapped["User"]          = relationship("User", back_populates="bookings")
    session:     Mapped["Session | None"] = relationship("Session", back_populates="booking", uselist=False)
    no_show_fee: Mapped["NoShowFee | None"] = relationship("NoShowFee", back_populates="booking", uselist=False)


class Session(Base):
    __tablename__ = "sessions"

    id:           Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id:   Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), unique=True, nullable=True)
    client_id:    Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_date: Mapped[datetime]      = mapped_column(DateTime(timezone=True), nullable=False)
    owner_notes:  Mapped[str | None]    = mapped_column(Text, nullable=True)
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    client:  Mapped["User"]             = relationship("User", back_populates="sessions")
    booking: Mapped["Booking | None"]   = relationship("Booking", back_populates="session")
    areas:   Mapped[list["SessionArea"]] = relationship("SessionArea", back_populates="session", cascade="all, delete-orphan")
    photos:  Mapped[list["Photo"]]      = relationship("Photo", back_populates="session")


class SessionArea(Base):
    __tablename__ = "session_areas"

    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id:      Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"))
    treatment_area:  Mapped[str]       = mapped_column(Text, nullable=False)
    intensity_level: Mapped[int]       = mapped_column(Integer, nullable=False)
    created_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["Session"] = relationship("Session", back_populates="areas")


class Photo(Base):
    __tablename__ = "photos"

    id:                   Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id:            Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id:           Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    s3_url:               Mapped[str]           = mapped_column(Text, nullable=False)
    s3_key:               Mapped[str]           = mapped_column(Text, nullable=False)
    type:                 Mapped[str]           = mapped_column(String, default="before")
    treatment_area:       Mapped[str | None]    = mapped_column(Text, nullable=True)
    caption:              Mapped[str | None]    = mapped_column(Text, nullable=True)
    is_visible_to_client: Mapped[bool]          = mapped_column(Boolean, default=True)
    uploaded_at:          Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    client:  Mapped["User"]            = relationship("User", back_populates="photos")
    session: Mapped["Session | None"]  = relationship("Session", back_populates="photos")


class NoShowFee(Base):
    __tablename__ = "no_show_fees"

    id:            Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id:    Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), unique=True)
    client_id:     Mapped[uuid.UUID]     = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    amount_cents:  Mapped[int]           = mapped_column(Integer, default=2000)
    status:        Mapped[str]           = mapped_column(String, default="unpaid")
    waived_reason: Mapped[str | None]    = mapped_column(Text, nullable=True)
    created_at:    Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at:       Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client:  Mapped["User"]    = relationship("User", back_populates="no_show_fees")
    booking: Mapped["Booking"] = relationship("Booking", back_populates="no_show_fee")
