#!/usr/bin/env python3
"""
setup_lorevox_db_vnext.py

Bootstraps LoreVox SQLite on fast Linux disk (DATA_DIR) and imports the interview plan.

Goals (vNext):
- Creates "sessions" + "turns" tables so the UI doesn't 500 on /api/sessions/list
- Creates interview tables (sections/questions/followups/answers/interview_sessions)
- Imports interview_plan.json that may use either:
    - v4.2 style: questions with "prompt", "kind", "required", "profile_path", "meta"
    - legacy style: questions with "label", "followups", "conditional_followups"
  (We normalize prompt/label so import never fails.)

Defaults:
  DATA_DIR:              ./data          (if not set)
  DB_NAME:               lorevox.sqlite3 (if not set)
  INTERVIEW_PLAN_PATH:   interview/interview_plan.json (inside DATA_DIR)

Result:
  <DATA_DIR>/db/<DB_NAME>
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# -----------------------------------------------------------------------------
# Ensure local 'code' package shadows stdlib 'code' module (same trick you used)
# -----------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[1]  # /mnt/c/lorevox
sys.path.insert(0, str(REPO_ROOT))


# -----------------------------------------------------------------------------
# Paths / Config
# -----------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_NAME = os.getenv("DB_NAME", "lorevox.sqlite3").strip()
PLAN_REL_PATH = os.getenv("INTERVIEW_PLAN_PATH", "interview/interview_plan.json").strip()

if not DB_NAME.endswith(".sqlite3"):
    DB_NAME += ".sqlite3"

DB_DIR = DATA_DIR / "db"
DB_PATH = DB_DIR / DB_NAME
PLAN_PATH = (DATA_DIR / PLAN_REL_PATH).resolve()


# -----------------------------------------------------------------------------
# Schema (create-if-missing)
# -----------------------------------------------------------------------------
SCHEMA_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

-- ----------------------------
-- Core chat sessions (UI expects this)
-- ----------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  meta_json TEXT,   -- optional JSON blob
  state_json TEXT   -- optional JSON blob
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);

CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,         -- "user" / "assistant" / "system"
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);

-- ----------------------------
-- Interview plan tables
-- ----------------------------
CREATE TABLE IF NOT EXISTS interview_plans (
  plan_id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  ordering INTEGER NOT NULL,
  summary_instruction TEXT,
  embedding_tags TEXT,
  embedding_priority REAL,
  FOREIGN KEY(plan_id) REFERENCES interview_plans(plan_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sections_plan ON sections(plan_id);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  prompt TEXT NOT NULL,     -- normalized main question text
  label TEXT,               -- original label if present
  kind TEXT,                -- "text" / "long_text" / "form_section" etc
  required INTEGER NOT NULL DEFAULT 0,
  profile_path TEXT,
  meta_json TEXT,
  ordering INTEGER NOT NULL,
  embedding_tags TEXT,
  embedding_priority REAL,
  FOREIGN KEY(plan_id) REFERENCES interview_plans(plan_id) ON DELETE CASCADE,
  FOREIGN KEY(section_id) REFERENCES sections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section_id);
CREATE INDEX IF NOT EXISTS idx_questions_plan ON questions(plan_id);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  text TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.5,
  keywords_json TEXT,
  FOREIGN KEY(plan_id) REFERENCES interview_plans(plan_id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_followups_q ON followups(question_id);

-- Durable answers record (append-only)
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  session_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT,
  skipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
CREATE INDEX IF NOT EXISTS idx_answers_q ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_user ON answers(user_id);

-- Interview session state so backend can resume
CREATE TABLE IF NOT EXISTS interview_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  plan_id TEXT,
  current_section_id TEXT,
  current_question_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_updated ON interview_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id);

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
            f"Put it here: {DATA_DIR / PLAN_REL_PATH}\n"
            f"or set INTERVIEW_PLAN_PATH."
        )
    with plan_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    conn.commit()


def _get_section_summary(sec: Dict[str, Any]) -> str:
    return (
        sec.get("end_of_section_summary")
        or sec.get("endofsection_summary")
        or sec.get("endofsectionsummary")
        or ""
    )


def _norm_prompt(q: Dict[str, Any]) -> str:
    # Accept either schema
    return str(q.get("prompt") or q.get("label") or "").strip()


def import_plan(conn: sqlite3.Connection, plan: Dict[str, Any]) -> None:
    plan_id = str(plan.get("id") or plan.get("plan_id") or "lorevox-plan").strip()
    title = str(plan.get("title") or "").strip()
    desc = str(plan.get("description") or "").strip()

    raw_json = json.dumps(plan, ensure_ascii=False)

    cur = conn.cursor()
    sections = plan.get("sections", []) or []

    cur.execute("BEGIN;")
    try:
        # Upsert plan
        cur.execute(
            """
            INSERT OR REPLACE INTO interview_plans(plan_id, title, description, raw_json)
            VALUES (?, ?, ?, ?)
            """,
            (plan_id, title, desc, raw_json),
        )

        # Clean old imported rows for this plan (simple + reliable)
        cur.execute("DELETE FROM followups WHERE plan_id = ?", (plan_id,))
        cur.execute("DELETE FROM questions WHERE plan_id = ?", (plan_id,))
        cur.execute("DELETE FROM sections WHERE plan_id = ?", (plan_id,))

        for s_idx, sec in enumerate(sections):
            sec_id = sec["id"]
            sec_title = sec.get("title") or sec_id

            sec_emb = sec.get("embedding") or {}
            sec_tags = json.dumps(sec_emb.get("tags", []), ensure_ascii=False)
            sec_pri = float(sec_emb.get("priority", 0.5))

            cur.execute(
                """
                INSERT INTO sections
                (id, plan_id, title, ordering, summary_instruction, embedding_tags, embedding_priority)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sec_id,
                    plan_id,
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

                prompt = _norm_prompt(q)
                if not prompt:
                    # Don’t crash import; give a readable placeholder
                    prompt = f"[missing prompt/label] ({sec_id}.{q_id})"

                q_emb = q.get("embedding") or {}
                q_tags = json.dumps(q_emb.get("tags", []), ensure_ascii=False)
                q_pri = float(q_emb.get("priority", 0.5))

                kind = q.get("kind")
                required = int(bool(q.get("required", False)))
                profile_path = q.get("profile_path")
                meta_json = json.dumps(q.get("meta") or {}, ensure_ascii=False) if q.get("meta") else None

                label = q.get("label")  # store if present

                cur.execute(
                    """
                    INSERT INTO questions
                    (id, plan_id, section_id, prompt, label, kind, required, profile_path, meta_json,
                     ordering, embedding_tags, embedding_priority)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        q_id,
                        plan_id,
                        sec_id,
                        prompt,
                        label,
                        kind,
                        required,
                        profile_path,
                        meta_json,
                        int(q_idx),
                        q_tags,
                        q_pri,
                    ),
                )

                # Followups (both schemas supported)
                for fu in (q.get("followups") or []):
                    txt = fu.get("text") or fu.get("prompt") or fu.get("label")
                    if not txt:
                        continue
                    cur.execute(
                        """
                        INSERT INTO followups (plan_id, question_id, text, weight, keywords_json)
                        VALUES (?, ?, ?, ?, NULL)
                        """,
                        (plan_id, q_id, str(txt), float(fu.get("weight", 0.5))),
                    )

                for fu in (q.get("conditional_followups") or []):
                    txt = fu.get("text") or fu.get("prompt") or fu.get("label")
                    if not txt:
                        continue
                    kws = json.dumps(fu.get("keywords", []), ensure_ascii=False)
                    cur.execute(
                        """
                        INSERT INTO followups (plan_id, question_id, text, weight, keywords_json)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (plan_id, q_id, str(txt), float(fu.get("weight", 0.5)), kws),
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
        import_plan(conn, plan)
    finally:
        conn.close()

    print("============================================================")
    print("LoreVox DB initialized and interview plan imported (vNext).")
    print(f"DATA_DIR:   {DATA_DIR}")
    print(f"DB_PATH:    {DB_PATH}")
    print(f"PLAN_PATH:  {PLAN_PATH}")
    print("============================================================")


if __name__ == "__main__":
    main()
