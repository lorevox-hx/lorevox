"""WO-LIFE-SPINE-01 — Generic offset propagation for confirmed events.

Critical guard: shifts ONLY downstream UNCONFIRMED estimates. A previously-
confirmed event is never re-shifted by a later override; that would
silently re-corrupt operator-validated data.

Mental model:
    spine entries = base_estimate + cumulative_offsets

When the narrator confirms event X happened in year Y:
    matching_estimate = find spine entry with same event_kind
    if matching_estimate exists:
        offset = Y - matching_estimate.year
        for downstream entry in spine:
            if entry.year > matching_estimate.year and entry.confidence == 'estimated':
                entry.year += offset

Confirmed events are marked confidence='confirmed' (or any non-'estimated'
value). Their year is locked.
"""
from __future__ import annotations

from typing import Any, Dict, List


def apply_overrides(
    spine_items: List[Dict[str, Any]],
    confirmed_events: List[Dict[str, Any]] | None,
) -> List[Dict[str, Any]]:
    """Apply confirmed-event overrides to a list of spine items.

    Args:
        spine_items: list of spine items as produced by the era catalogs
                     (school.py etc.). Each must have year, event_kind,
                     confidence.
        confirmed_events: list of {event_kind, year, ...} dicts representing
                          narrator-confirmed (or promoted-truth) events.
                          When provided, each one tries to anchor a matching
                          spine item and propagate any offset downstream.

    Returns:
        A new list with offsets applied. Original items are not mutated.
    """
    if not confirmed_events:
        return [dict(item) for item in spine_items]

    # Defensive copy — never mutate the caller's data
    result = [dict(item) for item in spine_items]

    # Build lookup by event_kind for O(1) match
    by_kind: Dict[str, int] = {}
    for idx, item in enumerate(result):
        kind = item.get("event_kind")
        if kind is not None:
            # First-occurrence wins; same-kind duplicates ignored
            by_kind.setdefault(kind, idx)

    for ev in confirmed_events:
        kind = ev.get("event_kind")
        confirmed_year = ev.get("year")
        if not kind or confirmed_year is None:
            continue
        anchor_idx = by_kind.get(kind)
        if anchor_idx is None:
            continue
        anchor = result[anchor_idx]
        anchor_year = anchor.get("year")
        if anchor_year is None:
            continue

        offset = int(confirmed_year) - int(anchor_year)
        # Lock the anchor itself to the confirmed year
        anchor["year"] = int(confirmed_year)
        anchor["confidence"] = "confirmed"
        anchor["source"] = ev.get("source", "promoted_truth")

        if offset == 0:
            # Confirmation matched the estimate — no propagation needed
            continue

        # Propagate offset to downstream UNCONFIRMED estimates only.
        # "Downstream" = items whose original year was later than the
        # anchor's original year (before we just rewrote it). Since we
        # rewrote anchor in place, use anchor_year (the pre-rewrite value).
        for other in result:
            if other is anchor:
                continue
            other_year = other.get("year")
            if other_year is None:
                continue
            if other.get("confidence") != "estimated":
                continue  # locked — don't shift confirmed entries
            if int(other_year) > int(anchor_year):
                other["year"] = int(other_year) + offset

    return result
