"""Curator-facing photo intake services.

Phase 1 (WO-LORI-PHOTO-SHARED-01) ships:
  * dedupe.sha256_file
  * thumbnail.create_thumbnail (Pillow)
  * storage.store_photo_file
  * geocode.NullGeocoder (stub — no network, no API key)

Phase 2 (WO-LORI-PHOTO-INTAKE-01) extends this package with EXIF
extraction, a real OSM Nominatim geocoder, a conflict detector, and
the curator review queue.
"""
