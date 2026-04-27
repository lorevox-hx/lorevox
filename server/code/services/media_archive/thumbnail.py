"""WO-MEDIA-ARCHIVE-01 — best-effort thumbnail generation.

For images: Pillow-based 400px thumbnail (matches photo_intake convention).
For PDFs:   first-page render via pdf2image + poppler if available.
            Falls back to None silently when poppler is missing.
For text:   no thumbnail.
For unknown: no thumbnail.

NEVER raises. Failure → returns None and the caller carries on. The
operator gets a generic file-icon placeholder in the UI when there's
no thumbnail.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Union


log = logging.getLogger("lorevox.media_archive.thumbnail")

_PathLike = Union[str, Path]


def create_thumbnail(
    source_path: _PathLike,
    target_path: _PathLike,
    longest_edge: int = 400,
    mime_type: str = "",
) -> Optional[str]:
    """Create thumbnail. Returns target path on success, None on failure.

    Dispatch by mime/extension:
      - image/* → Pillow thumbnail
      - application/pdf → pdf2image first page (if available)
      - everything else → None
    """
    src = Path(source_path)
    dst = Path(target_path)
    if not src.is_file():
        log.debug("[thumbnail] source missing: %s", src)
        return None

    mime = (mime_type or "").lower()
    ext = src.suffix.lower()

    # Image branch
    if mime.startswith("image/") or ext in (
        ".jpg", ".jpeg", ".png", ".tiff", ".tif",
        ".webp", ".heic", ".heif", ".gif", ".bmp",
    ):
        return _create_image_thumbnail(src, dst, longest_edge)

    # PDF branch
    if mime == "application/pdf" or ext == ".pdf":
        return _create_pdf_thumbnail(src, dst, longest_edge)

    # Text / markdown / unknown — no thumbnail.
    log.debug("[thumbnail] no thumbnail strategy for mime=%s ext=%s", mime, ext)
    return None


def _create_image_thumbnail(src: Path, dst: Path, longest_edge: int) -> Optional[str]:
    """Pillow-backed thumbnail. Same shape as photo_intake.thumbnail."""
    try:
        from PIL import Image, ImageOps  # type: ignore
    except ImportError as exc:
        log.warning("[thumbnail] Pillow not installed; image thumb skipped: %s", exc)
        return None

    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            copy = im.copy()
            copy.thumbnail((longest_edge, longest_edge))
            copy.save(dst, format="JPEG", quality=82, optimize=True)
        return str(dst)
    except Exception as exc:
        log.warning("[thumbnail] image thumbnail failed for %s: %s", src, exc)
        return None


def _create_pdf_thumbnail(src: Path, dst: Path, longest_edge: int) -> Optional[str]:
    """First-page PDF render via pdf2image. Requires poppler-utils
    on the system (apt-get install poppler-utils).

    Fail-soft. The UI will fall back to a generic file-icon when the
    thumbnail is missing.
    """
    try:
        from pdf2image import convert_from_path  # type: ignore
    except ImportError:
        log.info(
            "[thumbnail] pdf2image not installed; PDF thumb skipped (install: pip install pdf2image)"
        )
        return None

    try:
        # dpi=72 keeps the render small and fast; we resize after.
        pages = convert_from_path(str(src), first_page=1, last_page=1, dpi=72)
        if not pages:
            return None
        first = pages[0]
        # Resize to longest_edge while keeping aspect
        w, h = first.size
        if max(w, h) > longest_edge:
            ratio = longest_edge / float(max(w, h))
            new_size = (int(w * ratio), int(h * ratio))
            first = first.resize(new_size)
        dst.parent.mkdir(parents=True, exist_ok=True)
        first.save(dst, format="JPEG", quality=82, optimize=True)
        return str(dst)
    except Exception as exc:
        log.warning("[thumbnail] PDF thumbnail failed for %s: %s", src, exc)
        return None


__all__ = ["create_thumbnail"]
