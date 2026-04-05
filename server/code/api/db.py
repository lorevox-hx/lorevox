from __future__ import annotations

import logging
import os
import re
import json
import sqlite3
import uuid
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── DOB sanitisation ─────────────────────────────────────────────────────────
_ISO_DATE_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")


def _sanitise_dob(raw: Optional[str]) -> str:
    """Normalise a date-of-birth string.

    Accepts ISO format (YYYY, YYYY-MM, YYYY-MM-DD) as-is.
    Fuzzy/uncertain strings (e.g. "1947, I think?") are stored prefixed with
    ``uncertain:`` so downstream code can distinguish validated from raw input.
    Empty input returns empty string.
    """
    if not raw:
        return ""
    raw = raw.strip()
    if _ISO_DATE_RE.match(raw):
        return raw
    # Preserve uncertain input but flag it clearly
    if not raw.startswith("uncertain:"):
        return f"uncertain:{raw}"
    return raw


# -----------------------------------------------------------------------------
# Paths / connection
# -----------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_DIR = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)

DB_NAME = os.getenv("DB_NAME", "lorevox.sqlite3").strip() or "lorevox.sqlite3"
DB_PATH = DB_DIR / DB_NAME

# v7.4D — log DB path at import time so startup output confirms the right file.
logger.info("Lorevox DB: %s", DB_PATH)


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

    # -----------------------------
    # Migrate facts: add Meaning Engine fields if missing (Bug MAT-01 fix)
    # These fields were sent by the frontend in POST /api/facts/add but not persisted.
    # Added in the meaning engine implementation (Phase A+B).
    # -----------------------------
    facts_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(facts);").fetchall()
    }
    meaning_cols = {
        "meaning_tags_json": "ALTER TABLE facts ADD COLUMN meaning_tags_json TEXT NOT NULL DEFAULT '[]';",
        "narrative_role":    "ALTER TABLE facts ADD COLUMN narrative_role TEXT DEFAULT NULL;",
        "experience":        "ALTER TABLE facts ADD COLUMN experience TEXT DEFAULT NULL;",
        "reflection":        "ALTER TABLE facts ADD COLUMN reflection TEXT DEFAULT NULL;",
    }
    for col_name, alter_sql in meaning_cols.items():
        if col_name not in facts_cols:
            cur.execute(alter_sql)

    # -----------------------------
    # Migrate media: add rich metadata columns if missing (Bug MB-01 fix)
    # Original table only had kind/filename/mime/bytes/sha256/meta_json.
    # Router expected description/taken_at/location_name/latitude/longitude/exif_json.
    # -----------------------------
    media_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(media);").fetchall()
    }
    media_new_cols = {
        "description":   "ALTER TABLE media ADD COLUMN description TEXT NOT NULL DEFAULT '';",
        "taken_at":      "ALTER TABLE media ADD COLUMN taken_at TEXT DEFAULT NULL;",
        "location_name": "ALTER TABLE media ADD COLUMN location_name TEXT DEFAULT NULL;",
        "latitude":      "ALTER TABLE media ADD COLUMN latitude REAL DEFAULT NULL;",
        "longitude":     "ALTER TABLE media ADD COLUMN longitude REAL DEFAULT NULL;",
        "exif_json":     "ALTER TABLE media ADD COLUMN exif_json TEXT NOT NULL DEFAULT '{}';",
    }
    for col_name, alter_sql in media_new_cols.items():
        if col_name not in media_cols:
            cur.execute(alter_sql)

    # -----------------------------
    # Media attachments — links a photo to a memoir section or fact (Media Builder)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS media_attachments (
          id TEXT PRIMARY KEY,
          media_id TEXT NOT NULL,
          entity_type TEXT NOT NULL DEFAULT 'memoir_section',
          entity_id TEXT NOT NULL,
          person_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_attachments_media ON media_attachments(media_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_attachments_entity ON media_attachments(entity_type, entity_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_attachments_person ON media_attachments(person_id);"
    )

    # -----------------------------
    # Migrate people: add soft-delete columns if missing (Phase 2 — narrator delete)
    # -----------------------------
    people_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(people);").fetchall()
    }
    people_delete_cols = {
        "is_deleted":     "ALTER TABLE people ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;",
        "deleted_at":     "ALTER TABLE people ADD COLUMN deleted_at TEXT DEFAULT NULL;",
        "deleted_by":     "ALTER TABLE people ADD COLUMN deleted_by TEXT DEFAULT NULL;",
        "delete_reason":  "ALTER TABLE people ADD COLUMN delete_reason TEXT DEFAULT '';",
        "undo_expires_at":"ALTER TABLE people ADD COLUMN undo_expires_at TEXT DEFAULT NULL;",
    }
    for col_name, alter_sql in people_delete_cols.items():
        if col_name not in people_cols:
            cur.execute(alter_sql)

    # Index for fast active-narrator queries (exclude soft-deleted)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_people_active ON people(is_deleted, updated_at);"
    )

    # -----------------------------
    # Narrator delete audit log (Phase 2 — append-only)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS narrator_delete_audit (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          person_id TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          requested_by TEXT DEFAULT NULL,
          dependency_counts_json TEXT NOT NULL DEFAULT '{}',
          result TEXT NOT NULL DEFAULT 'success',
          error_detail TEXT DEFAULT NULL,
          ts TEXT NOT NULL
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_narrator_audit_ts ON narrator_delete_audit(ts);"
    )

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

    # -----------------------------
    # Segment flags  (Track A — Safety)
    # Sensitive flags on individual answer/segment records
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS segment_flags (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          question_id TEXT,
          section_id TEXT,
          sensitive INTEGER NOT NULL DEFAULT 0,
          sensitive_category TEXT DEFAULT '',
          excluded_from_memoir INTEGER NOT NULL DEFAULT 1,
          private INTEGER NOT NULL DEFAULT 1,
          deleted INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_segment_flags_session ON segment_flags(session_id);")
    # v6.2: UNIQUE constraint on (session_id, question_id) prevents duplicate flags on answer retry.
    # SQLite requires CREATE UNIQUE INDEX rather than ALTER TABLE ADD CONSTRAINT.
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_seg_flags_session_question "
        "ON segment_flags(session_id, question_id) WHERE question_id IS NOT NULL;"
    )

    # -----------------------------
    # Affect events  (Track B — Emotion Signal)
    # Derived affect state events from browser MediaPipe pipeline
    # Never stores raw landmarks or raw emotion labels
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS affect_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          section_id TEXT DEFAULT '',
          affect_state TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 0.0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          source TEXT NOT NULL DEFAULT 'camera',
          ts TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_affect_events_session_ts ON affect_events(session_id, ts);")

    # -----------------------------
    # Migrate interview_sessions: add softened mode columns if missing
    # -----------------------------
    existing_isess_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(interview_sessions);").fetchall()
    }
    softened_cols = {
        "interview_softened": "ALTER TABLE interview_sessions ADD COLUMN interview_softened INTEGER DEFAULT 0;",
        "softened_until_turn": "ALTER TABLE interview_sessions ADD COLUMN softened_until_turn INTEGER DEFAULT 0;",
        "turn_count": "ALTER TABLE interview_sessions ADD COLUMN turn_count INTEGER DEFAULT 0;",
    }
    for col_name, alter_sql in softened_cols.items():
        if col_name not in existing_isess_cols:
            cur.execute(alter_sql)

    _ensure_phase_g_tables(con, cur)
    _ensure_phase_q1_tables(con, cur)

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


