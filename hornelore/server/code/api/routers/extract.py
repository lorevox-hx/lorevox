"""Lorevox 8.0 — Multi-Field Extraction Router

POST /api/extract-fields

Accepts a conversational answer and the current interview context,
returns a list of structured field projections that the frontend
projection-sync layer can apply via batchProject / projectValue.

Design:
  - Uses the local LLM (same pipeline as /api/chat) to decompose a
    compound answer into multiple Bio Builder field projections.
  - Each extracted item carries: fieldPath, value, writeMode, confidence.
  - The backend NEVER writes to questionnaire or structuredBio directly.
    The frontend projection-sync layer enforces all write-mode discipline.
  - Falls back to a rules-based regex extractor when LLM is unavailable.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("lorevox.extract")

router = APIRouter(prefix="/api", tags=["extract"])


# ── Request / Response models ────────────────────────────────────────────────

class ExtractFieldsRequest(BaseModel):
    person_id: str
    session_id: Optional[str] = None
    answer: str
    current_section: Optional[str] = None
    current_target_path: Optional[str] = None
    profile_context: Optional[Dict[str, Any]] = None


class ExtractedItem(BaseModel):
    fieldPath: str
    value: str
    writeMode: str        # "prefill_if_blank" | "candidate_only" | "suggest_only"
    confidence: float     # 0.0–1.0
    source: str = "backend_extract"
    extractionMethod: str = "llm"  # "llm" | "rules"
    repeatableGroup: Optional[str] = None  # FIX-4: group tag for same-person field association


class ExtractFieldsResponse(BaseModel):
    items: List[ExtractedItem]
    method: str = "llm"   # "llm" | "rules" | "fallback"
    raw_llm_output: Optional[str] = None  # debug: raw model output (only in dev)


# ── Field schema for the LLM prompt ─────────────────────────────────────────

EXTRACTABLE_FIELDS = {
    # Identity / personal (prefill_if_blank)
    "personal.fullName":       {"label": "Full name", "writeMode": "prefill_if_blank"},
    "personal.preferredName":  {"label": "Preferred name or nickname", "writeMode": "prefill_if_blank"},
    "personal.dateOfBirth":    {"label": "Date of birth (YYYY-MM-DD if possible)", "writeMode": "prefill_if_blank"},
    "personal.placeOfBirth":   {"label": "Place of birth (city, state/country)", "writeMode": "prefill_if_blank"},
    "personal.birthOrder":     {"label": "Birth order (first child, second, etc.)", "writeMode": "prefill_if_blank"},

    # Early memories (suggest_only)
    "earlyMemories.firstMemory":       {"label": "Earliest childhood memory", "writeMode": "suggest_only"},
    "earlyMemories.significantEvent":   {"label": "Significant childhood event", "writeMode": "suggest_only"},

    # Education & career (suggest_only)
    "education.schooling":           {"label": "Schooling history (name of school, details)", "writeMode": "suggest_only"},
    "education.higherEducation":     {"label": "College or higher education", "writeMode": "suggest_only"},
    "education.earlyCareer":         {"label": "First job or early career", "writeMode": "suggest_only"},
    "education.careerProgression":   {"label": "Career progression and major changes", "writeMode": "suggest_only"},

    # Later years (suggest_only)
    "laterYears.retirement":               {"label": "Retirement experience", "writeMode": "suggest_only"},
    "laterYears.lifeLessons":              {"label": "Life lessons learned", "writeMode": "suggest_only"},

    # Hobbies (suggest_only)
    "hobbies.hobbies":              {"label": "Hobbies and interests", "writeMode": "suggest_only"},
    "hobbies.personalChallenges":   {"label": "Personal challenges or hardships", "writeMode": "suggest_only"},

    # Additional notes (suggest_only)
    "additionalNotes.unfinishedDreams":           {"label": "Unfinished dreams or goals", "writeMode": "suggest_only"},

    # Repeatable: parents (candidate_only)
    "parents.relation":          {"label": "Parent relationship (father/mother/step)", "writeMode": "candidate_only", "repeatable": "parents"},
    "parents.firstName":         {"label": "Parent first name", "writeMode": "candidate_only", "repeatable": "parents"},
    "parents.lastName":          {"label": "Parent last name", "writeMode": "candidate_only", "repeatable": "parents"},
    "parents.maidenName":        {"label": "Parent maiden name", "writeMode": "candidate_only", "repeatable": "parents"},
    "parents.birthPlace":        {"label": "Parent birthplace", "writeMode": "candidate_only", "repeatable": "parents"},
    "parents.occupation":        {"label": "Parent occupation", "writeMode": "candidate_only", "repeatable": "parents"},
    "parents.notableLifeEvents": {"label": "Notable life events of parent", "writeMode": "candidate_only", "repeatable": "parents"},

    # Repeatable: siblings (candidate_only)
    "siblings.relation":              {"label": "Sibling relationship (brother/sister)", "writeMode": "candidate_only", "repeatable": "siblings"},
    "siblings.firstName":             {"label": "Sibling first name", "writeMode": "candidate_only", "repeatable": "siblings"},
    "siblings.lastName":              {"label": "Sibling last name", "writeMode": "candidate_only", "repeatable": "siblings"},
    "siblings.birthOrder":            {"label": "Sibling birth order (older/younger)", "writeMode": "candidate_only", "repeatable": "siblings"},
    "siblings.uniqueCharacteristics": {"label": "Sibling unique characteristics", "writeMode": "candidate_only", "repeatable": "siblings"},
}

# ── Phase G: Protected identity fields ─────────────────────────────────────
# These fields MUST NOT be directly overwritten by chat extraction.
# If the backend already has a canonical value and the extracted value conflicts,
# the extraction result should be flagged as suggest_only with a conflict reason.
PROTECTED_IDENTITY_FIELDS = frozenset([
    "personal.fullName",
    "personal.preferredName",
    "personal.dateOfBirth",
    "personal.placeOfBirth",
    "personal.birthOrder",
])


# ── LLM availability cache ──────────────────────────────────────────────────
# Keep this cache very short-lived. A long negative cache causes extraction
# to stay stuck on rules fallback even after the model has warmed successfully.
# We re-check frequently and always refresh to True immediately after a
# successful probe.

import time as _time
import uuid as _uuid

_llm_available_cache: dict = {"available": None, "checked_at": 0.0}
_LLM_CHECK_TTL = 5  # seconds — keep short so negative cache clears quickly

# ── Extraction metrics (Phase 6B) ──────────────────────────────────────────
_extraction_metrics: dict = {
    "total_turns": 0,
    "llm_turns": 0,
    "rules_turns": 0,
    "fallback_turns": 0,
    "total_parsed": 0,
    "total_accepted": 0,
    "total_rejected": 0,
    "reject_reasons": {},  # reason → count
}


def _record_metric(method: str, parsed: int, accepted: int, rejected: int,
                   reject_reasons: Optional[List[str]] = None) -> None:
    """Record extraction metrics for a single turn."""
    _extraction_metrics["total_turns"] += 1
    if method == "llm":
        _extraction_metrics["llm_turns"] += 1
    elif method == "rules":
        _extraction_metrics["rules_turns"] += 1
    else:
        _extraction_metrics["fallback_turns"] += 1
    _extraction_metrics["total_parsed"] += parsed
    _extraction_metrics["total_accepted"] += accepted
    _extraction_metrics["total_rejected"] += rejected
    if reject_reasons:
        for reason in reject_reasons:
            _extraction_metrics["reject_reasons"][reason] = (
                _extraction_metrics["reject_reasons"].get(reason, 0) + 1
            )


def _is_llm_available() -> bool:
    """Return True if the LLM stack is responsive, using cached result."""
    now = _time.time()
    cache_age = now - _llm_available_cache["checked_at"]
    if (
        _llm_available_cache["available"] is not None
        and cache_age < _LLM_CHECK_TTL
    ):
        logger.info(
            "[extract] LLM availability cache hit: %s (age=%.1fs)",
            "available" if _llm_available_cache["available"] else "unavailable",
            cache_age,
        )
        return _llm_available_cache["available"]

    # Quick probe — tiny prompt, low max_new, should return fast
    try:
        from ..llm_interview import _try_call_llm
        result = _try_call_llm(
            "Return exactly: {\"status\":\"ok\"}",
            "ping",
            max_new=20, temp=0.01, top_p=1.0,
        )
        available = result is not None
    except Exception as exc:
        available = False
        logger.warning("[extract] LLM availability probe failed: %s: %s", type(exc).__name__, exc)

    _llm_available_cache["available"] = available
    _llm_available_cache["checked_at"] = now
    logger.info("[extract] LLM availability probe: %s", "available" if available else "unavailable")
    return available


def _mark_llm_available() -> None:
    """Refresh cache to available after a successful LLM response."""
    _llm_available_cache["available"] = True
    _llm_available_cache["checked_at"] = _time.time()
    logger.info("[extract] LLM cache refreshed: available")


def _mark_llm_unavailable(reason: str = "unknown") -> None:
    """Mark cache unavailable with reason logging."""
    _llm_available_cache["available"] = False
    _llm_available_cache["checked_at"] = _time.time()
    logger.warning("[extract] LLM cache refreshed: unavailable (%s)", reason)


# ── LLM-based extraction ────────────────────────────────────────────────────

def _build_extraction_prompt(answer: str, current_section: Optional[str], current_target: Optional[str]) -> tuple[str, str]:
    """Build system + user prompts for multi-field extraction."""

    # Build field catalog for the prompt
    field_lines = []
    for path, meta in EXTRACTABLE_FIELDS.items():
        field_lines.append(f'  "{path}": "{meta["label"]}" [{meta["writeMode"]}]')
    field_catalog = "\n".join(field_lines)

    # Build a COMPACT field list — only fields relevant to the current section
    # to reduce prompt size for small context windows
    relevant_fields = {}
    for path, meta in EXTRACTABLE_FIELDS.items():
        relevant_fields[path] = meta["label"]

    # If we have a section hint, prioritize those fields but still include identity
    compact_catalog = ", ".join(f'"{p}"={m}' for p, m in relevant_fields.items())

    system = (
        "Extract biographical facts from the narrator's answer as JSON.\n"
        "Rules: only explicit facts, no guessing. Return JSON array only.\n"
        "Each item: {\"fieldPath\":\"...\",\"value\":\"...\",\"confidence\":0.0-1.0}\n"
        "Confidence: 0.9=clearly stated, 0.7=implied.\n"
        "Dates: YYYY-MM-DD if full date given. Places: City, State format.\n"
        "IMPORTANT: Use ONLY these exact fieldPath values:\n"
        f"{compact_catalog}\n"
        "\n"
        "Example — narrator says: \"My dad John Smith was a teacher and my sister Amy was older.\"\n"
        "Output:\n"
        "[{\"fieldPath\":\"parents.relation\",\"value\":\"father\",\"confidence\":0.9},"
        "{\"fieldPath\":\"parents.firstName\",\"value\":\"John\",\"confidence\":0.9},"
        "{\"fieldPath\":\"parents.lastName\",\"value\":\"Smith\",\"confidence\":0.9},"
        "{\"fieldPath\":\"parents.occupation\",\"value\":\"teacher\",\"confidence\":0.9},"
        "{\"fieldPath\":\"siblings.relation\",\"value\":\"sister\",\"confidence\":0.9},"
        "{\"fieldPath\":\"siblings.firstName\",\"value\":\"Amy\",\"confidence\":0.9},"
        "{\"fieldPath\":\"siblings.birthOrder\",\"value\":\"older\",\"confidence\":0.7}]\n"
        "\n"
        "Example — narrator says: \"I worked as a welder and later became a supervisor at a shipyard.\"\n"
        "Output:\n"
        "[{\"fieldPath\":\"education.earlyCareer\",\"value\":\"welder\",\"confidence\":0.9},"
        "{\"fieldPath\":\"education.careerProgression\",\"value\":\"supervisor at a shipyard\",\"confidence\":0.9}]\n"
        "Career rules: use education.earlyCareer for first job, education.careerProgression for later roles. "
        "Do NOT invent career.* or personal.profession paths.\n"
        "\n"
        "Example — narrator says: \"She served in the Navy as a programmer and later became a professor of computer science.\"\n"
        "Output:\n"
        "[{\"fieldPath\":\"education.earlyCareer\",\"value\":\"served in the Navy as a programmer\",\"confidence\":0.89},"
        "{\"fieldPath\":\"education.careerProgression\",\"value\":\"later became a professor of computer science\",\"confidence\":0.91}]\n"
        "\n"
        "Example — narrator says: \"She began by studying chimpanzees in the field and later became a leading primatologist, author, and international advocate for animals.\"\n"
        "Output:\n"
        "[{\"fieldPath\":\"education.earlyCareer\",\"value\":\"began by studying chimpanzees in the field\",\"confidence\":0.84},"
        "{\"fieldPath\":\"education.careerProgression\",\"value\":\"later became a leading primatologist, author, and international advocate for animals\",\"confidence\":0.92}]\n"
        "\n"
        "Career rules: use education.earlyCareer for first work, early service, early fieldwork, apprenticeship, or initial occupation. "
        "Use education.careerProgression for later roles, promotions, research leadership, public recognition, authorship, teaching, advocacy, public office, or major career transitions. "
        "Organization names, military branches, research settings, and travel context belong inside the value text when relevant; do not invent separate field paths for them. "
        "Do NOT invent paths like education.career, employment.organization, education.travelDestination, career.fieldOfStudy, career.location, career.business, career.politics.*, or personal.profession."
    )

    context_note = ""
    if current_section:
        context_note += f"\nCurrent interview section: {current_section}"
    if current_target:
        context_note += f"\nPrimary question target: {current_target}"

    user = (
        f"Narrator's answer:{context_note}\n\n"
        f"\"{answer}\"\n\n"
        "Extract all facts as a JSON array:"
    )

    return system, user


def _extract_via_llm(answer: str, current_section: Optional[str], current_target: Optional[str]) -> tuple[List[dict], Optional[str]]:
    """Call the local LLM to extract fields. Returns (items, raw_output).

    v8.0 FIX: Short-circuits immediately when the LLM is known to be
    unavailable, preventing the blocking model.generate() call from tying
    up the single uvicorn worker and causing 503 errors.
    """
    # Quick availability gate — cached for LLM_CHECK_TTL seconds
    if not _is_llm_available():
        logger.info("[extract] LLM unavailable (cached) — skipping to rules fallback")
        return [], None

    try:
        from ..llm_interview import _try_call_llm
    except ImportError:
        return [], None

    system, user = _build_extraction_prompt(answer, current_section, current_target)
    # FIX-3: Use a unique ephemeral conv_id for each extraction call to prevent
    # cross-narrator context contamination via shared session/RAG state.
    ephemeral_conv_id = f"_extract_{_uuid.uuid4().hex[:12]}"
    # WO-10M: Extraction output is a small JSON array (typically 3–8 items).
    # The old 600-token cap allowed the LLM to generate verbose prose or
    # multiple JSON blobs, both of which waste VRAM and confuse the parser.
    # 128 is generous for a structured JSON response. One-shot only — parse
    # failures fall straight through to rules, never re-call the LLM.
    _extract_cap = int(os.getenv("MAX_NEW_TOKENS_EXTRACT", "128"))
    logger.info("[extract][WO-10M] calling LLM max_new=%d temp=0.15 conv=%s",
                _extract_cap, ephemeral_conv_id)
    raw = _try_call_llm(system, user, max_new=_extract_cap, temp=0.15, top_p=0.9, conv_id=ephemeral_conv_id)
    if not raw:
        # Empty response: mark temporarily unavailable so we retry soon,
        # but do not get stuck for 2 minutes.
        _mark_llm_unavailable("empty-response")
        return [], None

    # Successful response means the LLM is available right now.
    _mark_llm_available()

    # Parse JSON from LLM output
    items = _parse_llm_json(raw)
    return items, raw


def _parse_llm_json(raw: str) -> List[dict]:
    """Parse JSON array from LLM output, handling various formats."""
    raw = raw.strip()
    logger.info("[extract-parse] Raw LLM output (%d chars): %.500s", len(raw), raw)

    arr = None
    parse_method = None

    # Try direct JSON parse
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            arr = parsed
            parse_method = "direct"
        elif isinstance(parsed, dict):
            # LLM may return {"items": [...]} or {"results": [...]}
            for key in ("items", "results", "data", "extracted"):
                if isinstance(parsed.get(key), list):
                    arr = parsed[key]
                    parse_method = f"dict.{key}"
                    break
            if arr is None:
                logger.warning("[extract-parse] LLM returned dict but no array key found: %s", list(parsed.keys()))
    except json.JSONDecodeError as e:
        logger.info("[extract-parse] Direct JSON parse failed: %s", e)

    # Try extracting JSON array from markdown code block
    if arr is None:
        m = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', raw, re.DOTALL)
        if m:
            try:
                arr = json.loads(m.group(1))
                parse_method = "markdown_block"
            except json.JSONDecodeError as e:
                logger.info("[extract-parse] Markdown block parse failed: %s", e)

    # Try finding first [ ... ] in the output
    if arr is None:
        m = re.search(r'\[.*\]', raw, re.DOTALL)
        if m:
            try:
                arr = json.loads(m.group(0))
                parse_method = "bracket_search"
            except json.JSONDecodeError as e:
                logger.info("[extract-parse] Bracket search parse failed: %s", e)

    if arr is None:
        logger.warning("[extract-parse] Could not parse ANY JSON from LLM output")
        return []

    logger.info("[extract-parse] Parsed %d raw items via %s", len(arr), parse_method)

    # Validate each item, logging rejections
    valid = []
    for i, x in enumerate(arr):
        result = _validate_item(x)
        if result:
            valid.append(result)
        else:
            logger.info("[extract-parse] Item %d REJECTED: %s", i, json.dumps(x, default=str)[:300])
    logger.info("[extract-parse] %d/%d items passed validation", len(valid), len(arr))
    return valid


def _validate_item(item: Any) -> Optional[dict]:
    """Validate and normalize a single extraction item."""
    if not isinstance(item, dict):
        logger.info("[extract-validate] REJECT: not a dict, got %s", type(item).__name__)
        return None

    # P1: Accept alternate key names the LLM may use
    fp = (item.get("fieldPath") or item.get("field_path") or item.get("field") or item.get("path") or "").strip()
    # P0: Normalize value — LLM may return list, dict envelope, or string
    raw_val = item.get("value") if "value" in item else item.get("val") if "val" in item else item.get("text")
    if isinstance(raw_val, dict):
        raw_val = raw_val.get("value", "")
    if isinstance(raw_val, list):
        raw_val = ", ".join(str(x) for x in raw_val if x)
    val = (str(raw_val) if raw_val else "").strip()
    if not fp or not val:
        logger.info("[extract-validate] REJECT: empty fieldPath=%r or value=%r (keys=%s)", fp, val, list(item.keys()))
        return None

    # Validate fieldPath exists in our schema
    # For repeatable fields, strip any index: "parents[0].firstName" → "parents.firstName"
    base_path = re.sub(r'\[\d+\]', '', fp)
    if base_path not in EXTRACTABLE_FIELDS:
        # P1: Try common LLM field path variants before rejecting
        # LLMs often output "firstName" instead of "parents.firstName", or
        # "dateOfBirth" instead of "personal.dateOfBirth"
        _FIELD_ALIASES = {
            # Bare field names → qualified paths
            "fullName": "personal.fullName", "full_name": "personal.fullName",
            "name": "personal.fullName",
            "preferredName": "personal.preferredName", "nickname": "personal.preferredName",
            "preferred_name": "personal.preferredName",
            "dateOfBirth": "personal.dateOfBirth", "date_of_birth": "personal.dateOfBirth",
            "dob": "personal.dateOfBirth", "birthday": "personal.dateOfBirth",
            "placeOfBirth": "personal.placeOfBirth", "place_of_birth": "personal.placeOfBirth",
            "birthPlace": "personal.placeOfBirth", "birthplace": "personal.placeOfBirth",
            "birthOrder": "personal.birthOrder", "birth_order": "personal.birthOrder",
            # LLM-invented personal.* paths → nearest valid field
            "personal.profession": "parents.occupation",
            "personal.occupation": "education.earlyCareer",
            "personal.job": "education.earlyCareer",
            "personal.career": "education.careerProgression",
            "personal.school": "education.schooling",
            "personal.education": "education.higherEducation",
            "personal.hobby": "hobbies.hobbies",
            "personal.hobbies": "hobbies.hobbies",
            # Family fields without section prefix
            "father": "parents.relation", "mother": "parents.relation",
            "fatherName": "parents.firstName", "motherName": "parents.firstName",
            "parentName": "parents.firstName", "parent_name": "parents.firstName",
            "parentOccupation": "parents.occupation", "parent_occupation": "parents.occupation",
            "occupation": "parents.occupation", "profession": "parents.occupation",
            "siblingName": "siblings.firstName", "sibling_name": "siblings.firstName",
            "brotherName": "siblings.firstName", "sisterName": "siblings.firstName",
            "brother": "siblings.relation", "sister": "siblings.relation",
            "siblingLastName": "siblings.lastName", "sibling_last_name": "siblings.lastName",
            "firstName": "parents.firstName", "first_name": "parents.firstName",
            "lastName": "parents.lastName", "last_name": "parents.lastName",
            "maidenName": "parents.maidenName", "maiden_name": "parents.maidenName",
            "relation": "parents.relation", "relationship": "parents.relation",
            # Family paths with wrong prefix
            "family.father": "parents.relation", "family.mother": "parents.relation",
            "family.relation": "parents.relation",
            "family.firstName": "parents.firstName",
            "family.lastName": "parents.lastName",
            "family.occupation": "parents.occupation",
            "family.sibling": "siblings.relation",
            "family.brother": "siblings.relation", "family.sister": "siblings.relation",
            # Education
            "school": "education.schooling", "college": "education.higherEducation",
            "firstJob": "education.earlyCareer", "first_job": "education.earlyCareer",
            "career": "education.careerProgression",
            # Memory paths
            "memory": "earlyMemories.firstMemory", "firstMemory": "earlyMemories.firstMemory",
            "childhood": "earlyMemories.firstMemory",
        }
        alias = _FIELD_ALIASES.get(base_path) or _FIELD_ALIASES.get(fp)
        if alias and alias in EXTRACTABLE_FIELDS:
            logger.info("[extract-validate] ALIAS: %r → %r", base_path, alias)
            base_path = alias
        else:
            logger.info("[extract-validate] REJECT: fieldPath %r (base=%r) not in EXTRACTABLE_FIELDS", fp, base_path)
            return None

    conf = item.get("confidence", 0.8)
    if not isinstance(conf, (int, float)):
        conf = 0.8
    conf = max(0.1, min(1.0, float(conf)))

    return {
        "fieldPath": base_path,
        "value": val,
        "confidence": round(conf, 2)
    }


# ── Rules-based extraction (fallback) ───────────────────────────────────────

# Date patterns
_DATE_FULL = re.compile(
    r'\b(?:born|birthday|date of birth)[^\d]*'
    r'(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})',
    re.IGNORECASE
)
_DATE_YEAR = re.compile(
    r'\b(?:born|birthday)\b[^.]{0,30}?\b((?:18|19|20)\d{2})\b',
    re.IGNORECASE
)

# Place patterns — v8.0 FIX: handle "grew up right there in Dartford", "lived in X"
# FIX: Added \b word boundaries to stop-words so "I" doesn't match inside "Island", etc.
_PLACE_BORN = re.compile(
    r'\b(?:born|raised|grew up|lived)\s+(?:\w+\s+)*?(?:in|at|near)\s+'
    r'([A-Z][a-zA-Z\s,]+?)'
    r'(?:\.|,?\s+(?:(?:and|my|I|we|the|where|when)\b|\d))',
    re.IGNORECASE
)

# Name patterns
_NAME_FULL = re.compile(
    r"(?:my name is|I'm|I am|name was|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})",
    re.IGNORECASE
)

# FIX-6a: Parent name regex — limit to first name + at most 2 last name words.
# The old pattern used *? (lazy) which could still capture middle names when the
# lookahead didn't trigger soon enough. Limiting to {0,2} prevents this.
# "my father Walter Murray was..." → "Walter Murray" (not "Walter Fletcher Murray")
_PARENT_FATHER = re.compile(
    r'(?:my\s+(?:father|dad|papa|pop))\s+(?:(?:was|is|,)\s+)?([A-Z][a-z]+(?:\s+(?:Van\s+)?[A-Z][a-z]+){0,2}?)(?=\s+(?:was|is|had|who|and|worked|did|ran|taught|,)|[.,]|\s*$)',
    re.IGNORECASE
)
_PARENT_MOTHER = re.compile(
    r'(?:my\s+(?:mother|mom|mama|ma|mum))\s+(?:(?:was|is|,)\s+)?([A-Z][a-z]+(?:\s+(?:Van\s+)?[A-Z][a-z]+){0,2}?)(?=\s+(?:was|is|had|who|and|worked|did|ran|taught|,)|[.,]|\s*$)',
    re.IGNORECASE
)

# Sibling patterns — v8.0 FIX: handle "a younger brother named Chris", "my older sister Jane"
# Supports optional "named/called/who" bridge words before the actual name.
_SIBLING = re.compile(
    r'(?:(?:my|an?)\s+(?:\w+\s+)*?(?:brother|sister|sibling))\s+(?:(?:named|called|who\s+was)\s+)?([A-Z][a-z]+)',
    re.IGNORECASE
)
_SIBLING_NOT_NAME = {"named", "called", "who", "was", "is", "had", "and", "the", "that", "but", "in", "at", "from", "with", "about"}

# FIX-5: Sibling list patterns — handle coordinated pairs and comma-separated lists.
# Matches patterns like: "brothers Hi, Joe, and Harry", "my brother Roger and my sister Mary"
# FIX-5d: Require either 'my' prefix for singular OR plural form to prevent
# false matches like "sister Dorothy, and" being treated as a name list.
_SIBLING_LIST = re.compile(
    r'(?:my\s+(?:brothers?|sisters?|siblings?)|(?:brothers|sisters|siblings))\s+'
    r'(?:(?:named|called|were|,|:)\s+)*'
    r'([A-Z][a-z]+(?:(?:\s*,?\s+and\s+|\s*,\s*)[A-Z][a-z]+)+)',
    re.IGNORECASE
)
# Matches coordinated pairs: "my brother Roger and my sister Mary"
_SIBLING_PAIR = re.compile(
    r'my\s+(?:\w+\s+)?(brother|sister)\s+(?:(?:named|called)\s+)?([A-Z][a-z]+)\s+and\s+my\s+(?:\w+\s+)?(brother|sister)\s+(?:(?:named|called)\s+)?([A-Z][a-z]+)',
    re.IGNORECASE
)

# Occupation patterns — v8.0 FIX: also match "was a PE teacher", "was a hairdresser"
_OCCUPATION = re.compile(
    r'(?:(?:he|she|father|mother|dad|mom|mum)\s+(?:was|worked as|did|ran)\s+(?:a\s+)?)([\w\s]+?)(?:\.|,|\s+(?:in|and|for|at|who))',
    re.IGNORECASE
)
# v8.0: Also match "father/mother [Name] was a [occupation]" pattern
# FIX-6c: Use (?:\w+\s+){1,3} to handle multi-word names like "Walter Barker"
# but cap at 3 words to prevent greedy consumption of the entire sentence
# (e.g. "father Walter Barker was ... and my mother Mary Van Horne was ...")
_PARENT_OCCUPATION = re.compile(
    r'(?:my\s+(?:father|dad|papa|pop|mother|mom|mama|ma|mum))\s+(?:\w+\s+){1,3}(?:was|is|worked as)\s+(?:a\s+|an\s+)?([\w\s]+?)(?:\.|,|\s+(?:and|who|in))',
    re.IGNORECASE
)


def _extract_via_rules(answer: str, current_section: Optional[str], current_target: Optional[str]) -> List[dict]:
    """Fallback: regex-based extraction when LLM is unavailable."""
    items = []

    # Full name
    m = _NAME_FULL.search(answer)
    if m:
        items.append({"fieldPath": "personal.fullName", "value": m.group(1).strip(), "confidence": 0.85})

    # Date of birth
    m = _DATE_FULL.search(answer)
    if m:
        items.append({"fieldPath": "personal.dateOfBirth", "value": m.group(0).split("born")[-1].strip().strip(",. "), "confidence": 0.85})
    elif _DATE_YEAR.search(answer):
        m = _DATE_YEAR.search(answer)
        items.append({"fieldPath": "personal.dateOfBirth", "value": m.group(1), "confidence": 0.7})

    # Place of birth
    m = _PLACE_BORN.search(answer)
    if m:
        items.append({"fieldPath": "personal.placeOfBirth", "value": m.group(1).strip().rstrip(","), "confidence": 0.8})

    # Father
    m = _PARENT_FATHER.search(answer)
    if m:
        name = m.group(1).strip()
        items.append({"fieldPath": "parents.relation", "value": "Father", "confidence": 0.9})
        parts = name.split()
        items.append({"fieldPath": "parents.firstName", "value": parts[0], "confidence": 0.85})
        if len(parts) > 1:
            items.append({"fieldPath": "parents.lastName", "value": " ".join(parts[1:]), "confidence": 0.8})

    # Mother
    m = _PARENT_MOTHER.search(answer)
    if m:
        name = m.group(1).strip()
        items.append({"fieldPath": "parents.relation", "value": "Mother", "confidence": 0.9})
        parts = name.split()
        items.append({"fieldPath": "parents.firstName", "value": parts[0], "confidence": 0.85})
        if len(parts) > 1:
            items.append({"fieldPath": "parents.lastName", "value": " ".join(parts[1:]), "confidence": 0.8})

    # FIX-5: Sibling extraction — handle lists, pairs, and single siblings.
    sibling_items = []
    _sibling_extracted = False

    # Try coordinated pair first: "my brother Roger and my sister Mary"
    m_pair = _SIBLING_PAIR.search(answer)
    if m_pair:
        rel1 = m_pair.group(1).capitalize()
        name1 = m_pair.group(2).strip()
        rel2 = m_pair.group(3).capitalize()
        name2 = m_pair.group(4).strip()
        if name1.lower() not in _SIBLING_NOT_NAME:
            sibling_items.append({"fieldPath": "siblings.relation", "value": rel1, "confidence": 0.85})
            sibling_items.append({"fieldPath": "siblings.firstName", "value": name1, "confidence": 0.85})
        if name2.lower() not in _SIBLING_NOT_NAME:
            sibling_items.append({"fieldPath": "siblings.relation", "value": rel2, "confidence": 0.85})
            sibling_items.append({"fieldPath": "siblings.firstName", "value": name2, "confidence": 0.85})
        _sibling_extracted = True

    # Try comma/and-separated list: "brothers Hi, Joe, and Harry"
    if not _sibling_extracted:
        m_list = _SIBLING_LIST.search(answer)
        if m_list:
            names_str = m_list.group(1)
            # Parse comma/and-separated names
            # FIX-5b: Use ", and " as a single delimiter before plain "," or " and "
            # so that "Hi, Joe, and Harry" splits to ["Hi", "Joe", "Harry"]
            # instead of ["Hi", "Joe", "and Harry"] (where "and Harry" gets filtered).
            names = re.split(r'\s*,\s+and\s+|\s*,\s*|\s+and\s+', names_str)
            names = [n.strip() for n in names if n.strip() and n.strip()[0].isupper()]
            # Determine relation from the preceding word
            rel_match = re.search(r'(?:my\s+)?(?:\w+\s+)*(brothers?|sisters?|siblings?)', m_list.group(0), re.IGNORECASE)
            rel_word = (rel_match.group(1) if rel_match else "sibling").lower()
            if "brother" in rel_word:
                rel = "Brother"
            elif "sister" in rel_word:
                rel = "Sister"
            else:
                rel = "Sibling"
            for name in names:
                if name.lower() not in _SIBLING_NOT_NAME:
                    sibling_items.append({"fieldPath": "siblings.relation", "value": rel, "confidence": 0.85})
                    sibling_items.append({"fieldPath": "siblings.firstName", "value": name, "confidence": 0.85})
            if sibling_items:
                _sibling_extracted = True

    # Fallback: single/multiple sibling pattern via finditer
    # FIX-5c: Use finditer instead of search to catch ALL sibling mentions,
    # e.g. "a brother Roger and a sister Dorothy" yields both Roger and Dorothy.
    if not _sibling_extracted:
        for m in _SIBLING.finditer(answer):
            sib_name = m.group(1).strip()
            if sib_name.lower() not in _SIBLING_NOT_NAME:
                # Extract relation from THIS match's text only (not preceding context)
                match_text = m.group(0)
                rel_match = re.search(r'(brother|sister|sibling)', match_text, re.IGNORECASE)
                rel = rel_match.group(1).capitalize() if rel_match else "Sibling"
                sibling_items.append({"fieldPath": "siblings.relation", "value": rel, "confidence": 0.85})
                sibling_items.append({"fieldPath": "siblings.firstName", "value": sib_name, "confidence": 0.85})

    items.extend(sibling_items)

    # FIX-6b: Helper to strip article prefixes from occupations
    def _clean_occupation(val):
        val = val.strip()
        # Strip leading "a " or "an " article prefix
        val = re.sub(r'^(?:an?\s+)', '', val, flags=re.IGNORECASE)
        return val.strip()

    # FIX-4: Parent occupations — tag with _parentType so we can group with the correct parent.
    # This replaces the old approach of appending occupations after both parents' names,
    # which caused the frontend's duplicate-field detection to misassign them.
    father_occupation = None
    mother_occupation = None
    for occ_match in re.finditer(_PARENT_OCCUPATION, answer):
        occ_val = _clean_occupation(occ_match.group(1))
        parent_ctx = answer[max(0, occ_match.start()-30):occ_match.start()].lower()
        match_text = occ_match.group(0).lower()
        if any(w in parent_ctx or w in match_text for w in ["father", "dad", "papa", "pop"]):
            father_occupation = occ_val
        elif any(w in parent_ctx or w in match_text for w in ["mother", "mom", "mama", "ma", "mum"]):
            mother_occupation = occ_val

    # FIX-4: Reorder items so each parent's fields are contiguous (relation, firstName, lastName, occupation).
    # This ensures the frontend's duplicate-field counter bumps at the right time.
    reordered = []
    father_items = [i for i in items if i["fieldPath"].startswith("parents.") and i.get("_parentType") == "father"]
    mother_items = [i for i in items if i["fieldPath"].startswith("parents.") and i.get("_parentType") == "mother"]
    other_items = [i for i in items if not i["fieldPath"].startswith("parents.") or "_parentType" not in i]

    # Tag father/mother items from the name extraction above
    # The name extraction doesn't tag _parentType, so we need to split by discovery order:
    # First batch of parents.* items = father (if father was matched), second = mother
    parent_items = [i for i in items if i["fieldPath"].startswith("parents.")]
    non_parent_items = [i for i in items if not i["fieldPath"].startswith("parents.")]

    # Split parent items into father group and mother group
    father_group = []
    mother_group = []
    seen_relations = set()
    current_group = None
    for pi in parent_items:
        if pi["fieldPath"] == "parents.relation":
            val_lower = pi["value"].lower()
            if val_lower == "father":
                current_group = "father"
            elif val_lower == "mother":
                current_group = "mother"
        if current_group == "father":
            father_group.append(pi)
        elif current_group == "mother":
            mother_group.append(pi)

    # Append occupations to the correct parent group
    if father_occupation:
        father_group.append({"fieldPath": "parents.occupation", "value": father_occupation, "confidence": 0.8})
    if mother_occupation:
        mother_group.append({"fieldPath": "parents.occupation", "value": mother_occupation, "confidence": 0.8})

    # Rebuild items: non-parent first, then father group, then mother group
    items = non_parent_items + father_group + mother_group

    # If we have a current target and found nothing matching it, project the full answer
    if current_target and not any(i["fieldPath"] == current_target for i in items):
        base = re.sub(r'\[\d+\]', '', current_target)
        if base in EXTRACTABLE_FIELDS:
            items.append({
                "fieldPath": base,
                "value": answer.strip(),
                "confidence": 0.7
            })

    return items


# ── Repeatable field grouping ────────────────────────────────────────────────

def _group_repeatable_items(items: List[dict]) -> List[dict]:
    """Group repeatable fields by person reference.

    When the LLM extracts e.g. parents.firstName + parents.lastName for the
    same parent, they need the same entry index. The frontend handles indexing,
    but we group them so same-person fields travel together.

    Strategy: group by repeatable section. Fields from the same section in the
    same answer are assumed to be about the same person (unless there are
    multiple names indicating different people).
    """
    non_repeatable = []
    repeatable_groups: Dict[str, List[dict]] = {}  # section → [items]

    for item in items:
        meta = EXTRACTABLE_FIELDS.get(item["fieldPath"], {})
        section = meta.get("repeatable")
        if section:
            repeatable_groups.setdefault(section, []).append(item)
        else:
            non_repeatable.append(item)

    # Check for multiple distinct people in the same section
    result = list(non_repeatable)
    for section, group in repeatable_groups.items():
        # Check if we have multiple first names → multiple people
        first_names = [i["value"] for i in group if i["fieldPath"].endswith(".firstName")]
        if len(first_names) > 1:
            # Multiple people: split into groups by first name occurrence in answer
            # Mark each group with a _group index so the frontend can assign separate indices
            for idx, name in enumerate(first_names):
                for item in group:
                    # Assign group based on whether this item is associated with this name
                    # Simple heuristic: firstName gets its own group, other fields get grouped
                    # with the most recently seen firstName
                    if item["fieldPath"].endswith(".firstName") and item["value"] == name:
                        item["_repeatableGroup"] = f"{section}_{idx}"
                    elif item.get("_repeatableGroup") is None:
                        item["_repeatableGroup"] = f"{section}_{idx}"
                result.extend(group)
        else:
            # Single person: all fields share same entry index
            group_id = f"{section}_0"
            for item in group:
                item["_repeatableGroup"] = group_id
            result.extend(group)

    return result


# ── Main endpoint ────────────────────────────────────────────────────────────

@router.post("/extract-fields", response_model=ExtractFieldsResponse)
def extract_fields(req: ExtractFieldsRequest) -> ExtractFieldsResponse:
    """Extract multiple structured fields from a conversational answer."""
    answer = (req.answer or "").strip()
    if not answer:
        return ExtractFieldsResponse(items=[], method="fallback")

    # Try LLM extraction first
    logger.info("[extract] Attempting LLM extraction for person=%s, section=%s, target=%s",
                req.person_id[:8] if req.person_id else "?",
                req.current_section, req.current_target_path)
    llm_items, raw_output = _extract_via_llm(
        answer=answer,
        current_section=req.current_section,
        current_target=req.current_target_path,
    )

    # WO: Summary line — log outcome at endpoint level
    _accepted = len(llm_items) if llm_items else 0
    _method = "llm" if llm_items else ("rules-fallback" if raw_output else "no-llm")
    logger.info("[extract][summary] llm_raw=%s accepted=%d method=%s",
                "present" if raw_output else "none", _accepted, _method)

    # Phase G: Load protected identity snapshot for conflict detection
    _protected_snapshot = {}
    if req.person_id:
        try:
            from ..db import get_narrator_state_snapshot
            snap = get_narrator_state_snapshot(req.person_id)
            _protected_snapshot = snap.get("protected_identity", {}) if snap else {}
        except Exception as e:
            logger.warning("[extract] Phase G: Could not load protected identity snapshot: %s", e)

    if llm_items:
        logger.info("[extract] LLM returned %d items", len(llm_items))
        # Add writeMode from our schema
        result_items = []
        for item in llm_items:
            meta = EXTRACTABLE_FIELDS.get(item["fieldPath"], {})
            write_mode = meta.get("writeMode", "suggest_only")

            # Phase G: Protected identity field conflict detection
            if item["fieldPath"] in PROTECTED_IDENTITY_FIELDS:
                canonical_val = _protected_snapshot.get(item["fieldPath"], "")
                if canonical_val and canonical_val.strip() and item["value"] != canonical_val:
                    write_mode = "suggest_only"
                    logger.warning(
                        "[extract] Phase G: Protected identity conflict for %s: canonical=%r extracted=%r — downgraded to suggest_only",
                        item["fieldPath"], canonical_val, item["value"],
                    )

            result_items.append(ExtractedItem(
                fieldPath=item["fieldPath"],
                value=item["value"],
                writeMode=write_mode,
                confidence=item["confidence"],
                source="backend_extract",
                extractionMethod="llm",
            ))

        # Group repeatable fields — FIX-4: preserve _repeatableGroup as repeatableGroup
        grouped = _group_repeatable_items([i.model_dump() for i in result_items])
        final_items = []
        for item in grouped:
            rg = item.pop("_repeatableGroup", None)
            ei = ExtractedItem(**item)
            ei.repeatableGroup = rg
            final_items.append(ei)

        _record_metric("llm", parsed=len(llm_items), accepted=len(final_items), rejected=0)
        return ExtractFieldsResponse(
            items=final_items,
            method="llm",
            raw_llm_output=raw_output,
        )

    # Fallback: rules-based extraction (still include raw_llm_output for debugging)
    logger.warning("[extract] LLM extraction returned no items (raw_output=%s), falling back to rules",
                   "present" if raw_output else "None")
    rules_items = _extract_via_rules(
        answer=answer,
        current_section=req.current_section,
        current_target=req.current_target_path,
    )

    if rules_items:
        result_items = []
        for item in rules_items:
            meta = EXTRACTABLE_FIELDS.get(item["fieldPath"], {})
            write_mode = meta.get("writeMode", "suggest_only")

            # Phase G: Protected identity field conflict detection (rules path)
            if item["fieldPath"] in PROTECTED_IDENTITY_FIELDS:
                canonical_val = _protected_snapshot.get(item["fieldPath"], "")
                if canonical_val and canonical_val.strip() and item["value"] != canonical_val:
                    write_mode = "suggest_only"
                    logger.warning(
                        "[extract] Phase G: Protected identity conflict (rules) for %s: canonical=%r extracted=%r",
                        item["fieldPath"], canonical_val, item["value"],
                    )

            result_items.append(ExtractedItem(
                fieldPath=item["fieldPath"],
                value=item["value"],
                writeMode=write_mode,
                confidence=item["confidence"],
                source="backend_extract",
                extractionMethod="rules",
            ))

        _record_metric("rules", parsed=0, accepted=len(result_items), rejected=0)
        return ExtractFieldsResponse(
            items=result_items,
            method="rules",
            raw_llm_output=raw_output,  # include for debugging even on rules fallback
        )

    # Nothing extracted — return empty
    _record_metric("fallback", parsed=0, accepted=0, rejected=0)
    return ExtractFieldsResponse(items=[], method="fallback", raw_llm_output=raw_output)


# ── Diagnostic endpoint ─────────────────────────────────────────────────────

@router.get("/extract-diag")
def extract_diag():
    """Diagnostic: check whether the LLM extraction stack is available."""
    llm_available = False
    llm_error = None
    cache_age = _time.time() - _llm_available_cache["checked_at"]
    try:
        from ..llm_interview import _try_call_llm
        # Quick ping: tiny extraction to see if LLM responds
        result = _try_call_llm(
            "Return exactly: {\"status\":\"ok\"}",
            "ping",
            max_new=20, temp=0.01, top_p=1.0,
        )
        if result:
            llm_available = True
            _mark_llm_available()
        else:
            llm_error = "LLM returned None (likely ImportError or empty response)"
            _mark_llm_unavailable("diag-empty-response")
    except ImportError as e:
        llm_error = f"ImportError: {e}"
        _mark_llm_unavailable(f"diag-import-error:{e}")
    except Exception as e:
        llm_error = f"{type(e).__name__}: {e}"
        _mark_llm_unavailable(f"diag-exception:{type(e).__name__}")

    return {
        "llm_available": llm_available,
        "llm_error": llm_error,
        "llm_cache_available": _llm_available_cache["available"],
        "llm_cache_age_sec": round(cache_age, 2),
        "llm_cache_ttl_sec": _LLM_CHECK_TTL,
        "rules_available": True,
        "regex_pattern_count": len([
            k for k in globals() if k.startswith("_") and k[1:2].isupper()
        ]),
        # Phase 6B: Extraction metrics
        "metrics": {
            "total_turns": _extraction_metrics["total_turns"],
            "llm_turns": _extraction_metrics["llm_turns"],
            "rules_turns": _extraction_metrics["rules_turns"],
            "fallback_turns": _extraction_metrics["fallback_turns"],
            "llm_ratio": round(
                _extraction_metrics["llm_turns"] / max(1, _extraction_metrics["total_turns"]), 3
            ),
            "total_parsed": _extraction_metrics["total_parsed"],
            "total_accepted": _extraction_metrics["total_accepted"],
            "total_rejected": _extraction_metrics["total_rejected"],
            "acceptance_ratio": round(
                _extraction_metrics["total_accepted"] /
                max(1, _extraction_metrics["total_parsed"] + _extraction_metrics["total_accepted"]), 3
            ),
            "reject_reasons": dict(_extraction_metrics["reject_reasons"]),
        },
    }
