"""WO-LIFE-SPINE-01 — Life-spine derivation engine.

Generic dispatcher: takes a DOB and optional facts, runs each registered
era catalog, applies any confirmed-event overrides, returns a flat list
of ChronologyItem-shaped dicts ready for accordion consumption.

Adding a new era catalog (future WO-LIFE-SPINE-02 etc.):
    1. Create life_spine/<era>.py with a derive_<era>_spine(dob) function
       returning a list of items in the same shape as school.derive_school_spine.
    2. Register it in CATALOGS below.
    3. Done — the accordion picks it up automatically.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List

from .adolescence import derive_adolescence_spine
from .early_adulthood import derive_early_adulthood_spine
from .family import derive_family_spine
from .later_life import derive_later_life_spine
from .midlife import derive_midlife_spine
from .overrides import apply_overrides
from .school import (
    derive_school_spine,
    is_birth_relevant_phase,
    school_phase_for_year,
)


# Catalog signature: either takes (dob) or (dob, facts). Flagged in the
# CATALOGS map by tuple (callable, uses_facts). Keeps simple catalogs
# unchanged while family and future facts-consuming catalogs get the
# narrator-facts channel they need.
CATALOGS: Dict[str, tuple[Callable[..., List[Dict[str, Any]]], bool]] = {
    "school_years":     (derive_school_spine, False),
    "adolescence":      (derive_adolescence_spine, False),
    "early_adulthood":  (derive_early_adulthood_spine, False),
    "midlife":          (derive_midlife_spine, False),
    "later_life":       (derive_later_life_spine, False),
    "family":           (derive_family_spine, True),
}


def derive_life_spine(
    dob: Any,
    confirmed_events: List[Dict[str, Any]] | None = None,
    facts: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    """Build the full life spine for a narrator.

    Args:
        dob: ISO date string ("YYYY-MM-DD") or date/datetime object. May be
             empty/None — returns [] in that case (no DOB → no spine).
        confirmed_events: optional list of {event_kind, year, source?} dicts
             representing facts already promoted as truth (or confirmed by
             the narrator). Each one anchors a matching spine item and
             propagates any offset to downstream UNCONFIRMED estimates only.
        facts: optional narrator facts dict (profile_json-shaped or flat).
             Passed to catalogs that declare they consume facts (family
             catalog uses facts.children, future geo/career catalogs will
             use facts.residences/jobs).

    Returns:
        A flat list of ChronologyItem-shaped dicts. Each carries:
            year         — calendar year
            label        — display string (suffixed "(estimated)")
            lane         — "personal"
            event_kind   — stable identifier (e.g. "school_kindergarten")
            dedup_key    — single-occurrence key for accordion dedup
            source       — "derived" (or "promoted_truth" after override)
            confidence   — "estimated" (or "confirmed" after override)
    """
    if not dob:
        return []

    items: List[Dict[str, Any]] = []
    for catalog_name, (catalog_fn, uses_facts) in CATALOGS.items():
        try:
            if uses_facts:
                items.extend(catalog_fn(dob, facts or {}))
            else:
                items.extend(catalog_fn(dob))
        except Exception:
            # A broken catalog must not poison the whole spine. Skip it
            # silently; future WO can wire structured logging here.
            continue

    items = apply_overrides(items, confirmed_events)
    return items


# Re-export for callers that want the phase-for-year helper without
# importing school.py directly. Convenient for the prompt composer.
__all__ = [
    "derive_life_spine",
    "school_phase_for_year",
    "is_birth_relevant_phase",
]
