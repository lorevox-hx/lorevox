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
    read_rolling_summary,
    write_rolling_summary,
    load_recent_archive_turns,
    filter_rolling_summary_for_narrator,  # WO-13 Phase 5
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


# ── WO-9: Export ALL sessions ─────────────────────────────────────────────

@router.get("/export/all/txt")
def export_all_txt(person_id: str = Query(...)):
    """Export all sessions for a narrator as a combined plain text document."""
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sessions = archive_list_sessions(person_id)
    if not sessions:
        return PlainTextResponse("No sessions found.", status_code=404)

    sessions.sort(key=lambda s: s.get("started_at", ""))
    parts: List[str] = []
    for sess in sessions:
        sid = sess.get("session_id", "")
        title = sess.get("title", "")
        started = sess.get("started_at", "")
        parts.append(f"{'=' * 60}")
        parts.append(f"Session: {sid}")
        if title:
            parts.append(f"Title: {title}")
        parts.append(f"Started: {started}")
        parts.append(f"{'=' * 60}\n")
        txt = export_transcript_txt(person_id=person_id, session_id=sid)
        parts.append(txt)
        parts.append("")

    combined = "\n".join(parts)
    return PlainTextResponse(
        combined,
        headers={
            "Content-Disposition": f'attachment; filename="all_transcripts_{person_id[:12]}.txt"'
        },
    )


