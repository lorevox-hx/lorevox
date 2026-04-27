"""WO-MEDIA-ARCHIVE-01 — best-effort document inspection.

Probes uploaded files to extract:
  - page_count    (PDFs only, via pypdf if installed)
  - text_status   (heuristic; image-only PDF detection)

NEVER raises. Returns a dict with the keys it could fill; missing
keys mean "couldn't determine, leave the DB default."

Why no actual OCR yet:
  OCR + handwriting recognition is deferred to WO-MEDIA-OCR-01 per
  the spec. This module just looks at structural metadata that's
  cheap to extract (page count from PDF metadata, heuristic check
  for image-only-PDF) so the operator gets useful info in the row
  without waiting for a full Tesseract pipeline.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional, Union


log = logging.getLogger("lorevox.media_archive.text_probe")

_PathLike = Union[str, Path]


def probe_document(
    source_path: _PathLike,
    mime_type: str = "",
) -> Dict[str, Any]:
    """Inspect a document. Returns a dict, possibly empty:

        {
            "page_count": 18 | None,
            "text_status": "image_only_needs_ocr" | "not_started" | None,
        }

    Always safe to call; never raises.
    """
    out: Dict[str, Any] = {}
    src = Path(source_path)
    if not src.is_file():
        return out

    mime = (mime_type or "").lower()
    ext = src.suffix.lower()

    if mime == "application/pdf" or ext == ".pdf":
        pdf_info = _probe_pdf(src)
        out.update(pdf_info)
    elif mime.startswith("image/") or ext in (
        ".jpg", ".jpeg", ".png", ".tiff", ".tif",
        ".webp", ".heic", ".heif", ".gif", ".bmp",
    ):
        # Single-image scans are by definition "image only" until
        # OCR runs. Page count is 1.
        out["page_count"] = 1
        out["text_status"] = "image_only_needs_ocr"
    elif mime in ("text/plain", "text/markdown") or ext in (".txt", ".md"):
        # Plain-text files: text is already there, no OCR needed.
        # We don't read the contents here — the operator can paste
        # them into manual_transcription if desired.
        out["text_status"] = "manual_complete"
        out["page_count"] = None
    # Other types: leave defaults

    return out


def _probe_pdf(src: Path) -> Dict[str, Any]:
    """Try to detect page count + image-only-ness using pypdf."""
    out: Dict[str, Any] = {}

    try:
        # pypdf is the modern fork of PyPDF2; both APIs are similar.
        # Try pypdf first, fall back to PyPDF2 if the older lib is the
        # one that ships in the venv.
        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError:
            from PyPDF2 import PdfReader  # type: ignore  # noqa: F401
    except ImportError:
        log.info(
            "[text_probe] neither pypdf nor PyPDF2 installed; "
            "PDF page count + image-only detection skipped"
        )
        return out

    try:
        reader = PdfReader(str(src))
        page_count = len(reader.pages)
        out["page_count"] = page_count

        # Heuristic for image-only PDFs (scans): if the first 3 pages
        # combined yield essentially no extracted text (< 20 chars),
        # the PDF is probably scanned and needs OCR.
        sample_text = ""
        sample_pages = min(3, page_count)
        try:
            for i in range(sample_pages):
                page = reader.pages[i]
                t = page.extract_text() or ""
                sample_text += t
                if len(sample_text) > 200:
                    break
        except Exception as exc:
            # extract_text can throw on malformed PDFs; treat as
            # image-only (the operator will type a transcription).
            log.debug("[text_probe] PDF text extraction failed: %s", exc)
            sample_text = ""

        if len(sample_text.strip()) < 20:
            out["text_status"] = "image_only_needs_ocr"
        else:
            out["text_status"] = "not_started"  # has text but no OCR/manual run yet

    except Exception as exc:
        log.warning("[text_probe] PDF probe failed for %s: %s", src, exc)

    return out


__all__ = ["probe_document"]
