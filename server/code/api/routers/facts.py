"""
Lorevox Facts Router
====================
Manages atomic, source-backed facts extracted from interview transcripts.

Endpoints:
  POST   /api/facts/add         — manually add a fact
  GET    /api/facts/list         — list facts for a person
  PATCH  /api/facts/status       — update a fact's status (reviewed/rejected/etc.)
  DELETE /api/facts/delete       — delete a fact

Design rules enforced here:
  - Facts are atomic: one claim per record.
  - Every fact links to a source session_id when available.
  - Facts are never auto-merged into compound statements.
  - Status transitions: extracted → reviewed | rejected | needs_review
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..flags import truth_v2_enabled


def _truth_v2_enabled() -> bool:
    """WO-13 Phase 4 — feature-flag check for truth-v2 write freeze.

    When LOREVOX_TRUTH_V2 is truthy, the legacy /api/facts/add write path is
    frozen and returns 410 Gone. Reads on /api/facts/list and status/delete
    operations remain available for back-compat during the transition.

    WO-13 Phase 8 — this wrapper now delegates to the shared
    ``flags.truth_v2_enabled('facts_write')`` helper so every router
    reads the same env vars. Behaviour unchanged.
    """
    return truth_v2_enabled("facts_write")

router = APIRouter(prefix="/api/facts", tags=["facts"])


FACT_TYPES = (
    "general", "birth", "death", "marriage", "divorce", "move",
    "employment_start", "employment_end", "education", "medical",
    "family_relationship", "travel", "residence", "hobby", "other",
)

STATUS_VALUES = ("extracted", "reviewed", "rejected", "needs_review", "inferred")


class FactAddRequest(BaseModel):
    person_id: str
    statement: str = Field(..., description="Single atomic claim, e.g. 'Moved to Santa Fe in 1989'")
    fact_type: str = Field(default="general", description=f"One of: {', '.join(FACT_TYPES)}")
    date_text: str = Field(default="", description="Date as stated, e.g. 'around 1989', 'summer 1978'")
    date_normalized: str = Field(default="", description="Normalized form, e.g. '1989', '1978-06'")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    status: str = Field(default="extracted", description=f"One of: {', '.join(STATUS_VALUES)}")
    inferred: bool = False
    session_id: Optional[str] = None
    source_turn_index: Optional[int] = None
    meta: Dict[str, Any] = Field(default_factory=dict)
    # Meaning Engine fields (Bug MAT-01 fix — these were sent but not persisted before)
    meaning_tags: List[str] = Field(default_factory=list, description="Semantic tags: stakes, vulnerability, turning_point, identity, loss, belonging")
    narrative_role: Optional[str] = Field(default=None, description="Narrative arc role: setup | inciting | escalation | climax | resolution | reflection")
    experience: Optional[str] = Field(default=None, description="Experiential voice (you then) — raw in-the-moment memory text")
    reflection: Optional[str] = Field(default=None, description="Reflective voice (you now) — meaning-making, retrospective text")


class FactStatusUpdateRequest(BaseModel):
    fact_id: str
    status: str = Field(..., description=f"One of: {', '.join(STATUS_VALUES)}")


@router.post("/add")
def api_add_fact(req: FactAddRequest):
    # WO-13 Phase 4 — legacy write freeze behind LOREVOX_TRUTH_V2.
    # When the flag is on, /api/facts/add is retired. Callers must use the
    # /api/family-truth/note + /propose pipeline instead. 410 Gone makes the
    # retirement explicit and breaks any stale client that hasn't been
    # updated, rather than silently contaminating the proposal layer.
    if _truth_v2_enabled():
        raise HTTPException(
            status_code=410,
            detail=(
                "facts.add is retired under LOREVOX_TRUTH_V2. Use "
                "POST /api/family-truth/note followed by "
                "POST /api/family-truth/note/{note_id}/propose instead."
            ),
        )

    person = db.get_person(req.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="person_id not found")

    # WO-13 Phase 3 — reference-narrator write guard.
    # Reference narrators (Shatner, Dolly, …) are read-only on the legacy
    # facts table as well. The front-end fact-extraction path is also being
    # retired in Phase 4, but this guard provides defence in depth.
    if db.is_reference_narrator(req.person_id):
        raise HTTPException(
            status_code=403,
            detail=(
                f"'{person.get('display_name', req.person_id)}' is a reference narrator; "
                "facts.add is not permitted. Reference narrators are read-only."
            ),
        )

    if req.status not in STATUS_VALUES:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of: {', '.join(STATUS_VALUES)}",
        )

    fact = db.add_fact(
        person_id=req.person_id,
        statement=req.statement,
        fact_type=req.fact_type,
        date_text=req.date_text,
        date_normalized=req.date_normalized,
        confidence=req.confidence,
        status=req.status,
        inferred=req.inferred,
        session_id=req.session_id,
        source_turn_index=req.source_turn_index,
        meta=req.meta,
        # Meaning Engine fields (Bug MAT-01)
        meaning_tags=req.meaning_tags or [],
        narrative_role=req.narrative_role,
        experience=req.experience,
        reflection=req.reflection,
    )
    return {"ok": True, "fact": fact}


@router.get("/list")
def api_list_facts(
    person_id: str,
    status: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
):
    if not db.get_person(person_id):
        raise HTTPException(status_code=404, detail="person_id not found")
    facts = db.list_facts(person_id=person_id, status=status, limit=limit, offset=offset)
    return {"facts": facts, "count": len(facts)}


@router.patch("/status")
def api_update_status(req: FactStatusUpdateRequest):
    if req.status not in STATUS_VALUES:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of: {', '.join(STATUS_VALUES)}",
        )
    ok = db.update_fact_status(req.fact_id, req.status)
    if not ok:
        raise HTTPException(status_code=404, detail="Fact not found")
    return {"ok": True}


@router.delete("/delete")
def api_delete_fact(id: str):
    ok = db.delete_fact(id)
    if not ok:
        raise HTTPException(status_code=404, detail="Fact not found")
    return {"ok": True}
