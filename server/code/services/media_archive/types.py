"""WO-MEDIA-ARCHIVE-01 — locked enums shared between router validation
and service layer.

Mirrors the CHECK constraints in db/migrations/0003_media_archive.sql.
Keep in sync — a value passed by the API that isn't in these tuples
will hit the SQL constraint and 500 (with a clear IntegrityError
message). Front-end dropdowns also mirror these.
"""

from __future__ import annotations
from typing import Tuple


DOCUMENT_TYPES: Tuple[str, ...] = (
    "genealogy_document",
    "handwritten_note",
    "letter",
    "certificate",
    "newspaper_clipping",
    "school_record",
    "military_record",
    "legal_record",
    "photo_scan_contact_sheet",
    "pdf_document",
    "typed_notes",
    "book_excerpt",
    "unknown",
)

TEXT_STATUSES: Tuple[str, ...] = (
    "not_started",
    "image_only_needs_ocr",
    "manual_partial",
    "manual_complete",
    "ocr_partial",
    "ocr_complete",
    "mixed",
)

TRANSCRIPTION_STATUSES: Tuple[str, ...] = (
    "not_started",
    "manual",
    "ocr",
    "mixed",
    "complete",
)

EXTRACTION_STATUSES: Tuple[str, ...] = (
    "none",
    "candidates_pending",
    "candidates_reviewed",
    "complete",
)

DATE_PRECISIONS: Tuple[str, ...] = (
    "exact",
    "month",
    "year",
    "decade",
    "unknown",
)

LINK_TYPES: Tuple[str, ...] = (
    "life_map_era",
    "timeline_year",
    "memoir_section",
    "family_tree_person",
    "bio_builder_candidate",
    "kawa_segment",
    "source_note",
)

# MIME types accepted by the upload endpoint. The router rejects 415
# for anything else. Photo Intake's MIME list is intentionally narrower
# (image/* only) so a PDF goes here, never there.
ALLOWED_MIME_PREFIXES: Tuple[str, ...] = (
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
    "text/plain",
    "text/markdown",
)


__all__ = [
    "DOCUMENT_TYPES",
    "TEXT_STATUSES",
    "TRANSCRIPTION_STATUSES",
    "EXTRACTION_STATUSES",
    "DATE_PRECISIONS",
    "LINK_TYPES",
    "ALLOWED_MIME_PREFIXES",
]
