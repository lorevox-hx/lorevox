from __future__ import annotations

import logging
import os
from pathlib import Path

# WO-10M: Configure application logging BEFORE any module imports fire their
# module-level loggers. Without this, Python's root logger defaults to WARNING
# and every logger.info(...) call in the WO-10M instrumentation is silently
# dropped. The LOG_LEVEL env var lets the launcher dial this up or down
# without a code edit. Default is INFO so WO-10M guard/cap/extraction markers
# are visible in api.log.
_WO10M_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _WO10M_LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    force=True,  # override any default handler uvicorn may have installed
)
# Make sure the two WO-10M-instrumented loggers are at INFO even if a parent
# filter tries to downgrade them later.
logging.getLogger("code.api.routers.chat_ws").setLevel(logging.INFO)
logging.getLogger("lorevox.extract").setLevel(logging.INFO)

# Load .env from repo root before anything else so DATA_DIR, DB_NAME, UI_DIR etc.
# are always available regardless of how the server was launched.
_REPO_ROOT = Path(__file__).resolve().parents[3]  # server/code/api/main.py → repo root 3 levels up
_env_file = _REPO_ROOT / ".env"
if _env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(str(_env_file), override=False)  # shell env takes precedence
    except ImportError:
        # dotenv not installed — fall back to manual parse of KEY=VALUE lines
        with open(_env_file) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _, _v = _line.partition("=")
                    os.environ.setdefault(_k.strip(), _v.strip())

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
    ping,
    calendar,
    facts,
    stt,
    affect,          # v6.1 Track B — Emotion Signal Layer
    memoir_export,   # Phase E — server-side DOCX export
    extract,         # v8.0 — Multi-field extraction engine
    questionnaire,   # Phase G — Storage Authority (QQ canonical)
    projection,      # Phase G — Storage Authority (projection canonical)
    narrator_state,  # Phase G — Storage Authority (state snapshot)
    identity_review, # Phase G — Storage Authority (identity change review)
    relationships,   # Phase Q.1 — Relationship Graph Layer
    transcript,      # WO-8 — Transcript History & Thread Anchor
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
app.include_router(calendar.router)
app.include_router(facts.router)
app.include_router(stt.router)
app.include_router(affect.router)  # v6.1 Track B
app.include_router(memoir_export.router)  # Phase E — DOCX export
app.include_router(extract.router)       # v8.0 — Multi-field extraction
app.include_router(questionnaire.router)  # Phase G — QQ canonical
app.include_router(projection.router)     # Phase G — Projection canonical
app.include_router(narrator_state.router) # Phase G — State snapshot
app.include_router(identity_review.router) # Phase G — Identity change review
app.include_router(relationships.router)   # Phase Q.1 — Relationship Graph Layer
app.include_router(transcript.router)      # WO-8 — Transcript History & Thread Anchor

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