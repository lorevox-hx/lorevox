from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

APP_VERSION = "4.2"

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
    from .routers import tts as tts_router  # type: ignore
    app.include_router(tts_router.router)

else:
    # ------------------------------------------------------------
    # Core mode (port 8000)
    # ------------------------------------------------------------
    from .routers import (  # type: ignore
        people,
        profiles,
        media,
        timeline,
        interview,
        sessions,       # <-- your NEW standalone sessions router (replace file)
        chat,           # Legacy SSE endpoint: POST /api/chat/stream
        db_inspector,   # optional
    )

    app.include_router(people.router)
    app.include_router(profiles.router)
    app.include_router(media.router)
    app.include_router(timeline.router)

    app.include_router(interview.router)
    app.include_router(sessions.router)

    app.include_router(db_inspector.router)
    app.include_router(chat.router)

    # Optional WS runtime
    try:
        from .routers import chat_ws  # type: ignore
        app.include_router(chat_ws.router)
    except Exception:
        pass

    # Optional STT
    try:
        from .routers import stt  # type: ignore
        app.include_router(stt.router)
    except Exception:
        pass

    # Optional Draft
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
