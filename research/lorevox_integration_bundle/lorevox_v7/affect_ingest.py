from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from lorevox_v7.session_store import SessionStore
from lorevox_v7.websocket_events import FatigueStatusEvent, to_payload
from lorevox_v7.narrative_engine import NarrativeTracker


class AffectUpdateRequest(BaseModel):
    session_id: str
    affect_state: str = Field(description="steady, engaged, moved, distressed, overwhelmed")
    confidence: Optional[float] = None
    source: str = "track_b"


def build_affect_router(session_store: SessionStore):
    router = APIRouter()

    @router.post("/api/chat/affect")
    async def ingest_affect(update: AffectUpdateRequest):
        vitals = await session_store.update_affect(update.session_id, update.affect_state)
        if vitals is None:
            raise HTTPException(status_code=404, detail="Unknown session_id")

        event = FatigueStatusEvent(
            session_id=update.session_id,
            fatigue_score=NarrativeTracker.calculate_fatigue(vitals),
            distress_score=NarrativeTracker.calculate_distress(vitals),
            momentum_score=NarrativeTracker.calculate_momentum(vitals),
            affect_state=vitals.last_affect_state,
        )
        return {"ok": True, "event": to_payload(event)}

    return router
