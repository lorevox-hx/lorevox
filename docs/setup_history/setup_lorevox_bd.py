#!/usr/bin/env python3
"""
setup_lorevox_bd.py

Bootstraps LoreVox SQLite on the fast Linux disk (DATA_DIR), and imports the interview plan.

Defaults:
  DATA_DIR:              ./data          (if not set)
  DB_NAME:               lorevox.sqlite3 (if not set)
  INTERVIEW_PLAN_PATH:   interview/interview_plan.json (inside DATA_DIR)

Result:
  <DATA_DIR>/db/<DB_NAME>
"""

from __future__ import annotations

import os
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict


# -----------------------------
# Paths / Config
# -----------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_NAME = os.getenv("DB_NAME", "lorevox.sqlite3").strip()
PLAN_REL_PATH = os.getenv("INTERVIEW_PLAN_PATH", "interview/interview_plan.json").strip()

if not DB_NAME.endswith(".sqlite3"):
    DB_NAME += ".sqlite3"

DB_DIR = DATA_DIR / "db"
DB_PATH = DB_DIR / DB_NAME
PLAN_PATH = (DATA_DIR / PLAN_REL_PATH).resolve()


# -----------------------------
# Schema (create-if-missing)
# -----------------------------
SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  ordering INTEGER NOT NULL,
  summary_instruction TEXT,
  embedding_tags TEXT,
  embedding_priority REAL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  label TEXT NOT NULL,
  ordering INTEGER NOT NULL,
  embedding_tags TEXT,
  embedding_priority REAL,
  FOREIGN KEY(section_id) REFERENCES sections(id)
);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  text TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5,
  keywords TEXT,
  FOREIGN KEY(question_id) REFERENCES questions(id)
);

-- Durable answers record (append-only)
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT,
  skipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_q ON answers(question_id);

-- Session state so the backend can resume without the client tracking indices
CREATE TABLE IF NOT EXISTS interview_sessions (
  session_id TEXT PRIMARY KEY,
  current_section_id TEXT,
  current_question_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_updated ON interview_sessions(updated_at);

-- Optional RAG store (can be rebuilt anytime)
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT,
  section_id TEXT,
  chunk_text TEXT NOT NULL,
  vector BLOB,
  tags TEXT,
  priority REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional: users registry (handy for multi-user laptop mode)
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def load_plan(plan_path: Path) -> Dict[str, Any]:
    if not plan_path.exists():
        raise FileNotFoundError(
            f"Interview plan not found at: {plan_path}\n"
            f"Tip: place it at {DATA_DIR / PLAN_REL_PATH} or set INTERVIEW_PLAN_PATH."
        )
    with plan_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    conn.commit()


def _column_exists(conn: sqlite3.Connection, table: str, col: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table});").fetchall()
    return any(r[1] == col for r in rows)


def migrate_user_id(conn: sqlite3.Connection) -> None:
    """
    Adds user_id columns to existing DBs (safe to re-run).
    SQLite supports ADD COLUMN; it does not support IF NOT EXISTS for columns.
    So we probe with PRAGMA table_info first.
    """
    changed = False

    if not _column_exists(conn, "interview_sessions", "user_id"):
        conn.execute("ALTER TABLE interview_sessions ADD COLUMN user_id TEXT;")
        changed = True

    if not _column_exists(conn, "answers", "user_id"):
        conn.execute("ALTER TABLE answers ADD COLUMN user_id TEXT;")
        changed = True

    # Indexes are safe to create repeatedly
    conn.execute("CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id);")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_answers_user ON answers(user_id);")

    if changed:
        conn.commit()


def _get_section_summary(sec: Dict[str, Any]) -> str:
    return (
        sec.get("end_of_section_summary")
        or sec.get("endofsection_summary")
        or sec.get("endofsection_summary".replace("_", ""))
        or ""
    )


def import_plan(conn: sqlite3.Connection, plan: Dict[str, Any]) -> None:
    cur = conn.cursor()
    sections = plan.get("sections", []) or []

    cur.execute("BEGIN;")
    try:
        for s_idx, sec in enumerate(sections):
            sec_id = sec["id"]
            sec_title = sec["title"]

            sec_emb = sec.get("embedding") or {}
            sec_tags = json.dumps(sec_emb.get("tags", []), ensure_ascii=False)
            sec_pri = float(sec_emb.get("priority", 0.5))

            cur.execute(
                """
                INSERT OR REPLACE INTO sections
                (id, title, ordering, summary_instruction, embedding_tags, embedding_priority)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    sec_id,
                    sec_title,
                    int(s_idx),
                    _get_section_summary(sec),
                    sec_tags,
                    sec_pri,
                ),
            )

            questions = sec.get("questions", []) or []
            for q_idx, q in enumerate(questions):
                q_id = q["id"]

                q_emb = q.get("embedding") or {}
                q_tags = json.dumps(q_emb.get("tags", []), ensure_ascii=False)
                q_pri = float(q_emb.get("priority", 0.5))

                cur.execute(
                    """
                    INSERT OR REPLACE INTO questions
                    (id, section_id, label, ordering, embedding_tags, embedding_priority)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        q_id,
                        sec_id,
                        q["label"],
                        int(q_idx),
                        q_tags,
                        q_pri,
                    ),
                )

                # Prevent duplicates on re-run
                cur.execute("DELETE FROM followups WHERE question_id = ?", (q_id,))

                for fu in (q.get("followups") or []):
                    cur.execute(
                        """
                        INSERT INTO followups (question_id, text, weight, keywords)
                        VALUES (?, ?, ?, NULL)
                        """,
                        (q_id, fu["text"], float(fu.get("weight", 0.5))),
                    )

                for fu in (q.get("conditional_followups") or []):
                    kws = json.dumps(fu.get("keywords", []), ensure_ascii=False)
                    cur.execute(
                        """
                        INSERT INTO followups (question_id, text, weight, keywords)
                        VALUES (?, ?, ?, ?)
                        """,
                        (q_id, fu["text"], float(fu.get("weight", 0.5)), kws),
                    )

        conn.commit()
    except Exception:
        conn.rollback()
        raise


def main() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "interview").mkdir(parents=True, exist_ok=True)

    plan = load_plan(PLAN_PATH)

    conn = sqlite3.connect(str(DB_PATH))
    try:
        init_db(conn)
        migrate_user_id(conn)   # <-- NEW: upgrade existing DBs safely
        import_plan(conn, plan)
    finally:
        conn.close()

    print("============================================================")
    print("LoreVox DB initialized and interview plan imported.")
    print(f"DATA_DIR:   {DATA_DIR}")
    print(f"DB_PATH:    {DB_PATH}")
    print(f"PLAN_PATH:  {PLAN_PATH}")
    print("============================================================")


if __name__ == "__main__":
    main()
