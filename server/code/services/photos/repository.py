"""SQLite repository for the shared photo authority layer.

Reuses the DB path / PRAGMA contract from ``server/code/api/db.py`` so
the extractor-side code and the photo lane hit the same database.

Design notes:

* Every method opens / closes its own connection (same pattern as the
  legacy ``db.py``). This trades per-call open cost for thread safety
  inside FastAPI request handlers.
* Soft-delete: ``list_photos`` / ``get_photo`` filter ``deleted_at IS NULL``
  by default. Pass ``deleted=True`` to include deleted rows (repository
  tests do this to assert the flag set).
* ``finalize_open_shows_for_session`` is the enforcement point for the
  "no dangling shown" rule; ``end_photo_session`` always calls it.
* ``select_next_photo`` and the template-prompt builder live in
  ``services/photo_elicit``; this module exposes only the data surface
  those services need.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# Connection + helpers
# -----------------------------------------------------------------------------
def _connect() -> sqlite3.Connection:
    # Defer the import so unit tests can monkeypatch DB_PATH before the
    # first repository call.
    # BUG-PHOTO-LIST-500 (2026-04-25 night): two-dot relative was wrong --
    # this file lives at code.services.photos.repository, so `..api`
    # resolves to code.services.api which doesn't exist. Need three dots
    # to climb to code.api.db. Surfaced when the saved-photos list panel
    # was first loaded -- POST upload path didn't exercise list_photos
    # so this latent import bug shipped through Phase 1 unnoticed.
    from ...api.db import _connect as legacy_connect  # type: ignore

    return legacy_connect()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def _uuid() -> str:
    return str(uuid.uuid4())


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    if row is None:
        return {}
    return {k: row[k] for k in row.keys()}


def _bool_to_int(v: Any) -> int:
    if isinstance(v, bool):
        return 1 if v else 0
    if v is None:
        return 0
    try:
        return 1 if int(v) else 0
    except (TypeError, ValueError):
        return 0


def _int_to_bool(v: Any) -> bool:
    try:
        return bool(int(v))
    except (TypeError, ValueError):
        return bool(v)


def _json_dumps(v: Any) -> str:
    if v is None or v == "":
        return "{}"
    if isinstance(v, str):
        # Accept pre-serialized JSON blobs from callers that already
        # have a canonical string form.
        return v
    return json.dumps(v, ensure_ascii=False)


def _json_loads(v: Any) -> Any:
    if v is None:
        return {}
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return {}


def _photo_row_to_model(row: sqlite3.Row) -> Dict[str, Any]:
    data = _row_to_dict(row)
    data["narrator_ready"] = _int_to_bool(data.get("narrator_ready"))
    data["needs_confirmation"] = _int_to_bool(data.get("needs_confirmation"))
    data["metadata_json"] = _json_loads(data.get("metadata_json"))
    return data


def _memory_row_to_model(row: sqlite3.Row) -> Dict[str, Any]:
    data = _row_to_dict(row)
    flags = data.get("transcript_guard_flags")
    if flags is None or flags == "":
        data["transcript_guard_flags"] = None
    else:
        try:
            parsed = json.loads(flags)
            data["transcript_guard_flags"] = parsed if isinstance(parsed, list) else None
        except (TypeError, ValueError):
            data["transcript_guard_flags"] = None
    return data


# -----------------------------------------------------------------------------
# Photo CRUD
# -----------------------------------------------------------------------------
def create_photo(
    *,
    narrator_id: str,
    image_path: str,
    thumbnail_path: Optional[str],
    file_hash: str,
    description: Optional[str] = None,
    date_value: Optional[str] = None,
    date_precision: str = "unknown",
    location_label: Optional[str] = None,
    location_source: str = "unknown",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    narrator_ready: bool = False,
    needs_confirmation: bool = True,
    uploaded_by_user_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    photo_id: Optional[str] = None,
    media_url: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
) -> Dict[str, Any]:
    pid = photo_id or _uuid()
    now = _now_iso()

    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO photos (
                id, narrator_id,
                image_path, thumbnail_path, media_url, thumbnail_url,
                file_hash,
                description,
                date_value, date_precision,
                location_label, location_source,
                latitude, longitude,
                narrator_ready, needs_confirmation,
                uploaded_by_user_id, uploaded_at,
                metadata_json,
                created_at, updated_at
            ) VALUES (
                ?, ?,
                ?, ?, ?, ?,
                ?,
                ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?, ?,
                ?,
                ?, ?
            );
            """,
            (
                pid,
                narrator_id,
                image_path,
                thumbnail_path,
                media_url,
                thumbnail_url,
                file_hash,
                description,
                date_value,
                date_precision,
                location_label,
                location_source,
                latitude,
                longitude,
                _bool_to_int(narrator_ready),
                _bool_to_int(needs_confirmation),
                uploaded_by_user_id,
                now,
                _json_dumps(metadata or {}),
                now,
                now,
            ),
        )
        con.commit()
    finally:
        con.close()

    return get_photo(pid, deleted=True) or {}


