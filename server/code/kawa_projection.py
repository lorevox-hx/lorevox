"""
kawa_projection.py — Generate provisional Kawa proposals from anchor/profile/timeline
WO-KAWA-UI-01A

Produces a segment skeleton with empty/low-confidence constructs.
The narrator fills in meaning; Lori proposes, narrator confirms.
"""

import time
import hashlib


def _seg_id(anchor: dict) -> str:
    """Deterministic segment ID from anchor properties."""
    raw = f"{anchor.get('type')}|{anchor.get('ref_id')}|{anchor.get('label')}|{anchor.get('year')}"
    return "seg_" + hashlib.md5(raw.encode("utf-8")).hexdigest()[:12]


def derive_water(profile: dict, anchor: dict) -> dict:
    """Propose initial flow state. Empty until LLM or narrator fills it."""
    return {
        "summary": "",
        "flow_state": "unknown",
        "confidence": 0.0
    }


def derive_rocks(profile: dict, anchor: dict) -> list:
    """Propose initial rocks. Empty until LLM or narrator fills them."""
    return []


def derive_driftwood(profile: dict, anchor: dict) -> list:
    """Propose initial driftwood. Empty until LLM or narrator fills them."""
    return []


def derive_banks(profile: dict, anchor: dict) -> dict:
    """Propose initial banks. Four standard categories, empty until filled."""
    return {
        "social": [],
        "physical": [],
        "cultural": [],
        "institutional": []
    }


def derive_spaces(profile: dict, anchor: dict) -> list:
    """Propose initial spaces. Empty until LLM or narrator fills them."""
    return []


def build_kawa_projection(
    person_id: str,
    anchor: dict,
    profile: dict | None = None,
    timeline: list | None = None
):
    """
    Build a full Kawa segment skeleton from an anchor point.

    The segment starts with all-empty constructs and low confidence.
    LLM enrichment and narrator confirmation come later in the pipeline.
    """
    profile = profile or {}
    seg_id = _seg_id(anchor)
    return {
        "segment_id": seg_id,
        "person_id": person_id,
        "anchor": anchor,
        "kawa": {
            "water": derive_water(profile, anchor),
            "rocks": derive_rocks(profile, anchor),
            "driftwood": derive_driftwood(profile, anchor),
            "banks": derive_banks(profile, anchor),
            "spaces": derive_spaces(profile, anchor)
        },
        "narrator_note": "",
        "narrator_quote": "",
        "provenance": {
            "source": "lori_proposed",
            "session_id": None,
            "created_at": time.time(),
            "updated_at": time.time(),
            "confirmed": False,
            "confirmed_by": None
        },
        "history": []
    }
