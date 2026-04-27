"""WO-ARCHIVE-AUDIO-01 — filesystem layout for the memory archive.

Canonical path scheme (archive session_id == ``conv_id``):

    DATA_DIR/memory/archive/people/<person_id>/sessions/<conv_id>/
        meta.json
        transcript.jsonl
        transcript.txt
        audio/
            <turn_id>.webm

Why conv_id (not interview.session_id):
    Lorevox has two "session" concepts — the chat conv_id (owned by
    ``sessions`` table, generated via ``new_conv_id()``) and the
    interview session_id (owned by ``interview_sessions``, a finer-
    grained run within a conv_id).  The archive pins to conv_id so one
    chat session has exactly one archive folder, regardless of how many
    interview runs happen inside it.

This module is side-effect free apart from ``ensure_*`` functions that
create directories on disk.  It does NOT open the DB and does NOT touch
``sessions`` rows — that's the router's job.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Iterable, Tuple


# Resolved at import time, mirrors the pattern in server/code/api/db.py
# and server/code/services/archive.py.
DATA_DIR: Path = Path(os.getenv("DATA_DIR", "data")).expanduser()

# Memory-archive root inside DATA_DIR.
MEMORY_ARCHIVE_ROOT: Path = DATA_DIR / "memory" / "archive"


# ---------------------------------------------------------------------------
# ID sanitization
# ---------------------------------------------------------------------------

# Keep alphanumerics, underscore, hyphen, dot.  Replace anything else with
# underscore.  Cap at 120 chars so paths never grow pathological.  This is
# defense in depth — production IDs are already UUIDs, but if a caller
# ever hands us a weird identifier we want to land in a safe subdir.
_SAFE_RE = re.compile(r"[^a-zA-Z0-9_.-]+")


def safe_id(value: str) -> str:
    """Sanitize an identifier for safe use as a filesystem component.

    Empty / None returns the empty string.  Caller should treat empty as
    an error (the router does).  Also rejects pure-dot inputs (``.``,
    ``..``) that would otherwise compose into a path-traversal; those
    return empty too.  Leading dots are stripped so ``.hidden`` becomes
    ``hidden`` — we don't want archive paths to produce dotfiles either.
    """

    if value is None:
        return ""
    sanitized = _SAFE_RE.sub("_", str(value).strip())
    # Strip leading dots to kill the ".." / "." / ".hidden" cases.
    sanitized = sanitized.lstrip(".")
    return sanitized[:120]


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def get_memory_archive_root() -> Path:
    """Return ``DATA_DIR/memory/archive`` (people/ sits under this)."""

    return MEMORY_ARCHIVE_ROOT


def get_person_archive_dir(person_id: str) -> Path:
    """Return the archive root for a single narrator.

    Does NOT create the directory — use :func:`ensure_session_archive_dirs`
    when you need the folder materialized.
    """

    pid = safe_id(person_id)
    if not pid:
        raise ValueError("person_id must be a non-empty string")
    return MEMORY_ARCHIVE_ROOT / "people" / pid


def get_session_archive_dir(person_id: str, conv_id: str) -> Path:
    """Return the archive dir for a single (narrator, conv_id) session.

    conv_id is the canonical archive session id.  Does NOT create the
    directory.
    """

    cid = safe_id(conv_id)
    if not cid:
        raise ValueError("conv_id must be a non-empty string")
    return get_person_archive_dir(person_id) / "sessions" / cid


def get_session_audio_dir(person_id: str, conv_id: str) -> Path:
    """Convenience — the per-session audio directory."""

    return get_session_archive_dir(person_id, conv_id) / "audio"


def ensure_session_archive_dirs(person_id: str, conv_id: str) -> Path:
    """Create the session directory tree on disk and return its root.

    Idempotent; safe to call on every session-start POST.  Also creates
    the ``audio/`` subdirectory even if no audio will land there, because
    the cost is zero and the router's file-path math assumes it exists.
    """

    base = get_session_archive_dir(person_id, conv_id)
    (base / "audio").mkdir(parents=True, exist_ok=True)
    return base


# ---------------------------------------------------------------------------
# Quota helpers
# ---------------------------------------------------------------------------


def get_person_archive_usage_bytes(person_id: str) -> int:
    """Return the total bytes used by a narrator's archive (recursive).

    Returns 0 if the folder doesn't exist yet.  Walks the tree once —
    O(files-on-disk), not cached.  Cheap for family-scale use; revisit if
    we ever store >100k turns per narrator.
    """

    try:
        base = get_person_archive_dir(person_id)
    except ValueError:
        return 0
    if not base.is_dir():
        return 0

    total = 0
    for p in base.rglob("*"):
        try:
            if p.is_file():
                total += p.stat().st_size
        except OSError:
            # Symlink dangling, permission denied, etc. — skip silently.
            continue
    return total


def get_person_archive_usage_mb(person_id: str) -> float:
    """Return the person-archive usage in MB (float)."""

    return get_person_archive_usage_bytes(person_id) / (1024.0 * 1024.0)


# ---------------------------------------------------------------------------
# Iteration helpers (for export / delete)
# ---------------------------------------------------------------------------


def iter_session_dirs(person_id: str) -> Iterable[Tuple[str, Path]]:
    """Yield ``(conv_id, session_dir)`` tuples for every session belonging
    to a narrator.  Yields nothing if the person dir doesn't exist.
    """

    try:
        base = get_person_archive_dir(person_id) / "sessions"
    except ValueError:
        return
    if not base.is_dir():
        return
    for sub in sorted(base.iterdir()):
        if sub.is_dir():
            yield (sub.name, sub)
