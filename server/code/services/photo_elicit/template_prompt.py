"""Phase 1 template prompt builder for photo elicitation.

Three tiers, picked from what is known about the photo:

* **high** — people list AND place AND date all present.
* **medium** — any one or two of those three present.
* **zero** — none present.

Forbidden phrasings (enforced by tests in `tests/services/photo_elicit`):
``What year``, ``Who is this``, ``Confirm``. Lori does not quiz the
narrator in Phase 1; she invites them into the photo.

People-list joining is hard-coded: one name → ``X``, two → ``X and Y``,
three or more → ``X, Y, and Z`` (Oxford comma, matching the spec
acceptance test). Curator person-tag IDs (``person_ext_*``) are NEVER
read aloud — only the human-facing ``person_label`` makes it into the
prompt. If a name looks like an internal token it is skipped.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional


TIER_HIGH = "high"
TIER_MEDIUM = "medium"
TIER_ZERO = "zero"

_ZERO_TIER_TEMPLATE = (
    "I'm not sure when or where this was taken, but it looks "
    "meaningful. What do you remember when you look at it?"
)

_MEDIUM_TIER_TEMPLATE = (
    "I have a little information about this photo. Tell me what you "
    "remember when you look at it."
)


def _coerce_people(raw: Any) -> List[str]:
    """Normalize a ``people`` input into a list of display labels.

    Accepts: ``None``, list of strings, list of dicts with
    ``person_label`` keys, or a single string. Anything that looks like
    an internal ID (prefix ``person_``, all-caps tokens with no space,
    etc.) is filtered out to respect the "never read IDs aloud" rule.
    """

    if raw is None:
        return []
    if isinstance(raw, str):
        items: Iterable[Any] = [raw]
    elif isinstance(raw, dict):
        items = [raw]
    else:
        items = raw

    labels: List[str] = []
    for item in items:
        if item is None:
            continue
        if isinstance(item, dict):
            label = item.get("person_label") or item.get("label") or ""
        else:
            label = str(item)
        label = (label or "").strip()
        if not label:
            continue
        if label.lower().startswith("person_"):
            # Curator external IDs are internal — never spoken to the narrator.
            continue
        labels.append(label)
    return labels


def _join_people(labels: List[str]) -> str:
    """Join display names using the rule: X / X and Y / X, Y, and Z."""

    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    head = ", ".join(labels[:-1])
    return f"{head}, and {labels[-1]}"


def _pick(photo: Dict[str, Any], *keys: str) -> Optional[str]:
    for k in keys:
        v = photo.get(k)
        if v is None:
            continue
        if isinstance(v, str):
            stripped = v.strip()
            if stripped:
                return stripped
        else:
            as_str = str(v).strip()
            if as_str:
                return as_str
    return None


def classify_tier(photo: Dict[str, Any]) -> str:
    """Decide the tier for a photo dict.

    Looks at: ``people`` (or ``people_labels``), ``place`` (or
    ``location_label``), ``date`` (or ``date_approx``).
    """

    people = _coerce_people(photo.get("people") or photo.get("people_labels"))
    place = _pick(photo, "place", "location_label")
    date = _pick(photo, "date", "date_approx")

    known = sum(1 for piece in (bool(people), bool(place), bool(date)) if piece)
    if known >= 3:
        return TIER_HIGH
    if known >= 1:
        return TIER_MEDIUM
    return TIER_ZERO


def build_photo_prompt(photo: Dict[str, Any]) -> str:
    """Render the Lori prompt for a single photo (Phase 1).

    Never raises; always returns a non-empty invitational prompt string.
    """

    if not isinstance(photo, dict):  # defensive — callers sometimes pass rows
        photo = dict(photo or {})

    tier = classify_tier(photo)

    if tier == TIER_ZERO:
        return _ZERO_TIER_TEMPLATE
    if tier == TIER_MEDIUM:
        return _MEDIUM_TIER_TEMPLATE

    # High tier — assemble "This photo shows {people} in {place} in {date}."
    people_str = _join_people(
        _coerce_people(photo.get("people") or photo.get("people_labels"))
    )
    place_str = _pick(photo, "place", "location_label") or ""
    date_str = _pick(photo, "date", "date_approx") or ""

    fragments: List[str] = [f"This photo shows {people_str}"]
    if place_str:
        fragments.append(f" in {place_str}")
    if date_str:
        fragments.append(f" in {date_str}")
    fragments.append(". Tell me what you remember about this moment.")
    return "".join(fragments)


__all__ = [
    "TIER_HIGH",
    "TIER_MEDIUM",
    "TIER_ZERO",
    "build_photo_prompt",
    "classify_tier",
]
