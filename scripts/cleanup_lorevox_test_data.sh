#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# cleanup_lorevox_test_data.sh — Lorevox 8.0 Phase O
# Optional test-data cleanup for backend narrators/sessions created
# during automated or manual QA runs.
#
# SAFETY: This script ONLY removes data explicitly flagged as test
# data. It NEVER touches real family archive data by default.
#
# Usage:
#   bash scripts/cleanup_lorevox_test_data.sh --dry-run    # preview only
#   bash scripts/cleanup_lorevox_test_data.sh --confirm    # actually delete
#   bash scripts/cleanup_lorevox_test_data.sh --all-test   # remove all test PIDs
#
# Environment:
#   LOREVOX_API_PORT   API port (default: 8000)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_PORT="${LOREVOX_API_PORT:-8000}"
API_BASE="http://127.0.0.1:${API_PORT}"

DRY_RUN=true
ALL_TEST=false

# ── Parse args ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true;  shift ;;
    --confirm)   DRY_RUN=false; shift ;;
    --all-test)  ALL_TEST=true; DRY_RUN=false; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║ Lorevox Test Data Cleanup                      ║"
echo "╠═══════════════════════════════════════════════╣"
if $DRY_RUN; then
  echo "║ Mode: DRY RUN (no changes will be made)       ║"
else
  echo "║ Mode: LIVE — test data will be deleted         ║"
fi
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ── Safety gate ──────────────────────────────────────────────────
if ! $DRY_RUN; then
  echo "WARNING: This will delete test-only narrators and sessions."
  echo "Real family archive data is NOT affected."
  echo ""
  read -rp "Type YES to confirm: " CONFIRM
  if [[ "$CONFIRM" != "YES" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Check API is up ─────────────────────────────────────────────
if ! curl -sf "${API_BASE}/api/ping" >/dev/null 2>&1; then
  echo "ERROR: Lorevox API is not running at ${API_BASE}."
  echo "Start services first: bash scripts/start_all.sh"
  exit 1
fi

# ── List persons and identify test PIDs ──────────────────────────
# Test PIDs are identified by:
#   1. Name containing "[test]" or "[QA]" prefix
#   2. Person created within a test harness run (metadata flag)
#   3. If --all-test: any PID found in .runtime/test-pids.log
echo "Fetching person list from API..."
PERSONS_JSON=$(curl -sf "${API_BASE}/api/persons" 2>/dev/null || echo "[]")

if [[ "$PERSONS_JSON" == "[]" ]]; then
  echo "No persons found or API returned empty list."
  echo "Nothing to clean up."
  exit 0
fi

# Extract test-flagged PIDs (names starting with [test] or [QA])
TEST_PIDS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && TEST_PIDS+=("$line")
done < <(echo "$PERSONS_JSON" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    persons = data if isinstance(data, list) else data.get('persons', data.get('data', []))
    for p in persons:
        name = p.get('name', p.get('fullName', ''))
        pid = p.get('id', p.get('personId', ''))
        if name.startswith('[test]') or name.startswith('[QA]') or name.startswith('[qa]'):
            print(pid)
except:
    pass
" 2>/dev/null)

# Also include PIDs from test-pids.log if --all-test
if $ALL_TEST && [[ -f "$ROOT_DIR/.runtime/test-pids.log" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && TEST_PIDS+=("$pid")
  done < "$ROOT_DIR/.runtime/test-pids.log"
fi

# Deduplicate
TEST_PIDS=($(printf '%s\n' "${TEST_PIDS[@]}" | sort -u))

if [[ ${#TEST_PIDS[@]} -eq 0 ]]; then
  echo "No test-only narrators found."
  echo "Only narrators with names starting with [test] or [QA] are eligible."
  exit 0
fi

echo ""
echo "Found ${#TEST_PIDS[@]} test narrator(s) to clean up:"
for pid in "${TEST_PIDS[@]}"; do
  echo "  - $pid"
done
echo ""

# ── Delete test PIDs ─────────────────────────────────────────────
DELETED=0
FAILED=0

for pid in "${TEST_PIDS[@]}"; do
  if $DRY_RUN; then
    echo "[dry-run] Would delete: $pid"
  else
    echo "Deleting: $pid ..."
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X DELETE "${API_BASE}/api/persons/${pid}" 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "204" ]]; then
      echo "  Deleted."
      ((DELETED++))
    else
      echo "  Failed (HTTP $HTTP_CODE). May not exist or API does not support DELETE."
      ((FAILED++))
    fi
  fi
done

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
if $DRY_RUN; then
  echo "DRY RUN complete. ${#TEST_PIDS[@]} test narrator(s) would be removed."
  echo "Run with --confirm to actually delete."
else
  echo "Cleanup complete. Deleted: $DELETED, Failed: $FAILED"
fi
echo "═══════════════════════════════════════════════"
