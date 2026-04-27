from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import get_projection, upsert_projection

router = APIRouter(prefix="/api/interview", tags=["projection"])


class ProjectionEnvelope(BaseModel):
    fields: Dict[str, Any] = Field(default_factory=dict)
    pendingSuggestions: list[Dict[str, Any]] = Field(default_factory=list)
    syncLog: list[Dict[str, Any]] = Field(default_factory=list)


class ProjectionGetResponse(BaseModel):
    ok: bool = True
    person_id: str
    projection: ProjectionEnvelope = Field(default_factory=ProjectionEnvelope)
    source: str = "unknown"
    version: int = 1
    updated_at: str


class ProjectionPutRequest(BaseModel):
    person_id: str
    projection: ProjectionEnvelope = Field(default_factory=ProjectionEnvelope)
    source: str = "projection_sync"
    version: int = 1


class ProjectionPutResponse(BaseModel):
    ok: bool = True
    person_id: str
    projection: ProjectionEnvelope = Field(default_factory=ProjectionEnvelope)
    source: str = "projection_sync"
    version: int = 1
    updated_at: str


@router.get("/projection", response_model=ProjectionGetResponse)
def get_projection_route(
    person_id: str = Query(..., description="Lorevox narrator/person id"),
) -> ProjectionGetResponse:
    row = get_projection(person_id)
    if not row:
        return ProjectionGetResponse(
            person_id=person_id,
            projection=ProjectionEnvelope(),
            source="empty",
            version=1,
            updated_at=datetime.utcnow().isoformat(),
        )

    return ProjectionGetResponse(
        person_id=person_id,
        projection=ProjectionEnvelope(**row.get("projection", {})),
        source=row.get("source", "unknown"),
        version=int(row.get("version", 1)),
        updated_at=row.get("updated_at") or datetime.utcnow().isoformat(),
    )


@router.put("/projection", response_model=ProjectionPutResponse)
def put_projection_route(payload: ProjectionPutRequest) -> ProjectionPutResponse:
    if not payload.person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    saved = upsert_projection(
        person_id=payload.person_id,
        projection=payload.projection.model_dump(),
        source=payload.source,
        version=payload.version,
    )

    return ProjectionPutResponse(
        person_id=saved["person_id"],
        projection=ProjectionEnvelope(**saved["projection"]),
        source=saved["source"],
        version=int(saved["version"]),
        updated_at=saved["updated_at"],
    )
