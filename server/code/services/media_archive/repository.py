"""WO-MEDIA-ARCHIVE-01 — repository layer for media_archive_* tables.

CRUD + replace-all helpers for the four-table archive surface.
Mirrors the photo_intake repository conventions:
  - Soft-delete on items (deleted_at NULL filter on default queries)
  - Replace-all semantics on people / family_lines (delete-then-insert)
  - Connection helper deferred so unit tests can monkeypatch DB_PATH
"""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


log = logging.getLogger("lorevox.media_archive.repository")


# -----------------------------------------------------------------------------
# Connection + helpers
# -----------------------------------------------------------------------------
def _connect() -> sqlite3.Connection:
    # BUG-PHOTO-LIST-500 lesson: this file lives at
    # code.services.media_archive.repository; need three dots to climb
    # to code.api.db. Two dots resolves to code.services.api which
    # doesn't exist.
    from ...api.db import _connect as legacy_connect  # type: ignore
    return legacy_connect()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def _uuid() -> str:
    return uuid.uuid4().hex


def _bool_to_int(value: Optional[bool]) -> int:
    return 1 if value else 0


def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def _attach_relations(con: sqlite3.Connection, item: Dict[str, Any]) -> Dict[str, Any]:
    """Attach people / family_lines / links arrays to an item dict.

    Called by get_archive_item + each list_archive_items row so the
    response always has the full picture without N+1 round trips
    becoming a concern (curator-side surface; small N).
    """
    if not item:
        return item
    iid = item.get("id")
    if not iid:
        return item

    people_rows = con.execute(
        "SELECT * FROM media_archive_people WHERE archive_item_id = ? ORDER BY created_at ASC, id ASC;",
        (iid,),
    ).fetchall()
    item["people"] = [_row_to_dict(r) for r in people_rows]

    family_lines_rows = con.execute(
        "SELECT * FROM media_archive_family_lines WHERE archive_item_id = ? ORDER BY created_at ASC, id ASC;",
        (iid,),
    ).fetchall()
    item["family_lines"] = [_row_to_dict(r) for r in family_lines_rows]

    links_rows = con.execute(
        "SELECT * FROM media_archive_links WHERE archive_item_id = ? ORDER BY created_at ASC, id ASC;",
        (iid,),
    ).fetchall()
    item["links"] = [_row_to_dict(r) for r in links_rows]
    return item


# -----------------------------------------------------------------------------
# CRUD
# -----------------------------------------------------------------------------
def create_archive_item(
    *,
    title: str,
    document_type: str,
    storage_path: str,
    original_filename: str,
    mime_type: str,
    person_id: Optional[str] = None,
    family_line: Optional[str] = None,
    description: Optional[str] = None,
    file_ext: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    page_count: Optional[int] = None,
    text_status: str = "not_started",
    transcription_status: str = "not_started",
    extraction_status: str = "none",
    manual_transcription: Optional[str] = None,
    operator_notes: Optional[str] = None,
    summary: Optional[str] = None,
    date_value: Optional[str] = None,
    date_precision: str = "unknown",
    location_label: Optional[str] = None,
    location_source: str = "unknown",
    timeline_year: Optional[int] = None,
    life_map_era: Optional[str] = None,
    life_map_section: Optional[str] = None,
    archive_only: bool = True,
    candidate_ready: bool = False,
    needs_review: bool = False,
    uploaded_by_user_id: Optional[str] = None,
    item_id: Optional[str] = None,
) -> Dict[str, Any]:
    iid = item_id or _uuid()
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            """
            INSERT INTO media_archive_items (
                id, person_id, family_line,
                title, description,
                document_type, source_kind,
                original_filename, mime_type, file_ext, file_size_bytes,
                storage_path, media_url, thumbnail_url,
                page_count,
                text_status, transcription_status, extraction_status,
                manual_transcription, ocr_text, summary, operator_notes,
                date_value, date_precision,
                location_label, location_source,
                timeline_year, life_map_era, life_map_section,
                archive_only, candidate_ready, needs_review,
                uploaded_by_user_id,
                created_at, updated_at
            ) VALUES (
                ?, ?, ?,
                ?, ?,
                ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?,
                ?,
                ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?,
                ?, ?,
                ?, ?, ?,
                ?, ?, ?,
                ?,
                ?, ?
            );
            """,
            (
                iid, person_id, family_line,
                title, description,
                document_type, "uploaded_file",
                original_filename, mime_type, file_ext, file_size_bytes,
                storage_path, None, None,            # media_url + thumbnail_url synthesized at response time
                page_count,
                text_status, transcription_status, extraction_status,
                manual_transcription, None, summary, operator_notes,
                date_value, date_precision,
                location_label, location_source,
                timeline_year, life_map_era, life_map_section,
                _bool_to_int(archive_only), _bool_to_int(candidate_ready), _bool_to_int(needs_review),
                uploaded_by_user_id,
                now, now,
            ),
        )
        con.commit()
        row = con.execute(
            "SELECT * FROM media_archive_items WHERE id = ?;", (iid,)
        ).fetchone()
        result = _row_to_dict(row) or {}
        result = _attach_relations(con, result)
    finally:
        con.close()
    return result


