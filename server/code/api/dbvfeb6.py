"""LoreVox v4.2 — SQLite layer (JSON-Hybrid)

This module is the *source of truth* for data persistence.

Key concepts
- People: the entities we are documenting (subject + relatives).
- Profiles: flexible JSON document that mirrors your basic-info.html 1:1.
- Answers: immutable log of Q/A during interviews.
- Timeline & Media: "hard facts" and files with stable columns.
- Sessions: chat sessions, always attached to a person.

Design notes
- Profiles are versioned (append-only history) so you can undo / audit.
- Answers remain canonical for interview provenance.
- Interview plan drives question order + optional mapping to profile JSON paths.

"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _uuid() -> str:
    return str(uuid.uuid4())


def _loads(s: Optional[str], default):
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


def _dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _set_path(doc: Dict[str, Any], path: str, value: Any) -> Dict[str, Any]:
    """Set a value into a nested dict using a dotted path.

    Supported:
      - dot paths: "basic.full_name"
      - bracket indices for lists: "family.parents[0].first_name"

    If intermediate containers don't exist, they are created.
    """

    def parse(p: str):
        out = []
        buf = ""
        i = 0
        while i < len(p):
            ch = p[i]
            if ch == ".":
                if buf:
                    out.append(("key", buf))
                    buf = ""
                i += 1
                continue
            if ch == "[":
                if buf:
                    out.append(("key", buf))
                    buf = ""
                j = p.find("]", i)
                if j == -1:
                    raise ValueError(f"Bad path (missing ]): {p}")
                idx = int(p[i + 1 : j])
                out.append(("idx", idx))
                i = j + 1
                continue
            buf += ch
            i += 1
        if buf:
            out.append(("key", buf))
        return out

    steps = parse(path)
    cur: Any = doc
    for k, v in steps[:-1]:
        if k == "key":
            if not isinstance(cur, dict):
                raise ValueError(f"Path hits non-dict before '{v}' in '{path}'")
            if v not in cur or cur[v] is None:
                # Next step determines container type
                nxt_k, _ = steps[steps.index((k, v)) + 1]  # safe enough for short paths
                cur[v] = [] if nxt_k == "idx" else {}
            cur = cur[v]
        else:  # idx
            if not isinstance(cur, list):
                raise ValueError(f"Path hits non-list before index {v} in '{path}'")
            while len(cur) <= v:
                cur.append({})
            cur = cur[v]

    last_k, last_v = steps[-1]
    if last_k == "key":
        if not isinstance(cur, dict):
            raise ValueError(f"Path hits non-dict at final key '{last_v}' in '{path}'")
        cur[last_v] = value
    else:
        if not isinstance(cur, list):
            raise ValueError(f"Path hits non-list at final index {last_v} in '{path}'")
        while len(cur) <= last_v:
            cur.append(None)
        cur[last_v] = value

    return doc


# -----------------------------------------------------------------------------
# Connection
# -----------------------------------------------------------------------------

def connect_db() -> sqlite3.Connection:
    # v4.2: local-first path selection via env vars (no settings module)
    data_dir = Path(os.getenv("DATA_DIR", "data")).expanduser()
    db_dir = Path(os.getenv("DB_DIR", str(data_dir / "db"))).expanduser()
    db_name = os.getenv("DB_NAME", "lorevox.sqlite3")
    db_dir.mkdir(parents=True, exist_ok=True)
    db_path = db_dir / db_name
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


# -----------------------------------------------------------------------------
# Schema
# -----------------------------------------------------------------------------

SCHEMA_SQL = """
-- Users: optional auth layer (can stay single-user for local-first)
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- People: subjects of biography (you, parents, siblings, etc.)
CREATE TABLE IF NOT EXISTS people (
  person_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT NULL,              -- e.g., 'subject', 'parent', 'sibling'
  dob TEXT DEFAULT NULL,               -- ISO date YYYY-MM-DD
  tob TEXT DEFAULT NULL,               -- HH:MM
  pob TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Profiles: flexible JSON doc that mirrors basic-info.html
CREATE TABLE IF NOT EXISTS profiles (
  person_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,          -- JSON document
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(person_id) ON DELETE CASCADE
);

-- Profile history (append-only)
CREATE TABLE IF NOT EXISTS profile_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  profile_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(person_id) ON DELETE CASCADE
);

