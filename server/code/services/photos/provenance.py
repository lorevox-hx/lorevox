"""Provenance helpers for the shared photo authority layer.

Phase 1 is deliberately narrow. ``system_exif`` is reserved for Phase 2
(WO-LORI-PHOTO-INTAKE-01) and must not be emitted from this module.
"""

from __future__ import annotations

from typing import Dict, Optional, Tuple

ALLOWED_SOURCE_TYPES: Tuple[str, ...] = (
    "curator_input",
    "narrator_story",
    "system_hash",
    "system_thumbnail",
    "system_template_prompt",
)

ALLOWED_SOURCE_AUTHORITIES: Tuple[str, ...] = (
    "curator",
    "narrator",
    "system",
    "imported",
)


def make_provenance(
    source_type: str,
    source_authority: str,
    source_actor_id: Optional[str] = None,
    confidence: str = "medium",
) -> Dict[str, Optional[str]]:
    """Return a provenance dict suitable for dropping into a row insert.

    Raises ``ValueError`` when ``source_type`` or ``source_authority`` is
    not in the Phase 1 allowlist. Confidence is passed through; callers
    are expected to resolve it via ``confidence.resolve_*`` helpers.
    """

    if source_type not in ALLOWED_SOURCE_TYPES:
        raise ValueError(
            f"Unknown source_type {source_type!r}. "
            f"Allowed: {ALLOWED_SOURCE_TYPES!r}"
        )
    if source_authority not in ALLOWED_SOURCE_AUTHORITIES:
        raise ValueError(
            f"Unknown source_authority {source_authority!r}. "
            f"Allowed: {ALLOWED_SOURCE_AUTHORITIES!r}"
        )
    return {
        "source_type": source_type,
        "source_authority": source_authority,
        "source_actor_id": source_actor_id,
        "confidence": confidence,
    }


__all__ = [
    "ALLOWED_SOURCE_TYPES",
    "ALLOWED_SOURCE_AUTHORITIES",
    "make_provenance",
]
