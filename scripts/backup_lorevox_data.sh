#!/usr/bin/env bash
# backup_lorevox_data.sh — Create a dated full snapshot of lorevox_data.
#
# Usage:
#   bash scripts/backup_lorevox_data.sh                      # auto-dated
#   bash scripts/backup_lorevox_data.sh "before-kent-edit"   # with label
#
# Creates:  $DATA_DIR/backups/YYYY-MM-DD_HHMM[_label]/
#
# Behaviour:
#   - Copies the entire live data root (db, media, voices, etc.)
#   - Excludes the backups/ and exports/ directories themselves
#   - WAL-checkpoints the SQLite DB before copy for consistency
#   - Reports source path, destination path, and size
#
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# ── Resolve DATA_DIR ─────────────────────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi
DATA_DIR="${DATA_DIR:-/mnt/c/lorevox_data}"

if [[ ! -d "$DATA_DIR" ]]; then
  printf 'ERROR: DATA_DIR does not exist: %s\n' "$DATA_DIR" >&2
  exit 1
fi

# ── Build snapshot name ──────────────────────────────────────────────────────
LABEL="${1:-}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M)"
if [[ -n "$LABEL" ]]; then
  SNAPSHOT_NAME="${TIMESTAMP}_${LABEL}"
else
  SNAPSHOT_NAME="${TIMESTAMP}"
fi

BACKUP_DIR="$DATA_DIR/backups"
SNAPSHOT_DIR="$BACKUP_DIR/$SNAPSHOT_NAME"

if [[ -d "$SNAPSHOT_DIR" ]]; then
  printf 'ERROR: Snapshot already exists: %s\n' "$SNAPSHOT_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ── WAL checkpoint (if DB exists and sqlite3 is available) ───────────────────
DB_FILE="$DATA_DIR/db/lorevox.sqlite3"
if [[ -f "$DB_FILE" ]] && command -v sqlite3 >/dev/null 2>&1; then
  printf 'Checkpointing SQLite WAL...\n'
  sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
fi

# ── Copy data ────────────────────────────────────────────────────────────────
printf 'Creating snapshot: %s\n' "$SNAPSHOT_DIR"
printf '  Source: %s\n' "$DATA_DIR"

mkdir -p "$SNAPSHOT_DIR"

# Copy everything except backups/ and exports/ (to avoid recursive backup)
for item in "$DATA_DIR"/*; do
  base="$(basename "$item")"
  case "$base" in
    backups|exports) continue ;;
    *) cp -a "$item" "$SNAPSHOT_DIR/" ;;
  esac
done

# ── Write manifest ───────────────────────────────────────────────────────────
cat > "$SNAPSHOT_DIR/_snapshot_manifest.json" << MANIFEST
{
  "snapshot_name": "$SNAPSHOT_NAME",
  "source_dir": "$DATA_DIR",
  "created_at": "$(date -Iseconds)",
  "label": "$LABEL",
  "hostname": "$(hostname 2>/dev/null || echo 'unknown')"
}
MANIFEST

# ── Report ───────────────────────────────────────────────────────────────────
SNAP_SIZE="$(du -sh "$SNAPSHOT_DIR" 2>/dev/null | cut -f1)"
printf '\nSnapshot complete.\n'
printf '  Location:  %s\n' "$SNAPSHOT_DIR"
printf '  Size:      %s\n' "$SNAP_SIZE"

# Confirm DB file is in the snapshot
if [[ -f "$SNAPSHOT_DIR/db/lorevox.sqlite3" ]]; then
  DB_SIZE="$(du -sh "$SNAPSHOT_DIR/db/lorevox.sqlite3" | cut -f1)"
  printf '  DB file:   %s (%s)\n' "db/lorevox.sqlite3" "$DB_SIZE"
else
  printf '  WARNING: No DB file found in snapshot.\n'
fi

printf '\nTo restore from this snapshot:\n'
printf '  bash scripts/restore_lorevox_data.sh "%s"\n' "$SNAPSHOT_NAME"
