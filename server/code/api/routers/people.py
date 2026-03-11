from __future__ import annotations

"""People Router — LoreVox v4.2

A "person" is the subject of a biography (or a family member). This is distinct
from an authenticated "user" account.

This router provides simple CRUD-ish operations needed for the MVP:
- create a person
- list people
- get person by id
- update a person

Profiles are stored separately (see profiles router).
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import create_person, get_person, list_people, update_person

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
def api_list_people(limit: int = 200, offset: int = 0):
    return {"people": list_people(limit=limit, offset=offset)}


@router.get("/{person_id}", summary="Get a person")
def api_get_person(person_id: str):
    row = get_person(person_id)
    if not row:
        raise HTTPException(status_code=404, detail="Person not found")
    return {"person": row}


@router.patch("/{person_id}", summary="Update a person")
def api_update_person(person_id: str, payload: PersonUpdate):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="Person not found")
    update_person(person_id, **payload.model_dump(exclude_none=True))
    return {"person": get_person(person_id)}
