"""Phase 1 geocoder — ``NullGeocoder`` only.

Deliberately no network, no API key, no Google dependency. Phase 2
(WO-LORI-PHOTO-INTAKE-01) lands a real geocoder in a sibling module
(``geocode_real.py``); the null geocoder remains available there as a
graceful offline fallback.
"""

from __future__ import annotations

from typing import Dict, Optional


class NullGeocoder:
    """Geocoder stub that returns ``unknown`` for every query.

    The stub exists so the photo intake pipeline can always call
    ``geocoder.geocode(text)`` without worrying about whether a real
    provider is configured. Phase 1 does not attempt to geocode free
    text; any location string entered by the curator stays ``unknown``
    until Phase 2.
    """

    provider_name: str = "null"

    def geocode(self, text: Optional[str]) -> Dict[str, Optional[object]]:
        return {
            "latitude": None,
            "longitude": None,
            "location_source": "unknown",
            "provider": self.provider_name,
        }

    def reverse_geocode(
        self, latitude: Optional[float], longitude: Optional[float]
    ) -> Dict[str, Optional[object]]:
        return {
            "label": None,
            "location_source": "unknown",
            "provider": self.provider_name,
        }


__all__ = ["NullGeocoder"]
