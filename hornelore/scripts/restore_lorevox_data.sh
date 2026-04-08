#!/usr/bin/env bash
# restore_lorevox_data.sh — Restore lorevox_data from a chosen snapshot.
#
# Usage:
#   bash scripts/restore_lorevox_data.sh                           # list available
#   bash scripts/restore_lorevox_data.sh "2026-04-04_1815_label"   # restore named
#
# Behaviour:
#   1. Verifies Hornelore services are stopped (refuses if running)
#   2. Moves current live data to a timestamped safety copy
#   3. Copies snapshot into live data location
#   4. Reports what was done
#
# RULE: Restore only happens with Hornelore stopped.
#
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

# ── Resolve DATA_DIR ─────────────────────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a; source "$ROOT_DIR/.env"; set +a
fi
DATA_DIR="${DATA_DIR:-/mnt/c/lorevox_data}"

BACKUP_DIR="$DATA_DIR/backups"

# ── No argument → list available snapshots ───────────────────────────────────
if [[ $# -eq 0 ]]; then
  printf 'Available snapshots in %s:\n\n' "$BACKUP_DIR"
  if [[ ! -d "$BACKUP_DIR" ]]; then
    printf '  (no backups directory found)\n'
    exit 0
  fi
  found=0
  for snap in "$BACKUP_DIR"/*/; do
    [[ -d "$snap" ]] || continue
    name="$(basename "$snap")"
    size="$(du -sh "$snap" 2>/dev/null | cut -f1)"
    has_db="no"
    [[ -f "$snap/db/lorevox.sqlite3" ]] && has_db="yes"
    printf '  %-40s  %6s  db=%s\n' "$name" "$size" "$has_db"
    found=$((found + 1))
  done
  if [[ "$found" -eq 0 ]]; then
    printf '  (no snapshots found)\n'
  fi
  printf '\nUsage: bash scripts/restore_lorevox_data.sh <snapshot-name>\n'
  exit 0
fi

SNAPSHOT_NAME="$1"
SNAPSHOT_DIR="$BACKUP_DIR/$SNAPSHOT_NAME"

if [[ ! -d "$SNAPSHOT_DIR" ]]; then
  printf 'ERROR: Snapshot not found: %s\n' "$SNAPSHOT_DIR" >&2
  exit 1
fi

# ── Safety check: Hornelore must be stopped ──────────────────────────────────
_services_running=0
if api_up 2>/dev/null; then _services_running=1; fi
if tts_up 2>/dev/null; then _services_running=1; fi
if ui_up 2>/dev/null; then _services_running=1; fi

if [[ "$_services_running" -eq 1 ]]; then
  printf 'ERROR: Hornelore services are still running.\n' >&2
  printf 'Stop all services first:\n' >&2
  printf '  bash scripts/stop_all.sh\n' >&2
  printf 'Then retry the restore.\n' >&2
  exit 1
fi

# ── Confirm ──────────────────────────────────────────────────────────────────
SNAP_SIZE="$(du -sh "$SNAPSHOT_DIR" 2>/dev/null | cut -f1)"
printf 'Restore plan:\n'
printf '  Snapshot:     %s (%s)\n' "$SNAPSHOT_NAME" "$SNAP_SIZE"
printf '  Destination:  %s\n' "$DATA_DIR"
printf '\nThis will:\n'
printf '  1. Move current live data to a safety copy\n'
printf '  2. Copy snapshot data into the live location\n'
printf '  3. Preserve backups/ and exports/ directories\n'
printf '\nProceed? [y/N] '
read -r confirm
if [[ "${confirm,,}" != "y" ]]; then
  printf 'Restore cancelled.\n'
  exit 0
fi

# ── Move current live data to safety copy ────────────────────────────────────
SAFETY_NAME="_pre_restore_$(date +%Y%m%d_%H%M%S)"
SAFETY_DIR="$BACKUP_DIR/$SAFETY_NAME"
printf '\nMoving current live data to safety copy: %s\n' "$SAFETY_NAME"
mkdir -p "$SAFETY_DIR"

for item in "$DATA_DIR"/*; do
  base="$(basename "$item")"
  case "$base" in
    backups|exports) continue ;;
    *)
      mv "$item" "$SAFETY_DIR/" 2>/dev/null || cp -a "$item" "$SAFETY_DIR/"
      ;;
  esac
done

# ── Copy snapshot into live location ─────────────────────────────────────────
printf 'Restoring from snapshot: %s\n' "$SNAPSHOT_NAME"

for item in "$SNAPSHOT_DIR"/*; do
  base="$(basename "$item")"
  # Skip manifest — it stays in the snapshot
  [[ "$base" == "_snapshot_manifest.json" ]] && continue
  cp -a "$item" "$DATA_DIR/"
done

# ── Report ───────────────────────────────────────────────────────────────────
printf '\nRestore complete.\n'
printf '  Live data restored from: %s\n' "$SNAPSHOT_NAME"
printf '  Safety copy at:          %s/%s\n' "$BACKUP_DIR" "$SAFETY_NAME"

if [[ -f "$DATA_DIR/db/lorevox.sqlite3" ]]; then
  DB_SIZE="$(du -sh "$DATA_DIR/db/lorevox.sqlite3" | cut -f1)"
  printf '  DB file:                 %s\n' "$DB_SIZE"
else
  printf '  WARNING: No DB file in restored data.\n'
fi

printf '\nYou can now restart Hornelore:\n'
printf '  bash scripts/start_all.sh\n'