def get_archive_item(
    item_id: str,
    deleted: bool = False,
) -> Optional[Dict[str, Any]]:
    con = _connect()
    try:
        if deleted:
            row = con.execute(
                "SELECT * FROM media_archive_items WHERE id = ?;",
                (item_id,),
            ).fetchone()
        else:
            row = con.execute(
                "SELECT * FROM media_archive_items WHERE id = ? AND deleted_at IS NULL;",
                (item_id,),
            ).fetchone()
        if row is None:
            return None
        result = _row_to_dict(row) or {}
        result = _attach_relations(con, result)
    finally:
        con.close()
    return result


def list_archive_items(
    person_id: Optional[str] = None,
    family_line: Optional[str] = None,
    document_type: Optional[str] = None,
    candidate_ready: Optional[bool] = None,
    include_deleted: bool = False,
) -> List[Dict[str, Any]]:
    clauses: List[str] = []
    args: List[Any] = []

    if not include_deleted:
        clauses.append("deleted_at IS NULL")
    if person_id is not None:
        clauses.append("person_id = ?")
        args.append(person_id)
    if family_line is not None:
        clauses.append("family_line = ?")
        args.append(family_line)
    if document_type is not None:
        clauses.append("document_type = ?")
        args.append(document_type)
    if candidate_ready is not None:
        clauses.append("candidate_ready = ?")
        args.append(_bool_to_int(candidate_ready))

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

    con = _connect()
    try:
        rows = con.execute(
            f"SELECT * FROM media_archive_items{where} "
            f"ORDER BY created_at DESC, id ASC;",
            args,
        ).fetchall()
        items = [_row_to_dict(r) for r in rows]
        items = [_attach_relations(con, it) for it in items if it]
    finally:
        con.close()
    return items


_ITEM_PATCH_FIELDS = (
    "title", "description",
    "document_type",
    "date_value", "date_precision",
    "location_label", "location_source",
    "timeline_year", "life_map_era", "life_map_section",
    "archive_only", "candidate_ready", "needs_review",
    "manual_transcription", "ocr_text", "summary", "operator_notes",
    "text_status", "transcription_status", "extraction_status",
    "thumbnail_url", "media_url", "page_count",
)


