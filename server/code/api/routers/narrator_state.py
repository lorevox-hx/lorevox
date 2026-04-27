from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import get_narrator_state_snapshot

router = APIRouter(prefix="/api/narrator", tags=["narrator-state"])


class NarratorStateSnapshotResponse(BaseModel):
    ok: bool = True
    person_id: str
    person: Dict[str, Any] = Field(default_factory=dict)
    profile: Dict[str, Any] = Field(default_factory=dict)
    questionnaire: Dict[str, Any] = Field(default_factory=dict)
    projection: Dict[str, Any] = Field(default_factory=dict)
    protected_identity: Dict[str, Any] = Field(default_factory=dict)
    # WO-13: prior user-authored turn count — used by UI to gate the
    # session-resume prompt. 0 means "do not fire a welcome-back greeting".
    user_turn_count: int = 0
    updated_at: str


@router.get("/state-snapshot", response_model=NarratorStateSnapshotResponse)
def get_state_snapshot_route(
    person_id: str = Query(..., description="Lorevox narrator/person id"),
) -> NarratorStateSnapshotResponse:
    if not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    data = get_narrator_state_snapshot(person_id)
    if not data:
        raise HTTPException(status_code=404, detail="Narrator not found")

    return NarratorStateSnapshotResponse(
        person_id=data["person_id"],
        person=data.get("person", {}),
        profile=data.get("profile", {}),
        questionnaire=data.get("questionnaire", {}),
        projection=data.get("projection", {}),
        protected_identity=data.get("protected_identity", {}),
        user_turn_count=int(data.get("user_turn_count") or 0),
        updated_at=data.get("updated_at") or datetime.utcnow().isoformat(),
    )
