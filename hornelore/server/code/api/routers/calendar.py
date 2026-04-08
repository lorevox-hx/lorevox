"""
Lorevox Calendar & Life Phases Router
======================================
Endpoints:
  POST   /api/calendar/event/add      — add a rich calendar event
  GET    /api/calendar/events          — list calendar events for a person
  GET    /api/calendar/phases          — list life phases for a person
  POST   /api/calendar/phase/add       — add a life phase
  DELETE /api/calendar/event           — delete a calendar event
  DELETE /api/calendar/phase           — delete a life phase

Design rules enforced:
  - No two facts are automatically merged into one calendar event.
  - Approximate dates remain approximate (date_precision field preserved).
  - Every event records which source sessions / facts it came from.
  - Life phases are separate from point events and date ranges.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

DATE_PRECISION_VALUES = (
    "exact_day", "month", "year", "approx_year",
    "season", "range", "decade", "unknown",
)

EVENT_KIND_VALUES = (
    "event", "milestone", "birth", "death", "marriage", "divorce",
    "move", "employment_start", "employment_end", "graduation",
    "medical", "travel", "family", "other",
)


class CalendarEventAddRequest(BaseModel):
    person_id: str
    title: str
    start_date: str = Field(..., description="ISO date string or year, e.g. '1989' or '1989-09-01'")
    end_date: str = Field(default="", description="End date for range events")
    date_precision: str = Field(
        default="exact_day",
        description=f"One of: {', '.join(DATE_PRECISION_VALUES)}",
    )
    display_date: str = Field(default="", description="Human-friendly label, e.g. 'around 1989'")
    body: str = Field(default="", description="Optional longer description")
    kind: str = Field(default="event", description=f"One of: {', '.join(EVENT_KIND_VALUES)}")
    is_approximate: bool = False
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    status: str = Field(default="reviewed", description="reviewed | needs_review | rejected")
    source_session_ids: List[str] = Field(default_factory=list)
    source_fact_ids: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    phase_id: str = Field(default="", description="Optional life phase this event belongs to")
    meta: Dict[str, Any] = Field(default_factory=dict)


class LifePhaseAddRequest(BaseModel):
    person_id: str
    title: str
    start_date: str = ""
    end_date: str = ""
    date_precision: str = "year"
    description: str = ""
    ord: int = 0
    meta: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Calendar event endpoints
# ---------------------------------------------------------------------------

@router.post("/event/add")
def api_add_event(req: CalendarEventAddRequest):
    if not db.get_person(req.person_id):
        raise HTTPException(status_code=404, detail="person_id not found")

    if req.date_precision not in DATE_PRECISION_VALUES:
        raise HTTPException(
            status_code=422,
            detail=f"date_precision must be one of: {', '.join(DATE_PRECISION_VALUES)}",
        )

    event = db.add_calendar_event(
        person_id=req.person_id,
        title=req.title,
        start_date=req.start_date,
        end_date=req.end_date,
        date_precision=req.date_precision,
        display_date=req.display_date or req.start_date,
        body=req.body,
        kind=req.kind,
        is_approximate=req.is_approximate,
        confidence=req.confidence,
        status=req.status,
        source_session_ids=req.source_session_ids,
        source_fact_ids=req.source_fact_ids,
        tags=req.tags,
        phase_id=req.phase_id,
        meta=req.meta,
    )
    return {"ok": True, "event": event}


@router.get("/events")
def api_list_events(person_id: str, limit: int = 500, offset: int = 0):
    if not db.get_person(person_id):
        raise HTTPException(status_code=404, detail="person_id not found")
    items = db.list_calendar_events(person_id=person_id, limit=limit, offset=offset)
    return {"items": items, "count": len(items)}


@router.delete("/event")
def api_delete_event(id: str):
    ok = db.delete_timeline_event(id)
    if not ok:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Life phase endpoints
# ---------------------------------------------------------------------------

@router.post("/phase/add")
def api_add_phase(req: LifePhaseAddRequest):
    if not db.get_person(req.person_id):
        raise HTTPException(status_code=404, detail="person_id not found")
    phase = db.add_life_phase(
        person_id=req.person_id,
        title=req.title,
        start_date=req.start_date,
        end_date=req.end_date,
        date_precision=req.date_precision,
        description=req.description,
        ord=req.ord,
        meta=req.meta,
    )
    return {"ok": True, "phase": phase}


@router.get("/phases")
def api_list_phases(person_id: str):
    if not db.get_person(person_id):
        raise HTTPException(status_code=404, detail="person_id not found")
    phases = db.list_life_phases(person_id=person_id)
    return {"phases": phases, "count": len(phases)}


@router.delete("/phase")
def api_delete_phase(id: str):
    ok = db.delete_life_phase(id)
    if not ok:
        raise HTTPException(status_code=404, detail="Phase not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Combined calendar view (events + phases together for UI rendering)
# ---------------------------------------------------------------------------

@router.get("/view")
def api_calendar_view(person_id: str):
    """
    Returns events and life phases together in one call.
    The UI can render these as a unified timeline calendar.
    """
    if not db.get_person(person_id):
        raise HTTPException(status_code=404, detail="person_id not found")

    events = db.list_calendar_events(person_id=person_id)
    phases = db.list_life_phases(person_id=person_id)

    return {
        "person_id": person_id,
        "events": events,
        "phases": phases,
        "event_count": len(events),
        "phase_count": len(phases),
    }
