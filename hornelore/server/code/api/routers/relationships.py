from __future__ import annotations

"""Relationships Router — LoreVox Phase Q.1 (Relationship Graph Layer)

Canonical relationship graph API.  Every narrator has a graph of person-nodes
and relationship-edges that serves as the truth model for family/partner data.

Endpoints:
- GET    /api/graph/{narrator_id}                — full graph (persons + relationships)
- PUT    /api/graph/{narrator_id}                — replace full graph (atomic)
- POST   /api/graph/{narrator_id}/person         — upsert one person node
- DELETE /api/graph/person/{person_id}            — delete a person node
- POST   /api/graph/{narrator_id}/relationship   — upsert one relationship edge
- DELETE /api/graph/relationship/{rel_id}         — delete a relationship edge
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import (
    get_person,
    graph_delete_person,
    graph_delete_relationship,
    graph_get_full,
    graph_list_persons,
    graph_list_relationships,
    graph_replace_full,
    graph_upsert_person,
    graph_upsert_relationship,
)

router = APIRouter(prefix="/api/graph", tags=["relationship-graph"])


# ── Models ──

class GraphPersonUpsert(BaseModel):
    id: Optional[str] = None
    display_name: str = ""
    first_name: str = ""
    middle_name: str = ""
    last_name: str = ""
    maiden_name: str = ""
    birth_date: str = ""
    birth_place: str = ""
    occupation: str = ""
    deceased: bool = False
    is_narrator: bool = False
    source: str = "manual"
    provenance: str = ""
    confidence: float = 1.0
    meta: Dict[str, Any] = Field(default_factory=dict)


class GraphRelUpsert(BaseModel):
    id: Optional[str] = None
    from_person_id: str = ""
    to_person_id: str = ""
    relationship_type: str = ""
    subtype: str = ""
    label: str = ""
    status: str = "active"
    notes: str = ""
    source: str = "manual"
    provenance: str = ""
    confidence: float = 1.0
    start_date: str = ""
    end_date: str = ""
    meta: Dict[str, Any] = Field(default_factory=dict)


class GraphReplaceFull(BaseModel):
    persons: List[Dict[str, Any]] = Field(default_factory=list)
    relationships: List[Dict[str, Any]] = Field(default_factory=list)


# ── Endpoints ──

@router.get("/{narrator_id}", summary="Get full relationship graph")
def api_graph_get(narrator_id: str):
    if not get_person(narrator_id):
        raise HTTPException(status_code=404, detail="Narrator not found")
    return graph_get_full(narrator_id)


@router.put("/{narrator_id}", summary="Replace full relationship graph (atomic)")
def api_graph_replace(narrator_id: str, body: GraphReplaceFull):
    if not get_person(narrator_id):
        raise HTTPException(status_code=404, detail="Narrator not found")
    return graph_replace_full(narrator_id, body.persons, body.relationships)


@router.post("/{narrator_id}/person", summary="Upsert a person node")
def api_graph_upsert_person(narrator_id: str, body: GraphPersonUpsert):
    if not get_person(narrator_id):
        raise HTTPException(status_code=404, detail="Narrator not found")
    return graph_upsert_person(
        narrator_id=narrator_id,
        person_id=body.id,
        display_name=body.display_name,
        first_name=body.first_name,
        middle_name=body.middle_name,
        last_name=body.last_name,
        maiden_name=body.maiden_name,
        birth_date=body.birth_date,
        birth_place=body.birth_place,
        occupation=body.occupation,
        deceased=body.deceased,
        is_narrator=body.is_narrator,
        source=body.source,
        provenance=body.provenance,
        confidence=body.confidence,
        meta=body.meta,
    )


@router.delete("/person/{person_id}", summary="Delete a person node")
def api_graph_delete_person(person_id: str):
    if not graph_delete_person(person_id):
        raise HTTPException(status_code=404, detail="Person node not found")
    return {"ok": True}


@router.post("/{narrator_id}/relationship", summary="Upsert a relationship edge")
def api_graph_upsert_rel(narrator_id: str, body: GraphRelUpsert):
    if not get_person(narrator_id):
        raise HTTPException(status_code=404, detail="Narrator not found")
    return graph_upsert_relationship(
        narrator_id=narrator_id,
        rel_id=body.id,
        from_person_id=body.from_person_id,
        to_person_id=body.to_person_id,
        relationship_type=body.relationship_type,
        subtype=body.subtype,
        label=body.label,
        status=body.status,
        notes=body.notes,
        source=body.source,
        provenance=body.provenance,
        confidence=body.confidence,
        start_date=body.start_date,
        end_date=body.end_date,
        meta=body.meta,
    )


@router.delete("/relationship/{rel_id}", summary="Delete a relationship edge")
def api_graph_delete_rel(rel_id: str):
    if not graph_delete_relationship(rel_id):
        raise HTTPException(status_code=404, detail="Relationship not found")
    return {"ok": True}
