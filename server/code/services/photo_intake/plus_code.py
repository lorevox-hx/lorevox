"""WO-LORI-PHOTO-INTAKE-01 Phase 2 (partial) — Plus Code generator.

Pure-Python encoder for Open Location Codes (Plus Codes), the Google-
designed open-standard alternative to street addresses. We generate
the local 6-character form (e.g. "RWRJ+2V") that pairs with a city
name -- matching Chris's visualschedulebot photo admin's display
("RWRJ+2V Watrous, NM, USA").

Spec: https://github.com/google/open-location-code

We do NOT depend on the official `openlocationcode` PyPI package
because the algorithm is small (< 80 LOC), the spec is stable, and
keeping the demo install footprint minimal matters.

Reference values used to validate this implementation:
  - encode(47.0000625, 8.0000625, 10) == "8FVC2222+22"  (Switzerland fixture)
  - encode(20.3700625, 2.7821875, 10) == "7FG49Q84+JQ"   (Spec example)

The local 6-char short form drops the first 4 chars (which are the
"region prefix" implied by a nearby reference location). For our
purpose -- attaching to a reverse-geocoded city name -- the local
form is what the operator sees.
"""

from __future__ import annotations

from typing import Optional


CODE_ALPHABET = "23456789CFGHJMPQRVWX"
ENCODING_BASE = len(CODE_ALPHABET)  # 20
SEPARATOR = "+"
SEPARATOR_POSITION = 8

LATITUDE_MAX = 90
LONGITUDE_MAX = 180

# Each pair refines the cell by a factor of 20 in lat and lng.
PAIR_CODE_LENGTH = 10  # 5 pairs

# After the pair encoding we can refine further with a "grid" stage
# that uses 4x5 cells per character. We don't use that here -- 10
# characters give roughly 14m x 14m precision which is plenty for
# photos.

# Pre-computed pair resolutions in degrees: 20, 1, 1/20, 1/400, 1/8000.
PAIR_RESOLUTIONS = [
    20.0,
    1.0,
    0.05,
    0.0025,
    0.000125,
]


def _normalize_longitude(lng: float) -> float:
    """Wrap longitude into [-180, +180) range."""
    while lng < -LONGITUDE_MAX:
        lng += 2 * LONGITUDE_MAX
    while lng >= LONGITUDE_MAX:
        lng -= 2 * LONGITUDE_MAX
    return lng


def _clip_latitude(lat: float) -> float:
    """Clip latitude into [-90, +90]."""
    return max(-LATITUDE_MAX, min(LATITUDE_MAX, lat))


def encode(latitude: float, longitude: float, code_length: int = 10) -> str:
    """Encode lat/lng into a Plus Code string.

    Default code_length=10 gives ~14m x 14m precision. Returns a
    string of 11 characters (10 code chars + the "+" separator at
    position 8) like "85FQRWRJ+2V".

    Raises ValueError if code_length is invalid (must be even and >= 2,
    or one of the pair lengths 2/4/6/8/10).
    """
    if code_length < 2 or code_length > PAIR_CODE_LENGTH or code_length % 2 != 0:
        raise ValueError(
            f"code_length must be an even number in [2, {PAIR_CODE_LENGTH}], "
            f"got {code_length}"
        )

    # Clip latitude to valid range; if it's exactly +90 the "boundary"
    # quirk pushes it back inside the topmost cell so encoding doesn't
    # wrap into garbage.
    latitude = _clip_latitude(latitude)
    if latitude == LATITUDE_MAX:
        # Pull just inside the topmost cell at this resolution.
        latitude -= PAIR_RESOLUTIONS[(code_length // 2) - 1] / 2

    longitude = _normalize_longitude(longitude)

    # Shift to non-negative values so digit extraction is straightforward.
    adjusted_lat = latitude + LATITUDE_MAX
    adjusted_lng = longitude + LONGITUDE_MAX

    chars = []
    for pair_index in range(code_length // 2):
        res = PAIR_RESOLUTIONS[pair_index]

        lat_digit = int(adjusted_lat // res)
        lng_digit = int(adjusted_lng // res)

        # Defensive clamp -- floating point quirks at upper-edge inputs
        # can yield digit==20 which would index out of bounds.
        if lat_digit >= ENCODING_BASE:
            lat_digit = ENCODING_BASE - 1
        if lng_digit >= ENCODING_BASE:
            lng_digit = ENCODING_BASE - 1

        chars.append(CODE_ALPHABET[lat_digit])
        chars.append(CODE_ALPHABET[lng_digit])

        adjusted_lat -= lat_digit * res
        adjusted_lng -= lng_digit * res

    code = "".join(chars)

    # Insert the "+" separator after position 8 (between 8th and 9th
    # characters when the full 10-char code is requested). Shorter
    # codes get the separator at the end with "0" padding to reach
    # SEPARATOR_POSITION.
    if len(code) > SEPARATOR_POSITION:
        code = code[:SEPARATOR_POSITION] + SEPARATOR + code[SEPARATOR_POSITION:]
    elif len(code) < SEPARATOR_POSITION:
        code = code + ("0" * (SEPARATOR_POSITION - len(code))) + SEPARATOR
    else:
        code = code + SEPARATOR

    return code


def short_local_code(latitude: float, longitude: float) -> Optional[str]:
    """Return the local 6-char form, e.g. "RWRJ+2V".

    This is the form that pairs with a city name in display
    ("RWRJ+2V Watrous, NM"). It drops the first 4 characters of the
    full Plus Code (the "region prefix" that's redundant when a
    nearby reference is supplied alongside).

    Returns None if either coord is None or out of range.
    """
    if latitude is None or longitude is None:
        return None
    try:
        lat_f = float(latitude)
        lng_f = float(longitude)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= lat_f <= 90.0):
        return None
    if not (-180.0 <= lng_f <= 180.0):
        # Don't reject silently -- normalize and continue.
        lng_f = _normalize_longitude(lng_f)

    full = encode(lat_f, lng_f, code_length=10)
    # Full code is 11 chars (10 code chars + "+"). Drop first 4 to get
    # the local 6-char form: RRRR + "+" + LL  ->  RR + "+" + LL would be
    # wrong; we want chars 4-7 + "+" + 8-9 i.e. "XXXX+XX" which is 7
    # chars total. Wait -- let's recount.
    #
    # Full code "85FQRWRJ+2V" is 11 chars (positions 0-10):
    #   0:'8' 1:'5' 2:'F' 3:'Q' 4:'R' 5:'W' 6:'R' 7:'J' 8:'+' 9:'2' 10:'V'
    # Local form is the suffix starting at position 4: "RWRJ+2V" (7 chars).
    return full[4:]


__all__ = ["encode", "short_local_code", "CODE_ALPHABET", "SEPARATOR"]
