"""Lorevox WO-8 — Transcript History & Thread Anchor Router

Provides REST endpoints for:
  - Loading full chat transcript for a narrator session (with timestamps)
  - Exporting transcript as plain text or JSON
  - Storing and retrieving thread anchors for resume logic

All data comes from the archive layer (append-only JSONL), NOT the
transient SQLite turns table.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from ..archive import (
    read_transcript,
    list_sessions as archive_list_sessions,
    get_latest_session_id,
    update_thread_anchor,
    read_thread_anchor,
    export_transcript_txt,
)

router = APIRouter(prefix="/api/transcript", tags=["transcript"])


# ── Load transcript for UI display ──────────────────────────────────────────

@router.get("/history")
def get_transcript_history(
    person_id: str = Query(...),
    session_id: str = Query(default=""),
    limit: int = Query(default=200, ge=1, le=2000),
):
    """
    Return transcript events for a narrator session.
    If session_id is empty, uses the most recent session.
    Returns events with timestamps, roles, and content.
    """
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sid = session_id.strip()
    if not sid:
        sid = get_latest_session_id(person_id) or ""
    if not sid:
        return {"person_id": person_id, "session_id": "", "events": [], "count": 0}

    events = read_transcript(person_id=person_id, session_id=sid)
    # Limit to most recent N events
    if len(events) > limit:
        events = events[-limit:]

    return {
        "person_id": person_id,
        "session_id": sid,
        "events": events,
        "count": len(events),
    }


# ── List sessions for a narrator ────────────────────────────────────────────

@router.get("/sessions")
def get_transcript_sessions(person_id: str = Query(...)):
    """List all archived sessions for a narrator, sorted most-recent first."""
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sessions = archive_list_sessions(person_id)
    sessions.sort(key=lambda s: s.get("started_at", ""), reverse=True)
    return {"person_id": person_id, "sessions": sessions}


# ── Export transcript ────────────────────────────────────────────────────────

@router.get("/export/txt")
def export_txt(
    person_id: str = Query(...),
    session_id: str = Query(default=""),
):
    """Export full transcript as plain text."""
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sid = session_id.strip()
    if not sid:
        sid = get_latest_session_id(person_id) or ""
    if not sid:
        return PlainTextResponse("No sessions found.", status_code=404)

    txt = export_transcript_txt(person_id=person_id, session_id=sid)
    return PlainTextResponse(
        txt,
        headers={
            "Content-Disposition": f'attachment; filename="transcript_{sid[:12]}.txt"'
        },
    )


@router.get("/export/json")
def export_json(
    person_id: str = Query(...),
    session_id: str = Query(default=""),
):
    """Export full transcript as JSON array."""
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sid = session_id.strip()
    if not sid:
        sid = get_latest_session_id(person_id) or ""
    if not sid:
        raise HTTPException(status_code=404, detail="No sessions found")

    events = read_transcript(person_id=person_id, session_id=sid)
    return {
        "person_id": person_id,
        "session_id": sid,
        "events": events,
        "count": len(events),
    }


# ── Thread anchor (resume) ──────────────────────────────────────────────────

class ThreadAnchorRequest(BaseModel):
    person_id: str
    session_id: str = ""
    topic_label: str = ""
    topic_summary: str = ""
    active_era: str = ""
    last_turn_ids: List[str] = []
    last_narrator_turns: List[str] = []


@router.post("/thread-anchor")
def save_thread_anchor(req: ThreadAnchorRequest):
    """Save or update the thread anchor for resume logic."""
    if not req.person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sid = req.session_id.strip()
    if not sid:
        sid = get_latest_session_id(req.person_id) or ""
    if not sid:
        raise HTTPException(status_code=404, detail="No active session found")

    update_thread_anchor(
        person_id=req.person_id,
        session_id=sid,
        topic_label=req.topic_label,
        topic_summary=req.topic_summary,
        active_era=req.active_era,
        last_turn_ids=req.last_turn_ids,
        last_narrator_turns=req.last_narrator_turns,
    )
    return {"ok": True, "session_id": sid}


@router.get("/thread-anchor")
def get_thread_anchor(
    person_id: str = Query(...),
    session_id: str = Query(default=""),
):
    """Read the thread anchor for resume. If no session_id, uses latest."""
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sid = session_id.strip()
    if not sid:
        sid = get_latest_session_id(person_id) or ""
    if not sid:
        return {"person_id": person_id, "session_id": "", "anchor": None}

    anchor = read_thread_anchor(person_id=person_id, session_id=sid)
    return {
        "person_id": person_id,
        "session_id": sid,
        "anchor": anchor,
    }
