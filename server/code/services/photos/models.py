"""Pydantic models for the shared photo authority layer.

Schema mirrors ``server/code/db/migrations/0001_lori_photo_shared.sql``.
Locked enums and locked naming (``person_label`` / ``date_precision`` /
``location_label``) are exported at module scope so tests + callers
can reuse them instead of hard-coding strings.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

# -----------------------------------------------------------------------------
# Locked enums (cross-check against the CHECK constraints in the migration SQL)
# -----------------------------------------------------------------------------
DATE_PRECISIONS: Tuple[str, ...] = (
    "exact",
    "month",
    "year",
    "decade",
    "unknown",
)

LOCATION_SOURCES: Tuple[str, ...] = (
    "exif_gps",
    "typed_address",
    "spoken_place",
    "description_geocode",
    "unknown",
)

MEMORY_TYPES: Tuple[str, ...] = (
    "episodic_story",
    "emotional_flash",
    "general_mood",
    "zero_recall",
    "distress_abort",
)

SHOW_OUTCOMES: Tuple[str, ...] = (
    "shown",
    "story_captured",
    "zero_recall",
    "distress_abort",
    "skipped",
    "technical_abort",
)

CONFIDENCE_LEVELS: Tuple[str, ...] = (
    "high",
    "medium",
    "low",
    "unknown",
)

TRANSCRIPT_SOURCES: Tuple[str, ...] = (
    "stt_live",
    "typed",
    "hybrid",
)


# -----------------------------------------------------------------------------
# Provenance surface
# -----------------------------------------------------------------------------
class ProvenanceStamp(BaseModel):
    """Authoritative provenance record.

    ``metadata_json`` on the photos row is non-authoritative and cannot
    substitute for these columns.
    """

    source_type: str
    source_authority: str
    source_actor_id: Optional[str] = None
    confidence: str = "medium"


# -----------------------------------------------------------------------------
# Row models
# -----------------------------------------------------------------------------
class PhotoPerson(BaseModel):
    id: str
    photo_id: str
    person_id: Optional[str] = None
    person_label: str

    source_type: str
    source_authority: str
    source_actor_id: Optional[str] = None
    confidence: str = "medium"

    created_at: Optional[str] = None


class PhotoEvent(BaseModel):
    id: str
    photo_id: str
    event_id: Optional[str] = None
    event_label: str

    source_type: str
    source_authority: str
    source_actor_id: Optional[str] = None
    confidence: str = "medium"

    created_at: Optional[str] = None


class Photo(BaseModel):
    id: str
    narrator_id: str

    image_path: str
    thumbnail_path: Optional[str] = None
    media_url: Optional[str] = None
    thumbnail_url: Optional[str] = None

    file_hash: str

    description: Optional[str] = None

    date_value: Optional[str] = None
    date_precision: str = "unknown"

    location_label: Optional[str] = None
    location_source: str = "unknown"

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    narrator_ready: bool = False
    needs_confirmation: bool = True

    uploaded_by_user_id: Optional[str] = None
    uploaded_at: Optional[str] = None
    last_edited_by_user_id: Optional[str] = None
    last_edited_at: Optional[str] = None
    deleted_at: Optional[str] = None

    metadata_json: Dict[str, Any] = Field(default_factory=dict)

    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    # Convenience bundles populated by GET /api/photos/{id}
    people: List[PhotoPerson] = Field(default_factory=list)
    events: List[PhotoEvent] = Field(default_factory=list)


class PhotoSession(BaseModel):
    id: str
    narrator_id: str
    session_id: Optional[str] = None
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    created_at: Optional[str] = None


class PhotoSessionShow(BaseModel):
    id: str
    photo_session_id: str
    photo_id: str
    shown_at: Optional[str] = None
    outcome: str = "shown"
    prompt_text: Optional[str] = None
    followup_text: Optional[str] = None
    created_at: Optional[str] = None


class PhotoMemory(BaseModel):
    id: str
    photo_id: str
    photo_session_show_id: str

    transcript: str = ""
    memory_type: str = "episodic_story"

    transcript_source: Optional[str] = None
    transcript_confidence: Optional[float] = None
    transcript_guard_flags: Optional[List[str]] = None
    finalized_at: Optional[str] = None

    source_type: str = "narrator_story"
    source_authority: str = "narrator"
    source_actor_id: Optional[str] = None

    created_at: Optional[str] = None


__all__ = [
    "DATE_PRECISIONS",
    "LOCATION_SOURCES",
    "MEMORY_TYPES",
    "SHOW_OUTCOMES",
    "CONFIDENCE_LEVELS",
    "TRANSCRIPT_SOURCES",
    "ProvenanceStamp",
    "Photo",
    "PhotoPerson",
    "PhotoEvent",
    "PhotoSession",
    "PhotoSessionShow",
    "PhotoMemory",
]
