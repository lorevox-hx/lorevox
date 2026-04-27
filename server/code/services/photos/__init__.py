"""Shared photo authority layer (WO-LORI-PHOTO-SHARED-01).

Exports the stable public surface that both the curator lane (INTAKE-01)
and the narrator lane (ELICIT-01) build on: models, provenance helpers,
confidence resolution, and the SQLite repository.
"""

from .models import (  # noqa: F401
    DATE_PRECISIONS,
    LOCATION_SOURCES,
    MEMORY_TYPES,
    SHOW_OUTCOMES,
    CONFIDENCE_LEVELS,
    TRANSCRIPT_SOURCES,
    Photo,
    PhotoPerson,
    PhotoEvent,
    PhotoSession,
    PhotoSessionShow,
    PhotoMemory,
    ProvenanceStamp,
)
from .provenance import (  # noqa: F401
    ALLOWED_SOURCE_TYPES,
    ALLOWED_SOURCE_AUTHORITIES,
    make_provenance,
)
from .confidence import (  # noqa: F401
    resolve_date_confidence,
    resolve_location_confidence,
    needs_confirmation_for_location,
)
