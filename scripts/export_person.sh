#!/usr/bin/env bash
# export_person.sh — Export one narrator's canonical state to a readable JSON bundle.
#
# Usage:
#   bash scripts/export_person.sh                          # list narrators
#   bash scripts/export_person.sh <person_id>              # export by ID
#   bash scripts/export_person.sh <person_id> "label"      # export with label
#
# Creates:  $DATA_DIR/exports/people/YYYY-MM-DD_displayname[_label]/
#
# Export is READ-ONLY — it never mutates live data.
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

if ! command -v sqlite3 >/dev/null 2>&1; then
  printf 'ERROR: sqlite3 is required but not found.\n' >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf 'ERROR: python3 is required but not found.\n' >&2
  exit 1
fi

# ── No argument → list narrators ─────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  printf 'Available narrators:\n\n'
  # Handle both old schema (no is_deleted) and new schema
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
  printf '\nUsage: bash scripts/export_person.sh <person_id> [label]\n'
  exit 0
fi

PERSON_ID="$1"
LABEL="${2:-}"

# ── Verify person exists ─────────────────────────────────────────────────────
DISPLAY_NAME="$(python3 -c "
import sqlite3
conn = sqlite3.connect('$DB_FILE')
cols = [r[1] for r in conn.execute('PRAGMA table_info(people)').fetchall()]
where = 'id = ? AND is_deleted = 0' if 'is_deleted' in cols else 'id = ?'
r = conn.execute(f'SELECT display_name FROM people WHERE {where}', ['$PERSON_ID']).fetchone()
print(r[0] if r else '')
")"
if [[ -z "$DISPLAY_NAME" ]]; then
  printf 'ERROR: No active narrator found with id: %s\n' "$PERSON_ID" >&2
  exit 1
fi

# ── Build export folder ──────────────────────────────────────────────────────
SAFE_NAME="$(echo "$DISPLAY_NAME" | tr ' ' '_' | tr -cd '[:alnum:]_-')"
TIMESTAMP="$(date +%Y-%m-%d_%H%M)"
if [[ -n "$LABEL" ]]; then
  EXPORT_NAME="${TIMESTAMP}_${SAFE_NAME}_${LABEL}"
else
  EXPORT_NAME="${TIMESTAMP}_${SAFE_NAME}"
fi

EXPORT_BASE="$DATA_DIR/exports/people"
EXPORT_DIR="$EXPORT_BASE/$EXPORT_NAME"
mkdir -p "$EXPORT_DIR"

printf 'Exporting: %s (%s)\n' "$DISPLAY_NAME" "$PERSON_ID"
printf '  Destination: %s\n\n' "$EXPORT_DIR"

# ── Export using Python for proper JSON formatting ───────────────────────────
python3 - "$DB_FILE" "$PERSON_ID" "$EXPORT_DIR" "$DISPLAY_NAME" << 'PYEOF'
import sys, json, sqlite3, os
from datetime import datetime

db_path = sys.argv[1]
person_id = sys.argv[2]
export_dir = sys.argv[3]
display_name = sys.argv[4]

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

tables_exist = set(r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())

def export_table(table, where, filename, label):
    """Export rows as a JSON array."""
    if table not in tables_exist:
        with open(os.path.join(export_dir, filename), 'w') as f:
            json.dump([], f)
        print(f"  {label}: table not in schema -> {filename} (empty)")
        return 0
    rows = conn.execute(f"SELECT * FROM {table} WHERE {where}", [person_id]).fetchall()
    data = [dict(r) for r in rows]
    path = os.path.join(export_dir, filename)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  {label}: {len(data)} rows -> {filename}")
    return len(data)

def export_single(table, where, filename, label):
    """Export a single row as a JSON object."""
    if table not in tables_exist:
        with open(os.path.join(export_dir, filename), 'w') as f:
            json.dump(None, f)
        print(f"  {label}: table not in schema -> {filename} (null)")
        return None
    row = conn.execute(f"SELECT * FROM {table} WHERE {where}", [person_id]).fetchone()
    data = dict(row) if row else None
    path = os.path.join(export_dir, filename)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    status = "found" if data else "empty"
    print(f"  {label}: {status} -> {filename}")
    return data