def get_photo(
    photo_id: str,
    deleted: bool = False,
) -> Optional[Dict[str, Any]]:
    con = _connect()
    try:
        if deleted:
            row = con.execute(
                "SELECT * FROM photos WHERE id = ?;",
                (photo_id,),
            ).fetchone()
        else:
            row = con.execute(
                "SELECT * FROM photos WHERE id = ? AND deleted_at IS NULL;",
                (photo_id,),
            ).fetchone()
        if row is None:
            return None
        photo = _photo_row_to_model(row)

        people_rows = con.execute(
            "SELECT * FROM photo_people WHERE photo_id = ? ORDER BY created_at ASC, id ASC;",
            (photo_id,),
        ).fetchall()
        event_rows = con.execute(
            "SELECT * FROM photo_events WHERE photo_id = ? ORDER BY created_at ASC, id ASC;",
            (photo_id,),
        ).fetchall()
        photo["people"] = [_row_to_dict(r) for r in people_rows]
        photo["events"] = [_row_to_dict(r) for r in event_rows]
        return photo
    finally:
        con.close()


def list_photos(
    narrator_id: str,
    narrator_ready: Optional[bool] = None,
    deleted: bool = False,
) -> List[Dict[str, Any]]:
    clauses = ["narrator_id = ?"]
    args: List[Any] = [narrator_id]
    if not deleted:
        clauses.append("deleted_at IS NULL")
    if narrator_ready is not None:
        clauses.append("narrator_ready = ?")
        args.append(_bool_to_int(narrator_ready))
    where = " AND ".join(clauses)
    con = _connect()
    try:
        rows = con.execute(
            f"SELECT * FROM photos WHERE {where} "
            f"ORDER BY created_at ASC, id ASC;",
            args,
        ).fetchall()
    finally:
        con.close()
    return [_photo_row_to_model(r) for r in rows]


