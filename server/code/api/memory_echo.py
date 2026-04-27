"""
WO-ARCH-07A Patch Set 2 — Memory Echo correction parsing module.

Provides:
  - Rule-based correction parsing (deterministic, no LLM)
  - One structured retry helper for near-valid JSON
  - Extraction hint schema for correction-facing fields
"""
import json
import re
from typing import Any, Callable, Dict, Optional, Tuple


# ── Extraction hints for correction-critical fields ─────────────────────────
# These are PARSE-style hints: one sentence describing what the field contains,
# so the LLM (or a future constrained decoder) knows what shape to expect.
CORRECTION_SCHEMA_HINTS: Dict[str, str] = {
    "identity.full_name": "Narrator's full legal or primary name as explicitly corrected by the narrator.",
    "identity.preferred_name": "Narrator's preferred everyday name or nickname if explicitly corrected.",
    "identity.date_of_birth": "Narrator's date of birth exactly as corrected, preserving month/day/year precision if given.",
    "identity.place_of_birth": "Narrator's birthplace city/state/country exactly as corrected.",
    "family.children.count": "The number of narrator's children if explicitly corrected.",
    "education_work.retirement": "Narrator's retirement status or correction to retirement wording.",
}


def _safe_json_load(raw: str) -> Any:
    """Parse JSON, stripping markdown fences if the model wrapped its output."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Strip ```json ... ``` or ``` ... ```
        lines = cleaned.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return json.loads(cleaned)


def _extract_json_retry(
    llm_call: Callable[[str], str],
    prompt: str,
) -> Tuple[Optional[Any], Optional[str]]:
    """
    One retry only.

    Research-backed schema reflection: return structured error to the model once,
    then fail closed. This follows the Schema Reflection pattern from the
    validation research — structured error feedback for exactly one retry.
    """
    raw = llm_call(prompt)
    try:
        return _safe_json_load(raw), None
    except Exception as e1:
        retry_prompt = (
            prompt
            + "\n\nYour output was not valid JSON."
            + f"\nValidation error: {str(e1)}"
            + "\nReturn ONLY valid JSON matching the requested shape."
        )
        raw2 = llm_call(retry_prompt)
        try:
            return _safe_json_load(raw2), None
        except Exception as e2:
            return None, f"{e1}; retry_failed: {e2}"


def parse_correction_rule_based(text: str) -> Dict[str, Any]:
    """Deterministic rule-based correction parser.

    Extracts structured field updates from natural-language correction text.
    No LLM call. Returns a dict mapping field paths to corrected values.
    Empty dict means no correction could be parsed.
    """
    t = (text or "").strip()
    out: Dict[str, Any] = {}

    # Birthplace: "I was born in <place>"
    m = re.search(r"\bi was born in ([A-Za-z .,'-]+)$", t, re.I)
    if m:
        out["identity.place_of_birth"] = m.group(1).strip()

    # Father's name: "my father was <name>" or "my father's name was <name>"
    m = re.search(r"\bmy father(?:'s name)? was ([A-Za-z .,'-]+)$", t, re.I)
    if m:
        out["family.parents.father.name"] = m.group(1).strip()

    # Mother's name
    m = re.search(r"\bmy mother(?:'s name)? was ([A-Za-z .,'-]+)$", t, re.I)
    if m:
        out["family.parents.mother.name"] = m.group(1).strip()

    # Child count: "I had N children/kids/sons/daughters"
    m = re.search(r"\bi had (\d+) (?:children|kids|sons|daughters)\b", t, re.I)
    if m:
        out["family.children.count"] = int(m.group(1))

    # Child count present tense: "I have N children/kids"
    m = re.search(r"\bi have (\d+) (?:children|kids|sons|daughters)\b", t, re.I)
    if m:
        out["family.children.count"] = int(m.group(1))

    # Retirement: "I never really retired"
    m = re.search(r"\bi never (?:really )?retired\b", t, re.I)
    if m:
        out["education_work.retirement"] = "never fully retired"

    return out
