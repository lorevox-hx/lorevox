"""WO-LIFE-SPINE-03 — Midlife catalog (ages 31-55).

Intentionally sparse. The earlier spec draft included "midlife_start" at +31,
"peak_career_est" at +40, "children_teens_est" at +45, "midlife_transition"
at +50 — none of those are real calendar anchors. They'd clutter the
timeline with entries that mean nothing specific and erode confidence in
the entries that DO mean something. Per the correction pass, midlife
renders only one real US anchor for now.

Kept:
    retirement_early_eligible  — early Social Security retirement at 62

Everything else in midlife is narrator-specific (career progression,
kids' school years, geographic moves) and lives in extractor-driven
catalogs (SPINE-FAMILY already handles kids via child DOBs; future
SPINE-GEO and SPINE-CAREER will handle moves + jobs once paired with
extractor work).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Union

from .school import _coerce_dob


def derive_midlife_spine(dob: Union[str, date, datetime]) -> List[Dict[str, Any]]:
    """Midlife anchors derived from DOB. See module docstring."""
    d = _coerce_dob(dob)
    items: List[Dict[str, Any]] = []

    # Early Social Security retirement eligibility — US, age 62
    items.append({
        "year": d.year + 62,
        "label": "Social Security early retirement age (estimated)",
        "lane": "personal",
        "event_kind": "civic_social_security_early",
        "dedup_key": "civic_social_security_early:self",
        "source": "derived",
        "confidence": "estimated",
    })

    return items
