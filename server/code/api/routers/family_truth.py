"""
Lorevox — Family Truth Router  (WO-13 Phase 2)
=================================================

Implements the four-layer truth architecture:

  Shadow Archive  →  Proposal Layer  →  Human Review  →  Promoted Truth

Tables (created in db.init_db by Phase 1):
  - family_truth_notes : append-only raw shadow archive (freeform body text).
  - family_truth_rows  : structured proposals. Promoted truth is the subset
                         with status in ('approve','approve_q').

Endpoints:
  POST  /api/family-truth/note                  — append a shadow note
  GET   /api/family-truth/notes?person_id=…     — list notes for a person
  POST  /api/family-truth/note/{note_id}/propose— derive structured rows from a note
  GET   /api/family-truth/rows?person_id=…      — list rows (filter by status/subject/field)
  PATCH /api/family-truth/row/{row_id}          — reviewer patch (status/value/qualification)
  POST  /api/family-truth/promote               — promote a row to approve/approve_q
  GET   /api/family-truth/audit/{row_id}        — audit view (provenance + snapshot)

Design rules enforced here:
  - This router is the ONLY sanctioned write path for narrative memory.
  - The legacy /api/facts/* endpoints remain for back-compat reads only.
  - Reference-narrator write guards are enforced in Phase 3 (people.py);
    Phase 2 endpoints assume the caller has already checked narrator_type.
  - `promote` in Phase 2 is a status-flip stub. Full UPSERT-into-promoted-
    truth semantics (keyed by person_id+subject_name+field) land in Phase 7.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .. import db

router = APIRouter(prefix="/api/family-truth", tags=["family-truth"])


# -----------------------------------------------------------------------------
# Constants (mirrored from db.py for request-validation messages)
# -----------------------------------------------------------------------------
ROW_STATUSES = db.FT_ROW_STATUSES  # approve | approve_q | needs_verify | source_only | reject
EXTRACTION_METHODS = db.FT_EXTRACTION_METHODS

NOTE_SOURCE_KINDS = ("chat", "questionnaire", "import", "manual", "extraction")


# -----------------------------------------------------------------------------
# Request / response models
# -----------------------------------------------------------------------------
class NoteAddRequest(BaseModel):
    person_id: str
    body: str = Field(..., description="Raw narrative claim as originally stated")
    source_kind: str = Field(default="chat", description=f"One of: {', '.join(NOTE_SOURCE_KINDS)}")
    source_ref: str = Field(default="", description="Provenance reference (session_id, turn_idx, file path, …)")
    created_by: str = Field(default="system", description="user id, 'system', or extractor tag")


class ProposalItem(BaseModel):
    subject_name: str = Field(default="", description="Person the claim is about; defaults to narrator (self)")
    relationship: str = Field(default="self", description="self | father | mother | spouse | child | sibling | …")
    field: str = Field(..., description="e.g. date_of_birth, place_of_birth, full_name, employment, residence")
    source_says: str = Field(..., description="Raw claim text preserved from the source")
    approved_value: str = Field(default="", description="Reviewer-approved canonical value (empty at proposal time)")
    qualification: str = Field(default="", description="Qualifier text if status == approve_q")
    status: str = Field(default="needs_verify", description=f"One of: {', '.join(ROW_STATUSES)}")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    narrative_role: str = Field(default="")
    meaning_tags: List[str] = Field(default_factory=list)
    provenance: Dict[str, Any] = Field(default_factory=dict)
    extraction_method: str = Field(default="manual", description=f"One of: {', '.join(EXTRACTION_METHODS)}")


class ProposalRequest(BaseModel):
    items: List[ProposalItem] = Field(..., description="One or more structured proposals derived from the note")


class RowPatchRequest(BaseModel):
    status: Optional[str] = Field(default=None, description=f"One of: {', '.join(ROW_STATUSES)}")
    approved_value: Optional[str] = None
    qualification: Optional[str] = None
    reviewer: Optional[str] = None
    subject_name: Optional[str] = None
    relationship: Optional[str] = None


class PromoteRequest(BaseModel):
    """WO-13 Phase 7 — promote request.

    Accepts either `row_id` (single-row promotion) OR `person_id` (bulk
    promote every row currently in approve / approve_q). The Phase 6
    review drawer sends `{person_id}`; manual promotion flows from test
    harnesses or power-user tools send `{row_id}`.
    """
    row_id: Optional[str] = Field(default=None, description="Single row promotion")
    person_id: Optional[str] = Field(default=None, description="Bulk promote-all-approved")
    reviewer: str = Field(default="")
    qualification: str = Field(default="", description="If non-empty, row is promoted as approve_q (single-row path only)")


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _require_person(person_id: str) -> Dict[str, Any]:
    person = db.get_person(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="person_id not found")
    return person


def _block_if_reference(person_id: str, action: str) -> None:
    """WO-13 Phase 3 write guard.

    Reference narrators (Shatner, Dolly, …) are read-only from the narrative
    memory pipeline. Any attempt to add shadow notes, propose rows, patch a
    row, or promote a row for a reference-narrator person_id is rejected
    with 403.
    """
    if db.is_reference_narrator(person_id):
        person = db.get_person(person_id) or {}
        raise HTTPException(
            status_code=403,
            detail=(
                f"'{person.get('display_name', person_id)}' is a reference narrator "
                f"(narrator_type='reference'); {action} is not permitted. "
                "Reference narrators are seeded from the profile layer and are "
                "read-only in the family-truth pipeline."
            ),
        )


def _validate_status(status: Optional[str]) -> None:
    if status is None:
        return
    if status not in ROW_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"status must be one of: {', '.join(ROW_STATUSES)}",
        )


def _validate_source_kind(source_kind: str) -> None:
    if source_kind not in NOTE_SOURCE_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"source_kind must be one of: {', '.join(NOTE_SOURCE_KINDS)}",
        )


def _validate_extraction_method(method: str) -> None:
    if method not in EXTRACTION_METHODS:
        raise HTTPException(
            status_code=422,
            detail=f"extraction_method must be one of: {', '.join(EXTRACTION_METHODS)}",
        )


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@router.post("/note")
def api_add_note(req: NoteAddRequest):
    """Append a raw note to the shadow archive. Notes are never promoted directly."""
    _require_person(req.person_id)
    _block_if_reference(req.person_id, "shadow note creation")
    _validate_source_kind(req.source_kind)
    note = db.ft_add_note(
        person_id=req.person_id,
        body=req.body,
        source_kind=req.source_kind,
        source_ref=req.source_ref,
        created_by=req.created_by,
    )
    return {"ok": True, "note": note}


@router.get("/notes")
def api_list_notes(
    person_id: str,
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
):
    _require_person(person_id)
    notes = db.ft_list_notes(person_id=person_id, limit=limit, offset=offset)
    return {"notes": notes, "count": len(notes)}


@router.post("/note/{note_id}/propose")
def api_propose_from_note(note_id: str, req: ProposalRequest):
    """Convert a shadow note into one or more structured proposal rows.

    Every resulting row is written with status='needs_verify' unless the
    caller supplies a different valid status. `approve` / `approve_q` are
    rejected here — approval only happens through PATCH or /promote.
    """
    note = db.ft_get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="note_id not found")
    if not req.items:
        raise HTTPException(status_code=422, detail="at least one proposal item is required")

    person_id = note["person_id"]
    _block_if_reference(person_id, "proposal creation")
    created_rows: List[Dict[str, Any]] = []
    for item in req.items:
        _validate_status(item.status)
        _validate_extraction_method(item.extraction_method)
        if item.status in ("approve", "approve_q"):
            raise HTTPException(
                status_code=422,
                detail="approve/approve_q may only be set via PATCH /row/{id} or POST /promote",
            )
        row = db.ft_add_row(
            person_id=person_id,
            field=item.field,
            source_says=item.source_says,
            note_id=note_id,
            subject_name=item.subject_name,
            relationship=item.relationship,
            status=item.status,
            approved_value=item.approved_value,
            qualification=item.qualification,
            confidence=item.confidence,
            narrative_role=item.narrative_role,
            meaning_tags=item.meaning_tags,
            provenance=item.provenance,
            extraction_method=item.extraction_method,
        )
        created_rows.append(row)
    return {"ok": True, "count": len(created_rows), "rows": created_rows}


@router.get("/rows")
def api_list_rows(
    person_id: str,
    status: Optional[str] = Query(
        default=None,
        description="Comma-separated subset of: " + ", ".join(ROW_STATUSES),
    ),
    include_suspect: bool = Query(default=True),
    subject_name: Optional[str] = None,
    field: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    _require_person(person_id)
    if status:
        for s in (x.strip() for x in status.split(",") if x.strip()):
            _validate_status(s)
    rows = db.ft_list_rows(
        person_id=person_id,
        status=status,
        include_suspect=include_suspect,
        subject_name=subject_name,
        field=field,
        limit=limit,
        offset=offset,
    )
    return {"rows": rows, "count": len(rows)}


@router.patch("/row/{row_id}")
def api_patch_row(row_id: str, req: RowPatchRequest):
    _validate_status(req.status)
    current = db.ft_get_row(row_id)
    if current:
        _block_if_reference(current["person_id"], "row mutation")
    try:
        updated = db.ft_update_row(
            row_id=row_id,
            status=req.status,
            approved_value=req.approved_value,
            qualification=req.qualification,
            reviewer=req.reviewer,
            subject_name=req.subject_name,
            relationship=req.relationship,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not updated:
        raise HTTPException(status_code=404, detail="row_id not found")
    return {"ok": True, "row": updated}


@router.post("/promote")
def api_promote_row(req: PromoteRequest):
    """WO-13 Phase 7 — real promotion with UPSERT semantics.

    Two modes:
      • `row_id`      — single-row promotion. Flips the source row status
                        and UPSERTs into family_truth_promoted keyed by
                        (person_id, subject_name, field).
      • `person_id`   — bulk promote every row already in approve/approve_q.
                        Drives the Phase 6 review drawer's 'Promote approved'
                        button. Idempotent: re-running produces op='noop'
                        for every already-promoted row.

    Protected identity fields originating from rules_fallback are refused
    by the UPSERT with op='blocked'. The source row's status still flips
    (a reviewer DID approve it) but no promoted-truth record is written.
    """
    if not req.row_id and not req.person_id:
        raise HTTPException(
            status_code=422,
            detail="Either row_id or person_id is required",
        )

    # Bulk-promote path (Phase 6 UI uses this)
    if req.person_id and not req.row_id:
        _require_person(req.person_id)
        _block_if_reference(req.person_id, "bulk promotion")
        try:
            summary = db.ft_promote_all_approved(
                person_id=req.person_id,
                reviewer=req.reviewer,
            )
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        return {"ok": True, "mode": "bulk", "summary": summary}

    # Single-row path
    current = db.ft_get_row(req.row_id)
    if not current:
        raise HTTPException(status_code=404, detail="row_id not found")
    _block_if_reference(current["person_id"], "promotion")
    try:
        result = db.ft_promote_row(
            row_id=req.row_id,
            reviewer=req.reviewer,
            qualification=req.qualification,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {
        "ok": True,
        "mode": "single",
        "row": result["row"],
        "promoted": result["promoted"],
    }


@router.get("/promoted")
def api_list_promoted(
    person_id: str,
    subject_name: Optional[str] = None,
    field: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    """List promoted-truth records for a person (WO-13 Phase 7).

    Read-only endpoint. The authoritative truth layer that Phase 8
    consumers (profile, structuredBio, timeline, memoir, exports, chat
    context) will read from once LOREVOX_TRUTH_V2 is flipped on.
    """
    _require_person(person_id)
    rows = db.ft_list_promoted(
        person_id=person_id,
        subject_name=subject_name,
        field=field,
        limit=limit,
        offset=offset,
    )
    return {"person_id": person_id, "promoted": rows, "count": len(rows)}


@router.get("/audit/{row_id}")
def api_row_audit(row_id: str):
    audit = db.ft_row_audit(row_id)
    if not audit:
        raise HTTPException(status_code=404, detail="row_id not found")
    return {"ok": True, "audit": audit}


# -----------------------------------------------------------------------------
# WO-13 Phase 8 — backfill endpoint
# -----------------------------------------------------------------------------
class BackfillRequest(BaseModel):
    person_id: str = Field(..., description="Live narrator whose profile_json should be backfilled")


@router.post("/backfill")
def api_backfill(req: BackfillRequest):
    """Seed shadow notes + needs_verify proposal rows from an existing
    profile_json blob. No auto-promotion.

    Used once per live narrator before flipping LOREVOX_TRUTH_V2_PROFILE
    on, so the reviewer has something to approve in the Phase 6 drawer.
    Idempotent — re-running on a partially reviewed narrator does not
    create duplicates.
    """
    _require_person(req.person_id)
    _block_if_reference(req.person_id, "backfill from profile_json")
    result = db.ft_backfill_from_profile_json(req.person_id)
    return {"ok": True, **result}
