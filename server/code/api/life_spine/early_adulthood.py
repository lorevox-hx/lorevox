"""WO-LIFE-SPINE-02 — Early Adulthood catalog (ages 19-30).

Real anchors only. College entries are conditional (not everyone attends)
but emitted unconditionally with operator-reject affordance, same pattern
as civic_selective_service in adolescence.py. Operator rejection in the
proposal queue is the correction mechanism.

Kept anchors:
    college_start_est      — 18 (typical US undergrad start)
    college_grad_est       — 22 (typical 4-year completion)
    us_drinking_age        — 21 (legal US alcohol purchase age, post-1984)

Intentionally skipped:
    - legal adulthood (already covered by civic_voting_age in adolescence)
    - military enlistment age (covered by civic_selective_service)
    - marriage/first-child/first-job — too conditional to estimate; those
      become extractor-driven events in future WOs (SPINE-GEO, SPINE-CAREER)
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Union

from .school import _coerce_dob


def derive_early_adulthood_spine(dob: Union[str, date, datetime]) -> List[Dict[str, Any]]:
    """Early-adulthood anchors derived from DOB. See module docstring."""
    d = _coerce_dob(dob)
    items: List[Dict[str, Any]] = []

    # College start (conditional — typical US undergrad begins at 18)
    items.append({
        "year": d.year + 18,
        "label": "Possible college/university start (estimated)",
        "lane": "personal",
        "event_kind": "education_college_start",
        "dedup_key": "education_college_start:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # College graduation (conditional — typical 4-year completion)
    items.append({
        "year": d.year + 22,
        "label": "Possible college graduation (estimated)",
        "lane": "personal",
        "event_kind": "education_college_grad",
        "dedup_key": "education_college_grad:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # US drinking age (21 since 1984 — National Minimum Drinking Age Act)
    # Narrators born before 1963 may have had different state-by-state ages;
    # for post-1984 adults, 21 is the federal minimum.
    items.append({
        "year": d.year + 21,
        "label": "US drinking age (estimated)",
        "lane": "personal",
        "event_kind": "civic_drinking_age",
        "dedup_key": "civic_drinking_age:self",
        "source": "derived",
        "confidence": "estimated",
    })

    return items
