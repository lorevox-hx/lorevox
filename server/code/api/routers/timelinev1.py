from __future__ import annotations

"""Timeline Router — LoreVox v4.2

Dedicated storage for dated events ("hard facts").

This is intentionally minimal for the MVP.
"""

from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import add_timeline_event, list_timeline_events, get_person

router = APIRouter(prefix="/api/timeline", tags=["timeline"])


class TimelineCreate(BaseModel):
    person_id: str
    event_date: str  # YYYY-MM-DD
    title: str
    description: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("/event")
def create_event(body: TimelineCreate):
    if not get_person(body.person_id):
        raise HTTPException(status_code=404, detail="person not found")
    event_id = add_timeline_event(
        person_id=body.person_id,
        event_date=body.event_date,
        title=body.title,
        description=body.description,
        location_name=body.location_name,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    return {"event_id": event_id}


@router.get("/{person_id}")
def list_events(person_id: str, limit: int = 200, offset: int = 0):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")
    rows = list_timeline_events(person_id, limit=limit, offset=offset)
    return {"person_id": person_id, "events": rows}
