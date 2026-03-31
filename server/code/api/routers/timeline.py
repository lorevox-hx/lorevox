from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import get_person, add_timeline_event, list_timeline_events, delete_timeline_event

router = APIRouter(prefix="/api/timeline", tags=["timeline"])


class TimelineAddRequest(BaseModel):
    person_id: str = Field(..., description="Owner of the timeline event")
    ts: str = Field(..., description="ISO timestamp (event date/time)")
    title: str = Field(..., description="Short title")
    description: str = Field(default="", description="Longer description")
    kind: str = Field(default="event", description="event/milestone/move/job/etc")
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    media_ids: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


@router.post("/add")
def api_add(req: TimelineAddRequest):
    if not get_person(req.person_id):
        raise HTTPException(status_code=404, detail="person_id not found")
    eid = add_timeline_event(
        person_id=req.person_id,
        date=req.ts,
        title=req.title,
        body=req.description,
        kind=req.kind,
        meta=req.meta,
    )
    event_id = eid["id"] if isinstance(eid, dict) else eid
    return {"ok": True, "id": event_id, "event": eid}


@router.get("/list")
def api_list(person_id: str, limit: int = 200, offset: int = 0):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person_id not found")
    items = list_timeline_events(person_id=person_id, limit=limit, offset=offset)
    return {"items": items}


@router.delete("/delete")
def api_delete(id: str):
    delete_timeline_event(id)
    return {"ok": True}