def mark_photo_ready(
    photo_id: str,
    narrator_ready: bool,
    actor_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    now = _now_iso()
    con = _connect()
    try:
        cur = con.execute(
            """
            UPDATE photos
               SET narrator_ready = ?,
                   last_edited_by_user_id = ?,
                   last_edited_at = ?,
                   updated_at = ?
             WHERE id = ? AND deleted_at IS NULL;
            """,
            (_bool_to_int(narrator_ready), actor_id, now, now, photo_id),
        )
        con.commit()
        if cur.rowcount == 0:
            return None
    finally:
        con.close()
    return get_photo(photo_id)


_PATCHABLE_PHOTO_COLUMNS = {
    "description",
    "date_value",
    "date_precision",
    "location_label",
    "location_source",
    "latitude",
    "longitude",
    "narrator_ready",
    "needs_confirmation",
}


def patch_photo(
    photo_id: str,
    patch: Dict[str, Any],
    actor_id: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not patch:
        return get_photo(photo_id)

    now = _now_iso()
    set_parts: List[str] = []
    args: List[Any] = []
    for key, value in patch.items():
        if key not in _PATCHABLE_PHOTO_COLUMNS:
            continue
        if key in {"narrator_ready", "needs_confirmation"}:
            args.append(_bool_to_int(value))
        else:
            args.append(value)
        set_parts.append(f"{key} = ?")

    if not set_parts:
        # Nothing to write beyond metadata stamps; only record actor/time.
        set_parts.append("last_edited_by_user_id = ?")
        args.append(actor_id)
        set_parts.append("last_edited_at = ?")
        args.append(now)
        set_parts.append("updated_at = ?")
        args.append(now)
    else:
        set_parts.append("last_edited_by_user_id = ?")
        args.append(actor_id)
        set_parts.append("last_edited_at = ?")
        args.append(now)
        set_parts.append("updated_at = ?")
        args.append(now)

    args.append(photo_id)

    con = _connect()
    try:
        cur = con.execute(
            f"UPDATE photos SET {', '.join(set_parts)} "
            f"WHERE id = ? AND deleted_at IS NULL;",
            args,
        )
        con.commit()
        if cur.rowcount == 0:
            return None
    finally:
        con.close()
    return get_photo(photo_id)


def soft_delete_photo(photo_id: str, actor_id: Optional[str]) -> bool:
    now = _now_iso()
    con = _connect()
    try:
        cur = con.execute(
            """
            UPDATE photos
               SET deleted_at = ?,
                   last_edited_by_user_id = ?,
                   last_edited_at = ?,
                   updated_at = ?
             WHERE id = ? AND deleted_at IS NULL;
            """,
            (now, actor_id, now, now, photo_id),
        )
        con.commit()
        return cur.rowcount > 0
    finally:
        con.close()


# -----------------------------------------------------------------------------
# Photo people / events
# -----------------------------------------------------------------------------
def add_photo_person(
    photo_id: str,
    person_label: str,
    person_id: Optional[str] = None,
    *,
    provenance: Dict[str, Any],
) -> Dict[str, Any]:
    pid = _uuid()
    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO photo_people (
                id, photo_id, person_id, person_label,
                source_type, source_authority, source_actor_id, confidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                pid,
                photo_id,
                person_id,
                person_label,
                provenance["source_type"],
                provenance["source_authority"],
                provenance.get("source_actor_id"),
                provenance.get("confidence", "medium"),
            ),
        )
        con.commit()
        row = con.execute(
            "SELECT * FROM photo_people WHERE id = ?;", (pid,)
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row)


def add_photo_event(
    photo_id: str,
    event_label: str,
    event_id: Optional[str] = None,
    *,
    provenance: Dict[str, Any],
) -> Dict[str, Any]:
    eid = _uuid()
    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO photo_events (
                id, photo_id, event_id, event_label,
                source_type, source_authority, source_actor_id, confidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                eid,
                photo_id,
                event_id,
                event_label,
                provenance["source_type"],
                provenance["source_authority"],
                provenance.get("source_actor_id"),
                provenance.get("confidence", "medium"),
            ),
        )
        con.commit()
        row = con.execute(
            "SELECT * FROM photo_events WHERE id = ?;", (eid,)
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row)


# WO-PHOTO-PEOPLE-EDIT-01: hard-delete helpers for the people/events
# join tables, used by the PATCH endpoint to implement replace-all
# semantics for those lists. (The photos table itself is soft-deleted;
# the join rows have no soft-delete flag and don't need one — losing
# a person/event tag is recoverable by re-tagging via the modal.)
def delete_all_photo_people(photo_id: str) -> int:
    """Hard-delete every photo_people row for ``photo_id``. Returns the
    deletion count for log/UX surface."""
    con = _connect()
    try:
        cur = con.execute("DELETE FROM photo_people WHERE photo_id = ?;", (photo_id,))
        con.commit()
        return cur.rowcount or 0
    finally:
        con.close()


def delete_all_photo_events(photo_id: str) -> int:
    """Hard-delete every photo_events row for ``photo_id``. Returns the
    deletion count for log/UX surface."""
    con = _connect()
    try:
        cur = con.execute("DELETE FROM photo_events WHERE photo_id = ?;", (photo_id,))
        con.commit()
        return cur.rowcount or 0
    finally:
        con.close()


# -----------------------------------------------------------------------------
# Sessions / shows
# -----------------------------------------------------------------------------
def create_photo_session(
    narrator_id: str,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    sid = _uuid()
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO photo_sessions (
                id, narrator_id, session_id, started_at, created_at
            ) VALUES (?, ?, ?, ?, ?);
            """,
            (sid, narrator_id, session_id, now, now),
        )
        con.commit()
        row = con.execute(
            "SELECT * FROM photo_sessions WHERE id = ?;", (sid,)
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row)


def get_photo_session(session_id: str) -> Optional[Dict[str, Any]]:
    con = _connect()
    try:
        row = con.execute(
            "SELECT * FROM photo_sessions WHERE id = ?;", (session_id,)
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row) if row else None


def record_photo_show(
    photo_session_id: str,
    photo_id: str,
    prompt_text: Optional[str] = None,
    followup_text: Optional[str] = None,
) -> Dict[str, Any]:
    show_id = _uuid()
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO photo_session_shows (
                id, photo_session_id, photo_id,
                shown_at, outcome, prompt_text, followup_text, created_at
            ) VALUES (?, ?, ?, ?, 'shown', ?, ?, ?);
            """,
            (show_id, photo_session_id, photo_id, now, prompt_text, followup_text, now),
        )
        con.commit()
        row = con.execute(
            "SELECT * FROM photo_session_shows WHERE id = ?;", (show_id,)
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row)


