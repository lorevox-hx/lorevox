"""
Lorevox Affect Router — v6.1 Track B
======================================
Browser sends derived affect events.
Backend stores, smooths, and serves rolling affect context.

Endpoint:
  POST /api/interview/affect-event   — receive event from browser
  GET  /api/interview/affect-context — poll current rolling context for a session
  GET  /api/interview/affect-events  — list stored events for a session

Design:
  - Only stores derived affect_state (never raw emotions, never landmarks)
  - Stateless from browser's perspective: send and forget
  - Backend maintains rolling state in memory + persists to DB for audit
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from .. import db
from ..affect_service import (
    AffectEvent,
    AffectContext,
    VALID_AFFECT_STATES,
    get_manager,
    build_affect_prompt_block,
    get_adaptive_guidance,
)

router = APIRouter(prefix="/api/interview", tags=["affect"])


# ─── Request / Response Models ────────────────────────────────────────────────

class AffectEventRequest(BaseModel):
    session_id: str
    timestamp: float
    section_id: Optional[str] = None
    affect_state: str
    confidence: float
    duration_ms: int
    source: str = "camera"

    @field_validator("affect_state")
    @classmethod
    def validate_state(cls, v: str) -> str:
        if v not in VALID_AFFECT_STATES:
            raise ValueError(f"affect_state must be one of {sorted(VALID_AFFECT_STATES)}")
        return v

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("confidence must be between 0.0 and 1.0")
        return round(v, 4)


class AffectEventResponse(BaseModel):
    accepted: bool
    session_id: str
    current_state: str
    current_intensity: float


class AffectContextResponse(BaseModel):
    session_id: str
    context: AffectContext
    recent_events: list
    guidance: str          # adaptive guidance note for internal use
    prompt_block: str      # ready-to-inject LLM prompt block


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/affect-event", response_model=AffectEventResponse)
def post_affect_event(req: AffectEventRequest) -> AffectEventResponse:
    """
    Receive an affect event from the browser.
    The browser has already done: MediaPipe → geometry rules → affect_state mapping.
    We only accept the derived affect_state — not raw emotions, not landmarks.
    """
    db.init_db()

    # Verify session exists
    sess = db.get_interview_session(req.session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    # Build domain object
    event = AffectEvent(
        session_id=req.session_id,
        timestamp=req.timestamp,
        section_id=req.section_id,
        affect_state=req.affect_state,
        confidence=req.confidence,
        duration_ms=req.duration_ms,
        source=req.source,
    )

    # Feed into rolling state manager
    manager = get_manager()
    accepted = manager.ingest(event)

    # Persist to DB (always, even if rolling manager filtered it)
    db.save_affect_event(
        session_id=req.session_id,
        timestamp=req.timestamp,
        section_id=req.section_id,
        affect_state=req.affect_state,
        confidence=req.confidence,
        duration_ms=req.duration_ms,
        source=req.source,
    )

    # Return current rolling state
    ctx = manager.get_context(req.session_id)
    return AffectEventResponse(
        accepted=accepted,
        session_id=req.session_id,
        current_state=ctx.state,
        current_intensity=ctx.intensity,
    )


@router.get("/affect-context", response_model=AffectContextResponse)
def get_affect_context(session_id: str) -> AffectContextResponse:
    """
    Return the current rolling affect context for a session.
    The interview engine calls this to get the current state before each LLM turn.
    """
    db.init_db()

    sess = db.get_interview_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    manager = get_manager()
    ctx = manager.get_context(session_id)
    recent = manager.get_recent_events(session_id)
    guidance = get_adaptive_guidance(ctx)
    prompt_block = build_affect_prompt_block(ctx, recent)

    return AffectContextResponse(
        session_id=session_id,
        context=ctx,
        recent_events=[e.model_dump() for e in recent],
        guidance=guidance,
        prompt_block=prompt_block,
    )


@router.get("/affect-events")
def list_affect_events(session_id: str, limit: int = 50):
    """
    Return stored affect events for a session (for timeline arc / review).
    """
    db.init_db()

    sess = db.get_interview_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    events = db.list_affect_events(session_id=session_id, limit=limit)
    return {"session_id": session_id, "events": events}


@router.delete("/affect-context/{session_id}")
def clear_affect_context(session_id: str):
    """Clear in-memory rolling state for a session (e.g. on session close)."""
    manager = get_manager()
    manager.clear_session(session_id)
    return {"cleared": True, "session_id": session_id}
