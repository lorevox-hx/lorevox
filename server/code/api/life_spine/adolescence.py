"""WO-LIFE-SPINE-02 — Adolescence catalog (ages 13-18).

Real legal/societal anchors only. Deliberately skips vague "teen_start"
(+13) and "legal_adult" (+18 duplicate of voting_age) entries — those
were in an earlier draft spec and produce timeline noise without
calendar meaning.

Kept anchors:
    driver's license age     — US standard (16)
    voting age               — 26th Amendment (18)
    first presidential vote  — computed from Nov election day + 18th birthday
    selective service reg    — US males since 1980 (18)

Graduation lives in the school catalog; intentionally not duplicated here.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Union

from .school import _coerce_dob


def _first_presidential_election_year(dob_obj: date) -> int:
    """Return the year of the first US presidential election the narrator
    was eligible to vote in.

    US presidential elections: years divisible by 4, first Tuesday after
    first Monday in November (always between Nov 2 and Nov 8). The simple
    rule: must be 18 by election day. We approximate election day as
    Nov 5 — close enough that only narrators born Nov 2-7 would see a
    one-cycle difference, an edge case we don't need precision for.

    Chris (DOB 1962-12-24): turns 18 Dec 24 1980 — AFTER Nov 1980
    election, so first eligible = 1984. Matches reality.
    """
    eighteenth_year = dob_obj.year + 18
    # Find next presidential-election year ≥ eighteenth_year
    pres_year = eighteenth_year + ((4 - eighteenth_year % 4) % 4)
    # If that year's Nov 5 is before narrator's 18th birthday, bump 4 years
    try:
        election_date = date(pres_year, 11, 5)
        eighteenth_bday = date(eighteenth_year, dob_obj.month, dob_obj.day)
        if eighteenth_bday > election_date:
            pres_year += 4
    except ValueError:
        # Feb 29 on a non-leap-year election year — treat as Mar 1 edge case
        pass
    return pres_year


def derive_adolescence_spine(dob: Union[str, date, datetime]) -> List[Dict[str, Any]]:
    """Adolescence anchors derived from DOB. See module docstring."""
    d = _coerce_dob(dob)
    items: List[Dict[str, Any]] = []

    # Driver's license age (US: 16 in most states)
    items.append({
        "year": d.year + 16,
        "label": "Driver's license age (estimated)",
        "lane": "personal",
        "event_kind": "civic_drivers_license_age",
        "dedup_key": "civic_drivers_license_age:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # Voting age (26th Amendment, ratified 1971 → 18)
    items.append({
        "year": d.year + 18,
        "label": "Voting age / legal adult (estimated)",
        "lane": "personal",
        "event_kind": "civic_voting_age",
        "dedup_key": "civic_voting_age:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # First US presidential election eligibility
    pres = _first_presidential_election_year(d)
    items.append({
        "year": pres,
        "label": "First presidential election eligibility (estimated)",
        "lane": "personal",
        "event_kind": "civic_first_presidential_election",
        "dedup_key": "civic_first_presidential_election:self",
        "source": "derived",
        "confidence": "estimated",
    })

    # Selective Service registration (US males, required since 1980)
    # We include unconditionally; operator can reject for women/non-US narrators.
    items.append({
        "year": d.year + 18,
        "label": "Selective Service registration age (estimated)",
        "lane": "personal",
        "event_kind": "civic_selective_service",
        "dedup_key": "civic_selective_service:self",
        "source": "derived",
        "confidence": "estimated",
    })

    return items
