"""WO-LIFE-SPINE-01 — School Years catalog.

Derives a probabilistic K-12 timeline from DOB. Single source-of-truth for
the Dec-birthday school-start correction (US norm: kids who turn 5 between
Sept 1 and Dec 31 typically start kindergarten the FOLLOWING fall, not the
year they turn 5).

Every entry returned carries:
    source     = 'derived'       (provenance — never canonical truth)
    confidence = 'estimated'     (UI renders ghost/dashed)
    event_kind = '{kind}:self'   (compatible with chronology_accordion
                                  dedup keys; prevents collision with a
                                  promoted truth row of the same event_kind)

Validated on Chris Horne (DOB 1962-12-24, Dec birthday → K start 1968,
HS grad 1981 — matches reality).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union


def _coerce_dob(dob: Union[str, date, datetime]) -> date:
    if isinstance(dob, datetime):
        return dob.date()
    if isinstance(dob, date):
        return dob
    # ISO YYYY-MM-DD or first 10 chars thereof
    return datetime.strptime(str(dob)[:10], "%Y-%m-%d").date()


def kindergarten_start_year(dob: Union[str, date, datetime]) -> int:
    """Return the calendar year a child with this DOB would start kindergarten.

    US convention: kids who turn 5 by ~September 1 of a school year start
    kindergarten that fall. Children born September–December typically wait
    a year (start at age 5 turning 6 in winter). This is the single most
    common reason a naive `dob.year + 5` produces a one-year-off school spine.
    """
    d = _coerce_dob(dob)
    if d.month >= 9:
        return d.year + 6
    return d.year + 5


def derive_school_spine(dob: Union[str, date, datetime]) -> List[Dict[str, Any]]:
    """Build the K-12 spine entries for a single narrator.

    Returns ChronologyItem-shaped dicts ready to merge into Lane B of the
    Chronology Accordion. Each item is a single-year anchor with
    source='derived' and a label that includes "(estimated)" so the
    operator never confuses ghost spine with promoted truth.
    """
    k_start = kindergarten_start_year(dob)
    items: List[Dict[str, Any]] = []

    # Kindergarten (K start)
    items.append({
        "year": k_start,
        "label": "Started kindergarten (estimated)",
        "lane": "personal",
        "event_kind": "school_kindergarten",
        "dedup_key": "school_kindergarten:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # Elementary 1st–5th grades (k_start+1 .. k_start+5 = grades 1-5)
    # Single anchor at start of 1st grade keeps the accordion uncluttered.
    items.append({
        "year": k_start + 1,
        "label": "1st grade — elementary begins (estimated)",
        "lane": "personal",
        "event_kind": "school_elementary_start",
        "dedup_key": "school_elementary_start:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # Middle school (6th grade) — k_start + 6
    items.append({
        "year": k_start + 6,
        "label": "Middle school begins (estimated)",
        "lane": "personal",
        "event_kind": "school_middle_start",
        "dedup_key": "school_middle_start:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # High school (9th grade) — k_start + 9
    items.append({
        "year": k_start + 9,
        "label": "High school begins (estimated)",
        "lane": "personal",
        "event_kind": "school_highschool_start",
        "dedup_key": "school_highschool_start:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # HS graduation — k_start + 13 (K + 12 grades)
    items.append({
        "year": k_start + 13,
        "label": "High school graduation (estimated)",
        "lane": "personal",
        "event_kind": "school_graduation",
        "dedup_key": "school_graduation:self",
        "source": "derived",
        "confidence": "estimated",
    })

    return items


def school_phase_for_year(dob: Union[str, date, datetime], year: int) -> str | None:
    """Return the school phase a narrator was plausibly in during a given calendar year.

    Used by the prompt composer to pick phase-appropriate question banks
    and (eventually) by the extractor to disambiguate residence-during-period
    statements from birth-place statements.

    Returns one of:
      "pre_school"   — before kindergarten
      "elementary"   — K through 5th grade
      "middle"       — 6th–8th grade
      "high_school"  — 9th–12th grade
      "post_school"  — after HS graduation
    """
    k_start = kindergarten_start_year(dob)
    if year < k_start:
        return "pre_school"
    if year < k_start + 6:
        return "elementary"
    if year < k_start + 9:
        return "middle"
    if year <= k_start + 13:
        return "high_school"
    return "post_school"


# Phases within which "we lived in X" / "I was raised in X" could plausibly
# refer to the birthplace. Extractor uses this to gate birth-field
# extraction. "pre_school" is the only phase within which a generic
# residence statement is likely to be birth-relevant. Everything after
# elementary is out of birth-era territory.
_BIRTH_RELEVANT_PHASES = frozenset({"pre_school"})


def is_birth_relevant_phase(phase: Optional[str]) -> bool:
    """Return True when the phase is one where birth-place extractions
    from generic residence statements ('lived in X') should be allowed.

    Outside these phases, birth-field extractions are filtered out unless
    the narrator's answer explicitly contains the word 'born'. See the
    WO-EX-01B filter in extract.py.
    """
    if phase is None:
        return True  # backward compat — no phase info = don't filter
    return phase in _BIRTH_RELEVANT_PHASES
