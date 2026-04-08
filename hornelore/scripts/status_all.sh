#!/usr/bin/env bash
# scripts/status_all.sh — Hornelore 1.0
# Prints process state and health for all three Hornelore services.
#
# Usage:
#   bash scripts/status_all.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

print_status() {
  local name="$1" pid_file="$2" check_fn="$3"
  local pid=""
  if [[ -f "$pid_file" ]]; then pid="$(read_pid "$pid_file" || true)"; fi
  local proc_state="stopped"
  if pid_is_running "$pid"; then proc_state="running (pid $pid)"; fi
  local health="down"
  if "$check_fn"; then health="healthy"; fi
  printf '%-14s  %-18s  %s\n' "$name" "$proc_state" "$health"
}

printf '%-14s  %-18s  %s\n' "Service" "Process" "Health"
printf '%-14s  %-18s  %s\n' "--------------" "------------------" "--------"
print_status "Hornelore API" "$API_PID_FILE" api_up
print_status "Hornelore TTS" "$TTS_PID_FILE" tts_up
print_status "Hornelore UI"  "$UI_PID_FILE"  ui_up
printf '\nLogs: %s\n' "$LOG_DIR"
