"""WO-MEDIA-ARCHIVE-01 — file storage layer.

Stores originals unchanged under DATA_DIR/media/archive/. Mirrors the
DB row to meta.json on disk for forensic recovery (DB corrupt →
reconstruct from filesystem).

Layout:

    DATA_DIR/media/archive/people/<person_id>/documents/<item_id>/
        original.<ext>
        thumb.jpg                   (when generatable)
        meta.json                   (DB row mirror)

    DATA_DIR/media/archive/family_lines/<slug>/<item_id>/
        original.<ext>
        ...

    DATA_DIR/media/archive/unassigned/<item_id>/
        original.<ext>
        ...

The scope is derived from `(person_id, family_line)`:
  - person_id present       → people/<person_id>/documents/<item_id>/
  - family_line only        → family_lines/<slug>/<item_id>/
  - neither                 → unassigned/<item_id>/

Critical rules:
  - Originals are NEVER modified. No re-encoding, compression, or
    metadata stripping.
  - Thumbnail generation is best-effort. Failure does not block upload.
  - meta.json mirrors the DB row at upload time.
  - Do NOT store under photos/ — that's Photo Intake's lane.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Dict, Optional


log = logging.getLogger("lorevox.media_archive.storage")

_DEFAULT_DATA_DIR_ENV = "DATA_DIR"


def _resolve_data_dir(override: Optional[Path] = None) -> Path:
    if override is not None:
        return Path(override).expanduser()
    raw = os.environ.get(_DEFAULT_DATA_DIR_ENV)
    if not raw:
        raise RuntimeError(
            "DATA_DIR is not set; refusing to store archive items without "
            "an explicit base path."
        )
    return Path(raw).expanduser()


def archive_root(data_dir: Optional[Path] = None) -> Path:
    """Return the on-disk root for media_archive."""
    return _resolve_data_dir(data_dir) / "media" / "archive"


def safe_ext(filename: str) -> str:
    """Return a sanitized lowercase extension (e.g. '.pdf') with a
    sensible fallback. Mirrors the photo_intake.storage convention."""
    ext = Path(filename).suffix.lower()
    if ext and len(ext) <= 10 and ext[0] == ".":
        return ext
    return ".bin"


_FAMILY_SLUG_RE = re.compile(r"[^a-z0-9_-]+")


def _family_slug(family_line: str) -> str:
    """Slugify a family line name for filesystem use.

    'Shong' -> 'shong'
    'Von Schmidt' -> 'von-schmidt'
    'O Brien' -> 'o-brien'
    Empty/None -> 'unknown'
    """
    if not family_line:
        return "unknown"
    s = family_line.strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = _FAMILY_SLUG_RE.sub("-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "unknown"


def archive_dir_for(
    item_id: str,
    person_id: Optional[str] = None,
    family_line: Optional[str] = None,
    data_dir: Optional[Path] = None,
) -> Path:
    """Return the per-item directory for storing original + thumb + meta."""
    base = archive_root(data_dir)
    if person_id:
        return base / "people" / person_id / "documents" / item_id
    if family_line:
        return base / "family_lines" / _family_slug(family_line) / item_id
    return base / "unassigned" / item_id


def store_archive_file(
    item_id: str,
    source_path: str | Path,
    original_filename: str,
    mime_type: str,
    person_id: Optional[str] = None,
    family_line: Optional[str] = None,
    data_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Move the uploaded temp file into the archive layout. Returns
    {storage_path, file_ext, file_size_bytes}.

    Raises FileNotFoundError if source_path doesn't exist. Does not
    raise on thumbnail / text-probe failures — those are best-effort
    and live in their own modules.
    """
    src = Path(source_path)
    if not src.is_file():
        raise FileNotFoundError(f"source_path does not exist: {src}")

    target_dir = archive_dir_for(
        item_id=item_id,
        person_id=person_id,
        family_line=family_line,
        data_dir=data_dir,
    )
    target_dir.mkdir(parents=True, exist_ok=True)

    ext = safe_ext(original_filename)
    target = target_dir / f"original{ext}"
    shutil.move(str(src), str(target))

    size_bytes = target.stat().st_size

    log.info(
        "[media_archive][storage] stored item_id=%s size=%d bytes path=%s",
        item_id, size_bytes, str(target),
    )

    return {
        "storage_path": str(target),
        "file_ext": ext,
        "file_size_bytes": size_bytes,
    }


def write_meta_json(
    item_id: str,
    meta: Dict[str, Any],
    person_id: Optional[str] = None,
    family_line: Optional[str] = None,
    data_dir: Optional[Path] = None,
) -> str:
    """Write the DB row dict to meta.json next to the original.

    Best-effort: logs warning on failure but doesn't raise (loss of
    meta.json doesn't lose data — the DB is still authoritative; meta.json
    is for filesystem-only recovery scenarios).
    """
    try:
        target_dir = archive_dir_for(
            item_id=item_id,
            person_id=person_id,
            family_line=family_line,
            data_dir=data_dir,
        )
        target_dir.mkdir(parents=True, exist_ok=True)
        meta_path = target_dir / "meta.json"
        with meta_path.open("w", encoding="utf-8") as fp:
            json.dump(meta, fp, indent=2, default=str)
        return str(meta_path)
    except Exception as exc:
        log.warning(
            "[media_archive][storage] meta.json write failed for item_id=%s: %s",
            item_id, exc,
        )
        return ""


def mime_allowed(mime_type: str, filename: str) -> bool:
    """Return True if the (mime, filename) pair is acceptable for the
    archive surface. Mirrors ALLOWED_MIME_PREFIXES from types.py.

    Some browsers report empty mime for HEIC; fall back to extension
    matching for common cases.
    """
    from .types import ALLOWED_MIME_PREFIXES
    m = (mime_type or "").lower()
    if any(m.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        return True
    # Extension fallback for empty/uncertain mime
    ext = safe_ext(filename)
    if ext in (".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif",
               ".webp", ".heic", ".heif", ".gif", ".txt", ".md"):
        return True
    return False


__all__ = [
    "archive_root",
    "archive_dir_for",
    "safe_ext",
    "store_archive_file",
    "write_meta_json",
    "mime_allowed",
]
