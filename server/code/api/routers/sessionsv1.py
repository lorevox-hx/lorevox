# code/api/routers/interview.py
from __future__ import annotations

"""Interview Router — LoreVox v4.2 (Standalone DB)

Driver endpoints:
  - POST /api/interview/start
  - POST /api/interview/answer
Always returns next question payload.

Back-compat:
  - /api/interview/session/start
  - /api/interview/session/answer
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import (
    add_answer,
    ensure_profile,
    get_next_question,
    get_person,
    get_interview_session,
    set_session_active_question,
    start_session,
    update_profile_field,
    get_question,
)

router = APIRouter(prefix="/api/interview", tags=["interview"])


class StartInterviewRequest(BaseModel):
    person_id: str = Field(..., description="The person (subject) this interview is about")
    plan_id: str = Field(default="default", description="Interview plan id")


class StartInterviewResponse(BaseModel):
    session_id: str
    person_id: str
    next_question: dict


class AnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer: str = ""
    skipped: bool = False


class AnswerResponse(BaseModel):
    session_id: str
    person_id: str
    saved: bool
    next_question: Optional[dict] = None
    done: bool = False


@router.post("/start", response_model=StartInterviewResponse)
def api_start(req: StartInterviewRequest):
    person = get_person(req.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="person_id not found")

    ensure_profile(req.person_id)

    session = start_session(person_id=req.person_id, plan_id=req.plan_id)
    nxt = get_next_question(session["id"], session["plan_id"], None)
    if not nxt:
        raise HTTPException(status_code=400, detail="Interview plan has no questions")

    set_session_active_question(session["id"], nxt["id"])

    return StartInterviewResponse(
        session_id=session["id"],
        person_id=req.person_id,
        next_question={
            "id": nxt["id"],
            "section_id": nxt["section_id"],
            "prompt": nxt["prompt"],
            "kind": nxt["kind"],
            "required": bool(nxt["required"]),
            "profile_path": nxt.get("profile_path"),
        },
    )


@router.post("/answer", response_model=AnswerResponse)
def api_answer(req: AnswerRequest):
    session = get_interview_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    person_id = session.get("person_id")
    if not person_id:
        raise HTTPException(status_code=400, detail="Session missing person_id")

    # Save answer (canonical log)
    add_answer(
        session_id=req.session_id,
        question_id=req.question_id,
        answer=req.answer,
        skipped=req.skipped,
        person_id=person_id,
    )

    # If current question maps to profile_path, write into profile JSON
    q = get_question(req.question_id)
    if q and q.get("profile_path") and (not req.skipped):
        update_profile_field(person_id, q["profile_path"], req.answer)

    # Next question
    nxt = get_next_question(req.session_id, session.get("plan_id", "default"), req.question_id)
    if not nxt:
        return AnswerResponse(
            session_id=req.session_id,
            person_id=person_id,
            saved=True,
            next_question=None,
            done=True,
        )

    set_session_active_question(req.session_id, nxt["id"])

    return AnswerResponse(
        session_id=req.session_id,
        person_id=person_id,
        saved=True,
        next_question={
            "id": nxt["id"],
            "section_id": nxt["section_id"],
            "prompt": nxt["prompt"],
            "kind": nxt["kind"],
            "required": bool(nxt["required"]),
            "profile_path": nxt.get("profile_path"),
        },
        done=False,
    )


@router.post("/session/start", response_model=StartInterviewResponse)
def session_start_alias(req: StartInterviewRequest):
    return api_start(req)


@router.post("/session/answer", response_model=AnswerResponse)
def session_answer_alias(req: AnswerRequest):
    return api_answer(req)
