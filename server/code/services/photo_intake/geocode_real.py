"""WO-LORI-PHOTO-INTAKE-01 Phase 2 (partial) — reverse geocoder.

Wraps OpenStreetMap Nominatim's reverse-geocode endpoint to turn EXIF
GPS coordinates into a human-readable address (city, state, country).

Why Nominatim instead of Google Maps:
  - Free, no API key, no billing dependency.
  - Lorevox is a family-sized installation; rate limits (1 req/sec
    per Nominatim's usage policy) are not an issue.
  - The visualschedulebot photo admin uses Google Maps; if Lorevox
    ever needs that exact format, this module is the single-file
    swap point. The interface contract (geocode_reverse -> dict) is
    designed to match either backend.

Why stdlib urllib instead of requests:
  - Avoids adding `requests` to the venv-install footprint. urllib
    handles GET-with-timeout cleanly enough for this single call.

Failure mode:
  - All errors (network down, rate-limited, parse failure, invalid
    response shape) collapse to the empty-shape dict. Photo upload
    must never 500 because of geocoder issues.

Usage policy compliance:
  - User-Agent header identifies the app per Nominatim's TOS.
  - Single-shot per call; no batching. The caller (preview endpoint)
    handles rate-limiting if needed.

Note on US state abbreviations:
  - Nominatim returns full state names ("New Mexico"). The auto-
    description template prefers two-letter abbreviations
    ("NM") to match the visualschedulebot output. We hold a small
    US-state map below and fall through to the full name for non-US
    addresses.
"""

from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional


log = logging.getLogger("lorevox.photo_intake.geocode_real")


# Empty-shape returned on any error.
_EMPTY: Dict[str, Any] = {
    "city": None,
    "state": None,
    "state_abbrev": None,
    "country": None,
    "country_code": None,
    "address_line": None,
    "provider": None,
    "raw": {},
}


# Two-letter US state abbreviations (50 states + DC + territories).
_US_STATE_ABBREV = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
    "district of columbia": "DC",
    "puerto rico": "PR", "guam": "GU", "u.s. virgin islands": "VI",
    "american samoa": "AS", "northern mariana islands": "MP",
}


_NOMINATIM_BASE = "https://nominatim.openstreetmap.org/reverse"
_REQUEST_TIMEOUT_SECONDS = 8.0
_USER_AGENT = "Lorevox/1.0 (Lori companion app; family deployment; chris@lorevox.local)"


def _empty() -> Dict[str, Any]:
    """Return a fresh copy of the empty-shape dict."""
    return {
        "city": None,
        "state": None,
        "state_abbrev": None,
        "country": None,
        "country_code": None,
        "address_line": None,
        "provider": None,
        "raw": {},
    }


def _state_to_abbrev(state_name: Optional[str], country_code: Optional[str]) -> Optional[str]:
    """Map full US state name to 2-letter abbreviation; None for non-US.

    Non-US callers receive None so the description template falls back
    to the full state/region name (which Nominatim returns natively
    for international addresses).
    """
    if not state_name:
        return None
    if country_code and country_code.upper() not in ("US", "USA"):
        return None
    key = str(state_name).strip().lower()
    return _US_STATE_ABBREV.get(key)


def _pick_city_field(addr: Dict[str, Any]) -> Optional[str]:
    """Nominatim returns city under several possible keys depending on
    settlement size. Walk in preference order from largest to smallest."""
    for key in ("city", "town", "village", "hamlet", "suburb", "neighbourhood"):
        val = addr.get(key)
        if val:
            return str(val).strip()
    return None


def _normalize_country(country_name: Optional[str], country_code: Optional[str]) -> Optional[str]:
    """Normalize 'United States' -> 'USA', 'United Kingdom' -> 'UK', etc.

    For the US we match the visualschedulebot output ("USA" not "United
    States"). For other countries we return the country name as-is.
    """
    if country_code:
        cc = country_code.upper()
        if cc in ("US", "USA"):
            return "USA"
        if cc in ("GB", "UK"):
            return "UK"
    return country_name.strip() if country_name else None


def reverse_geocode(latitude: float, longitude: float) -> Dict[str, Any]:
    """Reverse-geocode lat/lng to a structured address dict.

    Returns the empty-shape dict on any error. Never raises.

    Returned shape:
      {
        "city":         str | None,   # "Watrous"
        "state":        str | None,   # "New Mexico" (full name)
        "state_abbrev": str | None,   # "NM" (US only; None elsewhere)
        "country":      str | None,   # "USA" / "France" / etc.
        "country_code": str | None,   # "US" / "FR" / etc.
        "address_line": str | None,   # full Nominatim display_name
        "provider":     str | None,   # "nominatim"
        "raw":          dict,         # full Nominatim address dict
      }
    """
    if latitude is None or longitude is None:
        return _empty()
    try:
        lat_f = float(latitude)
        lng_f = float(longitude)
    except (TypeError, ValueError):
        return _empty()
    if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lng_f <= 180.0):
        return _empty()

    params = urllib.parse.urlencode({
        "format": "jsonv2",
        "lat": f"{lat_f:.6f}",
        "lon": f"{lng_f:.6f}",
        "zoom": "14",      # ~city/town granularity
        "addressdetails": "1",
        "accept-language": "en",
    })
    url = f"{_NOMINATIM_BASE}?{params}"

    req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=_REQUEST_TIMEOUT_SECONDS) as resp:
            if resp.status != 200:
                log.warning("Nominatim returned HTTP %s for (%s, %s)", resp.status, lat_f, lng_f)
                return _empty()
            body = resp.read().decode("utf-8", errors="replace")
    except Exception as exc:
        # Network down, timeout, DNS failure, rate-limit, etc.
        log.info("Nominatim reverse-geocode failed for (%s, %s): %s", lat_f, lng_f, exc)
        return _empty()

    try:
        payload = json.loads(body)
    except Exception as exc:
        log.warning("Nominatim returned non-JSON for (%s, %s): %s", lat_f, lng_f, exc)
        return _empty()

    if not isinstance(payload, dict):
        return _empty()

    addr = payload.get("address") or {}
    if not isinstance(addr, dict):
        addr = {}

    city = _pick_city_field(addr)
    state = addr.get("state")
    country = addr.get("country")
    country_code = addr.get("country_code")
    if country_code:
        country_code = str(country_code).upper()

    state_abbrev = _state_to_abbrev(state, country_code)
    country_normalized = _normalize_country(country, country_code)

    return {
        "city": city,
        "state": str(state).strip() if state else None,
        "state_abbrev": state_abbrev,
        "country": country_normalized,
        "country_code": country_code,
        "address_line": payload.get("display_name"),
        "provider": "nominatim",
        "raw": addr,
    }


__all__ = ["reverse_geocode"]
