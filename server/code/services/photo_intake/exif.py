"""WO-LORI-PHOTO-INTAKE-01 Phase 2 (partial) — EXIF extraction.

Reads EXIF metadata from a JPEG/HEIC/PNG and returns a structured dict
the upload handler uses as defaults when the curator left date or
location fields blank.

Design rules:
  - **Fail-soft.** Any exception (corrupt EXIF, unsupported format, missing
    Pillow tag) returns the empty-shape dict. Uploads must never 500 from
    EXIF parsing. The original photo + curator-supplied metadata still land.
  - **Curator wins.** This module never overrides curator-supplied fields.
    The handler decides whether to use the EXIF values; this module just
    parses and returns them.
  - **No network.** Reverse-geocoding (GPS → city name) is a separate
    Phase 2 service (`photo_intake/geocode_real.py`). This module only
    reports the raw lat/lng + `source='exif_gps'`.
  - **JSON-safe raw_exif.** Pillow returns IFDRational, bytes, etc. We
    keep only str/int/float/bool/None values so the dict can land in
    `photos.metadata_json` without a custom encoder.

Returned shape (per WO-LORI-PHOTO-INTAKE-01 §7):

    {
        "captured_at": "YYYY-MM-DD" | None,
        "captured_at_precision": "day" | "month" | "year" | "unknown",
        "gps": {
            "latitude":  float | None,
            "longitude": float | None,
            "source":    "exif_gps" | "unknown",
        },
        "orientation": int | None,
        "raw_exif": dict   # JSON-safe subset for metadata_json["exif"]
    }
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

log = logging.getLogger("lorevox.photo_intake.exif")


# Empty-shape constant. Always return a *copy* (`dict(_EMPTY)`) so callers
# can mutate the result without leaking back into this module-level value.
_EMPTY: Dict[str, Any] = {
    "captured_at": None,
    "captured_at_precision": "unknown",
    "gps": {"latitude": None, "longitude": None, "source": "unknown"},
    "orientation": None,
    "raw_exif": {},
}


def _empty() -> Dict[str, Any]:
    """Return a fresh copy of the empty-shape dict."""
    return {
        "captured_at": None,
        "captured_at_precision": "unknown",
        "gps": {"latitude": None, "longitude": None, "source": "unknown"},
        "orientation": None,
        "raw_exif": {},
    }


def _coerce_float(value: Any) -> Optional[float]:
    """Coerce Pillow's IFDRational / tuple / int / float to a plain float.

    Returns None on any conversion error. Pillow returns DMS components as
    `IFDRational` (a subclass of float) on modern versions and as
    `(num, den)` tuples on older versions; both must work.
    """
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        # IFDRational has .__float__
        if hasattr(value, "__float__"):
            return float(value)
        # Old Pillow: (num, den) tuple
        if isinstance(value, tuple) and len(value) == 2:
            num, den = value
            if den == 0:
                return None
            return float(num) / float(den)
    except Exception:
        return None
    return None


def _dms_to_decimal(dms: Any, ref: Any) -> Optional[float]:
    """Convert EXIF GPS DMS triple + N/S/E/W ref to decimal degrees.

    `dms` is a 3-tuple of degree/minute/second values (each may be
    IFDRational, float, or `(num, den)` tuple). `ref` is "N"/"S"/"E"/"W".
    Returns None if anything is missing or malformed.
    """
    try:
        if dms is None or ref is None:
            return None
        if not (isinstance(dms, (tuple, list)) and len(dms) == 3):
            return None
        d = _coerce_float(dms[0])
        m = _coerce_float(dms[1])
        s = _coerce_float(dms[2])
        if d is None or m is None or s is None:
            return None
        deg = d + (m / 60.0) + (s / 3600.0)
        ref_str = str(ref).strip().upper()
        if ref_str in ("S", "W"):
            deg = -deg
        # Six decimals ≈ 11 cm precision; plenty for photo geolocation.
        return round(deg, 6)
    except Exception:
        return None


def _parse_capture_dt(raw: str) -> Tuple[Optional[str], str]:
    """Parse EXIF DateTimeOriginal-style string to ISO date + precision.

    EXIF uses 'YYYY:MM:DD HH:MM:SS' format. We return only the date part
    plus a precision label (always 'day' here — EXIF is always full-date
    when present). Year-only or month-only EXIF doesn't exist in the spec.
    """
    try:
        if not isinstance(raw, str):
            return (None, "unknown")
        date_part = raw.strip().split(" ")[0]
        bits = date_part.split(":")
        if len(bits) != 3:
            return (None, "unknown")
        y, m, d = bits
        yi = int(y)
        mi = int(m)
        di = int(d)
        if yi < 1800 or yi > 2100:
            return (None, "unknown")
        if not (1 <= mi <= 12):
            return (None, "unknown")
        if not (1 <= di <= 31):
            return (None, "unknown")
        # BUG-PHOTO-PRECISION-DAY: DB CHECK constraint allows
        # ('exact','month','year','decade','unknown') -- "day" is NOT in
        # the enum. EXIF DateTimeOriginal carries down to the second so
        # "exact" is the correct semantic match for a full date.
        return (f"{yi:04d}-{mi:02d}-{di:02d}", "exact")
    except Exception:
        return (None, "unknown")


def _safe_raw(tag_map: Dict[Any, Any]) -> Dict[str, Any]:
    """Filter EXIF tag dict down to JSON-safe scalars only.

    Bytes, IFDRational, nested dicts of GPSInfo, etc. are dropped. The
    surviving subset is enough for forensic review without needing a
    custom JSON encoder when we serialize into `photos.metadata_json`.
    """
    out: Dict[str, Any] = {}
    for key, val in tag_map.items():
        try:
            sk = str(key)
        except Exception:
            continue
        if isinstance(val, (str, int, float, bool)) or val is None:
            out[sk] = val
        elif hasattr(val, "__float__"):
            try:
                out[sk] = float(val)
            except Exception:
                pass
        # Everything else (bytes, dict, tuple) is dropped intentionally.
    return out


def extract_exif(source_path: str) -> Dict[str, Any]:
    """Read EXIF from `source_path` and return a structured dict.

    See module docstring for the returned shape. Always returns a dict;
    never raises. On any failure, returns `_empty()`.
    """
    try:
        # Local import so a missing Pillow doesn't break module import
        # (handler logs a warning at call site instead of router crash).
        from PIL import ExifTags, Image  # type: ignore
        from PIL.ExifTags import GPSTAGS  # type: ignore
    except ImportError as exc:
        log.warning("Pillow not available, EXIF disabled: %s", exc)
        return _empty()

    try:
        img = Image.open(source_path)
    except Exception as exc:
        log.debug("Pillow could not open %s for EXIF: %s", source_path, exc)
        return _empty()

    try:
        raw = img._getexif() if hasattr(img, "_getexif") else None
    except Exception as exc:
        log.debug("EXIF read failed for %s: %s", source_path, exc)
        raw = None

    if not raw:
        return _empty()

    try:
        tag_map = {ExifTags.TAGS.get(tag_id, tag_id): val for tag_id, val in raw.items()}
    except Exception as exc:
        log.debug("EXIF tag-map build failed for %s: %s", source_path, exc)
        return _empty()

    # ---- Date ---------------------------------------------------------
    captured_at: Optional[str] = None
    precision: str = "unknown"
    for date_key in ("DateTimeOriginal", "DateTimeDigitized", "DateTime"):
        candidate = tag_map.get(date_key)
        if candidate:
            parsed, prec = _parse_capture_dt(str(candidate))
            if parsed:
                captured_at = parsed
                precision = prec
                break

    # ---- GPS ----------------------------------------------------------
    # P1.1 (code review 2026-04-26 night): distinguish "no GPS tag at
    # all" (gps_present=False) from "GPS tag present but unparseable"
    # (gps_present=True + lat/lng=None). Modal UI surfaces this so the
    # curator sees "GPS data found but unreadable" instead of assuming
    # the phone didn't capture metadata. Without this distinction the
    # latter case is invisible — operator wastes time looking for the
    # missing GPS that's actually corrupted.
    gps_out = {
        "latitude": None,
        "longitude": None,
        "source": "unknown",
        "present_unparseable": False,
    }
    gps_raw = tag_map.get("GPSInfo")
    if gps_raw:
        try:
            gps_named = {GPSTAGS.get(k, k): v for k, v in gps_raw.items()}
        except Exception:
            gps_named = {}
        lat = _dms_to_decimal(
            gps_named.get("GPSLatitude"), gps_named.get("GPSLatitudeRef")
        )
        lng = _dms_to_decimal(
            gps_named.get("GPSLongitude"), gps_named.get("GPSLongitudeRef")
        )
        if lat is not None and lng is not None:
            # Sanity-check ranges; Pillow occasionally returns junk for
            # photos whose GPSInfo block is present-but-empty.
            if -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0:
                gps_out = {
                    "latitude": lat,
                    "longitude": lng,
                    "source": "exif_gps",
                    "present_unparseable": False,
                }
            else:
                # Out-of-range coordinates — tag was there but the data
                # is junk. Flag for the modal pill.
                gps_out["present_unparseable"] = True
                log.info(
                    "[exif] GPS coords out of range (lat=%s, lng=%s) — flagging unparseable",
                    lat, lng,
                )
        else:
            # GPSInfo block existed but DMS conversion failed for one
            # or both axes (zero denominators / partial DMS triple /
            # unsupported encoding).
            gps_out["present_unparseable"] = True
            log.info(
                "[exif] GPSInfo block present but DMS-decimal conversion failed — flagging unparseable"
            )

    # ---- Orientation --------------------------------------------------
    orientation_val = tag_map.get("Orientation")
    if isinstance(orientation_val, int):
        orientation = orientation_val
    else:
        try:
            orientation = int(orientation_val) if orientation_val is not None else None
        except Exception:
            orientation = None

    return {
        "captured_at": captured_at,
        "captured_at_precision": precision,
        "gps": gps_out,
        "orientation": orientation,
        "raw_exif": _safe_raw(tag_map),
    }


__all__ = ["extract_exif"]
