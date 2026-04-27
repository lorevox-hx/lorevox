"""Filesystem storage for the shared photo authority layer.

Layout (per WO-LORI-PHOTO-SHARED-01 §9):

    DATA_DIR/memory/archive/photos/{narrator_id}/{photo_id}/original.{ext}
    DATA_DIR/memory/archive/photos/{narrator_id}/{photo_id}/thumb_400.jpg

``DATA_DIR`` is read at module import time from the environment; the
module fails fast (at call time, not import time) if it is not set,
to keep the test surface importable without the full server env.

The router is responsible for streaming the upload into a temp file;
this module's job is the hash → move → thumbnail dance once the bytes
are on disk.
"""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Dict, Optional

from .dedupe import sha256_file
from .thumbnail import create_thumbnail


_DEFAULT_DATA_DIR_ENV = "DATA_DIR"


def _resolve_data_dir(override: Optional[Path] = None) -> Path:
    if override is not None:
        return Path(override).expanduser()
    raw = os.environ.get(_DEFAULT_DATA_DIR_ENV)
    if not raw:
        raise RuntimeError(
            "DATA_DIR is not set; refusing to store photos without "
            "an explicit base path."
        )
    return Path(raw).expanduser()


def _safe_ext(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    # Keep reasonable extensions only; anything exotic falls back to .jpg
    if ext and len(ext) <= 10 and ext[0] == ".":
        return ext
    return ".jpg"


def photo_dir_for(
    narrator_id: str,
    photo_id: str,
    data_dir: Optional[Path] = None,
) -> Path:
    """Return the on-disk directory that owns ``photo_id`` for ``narrator_id``."""

    base = _resolve_data_dir(data_dir)
    return base / "memory" / "archive" / "photos" / narrator_id / photo_id


def store_photo_file(
    narrator_id: str,
    source_path: str | Path,
    original_filename: str,
    data_dir: Optional[Path] = None,
    photo_id: Optional[str] = None,
    make_thumbnail: bool = True,
) -> Dict[str, Optional[str]]:
    """Move ``source_path`` into the archive and return metadata.

    * Computes SHA-256 first (caller can short-circuit on dup before
      calling this function, but we recompute defensively anyway).
    * Creates the per-photo directory and moves the original bytes.
    * Generates a 400 px thumbnail unless ``make_thumbnail=False`` (tests
      may disable this to avoid a Pillow dependency).
    * Never mutates the caller's ``source_path`` location beyond the
      move; the temp file vanishes after the call.
    """

    src = Path(source_path)
    if not src.is_file():
        raise FileNotFoundError(f"source_path does not exist: {src}")

    pid = photo_id or uuid.uuid4().hex
    ext = _safe_ext(original_filename)
    target_dir = photo_dir_for(narrator_id, pid, data_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    file_hash = sha256_file(src)

    original_target = target_dir / f"original{ext}"
    shutil.move(str(src), str(original_target))

    thumbnail_target: Optional[str] = None
    if make_thumbnail:
        try:
            thumbnail_info = create_thumbnail(
                original_target,
                target_dir / "thumb_400.jpg",
                longest_edge=400,
            )
            thumbnail_target = str(thumbnail_info.get("path"))
        except Exception:
            # Thumbnail is a best-effort affordance; failure does not
            # block the original-image save.
            thumbnail_target = None

    return {
        "photo_id": pid,
        "image_path": str(original_target),
        "thumbnail_path": thumbnail_target,
        "file_hash": file_hash,
    }


__all__ = ["photo_dir_for", "store_photo_file"]
