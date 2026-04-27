from __future__ import annotations

"""Profiles Router — LoreVox v4.2

A Profile is a JSON document attached to a Person.

- It mirrors your basic-info.html 1:1 (so you can ingest the whole form without
  rigid SQL migrations).
- It can also store "draft" narrative, extra notes, etc.
- v4.2 keeps an immutable answers log separately (answers table).

Endpoints
- GET  /api/profiles/{person_id}
- PUT  /api/profiles/{person_id}  (replace JSON doc)
- PATCH /api/profiles/{person_id} (merge-update JSON doc)
- POST /api/profiles/{person_id}/ingest_basic_info (convenience: accept form-shaped JSON)
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..db import (
    ensure_profile,
    get_person,
    get_profile,
    ingest_basic_info_document,
    update_profile_json,
)
from ..flags import truth_v2_enabled

logger = logging.getLogger("profiles")

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


class ProfilePut(BaseModel):
    profile: Dict[str, Any] = Field(default_factory=dict)


class ProfilePatch(BaseModel):
    patch: Dict[str, Any] = Field(default_factory=dict)


@router.get("/{person_id}")
def api_get_profile(person_id: str):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")
    ensure_profile(person_id)
    row = get_profile(person_id)
    legacy_profile = row["profile_json"]

    # WO-13 Phase 8 — flag-gated read from promoted truth.
    #
    # When LOREVOX_TRUTH_V2_PROFILE is on, the profile is assembled
    # from family_truth_promoted by db.build_profile_from_promoted.
    # It falls back to the legacy blob (a) when the flag is off, (b)
    # when the narrator has zero promoted rows (empty-promoted fallback
    # inside the builder), or (c) when the builder throws unexpectedly
    # — the endpoint stays up and the narrator sees their legacy data
    # instead of a 500.
    flag_on = truth_v2_enabled("profile")
    source = "legacy"
    profile_obj: Dict[str, Any] = legacy_profile
    if flag_on:
        try:
            profile_obj = db.build_profile_from_promoted(person_id)
            source = "promoted_truth"
        except Exception as exc:  # defensive — never 500 a narrator load
            logger.warning(
                "build_profile_from_promoted failed for %s, falling back to legacy: %s",
                person_id, exc,
            )
            profile_obj = legacy_profile
            source = "legacy_fallback"

    return {
        "person_id": person_id,
        "profile": profile_obj,
        "updated_at": row["updated_at"],
        "source": source,
    }


@router.put("/{person_id}")
def api_put_profile(person_id: str, body: ProfilePut):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")
    ensure_profile(person_id)
    update_profile_json(person_id, body.profile, reason="PUT /api/profiles")
    return api_get_profile(person_id)


@router.patch("/{person_id}")
def api_patch_profile(person_id: str, body: ProfilePatch):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")
    ensure_profile(person_id)
    update_profile_json(person_id, body.patch, merge=True, reason="PATCH /api/profiles")
    return api_get_profile(person_id)


class BasicInfoIngest(BaseModel):
    document: Dict[str, Any] = Field(..., description="JSON shaped like your basic-info.html form")
    create_relatives: bool = Field(default=False, description="If true, create People + Relationships for relatives")


@router.post("/{person_id}/ingest_basic_info")
def api_ingest_basic_info(person_id: str, body: BasicInfoIngest):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")
    ensure_profile(person_id)
    ingest_basic_info_document(person_id, body.document, create_relatives=body.create_relatives)
    return api_get_profile(person_id)