-- Relationships between people
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  related_person_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,     -- 'parent', 'child', 'spouse', 'sibling', etc.
  notes TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(person_id) ON DELETE CASCADE,
  FOREIGN KEY(related_person_id) REFERENCES people(person_id) ON DELETE CASCADE
);

-- Timeline events (hard facts)
CREATE TABLE IF NOT EXISTS timeline_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  event_date TEXT NOT NULL,            -- ISO date
  event_title TEXT NOT NULL,
  event_description TEXT DEFAULT NULL,
  location_name TEXT DEFAULT NULL,
  lat REAL DEFAULT NULL,
  lon REAL DEFAULT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(person_id) ON DELETE CASCADE
);

-- Media (hard facts + file pointers)
CREATE TABLE IF NOT EXISTS media (
  media_id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id TEXT NOT NULL,
  event_id INTEGER DEFAULT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT DEFAULT NULL,
  sha256 TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  taken_at TEXT DEFAULT NULL,          -- ISO date/time if known
  location_name TEXT DEFAULT NULL,
  lat REAL DEFAULT NULL,
  lon REAL DEFAULT NULL,
  exif_json TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(person_id) ON DELETE CASCADE,
  FOREIGN KEY(event_id) REFERENCES timeline_events(event_id) ON DELETE SET NULL
);

