from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, flags
from ..db import save_section_summary, get_interview_progress
from ..archive import (
    ensure_session as archive_ensure_session,
    append_event as archive_append_event,
    rebuild_txt as archive_rebuild_txt,
)
from ..interview_engine import (
    add_followup_questions,
    followups_exist,
    get_section_meta,
    get_section_transcript,
    get_session_transcript,
)
from ..llm_interview import draft_final_memoir, draft_section_summary, propose_followup_questions
from ..safety import scan_answer, build_segment_flags, get_resources_for_category, set_softened, is_softened

router = APIRouter(prefix="/api/interview", tags=["interview"])

# Mirrors your interview plan JSON end_of_section_summary fields.
SECTION_END_INSTRUCTIONS: dict[str, str] = {
    "personal_information":      "Summarize the user's basic identity details and naming/birth stories.",
    "family_and_heritage":       "Summarize the user's family origins, key figures, and heritage stories.",
    "early_years":               "Summarize the user's early memories and sense of home.",
    "adolescence":               "Summarize the user's teenage identity, friendships, and defining experiences.",
    "young_adulthood":           "Summarize the user's early adult experiences and transitions.",
    "marriage_and_family":       "Summarize the user's relationships, partnerships, and family beginnings.",
    "career_and_achievements":   "Summarize the user's work history and career highlights.",
    "later_years":               "Summarize the user's later-life reflections and evolving priorities.",
    "hobbies_and_events":        "Summarize the user's interests, passions, and meaningful events.",
    "health_and_wellness":       "Summarize the user's wellness journey and personal resilience.",
    "technology_and_beliefs":    "Summarize the user's relationship with technology, values, and beliefs.",
    "additional_notes":          "Summarize any additional clarifications and details gathered in follow-up questions.",
    "pets":                      "Summarize the user's cherished pets and the memories associated with them.",
}


class StartInterviewRequest(BaseModel):
    person_id: str
    plan_id: str = "default"


class QuestionOut(BaseModel):
    id: str
    section_id: str
    ord: int
    prompt: str


class StartInterviewResponse(BaseModel):
    session_id: str
    person_id: str
    plan_id: str
    question: Optional[QuestionOut]


class AnswerInterviewRequest(BaseModel):
    session_id: str
    question_id: str
    answer: str = ""
    skipped: bool = False


class ProgressOut(BaseModel):
    total: int
    answered: int
    remaining: int
    percent: int
    current_section: str


class AnswerInterviewResponse(BaseModel):
    done: bool
    next_question: Optional[QuestionOut]

    # New fields
    generated_summary: Optional[str] = None
    summary_section_id: Optional[str] = None
    summary_section_title: Optional[str] = None

    followups_inserted: int = 0
    final_memoir: Optional[str] = None

    # Progress indicator
    progress: Optional[ProgressOut] = None

    # v6.1 Track A — Safety
    safety_triggered: bool = False
    safety_category: Optional[str] = None
    safety_confidence: float = 0.0
    safety_resources: list = []
    interview_softened: bool = False


def _qout(row: Optional[dict]) -> Optional[QuestionOut]:
    if not row:
        return None
    return QuestionOut(
        id=row["id"],
        section_id=row["section_id"],
        ord=int(row["ord"]),
        prompt=row["prompt"],
    )


# ── WO-LIFE-SPINE-05: phase-aware question override ─────────────────────────
# When LOREVOX_PHASE_AWARE_QUESTIONS is on AND the narrator has a DOB,
# substitute a question from data/prompts/question_bank.json instead of
# the next sequential DB row. Falls back transparently to sequential when:
#   - flag is off
#   - bank file missing or malformed
#   - narrator DOB missing
#   - no unasked phase-appropriate questions remain
# Asked-key tracking uses the session's question_id history — questions
# previously asked via the bank carry an "qb:..." id prefix that mirrors
# the composer's ask_key encoding, so re-deriving the set is cheap.

