"""
Premier Electrolysis – FastAPI Backend
Entry point. Mounts all routers.
"""
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from routers import auth, bookings, sessions, clients, photos, availability

app = FastAPI(title="Premier Electrolysis API", version="1.0.0")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,         prefix="/auth",         tags=["auth"])
app.include_router(bookings.router,     prefix="/bookings",     tags=["bookings"])
app.include_router(sessions.router,     prefix="/sessions",     tags=["sessions"])
app.include_router(clients.router,      prefix="/clients",      tags=["clients"])
app.include_router(photos.router,       prefix="/photos",       tags=["photos"])
app.include_router(availability.router, prefix="/availability", tags=["availability"])

@app.get("/")
def root():
    return {"status": "ok"}