-- Interview plan (sections + questions)
CREATE TABLE IF NOT EXISTS interview_sections (
  section_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_questions (
  question_id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'free_text',
  required INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,

  -- v4.2: mapping to profile JSON
  profile_path TEXT DEFAULT NULL,      -- e.g., 'personal.full_name'

  FOREIGN KEY(section_id) REFERENCES interview_sections(section_id) ON DELETE CASCADE
);

-- Sessions (chat) now always attached to a person
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  user_id TEXT DEFAULT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  title TEXT DEFAULT NULL,
  active_question_id TEXT DEFAULT NULL,
  FOREIGN KEY(person_id) REFERENCES people(person_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Answers: immutable interview log
CREATE TABLE IF NOT EXISTS answers (
  answer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY(person_id) REFERENCES people(person_id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES interview_questions(question_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_person ON answers(person_id);
CREATE INDEX IF NOT EXISTS idx_timeline_person_date ON timeline_events(person_id, event_date);
CREATE INDEX IF NOT EXISTS idx_media_person ON media(person_id);
"""


def init_db(con: sqlite3.Connection) -> None:
    con.executescript(SCHEMA_SQL)
    con.commit()


# -----------------------------------------------------------------------------
# Interview plan import
# -----------------------------------------------------------------------------

def import_interview_plan(con: sqlite3.Connection, plan: Any) -> None:
    """Upserts interview plan.

    Expected JSON shape:
    {
      "plan_id": "..." (optional),
      "sections": [
        {"id": "personal", "title": "Personal", "description": "...", "questions": [
           {"id": "full_name", "prompt": "...", "required": true, "kind": "free_text", "profile_path": "personal.full_name"}
        ]}
      ]
    }
    """
    # Allow passing a dict or a JSON file path
    if not isinstance(plan, dict):
        from pathlib import Path as _Path
        if isinstance(plan, (_Path, str)):
            plan = json.load(open(str(plan), "r", encoding="utf-8"))
        else:
            raise TypeError(f"Unsupported plan type: {type(plan)}")

    sections = plan.get("sections", [])

    # Wipe + reinsert for simplicity (local-first)
    con.execute("DELETE FROM interview_questions")
    con.execute("DELETE FROM interview_sections")

    for s_idx, sec in enumerate(sections):
        con.execute(
            "INSERT INTO interview_sections(section_id,title,description,sort_order) VALUES (?,?,?,?)",
            (sec["id"], sec.get("title", sec["id"]), sec.get("description"), s_idx),
        )
        for q_idx, q in enumerate(sec.get("questions", [])):
            con.execute(
                """INSERT INTO interview_questions(
                    question_id, section_id, prompt, kind, required, sort_order, profile_path
                ) VALUES (?,?,?,?,?,?,?)""",
                (
                    q["id"],
                    sec["id"],
                    q["prompt"],
                    q.get("kind", "free_text"),
                    1 if q.get("required") else 0,
                    q_idx,
                    q.get("profile_path"),
                ),
            )

    con.commit()


# -----------------------------------------------------------------------------
# People + Profiles
# -----------------------------------------------------------------------------

def create_person(
    con: sqlite3.Connection,
    display_name: str,
    role: Optional[str] = None,
    dob: Optional[str] = None,
    tob: Optional[str] = None,
    pob: Optional[str] = None,
) -> str:
    person_id = _uuid()
    now = _utc_now()
    con.execute(
        """INSERT INTO people(person_id,display_name,role,dob,tob,pob,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (person_id, display_name, role, dob, tob, pob, now, now),
    )
    con.commit()
    return person_id


def update_person(
    con: sqlite3.Connection,
    person_id: str,
    *,
    display_name: Optional[str] = None,
    role: Optional[str] = None,
    dob: Optional[str] = None,
    tob: Optional[str] = None,
    pob: Optional[str] = None,
) -> None:
    row = con.execute("SELECT * FROM people WHERE person_id=?", (person_id,)).fetchone()
    if not row:
        raise KeyError("person not found")
    now = _utc_now()
    con.execute(
        """UPDATE people
           SET display_name=?, role=?, dob=?, tob=?, pob=?, updated_at=?
           WHERE person_id=?""",
        (
            display_name if display_name is not None else row["display_name"],
            role if role is not None else row["role"],
            dob if dob is not None else row["dob"],
            tob if tob is not None else row["tob"],
            pob if pob is not None else row["pob"],
            now,
            person_id,
        ),
    )
    con.commit()


def get_person(con: sqlite3.Connection, person_id: str) -> Optional[Dict[str, Any]]:
    row = con.execute("SELECT * FROM people WHERE person_id=?", (person_id,)).fetchone()
    return dict(row) if row else None


def list_people(con: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    rows = con.execute(
        "SELECT * FROM people ORDER BY updated_at DESC LIMIT ? OFFSET ?", (limit, offset)
    ).fetchall()
    return [dict(r) for r in rows]


def ensure_profile(con: sqlite3.Connection, person_id: str) -> Dict[str, Any]:
    row = con.execute("SELECT * FROM profiles WHERE person_id=?", (person_id,)).fetchone()
    if row:
        return dict(row)
    now = _utc_now()
    doc = {"_meta": {"created_at": now, "schema": "lorevox_profile_v1"}}
    con.execute(
        "INSERT INTO profiles(person_id,profile_json,version,created_at,updated_at) VALUES (?,?,?,?,?)",
        (person_id, _dumps(doc), 1, now, now),
    )
    con.execute(
        "INSERT INTO profile_versions(person_id,version,profile_json,created_at) VALUES (?,?,?,?)",
        (person_id, 1, _dumps(doc), now),
    )
    con.commit()
    return {
        "person_id": person_id,
        "profile_json": _dumps(doc),
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }


def get_profile(con: sqlite3.Connection, person_id: str) -> Dict[str, Any]:
    row = con.execute("SELECT * FROM profiles WHERE person_id=?", (person_id,)).fetchone()
    if not row:
        ensure_profile(con, person_id)
        row = con.execute("SELECT * FROM profiles WHERE person_id=?", (person_id,)).fetchone()
    assert row is not None
    out = dict(row)
    out["profile"] = _loads(out.get("profile_json"), {})
    return out


def update_profile_json(con: sqlite3.Connection, person_id: str, new_profile: Dict[str, Any]) -> Dict[str, Any]:
    row = ensure_profile(con, person_id)
    cur = con.execute("SELECT version FROM profiles WHERE person_id=?", (person_id,)).fetchone()
    version = int(cur["version"]) + 1 if cur else 2
    now = _utc_now()
    con.execute(
        "UPDATE profiles SET profile_json=?, version=?, updated_at=? WHERE person_id=?",
        (_dumps(new_profile), version, now, person_id),
    )
    con.execute(
        "INSERT INTO profile_versions(person_id,version,profile_json,created_at) VALUES (?,?,?,?)",
        (person_id, version, _dumps(new_profile), now),
    )
    con.commit()
    return get_profile(con, person_id)


def update_profile_field(con: sqlite3.Connection, person_id: str, path: str, value: Any) -> Dict[str, Any]:
    cur = get_profile(con, person_id)["profile"]
    _set_path(cur, path, value)
    return update_profile_json(con, person_id, cur)


# -----------------------------------------------------------------------------
# Relationships / Timeline / Media
# -----------------------------------------------------------------------------

def add_relationship(
    con: sqlite3.Connection,
    person_id: str,
    related_person_id: str,
    relationship_type: str,
    notes: Optional[str] = None,
) -> int:
    now = _utc_now()
    cur = con.execute(
        """INSERT INTO relationships(person_id,related_person_id,relationship_type,notes,created_at)
           VALUES (?,?,?,?,?)""",
        (person_id, related_person_id, relationship_type, notes, now),
    )
    con.commit()
    return int(cur.lastrowid)


def add_timeline_event(
    con: sqlite3.Connection,
    person_id: str,
    event_date: str,
    event_title: str,
    event_description: Optional[str] = None,
    location_name: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> int:
    now = _utc_now()
    cur = con.execute(
        """INSERT INTO timeline_events(person_id,event_date,event_title,event_description,location_name,lat,lon,created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (person_id, event_date, event_title, event_description, location_name, lat, lon, now),
    )
    con.commit()
    return int(cur.lastrowid)


def add_media(
    con: sqlite3.Connection,
    person_id: str,
    file_path: str,
    mime_type: Optional[str] = None,
    sha256: Optional[str] = None,
    description: Optional[str] = None,
    taken_at: Optional[str] = None,
    location_name: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    exif: Optional[Dict[str, Any]] = None,
    event_id: Optional[int] = None,
) -> int:
    now = _utc_now()
    cur = con.execute(
        """INSERT INTO media(person_id,event_id,file_path,mime_type,sha256,description,taken_at,location_name,lat,lon,exif_json,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            person_id,
            event_id,
            file_path,
            mime_type,
            sha256,
            description,
            taken_at,
            location_name,
            lat,
            lon,
            _dumps(exif) if exif else None,
            now,
        ),
    )
    con.commit()
    return int(cur.lastrowid)


# -----------------------------------------------------------------------------
# Sessions + Answers
# -----------------------------------------------------------------------------

def start_session(
    con: sqlite3.Connection,
    person_id: str,
    user_id: Optional[str] = None,
    title: Optional[str] = None,
) -> str:
    session_id = _uuid()
    now = _utc_now()
    con.execute(
        """INSERT INTO sessions(session_id,person_id,user_id,created_at,updated_at,title,active_question_id)
           VALUES (?,?,?,?,?,?,NULL)""",
        (session_id, person_id, user_id, now, now, title),
    )
    con.commit()
    return session_id


def set_session_active_question(con: sqlite3.Connection, session_id: str, question_id: str) -> None:
    now = _utc_now()
    con.execute(
        "UPDATE sessions SET active_question_id=?, updated_at=? WHERE session_id=?",
        (question_id, now, session_id),
    )
    con.commit()


def get_session(con: sqlite3.Connection, session_id: str) -> Optional[Dict[str, Any]]:
    row = con.execute("SELECT * FROM sessions WHERE session_id=?", (session_id,)).fetchone()
    return dict(row) if row else None


def list_sessions(con: sqlite3.Connection, person_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    if person_id:
        rows = con.execute(
            "SELECT * FROM sessions WHERE person_id=? ORDER BY updated_at DESC LIMIT ?",
            (person_id, limit),
        ).fetchall()
    else:
        rows = con.execute("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]


def add_answer(
    con: sqlite3.Connection,
    session_id: str,
    person_id: str,
    question_id: str,
    answer_text: str,
) -> int:
    now = _utc_now()
    cur = con.execute(
        """INSERT INTO answers(session_id,person_id,question_id,answer_text,created_at)
           VALUES (?,?,?,?,?)""",
        (session_id, person_id, question_id, answer_text, now),
    )
    con.execute("UPDATE sessions SET updated_at=? WHERE session_id=?", (now, session_id))
    con.commit()
    return int(cur.lastrowid)


def list_answers(con: sqlite3.Connection, session_id: str) -> List[Dict[str, Any]]:
    rows = con.execute(
        "SELECT * FROM answers WHERE session_id=? ORDER BY answer_id ASC", (session_id,)
    ).fetchall()
    return [dict(r) for r in rows]


# -----------------------------------------------------------------------------
# Interview navigation (Auto-Next driver)
# -----------------------------------------------------------------------------

def _ordered_questions(con: sqlite3.Connection) -> List[sqlite3.Row]:
    return con.execute(
        """SELECT q.*, s.sort_order AS section_sort
           FROM interview_questions q
           JOIN interview_sections s ON s.section_id=q.section_id
           ORDER BY s.sort_order ASC, q.sort_order ASC"""
    ).fetchall()


def get_question(con: sqlite3.Connection, question_id: str) -> Optional[Dict[str, Any]]:
    row = con.execute("SELECT * FROM interview_questions WHERE question_id=?", (question_id,)).fetchone()
    return dict(row) if row else None


def get_next_question(con: sqlite3.Connection, session_id: str) -> Optional[Dict[str, Any]]:
    sess = get_session(con, session_id)
    if not sess:
        return None

    answered = {
        r["question_id"]
        for r in con.execute(
            "SELECT question_id FROM answers WHERE session_id=?", (session_id,)
        ).fetchall()
    }

    for q in _ordered_questions(con):
        if q["question_id"] not in answered:
            return {
                "question_id": q["question_id"],
                "section_id": q["section_id"],
                "prompt": q["prompt"],
                "kind": q["kind"],
                "required": bool(q["required"]),
                "profile_path": q["profile_path"],
            }
    return None


def get_progress(con: sqlite3.Connection, session_id: str) -> Dict[str, Any]:
    total = con.execute("SELECT COUNT(1) AS n FROM interview_questions").fetchone()["n"]
    done = con.execute(
        "SELECT COUNT(DISTINCT question_id) AS n FROM answers WHERE session_id=?",
        (session_id,),
    ).fetchone()["n"]
    return {
        "answered": int(done),
        "total": int(total),
        "pct": float(done) / float(total) if total else 0.0,
    }

# -----------------------------------------------------------------------------
# Maintenance helpers
# -----------------------------------------------------------------------------

def delete_session(con: sqlite3.Connection, session_id: str) -> None:
    con.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    con.commit()


def ingest_basic_info_document(
    con: sqlite3.Connection,
    *,
    person_id: str,
    document: Dict[str, Any],
    merge: bool = False,
) -> Dict[str, Any]:
    """Store the entire basic-info.html document as the person's profile JSON.

    If merge=True, performs a deep merge (dicts merged recursively; other values
    replaced).
    """

    def deep_merge(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(a)
        for k, v in b.items():
            if k in out and isinstance(out[k], dict) and isinstance(v, dict):
                out[k] = deep_merge(out[k], v)
            else:
                out[k] = v
        return out

    existing = get_profile(con, person_id)
    if existing and merge:
        cur_json = json.loads(existing.get("profile_json") or "{}")
        new_json = deep_merge(cur_json, document)
    else:
        new_json = document

    update_profile_json(con, person_id=person_id, profile_json=new_json)
    return {"person_id": person_id, "profile_json": new_json}


def list_timeline_events(con: sqlite3.Connection, person_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    rows = con.execute(
        """
        SELECT id, person_id, event_date, event_title, event_description,
               location_name, lat, lon, created_at
        FROM timeline_events
        WHERE person_id = ?
        ORDER BY event_date IS NULL, event_date ASC, id ASC
        LIMIT ?
        """,
        (person_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def list_media(con: sqlite3.Connection, person_id: str, limit: int = 200) -> List[Dict[str, Any]]:
    rows = con.execute(
        """
        SELECT id, person_id, timeline_event_id, file_path, file_name, mime_type,
               sha256, size_bytes, description, taken_at, location_name, lat, lon,
               exif_json, created_at
        FROM media
        WHERE person_id = ?
        ORDER BY taken_at IS NULL, taken_at ASC, id ASC
        LIMIT ?
        """,
        (person_id, limit),
    ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["exif"] = json.loads(d["exif_json"]) if d.get("exif_json") else None
        out.append(d)
    return out

