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
    "siblings.birthOrder":            {"label": "Sibling birth order (older/younger)", "writeMode": "candidate_only", "repeatable": "siblings"},
    "siblings.uniqueCharacteristics": {"label": "Sibling unique characteristics", "writeMode": "candidate_only", "repeatable": "siblings"},
}


# ── LLM availability cache ──────────────────────────────────────────────────
# Avoid blocking the server when the LLM is known to be unavailable.
# Once checked, cache the result for LLM_CHECK_TTL seconds before rechecking.

import time as _time

_llm_available_cache: dict = {"available": None, "checked_at": 0.0}
_LLM_CHECK_TTL = 120  # seconds — recheck every 2 minutes


def _is_llm_available() -> bool:
    """Return True if the LLM stack is responsive, using cached result."""
    now = _time.time()
    if _llm_available_cache["available"] is not None and (now - _llm_available_cache["checked_at"]) < _LLM_CHECK_TTL:
        return _llm_available_cache["available"]

    # Quick probe — tiny prompt, low max_new, should return fast
    try:
        from ..llm_interview import _try_call_llm
        result = _try_call_llm(
            "Return exactly: {\"status\":\"ok\"}",
            "ping",
            max_new=20, temp=0.0, top_p=1.0,
        )
        available = result is not None
    except Exception:
        available = False

    _llm_available_cache["available"] = available
    _llm_available_cache["checked_at"] = now
    logger.info("[extract] LLM availability check: %s", "available" if available else "unavailable")
    return available


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
        f"Fields: {compact_catalog}"
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
    raw = _try_call_llm(system, user, max_new=400, temp=0.15, top_p=0.9)
    if not raw:
        # LLM returned empty — mark as unavailable for caching
        _llm_available_cache["available"] = False
        _llm_available_cache["checked_at"] = _time.time()
        return [], None

    # Parse JSON from LLM output
    items = _parse_llm_json(raw)
    return items, raw


def _parse_llm_json(raw: str) -> List[dict]:
    """Parse JSON array from LLM output, handling various formats."""
    raw = raw.strip()

    # Try direct JSON parse
    try:
        arr = json.loads(raw)
        if isinstance(arr, list):
            return [_validate_item(x) for x in arr if _validate_item(x)]
    except json.JSONDecodeError:
        pass

    # Try extracting JSON array from markdown code block
    m = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', raw, re.DOTALL)
    if m:
        try:
            arr = json.loads(m.group(1))
            if isinstance(arr, list):
                return [_validate_item(x) for x in arr if _validate_item(x)]
        except json.JSONDecodeError:
            pass

    # Try finding first [ ... ] in the output
    m = re.search(r'\[.*\]', raw, re.DOTALL)
    if m:
        try:
            arr = json.loads(m.group(0))
            if isinstance(arr, list):
                return [_validate_item(x) for x in arr if _validate_item(x)]
        except json.JSONDecodeError:
            pass

    return []


def _validate_item(item: Any) -> Optional[dict]:
    """Validate and normalize a single extraction item."""
    if not isinstance(item, dict):
        return None
    fp = (item.get("fieldPath") or "").strip()
    val = (item.get("value") or "").strip()
    if not fp or not val:
        return None

    # Validate fieldPath exists in our schema
    # For repeatable fields, strip any index: "parents[0].firstName" → "parents.firstName"
    base_path = re.sub(r'\[\d+\]', '', fp)
    if base_path not in EXTRACTABLE_FIELDS:
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
_PLACE_BORN = re.compile(
    r'\b(?:born|raised|grew up|lived)\s+(?:\w+\s+)*?(?:in|at|near)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,?\s+(?:and|my|I|we|the|where|when|\d))',
    re.IGNORECASE
)

# Name patterns
_NAME_FULL = re.compile(
    r"(?:my name is|I'm|I am|name was|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})",
    re.IGNORECASE
)

# Parent patterns — v8.0 FIX: match "my father Joe" but stop before verbs/conjunctions
# The capture group uses a lookahead to stop at was/is/had/who/and/,/. to avoid
# pulling verbs into the name (e.g. "my father Joe was a teacher" → "Joe" not "Joe was").
_PARENT_FATHER = re.compile(
    r'(?:my\s+(?:father|dad|papa|pop))\s+(?:(?:was|is|,)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?=\s+(?:was|is|had|who|and|worked|did|ran|taught|,)|[.,]|\s*$)',
    re.IGNORECASE
)
_PARENT_MOTHER = re.compile(
    r'(?:my\s+(?:mother|mom|mama|ma|mum))\s+(?:(?:was|is|,)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?=\s+(?:was|is|had|who|and|worked|did|ran|taught|,)|[.,]|\s*$)',
    re.IGNORECASE
)

