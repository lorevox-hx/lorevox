"""WO-LIFE-SPINE-03 — Later Life catalog (ages 56+).

Intentionally sparse. The earlier spec draft included "empty_nest_est" at
+55 which is narrator-specific (depends on kids' DOBs) and too noisy as a
generic estimate. It's better handled by SPINE-FAMILY, which derives per
child.

Kept anchors (all real US legal/societal thresholds):
    medicare_eligible        — 65 (US)
    retirement_full          — 67 (full Social Security for those born 1960+)
    retirement_max_benefit   — 70 (delayed retirement credits cap)

Everything else in later life (grandchildren, health events, downsizing,
travel, widowhood) is narrator-specific and extractor-driven territory.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Union

from .school import _coerce_dob


def _full_retirement_age(dob_year: int) -> int:
    """Full Social Security retirement age, per SSA schedule.

    Born 1937 or earlier: 65
    Born 1938–1959:       65 + gradient (65+2mo through 66+10mo)
    Born 1960 or later:   67

    For ghost-entry purposes the fine-grained months don't matter — we
    round to integer years. This picks 65, 66, or 67 as the anchor year.
    """
    if dob_year <= 1937:
        return 65
    if dob_year >= 1960:
        return 67
    return 66  # simplification for the 1938–1959 gradient


def derive_later_life_spine(dob: Union[str, date, datetime]) -> List[Dict[str, Any]]:
    """Later-life anchors derived from DOB. See module docstring."""
    d = _coerce_dob(dob)
    items: List[Dict[str, Any]] = []

    # Medicare eligibility — US, age 65, flat for everyone
    items.append({
        "year": d.year + 65,
        "label": "Medicare eligibility age (estimated)",
        "lane": "personal",
        "event_kind": "civic_medicare_eligible",
        "dedup_key": "civic_medicare_eligible:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # Full Social Security retirement age (varies by birth year per SSA)
    full_age = _full_retirement_age(d.year)
    items.append({
        "year": d.year + full_age,
        "label": f"Social Security full retirement age ({full_age}, estimated)",
        "lane": "personal",
        "event_kind": "civic_social_security_full",
        "dedup_key": "civic_social_security_full:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # Delayed-retirement benefit cap — universally 70
    items.append({
        "year": d.year + 70,
        "label": "Social Security maximum-benefit age (estimated)",
        "lane": "personal",
        "event_kind": "civic_social_security_max",
        "dedup_key": "civic_social_security_max:self",
        "source": "derived",
        "confidence": "estimated",
    })

    return items
