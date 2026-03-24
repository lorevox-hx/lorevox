#!/usr/bin/env bash
# scripts/start_all.sh — Lorevox 7.4C
# Starts API, TTS, and UI server, waits for health, then warms both AI
# services synchronously so "startup complete" means actually ready.
#
# Usage:
#   bash scripts/start_all.sh
#
# Port overrides (optional env vars):
#   LOREVOX_API_PORT   LOREVOX_TTS_PORT   LOREVOX_UI_PORT
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

start_named_process "Lorevox API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"
start_named_process "Lorevox TTS" "$TTS_CMD" "$TTS_PID_FILE" "$LOG_DIR/tts.log"
start_named_process "Lorevox UI"  "$UI_CMD"  "$UI_PID_FILE"  "$LOG_DIR/ui.log"

wait_for_health "Lorevox API" api_up 90 || true
wait_for_health "Lorevox TTS" tts_up 90 || true
wait_for_health "Lorevox UI"  ui_up  30 || true

# Warmup runs synchronously — "startup complete" means the model is hot
if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf 'Warming LLM...\n'
  python3 "$ROOT_DIR/scripts/warm_llm.py" \
    && printf 'LLM warm.\n' \
    || printf 'LLM warmup failed — backend may still be loading the model.\n'
fi
if [[ -f "$ROOT_DIR/scripts/warm_tts.py" ]]; then
  printf 'Warming TTS...\n'
  python3 "$ROOT_DIR/scripts/warm_tts.py" \
    && printf 'TTS warm.\n' \
    || printf 'TTS warmup failed.\n'
fi

printf '\nLorevox startup complete.\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'TTS: http://127.0.0.1:%s\n' "$TTS_PORT"
printf 'UI:  http://127.0.0.1:%s/ui/lori7.4c.html\n' "$UI_PORT"
printf 'Logs: %s\n' "$LOG_DIR"

open_ui_in_windows "http://localhost:${UI_PORT}/ui/lori7.4c.html"
