"""WO-ARCHIVE-AUDIO-01 — Memory archive router.

Durable storage for two-sided transcripts and narrator-only audio.  The
filesystem at DATA_DIR/memory/archive/people/<pid>/sessions/<conv_id>/
is the source of truth; the ``memory_archive_sessions`` and
``memory_archive_turns`` SQLite tables are a fast index into it.

Canonical archive session_id == conv_id.

Hard invariants (enforced regardless of flag state):
  1. Lori/assistant audio uploads return 400.  Lori TEXT is saved.
  2. Video uploads are not part of this WO.
  3. Transcript.jsonl is append-only; we never rewrite it in place.
  4. Missing audio file + present transcript row → audio_lost: true.
     Transcript is preserved; the truth stays.
  5. Narrator delete does NOT cascade to archive delete.  An explicit
     DELETE /api/memory-archive/people/{pid} is required.

Flag gate: LOREVOX_ARCHIVE_ENABLED (default off).  When off, every
handler returns 404 via ``_require_enabled``.  Storage cap via
LOREVOX_ARCHIVE_MAX_MB_PER_PERSON (default 500) + LOREVOX_ARCHIVE_WARN_AT
(default 0.8).  Over cap → 413 on audio upload; transcript still flows.
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import sqlite3
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .. import flags
from ..db import _connect, _now_iso, _uuid, ensure_session, get_session_payload
from ...utils.archive_paths import (
    DATA_DIR,
    ensure_session_archive_dirs,
    get_memory_archive_root,
    get_person_archive_dir,
    get_person_archive_usage_bytes,
    get_person_archive_usage_mb,
    get_session_archive_dir,
    get_session_audio_dir,
    iter_session_dirs,
    safe_id,
)

log = logging.getLogger("lorevox.memory_archive")

router = APIRouter(prefix="/api/memory-archive", tags=["memory-archive"])


# ---------------------------------------------------------------------------
# Flag gate + constants
# ---------------------------------------------------------------------------


def _require_enabled() -> None:
    """Return 404 when LOREVOX_ARCHIVE_ENABLED is off."""

    if not flags.archive_enabled():
        raise HTTPException(status_code=404, detail="memory archive disabled")


def _max_mb_per_person() -> int:
    """Resolve the per-person storage cap.  Invalid values fall back to 500."""

    raw = os.environ.get("LOREVOX_ARCHIVE_MAX_MB_PER_PERSON", "500")
    try:
        val = int(float(raw))
        return val if val > 0 else 500
    except (TypeError, ValueError):
        return 500


def _warn_at_fraction() -> float:
    """Resolve the warn-at threshold (0..1).  Invalid → 0.8."""

    raw = os.environ.get("LOREVOX_ARCHIVE_WARN_AT", "0.8")
    try:
        val = float(raw)
        if 0 < val < 1:
            return val
        return 0.8
    except (TypeError, ValueError):
        return 0.8


_NARRATOR_ROLES = {"narrator", "user"}
_LORI_ROLES = {"lori", "assistant"}
_ALL_ROLES = _NARRATOR_ROLES | _LORI_ROLES


# ---------------------------------------------------------------------------
# Pydantic payloads
# ---------------------------------------------------------------------------


class _SessionStart(BaseModel):
    person_id: str = Field(..., min_length=1)
    conv_id: str = Field(..., min_length=1)
    session_style: str = ""
    audio_enabled: bool = True
    video_enabled: bool = False
    ensure_chat_session: bool = True


class _TurnAppend(BaseModel):
    person_id: str = Field(..., min_length=1)
    conv_id: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1)
    content: str = ""
    turn_id: Optional[str] = None
    seq: Optional[int] = None
    audio_ref: Optional[str] = None
    confirmed: bool = False
    meta: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# DB helpers (scoped to this router so we don't leak SQL across modules)
# ---------------------------------------------------------------------------


def _upsert_session_row(
    person_id: str,
    conv_id: str,
    archive_dir: str,
    audio_enabled: bool,
    video_enabled: bool,
    session_style: str,
) -> str:
    """Insert-or-update a memory_archive_sessions row.  Returns the row id."""

    now = _now_iso()
    con = _connect()
    try:
        existing = con.execute(
            "SELECT id FROM memory_archive_sessions WHERE person_id=? AND conv_id=?;",
            (person_id, conv_id),
        ).fetchone()
        if existing:
            row_id = existing["id"]
            con.execute(
                """
                UPDATE memory_archive_sessions
                   SET archive_dir=?, audio_enabled=?, video_enabled=?,
                       session_style=?, updated_at=?
                 WHERE id=?;
                """,
                (archive_dir, int(audio_enabled), int(video_enabled),
                 session_style, now, row_id),
            )
        else:
            row_id = _uuid()
            con.execute(
                """
                INSERT INTO memory_archive_sessions(
                    id, person_id, conv_id, archive_dir,
                    audio_enabled, video_enabled, session_style,
                    created_at, updated_at
                ) VALUES (?,?,?,?,?,?,?,?,?);
                """,
                (row_id, person_id, conv_id, archive_dir,
                 int(audio_enabled), int(video_enabled), session_style,
                 now, now),
            )
        con.commit()
        return row_id
    finally:
        con.close()


def _next_seq(person_id: str, conv_id: str) -> int:
    con = _connect()
    try:
        row = con.execute(
            """
            SELECT COALESCE(MAX(seq), 0) AS max_seq
              FROM memory_archive_turns
             WHERE person_id=? AND conv_id=?;
            """,
            (person_id, conv_id),
        ).fetchone()
        return int(row["max_seq"] or 0) + 1
    finally:
        con.close()


def _insert_turn_row(
    turn_id: str,
    person_id: str,
    conv_id: str,
    seq: int,
    role: str,
    content: str,
    audio_ref: Optional[str],
    confirmed: bool,
    meta: Dict[str, Any],
) -> None:
    con = _connect()
    try:
        con.execute(
            """
            INSERT OR REPLACE INTO memory_archive_turns(
                id, person_id, conv_id, seq, role, content,
                audio_ref, confirmed, meta_json, ts
            ) VALUES (?,?,?,?,?,?,?,?,?,?);
            """,
            (turn_id, person_id, conv_id, seq, role, content or "",
             audio_ref, int(bool(confirmed)), json.dumps(meta or {}, ensure_ascii=False),
             _now_iso()),
        )
        con.commit()
    finally:
        con.close()


def _update_turn_audio_ref(turn_id: str, person_id: str, conv_id: str, audio_ref: str) -> None:
    con = _connect()
    try:
        con.execute(
            """
            UPDATE memory_archive_turns
               SET audio_ref=?, ts=?
             WHERE id=? AND person_id=? AND conv_id=?;
            """,
            (audio_ref, _now_iso(), turn_id, person_id, conv_id),
        )
        con.commit()
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Filesystem helpers — transcript.jsonl + transcript.txt
# ---------------------------------------------------------------------------


def _txt_role_label(role: str) -> str:
    if role in _LORI_ROLES:
        return "Lori"
    return "Narrator"


def _append_jsonl(session_dir: Path, row: Dict[str, Any]) -> None:
    """Append one JSON row to transcript.jsonl.  Creates the file on demand."""

    path = session_dir / "transcript.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _append_txt(session_dir: Path, role: str, content: str) -> None:
    """Append a human-readable two-sided transcript entry."""

    label = _txt_role_label(role)
    text = (content or "").strip()
    if not text:
        return
    path = session_dir / "transcript.txt"
    with path.open("a", encoding="utf-8") as f:
        f.write(f"{label}:\n{text}\n\n")


def _read_meta(session_dir: Path) -> Dict[str, Any]:
    path = session_dir / "meta.json"
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _write_meta(session_dir: Path, meta: Dict[str, Any]) -> None:
    path = session_dir / "meta.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_jsonl(session_dir: Path) -> List[Dict[str, Any]]:
    path = session_dir / "transcript.jsonl"
    if not path.is_file():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                # Skip malformed line — keep going rather than erroring the
                # whole session read.  The caller gets the recoverable rows.
                log.warning("[memory_archive] skipping malformed jsonl line in %s", path)
                continue
    return rows


def _relative_archive_dir(full_path: Path) -> str:
    """Return the archive dir relative to DATA_DIR for storage in the DB row."""

    try:
        return str(full_path.relative_to(DATA_DIR))
    except ValueError:
        return str(full_path)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/health")
def health() -> Dict[str, Any]:
    """Flag-agnostic health probe.  Mirrors the photos /health contract."""

    return {
        "ok": True,
        "enabled": flags.archive_enabled(),
        "data_dir": str(DATA_DIR),
        "archive_root": str(get_memory_archive_root()),
        "max_mb_per_person": _max_mb_per_person(),
        "warn_at": _warn_at_fraction(),
    }


@router.post("/session/start")
def session_start(body: _SessionStart) -> Dict[str, Any]:
    """Create (or refresh) the archive folder for (person_id, conv_id).

    Idempotent — calling twice is safe; meta.json gets updated in place.
    By default also ensures the chat sessions row exists so the archive
    can be created before the first chat turn is persisted (pass
    ``ensure_chat_session=false`` to skip).
    """

    _require_enabled()

    person_id = safe_id(body.person_id)
    conv_id = safe_id(body.conv_id)
    if not person_id or not conv_id:
        raise HTTPException(status_code=400, detail="person_id and conv_id are required")

    # Make sure the chat-layer sessions row exists so the archive isn't
    # orphaned from the DB side.  Caller can opt out.
    if body.ensure_chat_session:
        try:
            ensure_session(conv_id, title=body.session_style or "")
        except sqlite3.Error as exc:
            log.warning("[memory_archive] ensure_session failed: %s", exc)

    session_dir = ensure_session_archive_dirs(person_id, conv_id)

    existing_meta = _read_meta(session_dir)
    now = _now_iso()
    meta = {
        "version": 1,
        "person_id": person_id,
        "conv_id": conv_id,
        "started_at": existing_meta.get("started_at") or now,
        "updated_at": now,
        "session_style": body.session_style or existing_meta.get("session_style", ""),
        "audio_enabled": bool(body.audio_enabled),
        "video_enabled": bool(body.video_enabled),
        "lori_audio_saved": False,
    }
    _write_meta(session_dir, meta)

    row_id = _upsert_session_row(
        person_id=person_id,
        conv_id=conv_id,
        archive_dir=_relative_archive_dir(session_dir),
        audio_enabled=bool(body.audio_enabled),
        video_enabled=bool(body.video_enabled),
        session_style=body.session_style or "",
    )

    usage_mb = get_person_archive_usage_mb(person_id)
    cap_mb = _max_mb_per_person()

    return {
        "ok": True,
        "archive_dir": _relative_archive_dir(session_dir),
        "archive_dir_abs": str(session_dir),
        "row_id": row_id,
        "meta": meta,
        "usage": {
            "used_mb": round(usage_mb, 3),
            "cap_mb": cap_mb,
            "warn_at": _warn_at_fraction(),
        },
    }


@router.post("/turn")
def append_turn(body: _TurnAppend) -> Dict[str, Any]:
    """Append a transcript turn to a session.

    Lori / assistant turns force ``audio_ref=None`` regardless of what the
    client sent.  Narrator / user turns may carry an ``audio_ref`` (the
    audio blob upload happens separately via POST /audio).
    """

    _require_enabled()

    role = (body.role or "").strip().lower()
    if role not in _ALL_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"role must be one of {sorted(_ALL_ROLES)}",
        )

    person_id = safe_id(body.person_id)
    conv_id = safe_id(body.conv_id)
    if not person_id or not conv_id:
        raise HTTPException(status_code=400, detail="person_id and conv_id are required")

    session_dir = ensure_session_archive_dirs(person_id, conv_id)
    # Make sure meta exists even if caller skipped session/start.
    if not (session_dir / "meta.json").is_file():
        _write_meta(session_dir, {
            "version": 1, "person_id": person_id, "conv_id": conv_id,
            "started_at": _now_iso(), "updated_at": _now_iso(),
            "session_style": "", "audio_enabled": True,
            "video_enabled": False, "lori_audio_saved": False,
        })
        _upsert_session_row(
            person_id=person_id, conv_id=conv_id,
            archive_dir=_relative_archive_dir(session_dir),
            audio_enabled=True, video_enabled=False, session_style="",
        )

    turn_id = (body.turn_id or "").strip() or _uuid()
    # Normalize turn_id the same way path components are sanitized, because
    # the audio filename will derive from it downstream.
    turn_id = safe_id(turn_id)

    # Lori audio forced off.
    audio_ref = None
    if role in _NARRATOR_ROLES and body.audio_ref:
        audio_ref = str(body.audio_ref).strip() or None

    seq = body.seq if (body.seq is not None and body.seq > 0) else _next_seq(person_id, conv_id)

    jsonl_row = {
        "turn_id": turn_id,
        "seq": seq,
        "role": role,
        "content": body.content or "",
        "ts": _now_iso(),
        "audio_ref": audio_ref,
        "confirmed": bool(body.confirmed),
        "meta": body.meta or {},
    }
    _append_jsonl(session_dir, jsonl_row)
    _append_txt(session_dir, role, body.content or "")
    _insert_turn_row(
        turn_id=turn_id,
        person_id=person_id,
        conv_id=conv_id,
        seq=seq,
        role=role,
        content=body.content or "",
        audio_ref=audio_ref,
        confirmed=bool(body.confirmed),
        meta=body.meta or {},
    )

    return {
        "ok": True,
        "turn_id": turn_id,
        "seq": seq,
        "audio_ref": audio_ref,
    }


@router.post("/audio")
async def upload_audio(
    person_id: str = Form(...),
    conv_id: str = Form(...),
    turn_id: str = Form(...),
    role: str = Form(...),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    """Upload narrator audio for a specific turn.

    Hard-rejects role=lori/assistant with 400.  Also rejects if the
    person's total archive usage exceeds the configured cap (413).
    """

    _require_enabled()

    role_norm = (role or "").strip().lower()
    if role_norm in _LORI_ROLES:
        raise HTTPException(status_code=400, detail="Lori/assistant audio is never saved")
    if role_norm not in _NARRATOR_ROLES:
        raise HTTPException(status_code=400, detail="role must be narrator or user")

    pid = safe_id(person_id)
    cid = safe_id(conv_id)
    tid = safe_id(turn_id)
    if not pid or not cid or not tid:
        raise HTTPException(status_code=400, detail="person_id, conv_id, turn_id are required")

    # Quota check — read the pre-upload size.  We block new audio when
    # over cap but still accept transcript.  Transcript is tiny and saving
    # it is the archive's core value.
    used_bytes = get_person_archive_usage_bytes(pid)
    cap_bytes = _max_mb_per_person() * 1024 * 1024
    if cap_bytes > 0 and used_bytes >= cap_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"archive quota exceeded ({used_bytes / (1024*1024):.1f} MB used of {_max_mb_per_person()} MB cap)",
        )

    ensure_session_archive_dirs(pid, cid)
    audio_dir = get_session_audio_dir(pid, cid)

    # Extension from filename, default webm.  Keep lowercase.
    original_name = (file.filename or "").strip()
    ext = ""
    if "." in original_name:
        ext = original_name.rsplit(".", 1)[1].lower()
    if not ext or not ext.isalnum() or len(ext) > 5:
        ext = "webm"

    dest = audio_dir / f"{tid}.{ext}"

    # Stream the upload — FastAPI's UploadFile gives us an async .read().
    # For family-scale audio (~seconds–minutes), buffering the whole thing
    # is fine and simpler than shutil.copyfileobj on the sync side.
    content = await file.read()
    try:
        dest.write_bytes(content)
    except OSError as exc:
        log.error("[memory_archive] audio write failed %s: %s", dest, exc)
        raise HTTPException(status_code=500, detail="failed to persist audio file")

    audio_ref = f"audio/{tid}.{ext}"
    # If a transcript row exists, point it at the newly uploaded file so a
    # later GET returns audio_lost: false without the caller needing to
    # re-POST /turn with the ref.
    _update_turn_audio_ref(tid, pid, cid, audio_ref)

    return {
        "ok": True,
        "turn_id": tid,
        "audio_ref": audio_ref,
        "bytes": len(content),
        "archive_dir": _relative_archive_dir(get_session_archive_dir(pid, cid)),
    }


@router.get("/session/{conv_id}")
def get_session(
    conv_id: str,
    person_id: str = Query(..., min_length=1),
) -> Dict[str, Any]:
    """Return meta + transcript rows for a single session.

    For every row with an ``audio_ref`` we stat the file and stamp
    ``audio_lost: true`` if it's missing.  Transcript rows are never
    dropped — a missing audio file is a diagnostic annotation, not a
    reason to lose the text.
    """

    _require_enabled()

    pid = safe_id(person_id)
    cid = safe_id(conv_id)
    if not pid or not cid:
        raise HTTPException(status_code=400, detail="person_id and conv_id are required")

    session_dir = get_session_archive_dir(pid, cid)
    if not session_dir.is_dir():
        raise HTTPException(status_code=404, detail="session archive not found")

    meta = _read_meta(session_dir)
    rows = _read_jsonl(session_dir)

    audio_dir = session_dir / "audio"
    for row in rows:
        ref = row.get("audio_ref")
        if not ref:
            continue
        # Audio refs live under the session dir as "audio/<turn_id>.<ext>"
        audio_path = session_dir / ref
        row["audio_lost"] = not audio_path.is_file()

    return {
        "ok": True,
        "meta": meta,
        "turns": rows,
        "archive_dir": _relative_archive_dir(session_dir),
    }


@router.get("/people/{person_id}/export")
def export_person(person_id: str) -> StreamingResponse:
    """Zip the narrator's entire archive and stream it.

    Uses an in-memory BytesIO since archives are small at family scale
    (hundreds of MB at most per the default cap).  If a future narrator
    blows past the cap we'll switch to a temp-file streamer, but that's
    a follow-up lane.
    """

    _require_enabled()

    pid = safe_id(person_id)
    if not pid:
        raise HTTPException(status_code=400, detail="person_id is required")

    base = get_person_archive_dir(pid)
    if not base.is_dir():
        raise HTTPException(status_code=404, detail="no archive for this narrator")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in base.rglob("*"):
            if path.is_file():
                # Keep paths relative to the narrator root so unzip gives
                # a sensible "sessions/<conv_id>/…" tree.
                arcname = path.relative_to(base)
                zf.write(path, arcname=str(arcname))
    buf.seek(0)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"lorevox_archive_{pid}_{ts}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/people/{person_id}")
def delete_person_archive(person_id: str) -> Dict[str, Any]:
    """Explicitly wipe a narrator's memory archive.

    This endpoint is intentionally decoupled from the narrator-delete
    cascade.  Deleting a narrator record does NOT remove their archive;
    the operator has to call this separately after confirming they really
    want the memoir content gone.  Returns a count of files removed and
    the byte total.
    """

    _require_enabled()

    pid = safe_id(person_id)
    if not pid:
        raise HTTPException(status_code=400, detail="person_id is required")

    base = get_person_archive_dir(pid)

    removed_files = 0
    removed_bytes = 0
    if base.is_dir():
        for path in base.rglob("*"):
            if path.is_file():
                try:
                    removed_bytes += path.stat().st_size
                    removed_files += 1
                except OSError:
                    pass
        try:
            shutil.rmtree(base)
        except OSError as exc:
            log.error("[memory_archive] rmtree failed %s: %s", base, exc)
            raise HTTPException(status_code=500, detail="failed to delete archive tree")

    # DB rows — drop session + turn rows for this narrator.
    con = _connect()
    try:
        con.execute("DELETE FROM memory_archive_turns WHERE person_id=?;", (pid,))
        con.execute("DELETE FROM memory_archive_sessions WHERE person_id=?;", (pid,))
        con.commit()
    finally:
        con.close()

    return {
        "ok": True,
        "person_id": pid,
        "removed_files": removed_files,
        "removed_bytes": removed_bytes,
    }