def update_photo_show_outcome(
    show_id: str,
    outcome: str,
    followup_text: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    con = _connect()
    try:
        if followup_text is None:
            cur = con.execute(
                "UPDATE photo_session_shows SET outcome = ? WHERE id = ?;",
                (outcome, show_id),
            )
        else:
            cur = con.execute(
                "UPDATE photo_session_shows SET outcome = ?, followup_text = ? WHERE id = ?;",
                (outcome, followup_text, show_id),
            )
        con.commit()
        if cur.rowcount == 0:
            return None
        row = con.execute(
            "SELECT * FROM photo_session_shows WHERE id = ?;", (show_id,)
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row) if row else None


def get_photo_show(show_id: str) -> Optional[Dict[str, Any]]:
    con = _connect()
    try:
        row = con.execute(
            "SELECT * FROM photo_session_shows WHERE id = ?;", (show_id,)
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row) if row else None


def finalize_open_shows_for_session(photo_session_id: str) -> int:
    """Flip any still-``shown`` rows to ``skipped`` for the given session.

    Returns the number of rows updated. This is the enforcement point for
    the "no dangling shown" rule — the only caller today is
    ``end_photo_session``, but the method stays public for tests.
    """

    con = _connect()
    try:
        cur = con.execute(
            """
            UPDATE photo_session_shows
               SET outcome = 'skipped'
             WHERE photo_session_id = ?
               AND outcome = 'shown';
            """,
            (photo_session_id,),
        )
        con.commit()
        return cur.rowcount
    finally:
        con.close()


def _finalize_open_memories_for_session(
    con: sqlite3.Connection, photo_session_id: str, now: str
) -> int:
    cur = con.execute(
        """
        UPDATE photo_memories
           SET finalized_at = ?
         WHERE photo_session_show_id IN (
            SELECT id FROM photo_session_shows WHERE photo_session_id = ?
         )
           AND finalized_at IS NULL;
        """,
        (now, photo_session_id),
    )
    return cur.rowcount


def end_photo_session(photo_session_id: str) -> Optional[Dict[str, Any]]:
    """Close a session, finalize dangling shows + memories.

    Returns the closed session row (including ``ended_at``), plus the
    counts that were adjusted so the API layer can expose them to the
    caller.
    """

    now = _now_iso()
    con = _connect()
    try:
        existing = con.execute(
            "SELECT * FROM photo_sessions WHERE id = ?;", (photo_session_id,)
        ).fetchone()
        if existing is None:
            return None

        shows_finalized = con.execute(
            """
            UPDATE photo_session_shows
               SET outcome = 'skipped'
             WHERE photo_session_id = ?
               AND outcome = 'shown';
            """,
            (photo_session_id,),
        ).rowcount

        memories_finalized = _finalize_open_memories_for_session(
            con, photo_session_id, now
        )

        con.execute(
            """
            UPDATE photo_sessions
               SET ended_at = ?
             WHERE id = ?;
            """,
            (now, photo_session_id),
        )
        con.commit()

        row = con.execute(
            "SELECT * FROM photo_sessions WHERE id = ?;", (photo_session_id,)
        ).fetchone()
    finally:
        con.close()

    session = _row_to_dict(row) if row else {}
    session["shows_finalized"] = shows_finalized
    session["memories_finalized"] = memories_finalized
    return session


# -----------------------------------------------------------------------------
# Memories
# -----------------------------------------------------------------------------
def create_photo_memory(
    *,
    photo_id: str,
    photo_session_show_id: str,
    transcript: str,
    memory_type: str,
    transcript_source: Optional[str] = None,
    transcript_confidence: Optional[float] = None,
    transcript_guard_flags: Optional[Iterable[str]] = None,
    provenance: Dict[str, Any],
) -> Dict[str, Any]:
    mid = _uuid()
    now = _now_iso()

    if transcript_guard_flags is None:
        flags_json: Optional[str] = None
    else:
        flags_list = [str(f) for f in transcript_guard_flags]
        flags_json = json.dumps(flags_list, ensure_ascii=False)

    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO photo_memories (
                id, photo_id, photo_session_show_id,
                transcript, memory_type,
                transcript_source, transcript_confidence, transcript_guard_flags,
                source_type, source_authority, source_actor_id,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                mid,
                photo_id,
                photo_session_show_id,
                transcript,
                memory_type,
                transcript_source,
                transcript_confidence,
                flags_json,
                provenance.get("source_type", "narrator_story"),
                provenance.get("source_authority", "narrator"),
                provenance.get("source_actor_id"),
                now,
            ),
        )
        con.commit()
        row = con.execute(
            "SELECT * FROM photo_memories WHERE id = ?;", (mid,)
        ).fetchone()
    finally:
        con.close()
    return _memory_row_to_model(row) if row else {}


