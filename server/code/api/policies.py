"""Minimal policy heuristics for Lorevox agent-loop v1."""

from __future__ import annotations

import re
from typing import Any, Dict, List

YEAR_RE = re.compile(r"\b(18|19|20)\d{2}\b")
KINSHIP_RE = re.compile(
    r"\b(mother|mom|father|dad|grandma|grandmother|grandpa|grandfather|aunt|uncle|cousin|sister|brother|wife|husband|partner|daughter|son)\b",
    re.IGNORECASE,
)
UNCERTAINTY_RE = re.compile(r"\b(maybe|perhaps|around|about|I think|not sure|unsure|might have)\b", re.IGNORECASE)
DATE_WORD_RE = re.compile(r"\b(before|after|during|when I was|at age|in high school|in college|summer|winter|spring|fall)\b", re.IGNORECASE)


def classify_message(message: str) -> Dict[str, Any]:
    lowered = message.lower()
    return {
        "has_year": bool(YEAR_RE.search(message)),
        "has_kinship": bool(KINSHIP_RE.search(message)),
        "has_uncertainty": bool(UNCERTAINTY_RE.search(message)),
        "has_date_language": bool(DATE_WORD_RE.search(message)),
        "is_biographical": _looks_biographical(lowered),
        "is_emotional": _looks_emotional(lowered),
    }


def should_run_rag(*, message: str, message_meta: Dict[str, Any], recalled: Dict[str, Any]) -> bool:
    if message_meta.get("has_year") or message_meta.get("has_date_language"):
        return True
    if message_meta.get("has_kinship") and message_meta.get("is_biographical"):
        return True
    recalled_items = recalled.get("items", []) if isinstance(recalled, dict) else []
    return len(recalled_items) == 0 and len(message.split()) > 8


def should_soften_tone(*, affect_context: Dict[str, Any], safety_context: Dict[str, Any]) -> bool:
    if safety_context.get("softened_mode"):
        return True
    return affect_context.get("recent_state") in {"reflective", "moved", "distressed", "overwhelmed"}


def build_write_plan_from_message(*, message: str, message_meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    plan: List[Dict[str, Any]] = []

    if not message_meta.get("is_biographical"):
        return plan

    if message_meta.get("is_emotional") and not (message_meta.get("has_year") or message_meta.get("has_date_language")):
        plan.append(
            {
                "kind": "session_note",
                "reason": "emotional_context",
                "text": message[:400],
            }
        )
        return plan

    if message_meta.get("has_year") or message_meta.get("has_date_language"):
        plan.append(
            {
                "kind": "timeline_sensitive",
                "reason": "date_cue",
                "text": message[:400],
                "preserve_uncertainty": message_meta.get("has_uncertainty", False),
            }
        )

    if message_meta.get("has_kinship"):
        plan.append(
            {
                "kind": "relational",
                "reason": "kinship_cue",
                "text": message[:400],
            }
        )

    if not plan:
        plan.append(
            {
                "kind": "persistent_candidate",
                "reason": "biographical_detail",
                "text": message[:400],
            }
        )

    return plan


def _looks_biographical(text: str) -> bool:
    cues = [
        "i was",
        "we were",
        "my ",
        "grew up",
        "born",
        "worked",
        "married",
        "moved",
        "school",
        "college",
        "family",
    ]
    return any(c in text for c in cues)


def _looks_emotional(text: str) -> bool:
    cues = [
        "sad",
        "hard",
        "difficult",
        "upset",
        "hurt",
        "cry",
        "scared",
        "afraid",
        "grief",
        "trauma",
        "love",
        "miss",
    ]
    return any(c in text for c in cues)
