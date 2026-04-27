"""Confidence resolution for photo metadata (WO-LORI-PHOTO-SHARED-01 §8).

These tables are intentionally static. No LLM, no heuristics. The
curator can always edit the row; Phase 2 conflict detection runs a
separate pass.
"""

from __future__ import annotations

from typing import Optional


_DATE_PRECISION_TO_CONFIDENCE = {
    "exact": "high",
    "month": "medium",
    "year": "medium",
    "decade": "low",
    "unknown": "unknown",
}

_LOCATION_SOURCE_TO_CONFIDENCE = {
    "exif_gps": "high",
    "typed_address": "medium",
    "spoken_place": "low",
    "description_geocode": "low",
    "unknown": "unknown",
}


def resolve_date_confidence(
    date_value: Optional[str], date_precision: Optional[str]
) -> str:
    """Map a ``date_precision`` to a confidence level.

    ``date_value`` is accepted for future-proofing (Phase 2 may use the
    actual value to tighten the ladder) but the Phase 1 contract is
    precision-only; an empty value with precision ``exact`` still
    returns ``high``. Callers should ensure the row is consistent.
    """

    if not date_precision:
        return "unknown"
    return _DATE_PRECISION_TO_CONFIDENCE.get(date_precision, "unknown")


def resolve_location_confidence(location_source: Optional[str]) -> str:
    if not location_source:
        return "unknown"
    return _LOCATION_SOURCE_TO_CONFIDENCE.get(location_source, "unknown")


def needs_confirmation_for_location(location_source: Optional[str]) -> bool:
    """Only ``exif_gps`` is trusted enough to skip curator confirmation.

    Every other source — typed address, spoken place, description
    geocode, unknown — requires confirmation before the photo can be
    considered narrator-ready without prompting.
    """

    return location_source != "exif_gps"


__all__ = [
    "resolve_date_confidence",
    "resolve_location_confidence",
    "needs_confirmation_for_location",
]