def list_photo_memories(photo_id: str) -> List[Dict[str, Any]]:
    con = _connect()
    try:
        rows = con.execute(
            """
            SELECT * FROM photo_memories
             WHERE photo_id = ?
             ORDER BY created_at ASC, id ASC;
            """,
            (photo_id,),
        ).fetchall()
    finally:
        con.close()
    return [_memory_row_to_model(r) for r in rows]


def get_photo_memory(memory_id: str) -> Optional[Dict[str, Any]]:
    con = _connect()
    try:
        row = con.execute(
            "SELECT * FROM photo_memories WHERE id = ?;", (memory_id,)
        ).fetchone()
    finally:
        con.close()
    return _memory_row_to_model(row) if row else None


# -----------------------------------------------------------------------------
# Selector helpers
# -----------------------------------------------------------------------------
def last_show_for_photo(photo_id: str) -> Optional[Dict[str, Any]]:
    con = _connect()
    try:
        row = con.execute(
            """
            SELECT * FROM photo_session_shows
             WHERE photo_id = ?
             ORDER BY shown_at DESC, id DESC
             LIMIT 1;
            """,
            (photo_id,),
        ).fetchone()
    finally:
        con.close()
    return _row_to_dict(row) if row else None


def recent_shows(narrator_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    con = _connect()
    try:
        rows = con.execute(
            """
            SELECT sh.*
              FROM photo_session_shows sh
              JOIN photo_sessions s ON s.id = sh.photo_session_id
             WHERE s.narrator_id = ?
             ORDER BY sh.shown_at DESC, sh.id DESC
             LIMIT ?;
            """,
            (narrator_id, limit),
        ).fetchall()
    finally:
        con.close()
    return [_row_to_dict(r) for r in rows]


def count_shows_for_narrator(narrator_id: str) -> int:
    con = _connect()
    try:
        row = con.execute(
            """
            SELECT COUNT(*) AS n
              FROM photo_session_shows sh
              JOIN photo_sessions s ON s.id = sh.photo_session_id
             WHERE s.narrator_id = ?;
            """,
            (narrator_id,),
        ).fetchone()
    finally:
        con.close()
    return int(row["n"]) if row else 0


def find_photo_by_hash(
    narrator_id: str, file_hash: str
) -> Optional[Dict[str, Any]]:
    """Find an existing live photo by content hash for dedup.

    BUG-PHOTO-DEDUP-IGNORES-SOFTDELETE (2026-04-26): originally this
    query did NOT filter ``deleted_at IS NULL``, so a soft-deleted
    photo with the same file hash blocked re-upload of the same file.
    Operator workflow: delete a photo → try to upload it again →
    "This photo is already saved for this narrator" with no obvious
    way to recover other than hard-deleting from the DB. Now scoped
    to live rows only, matching the rest of the soft-delete contract
    (list_photos, get_photo, soft_delete_photo).
    """
    con = _connect()
    try:
        row = con.execute(
            """
            SELECT * FROM photos
             WHERE narrator_id = ? AND file_hash = ?
               AND deleted_at IS NULL;
            """,
            (narrator_id, file_hash),
        ).fetchone()
    finally:
        con.close()
    return _photo_row_to_model(row) if row else None


__all__ = [
    "create_photo",
    "get_photo",
    "list_photos",
    "mark_photo_ready",
    "patch_photo",
    "soft_delete_photo",
    "add_photo_person",
    "add_photo_event",
    "delete_all_photo_people",
    "delete_all_photo_events",
    "create_photo_session",
    "get_photo_session",
    "record_photo_show",
    "update_photo_show_outcome",
    "get_photo_show",
    "finalize_open_shows_for_session",
    "end_photo_session",
    "create_photo_memory",
    "list_photo_memories",
    "get_photo_memory",
    "last_show_for_photo",
    "recent_shows",
    "count_shows_for_narrator",
    "find_photo_by_hash",
]
