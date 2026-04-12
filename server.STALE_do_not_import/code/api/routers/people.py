from __future__ import annotations

"""People Router — LoreVox v8.0 (Phase 2 — Narrator Delete Cascade)

A "person" is the subject of a biography (or a family member). This is distinct
from an authenticated "user" account.

Endpoints:
- POST   /api/people                           — create a person
- GET    /api/people                           — list active people
- GET    /api/people/{person_id}               — get a specific person
- PATCH  /api/people/{person_id}               — update a person
- GET    /api/people/{person_id}/delete-inventory — dependency counts before delete
- DELETE /api/people/{person_id}               — soft delete (default) or hard delete (?mode=hard)
- POST   /api/people/{person_id}/restore       — restore a soft-deleted person

Profiles are stored separately (see profiles router).
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import (
    create_person,
    get_person,
    hard_delete_person,
    list_people,
    person_delete_inventory,
    restore_person,
    soft_delete_person,
    update_person,
)

router = APIRouter(prefix="/api/people", tags=["people"])


class PersonCreate(BaseModel):
    display_name: str = Field(..., description="Name to show in UI")
    role: Optional[str] = Field(default=None, description="subject, father, mother, sibling, etc")
    date_of_birth: Optional[str] = None  # YYYY-MM-DD
    place_of_birth: Optional[str] = None


class PersonUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    date_of_birth: Optional[str] = None
    place_of_birth: Optional[str] = None


@router.post("", summary="Create a new person")
def api_create_person(payload: PersonCreate):
    """
    NOTE: create_person() returns the created person dict (not just the id).
    The previous version treated its return value as a string id, which caused:
      sqlite3.ProgrammingError: Error binding parameter 1: type 'dict' is not supported
    """
    person = create_person(
        display_name=payload.display_name,
        role=payload.role,
        date_of_birth=payload.date_of_birth,
        place_of_birth=payload.place_of_birth,
    )

    # Defensive: support either return style (dict or id str) without crashing.
    if isinstance(person, dict):
        person_id = person.get("id")
        if not person_id:
            raise HTTPException(status_code=500, detail="create_person returned dict without 'id'")
        return {"person_id": person_id, "person": person}

    # If create_person ever returns just an id string, still behave correctly.
    person_id = str(person)
    row = get_person(person_id)
    if not row:
        raise HTTPException(status_code=500, detail="Person created but could not be fetched")
    return {"person_id": person_id, "person": row}


@router.get("", summary="List people")
def api_list_people(
    limit: int = 200,
    offset: int = 0,
    include_deleted: bool = Query(False, description="Include soft-deleted narrators"),
):
    return {"people": list_people(limit=limit, offset=offset, include_deleted=include_deleted)}


@router.get("/{person_id}", summary="Get a person")
def api_get_person(person_id: str):
    row = get_person(person_id)
    if not row:
        raise HTTPException(status_code=404, detail="Person not found")
    return {"person": row}


@router.get("/{person_id}/delete-inventory", summary="Get dependency inventory before deletion")
def api_delete_inventory(person_id: str):
    inv = person_delete_inventory(person_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Person not found")
    return inv


@router.delete("/{person_id}", summary="Delete a person (soft by default, hard with ?mode=hard)")
def api_delete_person(
    person_id: str,
    mode: str = Query("soft", description="'soft' (default) or 'hard'"),
    reason: str = Query("", description="Optional reason for deletion"),
):
    if mode == "hard":
        result = hard_delete_person(person_id, requested_by="ui")
        if result is None:
            raise HTTPException(status_code=404, detail="Person not found")
        if "error" in result:
            if result["error"] == "rollback":
                raise HTTPException(status_code=500, detail=f"Hard delete failed: {result.get('detail', 'unknown')}")
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    else:
        result = soft_delete_person(person_id, requested_by="ui", reason=reason)
        if result is None:
            raise HTTPException(status_code=404, detail="Person not found")
        if "error" in result:
            if result["error"] == "already_deleted":
                raise HTTPException(status_code=409, detail="Person is already soft-deleted")
            raise HTTPException(status_code=400, detail=result["error"])
        return result


@router.post("/{person_id}/restore", summary="Restore a soft-deleted person")
def api_restore_person(person_id: str):
    result = restore_person(person_id, requested_by="ui")
    if result is None:
        raise HTTPException(status_code=404, detail="Person not found")
    if "error" in result:
        if result["error"] == "not_deleted":
            raise HTTPException(status_code=409, detail="Person is not deleted")
        if result["error"] == "undo_expired":
            raise HTTPException(
                status_code=410,
                detail=f"Undo window expired at {result.get('undo_expires_at', 'unknown')}",
            )
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.patch("/{person_id}", summary="Update a person")
def api_update_person(person_id: str, payload: PersonUpdate):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="Person not found")
    update_person(person_id, **payload.model_dump(exclude_none=True))
    return {"person": get_person(person_id)}
