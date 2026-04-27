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
    # BUG-PHOTO-CORS-01 (2026-04-25 night):
    # MUST be False whenever allow_origins=["*"] -- the CORS spec explicitly
    # forbids the wildcard combined with credentials, and modern browsers
    # silently refuse the response. The companion-app and extractor lane
    # do not actually use cross-origin cookies / HTTP auth (no
    # withCredentials anywhere in our UI grep), so dropping credentials
    # restores the wildcard semantics. If we ever wire cross-origin auth
    # later, switch this to an explicit origins list (8082 + 8000) and
    # flip back to True at the same time.
    allow_credentials=False,
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
    family_truth,    # WO-13 — Family Truth (Shadow / Proposal / Promoted)
    chronology_accordion,  # WO-CR-01 — Chronology Accordion (read-only)
    test_lab,        # WO-QA-01 — Lorevox Quality Harness (operator-only)
    kawa,            # WO-KAWA-UI-01A — River View (Kawa meaning layer)
    photos,          # WO-LORI-PHOTO-SHARED-01 — Phase 1 photo authority layer
    memory_archive,  # WO-ARCHIVE-AUDIO-01 — durable transcript + narrator-audio archive
    media_archive,   # WO-MEDIA-ARCHIVE-01 — Document Archive lane (PDFs, scanned docs, genealogy)
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
app.include_router(family_truth.router)    # WO-13 — Family Truth (Shadow / Proposal / Promoted)
app.include_router(chronology_accordion.router)  # WO-CR-01 — Chronology Accordion
app.include_router(test_lab.router)               # WO-QA-01 — Quality Harness
app.include_router(kawa.router)                   # WO-KAWA-UI-01A — River View
app.include_router(photos.router)                 # WO-LORI-PHOTO-SHARED-01 — Phase 1 photo authority layer (404s when LOREVOX_PHOTO_ENABLED=0)
app.include_router(memory_archive.router)         # WO-ARCHIVE-AUDIO-01 — narrator-only audio + transcript archive (404s when LOREVOX_ARCHIVE_ENABLED=0)
app.include_router(media_archive.router)          # WO-MEDIA-ARCHIVE-01 — Document Archive lane for PDFs / scans / genealogy (404s when LOREVOX_MEDIA_ARCHIVE_ENABLED=0)

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