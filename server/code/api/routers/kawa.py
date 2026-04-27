"""
kawa.py — REST endpoints for Kawa River View
WO-KAWA-UI-01A

Endpoints:
  GET  /api/kawa/list     — list all segments for a narrator
  GET  /api/kawa/segment  — fetch one segment by ID
  POST /api/kawa/build    — build a new provisional segment from an anchor
  PUT  /api/kawa/segment  — save edits / confirm a segment
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import time

from ...kawa_store import (
    load_kawa_segment,
    save_kawa_segment,
    list_kawa_segments,
    append_kawa_history,
)
from ...kawa_projection import build_kawa_projection

router = APIRouter()


def _data_dir():
    return os.environ.get("DATA_DIR", "server/data")


# ── Request models ──────────────────────────────────────────────

class KawaBuildPayload(BaseModel):
    person_id: str
    anchor: dict


class KawaSavePayload(BaseModel):
    person_id: str
    segment_id: str
    anchor: dict
    kawa: dict
    narrator_note: Optional[str] = None
    narrator_quote: Optional[str] = None
    confirmed: bool = False
    session_id: Optional[str] = None


# ── WO-KAWA-02A: weighting metadata for memoir organization ────

def _compute_kawa_weight(kawa: dict, confirmed: bool) -> dict:
    """Compute narrative weighting metadata for a Kawa segment.
    Used by the frontend to prioritize chapters in river-informed memoir modes."""
    rocks = len((kawa or {}).get("rocks", []))
    driftwood = len((kawa or {}).get("driftwood", []))
    spaces = len((kawa or {}).get("spaces", []))
    flow = ((kawa or {}).get("water", {}) or {}).get("flow_state", "unknown")

    score = 0
    if confirmed:
        score += 2
    score += min(rocks, 2)
    score += min(spaces, 2)
    if flow in ("blocked", "constricted", "open", "strong"):
        score += 1

    narrative_weight = "low"
    if score >= 5:
        narrative_weight = "high"
    elif score >= 3:
        narrative_weight = "medium"

    dominant = []
    if rocks:
        dominant.append("rocks")
    if driftwood:
        dominant.append("driftwood")
    if spaces:
        dominant.append("spaces")
    if any((kawa or {}).get("banks", {}).values()):
        dominant.append("banks")
    if flow not in ("unknown", ""):
        dominant.append("water")

    return {
        "memoir_relevance": round(score / 7.0, 3),
        "kawa_dominant_constructs": dominant,
        "narrative_weight": narrative_weight,
        "questioning_priority": "medium" if confirmed else "low",
    }


# ── Endpoints ───────────────────────────────────────────────────

@router.get("/api/kawa/list")
def get_kawa_list(person_id: str):
    """List all Kawa segments for a narrator."""
    return {
        "person_id": person_id,
        "segments": list_kawa_segments(_data_dir(), person_id),
    }


@router.get("/api/kawa/segment")
def get_kawa_segment(person_id: str, segment_id: str):
    """Fetch a single Kawa segment."""
    seg = load_kawa_segment(_data_dir(), person_id, segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="segment not found")
    return {"person_id": person_id, "segment": seg}


@router.post("/api/kawa/build")
def post_kawa_build(payload: KawaBuildPayload):
    """Build a new provisional Kawa segment from an anchor point."""
    seg = build_kawa_projection(payload.person_id, payload.anchor)
    seg["integration"] = _compute_kawa_weight(seg.get("kawa", {}), False)
    prior = load_kawa_segment(_data_dir(), payload.person_id, seg["segment_id"])
    seg = append_kawa_history(seg, prior)
    save_kawa_segment(_data_dir(), payload.person_id, seg)
    return {"ok": True, "person_id": payload.person_id, "segment": seg}


@router.put("/api/kawa/segment")
def put_kawa_segment(payload: KawaSavePayload):
    """Save edits to a Kawa segment. Set confirmed=true to narrator-confirm."""
    prior = load_kawa_segment(_data_dir(), payload.person_id, payload.segment_id)
    seg = {
        "segment_id": payload.segment_id,
        "person_id": payload.person_id,
        "anchor": payload.anchor,
        "kawa": payload.kawa,
        "narrator_note": payload.narrator_note or "",
        "narrator_quote": payload.narrator_quote or "",
        "provenance": {
            "source": "user_confirmed" if payload.confirmed else "user_edited",
            "session_id": payload.session_id,
            "created_at": (prior or {}).get("provenance", {}).get("created_at", time.time()),
            "updated_at": time.time(),
            "confirmed": payload.confirmed,
            "confirmed_by": payload.person_id if payload.confirmed else None,
        },
        "history": (prior or {}).get("history", []),
    }
    seg["integration"] = _compute_kawa_weight(seg["kawa"], payload.confirmed)
    seg = append_kawa_history(seg, prior)
    save_kawa_segment(_data_dir(), payload.person_id, seg)
    return {"ok": True, "person_id": payload.person_id, "segment": seg}
