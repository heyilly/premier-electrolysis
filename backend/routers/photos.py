"""
Photos endpoints:
  POST /photos/upload/{client_id}  – owner: upload photo to S3, save record
  GET  /photos/client/{client_id}  – owner: all photos for a client
  GET  /photos/mine                – client: their visible photos
  PATCH /photos/{id}               – owner: update caption / visibility
  DELETE /photos/{id}              – owner: delete from S3 + DB
"""

import uuid
import os
import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
import models
from auth_utils import get_current_user, require_owner

router = APIRouter()

# S3 / Cloudflare R2 config — same boto3 API, just different endpoint_url for R2
S3_BUCKET      = os.getenv("S3_BUCKET", "premier-electrolysis-photos")
S3_REGION      = os.getenv("S3_REGION", "us-east-1")
S3_ENDPOINT    = os.getenv("S3_ENDPOINT", None)   # set for Cloudflare R2
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")

def get_s3():
    kwargs = dict(
        region_name=S3_REGION,
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY,
    )
    if S3_ENDPOINT:
        kwargs["endpoint_url"] = S3_ENDPOINT
    return boto3.client("s3", **kwargs)


class PhotoUpdate(BaseModel):
    caption:              str | None = None
    is_visible_to_client: bool | None = None
    treatment_area:       str | None = None


@router.post("/upload/{client_id}", status_code=201)
async def upload_photo(
    client_id:      uuid.UUID,
    photo_type:     str        = Form(...),   # before | after | progress
    treatment_area: str | None = Form(None),
    session_id:     str | None = Form(None),
    caption:        str | None = Form(None),
    file:           UploadFile = File(...),
    owner:  models.User        = Depends(require_owner),
    db:     AsyncSession       = Depends(get_db),
):
    # validate client exists
    result = await db.execute(select(models.User).where(models.User.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(404, "Client not found")

    # validate file type
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Only JPEG, PNG, and WebP are accepted")

    ext = file.filename.rsplit(".", 1)[-1].lower()
    s3_key = f"clients/{client_id}/{photo_type}/{uuid.uuid4()}.{ext}"

    # upload to S3/R2
    try:
        s3 = get_s3()
        contents = await file.read()
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=contents,
            ContentType=file.content_type,
        )
        if S3_ENDPOINT:
            # Cloudflare R2 public URL format
            s3_url = f"{S3_ENDPOINT}/{S3_BUCKET}/{s3_key}"
        else:
            s3_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    except ClientError as e:
        raise HTTPException(500, f"Storage error: {str(e)}")

    photo = models.Photo(
        client_id=client_id,
        session_id=uuid.UUID(session_id) if session_id else None,
        s3_url=s3_url,
        s3_key=s3_key,
        type=photo_type,
        treatment_area=treatment_area,
        caption=caption,
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)

    return {
        "id":             str(photo.id),
        "s3_url":         photo.s3_url,
        "type":           photo.type,
        "treatment_area": photo.treatment_area,
        "caption":        photo.caption,
    }


@router.get("/mine")
async def my_photos(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.Photo)
        .where(
            models.Photo.client_id == current_user.id,
            models.Photo.is_visible_to_client == True,
        )
        .order_by(models.Photo.uploaded_at.desc())
    )
    return [_photo_dict(p) for p in result.scalars().all()]


@router.get("/client/{client_id}")
async def client_photos(
    client_id: uuid.UUID,
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(models.Photo)
        .where(models.Photo.client_id == client_id)
        .order_by(models.Photo.uploaded_at.desc())
    )
    return [_photo_dict(p) for p in result.scalars().all()]


@router.patch("/{photo_id}")
async def update_photo(
    photo_id: uuid.UUID,
    body: PhotoUpdate,
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.Photo).where(models.Photo.id == photo_id))
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(404, "Photo not found")
    if body.caption              is not None: photo.caption              = body.caption
    if body.is_visible_to_client is not None: photo.is_visible_to_client = body.is_visible_to_client
    if body.treatment_area       is not None: photo.treatment_area       = body.treatment_area
    await db.commit()
    return _photo_dict(photo)


@router.delete("/{photo_id}", status_code=204)
async def delete_photo(
    photo_id: uuid.UUID,
    owner: models.User = Depends(require_owner),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(models.Photo).where(models.Photo.id == photo_id))
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(404, "Photo not found")
    # delete from S3/R2
    try:
        get_s3().delete_object(Bucket=S3_BUCKET, Key=photo.s3_key)
    except ClientError:
        pass  # don't block DB delete if S3 fails
    await db.delete(photo)
    await db.commit()


def _photo_dict(p: models.Photo) -> dict:
    return {
        "id":                   str(p.id),
        "client_id":            str(p.client_id),
        "session_id":           str(p.session_id) if p.session_id else None,
        "s3_url":               p.s3_url,
        "type":                 p.type,
        "treatment_area":       p.treatment_area,
        "caption":              p.caption,
        "is_visible_to_client": p.is_visible_to_client,
        "uploaded_at":          str(p.uploaded_at),
    }
