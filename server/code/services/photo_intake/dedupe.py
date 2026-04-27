"""SHA-256 helpers for photo deduplication.

Same bytes → same hash; different bytes → different hash. Streams in
64 KiB chunks so even a 50 MB upload (the configured MAX_UPLOAD_MB
default) never materializes fully in memory during hashing.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Union

_PathLike = Union[str, Path]


def sha256_file(path: _PathLike, chunk_size: int = 65536) -> str:
    """Return the lowercase hex SHA-256 of the file at ``path``."""

    p = Path(path)
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    """Return the lowercase hex SHA-256 of the given bytes."""

    return hashlib.sha256(data).hexdigest()


__all__ = ["sha256_file", "sha256_bytes"]
