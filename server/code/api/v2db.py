from __future__ import annotations

import os
import json
import sqlite3
import uuid
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional


# =============================================================================
# Lorevox Standalone DB (v4.2+)
# - Single SQLite file: DATA_DIR/db/lorevox.sqlite3  (or DB_NAME override)
# - Supports:
#   * chat_ws persistence (sessions/turns + persist_turn_transaction)
#   * people (CRUD-ish)
#   * profiles (get/put/patch + ingest_basic_info)
#   * media (upload metadata + list)
#   * interview driver (plans/sections/questions/sessions/answers)
#   * timeline events (add/list/delete)
#   * lightweight RAG (docs/chunks + query)
# =============================================================================


# -----------------------------------------------------------------------------
# Paths / connection
# -----------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_DIR = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)

DB_NAME = os.getenv("DB_NAME", "lorevox.sqlite3")
DB_PATH = DB_DIR / DB_NAME


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=NORMAL;")
    con.execute("PRAGMA temp_store=MEMORY;")
    return con


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _uuid() -> str:
    return uuid.uuid4().hex


# -----------------------------------------------------------------------------
# Schema bootstrap
# -----------------------------------------------------------------------------
def init_db() -> None:
    con = _connect()
    cur = con.cursor()

    # -----------------------------
    # Chat sessions + turns
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
          conv_id      TEXT PRIMARY KEY,
          title        TEXT DEFAULT '',
          updated_at   TEXT,
          payload_json TEXT
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS turns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conv_id   TEXT NOT NULL,
          role      TEXT NOT NULL,
          content   TEXT NOT NULL,
          ts        TEXT NOT NULL,
          anchor_id TEXT,
          meta_json TEXT,
          FOREIGN KEY(conv_id) REFERENCES sessions(conv_id)
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_turns_conv_ts ON turns(conv_id, ts);")

    # -----------------------------
    # Lightweight RAG tables
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_docs (
          id TEXT PRIMARY KEY,
          title TEXT,
          source TEXT,
          created_at TEXT,
          text TEXT
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_chunks (
          id TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          FOREIGN KEY(doc_id) REFERENCES rag_docs(id)
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(doc_id, chunk_index);")

    # -----------------------------
    # People + profiles
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS people (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          role TEXT,
          date_of_birth TEXT,
          place_of_birth TEXT,
          created_at TEXT,
          updated_at TEXT
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS profiles (
          person_id TEXT PRIMARY KEY,
          profile_json TEXT NOT NULL,
          updated_at TEXT,
          FOREIGN KEY(person_id) REFERENCES people(id)
        );
        """
    )

    # -----------------------------
    # Media
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          description TEXT,
          taken_at TEXT,
          location_name TEXT,
          latitude REAL,
          longitude REAL,
          exif_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(person_id) REFERENCES people(id)
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_media_person_created ON media(person_id, created_at);")

    # -----------------------------
    # Timeline
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS timeline_events (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          ts TEXT NOT NULL,                 -- ISO time for ordering (event date/time)
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          kind TEXT DEFAULT 'event',
          location_name TEXT,
          latitude REAL,
          longitude REAL,
          media_ids_json TEXT,              -- JSON array of media ids
          meta_json TEXT,                   -- freeform JSON dict
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(person_id) REFERENCES people(id)
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_timeline_person_ts ON timeline_events(person_id, ts);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_timeline_person_updated ON timeline_events(person_id, updated_at);")

    # -----------------------------
    # Interview (plans/sections/questions/sessions/answers)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_plans (
          id TEXT PRIMARY KEY,
          title TEXT,
          created_at TEXT
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_sections (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          title TEXT NOT NULL,
          ord INTEGER NOT NULL,
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id)
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_questions (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          section_id TEXT NOT NULL,
          ord INTEGER NOT NULL,
          prompt TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'text',
          required INTEGER NOT NULL DEFAULT 0,
          profile_path TEXT,
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id),
          FOREIGN KEY(section_id) REFERENCES interview_sections(id)
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_sessions (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          active_question_id TEXT,
          FOREIGN KEY(person_id) REFERENCES people(id),
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id)
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_answers (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          person_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          answer TEXT,
          skipped INTEGER NOT NULL DEFAULT 0,
          ts TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id),
          FOREIGN KEY(person_id) REFERENCES people(id),
          FOREIGN KEY(question_id) REFERENCES interview_questions(id)
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_interview_q_plan_ord ON interview_questions(plan_id, ord);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_interview_a_session_ts ON interview_answers(session_id, ts);")

    # Default plan always exists
    now = _now_iso()
    cur.execute(
        "INSERT OR IGNORE INTO interview_plans(id,title,created_at) VALUES(?,?,?);",
        ("default", "Default Plan", now),
    )

    con.commit()
    con.close()


# =============================================================================
# Chat / session helpers
# =============================================================================
def ensure_session(conv_id: str, title: str = "") -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        """
        INSERT INTO sessions(conv_id,title,updated_at,payload_json)
        VALUES(?,?,?,?)
        ON CONFLICT(conv_id) DO UPDATE SET
          title=CASE
            WHEN excluded.title<>'' THEN excluded.title
            ELSE sessions.title
          END,
          updated_at=excluded.updated_at;
        """,
        (conv_id, title or "", now, "{}"),
    )
    con.commit()
    con.close()


def upsert_session(conv_id: str, title: str, payload: Dict[str, Any]) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        """
        INSERT INTO sessions(conv_id,title,updated_at,payload_json)
        VALUES(?,?,?,?)
        ON CONFLICT(conv_id) DO UPDATE SET
          title=excluded.title,
          updated_at=excluded.updated_at,
          payload_json=excluded.payload_json;
        """,
        (conv_id, title or "", now, json.dumps(payload or {}, ensure_ascii=False)),
    )
    con.commit()
    con.close()


def add_turn(
    conv_id: str,
    role: str,
    content: str,
    ts: str,
    anchor_id: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    init_db()
    ensure_session(conv_id)
    con = _connect()
    con.execute(
        "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
        (conv_id, role, content, ts, anchor_id or "", json.dumps(meta or {}, ensure_ascii=False)),
    )
    con.execute("UPDATE sessions SET updated_at=? WHERE conv_id=?;", (ts, conv_id))
    con.commit()
    con.close()


def persist_turn_transaction(
    conv_id: str,
    user_message: str,
    assistant_message: str,
    model_name: str = "",
    meta: Optional[dict] = None,
) -> None:
    init_db()
    ensure_session(conv_id)
    ts = _now_iso()
    con = _connect()
    cur = con.cursor()
    cur.execute("BEGIN")
    try:
        cur.execute(
            "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
            (conv_id, "user", user_message or "", ts, "", json.dumps({}, ensure_ascii=False)),
        )
        assistant_meta = {"model": model_name or "", **(meta or {})}
        cur.execute(
            "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
            (conv_id, "assistant", assistant_message or "", ts, "", json.dumps(assistant_meta, ensure_ascii=False)),
        )
        cur.execute("UPDATE sessions SET updated_at=? WHERE conv_id=?;", (ts, conv_id))
        cur.execute("COMMIT")
    except Exception:
        cur.execute("ROLLBACK")
        raise
    finally:
        con.close()


def get_session(conv_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT conv_id,title,updated_at,payload_json FROM sessions WHERE conv_id=?;",
        (conv_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    payload: Dict[str, Any] = {}
    try:
        payload = json.loads(row["payload_json"] or "{}")
    except Exception:
        payload = {}
    payload.setdefault("conv_id", row["conv_id"])
    payload.setdefault("title", row["title"] or "")
    payload.setdefault("updated_at", row["updated_at"] or "")
    return payload


def list_sessions(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT conv_id,title,updated_at FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?;",
        (int(limit), int(offset)),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def delete_session(conv_id: str) -> None:
    init_db()
    con = _connect()
    con.execute("DELETE FROM turns WHERE conv_id=?;", (conv_id,))
    con.execute("DELETE FROM sessions WHERE conv_id=?;", (conv_id,))
    con.commit()
    con.close()


def export_turns(conv_id: str) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT role,content,ts,anchor_id,meta_json FROM turns WHERE conv_id=? ORDER BY ts ASC, id ASC;",
        (conv_id,),
    ).fetchall()
    con.close()
    out: List[Dict[str, Any]] = []
    for r in rows:
        meta: Dict[str, Any] = {}
        try:
            meta = json.loads(r["meta_json"] or "{}")
        except Exception:
            meta = {}
        out.append(
            {
                "role": r["role"],
                "content": r["content"],
                "timestamp": r["ts"],
                "anchor_id": r["anchor_id"] or "",
                "meta": meta,
            }
        )
    return out


# =============================================================================
# People
# =============================================================================
def create_person(
    display_name: str,
    role: Optional[str] = None,
    date_of_birth: Optional[str] = None,
    place_of_birth: Optional[str] = None,
) -> str:
    init_db()
    pid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO people(id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?);
        """,
        (pid, display_name.strip(), role, date_of_birth, place_of_birth, now, now),
    )
    con.commit()
    con.close()
    return pid


def get_person(person_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute("SELECT * FROM people WHERE id=?;", (person_id,)).fetchone()
    con.close()
    return dict(row) if row else None


def list_people(limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT * FROM people ORDER BY updated_at DESC LIMIT ? OFFSET ?;",
        (int(limit), int(offset)),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def update_person(person_id: str, **fields: Any) -> None:
    init_db()
    allowed = {"display_name", "role", "date_of_birth", "place_of_birth"}
    sets = []
    vals: List[Any] = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k}=?")
            vals.append(v)
    if not sets:
        return
    sets.append("updated_at=?")
    vals.append(_now_iso())
    vals.append(person_id)

    con = _connect()
    con.execute(f"UPDATE people SET {', '.join(sets)} WHERE id=?;", tuple(vals))
    con.commit()
    con.close()


# =============================================================================
# Profiles
# =============================================================================
def ensure_profile(person_id: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        "INSERT OR IGNORE INTO profiles(person_id,profile_json,updated_at) VALUES(?,?,?);",
        (person_id, "{}", now),
    )
    con.commit()
    con.close()


def get_profile(person_id: str) -> Dict[str, Any]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT person_id,profile_json,updated_at FROM profiles WHERE person_id=?;",
        (person_id,),
    ).fetchone()
    con.close()
    if not row:
        return {"person_id": person_id, "profile_json": {}, "updated_at": None}

    prof: Dict[str, Any] = {}
    try:
        prof = json.loads(row["profile_json"] or "{}")
    except Exception:
        prof = {}

    return {"person_id": row["person_id"], "profile_json": prof, "updated_at": row["updated_at"]}


def _deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in (src or {}).items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            dst[k] = _deep_merge(dst[k], v)  # type: ignore[arg-type]
        else:
            dst[k] = v
    return dst


def update_profile_json(
    person_id: str,
    doc: Dict[str, Any],
    merge: bool = False,
    reason: str = "",
) -> None:
    init_db()
    ensure_profile(person_id)

    existing = get_profile(person_id).get("profile_json") or {}
    if not isinstance(existing, dict):
        existing = {}

    new_doc = doc or {}
    merged = _deep_merge(existing, new_doc) if merge else new_doc

    con = _connect()
    now = _now_iso()
    con.execute(
        "UPDATE profiles SET profile_json=?, updated_at=? WHERE person_id=?;",
        (json.dumps(merged, ensure_ascii=False), now, person_id),
    )
    con.commit()
    con.close()


def ingest_basic_info_document(person_id: str, document: Dict[str, Any], create_relatives: bool = False) -> None:
    if not isinstance(document, dict):
        return
    update_profile_json(person_id, {"basic_info": document}, merge=True, reason="ingest_basic_info")
    # (keeping create_relatives behavior out for now; easy to add later)


def _set_path(obj: Dict[str, Any], path: str, value: Any) -> None:
    keys = [k for k in (path or "").split(".") if k]
    if not keys:
        return
    cur: Any = obj
    for k in keys[:-1]:
        if not isinstance(cur, dict):
            return
        if k not in cur or not isinstance(cur[k], dict):
            cur[k] = {}
        cur = cur[k]
    if isinstance(cur, dict):
        cur[keys[-1]] = value


def update_profile_field(person_id: str, profile_path: str, value: Any) -> None:
    init_db()
    ensure_profile(person_id)
    current = get_profile(person_id).get("profile_json") or {}
    if not isinstance(current, dict):
        current = {}
    _set_path(current, profile_path, value)
    update_profile_json(person_id, current, merge=False, reason="update_profile_field")


# =============================================================================
# Media
# =============================================================================
def add_media(
    person_id: str,
    file_path: str,
    mime_type: str,
    description: str = "",
    taken_at: Optional[str] = None,
    location_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    exif: Optional[Dict[str, Any]] = None,
) -> str:
    init_db()
    mid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO media(
          id, person_id, file_path, mime_type, description,
          taken_at, location_name, latitude, longitude, exif_json, created_at
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            mid,
            person_id,
            file_path,
            mime_type,
            description or "",
            taken_at,
            location_name,
            latitude,
            longitude,
            json.dumps(exif, ensure_ascii=False) if exif is not None else None,
            now,
        ),
    )
    con.commit()
    con.close()
    return mid


def list_media(person_id: str, limit: int = 500, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id, person_id, file_path, mime_type, description, taken_at, location_name,
               latitude, longitude, exif_json, created_at
        FROM media
        WHERE person_id=?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?;
        """,
        (person_id, int(limit), int(offset)),
    ).fetchall()
    con.close()

    out: List[Dict[str, Any]] = []
    for r in rows:
        exif_obj = None
        if r["exif_json"]:
            try:
                exif_obj = json.loads(r["exif_json"])
            except Exception:
                exif_obj = {"raw": r["exif_json"]}
        out.append(
            {
                "id": r["id"],
                "person_id": r["person_id"],
                "file_path": r["file_path"],
                "mime_type": r["mime_type"],
                "description": r["description"] or "",
                "taken_at": r["taken_at"],
                "location_name": r["location_name"],
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "exif": exif_obj,
                "created_at": r["created_at"],
            }
        )
    return out


# =============================================================================
# Timeline
# =============================================================================
def add_timeline_event(
    person_id: str,
    ts: str,
    title: str,
    description: str = "",
    kind: str = "event",
    location_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    media_ids: Optional[List[str]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> str:
    init_db()
    eid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO timeline_events(
          id, person_id, ts, title, description, kind,
          location_name, latitude, longitude,
          media_ids_json, meta_json,
          created_at, updated_at
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            eid,
            person_id,
            ts,
            title.strip(),
            description or "",
            kind or "event",
            location_name,
            latitude,
            longitude,
            json.dumps(media_ids or [], ensure_ascii=False),
            json.dumps(meta or {}, ensure_ascii=False),
            now,
            now,
        ),
    )
    con.commit()
    con.close()
    return eid


def list_timeline_events(person_id: str, limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT *
        FROM timeline_events
        WHERE person_id=?
        ORDER BY ts DESC
        LIMIT ? OFFSET ?;
        """,
        (person_id, int(limit), int(offset)),
    ).fetchall()
    con.close()

    out: List[Dict[str, Any]] = []
    for r in rows:
        media_ids = []
        meta = {}
        try:
            media_ids = json.loads(r["media_ids_json"] or "[]")
        except Exception:
            media_ids = []
        try:
            meta = json.loads(r["meta_json"] or "{}")
        except Exception:
            meta = {}
        out.append(
            {
                "id": r["id"],
                "person_id": r["person_id"],
                "ts": r["ts"],
                "title": r["title"],
                "description": r["description"] or "",
                "kind": r["kind"] or "event",
                "location_name": r["location_name"],
                "latitude": r["latitude"],
                "longitude": r["longitude"],
                "media_ids": media_ids,
                "meta": meta,
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
        )
    return out


def delete_timeline_event(event_id: str) -> None:
    init_db()
    con = _connect()
    con.execute("DELETE FROM timeline_events WHERE id=?;", (event_id,))
    con.commit()
    con.close()


# =============================================================================
# Interview helpers
# =============================================================================
def start_session(person_id: str, plan_id: str = "default") -> Dict[str, Any]:
    init_db()
    sid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO interview_sessions(id,person_id,plan_id,started_at,updated_at,active_question_id)
        VALUES(?,?,?,?,?,NULL);
        """,
        (sid, person_id, (plan_id or "default"), now, now),
    )
    con.commit()
    con.close()
    return {"id": sid, "person_id": person_id, "plan_id": (plan_id or "default"), "started_at": now, "updated_at": now}


def get_interview_session(session_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT id,person_id,plan_id,started_at,updated_at,active_question_id FROM interview_sessions WHERE id=?;",
        (session_id,),
    ).fetchone()
    con.close()
    return dict(row) if row else None


def set_session_active_question(session_id: str, question_id: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        "UPDATE interview_sessions SET active_question_id=?, updated_at=? WHERE id=?;",
        (question_id, now, session_id),
    )
    con.commit()
    con.close()


def get_question(question_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        """
        SELECT id,plan_id,section_id,ord,prompt,kind,required,profile_path
        FROM interview_questions WHERE id=?;
        """,
        (question_id,),
    ).fetchone()
    con.close()
    return dict(row) if row else None


def get_next_question(session_id: str, plan_id: str, current_question_id: Optional[str]) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    plan_id = (plan_id or "default").strip() or "default"

    if not current_question_id:
        row = con.execute(
            """
            SELECT id,section_id,prompt,kind,required,profile_path,ord
            FROM interview_questions
            WHERE plan_id=?
            ORDER BY ord ASC
            LIMIT 1;
            """,
            (plan_id,),
        ).fetchone()
        con.close()
        return dict(row) if row else None

    cur_row = con.execute(
        "SELECT ord FROM interview_questions WHERE id=? AND plan_id=?;",
        (current_question_id, plan_id),
    ).fetchone()
    cur_ord = int(cur_row["ord"]) if cur_row else -1

    row = con.execute(
        """
        SELECT id,section_id,prompt,kind,required,profile_path,ord
        FROM interview_questions
        WHERE plan_id=? AND ord>?
        ORDER BY ord ASC
        LIMIT 1;
        """,
        (plan_id, cur_ord),
    ).fetchone()

    con.close()
    return dict(row) if row else None


def add_answer(
    session_id: str,
    question_id: str,
    answer: str,
    skipped: bool,
    person_id: str,
) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        """
        INSERT INTO interview_answers(id,session_id,person_id,question_id,answer,skipped,ts)
        VALUES(?,?,?,?,?,?,?);
        """,
        (_uuid(), session_id, person_id, question_id, answer or "", 1 if skipped else 0, now),
    )
    con.execute("UPDATE interview_sessions SET updated_at=? WHERE id=?;", (now, session_id))
    con.commit()
    con.close()


# =============================================================================
# RAG helpers (optional, but kept)
# =============================================================================
def _tokenize(s: str) -> List[str]:
    import re
    return re.findall(r"[a-z0-9']{2,}", (s or "").lower())


def _chunk_text(text: str, size: int = 900) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    chunks: List[str] = []
    buf = ""
    for p in paras:
        if len(buf) + len(p) + 1 <= size:
            buf = (buf + "\n" + p) if buf else p
        else:
            if buf:
                chunks.append(buf)
            buf = p
    if buf:
        chunks.append(buf)
    return chunks


def rag_add_doc(doc_id: str, title: str, source: str, text: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        "INSERT OR REPLACE INTO rag_docs(id,title,source,created_at,text) VALUES(?,?,?,?,?);",
        (doc_id, title, source, now, text),
    )
    con.execute("DELETE FROM rag_chunks WHERE doc_id=?;", (doc_id,))
    chunks = _chunk_text(text, 900)
    for i, ch in enumerate(chunks):
        chunk_id = f"{doc_id}::c{i}"
        con.execute(
            "INSERT OR REPLACE INTO rag_chunks(id,doc_id,chunk_index,text) VALUES(?,?,?,?);",
            (chunk_id, doc_id, i, ch),
        )
    con.commit()
    con.close()


def rag_query(query: str, k: int = 5, only_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    q = (query or "").strip().lower()
    tokens = [t for t in _tokenize(q) if t]
    if not tokens:
        return []
    k = max(1, min(int(k), 20))

    rows = con.execute(
        """
        SELECT c.id AS chunk_id, c.doc_id, c.text AS chunk_text,
               d.title AS doc_title, d.source AS doc_source
        FROM rag_chunks c
        JOIN rag_docs d ON d.id = c.doc_id;
        """
    ).fetchall()
    con.close()

    hits: List[Dict[str, Any]] = []
    for r in rows:
        cid = r["chunk_id"]
        if only_ids and cid not in only_ids:
            continue
        txt = (r["chunk_text"] or "").lower()
        score = 0
        for t in tokens:
            if t in txt:
                score += 1
        title = (r["doc_title"] or "").lower()
        for t in tokens:
            if t in title:
                score += 1
        if score > 0:
            hits.append(
                {
                    "id": cid,
                    "doc_id": r["doc_id"],
                    "title": r["doc_title"] or "",
                    "source": r["doc_source"] or "",
                    "score": score,
                    "snippet": (r["chunk_text"] or "")[:420].strip(),
                }
            )
    hits.sort(key=lambda x: (-x["score"], x["title"]))
    return hits[:k]


def rag_stats() -> Dict[str, int]:
    init_db()
    con = _connect()
    docs = con.execute("SELECT COUNT(*) AS n FROM rag_docs;").fetchone()["n"]
    chunks = con.execute("SELECT COUNT(*) AS n FROM rag_chunks;").fetchone()["n"]
    con.close()
    return {"docs": int(docs), "chunks": int(chunks)}


def get_chunks_by_ids(ids: List[str]) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    out: List[Dict[str, Any]] = []
    for cid in ids:
        row = con.execute(
            """
            SELECT c.id AS chunk_id, c.text AS chunk_text,
                   d.title AS doc_title, d.source AS doc_source
            FROM rag_chunks c
            JOIN rag_docs d ON d.id=c.doc_id
            WHERE c.id=?;
            """,
            (cid,),
        ).fetchone()
        if row:
            out.append(
                {
                    "id": row["chunk_id"],
                    "title": row["doc_title"] or "",
                    "source": row["doc_source"] or "",
                    "text": row["chunk_text"] or "",
                }
            )
    con.close()
    return out