counts = {}

# Core identity
person = conn.execute("SELECT * FROM people WHERE id = ?", [person_id]).fetchone()
person_data = dict(person) if person else {}
with open(os.path.join(export_dir, 'person.json'), 'w') as f:
    json.dump(person_data, f, indent=2, default=str)
print(f"  Person: {display_name} -> person.json")

# Profile
export_single('profiles', 'person_id = ?', 'profile.json', 'Profile')

# Questionnaire
export_single('bio_builder_questionnaires', 'person_id = ?', 'questionnaire.json', 'Questionnaire')

# Projection
export_single('interview_projections', 'person_id = ?', 'projection.json', 'Projection')

# Facts
counts['facts'] = export_table('facts', 'person_id = ?', 'facts.json', 'Facts')

# Timeline events
counts['timeline'] = export_table('timeline_events', 'person_id = ?', 'timeline_events.json', 'Timeline events')

# Life phases
counts['phases'] = export_table('life_phases', 'person_id = ?', 'life_phases.json', 'Life phases')

# Interview sessions
counts['sessions'] = export_table('interview_sessions', 'person_id = ?', 'interview_sessions.json', 'Interview sessions')

# Interview answers
counts['answers'] = export_table('interview_answers', 'person_id = ?', 'interview_answers.json', 'Interview answers')

# Media metadata
counts['media'] = export_table('media', 'person_id = ?', 'media.json', 'Media metadata')

# Media attachments
counts['attachments'] = export_table('media_attachments', 'person_id = ?', 'media_attachments.json', 'Media attachments')

# Identity change log
counts['identity_changes'] = export_table('identity_change_log', 'person_id = ?', 'identity_change_log.json', 'Identity changes')

# Section summaries (via session)
session_ids = conn.execute("SELECT id FROM interview_sessions WHERE person_id = ?", [person_id]).fetchall()
if session_ids:
    sids = ','.join(f"'{r['id']}'" for r in session_ids)
    rows = conn.execute(f"SELECT * FROM section_summaries WHERE session_id IN ({sids})").fetchall()
    data = [dict(r) for r in rows]
else:
    data = []
with open(os.path.join(export_dir, 'section_summaries.json'), 'w') as f:
    json.dump(data, f, indent=2, default=str)
counts['summaries'] = len(data)
print(f"  Section summaries: {len(data)} rows -> section_summaries.json")

# Write export manifest
manifest = {
    "export_name": os.path.basename(export_dir),
    "person_id": person_id,
    "display_name": display_name,
    "exported_at": datetime.now().isoformat(),
    "source_db": db_path,
    "row_counts": counts,
}
with open(os.path.join(export_dir, '_export_manifest.json'), 'w') as f:
    json.dump(manifest, f, indent=2, default=str)

conn.close()
print(f"\nExport complete: {sum(counts.values())} total rows across {len(counts)} tables.")
PYEOF

# ── Copy media files if they exist ───────────────────────────────────────────
MEDIA_SRC="$DATA_DIR/media/$PERSON_ID"
if [[ -d "$MEDIA_SRC" ]]; then
  MEDIA_COUNT="$(find "$MEDIA_SRC" -type f | wc -l)"
  if [[ "$MEDIA_COUNT" -gt 0 ]]; then
    printf '\n  Copying %d media files...\n' "$MEDIA_COUNT"
    mkdir -p "$EXPORT_DIR/media"
    cp -a "$MEDIA_SRC"/* "$EXPORT_DIR/media/"
    printf '  Media files: %d -> media/\n' "$MEDIA_COUNT"
  fi
fi

EXPORT_SIZE="$(du -sh "$EXPORT_DIR" 2>/dev/null | cut -f1)"
printf '\nExport saved: %s (%s)\n' "$EXPORT_DIR" "$EXPORT_SIZE"
