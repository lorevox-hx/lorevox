from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import get_questionnaire, upsert_questionnaire

router = APIRouter(prefix="/api/bio-builder", tags=["questionnaire"])


class QuestionnaireGetResponse(BaseModel):
    ok: bool = True
    person_id: str
    questionnaire: Dict[str, Any] = Field(default_factory=dict)
    source: str = "unknown"
    version: int = 1
    updated_at: str


class QuestionnairePutRequest(BaseModel):
    person_id: str
    questionnaire: Dict[str, Any] = Field(default_factory=dict)
    source: str = "ui_save"
    version: int = 1


class QuestionnairePutResponse(BaseModel):
    ok: bool = True
    person_id: str
    questionnaire: Dict[str, Any] = Field(default_factory=dict)
    source: str = "ui_save"
    version: int = 1
    updated_at: str


@router.get("/questionnaire", response_model=QuestionnaireGetResponse)
def get_questionnaire_route(
    person_id: str = Query(..., description="Lorevox narrator/person id"),
) -> QuestionnaireGetResponse:
    row = get_questionnaire(person_id)
    if not row:
        return QuestionnaireGetResponse(
            person_id=person_id,
            questionnaire={},
            source="empty",
            version=1,
            updated_at=datetime.utcnow().isoformat(),
        )

    return QuestionnaireGetResponse(
        person_id=person_id,
        questionnaire=row.get("questionnaire", {}),
        source=row.get("source", "unknown"),
        version=int(row.get("version", 1)),
        updated_at=row.get("updated_at") or datetime.utcnow().isoformat(),
    )


@router.put("/questionnaire", response_model=QuestionnairePutResponse)
def put_questionnaire_route(payload: QuestionnairePutRequest) -> QuestionnairePutResponse:
    if not payload.person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    saved = upsert_questionnaire(
        person_id=payload.person_id,
        questionnaire=payload.questionnaire,
        source=payload.source,
        version=payload.version,
    )

    return QuestionnairePutResponse(
        person_id=saved["person_id"],
        questionnaire=saved["questionnaire"],
        source=saved["source"],
        version=int(saved["version"]),
        updated_at=saved["updated_at"],
    )
