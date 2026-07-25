"""
Auth endpoints:
  POST /auth/login          – returns JWT
  POST /auth/register       – new client self-registration
  POST /auth/set-password   – first-time password setup (from invite link)
  GET  /auth/me             – returns current user info
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from database import get_db
import models
from auth_utils import (
    hash_password, verify_password,
    create_access_token, get_current_user
)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:      EmailStr
    password:   str
    first_name: str
    last_name:  str
    phone:      str | None = None

class SetPasswordRequest(BaseModel):
    email:    EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    role:         str
    user_id:      str
    first_name:   str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.User).where(models.User.email == form.username))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account inactive")

    token = create_access_token(str(user.id), user.role)
    return TokenResponse(
        access_token=token,
        role=user.role,
        user_id=str(user.id),
        first_name=user.first_name,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(models.User).where(models.User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = models.User(
        email=req.email,
        hashed_password=hash_password(req.password),
        role="client",
        first_name=req.first_name,
        last_name=req.last_name,
        phone=req.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id), user.role)
    return TokenResponse(
        access_token=token,
        role=user.role,
        user_id=str(user.id),
        first_name=user.first_name,
    )


@router.post("/set-password")
async def set_password(req: SetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Called when the owner sets up their account for the first time,
    or when a client activates their account from an invite email.
    """
    result = await db.execute(select(models.User).where(models.User.email == req.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(req.password)
    await db.commit()
    return {"message": "Password set successfully"}


@router.get("/me")
async def me(current_user: models.User = Depends(get_current_user)):
    return {
        "id":         str(current_user.id),
        "email":      current_user.email,
        "role":       current_user.role,
        "first_name": current_user.first_name,
        "last_name":  current_user.last_name,
        "phone":      current_user.phone,
    }