# Sibling patterns — v8.0 FIX: handle "a younger brother named Chris", "my older sister Jane"
# Supports optional "named/called/who" bridge words before the actual name.
_SIBLING = re.compile(
    r'(?:(?:my|a)\s+(?:\w+\s+)*?(?:brother|sister|sibling))\s+(?:(?:named|called|who\s+was)\s+)?([A-Z][a-z]+)',
    re.IGNORECASE
)
_SIBLING_NOT_NAME = {"named", "called", "who", "was", "is", "had", "and", "the", "that", "but", "in", "at", "from", "with", "about"}

# Occupation patterns — v8.0 FIX: also match "was a PE teacher", "was a hairdresser"
_OCCUPATION = re.compile(
    r'(?:(?:he|she|father|mother|dad|mom|mum)\s+(?:was|worked as|did|ran)\s+(?:a\s+)?)([\w\s]+?)(?:\.|,|\s+(?:in|and|for|at|who))',
    re.IGNORECASE
)
# v8.0: Also match "father/mother [Name] was a [occupation]" pattern
_PARENT_OCCUPATION = re.compile(
    r'(?:my\s+(?:father|dad|papa|pop|mother|mom|mama|ma|mum))\s+\w+\s+(?:was|is|worked as)\s+(?:a\s+)?([\w\s]+?)(?:\.|,|\s+(?:and|who|in))',
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

    # Sibling
    m = _SIBLING.search(answer)
    if m:
        sib_name = m.group(1).strip()
        # Filter out common words that aren't names (e.g. "named" captured before actual name)
        if sib_name.lower() not in _SIBLING_NOT_NAME:
            rel_match = re.search(r'(?:my|a)\s+(?:\w+\s+)*?(brother|sister|sibling)', answer, re.IGNORECASE)
            rel = rel_match.group(1).capitalize() if rel_match else "Sibling"
            items.append({"fieldPath": "siblings.relation", "value": rel, "confidence": 0.85})
            items.append({"fieldPath": "siblings.firstName", "value": sib_name, "confidence": 0.85})

    # v8.0 FIX: Parent occupations (e.g. "my father Joe was a PE teacher")
    m_occ = _PARENT_OCCUPATION.findall(answer)
    if m_occ:
        # Match occupation to parent (father vs mother)
        for occ_match in re.finditer(_PARENT_OCCUPATION, answer):
            occ_val = occ_match.group(1).strip()
            parent_ctx = answer[max(0, occ_match.start()-30):occ_match.start()].lower()
            if any(w in parent_ctx or w in occ_match.group(0).lower() for w in ["father", "dad", "papa", "pop"]):
                items.append({"fieldPath": "parents.occupation", "value": occ_val, "confidence": 0.8})
            elif any(w in parent_ctx or w in occ_match.group(0).lower() for w in ["mother", "mom", "mama", "ma", "mum"]):
                items.append({"fieldPath": "parents.occupation", "value": occ_val, "confidence": 0.8})

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

    if llm_items:
        logger.info("[extract] LLM returned %d items", len(llm_items))
        # Add writeMode from our schema
        result_items = []
        for item in llm_items:
            meta = EXTRACTABLE_FIELDS.get(item["fieldPath"], {})
            result_items.append(ExtractedItem(
                fieldPath=item["fieldPath"],
                value=item["value"],
                writeMode=meta.get("writeMode", "suggest_only"),
                confidence=item["confidence"],
                source="backend_extract",
                extractionMethod="llm",
            ))

        # Group repeatable fields
        grouped = _group_repeatable_items([i.model_dump() for i in result_items])
        final_items = [ExtractedItem(**{k: v for k, v in item.items() if k != "_repeatableGroup"}) for item in grouped]

        return ExtractFieldsResponse(
            items=final_items,
            method="llm",
            raw_llm_output=raw_output,
        )

    # Fallback: rules-based extraction
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
            result_items.append(ExtractedItem(
                fieldPath=item["fieldPath"],
                value=item["value"],
                writeMode=meta.get("writeMode", "suggest_only"),
                confidence=item["confidence"],
                source="backend_extract",
                extractionMethod="rules",
            ))

        return ExtractFieldsResponse(
            items=result_items,
            method="rules",
        )

    # Nothing extracted — return empty
    return ExtractFieldsResponse(items=[], method="fallback")


# ── Diagnostic endpoint ─────────────────────────────────────────────────────

@router.get("/extract-diag")
def extract_diag():
    """Diagnostic: check whether the LLM extraction stack is available."""
    llm_available = False
    llm_error = None
    try:
        from ..llm_interview import _try_call_llm
        # Quick ping: tiny extraction to see if LLM responds
        result = _try_call_llm(
            "Return exactly: {\"status\":\"ok\"}",
            "ping",
            max_new=20, temp=0.0, top_p=1.0,
        )
        if result:
            llm_available = True
        else:
            llm_error = "LLM returned None (likely ImportError or empty response)"
    except ImportError as e:
        llm_error = f"ImportError: {e}"
    except Exception as e:
        llm_error = f"{type(e).__name__}: {e}"

    return {
        "llm_available": llm_available,
        "llm_error": llm_error,
        "rules_available": True,
        "regex_pattern_count": len([
            k for k in globals() if k.startswith("_") and k[1:2].isupper()
        ]),
    }
