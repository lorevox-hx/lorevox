"""WO-LIFE-SPINE-05 — Phase-aware question composer.

Reads data/prompts/question_bank.json and picks phase-appropriate
questions for a narrator based on their current life phase. Single
entry point: pick_next_question().

Behavior when flag is OFF: this module is NEVER imported by any hot
path — interview.py imports it lazily inside a flag gate. So tonight's
code addition costs zero bytes of behavior change until tomorrow's
test flips the flag.

Design rules:
  1. Pure. No DB writes. No network. Question bank is loaded once
     per process and cached. If the file is missing or malformed,
     pick_next_question returns None and the caller falls back to
     the existing sequential db.get_next_question flow.

  2. Phase decision uses current age vs phase age_range (from the bank
     JSON). This intentionally mirrors school_phase_for_year's contract
     so one-vocab-wins. Bank phases are coarser (5 phases, 0-200 years)
     than spine phases (pre_school/elementary/...) — the bank carries
     spine_phase_mapping so we can bridge when needed.

  3. Asked-question tracking is the caller's responsibility. The
     composer is stateless. Callers pass an `asked_keys` set (strings
     like "developmental_foundations:origin_point:0") and the composer
     skips them. This avoids hidden state and makes the module trivial
     to unit test.

  4. When a phase is exhausted (every question in every sub-topic has
     been asked), pick_next_question returns None. The interview router
     then either advances to the next phase (future WO) or falls back
     to sequential. Either way, no crash — graceful empty.

  5. Spine anchors: a question marked with spine_anchor="civic_drinking_age"
     can only be asked to narrators old enough to have reached that
     anchor (age envelope from validator). This prevents asking a 14-year-
     old about their first legal drink. We respect the life_spine
     validator's envelopes as a single source of truth.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple, Union

from .life_spine.school import _coerce_dob
from .life_spine.validator import _AGE_ENVELOPES, compute_age

logger = logging.getLogger("lorevox.phase_composer")


# ── Bank loading ──────────────────────────────────────────────────────────────

# The bank file lives at data/prompts/question_bank.json relative to the
# Lorevox project root. We resolve from this module's location (three
# directories up: api/phase_aware_composer.py → api → code → server → ROOT).
_THIS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT_CANDIDATES = [
    _THIS_DIR.parent.parent.parent,        # server/code/api -> Lorevox root
    _THIS_DIR.parent.parent.parent.parent, # one level deeper if nested
]


def _resolve_bank_path() -> Optional[Path]:
    """Find data/prompts/question_bank.json by walking up from this file."""
    for root in _PROJECT_ROOT_CANDIDATES:
        p = root / "data" / "prompts" / "question_bank.json"
        if p.exists():
            return p
    # Allow env override for tests or non-standard layouts
    env_path = os.environ.get("LOREVOX_QUESTION_BANK_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)
    return None


_BANK_CACHE: Optional[Dict[str, Any]] = None
_BANK_PATH_CACHE: Optional[Path] = None


def _load_bank(force_reload: bool = False) -> Optional[Dict[str, Any]]:
    """Return the parsed question_bank.json or None if unavailable.

    Cached at module level. force_reload=True bypasses cache (tests).
    Malformed JSON returns None and is logged once per process start.
    """
    global _BANK_CACHE, _BANK_PATH_CACHE
    if _BANK_CACHE is not None and not force_reload:
        return _BANK_CACHE
    path = _resolve_bank_path()
    if path is None:
        logger.warning("[phase_composer] question_bank.json not found in any candidate location")
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            bank = json.load(f)
        _BANK_CACHE = bank
        _BANK_PATH_CACHE = path
        logger.info("[phase_composer] loaded question bank from %s (phases=%d)",
                    path, len(bank.get("phases", {})))
        return bank
    except Exception as e:
        logger.error("[phase_composer] failed to load %s: %s", path, e)
        return None


def reload_bank() -> Optional[Dict[str, Any]]:
    """Test/operator helper — bust the cache and reload from disk."""
    return _load_bank(force_reload=True)


# ── Age / phase resolution ────────────────────────────────────────────────────

def current_age(dob: Union[str, date, datetime], today: Optional[date] = None) -> int:
    """Whole-year age today (or on `today` if supplied — tests use this)."""
    dob_d = _coerce_dob(dob)
    t = today or date.today()
    age = t.year - dob_d.year
    if (t.month, t.day) < (dob_d.month, dob_d.day):
        age -= 1
    return age


def phase_for_age(bank: Dict[str, Any], age: int) -> Optional[str]:
    """Return the phase_id whose age_range bracket contains `age`.

    Phases overlap at edges (12/13, 18/19, etc.) — we return the first
    phase whose range includes the age. Iteration order follows the
    insertion order of phases in the bank JSON, which is life-order.
    """
    for phase_id, phase_data in bank.get("phases", {}).items():
        rng = phase_data.get("age_range") or [0, 200]
        lo, hi = int(rng[0]), int(rng[1])
        if lo <= age <= hi:
            return phase_id
    return None


# ── Asked-key format ─────────────────────────────────────────────────────────
# "phase_id:sub_topic_id:question_index"
# Callers build this set from their own session state (e.g., archive events
# or a dedicated asked-questions table). Composer is stateless.

def ask_key(phase_id: str, sub_topic_id: str, q_index: int) -> str:
    return f"{phase_id}:{sub_topic_id}:{q_index}"


# ── Spine-anchor plausibility ────────────────────────────────────────────────

def _anchor_is_reachable(spine_anchor: Optional[str], age: int) -> bool:
    """Return False when the narrator is too young to have reached the
    life event this question hinges on. Uses the validator's envelopes.

    - None anchor → always reachable (sub-topic is not pinned to an event).
    - Unknown anchor → assume reachable (don't filter on unmapped anchors).
    - Known anchor → age must meet the envelope's min_age.
    """
    if not spine_anchor:
        return True
    if spine_anchor == "birth":
        return True
    envelope = _AGE_ENVELOPES.get(spine_anchor)
    if envelope is None:
        return True
    min_age = envelope[0]
    return age >= min_age


# ── Core picker ──────────────────────────────────────────────────────────────

def pick_next_question(
    dob: Union[str, date, datetime, None],
    asked_keys: Optional[Set[str]] = None,
    phase_override: Optional[str] = None,
    today: Optional[date] = None,
) -> Optional[Dict[str, Any]]:
    """Return the next phase-appropriate question, or None if unavailable.

    Return shape (mirrors db.get_next_question fields so interview.py's
    _qout helper works with minimal adaptation):
        {
          "id":          "qb:<phase_id>:<sub_topic_id>:<q_index>",
          "section_id":  <phase_id>,
          "ord":         <hash-stable ordering hint>,
          "prompt":      <question text>,
          "_meta": {
            "source":       "question_bank",
            "phase_id":     <phase_id>,
            "sub_topic_id": <sub_topic_id>,
            "spine_anchor": <anchor or None>,
            "extract_priority": [<field_paths>],
            "follow_ups":   [<short deepener strings>],
            "ask_key":      <ask_key for caller to add to asked_keys on use>,
          }
        }

    Return None when:
      - bank file missing or malformed
      - narrator has no DOB
      - computed phase has no unasked questions that are spine-reachable
    """
    asked = asked_keys or set()
    bank = _load_bank()
    if bank is None:
        return None
    if dob is None or dob == "":
        return None

    try:
        age = current_age(dob, today=today)
    except Exception:
        return None

    phase_id = phase_override or phase_for_age(bank, age)
    if not phase_id:
        return None
    phase_data = (bank.get("phases") or {}).get(phase_id)
    if not phase_data:
        return None

    # Walk sub-topics in JSON order; within each, pick the first unasked
    # question whose spine_anchor (if any) is reachable by this narrator.
    sub_topics = phase_data.get("sub_topics") or {}
    for sub_id, sub_data in sub_topics.items():
        anchor = sub_data.get("spine_anchor")
        if not _anchor_is_reachable(anchor, age):
            continue
        questions = sub_data.get("questions") or []
        for idx, prompt in enumerate(questions):
            key = ask_key(phase_id, sub_id, idx)
            if key in asked:
                continue
            return {
                "id": f"qb:{phase_id}:{sub_id}:{idx}",
                "section_id": phase_id,
                "ord": _ord_hint(phase_id, sub_id, idx, bank),
                "prompt": prompt,
                "_meta": {
                    "source": "question_bank",
                    "phase_id": phase_id,
                    "sub_topic_id": sub_id,
                    "spine_anchor": anchor,
                    "extract_priority": sub_data.get("extract_priority") or [],
                    "follow_ups": sub_data.get("follow_ups") or [],
                    "ask_key": key,
                },
            }
    return None


def _ord_hint(phase_id: str, sub_id: str, q_index: int, bank: Dict[str, Any]) -> int:
    """Stable-ish ordering hint so the UI can sort questions from the bank
    consistently even though they're not in the DB. Encodes (phase pos,
    sub pos, q index) into a single int."""
    phase_order = list((bank.get("phases") or {}).keys())
    phase_idx = phase_order.index(phase_id) if phase_id in phase_order else 0
    phase_data = bank["phases"].get(phase_id) or {}
    sub_order = list((phase_data.get("sub_topics") or {}).keys())
    sub_idx = sub_order.index(sub_id) if sub_id in sub_order else 0
    # 1e6 phases * 1e3 sub_topics * 1e3 questions — plenty of headroom
    return phase_idx * 1_000_000 + sub_idx * 1_000 + q_index


def list_phase_ids() -> List[str]:
    """Enumerate phases in the bank (operator tooling)."""
    bank = _load_bank()
    if bank is None:
        return []
    return list((bank.get("phases") or {}).keys())


__all__ = [
    "current_age",
    "phase_for_age",
    "ask_key",
    "pick_next_question",
    "list_phase_ids",
    "reload_bank",
]
