from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

APP_VERSION = "4.5"

# IMPORTANT:
# Option 2 architecture = main API (8000) should ALWAYS serve:
#   people/profiles/media/timeline/interview/sessions/db_inspector + LLM REST + chat WS
# TTS runs as a separate service on 8001 and should NOT gate any of the above.
#
# We keep USE_TTS only as an OPTIONAL add-on (if you ever want to mount TTS endpoints on 8000),
# but it must never disable the core routers.
USE_TTS = os.getenv("USE_TTS", "0").strip().lower() in ("1", "true", "yes", "y")

app = FastAPI(title="Lorevox API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOT = Path(__file__).resolve().parents[2]
UI_DIR = Path(os.getenv("UI_DIR", str(ROOT / "ui")))

if UI_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(UI_DIR), html=True), name="ui")

# -------------------------
# Always include core API
# -------------------------
from . import api as llm_api
from .routers import (  # type: ignore
    people,
    profiles,
    media,
    timeline,
    interview,
    sessions,
    db_inspector,
    chat_ws,
    ping,  # add /api/ping
)

# Core Entity & State Routers
app.include_router(people.router)
app.include_router(profiles.router)
app.include_router(media.router)
app.include_router(timeline.router)
app.include_router(interview.router)
app.include_router(sessions.router)
app.include_router(db_inspector.router)
app.include_router(ping.router)

# Real LLM Routers (REST and WS)
app.include_router(llm_api.router)
app.include_router(chat_ws.router)

# -------------------------
# Optional: also mount TTS endpoints on 8000
# (does NOT affect interview/chat/people/etc.)
# -------------------------
if USE_TTS:
    from .routers import tts as tts_router  # type: ignore
    app.include_router(tts_router.router)