def _asked_keys_for_session(session_id: str) -> set[str]:
    """Collect qb:* question ids previously asked in this session and
    translate them back into ask_keys the composer recognizes.

    Queries interview_answers directly to avoid adding a new DB helper
    just for this flag-gated path. Returns empty set on any failure so
    the composer sees "nothing asked yet" — worst case is a repeated
    question, never a crash.
    """
    keys: set[str] = set()
    try:
        con = db._connect()
        rows = con.execute(
            "SELECT question_id FROM interview_answers WHERE session_id=?;",
            (session_id,),
        ).fetchall()
        con.close()
        for r in rows or []:
            qid = (r["question_id"] or "").strip()
            if qid.startswith("qb:"):
                # qb:<phase>:<sub>:<idx>  →  <phase>:<sub>:<idx>
                keys.add(qid[3:])
    except Exception:
        return set()
    return keys


def _phase_aware_next_question(
    session_id: str,
    person_id: str,
) -> Optional[dict]:
    """Return a phase-aware question dict shaped like db.get_next_question
    output, or None to signal 'fall back to sequential'.

    Never raises. Any failure path returns None so the caller can safely
    continue with the existing DB flow.
    """
    try:
        prof = db.get_profile(person_id) or {}
        blob = prof.get("profile_json") or {}
        basics = ((blob.get("profile") or blob).get("basics")) or {}
        personal = ((blob.get("profile") or blob).get("personal")) or {}
        dob = basics.get("dateOfBirth") or personal.get("dateOfBirth") or ""
        if not dob:
            return None
        from ..phase_aware_composer import pick_next_question
        asked = _asked_keys_for_session(session_id)
        picked = pick_next_question(dob=dob, asked_keys=asked)
        if not picked:
            return None
        # Shape it like a DB row for _qout compatibility
        return {
            "id": picked["id"],
            "section_id": picked["section_id"],
            "ord": picked["ord"],
            "prompt": picked["prompt"],
        }
    except Exception:
        return None


@router.post("/start", response_model=StartInterviewResponse)
def start_interview(req: StartInterviewRequest) -> StartInterviewResponse:
    db.init_db()

    person = db.get_person(req.person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Unknown person_id")

    # Guard: fail fast if the plan has no seeded questions
    q_count = db.count_plan_questions(req.plan_id)
    if q_count == 0:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Interview plan '{req.plan_id}' has no seeded questions. "
                "Run: python scripts/seed_interview_plan.py"
            ),
        )

    # FIXED: Replaced create_interview_session with start_session
    sess = db.start_session(req.person_id, req.plan_id)
    if not sess:
        raise HTTPException(status_code=500, detail="Failed to create interview session")

    # Memory Archive — create session directory + meta.json
    archive_ensure_session(
        person_id=req.person_id,
        session_id=sess["id"],
        mode="interview_driver",
        title=f"Interview ({req.plan_id})",
        started_at=sess.get("started_at"),
        extra_meta={"plan_id": req.plan_id},
    )

    # FIXED: Added the required 3rd argument (current_question_id=None) for the start
    next_q = db.get_next_question(sess["id"], req.plan_id, None)

    # WO-LIFE-SPINE-05 — optional phase-aware override (flag off by default)
    if flags.phase_aware_questions_enabled():
        pa = _phase_aware_next_question(sess["id"], req.person_id)
        if pa is not None:
            next_q = pa

    if next_q:
        db.set_session_active_question(sess["id"], next_q["id"])

    return StartInterviewResponse(
        session_id=sess["id"],
        person_id=req.person_id,
        plan_id=req.plan_id,
        question=_qout(dict(next_q)) if next_q else None,
    )


