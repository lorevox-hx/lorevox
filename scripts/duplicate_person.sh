#!/usr/bin/env bash
# duplicate_person.sh — Clone one narrator into a new narrator ID for safe experimentation.
#
# Usage:
#   bash scripts/duplicate_person.sh                     # list narrators
#   bash scripts/duplicate_person.sh <person_id>         # duplicate with auto-name
#   bash scripts/duplicate_person.sh <person_id> "Test"  # custom suffix
#
# Creates a new narrator with:
#   - New person_id (UUID)
#   - Display name: "Original Name (Test Copy)" or custom suffix
#   - Copied: profile, questionnaire, projection, facts, timeline, life phases
#   - NOT copied: interview sessions/answers, media, audit logs (these are session-specific)
#
# RULE: Duplicate creates a clearly separate narrator. No in-place clone.
#
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# ── Resolve DATA_DIR ─────────────────────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi
DATA_DIR="${DATA_DIR:-/mnt/c/lorevox_data}"
DB_FILE="$DATA_DIR/db/lorevox.sqlite3"

if [[ ! -f "$DB_FILE" ]]; then
  printf 'ERROR: Database not found: %s\n' "$DB_FILE" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf 'ERROR: python3 is required but not found.\n' >&2
  exit 1
fi

# ── No argument → list narrators ─────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  printf 'Available narrators:\n\n'
  python3 -c "
import sqlite3
conn = sqlite3.connect('$DB_FILE')
cols = [r[1] for r in conn.execute('PRAGMA table_info(people)').fetchall()]
where = 'WHERE is_deleted = 0' if 'is_deleted' in cols else ''
rows = conn.execute(f'SELECT id, display_name, date_of_birth, place_of_birth FROM people {where} ORDER BY display_name').fetchall()
print(f'{\"id\":<40} {\"display_name\":<25} {\"date_of_birth\":<15} {\"place_of_birth\"}')
print('-' * 100)
for r in rows:
    print(f'{r[0]:<40} {r[1]:<25} {r[2] or \"\":<15} {r[3] or \"\"}')
"
  printf '\nUsage: bash scripts/duplicate_person.sh <person_id> [suffix]\n'
  printf 'Default suffix: "Test Copy"\n'
  exit 0
fi

PERSON_ID="$1"
SUFFIX="${2:-Test Copy}"

# ── Run duplication in Python ────────────────────────────────────────────────
python3 - "$DB_FILE" "$PERSON_ID" "$SUFFIX" << 'PYEOF'
import sys, json, sqlite3, uuid, os
from datetime import datetime

db_path = sys.argv[1]
person_id = sys.argv[2]
suffix = sys.argv[3]

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = ON")

