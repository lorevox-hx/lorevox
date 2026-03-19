"""Minimal reflection layer for Lorevox agent-loop v1."""

from __future__ import annotations

import re
from typing import Any, Dict, List

from .policies import classify_message

WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-']+")
STOP = {
    "the", "and", "that", "with", "have", "from", "this", "they", "were",
    "about", "when", "what", "your", "their", "there", "then", "into", "just",
}


def run_reflection(
    *,
    person_id: str,
    session_id: str,
    message: str,
    llm_output: Dict[str, Any],
    tool_results: List[Dict[str, Any]],
    context: Dict[str, Any],
    write_plan: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Create compact post-turn artifacts.

    v1 stays heuristic and conservative:
    - one turn summary
    - small tag set
    - candidate write instructions only
    """
    meta = classify_message(message)
    tags = _extract_tags(message)
    summary = _build_turn_summary(message=message, meta=meta, tool_results=tool_results)

    reflection_write_plan = list(write_plan)
    reflection_write_plan.append(
        {
            "kind": "turn_summary",
            "reason": "post_turn_reflection",
            "text": summary,
        }
    )

    if meta.get("is_biographical"):
        reflection_write_plan.append(
            {
                "kind": "candidate_memory",
                "reason": "biographical_turn",
                "text": message[:400],
                "tags": tags,
            }
        )

    if meta.get("has_year") or meta.get("has_date_language"):
        reflection_write_plan.append(
            {
                "kind": "candidate_timeline_suggestion",
                "reason": "timeline_cue",
                "text": message[:400],
                "preserve_uncertainty": meta.get("has_uncertainty", False),
            }
        )

    if meta.get("has_kinship"):
        reflection_write_plan.append(
            {
                "kind": "candidate_relational_note",
                "reason": "kinship_detected",
                "text": message[:400],
            }
        )

    return {
        "person_id": person_id,
        "session_id": session_id,
        "turn_summary": summary,
        "tags": tags,
        "tool_summaries": [r.get("summary") for r in tool_results if r.get("summary")],
        "write_plan": reflection_write_plan,
        "assistant_intent": llm_output.get("intent"),
        "follow_up_hint": _follow_up_hint(context=context, meta=meta),
    }


def _build_turn_summary(*, message: str, meta: Dict[str, Any], tool_results: List[Dict[str, Any]]) -> str:
    parts = []
    if meta.get("is_biographical"):
        parts.append("User shared a biographical detail")
    else:
        parts.append("User sent a conversational turn")

    if meta.get("has_kinship"):
        parts.append("with relational/family context")
    if meta.get("has_year") or meta.get("has_date_language"):
        parts.append("including timeline cues")
    if meta.get("has_uncertainty"):
        parts.append("with uncertainty that should be preserved")
    if tool_results:
        parts.append(f"and {len(tool_results)} tool result(s) were available")

    return " ".join(parts) + "."


def _extract_tags(message: str, limit: int = 6) -> List[str]:
    words = [w.lower() for w in WORD_RE.findall(message)]
    ranked = []
    seen = set()
    for w in words:
        if len(w) < 4 or w in STOP or w in seen:
            continue
        seen.add(w)
        ranked.append(w)
    return ranked[:limit]


def _follow_up_hint(*, context: Dict[str, Any], meta: Dict[str, Any]) -> str | None:
    if meta.get("has_uncertainty") and (meta.get("has_year") or meta.get("has_date_language")):
        return "Ask for surrounding life anchors rather than pressing for exact dates."
    if meta.get("has_kinship"):
        return "Clarify names, roles, and how this person relates to the narrator."
    if context.get("safety_context", {}).get("softened_mode"):
        return "Keep the next response gentle and non-pressuring."
    return None
