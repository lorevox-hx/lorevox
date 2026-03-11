"""
FastAPI app entrypoint — LoreVox v4.2 (Safe Mode + Optional Agentic Routers)

Run (core API):
  uvicorn code.api.main:app --host 0.0.0.0 --port 8000

Run (TTS-only service):
  USE_TTS=1 uvicorn code.api.main:app --host 0.0.0.0 --port 8001

Notes
- DATA_DIR should point to your Linux disk folder (fast), not /mnt/c (slow)
- UI served from /ui/* (override with UI_DIR env var)
- Core mode preserves legacy SSE: POST /api/chat/stream
- Core mode optionally mounts WS/STT/Draft if those routers exist
- TTS-only mode mounts ONLY /api/tts/* (keeps your 8001 service lean/stable)
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

APP_VERSION = "4.2"

# Optional TTS-only mode (your launcher sets USE_TTS=1 for port 8001)
USE_TTS = os.getenv("USE_TTS", "0").strip().lower() in ("1", "true", "yes", "y")

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
ROOT = Path(__file__).resolve().parents[2]  # <repo root>
UI_DIR = Path(os.getenv("UI_DIR", str(ROOT / "ui")))

if UI_DIR.exists():
    app.mount("/ui", StaticFiles(directory=str(UI_DIR), html=True), name="ui")

# -----------------------------
# Routers
# -----------------------------
if USE_TTS:
    # ------------------------------------------------------------
    # TTS-only mode (port 8001)
    # ------------------------------------------------------------
    # Keep this service lean and stable for Coqui.
    from .routers import tts as tts_router  # type: ignore

    app.include_router(tts_router.router)

else:
    # ------------------------------------------------------------
    # Core mode (port 8000)
    # ------------------------------------------------------------
    # Always-on core routers
    from .routers import (  # type: ignore
        interview,
        sessions,
        sessions_legacy,
        people,
        profiles,
        timeline,
        media,
        chat,  # Legacy SSE endpoint: POST /api/chat/stream
        db_inspector,
    )

    app.include_router(people.router)
    app.include_router(profiles.router)
    app.include_router(timeline.router)
    app.include_router(media.router)

    app.include_router(interview.router)
    app.include_router(sessions.router)
    app.include_router(db_inspector.router)
    app.include_router(sessions_legacy.router)

    # This is what your current lorevox-v4.html expects:
    app.include_router(chat.router)

    # Optional routers (mount if present)
    # WS runtime: ws://.../api/chat/ws
    try:
        from .routers import chat_ws  # type: ignore

        app.include_router(chat_ws.router)
    except Exception:
        pass

    # STT router (/api/stt/*) — mount only if it exists
    try:
        from .routers import stt  # type: ignore

        app.include_router(stt.router)
    except Exception:
        pass

    # Draft router (/api/draft/*) — mount only if it exists
    try:
        from .routers import draft  # type: ignore

        app.include_router(draft.router)
    except Exception:
        pass

# -----------------------------
# Health / ping
# -----------------------------
@app.get("/api/health")
def health():
    return {"ok": True, "version": APP_VERSION, "mode": "tts" if USE_TTS else "core"}


@app.get("/api/ping")
def ping():
    return {"pong": True, "version": APP_VERSION, "mode": "tts" if USE_TTS else "core"}