def clear_turns(conv_id: str) -> int:
    """WO-2: Delete all turns for a conversation, returning count deleted."""
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM turns WHERE conv_id=?;", (conv_id,))
    con.commit()
    n = cur.rowcount
    con.close()
    return n


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
        (pid, display_name, role or "", _sanitise_dob(date_of_birth), place_of_birth or "", now, now),
    )
    con.commit()
    con.close()
    ensure_profile(pid)
    # v7.4D — log person creation for DB verification (Phase 0)
    logger.info("DB create_person: id=%s name=%r dob=%r pob=%r", pid, display_name, date_of_birth, place_of_birth)
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
        (display_name, role, _sanitise_dob(date_of_birth) if date_of_birth is not None else None, place_of_birth, now, person_id),
    )
    con.commit()
    con.close()
    return get_person(person_id)


def list_people(limit: int = 50, offset: int = 0, include_deleted: bool = False) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    if include_deleted:
        rows = con.execute(
            """
            SELECT id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at,
                   is_deleted,deleted_at,undo_expires_at
            FROM people
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?;
            """,
            (int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            """
            SELECT id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at
            FROM people
            WHERE is_deleted = 0
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


def update_profile_json(person_id: str, profile_json: Dict[str, Any], merge: bool = True, reason: str = "") -> Dict[str, Any]:
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
    # v7.4D — log profile saves for DB verification (Phase 0)
    logger.info("DB update_profile_json: person_id=%s reason=%r keys=%s", person_id, reason or "unspecified", list(merged.keys()))
    return get_profile(person_id) or {"person_id": person_id, "profile_json": merged, "updated_at": now}


def ingest_basic_info_document(
    person_id: str,
    document: Any,
    create_relatives: bool = False,
) -> Dict[str, Any]:
    """Ingest a basic-info form document into the profile.

    ``document`` may be a dict (from the JSON form) or a legacy plain-text string.
    ``create_relatives`` is accepted and stored; relative creation is not yet
    implemented — the flag is preserved so callers do not crash.
    """
    init_db()
    p = get_profile(person_id) or {"profile_json": {}}
    prof = dict(p.get("profile_json") or {})
    ingest = dict(prof.get("ingest") or {})
    if isinstance(document, str):
        ingest["basic_info"] = {"text": document, "ts": _now_iso()}
    else:
        ingest["basic_info"] = {
            "document": document or {},
            "create_relatives": create_relatives,
            "ts": _now_iso(),
        }
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
# Bug MB-01 fix: updated signatures to match what the router actually sends.
# Original function accepted (kind, filename, mime, bytes, sha256, meta) but
# the router called with (file_path, mime_type, description, taken_at, ...).
# -----------------------------------------------------------------------------
def add_media(
    person_id: Optional[str],
    filename: str,
    mime: str,
    bytes: int = 0,
    sha256: str = "",
    kind: str = "image",
    description: str = "",
    taken_at: Optional[str] = None,
    location_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    exif: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    mid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO media(
          id, person_id, kind, filename, mime, bytes, sha256, created_at,
          description, taken_at, location_name, latitude, longitude, exif_json, meta_json
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            mid, person_id, kind or "image", filename or "", mime or "",
            int(bytes or 0), sha256 or "", now,
            description or "", taken_at, location_name,
            latitude, longitude,
            _json_dump(exif or {}), "{}",
        ),
    )
    con.commit()
    con.close()
    return {
        "id": mid, "person_id": person_id, "kind": kind, "filename": filename,
        "mime": mime, "bytes": int(bytes or 0), "sha256": sha256, "created_at": now,
        "description": description, "taken_at": taken_at, "location_name": location_name,
        "latitude": latitude, "longitude": longitude, "exif": exif or {},
    }


def list_media(person_id: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    cols = (
        "id, person_id, kind, filename, mime, bytes, sha256, created_at, "
        "description, taken_at, location_name, latitude, longitude, exif_json"
    )
    if person_id:
        rows = con.execute(
            f"SELECT {cols} FROM media WHERE person_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?;",
            (person_id, int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            f"SELECT {cols} FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?;",
            (int(limit), int(offset)),
        ).fetchall()
    con.close()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["exif"] = _json_load(d.pop("exif_json", "{}"), {})
        out.append(d)
    return out


def get_media_item(media_id: str) -> Optional[Dict[str, Any]]:
    """Return a single media row by id, or None if not found."""
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT id,person_id,kind,filename,mime,bytes,sha256,created_at,"
        "description,taken_at,location_name,latitude,longitude,exif_json "
        "FROM media WHERE id=?;",
        (media_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    d = dict(row)
    d["exif"] = _json_load(d.pop("exif_json", "{}"), {})
    return d


def delete_media(media_id: str) -> bool:
    """Delete a media row. Returns True if a row was deleted."""
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM media WHERE id=?;", (media_id,))
    deleted = cur.rowcount > 0
    con.commit()
    con.close()
    return deleted


# Media attachments — links a photo to a memoir section or fact
# -----------------------------------------------------------------------------
def add_media_attachment(
    media_id: str,
    entity_type: str,
    entity_id: str,
    person_id: Optional[str] = None,
) -> Dict[str, Any]:
    init_db()
    aid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        "INSERT INTO media_attachments(id,media_id,entity_type,entity_id,person_id,created_at) VALUES(?,?,?,?,?,?);",
        (aid, media_id, entity_type, entity_id, person_id, now),
    )
    con.commit()
    con.close()
    return {"id": aid, "media_id": media_id, "entity_type": entity_type,
            "entity_id": entity_id, "person_id": person_id, "created_at": now}


def delete_media_attachment(attachment_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM media_attachments WHERE id=?;", (attachment_id,))
    deleted = cur.rowcount > 0
    con.commit()
    con.close()
    return deleted


def list_media_attachments(person_id: Optional[str] = None, media_id: Optional[str] = None) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    if media_id:
        rows = con.execute(
            "SELECT id,media_id,entity_type,entity_id,person_id,created_at "
            "FROM media_attachments WHERE media_id=? ORDER BY created_at ASC;",
            (media_id,),
        ).fetchall()
    elif person_id:
        rows = con.execute(
            "SELECT id,media_id,entity_type,entity_id,person_id,created_at "
            "FROM media_attachments WHERE person_id=? ORDER BY created_at ASC;",
            (person_id,),
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT id,media_id,entity_type,entity_id,person_id,created_at "
            "FROM media_attachments ORDER BY created_at ASC;"
        ).fetchall()
    con.close()
    return [dict(r) for r in rows]


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


def count_plan_questions(plan_id: str) -> int:
    """Return the number of questions seeded for plan_id. Used as a startup guard."""
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT COUNT(*) AS n FROM interview_questions WHERE plan_id=?;",
        (plan_id or "default",),
    ).fetchone()
    con.close()
    return int(row["n"]) if row else 0


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
    # Meaning Engine fields (Phase A+B — Bug MAT-01 fix)
    meaning_tags: Optional[List[str]] = None,
    narrative_role: Optional[str] = None,
    experience: Optional[str] = None,
    reflection: Optional[str] = None,
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
          source_turn_index,created_at,updated_at,meta_json,
          meaning_tags_json,narrative_role,experience,reflection
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            fid, person_id, session_id, fact_type or "general", statement,
            date_text or "", date_normalized or "",
            float(confidence or 0.0), status or "extracted",
            1 if inferred else 0, source_turn_index, now, now,
            _json_dump(meta or {}),
            _json_dump(meaning_tags or []),
            narrative_role or None,
            experience or None,
            reflection or None,
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
        "meaning_tags": meaning_tags or [],
        "narrative_role": narrative_role,
        "experience": experience,
        "reflection": reflection,
    }


def list_facts(
    person_id: str,
    status: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    _FACTS_COLS = """
        id,person_id,session_id,fact_type,statement,date_text,
        date_normalized,confidence,status,inferred,source_turn_index,
        created_at,meta_json,meaning_tags_json,narrative_role,experience,reflection
    """
    if status:
        rows = con.execute(
            f"SELECT {_FACTS_COLS} FROM facts WHERE person_id=? AND status=? "
            "ORDER BY created_at ASC LIMIT ? OFFSET ?;",
            (person_id, status, int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            f"SELECT {_FACTS_COLS} FROM facts WHERE person_id=? "
            "ORDER BY created_at ASC LIMIT ? OFFSET ?;",
            (person_id, int(limit), int(offset)),
        ).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        d["meaning_tags"] = _json_load(d.pop("meaning_tags_json", "[]"), [])
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

# =============================================================================
# v6.1 Track A — Segment Flags (Safety)
# =============================================================================

def save_segment_flag(
    session_id: str,
    question_id: Optional[str],
    section_id: Optional[str],
    sensitive: bool,
    sensitive_category: str,
    excluded_from_memoir: bool = True,
    private: bool = True,
) -> str:
    """Create a segment flag record. Returns the flag id.
    Uses INSERT OR IGNORE so retrying the same answer never creates duplicates.
    """
    con = _connect()
    now = _now_iso()
    flag_id = _uuid()
    con.execute(
        """
        INSERT OR IGNORE INTO segment_flags
          (id, session_id, question_id, section_id,
           sensitive, sensitive_category, excluded_from_memoir, private, deleted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?);
        """,
        (flag_id, session_id, question_id, section_id,
         int(sensitive), sensitive_category, int(excluded_from_memoir), int(private), now),
    )
    # If a flag for this (session, question) pair already existed, fetch the existing id
    existing = con.execute(
        "SELECT id FROM segment_flags WHERE session_id=? AND question_id=?;",
        (session_id, question_id),
    ).fetchone()
    con.commit()
    con.close()
    return (existing["id"] if existing else flag_id)


def get_segment_flags(session_id: str) -> List[Dict]:
    """Return all segment flags for a session."""
    con = _connect()
    rows = con.execute(
        "SELECT * FROM segment_flags WHERE session_id=? AND deleted=0 ORDER BY created_at;",
        (session_id,),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def delete_segment_flag(flag_id: str) -> bool:
    """Soft-delete a segment flag (user elected to remove sensitive segment)."""
    con = _connect()
    con.execute(
        "UPDATE segment_flags SET deleted=1 WHERE id=?;",
        (flag_id,),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


def include_segment_in_memoir(flag_id: str) -> bool:
    """User explicitly opts a sensitive segment into memoir drafts."""
    con = _connect()
    con.execute(
        "UPDATE segment_flags SET excluded_from_memoir=0, private=0 WHERE id=?;",
        (flag_id,),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


# v6.2 — lookup-by-(session_id, question_id) for frontend which uses those identifiers
def update_segment_flag_by_question(
    session_id: str, question_id: str, include_in_memoir: bool
) -> bool:
    """Toggle memoir inclusion for the flag matching (session_id, question_id)."""
    con = _connect()
    excluded = 0 if include_in_memoir else 1
    private_val = 0 if include_in_memoir else 1
    con.execute(
        "UPDATE segment_flags SET excluded_from_memoir=?, private=? "
        "WHERE session_id=? AND question_id=? AND deleted=0;",
        (excluded, private_val, session_id, question_id),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


def delete_segment_flag_by_question(session_id: str, question_id: str) -> bool:
    """Soft-delete the flag matching (session_id, question_id)."""
    con = _connect()
    con.execute(
        "UPDATE segment_flags SET deleted=1 WHERE session_id=? AND question_id=?;",
        (session_id, question_id),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


# =============================================================================
# v6.1 Track A — Softened Interview Mode
# =============================================================================

def set_session_softened(session_id: str, current_turn: int, softened_turns: int = 3) -> None:
    """Mark session as softened for the next N turns."""
    con = _connect()
    con.execute(
        """
        UPDATE interview_sessions
        SET interview_softened=1,
            softened_until_turn=?
        WHERE id=?;
        """,
        (current_turn + softened_turns, session_id),
    )
    con.commit()
    con.close()


def increment_session_turn(session_id: str) -> int:
    """Increment turn counter, returns new count."""
    con = _connect()
    con.execute(
        "UPDATE interview_sessions SET turn_count=COALESCE(turn_count,0)+1 WHERE id=?;",
        (session_id,),
    )
    con.commit()
    row = con.execute(
        "SELECT COALESCE(turn_count,0) as tc FROM interview_sessions WHERE id=?;",
        (session_id,),
    ).fetchone()
    con.close()
    return int(row["tc"]) if row else 0


def get_session_softened_state(session_id: str) -> Dict:
    """Return softened mode info for a session."""
    con = _connect()
    row = con.execute(
        """
        SELECT COALESCE(interview_softened,0) as interview_softened,
               COALESCE(softened_until_turn,0) as softened_until_turn,
               COALESCE(turn_count,0) as turn_count
        FROM interview_sessions WHERE id=?;
        """,
        (session_id,),
    ).fetchone()
    con.close()
    if not row:
        return {"interview_softened": False, "softened_until_turn": 0, "turn_count": 0}
    d = dict(row)
    # Auto-clear if we've passed the expiry turn
    is_softened = bool(d["interview_softened"]) and d["turn_count"] <= d["softened_until_turn"]
    return {
        "interview_softened": is_softened,
        "softened_until_turn": d["softened_until_turn"],
        "turn_count": d["turn_count"],
    }


def clear_session_softened(session_id: str) -> None:
    """Explicitly clear softened mode."""
    con = _connect()
    con.execute(
        "UPDATE interview_sessions SET interview_softened=0, softened_until_turn=0 WHERE id=?;",
        (session_id,),
    )
    con.commit()
    con.close()


# =============================================================================
# v6.1 Track B — Affect Events
# =============================================================================

def save_affect_event(
    session_id: str,
    timestamp: float,
    section_id: Optional[str],
    affect_state: str,
    confidence: float,
    duration_ms: int,
    source: str = "camera",
) -> str:
    """Persist a derived affect event. Returns the event id."""
    con = _connect()
    now = _now_iso()
    eid = _uuid()
    con.execute(
        """
        INSERT INTO affect_events
          (id, session_id, section_id, affect_state, confidence, duration_ms, source, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """,
        (eid, session_id, section_id or "", affect_state,
         round(confidence, 4), duration_ms, source, now),
    )
    con.commit()
    con.close()
    return eid


def list_affect_events(session_id: str, limit: int = 50) -> List[Dict]:
    """Return stored affect events for a session, newest first."""
    con = _connect()
    rows = con.execute(
        """
        SELECT id, session_id, section_id, affect_state, confidence, duration_ms, source, ts
        FROM affect_events
        WHERE session_id=?
        ORDER BY ts DESC
        LIMIT ?;
        """,
        (session_id, limit),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


# -----------------------------------------------------------------------------
# Narrator Delete — Phase 2 (dependency inventory, soft/hard delete, restore, audit)
# -----------------------------------------------------------------------------

def person_delete_inventory(person_id: str) -> Optional[Dict[str, Any]]:
    """Return dependency counts for a person, used before deletion confirmation."""
    init_db()
    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None

    counts = {}
    tables = [
        ("profiles", "person_id"),
        ("timeline_events", "person_id"),
        ("interview_sessions", "person_id"),
        ("interview_answers", "person_id"),
        ("facts", "person_id"),
        ("life_phases", "person_id"),
    ]
    for table, col in tables:
        row = con.execute(
            f"SELECT COUNT(*) AS cnt FROM {table} WHERE {col}=?;",  # noqa: S608
            (person_id,),
        ).fetchone()
        counts[table] = row["cnt"] if row else 0

    # Media: count rows where person_id matches (ON DELETE SET NULL)
    media_row = con.execute(
        "SELECT COUNT(*) AS cnt FROM media WHERE person_id=?;",
        (person_id,),
    ).fetchone()
    counts["media_owned"] = media_row["cnt"] if media_row else 0

    attach_row = con.execute(
        "SELECT COUNT(*) AS cnt FROM media_attachments WHERE person_id=?;",
        (person_id,),
    ).fetchone()
    counts["media_attachments"] = attach_row["cnt"] if attach_row else 0

    con.close()
    return {
        "person_id": person["id"],
        "display_name": person["display_name"],
        "counts": counts,
        "has_soft_delete": True,
        "is_deleted": bool(person["is_deleted"]),
    }


def _log_delete_audit(
    con: sqlite3.Connection,
    action: str,
    person_id: str,
    display_name: str,
    counts: Dict[str, Any],
    result: str = "success",
    error_detail: Optional[str] = None,
    requested_by: Optional[str] = None,
) -> None:
    """Append a row to the narrator_delete_audit table (within caller's transaction)."""
    con.execute(
        """
        INSERT INTO narrator_delete_audit
            (id, action, person_id, display_name, requested_by, dependency_counts_json, result, error_detail, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """,
        (
            _uuid(),
            action,
            person_id,
            display_name,
            requested_by,
            _json_dump(counts),
            result,
            error_detail,
            _now_iso(),
        ),
    )


def soft_delete_person(
    person_id: str,
    undo_minutes: int = 10,
    requested_by: Optional[str] = None,
    reason: str = "",
) -> Optional[Dict[str, Any]]:
    """Mark a person as soft-deleted. Reversible within undo_minutes."""
    init_db()
    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None
    if person["is_deleted"]:
        con.close()
        return {"error": "already_deleted", "person_id": person_id}

    now = _now_iso()
    from datetime import timedelta
    undo_expires = (datetime.utcnow() + timedelta(minutes=undo_minutes)).isoformat()

    # Get inventory counts before marking deleted
    inv = person_delete_inventory(person_id)
    counts = inv["counts"] if inv else {}

    con.execute(
        """
        UPDATE people
        SET is_deleted = 1,
            deleted_at = ?,
            deleted_by = ?,
            delete_reason = ?,
            undo_expires_at = ?,
            updated_at = ?
        WHERE id = ?;
        """,
        (now, requested_by, reason or "", undo_expires, now, person_id),
    )

    _log_delete_audit(con, "soft_delete", person_id, person["display_name"], counts,
                       result="success", requested_by=requested_by)

    con.commit()
    con.close()

    logger.info("soft_delete_person: id=%s name=%r undo_expires=%s", person_id, person["display_name"], undo_expires)

    return {
        "status": "soft_deleted",
        "person_id": person_id,
        "display_name": person["display_name"],
        "undo_expires_at": undo_expires,
        "counts": counts,
    }


def restore_person(person_id: str, requested_by: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Restore a soft-deleted person if within the undo window."""
    init_db()
    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted, undo_expires_at FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None
    if not person["is_deleted"]:
        con.close()
        return {"error": "not_deleted", "person_id": person_id}

    # Check undo window
    undo_exp = person["undo_expires_at"]
    if undo_exp:
        try:
            exp_dt = datetime.fromisoformat(undo_exp)
            if datetime.utcnow() > exp_dt:
                con.close()
                return {"error": "undo_expired", "person_id": person_id, "undo_expires_at": undo_exp}
        except ValueError:
            pass  # If parse fails, allow restore anyway

    now = _now_iso()
    con.execute(
        """
        UPDATE people
        SET is_deleted = 0,
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = '',
            undo_expires_at = NULL,
            updated_at = ?
        WHERE id = ?;
        """,
        (now, person_id),
    )

    _log_delete_audit(con, "restore", person_id, person["display_name"], {},
                       result="success", requested_by=requested_by)

    con.commit()
    con.close()

    logger.info("restore_person: id=%s name=%r", person_id, person["display_name"])

    return {
        "status": "restored",
        "person_id": person_id,
        "display_name": person["display_name"],
    }


def hard_delete_person(person_id: str, requested_by: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Permanently and transactionally delete a person and all dependent records.

    The SQLite FK cascade handles most deletions automatically:
    - profiles, timeline_events, interview_sessions, interview_answers, facts, life_phases → CASCADE
    - media, media_attachments → SET NULL (person_id nulled, records preserved)

    This function wraps the delete in a transaction for all-or-nothing safety.
    """
    init_db()

    # Get inventory before deletion
    inv = person_delete_inventory(person_id)
    if not inv:
        return None

    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None

    display_name = person["display_name"]
    counts = inv["counts"]

    try:
        # FK CASCADE handles dependent rows automatically when we delete the people row.
        # media.person_id and media_attachments.person_id get SET NULL.
        con.execute("DELETE FROM people WHERE id = ?;", (person_id,))

        _log_delete_audit(con, "hard_delete", person_id, display_name, counts,
                           result="success", requested_by=requested_by)

        con.commit()
        logger.info("hard_delete_person: id=%s name=%r counts=%s", person_id, display_name, counts)

    except Exception as exc:
        con.rollback()
        # Log the failure
        try:
            _log_delete_audit(con, "hard_delete", person_id, display_name, counts,
                               result="rollback", error_detail=str(exc), requested_by=requested_by)
            con.commit()
        except Exception:
            pass
        con.close()
        logger.error("hard_delete_person ROLLBACK: id=%s error=%s", person_id, exc)
        return {"error": "rollback", "person_id": person_id, "detail": str(exc)}

    con.close()

    return {
        "status": "hard_deleted",
        "person_id": person_id,
        "display_name": display_name,
        "counts_removed": counts,
    }


def list_delete_audit(limit: int = 50) -> List[Dict[str, Any]]:
    """Return recent narrator delete audit log entries."""
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id, action, person_id, display_name, requested_by,
               dependency_counts_json, result, error_detail, ts
        FROM narrator_delete_audit
        ORDER BY ts DESC
        LIMIT ?;
        """,
        (int(limit),),
    ).fetchall()
    con.close()
    results = []
    for r in rows:
        d = dict(r)
        d["dependency_counts"] = _json_load(d.pop("dependency_counts_json", "{}"), {})
        results.append(d)
    return results


# ── Phase G: Ensure Phase G tables ──────────────────────────────────────────

def _ensure_phase_g_tables(con: sqlite3.Connection, cur: sqlite3.Cursor) -> None:
    """Create Phase G tables: questionnaires, projections, identity change log."""

    # ─────────────────────────────────────────────────────────────────────────
    # bio_builder_questionnaires: canonical questionnaire state
    # ─────────────────────────────────────────────────────────────────────────
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS bio_builder_questionnaires (
            person_id TEXT PRIMARY KEY,
            questionnaire_json TEXT NOT NULL DEFAULT '{}',
            source TEXT NOT NULL DEFAULT 'unknown',
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )

    # ─────────────────────────────────────────────────────────────────────────
    # interview_projections: canonical projection state
    # ─────────────────────────────────────────────────────────────────────────
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_projections (
            person_id TEXT PRIMARY KEY,
            projection_json TEXT NOT NULL DEFAULT '{}',
            source TEXT NOT NULL DEFAULT 'unknown',
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )

    # ─────────────────────────────────────────────────────────────────────────
    # identity_change_log: audit trail of proposed identity changes
    # ─────────────────────────────────────────────────────────────────────────
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS identity_change_log (
            id TEXT PRIMARY KEY,
            person_id TEXT NOT NULL,
            field_path TEXT NOT NULL,
            old_value TEXT DEFAULT '',
            new_value TEXT DEFAULT '',
            source TEXT NOT NULL DEFAULT 'unknown',
            status TEXT NOT NULL DEFAULT 'proposed',
            accepted_by TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            resolved_at TEXT DEFAULT '',
            meta_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_identity_change_person_created "
        "ON identity_change_log(person_id, created_at);"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Questionnaire canonical persistence
# ─────────────────────────────────────────────────────────────────────────────

def get_questionnaire(person_id: str) -> Dict[str, Any]:
    """Load canonical questionnaire state from backend DB."""
    con = _connect()
    try:
        row = con.execute(
            "SELECT questionnaire_json, source, version, updated_at "
            "FROM bio_builder_questionnaires WHERE person_id = ?",
            (person_id,),
        ).fetchone()
        if not row:
            return {
                "person_id": person_id,
                "questionnaire": {},
                "source": "empty",
                "version": 0,
                "updated_at": "",
            }
        return {
            "person_id": person_id,
            "questionnaire": json.loads(row["questionnaire_json"] or "{}"),
            "source": row["source"],
            "version": row["version"],
            "updated_at": row["updated_at"],
        }
    finally:
        con.close()


def upsert_questionnaire(
    person_id: str,
    questionnaire: Dict[str, Any],
    source: str = "ui",
    version: int = 1,
) -> Dict[str, Any]:
    """Save canonical questionnaire state to backend DB."""
    now = datetime.utcnow().isoformat()
    q_json = json.dumps(questionnaire, ensure_ascii=False)
    con = _connect()
    try:
        con.execute(
            """INSERT INTO bio_builder_questionnaires
                   (person_id, questionnaire_json, source, version, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(person_id) DO UPDATE SET
                   questionnaire_json = excluded.questionnaire_json,
                   source = excluded.source,
                   version = excluded.version,
                   updated_at = excluded.updated_at""",
            (person_id, q_json, source, version, now),
        )
        con.commit()
        return {
            "person_id": person_id,
            "questionnaire": questionnaire,
            "source": source,
            "version": version,
            "updated_at": now,
        }
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Projection canonical persistence
# ─────────────────────────────────────────────────────────────────────────────

def get_projection(person_id: str) -> Dict[str, Any]:
    """Load canonical interview projection state from backend DB."""
    con = _connect()
    try:
        row = con.execute(
            "SELECT projection_json, source, version, updated_at "
            "FROM interview_projections WHERE person_id = ?",
            (person_id,),
        ).fetchone()
        if not row:
            return {
                "person_id": person_id,
                "projection": {},
                "source": "empty",
                "version": 0,
                "updated_at": "",
            }
        return {
            "person_id": person_id,
            "projection": json.loads(row["projection_json"] or "{}"),
            "source": row["source"],
            "version": row["version"],
            "updated_at": row["updated_at"],
        }
    finally:
        con.close()


def upsert_projection(
    person_id: str,
    projection: Dict[str, Any],
    source: str = "projection_sync",
    version: int = 1,
) -> Dict[str, Any]:
    """Save canonical projection state to backend DB."""
    now = datetime.utcnow().isoformat()
    p_json = json.dumps(projection, ensure_ascii=False)
    con = _connect()
    try:
        con.execute(
            """INSERT INTO interview_projections
                   (person_id, projection_json, source, version, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(person_id) DO UPDATE SET
                   projection_json = excluded.projection_json,
                   source = excluded.source,
                   version = excluded.version,
                   updated_at = excluded.updated_at""",
            (person_id, p_json, source, version, now),
        )
        con.commit()
        return {
            "person_id": person_id,
            "projection": projection,
            "source": source,
            "version": version,
            "updated_at": now,
        }
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Combined narrator state snapshot
# ─────────────────────────────────────────────────────────────────────────────

def get_narrator_state_snapshot(person_id: str) -> Dict[str, Any]:
    """
    Return combined backend canonical state for a narrator.
    Used by frontend on startup/switch to hydrate from backend authority.
    """
    person = get_person(person_id) or {}
    profile_row = get_profile(person_id) or {}
    profile = {}
    if isinstance(profile_row, str):
        try:
            profile = json.loads(profile_row)
        except Exception:
            profile = {}
    elif isinstance(profile_row, dict):
        profile = profile_row

    qq = get_questionnaire(person_id)
    proj = get_projection(person_id)

    # Build protected identity snapshot from person record + profile basics
    basics = profile.get("basics", {}) if isinstance(profile, dict) else {}
    protected_identity = {
        "personal.fullName": person.get("display_name", ""),
        "personal.preferredName": basics.get("preferred", ""),
        "personal.dateOfBirth": person.get("date_of_birth", ""),
        "personal.placeOfBirth": person.get("place_of_birth", ""),
        "personal.birthOrder": basics.get("birthOrder", ""),
    }

    now = datetime.utcnow().isoformat()
    return {
        "person_id": person_id,
        "person": person,
        "profile": profile,
        "questionnaire": qq.get("questionnaire", {}),
        "projection": proj.get("projection", {}),
        "protected_identity": protected_identity,
        "updated_at": now,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Identity change log
# ─────────────────────────────────────────────────────────────────────────────

def log_identity_change_proposal(
    person_id: str,
    field_path: str,
    old_value: str,
    new_value: str,
    source: str,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Log a proposed change to a protected identity field."""
    proposal_id = "chg_" + uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat()
    meta_json = json.dumps(meta or {}, ensure_ascii=False)
    con = _connect()
    try:
        con.execute(
            """INSERT INTO identity_change_log
                   (id, person_id, field_path, old_value, new_value, source,
                    status, created_at, meta_json)
               VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?)""",
            (proposal_id, person_id, field_path, old_value, new_value,
             source, now, meta_json),
        )
        con.commit()
        return {
            "proposal_id": proposal_id,
            "person_id": person_id,
            "field_path": field_path,
            "old_value": old_value,
            "new_value": new_value,
            "source": source,
            "status": "proposed",
            "created_at": now,
        }
    finally:
        con.close()


def approve_identity_change_proposal(
    proposal_id: str,
    accepted_by: str = "human",
) -> Dict[str, Any]:
    """
    Accept a proposed identity change, apply it to the person/profile record,
    and mark the log entry as accepted.
    """
    now = datetime.utcnow().isoformat()
    con = _connect()
    try:
        row = con.execute(
            "SELECT * FROM identity_change_log WHERE id = ?",
            (proposal_id,),
        ).fetchone()
        if not row:
            return {"ok": False, "error": "proposal_not_found"}
        row = dict(row)

        if row["status"] != "proposed":
            return {"ok": False, "error": f"proposal already {row['status']}"}

        # Apply the change to canonical person/profile data
        person_id = row["person_id"]
        field_path = row["field_path"]
        new_value = row["new_value"]

        # Map field_path to actual DB column/field
        _applied = False
        if field_path == "personal.fullName":
            con.execute(
                "UPDATE people SET display_name = ?, updated_at = ? WHERE id = ?",
                (new_value, now, person_id),
            )
            _applied = True
        elif field_path == "personal.dateOfBirth":
            con.execute(
                "UPDATE people SET date_of_birth = ?, updated_at = ? WHERE id = ?",
                (new_value, now, person_id),
            )
            _applied = True
        elif field_path == "personal.placeOfBirth":
            con.execute(
                "UPDATE people SET place_of_birth = ?, updated_at = ? WHERE id = ?",
                (new_value, now, person_id),
            )
            _applied = True
        elif field_path in ("personal.preferredName", "personal.birthOrder"):
            # These live in profile basics JSON
            prof_row = con.execute(
                "SELECT profile_json FROM profiles WHERE person_id = ?",
                (person_id,),
            ).fetchone()
            if prof_row:
                profile = json.loads(prof_row["profile_json"] or "{}")
                basics = profile.setdefault("basics", {})
                key = "preferred" if field_path == "personal.preferredName" else "birthOrder"
                basics[key] = new_value
                con.execute(
                    "UPDATE profiles SET profile_json = ?, updated_at = ? WHERE person_id = ?",
                    (json.dumps(profile, ensure_ascii=False), now, person_id),
                )
                _applied = True

        # Mark proposal as accepted
        con.execute(
            """UPDATE identity_change_log
               SET status = 'accepted', accepted_by = ?, resolved_at = ?
               WHERE id = ?""",
            (accepted_by, now, proposal_id),
        )
        con.commit()

        return {
            "ok": True,
            "proposal_id": proposal_id,
            "person_id": person_id,
            "field_path": field_path,
            "new_value": new_value,
            "applied": _applied,
            "accepted_by": accepted_by,
            "resolved_at": now,
        }
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase Q.1: Relationship Graph Layer
# ─────────────────────────────────────────────────────────────────────────────

def _ensure_phase_q1_tables(con: sqlite3.Connection, cur: sqlite3.Cursor) -> None:
    """Create Phase Q.1 tables: graph_persons and graph_relationships."""

    # graph_persons: every person node in the relationship graph
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_persons (
            id TEXT PRIMARY KEY,
            narrator_id TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            first_name TEXT NOT NULL DEFAULT '',
            middle_name TEXT NOT NULL DEFAULT '',
            last_name TEXT NOT NULL DEFAULT '',
            maiden_name TEXT NOT NULL DEFAULT '',
            birth_date TEXT NOT NULL DEFAULT '',
            birth_place TEXT NOT NULL DEFAULT '',
            occupation TEXT NOT NULL DEFAULT '',
            deceased INTEGER NOT NULL DEFAULT 0,
            is_narrator INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'manual',
            provenance TEXT NOT NULL DEFAULT '',
            confidence REAL NOT NULL DEFAULT 1.0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            meta_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(narrator_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_persons_narrator "
        "ON graph_persons(narrator_id);"
    )

    # graph_relationships: edges between graph_persons
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_relationships (
            id TEXT PRIMARY KEY,
            narrator_id TEXT NOT NULL,
            from_person_id TEXT NOT NULL,
            to_person_id TEXT NOT NULL,
            relationship_type TEXT NOT NULL DEFAULT '',
            subtype TEXT NOT NULL DEFAULT '',
            label TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'manual',
            provenance TEXT NOT NULL DEFAULT '',
            confidence REAL NOT NULL DEFAULT 1.0,
            start_date TEXT NOT NULL DEFAULT '',
            end_date TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            meta_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(narrator_id) REFERENCES people(id) ON DELETE CASCADE,
            FOREIGN KEY(from_person_id) REFERENCES graph_persons(id) ON DELETE CASCADE,
            FOREIGN KEY(to_person_id) REFERENCES graph_persons(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_rels_narrator "
        "ON graph_relationships(narrator_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_rels_from "
        "ON graph_relationships(from_person_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_rels_to "
        "ON graph_relationships(to_person_id);"
    )


# ── Graph Persons CRUD ──

def graph_upsert_person(
    narrator_id: str,
    person_id: Optional[str] = None,
    display_name: str = "",
    first_name: str = "",
    middle_name: str = "",
    last_name: str = "",
    maiden_name: str = "",
    birth_date: str = "",
    birth_place: str = "",
    occupation: str = "",
    deceased: bool = False,
    is_narrator: bool = False,
    source: str = "manual",
    provenance: str = "",
    confidence: float = 1.0,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert or update a person node in the relationship graph."""
    pid = person_id or _uuid()
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            """INSERT INTO graph_persons
                   (id, narrator_id, display_name, first_name, middle_name,
                    last_name, maiden_name, birth_date, birth_place, occupation,
                    deceased, is_narrator, source, provenance, confidence,
                    created_at, updated_at, meta_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                   display_name=excluded.display_name,
                   first_name=excluded.first_name,
                   middle_name=excluded.middle_name,
                   last_name=excluded.last_name,
                   maiden_name=excluded.maiden_name,
                   birth_date=excluded.birth_date,
                   birth_place=excluded.birth_place,
                   occupation=excluded.occupation,
                   deceased=excluded.deceased,
                   is_narrator=excluded.is_narrator,
                   source=excluded.source,
                   provenance=excluded.provenance,
                   confidence=excluded.confidence,
                   updated_at=excluded.updated_at,
                   meta_json=excluded.meta_json""",
            (pid, narrator_id, display_name, first_name, middle_name,
             last_name, maiden_name, birth_date, birth_place, occupation,
             1 if deceased else 0, 1 if is_narrator else 0,
             source, provenance, confidence,
             now, now, _json_dump(meta or {})),
        )
        con.commit()
        return {
            "id": pid, "narrator_id": narrator_id,
            "display_name": display_name,
            "first_name": first_name, "middle_name": middle_name,
            "last_name": last_name, "maiden_name": maiden_name,
            "birth_date": birth_date, "birth_place": birth_place,
            "occupation": occupation, "deceased": deceased,
            "is_narrator": is_narrator,
            "source": source, "provenance": provenance,
            "confidence": confidence,
            "created_at": now, "updated_at": now,
            "meta": meta or {},
        }
    finally:
        con.close()


def graph_list_persons(narrator_id: str) -> List[Dict[str, Any]]:
    """List all person nodes for a narrator."""
    con = _connect()
    try:
        rows = con.execute(
            "SELECT * FROM graph_persons WHERE narrator_id=? ORDER BY created_at",
            (narrator_id,),
        ).fetchall()
        out = []
        for r in rows:
            out.append({
                "id": r["id"], "narrator_id": r["narrator_id"],
                "display_name": r["display_name"],
                "first_name": r["first_name"], "middle_name": r["middle_name"],
                "last_name": r["last_name"], "maiden_name": r["maiden_name"],
                "birth_date": r["birth_date"], "birth_place": r["birth_place"],
                "occupation": r["occupation"],
                "deceased": bool(r["deceased"]),
                "is_narrator": bool(r["is_narrator"]),
                "source": r["source"], "provenance": r["provenance"],
                "confidence": r["confidence"],
                "created_at": r["created_at"], "updated_at": r["updated_at"],
                "meta": _json_load(r["meta_json"], {}),
            })
        return out
    finally:
        con.close()


def graph_delete_person(person_id: str) -> bool:
    """Delete a person node (cascades to relationship edges)."""
    con = _connect()
    try:
        con.execute("DELETE FROM graph_relationships WHERE from_person_id=? OR to_person_id=?", (person_id, person_id))
        cur = con.execute("DELETE FROM graph_persons WHERE id=?", (person_id,))
        con.commit()
        return cur.rowcount > 0
    finally:
        con.close()


# ── Graph Relationships CRUD ──

def graph_upsert_relationship(
    narrator_id: str,
    rel_id: Optional[str] = None,
    from_person_id: str = "",
    to_person_id: str = "",
    relationship_type: str = "",
    subtype: str = "",
    label: str = "",
    status: str = "active",
    notes: str = "",
    source: str = "manual",
    provenance: str = "",
    confidence: float = 1.0,
    start_date: str = "",
    end_date: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert or update a relationship edge."""
    rid = rel_id or _uuid()
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            """INSERT INTO graph_relationships
                   (id, narrator_id, from_person_id, to_person_id,
                    relationship_type, subtype, label, status, notes,
                    source, provenance, confidence, start_date, end_date,
                    created_at, updated_at, meta_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                   from_person_id=excluded.from_person_id,
                   to_person_id=excluded.to_person_id,
                   relationship_type=excluded.relationship_type,
                   subtype=excluded.subtype,
                   label=excluded.label,
                   status=excluded.status,
                   notes=excluded.notes,
                   source=excluded.source,
                   provenance=excluded.provenance,
                   confidence=excluded.confidence,
                   start_date=excluded.start_date,
                   end_date=excluded.end_date,
                   updated_at=excluded.updated_at,
                   meta_json=excluded.meta_json""",
            (rid, narrator_id, from_person_id, to_person_id,
             relationship_type, subtype, label, status, notes,
             source, provenance, confidence, start_date, end_date,
             now, now, _json_dump(meta or {})),
        )
        con.commit()
        return {
            "id": rid, "narrator_id": narrator_id,
            "from_person_id": from_person_id, "to_person_id": to_person_id,
            "relationship_type": relationship_type, "subtype": subtype,
            "label": label, "status": status, "notes": notes,
            "source": source, "provenance": provenance,
            "confidence": confidence,
            "start_date": start_date, "end_date": end_date,
            "created_at": now, "updated_at": now,
            "meta": meta or {},
        }
    finally:
        con.close()


def graph_list_relationships(narrator_id: str) -> List[Dict[str, Any]]:
    """List all relationship edges for a narrator."""
    con = _connect()
    try:
        rows = con.execute(
            "SELECT * FROM graph_relationships WHERE narrator_id=? ORDER BY created_at",
            (narrator_id,),
        ).fetchall()
        out = []
        for r in rows:
            out.append({
                "id": r["id"], "narrator_id": r["narrator_id"],
                "from_person_id": r["from_person_id"],
                "to_person_id": r["to_person_id"],
                "relationship_type": r["relationship_type"],
                "subtype": r["subtype"],
                "label": r["label"], "status": r["status"],
                "notes": r["notes"],
                "source": r["source"], "provenance": r["provenance"],
                "confidence": r["confidence"],
                "start_date": r["start_date"], "end_date": r["end_date"],
                "created_at": r["created_at"], "updated_at": r["updated_at"],
                "meta": _json_load(r["meta_json"], {}),
            })
        return out
    finally:
        con.close()


def graph_delete_relationship(rel_id: str) -> bool:
    """Delete a relationship edge."""
    con = _connect()
    try:
        cur = con.execute("DELETE FROM graph_relationships WHERE id=?", (rel_id,))
        con.commit()
        return cur.rowcount > 0
    finally:
        con.close()


def graph_get_full(narrator_id: str) -> Dict[str, Any]:
    """Load the full relationship graph for a narrator (persons + relationships)."""
    return {
        "narrator_id": narrator_id,
        "persons": graph_list_persons(narrator_id),
        "relationships": graph_list_relationships(narrator_id),
    }


def graph_replace_full(narrator_id: str, persons: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Replace the entire relationship graph for a narrator (atomic)."""
    now = _now_iso()
    con = _connect()
    try:
        # Clear existing graph
        con.execute("DELETE FROM graph_relationships WHERE narrator_id=?", (narrator_id,))
        con.execute("DELETE FROM graph_persons WHERE narrator_id=?", (narrator_id,))

        # Insert persons
        for p in persons:
            con.execute(
                """INSERT INTO graph_persons
                       (id, narrator_id, display_name, first_name, middle_name,
                        last_name, maiden_name, birth_date, birth_place, occupation,
                        deceased, is_narrator, source, provenance, confidence,
                        created_at, updated_at, meta_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (p.get("id") or _uuid(), narrator_id,
                 p.get("display_name", ""), p.get("first_name", ""),
                 p.get("middle_name", ""), p.get("last_name", ""),
                 p.get("maiden_name", ""), p.get("birth_date", ""),
                 p.get("birth_place", ""), p.get("occupation", ""),
                 1 if p.get("deceased") else 0,
                 1 if p.get("is_narrator") else 0,
                 p.get("source", "manual"), p.get("provenance", ""),
                 p.get("confidence", 1.0),
                 p.get("created_at", now), now,
                 _json_dump(p.get("meta", {}))),
            )

        # Insert relationships
        for r in relationships:
            con.execute(
                """INSERT INTO graph_relationships
                       (id, narrator_id, from_person_id, to_person_id,
                        relationship_type, subtype, label, status, notes,
                        source, provenance, confidence, start_date, end_date,
                        created_at, updated_at, meta_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (r.get("id") or _uuid(), narrator_id,
                 r.get("from_person_id", ""), r.get("to_person_id", ""),
                 r.get("relationship_type", ""), r.get("subtype", ""),
                 r.get("label", ""), r.get("status", "active"),
                 r.get("notes", ""),
                 r.get("source", "manual"), r.get("provenance", ""),
                 r.get("confidence", 1.0),
                 r.get("start_date", ""), r.get("end_date", ""),
                 r.get("created_at", now), now,
                 _json_dump(r.get("meta", {}))),
            )

        con.commit()
        return graph_get_full(narrator_id)
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
