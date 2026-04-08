#!/usr/bin/env python3
"""
seed_interview_plan.py — Seeds interview_plan.json into the Hornelore SQLite DB.

Reads PLAN_PATH (default: ../interview_plan.json relative to this script) and
inserts all sections + questions into interview_sections / interview_questions
with plan_id = TARGET_PLAN_ID (default: "default").

Run from the repo root with the LLM venv active:

    source .venv-gpu/bin/activate
    export DATA_DIR=/mnt/c/lorevox_data
    python scripts/seed_interview_plan.py

Safe to re-run — uses INSERT OR REPLACE so existing rows are refreshed.
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ── Config ───────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent
REPO_DIR     = SCRIPT_DIR.parent
PLAN_PATH    = REPO_DIR / "interview_plan.json"

DATA_DIR     = Path(os.getenv("DATA_DIR", "/mnt/c/lorevox_data"))
DB_PATH      = DATA_DIR / "db" / os.getenv("DB_NAME", "lorevox.sqlite3")
TARGET_PLAN_ID = "default"

# ── Helpers ───────────────────────────────────────────────────────────────────
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    if not PLAN_PATH.exists():
        raise FileNotFoundError(f"Plan JSON not found: {PLAN_PATH}")
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"DB not found at {DB_PATH}\n"
            "Start the server at least once (it calls init_db on startup) then re-run."
        )

    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    sections = plan.get("sections", [])

    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON;")

    # Ensure the target plan row exists
    con.execute(
        "INSERT OR IGNORE INTO interview_plans(id, title, created_at) VALUES (?, ?, ?);",
        (TARGET_PLAN_ID, plan.get("title", "Default Plan"), now_iso()),
    )

    q_ord = 0  # global ordinal across all sections so get_next_question ORDER BY ord works
    for s_idx, sec in enumerate(sections):
        sec_id = sec["id"]
        con.execute(
            "INSERT OR REPLACE INTO interview_sections(id, plan_id, title, ord) VALUES (?, ?, ?, ?);",
            (sec_id, TARGET_PLAN_ID, sec.get("title", sec_id), s_idx),
        )
        for q in sec.get("questions", []):
            con.execute(
                """
                INSERT OR REPLACE INTO interview_questions
                    (id, plan_id, section_id, ord, prompt, kind, required, profile_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    q["id"],
                    TARGET_PLAN_ID,
                    sec_id,
                    q_ord,
                    q["prompt"],
                    q.get("kind", "text"),
                    1 if q.get("required") else 0,
                    q.get("profile_path"),
                ),
            )
            q_ord += 1

    con.commit()
    con.close()

    print(f"✓  Seeded {len(sections)} sections and {q_ord} questions into plan '{TARGET_PLAN_ID}'")
    print(f"   DB: {DB_PATH}")


if __name__ == "__main__":
    main()
