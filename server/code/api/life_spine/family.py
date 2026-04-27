"""WO-LIFE-SPINE-FAMILY — Children's lifecycle spines.

For each child with a known DOB, derive that child's school spine AND
add a child_birth anchor. Reuses school.derive_school_spine so the
Dec-birthday kindergarten correction applies to each kid automatically —
no duplicated +5 magic numbers.

Input shape: the catalog reads `facts["children"]` or `facts.get("basics",
{}).get("children")` or `facts["kinship"]` filtered to relation in
{"son","daughter","child"}. Handles both the raw template shape (firstName,
birthDate) and normalized profile_json shapes.

A child's spine items carry the child's name in the label and a prefixed
event_kind so they dedup correctly per-child and never collide with the
narrator's own school spine.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union

from .school import _coerce_dob, derive_school_spine


def _child_dob(child: Dict[str, Any]) -> Optional[str]:
    """Return a DOB string from any of the common key spellings, or None."""
    for key in ("dob", "dateOfBirth", "birthDate", "birth_date"):
        val = child.get(key)
        if val and str(val).strip():
            # Keep just YYYY-MM-DD prefix — tolerates suffixes like time
            return str(val).strip()[:10]
    return None


def _child_name(child: Dict[str, Any]) -> str:
    """Best-effort display name for a child."""
    for key in ("preferredName", "firstName", "first_name", "name"):
        val = child.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return "Child"


def _slugify(text: str) -> str:
    """Stable key fragment for dedup — lowercase alphanumerics only."""
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower()) or "child"


def _collect_children(facts: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Walk common profile shapes to find the list of children.

    Tolerant of several shapes:
      facts["children"]            — flat list (template shape)
      facts["basics"]["children"]  — nested basics
      facts["kinship"]             — filter by relation in son/daughter/child
    First non-empty match wins.
    """
    # Direct "children" list
    direct = facts.get("children")
    if isinstance(direct, list) and direct:
        return direct

    # Nested under basics
    basics = facts.get("basics") or {}
    nested = basics.get("children") if isinstance(basics, dict) else None
    if isinstance(nested, list) and nested:
        return nested

    # Filter kinship rows where relation implies child
    kinship = facts.get("kinship") or []
    if isinstance(kinship, list):
        filtered = [
            k for k in kinship
            if isinstance(k, dict) and str(k.get("relation", "")).lower() in ("son", "daughter", "child")
        ]
        if filtered:
            return filtered

    return []


def derive_family_spine(
    dob_narrator: Union[str, date, datetime],
    facts: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Build spine items for each known child.

    The narrator's own DOB is accepted for signature compatibility with
    other catalogs but isn't consumed directly — the family catalog's
    anchors come from the children's DOBs. Children without a valid DOB
    are skipped silently.
    """
    children = _collect_children(facts or {})
    if not children:
        return []

    items: List[Dict[str, Any]] = []
    for child in children:
        if not isinstance(child, dict):
            continue
        child_dob = _child_dob(child)
        if not child_dob:
            continue
        try:
            cd = _coerce_dob(child_dob)
        except Exception:
            continue

        name = _child_name(child)
        slug = _slugify(name)

        # Child birth anchor
        items.append({
            "year": cd.year,
            "label": f"{name} born (estimated)",
            "lane": "personal",
            "event_kind": f"child_birth:{slug}",
            "dedup_key": f"child_birth:{slug}:self",
            "source": "derived",
            "confidence": "estimated",
        })

        # Child's school spine — reuse school catalog so Dec-birthday
        # correction applies automatically to each kid
        try:
            child_school = derive_school_spine(child_dob)
        except Exception:
            continue

        for school_item in child_school:
            # Rewrite event_kind + dedup_key to be per-child; keep label
            # but prefix with child's name for operator clarity
            orig_kind = school_item.get("event_kind", "school_unknown")
            items.append({
                **school_item,
                "label": f"{name}: {school_item.get('label', '')}",
                "event_kind": f"{orig_kind}:{slug}",
                "dedup_key": f"{orig_kind}:{slug}:self",
            })

    return items
