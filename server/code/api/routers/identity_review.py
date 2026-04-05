from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import log_identity_change_proposal, approve_identity_change_proposal

router = APIRouter(prefix="/api/identity", tags=["identity-review"])


class ProposeChangeRequest(BaseModel):
    person_id: str
    field_path: str
    old_value: str = ""
    new_value: str = ""
    source: str = "chat_extraction"
    meta: Dict[str, Any] = Field(default_factory=dict)


class ProposeChangeResponse(BaseModel):
    ok: bool = True
    proposal_id: str
    person_id: str
    field_path: str
    old_value: str
    new_value: str
    source: str
    status: str = "proposed"
    created_at: str


@router.post("/propose-change", response_model=ProposeChangeResponse)
def propose_change_route(payload: ProposeChangeRequest) -> ProposeChangeResponse:
    if not payload.person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")
    if not payload.field_path.strip():
        raise HTTPException(status_code=400, detail="field_path is required")

    result = log_identity_change_proposal(
        person_id=payload.person_id,
        field_path=payload.field_path,
        old_value=payload.old_value,
        new_value=payload.new_value,
        source=payload.source,
        meta=payload.meta,
    )

    return ProposeChangeResponse(**result)


class ApproveChangeRequest(BaseModel):
    proposal_id: str
    accepted_by: str = "human"


class ApproveChangeResponse(BaseModel):
    ok: bool
    proposal_id: str = ""
    person_id: str = ""
    field_path: str = ""
    new_value: str = ""
    applied: bool = False
    accepted_by: str = ""
    resolved_at: str = ""
    error: str = ""


@router.post("/approve-change", response_model=ApproveChangeResponse)
def approve_change_route(payload: ApproveChangeRequest) -> ApproveChangeResponse:
    if not payload.proposal_id.strip():
        raise HTTPException(status_code=400, detail="proposal_id is required")

    result = approve_identity_change_proposal(
        proposal_id=payload.proposal_id,
        accepted_by=payload.accepted_by,
    )

    if not result.get("ok", False):
        raise HTTPException(status_code=404, detail=result.get("error", "unknown error"))

    return ApproveChangeResponse(**result)
