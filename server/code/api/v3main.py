"""
FastAPI app entrypoint — LoreVox v4.2 (JSON-Hybrid)

Run:
  uvicorn code.api.main:app --host 0.0.0.0 --port 8000

Notes
- DATA_DIR points to your Linux disk folder (fast), not /mnt/c (slow)
- UI is served from /ui/*
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# UPDATED: added db_inspector + sessions_legacy
from .routers import (
    interview,
    sessions,
    sessions_legacy,
    people,
    profiles,
    timeline,
    media,
    chat,
    db_inspector,
)

APP_VERSION = "4.2"

app = FastAPI(title="LoreVox API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Serve UI static files
# -----------------------------
# main.py is: <root>/code/api/main.py
ROOT = Path(__file__).resolve().parents[2]  # <root>
UI_DIR = ROOT / "ui"

if UI_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(UI_DIR), html=True), name="ui")

# -----------------------------
# Routers
# -----------------------------
app.include_router(people.router)
app.include_router(profiles.router)
app.include_router(timeline.router)
app.include_router(media.router)

app.include_router(interview.router)
app.include_router(sessions.router)

# NEW: DB inspector (/db/tables, /db/table/{table_name})
app.include_router(db_inspector.router)

# NEW: legacy compatibility for older UI calls (/api/session/*)
app.include_router(sessions_legacy.router)

# This is what your lorevox-v4.html expects:
app.include_router(chat.router)

# -----------------------------
# Health / ping
# -----------------------------
@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION}


@app.get("/api/ping")
def ping():
    return {"pong": True, "version": APP_VERSION}
