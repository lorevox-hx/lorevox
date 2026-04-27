"""WO-LORI-PHOTO-INTAKE-01 Phase 2 (partial) — auto-description template.

Builds a human-readable description sentence from EXIF + reverse-geocoded
address data, matching the pattern Chris's visualschedulebot photo
admin uses:

    "This image is from Tuesday, April 21, 2026 at 2:10 PM at RWRJ+2V Watrous, NM, USA"

Components are composed defensively:
  - Day-of-week / month / day / year / time come from the EXIF
    DateTimeOriginal (passed in as ISO date or full datetime).
  - Location comes from the reverse geocoder (city, state, country).
  - Plus Code prefix is optional — included when the local 6-char
    code is supplied; skipped cleanly when not.

Every component is optional. Missing pieces collapse the sentence
gracefully ("This image is from at Watrous, NM" -> "This image is from Watrous, NM, USA").
The template never raises on missing input -- it returns "" (empty
string) only when there is genuinely nothing to say.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional


def _parse_capture_dt(raw: Any) -> Optional[datetime]:
    """Parse 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS' into a datetime.

    Accepts the EXIF format ('YYYY:MM:DD HH:MM:SS') as well, since the
    raw EXIF block might be passed in unparsed in some flows.
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    # Try ISO date first
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y:%m:%d %H:%M:%S",
        "%Y-%m-%d",
        "%Y:%m:%d",
    ):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _format_time_12h(dt: datetime) -> str:
    """Return a friendly '2:10 PM' (no leading zero on hour)."""
    h = dt.hour
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12}:{dt.minute:02d} {suffix}"


def _format_address(
    city: Optional[str] = None,
    state_abbrev: Optional[str] = None,
    country: Optional[str] = None,
) -> str:
    """Compose 'Watrous, NM, USA' from parts; skips missing components.

    Empty strings + None are treated identically. Returns empty string
    when no parts are known.
    """
    parts = []
    if city and str(city).strip():
        parts.append(str(city).strip())
    if state_abbrev and str(state_abbrev).strip():
        parts.append(str(state_abbrev).strip())
    if country and str(country).strip():
        parts.append(str(country).strip())
    return ", ".join(parts)


def build_description(
    captured_at: Optional[str] = None,
    captured_dt_full: Optional[str] = None,
    plus_code: Optional[str] = None,
    city: Optional[str] = None,
    state_abbrev: Optional[str] = None,
    country: Optional[str] = None,
) -> str:
    """Return a sentence describing when + where the photo was taken.

    Args:
      captured_at: 'YYYY-MM-DD' (date only). Used to derive weekday +
        month + day + year. Time is omitted when only date is known.
      captured_dt_full: 'YYYY-MM-DD HH:MM:SS' (full timestamp). When
        present, takes precedence over captured_at and adds time.
      plus_code: Local 6-char Plus Code, e.g. 'RWRJ+2V'. Optional.
      city/state_abbrev/country: Reverse-geocoded address parts.

    Examples:
      build_description(captured_dt_full="2026-04-21 14:10:00",
                        plus_code="RWRJ+2V",
                        city="Watrous", state_abbrev="NM", country="USA")
        -> "This image is from Tuesday, April 21, 2026 at 2:10 PM at RWRJ+2V Watrous, NM, USA"

      build_description(captured_at="2026-04-21",
                        city="Watrous", state_abbrev="NM", country="USA")
        -> "This image is from Tuesday, April 21, 2026 at Watrous, NM, USA"

      build_description() -> ""
    """
    # Pick the best available timestamp (full > date-only)
    dt = _parse_capture_dt(captured_dt_full) or _parse_capture_dt(captured_at)
    has_time = dt is not None and (
        captured_dt_full is not None
        or (dt.hour != 0 or dt.minute != 0 or dt.second != 0)
    )
    address = _format_address(city, state_abbrev, country)

    # Build the date phrase
    date_phrase = ""
    if dt is not None:
        weekday = dt.strftime("%A")             # 'Tuesday'
        month = dt.strftime("%B")                # 'April'
        day = dt.day                             # 21 (no leading zero)
        year = dt.year                           # 2026
        date_phrase = f"{weekday}, {month} {day}, {year}"
        if has_time:
            date_phrase += " at " + _format_time_12h(dt)

    # Build the location phrase
    location_phrase = ""
    if plus_code and str(plus_code).strip():
        location_phrase = str(plus_code).strip()
        if address:
            location_phrase += " " + address
    elif address:
        location_phrase = address

    # Compose the full sentence -- but only include "from {date}" /
    # "at {location}" pieces when each piece is non-empty. If neither
    # piece is known, return "" so the caller knows to fall back.
    if not date_phrase and not location_phrase:
        return ""
    if date_phrase and location_phrase:
        return f"This image is from {date_phrase} at {location_phrase}"
    if date_phrase:
        return f"This image is from {date_phrase}"
    return f"This image is from {location_phrase}"


__all__ = ["build_description"]