# ── Verify source exists ────────────────────────────────────────────────────
cols = [r[1] for r in conn.execute("PRAGMA table_info(people)").fetchall()]
tables_exist = set(r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
has_is_deleted = 'is_deleted' in cols
where = "id = ? AND is_deleted = 0" if has_is_deleted else "id = ?"
source = conn.execute(f"SELECT * FROM people WHERE {where}", [person_id]).fetchone()
if not source:
    print(f"ERROR: No active narrator found with id: {person_id}", file=sys.stderr)
    sys.exit(1)

source = dict(source)
new_id = str(uuid.uuid4())
new_name = f"{source['display_name']} ({suffix})"
now = datetime.now().isoformat()

print(f"Duplicating: {source['display_name']} -> {new_name}")
print(f"  Source ID: {person_id}")
print(f"  New ID:    {new_id}")
print()

# ── Create new person record ────────────────────────────────────────────────
if has_is_deleted:
    conn.execute("""
        INSERT INTO people (id, display_name, role, date_of_birth, place_of_birth,
                            created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    """, [new_id, new_name, source.get('role', 'narrator'),
          source.get('date_of_birth'), source.get('place_of_birth'), now, now])
else:
    conn.execute("""
        INSERT INTO people (id, display_name, role, date_of_birth, place_of_birth,
                            created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, [new_id, new_name, source.get('role', 'narrator'),
          source.get('date_of_birth'), source.get('place_of_birth'), now, now])
print(f"  Created person: {new_name}")

# ── Copy profile ────────────────────────────────────────────────────────────
profile = conn.execute(
    "SELECT profile_json, updated_at FROM profiles WHERE person_id = ?", [person_id]
).fetchone()
if profile:
    conn.execute(
        "INSERT INTO profiles (person_id, profile_json, updated_at) VALUES (?, ?, ?)",
        [new_id, profile['profile_json'], now]
    )
    print("  Copied profile")
else:
    print("  No profile to copy")

# ── Copy questionnaire (if table exists) ─────────────────────────────────────
if 'bio_builder_questionnaires' in tables_exist:
    qq = conn.execute(
        "SELECT questionnaire_json, source, version, updated_at FROM bio_builder_questionnaires WHERE person_id = ?",
        [person_id]
    ).fetchone()
    if qq:
        conn.execute(
            "INSERT INTO bio_builder_questionnaires (person_id, questionnaire_json, source, version, updated_at) VALUES (?, ?, ?, ?, ?)",
            [new_id, qq['questionnaire_json'], qq['source'], qq['version'], now]
        )
        print("  Copied questionnaire")
    else:
        print("  No questionnaire to copy")
else:
    print("  Questionnaire table not in schema (skipped)")

# ── Copy projection (if table exists) ────────────────────────────────────────
if 'interview_projections' in tables_exist:
    proj = conn.execute(
        "SELECT projection_json, source, version, updated_at FROM interview_projections WHERE person_id = ?",
        [person_id]
    ).fetchone()
    if proj:
        conn.execute(
            "INSERT INTO interview_projections (person_id, projection_json, source, version, updated_at) VALUES (?, ?, ?, ?, ?)",
            [new_id, proj['projection_json'], proj['source'], proj['version'], now]
        )
        print("  Copied projection")
    else:
        print("  No projection to copy")
else:
    print("  Projection table not in schema (skipped)")

# ── Copy facts ──────────────────────────────────────────────────────────────
facts = conn.execute("SELECT * FROM facts WHERE person_id = ?", [person_id]).fetchall()
for fact in facts:
    f = dict(fact)
    new_fact_id = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO facts (id, person_id, session_id, fact_type, statement, date_text,
                          date_normalized, confidence, status, inferred, source_turn_index,
                          created_at, updated_at, meta_json, meaning_tags_json,
                          narrative_role, experience, reflection)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [new_fact_id, new_id, f.get('session_id'), f.get('fact_type'), f.get('statement'),
          f.get('date_text'), f.get('date_normalized'), f.get('confidence'),
          f.get('status'), f.get('inferred'), f.get('source_turn_index'),
          now, now, f.get('meta_json'), f.get('meaning_tags_json'),
          f.get('narrative_role'), f.get('experience'), f.get('reflection')])
print(f"  Copied facts: {len(facts)} rows")

# ── Copy timeline events ────────────────────────────────────────────────────
events = conn.execute("SELECT * FROM timeline_events WHERE person_id = ?", [person_id]).fetchall()
for evt in events:
    e = dict(evt)
    new_evt_id = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO timeline_events (id, person_id, date, title, body, kind, created_at,
                                    meta_json, end_date, date_precision, is_approximate,
                                    confidence, status, source_session_ids, source_fact_ids,
                                    tags, display_date, phase_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [new_evt_id, new_id, e.get('date'), e.get('title'), e.get('body'), e.get('kind'),
          now, e.get('meta_json'), e.get('end_date'), e.get('date_precision'),
          e.get('is_approximate'), e.get('confidence'), e.get('status'),
          e.get('source_session_ids'), e.get('source_fact_ids'),
          e.get('tags'), e.get('display_date'), e.get('phase_id')])
print(f"  Copied timeline events: {len(events)} rows")

# ── Copy life phases ────────────────────────────────────────────────────────
phases = conn.execute("SELECT * FROM life_phases WHERE person_id = ?", [person_id]).fetchall()
for ph in phases:
    p = dict(ph)
    new_phase_id = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO life_phases (id, person_id, title, start_date, end_date,
                                date_precision, description, ord, created_at, meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [new_phase_id, new_id, p.get('title'), p.get('start_date'), p.get('end_date'),
          p.get('date_precision'), p.get('description'), p.get('ord'), now, p.get('meta_json')])
print(f"  Copied life phases: {len(phases)} rows")

# ── NOT copied (by design) ──────────────────────────────────────────────────
print()
print("  Not copied (session-specific data):")
print("    - interview_sessions / interview_answers")
print("    - media / media_attachments")
print("    - affect_events / segment_flags")
print("    - identity_change_log / narrator_delete_audit")

conn.commit()
conn.close()

print()
print(f"Duplication complete.")
print(f"  New narrator: {new_name}")
print(f"  New ID:       {new_id}")
print(f"\nThe copy is fully independent. Edits to it will not affect the original.")
PYEOF