@router.post("/answer", response_model=AnswerInterviewResponse)
def answer_interview(req: AnswerInterviewRequest) -> AnswerInterviewResponse:
    db.init_db()

    sess = db.get_interview_session(req.session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session_id")

    # FIXED: Replaced get_interview_question with get_question
    current_q = db.get_question(req.question_id)
    if not current_q:
        raise HTTPException(status_code=404, detail="Unknown question_id")

    person = db.get_person(sess["person_id"]) or {"display_name": "the speaker"}
    person_name = (person.get("display_name") or "the speaker").strip() or "the speaker"
    # Fetch pronouns from profile so Lori uses the correct ones in section summaries and memoir drafts
    _profile_raw = db.get_profile(sess["person_id"]) or {}
    _basics = (_profile_raw.get("profile") or _profile_raw).get("basics") or {}
    person_pronouns: str = (_basics.get("pronouns") or "").strip()

    # FIXED: Replaced add_interview_answer with add_answer
    db.add_answer(
        session_id=req.session_id,
        person_id=sess["person_id"],
        question_id=req.question_id,
        answer=req.answer,
        skipped=req.skipped,
    )

    # ── v6.1 Track A: Safety scan ────────────────────────────────────────────
    safety_triggered = False
    safety_category: Optional[str] = None
    safety_confidence: float = 0.0
    safety_resources: list = []

    if not req.skipped and req.answer.strip():
        safety_result = scan_answer(req.answer)
        if safety_result and safety_result.triggered:
            safety_triggered = True
            safety_category = safety_result.category
            safety_confidence = safety_result.confidence
            safety_resources = get_resources_for_category(safety_result.category)

            # Persist segment flag (private + excluded from memoir by default)
            flags = build_segment_flags(safety_result)
            db.save_segment_flag(
                session_id=req.session_id,
                question_id=req.question_id,
                section_id=current_q.get("section_id") if current_q else None,
                sensitive=flags.sensitive,
                sensitive_category=flags.sensitive_category or "",
                excluded_from_memoir=flags.excluded_from_memoir,
                private=flags.private,
            )

            # Set softened interview mode
            current_turn = db.increment_session_turn(req.session_id)
            set_softened(req.session_id, current_turn)
            db.set_session_softened(req.session_id, current_turn)

    # Increment turn count (even if safety did not trigger)
    if not safety_triggered:
        db.increment_session_turn(req.session_id)

    # Check softened state for response
    softened_state = db.get_session_softened_state(req.session_id)
    interview_softened = softened_state.get("interview_softened", False)
    # ── End safety scan ──────────────────────────────────────────────────────

    # Memory Archive — append question prompt + user answer
    _q_prompt = (current_q.get("prompt") or "") if current_q else ""
    if _q_prompt:
        archive_append_event(
            person_id=sess["person_id"],
            session_id=req.session_id,
            role="assistant",
            content=_q_prompt,
            question_id=req.question_id,
            section_id=current_q.get("section_id") if current_q else None,
        )
    archive_append_event(
        person_id=sess["person_id"],
        session_id=req.session_id,
        role="user",
        content=req.answer if not req.skipped else "",
        question_id=req.question_id,
        section_id=current_q.get("section_id") if current_q else None,
        meta={"skipped": bool(req.skipped)},
    )

    # 2) Find the next question (Passing the current question ID)
    next_q = db.get_next_question(req.session_id, sess["plan_id"], req.question_id)

    # WO-LIFE-SPINE-05 — phase-aware override (flag off by default).
    # Prefer a bank-sourced question when enabled AND narrator has DOB.
    if flags.phase_aware_questions_enabled():
        pa = _phase_aware_next_question(req.session_id, sess["person_id"])
        if pa is not None:
            next_q = pa

    generated_summary: Optional[str] = None
    summary_section_id: Optional[str] = None
    summary_section_title: Optional[str] = None

    # 3) Section-boundary check
    current_section = current_q.get("section_id")
    next_section = next_q.get("section_id") if next_q else None

    boundary = bool(current_section and (next_q is None or current_section != next_section))
    if boundary and current_section:
        section_meta = get_section_meta(sess["plan_id"], current_section) or {"title": current_section}
        section_title = (section_meta.get("title") or current_section).strip()
        # Exact match first, then prefix-match fallback for any unlisted sections
        instruction = SECTION_END_INSTRUCTIONS.get(
            current_section,
            next((v for k, v in SECTION_END_INSTRUCTIONS.items() if current_section.startswith(k)), "Summarize the key details from this section.")
        )
        transcript = get_section_transcript(req.session_id, current_section)

        generated_summary = draft_section_summary(
            section_title=section_title,
            instruction=instruction,
            transcript=transcript,
            person_name=person_name,
            pronouns=person_pronouns,
        )
        if generated_summary:
            summary_section_id = current_section
            summary_section_title = section_title
            # Persist summary to DB so it is not lost after the API response
            save_section_summary(
                session_id=req.session_id,
                person_id=sess["person_id"],
                section_id=current_section,
                section_title=section_title,
                summary=generated_summary,
            )

    followups_inserted = 0
    final_memoir: Optional[str] = None

    # 4) Auto-generate follow-ups ONCE at the end of the base plan
    if next_q is None:
        if not followups_exist(sess["plan_id"]):
            full_transcript = get_session_transcript(req.session_id)
            followups = propose_followup_questions(transcript=full_transcript, n=5)
            inserted = add_followup_questions(sess["plan_id"], followups)
            followups_inserted = len(inserted)

            # Recompute next_q now that follow-ups exist
            if followups_inserted:
                next_q = db.get_next_question(req.session_id, sess["plan_id"], req.question_id)
        else:
            # Follow-ups exist and we're out of questions => done. Draft final memoir.
            full_transcript = get_session_transcript(req.session_id)
            final_memoir = draft_final_memoir(transcript=full_transcript, person_name=person_name, pronouns=person_pronouns)

    # 5) Update active_question_id
    if next_q:
        db.set_session_active_question(req.session_id, next_q["id"])

    # Memory Archive — rebuild human-readable transcript
    archive_rebuild_txt(person_id=sess["person_id"], session_id=req.session_id)

    # Progress indicator
    progress_data = get_interview_progress(req.session_id, sess.get("plan_id", "default"))
    progress_out = ProgressOut(
        total=progress_data["total"],
        answered=progress_data["answered"],
        remaining=progress_data["remaining"],
        percent=progress_data["percent"],
        current_section=progress_data["current_section"],
    )

    return AnswerInterviewResponse(
        done=next_q is None,
        next_question=_qout(dict(next_q)) if next_q else None,
        generated_summary=generated_summary,
        summary_section_id=summary_section_id,
        summary_section_title=summary_section_title,
        followups_inserted=followups_inserted,
        final_memoir=final_memoir,
        progress=progress_out,
        # v6.1 Track A — Safety
        safety_triggered=safety_triggered,
        safety_category=safety_category,
        safety_confidence=safety_confidence,
        safety_resources=safety_resources,
        interview_softened=interview_softened,
    )


# ── WO-GREETING-01: narrator-aware session opener ───────────────────────────

class OpenerResponse(BaseModel):
    person_id: str
    narrator_name: str = ""
    kind: str = "first_time"   # "first_time" | "welcome_back" | "onboarding_incomplete"
    opener_text: str = ""
    context: dict = {}


def _choose_narrator_name(person: dict, profile_basics: dict) -> str:
    """Return the best available name for greeting use.

    Order: preferred > first (from fullName split) > fullName > ''.
    Never returns lastName only; the greeting is conversational.
    """
    preferred = (profile_basics or {}).get("preferred") or ""
    if preferred and str(preferred).strip():
        return str(preferred).strip()

    full = (person or {}).get("display_name") or ""
    if full and str(full).strip():
        first = str(full).split()[0].strip()
        if first:
            return first
        return str(full).strip()

    return ""


def _identity_complete(person: dict, profile_basics: dict) -> bool:
    """Check whether this narrator has enough identity to skip onboarding.

    Requires: display_name (or preferred), date_of_birth, place_of_birth.
    Matches the thresholds used by prompt_composer's onboarding flow.
    """
    name_ok = bool((person or {}).get("display_name") or (profile_basics or {}).get("preferred"))
    dob_ok = bool((person or {}).get("date_of_birth"))
    pob_ok = bool((person or {}).get("place_of_birth"))
    return name_ok and dob_ok and pob_ok


def _build_opener_text(kind: str, name: str) -> str:
    """Compose the opener utterance Lori should say as her first turn."""
    safe_name = name or "friend"
    if kind == "first_time":
        return (
            f"Hi {safe_name}, I'm Lori.\n\n"
            "I'm here to help you capture your life story — the memories, "
            "the people, the places that mattered to you. There's no wrong "
            "way to do this. We can go in order of your life, or jump "
            "around to whatever you want to talk about today.\n\n"
            "What would you like to start with?"
        )
    if kind == "welcome_back":
        return (
            f"Welcome back, {safe_name}. Where would you like to continue today?"
        )
    # onboarding_incomplete → empty; let the existing prompt_composer
    # onboarding flow drive the first question.
    return ""


@router.get("/opener", response_model=OpenerResponse)
def get_opener(person_id: str) -> OpenerResponse:
    """Return a narrator-aware first-turn opener for Lori.

    Frontend should call this when a narrator card is opened, before
    enabling user input. The returned `opener_text` becomes Lori's
    first utterance. An empty `opener_text` with
    `kind="onboarding_incomplete"` tells the frontend to skip the
    injected greeting and let the existing onboarding prompt path run.

    Never raises for a missing-but-valid person_id; returns 404 only
    when the narrator record itself cannot be found. Returns an empty
    opener (not a 500) for any internal lookup failure so startup is
    resilient.
    """
    if not person_id or not person_id.strip():
        raise HTTPException(status_code=400, detail="person_id is required")

    try:
        snap = db.get_narrator_state_snapshot(person_id) or {}
    except Exception:
        snap = {}

    person = snap.get("person") or {}
    if not person:
        raise HTTPException(status_code=404, detail="Unknown person_id")

    profile = snap.get("profile") or {}
    basics = (profile.get("basics") or {}) if isinstance(profile, dict) else {}
    user_turn_count = int(snap.get("user_turn_count") or 0)

    identity_complete = _identity_complete(person, basics)
    name = _choose_narrator_name(person, basics)

    if not identity_complete:
        kind = "onboarding_incomplete"
    elif user_turn_count == 0:
        kind = "first_time"
    else:
        kind = "welcome_back"

    opener_text = _build_opener_text(kind, name)

    return OpenerResponse(
        person_id=person_id,
        narrator_name=name,
        kind=kind,
        opener_text=opener_text,
        context={
            "user_turn_count": user_turn_count,
            "identity_complete": identity_complete,
        },
    )


@router.get("/progress")
def api_progress(session_id: str):
    """Return progress for the UI progress bar."""
    sess = db.get_interview_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    return get_interview_progress(session_id, sess.get("plan_id", "default"))


@router.get("/summaries")
def api_summaries(session_id: str):
    """Return all persisted section summaries for a session."""
    sess = db.get_interview_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    from ..db import list_section_summaries
    return {"summaries": list_section_summaries(session_id)}


# ── v6.2 Segment flag management ─────────────────────────────────────────────

@router.get("/segment-flags")
def api_segment_flags(session_id: str):
    """Return all non-deleted segment flags for a session."""
    sess = db.get_interview_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    return {"flags": db.get_segment_flags(session_id)}


class SegFlagUpdateRequest(BaseModel):
    session_id: str
    question_id: str
    include_in_memoir: bool


class SegFlagDeleteRequest(BaseModel):
    session_id: str
    question_id: str


@router.post("/segment-flag/update")
def api_segment_flag_update(req: SegFlagUpdateRequest):
    """Toggle memoir inclusion for a segment identified by session + question."""
    updated = db.update_segment_flag_by_question(
        req.session_id, req.question_id, req.include_in_memoir
    )
    return {"updated": updated}


@router.post("/segment-flag/delete")
def api_segment_flag_delete(req: SegFlagDeleteRequest):
    """Soft-delete a segment flag identified by session + question."""
    deleted = db.delete_segment_flag_by_question(req.session_id, req.question_id)
    return {"deleted": deleted}
