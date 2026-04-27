"""Pillow-backed thumbnail creation.

Contract:
  * Preserves aspect ratio; longest edge resized to ``longest_edge`` (default 400).
  * Honors EXIF orientation so the written thumbnail is visually upright
    even when the original is rotated via EXIF metadata only.
  * Writes JPEG output (quality 82) unless the target path extension
    says otherwise; callers pass ``thumb_400.jpg`` in Phase 1.
  * Failure to import Pillow raises at call time with a clear message
    so callers can detect the missing dependency and fall back.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Union

_PathLike = Union[str, Path]


def create_thumbnail(
    source_path: _PathLike,
    target_path: _PathLike,
    longest_edge: int = 400,
) -> Dict[str, object]:
    """Create a thumbnail for ``source_path`` at ``target_path``.

    Returns ``{"path": str, "width": int, "height": int}``.
    """

    src = Path(source_path)
    dst = Path(target_path)
    dst.parent.mkdir(parents=True, exist_ok=True)

    try:
        from PIL import Image, ImageOps  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised only when Pillow missing
        raise RuntimeError(
            "Pillow is required for thumbnail generation. "
            "Install with `pip install pillow`."
        ) from exc

    with Image.open(src) as im:
        # EXIF orientation → on-disk orientation; strips the tag so the
        # thumbnail never needs a second orientation pass downstream.
        im = ImageOps.exif_transpose(im)

        # Normalize mode so saving as JPEG always succeeds.
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

        # Pillow's .thumbnail is in-place; use a copy so the source
        # buffer is left untouched.
        copy = im.copy()
        copy.thumbnail((longest_edge, longest_edge))

        suffix = dst.suffix.lower()
        if suffix in {".jpg", ".jpeg"}:
            copy.save(dst, format="JPEG", quality=82, optimize=True)
        elif suffix == ".png":
            copy.save(dst, format="PNG", optimize=True)
        else:
            copy.save(dst, format="JPEG", quality=82, optimize=True)

        w, h = copy.size

    return {"path": str(dst), "width": int(w), "height": int(h)}


__all__ = ["create_thumbnail"]
