"""WO-LIFE-SPINE-01 — DOB-derived life-phase projection engine.

Pluggable per-era catalogs. Pure projection layer — never writes to
canonical truth tables. Output is consumed by the Chronology Accordion
(source='derived') for ghost rendering and by the prompt composer for
phase-aware question selection.

Module layout:
    engine.py       — dispatcher; calls each catalog and returns the
                      assembled spine
    school.py       — first concrete catalog (kindergarten → HS graduation,
                      with Dec-birthday school-start correction)
    overrides.py    — generic offset propagation; confirmed events shift
                      ONLY downstream unconfirmed estimates

Extension pattern: add a new catalog file (e.g., adolescence.py), register
it in engine.py's CATALOGS dict. The accordion + extractor consume the
spine generically.
"""
from .engine import derive_life_spine
from .school import is_birth_relevant_phase, school_phase_for_year

__all__ = [
    "derive_life_spine",
    "school_phase_for_year",
    "is_birth_relevant_phase",
]