def patch_archive_item(
    item_id: str,
    patch: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Apply a field patch. Returns the updated row, or None if the
    item doesn't exist (caller raises 404). Replace-all semantics for
    people/family_lines/links are NOT here — the router handles those
    via the dedicated replace_* helpers below."""
    if not patch:
        return get_archive_item(item_id)

    sets: List[str] = []
    args: List[Any] = []
    for field in _ITEM_PATCH_FIELDS:
        if field in patch:
            v = patch[field]
            if field in ("archive_only", "candidate_ready", "needs_review"):
                v = _bool_to_int(bool(v))
            sets.append(f"{field} = ?")
            args.append(v)
    if not sets:
        return get_archive_item(item_id)

    sets.append("updated_at = ?")
    args.append(_now_iso())
    args.append(item_id)

    con = _connect()
    try:
        cur = con.execute(
            f"UPDATE media_archive_items SET {', '.join(sets)} "
            f"WHERE id = ? AND deleted_at IS NULL;",
            args,
        )
        con.commit()
        if cur.rowcount == 0:
            return None
        row = con.execute(
            "SELECT * FROM media_archive_items WHERE id = ?;",
            (item_id,),
        ).fetchone()
        result = _row_to_dict(row) or {}
        result = _attach_relations(con, result)
    finally:
        con.close()
    return result


def soft_delete_archive_item(
    item_id: str,
    actor_id: Optional[str] = None,
) -> bool:
    """Soft-delete; returns True if a row was affected, False if the
    item didn't exist or was already deleted."""
    now = _now_iso()
    con = _connect()
    try:
        cur = con.execute(
            "UPDATE media_archive_items SET deleted_at = ?, updated_at = ? "
            "WHERE id = ? AND deleted_at IS NULL;",
            (now, now, item_id),
        )
        con.commit()
        affected = cur.rowcount > 0
    finally:
        con.close()
    if affected:
        log.info(
            "[media_archive][repository] soft-deleted item_id=%s actor=%s",
            item_id, actor_id,
        )
    return affected


# -----------------------------------------------------------------------------
# Replace-all helpers for join tables (people / family_lines / links)
# -----------------------------------------------------------------------------
def replace_people(
    item_id: str,
    people: List[Dict[str, Any]],
) -> int:
    """Wipe + re-insert the people list for an item. Returns the count
    of rows after replacement. Each people entry: {person_label, person_id?, role?}.
    """
    now = _now_iso()
    con = _connect()
    try:
        con.execute("DELETE FROM media_archive_people WHERE archive_item_id = ?;", (item_id,))
        added = 0
        for p in people or []:
            label = (p.get("person_label") or "").strip() if isinstance(p, dict) else ""
            if not label:
                continue
            con.execute(
                """
                INSERT INTO media_archive_people (
                    id, archive_item_id, person_id, person_label, role, confidence, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    _uuid(), item_id,
                    p.get("person_id"),
                    label,
                    p.get("role"),
                    p.get("confidence", "curator_tagged"),
                    now,
                ),
            )
            added += 1
        con.commit()
    finally:
        con.close()
    return added


def replace_family_lines(
    item_id: str,
    family_lines: List[Dict[str, Any]],
) -> int:
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            "DELETE FROM media_archive_family_lines WHERE archive_item_id = ?;",
            (item_id,),
        )
        added = 0
        for entry in family_lines or []:
            line = (entry.get("family_line") or "").strip() if isinstance(entry, dict) else ""
            if not line:
                continue
            con.execute(
                """
                INSERT INTO media_archive_family_lines (
                    id, archive_item_id, family_line, confidence, created_at
                ) VALUES (?, ?, ?, ?, ?);
                """,
                (
                    _uuid(), item_id, line,
                    entry.get("confidence", "curator_tagged"),
                    now,
                ),
            )
            added += 1
        con.commit()
    finally:
        con.close()
    return added


def replace_links(
    item_id: str,
    links: List[Dict[str, Any]],
) -> int:
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            "DELETE FROM media_archive_links WHERE archive_item_id = ?;",
            (item_id,),
        )
        added = 0
        for link in links or []:
            if not isinstance(link, dict):
                continue
            link_type = (link.get("link_type") or "").strip()
            link_target = (link.get("link_target") or "").strip()
            if not link_type or not link_target:
                continue
            con.execute(
                """
                INSERT INTO media_archive_links (
                    id, archive_item_id, link_type, link_target, label, created_at
                ) VALUES (?, ?, ?, ?, ?, ?);
                """,
                (
                    _uuid(), item_id, link_type, link_target,
                    link.get("label"),
                    now,
                ),
            )
            added += 1
        con.commit()
    finally:
        con.close()
    return added


__all__ = [
    "create_archive_item",
    "get_archive_item",
    "list_archive_items",
    "patch_archive_item",
    "soft_delete_archive_item",
    "replace_people",
    "replace_family_lines",
    "replace_links",
]
