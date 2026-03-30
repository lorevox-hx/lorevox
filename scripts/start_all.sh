#!/usr/bin/env bash
# scripts/start_all.sh — Lorevox 8.0
# Shell-native launcher: starts all three services, runs health checks
# and warmup, then prints status. For the visible Windows Terminal version,
# use start_lorevox.bat instead.
#
# Usage:
#   bash scripts/start_all.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Starting Lorevox stack ===\n\n'

# Pre-flight: kill zombies and show VRAM before we load anything
kill_stale_lorevox
show_vram

start_named_process "Lorevox API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"
start_named_process "Lorevox TTS" "$TTS_CMD" "$TTS_PID_FILE" "$LOG_DIR/tts.log"
start_named_process "Lorevox UI"  "$UI_CMD"  "$UI_PID_FILE"  "$LOG_DIR/ui.log"

printf '\n--- Health checks ---\n'
wait_for_health "Lorevox API" api_up 90 || true
wait_for_health "Lorevox TTS" tts_up 90 || true
wait_for_health "Lorevox UI"  ui_up  30 || true

if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf '\nWarming LLM...\n'
  _rc=0
  python3 "$ROOT_DIR/scripts/warm_llm.py" || _rc=$?
  if [[ "$_rc" -eq 0 ]]; then
    printf 'LLM warm.\n'
  elif [[ "$_rc" -eq 2 ]]; then
    printf 'CUDA OOM — retrying in 10s...\n'
    sleep 10
    python3 "$ROOT_DIR/scripts/warm_llm.py" \
      && printf 'LLM warm on retry.\n' \
      || printf 'LLM warmup still failing.\n'
  else
    printf 'LLM warmup failed.\n'
  fi
fi

if [[ -f "$ROOT_DIR/scripts/warm_tts.py" ]]; then
  printf 'Warming TTS...\n'
  python3 "$ROOT_DIR/scripts/warm_tts.py" \
    && printf 'TTS warm.\n' \
    || printf 'TTS warmup failed.\n'
fi

printf '\n=== Lorevox stack ready ===\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'TTS: http://127.0.0.1:%s\n' "$TTS_PORT"
printf 'UI:  http://127.0.0.1:%s/ui/lori8.0.html\n' "$UI_PORT"

open_ui_in_windows
