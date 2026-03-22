#!/usr/bin/env python3
"""
scripts/inspect_db.py — Lorevox DB inspector (v7.4D)

Prints a human-readable summary of the Lorevox SQLite database:
  - DB path and file size
  - All people rows
  - Profile save timestamps
  - Timeline event count per person
  - Session/turn counts
  - Last 5 turns for the most recent session

Usage:
    python3 scripts/inspect_db.py
    DATA_DIR=/mnt/c/lorevox_data python3 scripts/inspect_db.py

Acceptance criteria (Phase 0):
  - Create a person → row appears here
  - Save profile → updated_at changes here
  - Restart backend → data still present here
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from datetime import datetime

# ── Locate DB ───────────────────────────────────────────────────────────────
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_DIR   = DATA_DIR / "db"
DB_NAME  = os.getenv("DB_NAME", "lorevox.sqlite3").strip() or "lorevox.sqlite3"
DB_PATH  = DB_DIR / DB_NAME

DIVIDER  = "─" * 64
HDIVIDER = "═" * 64


def _fmt_ts(ts: str | None) -> str:
    if not ts:
        return "(none)"
    try:
        dt = datetime.fromisoformat(ts)
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        return ts


def _short(text: str, n: int = 80) -> str:
    if not text:
        return "(empty)"
    text = text.replace("\n", " ")
    return text if len(text) <= n else text[:n - 1] + "…"


def main() -> None:
    print()
    print(HDIVIDER)
    print("  Lorevox DB Inspector — v7.4D")
    print(HDIVIDER)
    print(f"  Path : {DB_PATH}")

    if not DB_PATH.exists():
        print(f"\n  ✗  DATABASE FILE NOT FOUND at {DB_PATH}")
        print(f"     DATA_DIR={DATA_DIR!s}")
        print("     Has the backend been started at least once?")
        print()
        sys.exit(1)

    size_kb = DB_PATH.stat().st_size / 1024
    print(f"  Size : {size_kb:.1f} KB")
    print()

    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row

    # ── People ────────────────────────────────────────────────────────────────
    print(DIVIDER)
    print("  PEOPLE")
    print(DIVIDER)
    people = con.execute(
        "SELECT id,display_name,date_of_birth,place_of_birth,created_at,updated_at FROM people ORDER BY created_at;"
    ).fetchall()

    if not people:
        print("  (no people in DB)")
    else:
        for p in people:
            print(f"  id       : {p['id']}")
            print(f"  name     : {p['display_name']}")
            print(f"  DOB      : {p['date_of_birth'] or '(not set)'}")
            print(f"  birthplace: {p['place_of_birth'] or '(not set)'}")
            print(f"  created  : {_fmt_ts(p['created_at'])}")
            print(f"  updated  : {_fmt_ts(p['updated_at'])}")

            # Profile
            prof_row = con.execute(
                "SELECT profile_json, updated_at FROM profiles WHERE person_id=?;",
                (p["id"],),
            ).fetchone()
            if prof_row:
                try:
                    prof = json.loads(prof_row["profile_json"] or "{}")
                    keys = list(prof.keys()) if prof else []
                    print(f"  profile  : {len(keys)} top-level keys: {keys}")
                except Exception:
                    print("  profile  : (parse error)")
                print(f"  prof_saved: {_fmt_ts(prof_row['updated_at'])}")
            else:
                print("  profile  : ✗ NO PROFILE ROW")

            # Timeline events
            evt_count = con.execute(
                "SELECT COUNT(*) FROM timeline_events WHERE person_id=?;", (p["id"],)
            ).fetchone()[0]
            print(f"  events   : {evt_count} timeline event(s)")
            print()

    # ── Sessions ──────────────────────────────────────────────────────────────
    print(DIVIDER)
    print("  SESSIONS")
    print(DIVIDER)
    sessions = con.execute(
        "SELECT conv_id,title,updated_at FROM sessions ORDER BY updated_at DESC LIMIT 10;"
    ).fetchall()
    if not sessions:
        print("  (no sessions in DB)")
    else:
        for s in sessions:
            turn_count = con.execute(
                "SELECT COUNT(*) FROM turns WHERE conv_id=?;", (s["conv_id"],)
            ).fetchone()[0]
            print(f"  {s['conv_id'][:36]}  |  {turn_count:3d} turns  |  {_fmt_ts(s['updated_at'])}")
        print()

        # Last 5 turns of most recent session
        latest = sessions[0]
        print(DIVIDER)
        print(f"  LAST 5 TURNS — session {latest['conv_id'][:36]}")
        print(DIVIDER)
        turns = con.execute(
            "SELECT role,content,ts FROM turns WHERE conv_id=? ORDER BY ts DESC LIMIT 5;",
            (latest["conv_id"],),
        ).fetchall()
        for t in reversed(turns):
            label = "You " if t["role"] == "user" else "Lori"
            print(f"  [{label}]  {_short(t['content'], 70)}")
        print()

    # ── RAG docs ──────────────────────────────────────────────────────────────
    try:
        rag_rows = con.execute("SELECT COUNT(*) FROM rag_docs;").fetchone()
        print(f"  RAG docs : {rag_rows[0]} document(s) stored")
    except sqlite3.OperationalError:
        pass  # rag_docs table may not exist in all versions

    # ── Timeline events (all) ─────────────────────────────────────────────────
    try:
        evt_total = con.execute("SELECT COUNT(*) FROM timeline_events;").fetchone()[0]
        print(f"  Timeline : {evt_total} total event(s) across all people")
    except sqlite3.OperationalError:
        pass

    print()
    print(HDIVIDER)
    print("  DB inspection complete.")
    print(HDIVIDER)
    print()

    con.close()


if __name__ == "__main__":
    main()
