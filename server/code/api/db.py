from __future__ import annotations

import os
import json
import sqlite3
import uuid
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional


# -----------------------------------------------------------------------------
# Paths / connection
# -----------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_DIR = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)

DB_NAME = os.getenv("DB_NAME", "lorevox.sqlite3").strip() or "lorevox.sqlite3"
DB_PATH = DB_DIR / DB_NAME


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=NORMAL;")
    con.execute("PRAGMA temp_store=MEMORY;")
    con.execute("PRAGMA foreign_keys=ON;")
    return con


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


def _json_load(s: str | None, default: Any) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


def _json_dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


# -----------------------------------------------------------------------------
# Schema
# -----------------------------------------------------------------------------
def init_db() -> None:
    con = _connect()
    cur = con.cursor()

    # -----------------------------
    # Sessions + turns (chat persistence)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
          conv_id TEXT PRIMARY KEY,
          title TEXT DEFAULT '',
          updated_at TEXT,
          payload_json TEXT DEFAULT '{}'
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS turns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conv_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          ts TEXT NOT NULL,
          anchor_id TEXT DEFAULT '',
          meta_json TEXT DEFAULT '{}',
          FOREIGN KEY(conv_id) REFERENCES sessions(conv_id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_turns_conv_ts ON turns(conv_id, ts, id);")

    # -----------------------------
    # People + profiles
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS people (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          role TEXT DEFAULT '',
          date_of_birth TEXT DEFAULT '',
          place_of_birth TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS profiles (
          person_id TEXT PRIMARY KEY,
          profile_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
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
          person_id TEXT,
          kind TEXT NOT NULL DEFAULT 'image',
          filename TEXT NOT NULL DEFAULT '',
          mime TEXT NOT NULL DEFAULT '',
          bytes INTEGER NOT NULL DEFAULT 0,
          sha256 TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
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
          date TEXT NOT NULL,                 -- ISO date or datetime string
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL DEFAULT 'event',
          created_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_timeline_person_date ON timeline_events(person_id, date);")

    # -----------------------------
    # Interview plans / questions / sessions / answers
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_plans (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL
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
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE
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
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE,
          FOREIGN KEY(section_id) REFERENCES interview_sections(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_interview_q_plan_ord ON interview_questions(plan_id, ord);")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_sessions (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          active_question_id TEXT,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE
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
          answer TEXT NOT NULL DEFAULT '',
          skipped INTEGER NOT NULL DEFAULT 0,
          ts TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
          FOREIGN KEY(question_id) REFERENCES interview_questions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_interview_a_session_ts ON interview_answers(session_id, ts);")

    # -----------------------------
    # Facts  (atomic, source-backed claims)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS facts (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          session_id TEXT,
          fact_type TEXT NOT NULL DEFAULT 'general',
          statement TEXT NOT NULL,
          date_text TEXT DEFAULT '',
          date_normalized TEXT DEFAULT '',
          confidence REAL DEFAULT 0.0,
          status TEXT NOT NULL DEFAULT 'extracted',
          inferred INTEGER NOT NULL DEFAULT 0,
          source_turn_index INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_facts_person ON facts(person_id, created_at);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(session_id);")

    # -----------------------------
    # Life phases  (e.g. "childhood", "first marriage", "OT career")
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS life_phases (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          title TEXT NOT NULL,
          start_date TEXT DEFAULT '',
          end_date TEXT DEFAULT '',
          date_precision TEXT DEFAULT 'year',
          description TEXT DEFAULT '',
          ord INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_life_phases_person ON life_phases(person_id, ord);")

    # -----------------------------
    # Migrate timeline_events: add new calendar columns if missing
    # -----------------------------
    existing_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(timeline_events);").fetchall()
    }
    calendar_cols = {
        "end_date": "ALTER TABLE timeline_events ADD COLUMN end_date TEXT DEFAULT '';",
        "date_precision": "ALTER TABLE timeline_events ADD COLUMN date_precision TEXT DEFAULT 'exact_day';",
        "is_approximate": "ALTER TABLE timeline_events ADD COLUMN is_approximate INTEGER DEFAULT 0;",
        "confidence": "ALTER TABLE timeline_events ADD COLUMN confidence REAL DEFAULT 1.0;",
        "status": "ALTER TABLE timeline_events ADD COLUMN status TEXT DEFAULT 'reviewed';",
        "source_session_ids": "ALTER TABLE timeline_events ADD COLUMN source_session_ids TEXT DEFAULT '[]';",
        "source_fact_ids": "ALTER TABLE timeline_events ADD COLUMN source_fact_ids TEXT DEFAULT '[]';",
        "tags": "ALTER TABLE timeline_events ADD COLUMN tags TEXT DEFAULT '[]';",
        "display_date": "ALTER TABLE timeline_events ADD COLUMN display_date TEXT DEFAULT '';",
        "phase_id": "ALTER TABLE timeline_events ADD COLUMN phase_id TEXT DEFAULT '';",
    }
    for col_name, alter_sql in calendar_cols.items():
        if col_name not in existing_cols:
            cur.execute(alter_sql)

    # Default plan (safe even if empty)
    now = _now_iso()
    cur.execute(
        "INSERT OR IGNORE INTO interview_plans(id,title,created_at) VALUES(?,?,?);",
        ("default", "Default Plan", now),
    )

    # -----------------------------
    # RAG (optional; used by inspector/router if you keep it)
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
          FOREIGN KEY(doc_id) REFERENCES rag_docs(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(doc_id, chunk_index);")

    # -----------------------------
    # Section summaries  (persisted at section boundaries)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS section_summaries (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          person_id TEXT NOT NULL,
          section_id TEXT NOT NULL,
          section_title TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_section_summaries_session ON section_summaries(session_id, section_id);")

    con.commit()
    con.close()


# -----------------------------------------------------------------------------
# Sessions / turns (UI + SSE + WS)
# -----------------------------------------------------------------------------
def new_conv_id() -> str:
    return _uuid()


def ensure_session(conv_id: str, title: str = "") -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        """
        INSERT INTO sessions(conv_id,title,updated_at,payload_json)
        VALUES(?,?,?,?)
        ON CONFLICT(conv_id) DO UPDATE SET
          title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE sessions.title END,
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
        (conv_id, title or "", now, _json_dump(payload or {})),
    )
    con.commit()
    con.close()


def get_session_payload(conv_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT conv_id,title,updated_at,payload_json FROM sessions WHERE conv_id=?;",
        (conv_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    payload = _json_load(row["payload_json"], {})
    payload.setdefault("conv_id", row["conv_id"])
    payload.setdefault("title", row["title"] or "")
    payload.setdefault("updated_at", row["updated_at"] or "")
    return payload


def get_session(conv_id: str) -> Optional[Dict[str, Any]]:
    """Back-compat shim for api.py and older callers."""
    return get_session_payload(conv_id)


def list_sessions(limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT conv_id,title,updated_at FROM sessions ORDER BY updated_at DESC LIMIT ?;",
        (int(limit),),
    ).fetchall()
    con.close()
    return [{"conv_id": r["conv_id"], "title": r["title"] or "", "updated_at": r["updated_at"] or ""} for r in rows]


def delete_session(conv_id: str) -> None:
    init_db()
    con = _connect()
    con.execute("DELETE FROM turns WHERE conv_id=?;", (conv_id,))
    con.execute("DELETE FROM sessions WHERE conv_id=?;", (conv_id,))
    con.commit()
    con.close()


def add_turn(
    conv_id: str,
    role: str,
    content: str,
    ts: Optional[str] = None,
    anchor_id: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    init_db()
    ensure_session(conv_id)
    con = _connect()
    ts = ts or _now_iso()
    con.execute(
        "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
        (conv_id, role, content, ts, anchor_id or "", _json_dump(meta or {})),
    )
    con.execute("UPDATE sessions SET updated_at=? WHERE conv_id=?;", (ts, conv_id))
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
        out.append(
            {
                "role": r["role"],
                "content": r["content"],
                "timestamp": r["ts"],
                "anchor_id": r["anchor_id"] or "",
                "meta": _json_load(r["meta_json"], {}),
            }
        )
    return out


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
            (conv_id, "user", user_message, ts, "", "{}"),
        )
        assistant_meta = {"model": model_name or "", **(meta or {})}
        cur.execute(
            "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
            (conv_id, "assistant", assistant_message, ts, "", _json_dump(assistant_meta)),
        )
        cur.execute("UPDATE sessions SET updated_at=? WHERE conv_id=?;", (ts, conv_id))
        cur.execute("COMMIT")
    except Exception:
        cur.execute("ROLLBACK")
        raise
    finally:
        con.close()


# -----------------------------------------------------------------------------
# People (routers/people.py)
# -----------------------------------------------------------------------------
def create_person(
    display_name: str,
    role: str = "",
    date_of_birth: str = "",
    place_of_birth: str = "",
) -> Dict[str, Any]:
    init_db()
    pid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO people(id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?);
        """,
        (pid, display_name, role or "", date_of_birth or "", place_of_birth or "", now, now),
    )
    con.commit()
    con.close()
    ensure_profile(pid)
    return get_person(pid) or {"id": pid, "display_name": display_name}


def update_person(
    person_id: str,
    display_name: Optional[str] = None,
    role: Optional[str] = None,
    date_of_birth: Optional[str] = None,
    place_of_birth: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    init_db()
    now = _now_iso()
    con = _connect()
    row = con.execute("SELECT id FROM people WHERE id=?;", (person_id,)).fetchone()
    if not row:
        con.close()
        return None
    con.execute(
        """
        UPDATE people
        SET display_name=COALESCE(?,display_name),
            role=COALESCE(?,role),
            date_of_birth=COALESCE(?,date_of_birth),
            place_of_birth=COALESCE(?,place_of_birth),
            updated_at=?
        WHERE id=?;
        """,
        (display_name, role, date_of_birth, place_of_birth, now, person_id),
    )
    con.commit()
    con.close()
    return get_person(person_id)


def list_people(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at
        FROM people
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?;
        """,
        (int(limit), int(offset)),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def get_person(person_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        """
        SELECT id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at
        FROM people WHERE id=?;
        """,
        (person_id,),
    ).fetchone()
    con.close()
    return dict(row) if row else None


# -----------------------------------------------------------------------------
# Profiles (routers/profiles.py)
# -----------------------------------------------------------------------------
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


def get_profile(person_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT person_id,profile_json,updated_at FROM profiles WHERE person_id=?;",
        (person_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    return {
        "person_id": row["person_id"],
        "profile_json": _json_load(row["profile_json"], {}),
        "updated_at": row["updated_at"],
    }


def update_profile_json(person_id: str, profile_json: Dict[str, Any], merge: bool = True) -> Dict[str, Any]:
    init_db()
    ensure_profile(person_id)
    cur_prof = get_profile(person_id) or {"profile_json": {}}
    merged: Dict[str, Any]
    if merge:
        merged = dict(cur_prof.get("profile_json") or {})
        merged.update(profile_json or {})
    else:
        merged = profile_json or {}

    now = _now_iso()
    con = _connect()
    con.execute(
        "UPDATE profiles SET profile_json=?, updated_at=? WHERE person_id=?;",
        (_json_dump(merged), now, person_id),
    )
    con.commit()
    con.close()
    return get_profile(person_id) or {"person_id": person_id, "profile_json": merged, "updated_at": now}


def ingest_basic_info_document(person_id: str, text: str) -> Dict[str, Any]:
    init_db()
    p = get_profile(person_id) or {"profile_json": {}}
    prof = dict(p.get("profile_json") or {})
    ingest = dict(prof.get("ingest") or {})
    ingest["basic_info"] = {"text": text or "", "ts": _now_iso()}
    prof["ingest"] = ingest
    return update_profile_json(person_id, prof, merge=False)


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
    p = get_profile(person_id) or {"profile_json": {}}
    prof = dict(p.get("profile_json") or {})
    _set_path(prof, profile_path, value)
    update_profile_json(person_id, prof, merge=False)


# -----------------------------------------------------------------------------
# Media (routers/media.py)
# -----------------------------------------------------------------------------
def add_media(
    person_id: Optional[str],
    kind: str,
    filename: str,
    mime: str,
    bytes: int = 0,
    sha256: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    mid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO media(id,person_id,kind,filename,mime,bytes,sha256,created_at,meta_json)
        VALUES(?,?,?,?,?,?,?,?,?);
        """,
        (mid, person_id, kind or "image", filename or "", mime or "", int(bytes or 0), sha256 or "", now, _json_dump(meta or {})),
    )
    con.commit()
    con.close()
    return {"id": mid, "person_id": person_id, "kind": kind, "filename": filename, "mime": mime, "bytes": int(bytes or 0), "sha256": sha256, "created_at": now, "meta": meta or {}}


def list_media(person_id: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    if person_id:
        rows = con.execute(
            """
            SELECT id,person_id,kind,filename,mime,bytes,sha256,created_at,meta_json
            FROM media
            WHERE person_id=?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?;
            """,
            (person_id, int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            """
            SELECT id,person_id,kind,filename,mime,bytes,sha256,created_at,meta_json
            FROM media
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?;
            """,
            (int(limit), int(offset)),
        ).fetchall()
    con.close()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        out.append(d)
    return out


# -----------------------------------------------------------------------------
# Timeline (routers/timeline.py)
# -----------------------------------------------------------------------------
def add_timeline_event(
    person_id: str,
    date: str,
    title: str,
    body: str = "",
    kind: str = "event",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    eid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO timeline_events(id,person_id,date,title,body,kind,created_at,meta_json)
        VALUES(?,?,?,?,?,?,?,?);
        """,
        (eid, person_id, date, title, body or "", kind or "event", now, _json_dump(meta or {})),
    )
    con.commit()
    con.close()
    return {"id": eid, "person_id": person_id, "date": date, "title": title, "body": body or "", "kind": kind or "event", "created_at": now, "meta": meta or {}}


def list_timeline_events(person_id: str, limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,person_id,date,title,body,kind,created_at,meta_json
        FROM timeline_events
        WHERE person_id=?
        ORDER BY date ASC, created_at ASC
        LIMIT ? OFFSET ?;
        """,
        (person_id, int(limit), int(offset)),
    ).fetchall()
    con.close()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        out.append(d)
    return out


def delete_timeline_event(event_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM timeline_events WHERE id=?;", (event_id,))
    con.commit()
    con.close()
    return cur.rowcount > 0


# -----------------------------------------------------------------------------
# Interview helpers (routers/interview.py)
# -----------------------------------------------------------------------------
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
        (sid, person_id, plan_id or "default", now, now),
    )
    con.commit()
    con.close()
    return {"id": sid, "person_id": person_id, "plan_id": plan_id or "default", "started_at": now, "updated_at": now}


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
    plan_id = plan_id or "default"

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


def add_answer(session_id: str, question_id: str, answer: str, skipped: bool, person_id: str) -> None:
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


# -----------------------------------------------------------------------------
# RAG minimal
# -----------------------------------------------------------------------------
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




def rag_get_doc_text(doc_id: str) -> str:
    """Return the raw text for a specific RAG doc id, or '' if missing."""
    init_db()
    con = _connect()
    row = con.execute("SELECT text FROM rag_docs WHERE id=?;", (doc_id,)).fetchone()
    con.close()
    return row["text"] if row else ""

def rag_add_doc(doc_id: str, title: str, source: str, text: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        "INSERT OR REPLACE INTO rag_docs(id,title,source,created_at,text) VALUES(?,?,?,?,?);",
        (doc_id, title, source, now, text),
    )
    con.execute("DELETE FROM rag_chunks WHERE doc_id=?;", (doc_id,))
    for i, ch in enumerate(_chunk_text(text, 900)):
        con.execute(
            "INSERT OR REPLACE INTO rag_chunks(id,doc_id,chunk_index,text) VALUES(?,?,?,?);",
            (f"{doc_id}::c{i}", doc_id, i, ch),
        )
    con.commit()
    con.close()


def rag_stats() -> Dict[str, int]:
    init_db()
    con = _connect()
    docs = con.execute("SELECT COUNT(*) AS n FROM rag_docs;").fetchone()["n"]
    chunks = con.execute("SELECT COUNT(*) AS n FROM rag_chunks;").fetchone()["n"]
    con.close()
    return {"docs": int(docs), "chunks": int(chunks)}


def rag_query(query: str, k: int = 5, only_ids: Optional[List[str]] = None, only_doc_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    tokens = [t for t in _tokenize((query or "").strip()) if t]
    if not tokens:
        return []
    k = max(1, min(int(k), 20))
    rows = con.execute(
        """
        SELECT c.id AS chunk_id, c.doc_id, c.text AS chunk_text, d.title AS doc_title, d.source AS doc_source
        FROM rag_chunks c JOIN rag_docs d ON d.id = c.doc_id;
        """
    ).fetchall()
    con.close()

    hits: List[Dict[str, Any]] = []
    for r in rows:
        cid = r["chunk_id"]
        # Back-compat: only_ids filters by chunk_id; only_doc_ids filters by doc_id.
        if only_doc_ids and r["doc_id"] not in only_doc_ids:
            continue
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


# -----------------------------------------------------------------------------
# Section summaries
# -----------------------------------------------------------------------------
def save_section_summary(
    session_id: str,
    person_id: str,
    section_id: str,
    section_title: str,
    summary: str,
) -> Dict[str, Any]:
    init_db()
    sid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT OR REPLACE INTO section_summaries(id,session_id,person_id,section_id,section_title,summary,created_at)
        VALUES(?,?,?,?,?,?,?);
        """,
        (sid, session_id, person_id, section_id, section_title or "", summary or "", now),
    )
    con.commit()
    con.close()
    return {
        "id": sid, "session_id": session_id, "person_id": person_id,
        "section_id": section_id, "section_title": section_title,
        "summary": summary, "created_at": now,
    }


def list_section_summaries(session_id: str) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,session_id,person_id,section_id,section_title,summary,created_at
        FROM section_summaries WHERE session_id=? ORDER BY created_at ASC;
        """,
        (session_id,),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


# -----------------------------------------------------------------------------
# Interview progress helper
# -----------------------------------------------------------------------------
def get_interview_progress(session_id: str, plan_id: str) -> Dict[str, Any]:
    """
    Return total questions, answered count, and current section info.
    Used for the UI progress indicator.
    """
    init_db()
    con = _connect()

    total = con.execute(
        "SELECT COUNT(*) AS n FROM interview_questions WHERE plan_id=?;",
        (plan_id,),
    ).fetchone()["n"]

    answered = con.execute(
        "SELECT COUNT(*) AS n FROM interview_answers WHERE session_id=?;",
        (session_id,),
    ).fetchone()["n"]

    # Current active question details
    sess_row = con.execute(
        "SELECT active_question_id FROM interview_sessions WHERE id=?;",
        (session_id,),
    ).fetchone()
    active_qid = sess_row["active_question_id"] if sess_row else None

    current_section_title = ""
    current_question_ord = 0
    if active_qid:
        q_row = con.execute(
            """
            SELECT iq.ord, isec.title
            FROM interview_questions iq
            LEFT JOIN interview_sections isec ON isec.id = iq.section_id
            WHERE iq.id=?;
            """,
            (active_qid,),
        ).fetchone()
        if q_row:
            current_question_ord = int(q_row["ord"] or 0)
            current_section_title = q_row["title"] or ""

    con.close()

    pct = round((answered / total * 100)) if total > 0 else 0
    return {
        "total": int(total),
        "answered": int(answered),
        "remaining": max(0, int(total) - int(answered)),
        "percent": pct,
        "current_ord": current_question_ord,
        "current_section": current_section_title,
    }


# -----------------------------------------------------------------------------
# Facts  (atomic, source-backed claims)
# -----------------------------------------------------------------------------
def add_fact(
    person_id: str,
    statement: str,
    fact_type: str = "general",
    date_text: str = "",
    date_normalized: str = "",
    confidence: float = 0.0,
    status: str = "extracted",
    inferred: bool = False,
    session_id: Optional[str] = None,
    source_turn_index: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    fid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO facts(
          id,person_id,session_id,fact_type,statement,
          date_text,date_normalized,confidence,status,inferred,
          source_turn_index,created_at,updated_at,meta_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            fid, person_id, session_id, fact_type or "general", statement,
            date_text or "", date_normalized or "",
            float(confidence or 0.0), status or "extracted",
            1 if inferred else 0, source_turn_index, now, now,
            _json_dump(meta or {}),
        ),
    )
    con.commit()
    con.close()
    return {
        "id": fid, "person_id": person_id, "session_id": session_id,
        "fact_type": fact_type, "statement": statement,
        "date_text": date_text, "date_normalized": date_normalized,
        "confidence": float(confidence or 0.0), "status": status or "extracted",
        "inferred": bool(inferred), "created_at": now,
    }


def list_facts(
    person_id: str,
    status: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    if status:
        rows = con.execute(
            """
            SELECT id,person_id,session_id,fact_type,statement,date_text,
                   date_normalized,confidence,status,inferred,source_turn_index,created_at,meta_json
            FROM facts WHERE person_id=? AND status=?
            ORDER BY created_at ASC LIMIT ? OFFSET ?;
            """,
            (person_id, status, int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            """
            SELECT id,person_id,session_id,fact_type,statement,date_text,
                   date_normalized,confidence,status,inferred,source_turn_index,created_at,meta_json
            FROM facts WHERE person_id=?
            ORDER BY created_at ASC LIMIT ? OFFSET ?;
            """,
            (person_id, int(limit), int(offset)),
        ).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        d["inferred"] = bool(d.get("inferred"))
        out.append(d)
    return out


def update_fact_status(fact_id: str, status: str) -> bool:
    init_db()
    now = _now_iso()
    con = _connect()
    cur = con.execute(
        "UPDATE facts SET status=?, updated_at=? WHERE id=?;",
        (status, now, fact_id),
    )
    con.commit()
    con.close()
    return cur.rowcount > 0


def delete_fact(fact_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM facts WHERE id=?;", (fact_id,))
    con.commit()
    con.close()
    return cur.rowcount > 0


# -----------------------------------------------------------------------------
# Life phases
# -----------------------------------------------------------------------------
def add_life_phase(
    person_id: str,
    title: str,
    start_date: str = "",
    end_date: str = "",
    date_precision: str = "year",
    description: str = "",
    ord: int = 0,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    pid_val = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO life_phases(
          id,person_id,title,start_date,end_date,date_precision,
          description,ord,created_at,meta_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?);
        """,
        (
            pid_val, person_id, title,
            start_date or "", end_date or "", date_precision or "year",
            description or "", int(ord or 0), now, _json_dump(meta or {}),
        ),
    )
    con.commit()
    con.close()
    return {
        "id": pid_val, "person_id": person_id, "title": title,
        "start_date": start_date, "end_date": end_date,
        "date_precision": date_precision, "description": description,
        "ord": int(ord or 0), "created_at": now,
    }


def list_life_phases(person_id: str) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,person_id,title,start_date,end_date,date_precision,
               description,ord,created_at,meta_json
        FROM life_phases WHERE person_id=? ORDER BY ord ASC, start_date ASC;
        """,
        (person_id,),
    ).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        out.append(d)
    return out


def delete_life_phase(phase_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM life_phases WHERE id=?;", (phase_id,))
    con.commit()
    con.close()
    return cur.rowcount > 0


# -----------------------------------------------------------------------------
# Enhanced timeline event  (wraps existing add_timeline_event with new fields)
# -----------------------------------------------------------------------------
def add_calendar_event(
    person_id: str,
    title: str,
    start_date: str,
    end_date: str = "",
    date_precision: str = "exact_day",
    display_date: str = "",
    body: str = "",
    kind: str = "event",
    is_approximate: bool = False,
    confidence: float = 1.0,
    status: str = "reviewed",
    source_session_ids: Optional[List[str]] = None,
    source_fact_ids: Optional[List[str]] = None,
    tags: Optional[List[str]] = None,
    phase_id: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Extended timeline event with full calendar metadata.
    Adds to timeline_events table using the new columns.
    """
    init_db()
    eid = _uuid()
    now = _now_iso()
    full_meta = dict(meta or {})
    con = _connect()
    con.execute(
        """
        INSERT INTO timeline_events(
          id,person_id,date,title,body,kind,created_at,meta_json,
          end_date,date_precision,is_approximate,confidence,status,
          source_session_ids,source_fact_ids,tags,display_date,phase_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            eid, person_id, start_date, title, body or "", kind or "event", now,
            _json_dump(full_meta),
            end_date or "", date_precision or "exact_day",
            1 if is_approximate else 0, float(confidence or 1.0),
            status or "reviewed",
            _json_dump(source_session_ids or []),
            _json_dump(source_fact_ids or []),
            _json_dump(tags or []),
            display_date or start_date,
            phase_id or "",
        ),
    )
    con.commit()
    con.close()
    return {
        "id": eid, "person_id": person_id,
        "start_date": start_date, "end_date": end_date,
        "title": title, "body": body, "kind": kind,
        "date_precision": date_precision, "display_date": display_date or start_date,
        "is_approximate": is_approximate, "confidence": float(confidence or 1.0),
        "status": status, "created_at": now,
        "source_session_ids": source_session_ids or [],
        "source_fact_ids": source_fact_ids or [],
        "tags": tags or [],
        "phase_id": phase_id,
    }


def list_calendar_events(
    person_id: str, limit: int = 500, offset: int = 0
) -> List[Dict[str, Any]]:
    """Return enriched timeline events with calendar fields."""
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,person_id,date,title,body,kind,created_at,meta_json,
               COALESCE(end_date,'') as end_date,
               COALESCE(date_precision,'exact_day') as date_precision,
               COALESCE(is_approximate,0) as is_approximate,
               COALESCE(confidence,1.0) as confidence,
               COALESCE(status,'reviewed') as status,
               COALESCE(source_session_ids,'[]') as source_session_ids,
               COALESCE(source_fact_ids,'[]') as source_fact_ids,
               COALESCE(tags,'[]') as tags,
               COALESCE(display_date,'') as display_date,
               COALESCE(phase_id,'') as phase_id
        FROM timeline_events
        WHERE person_id=?
        ORDER BY date ASC, created_at ASC
        LIMIT ? OFFSET ?;
        """,
        (person_id, int(limit), int(offset)),
    ).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        d["is_approximate"] = bool(d.get("is_approximate"))
        d["source_session_ids"] = _json_load(d.get("source_session_ids"), [])
        d["source_fact_ids"] = _json_load(d.get("source_fact_ids"), [])
        d["tags"] = _json_load(d.get("tags"), [])
        d["start_date"] = d.pop("date", "")
        if not d.get("display_date"):
            d["display_date"] = d["start_date"]
        out.append(d)
    return out