@router.get("/export/all/json")
def export_all_json(person_id: str = Query(...)):
    """Export all sessions for a narrator as a combined JSON document."""
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sessions = archive_list_sessions(person_id)
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found")

    sessions.sort(key=lambda s: s.get("started_at", ""))
    result = []
    for sess in sessions:
        sid = sess.get("session_id", "")
        events = read_transcript(person_id=person_id, session_id=sid)
        result.append({
            "session_id": sid,
            "title": sess.get("title", ""),
            "started_at": sess.get("started_at", ""),
            "events": events,
            "count": len(events),
        })

    return {
        "person_id": person_id,
        "sessions": result,
        "total_sessions": len(result),
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
    # WO-9 additions for stronger continuity
    subtopic_label: str = ""
    continuation_keywords: List[str] = []
    last_meaningful_user_turn: str = ""
    last_meaningful_assistant_turn: str = ""


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
        # WO-9 stronger continuity fields
        subtopic_label=req.subtopic_label,
        continuation_keywords=req.continuation_keywords,
        last_meaningful_user_turn=req.last_meaningful_user_turn,
        last_meaningful_assistant_turn=req.last_meaningful_assistant_turn,
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


# ── WO-9: Rolling summary ─────────────────────────────────────────────────

class RollingSummaryRequest(BaseModel):
    person_id: str
    topic_thread: str = ""
    key_facts_mentioned: List[str] = []
    emotional_tone: str = ""
    last_question_asked: str = ""
    narrator_preferences: List[str] = []
    open_threads: List[str] = []


@router.get("/rolling-summary")
def get_rolling_summary(person_id: str = Query(...)):
    """Read the rolling summary for a narrator.

    WO-13 Phase 5: The returned summary is run through
    ``filter_rolling_summary_for_narrator`` so cross-narrator bleed and
    stress-test artefacts are stripped before the payload leaves the server.
    The ``summary['wo13_filtered']`` block reports what was dropped so the
    review UI can surface an "N items hidden" banner.
    """
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")
    raw = read_rolling_summary(person_id)
    summary = filter_rolling_summary_for_narrator(raw, person_id)
    return {"person_id": person_id, "summary": summary}


@router.post("/rolling-summary/clean")
def clean_rolling_summary(person_id: str = Query(...)):
    """WO-13 Phase 5: Apply the contamination filter to a narrator's
    rolling summary in place. Returns the drop report so operators can
    audit what was removed. Idempotent — running twice is a no-op.
    """
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")
    raw = read_rolling_summary(person_id)
    if not raw:
        return {
            "ok": True,
            "person_id": person_id,
            "noop": True,
            "detail": "no rolling summary on disk",
        }
    filtered = filter_rolling_summary_for_narrator(raw, person_id)
    # write_rolling_summary runs the filter again (idempotent), persists, and
    # stamps last_updated. We pass the already-filtered copy so the on-disk
    # wo13_filtered block reflects this cleaning pass.
    write_rolling_summary(person_id, filtered)
    return {
        "ok": True,
        "person_id": person_id,
        "wo13_filtered": filtered.get("wo13_filtered", {}),
    }


@router.post("/rolling-summary")
def save_rolling_summary(req: RollingSummaryRequest):
    """Save or update the rolling summary for a narrator."""
    if not req.person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")
    payload = {
        "topic_thread": req.topic_thread,
        "key_facts_mentioned": req.key_facts_mentioned[:50],
        "emotional_tone": req.emotional_tone,
        "last_question_asked": req.last_question_asked,
        "narrator_preferences": req.narrator_preferences[:20],
        "open_threads": req.open_threads[:10],
    }
    write_rolling_summary(req.person_id, payload)
    return {"ok": True}


# ── WO-10: Thread update ───────────────────────────────────────────────────

class ThreadUpdateRequest(BaseModel):
    person_id: str
    topic_label: str = ""
    subtopic: str = ""
    era: str = ""
    user_text: str = ""
    lori_text: str = ""


@router.post("/update-threads")
def update_threads(req: ThreadUpdateRequest):
    """WO-10: Update the multi-thread tracker for a narrator."""
    from ..archive import update_active_threads as _update_threads

    if not req.person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    threads = _update_threads(
        person_id=req.person_id,
        new_topic_label=req.topic_label,
        new_subtopic=req.subtopic,
        new_era=req.era,
        user_text=req.user_text,
        lori_text=req.lori_text,
    )
    return {"ok": True, "thread_count": len(threads), "threads": threads}


# ── WO-9: Recent archive turns (for resume prompt building) ───────────────

@router.get("/recent-turns")
def get_recent_turns(
    person_id: str = Query(...),
    session_id: str = Query(default=""),
    limit: int = Query(default=8, ge=1, le=50),
):
    """Load recent meaningful turns from archive for resume context."""
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")
    sid = session_id.strip() or None
    turns = load_recent_archive_turns(person_id, session_id=sid, limit=limit)
    return {"person_id": person_id, "turns": turns, "count": len(turns)}


# ── WO-10: Resume preview (for operator UI) ───────────────────────────────

@router.get("/resume-preview")
def get_resume_preview(person_id: str = Query(...)):
    """
    WO-10: Build a resume preview for operator inspection.
    Returns thread selection, confidence, scored summary, and recent turns.
    """
    from ..archive import (
        read_thread_anchor as _read_anchor,
        read_rolling_summary as _read_summary,
        load_recent_archive_turns as _load_turns,
        choose_best_thread as _choose_thread,
        score_resume_confidence as _score_conf,
        prune_rolling_summary as _prune_summary,
    )

    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sid = get_latest_session_id(person_id)
    anchor = _read_anchor(person_id=person_id, session_id=sid) if sid else None
    summary = _read_summary(person_id)
    # WO-13 Phase 5: run contamination filter before pruning so cross-narrator
    # bleed can never show up in a resume preview.
    summary = filter_rolling_summary_for_narrator(summary, person_id)
    summary = _prune_summary(summary)
    recent = _load_turns(person_id, session_id=sid, limit=6)
    threads = summary.get("active_threads", [])
    selected = _choose_thread(anchor, threads, recent)
    confidence = _score_conf(anchor, summary, recent, selected)

    return {
        "person_id": person_id,
        "session_id": sid or "",
        "selected_thread": selected,
        "all_threads": threads,
        "confidence": confidence,
        "scored_items": summary.get("scored_items", [])[:10],
        "recent_turns": recent[-4:],
        "anchor": anchor,
    }


# ── WO-10: Session timeline summary ───────────────────────────────────────

@router.get("/session-timeline")
def get_session_timeline(person_id: str = Query(...)):
    """
    WO-10: Return a compact timeline of all sessions with their dominant threads.
    """
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    sessions = archive_list_sessions(person_id)
    sessions.sort(key=lambda s: s.get("started_at", ""))
    timeline = []
    for sess in sessions:
        sid = sess.get("session_id", "")
        anchor = read_thread_anchor(person_id=person_id, session_id=sid)
        turns = read_transcript(person_id=person_id, session_id=sid)
        turn_count = len([t for t in turns if not (t.get("content") or "").startswith("[SYSTEM:")])
        timeline.append({
            "session_id": sid,
            "started_at": sess.get("started_at", ""),
            "title": sess.get("title", ""),
            "topic_label": anchor.get("topic_label", "") if anchor else "",
            "active_era": anchor.get("active_era", "") if anchor else "",
            "turn_count": turn_count,
        })

    return {"person_id": person_id, "sessions": timeline}
