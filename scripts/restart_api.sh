#!/usr/bin/env bash
# scripts/restart_api.sh — Lorevox 7.4C
# Stops and restarts the backend API only. TTS and UI keep running.
# Use this after making changes to server code during a testing session.
#
# Usage:
#   bash scripts/restart_api.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf 'Reloading Lorevox API...\n'
stop_named_process "Lorevox API" "$API_PID_FILE" "run_gpu_8000.sh|uvicorn.*8000"

sleep 1

start_named_process "Lorevox API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"
wait_for_health "Lorevox API" api_up 90

# Re-warm the LLM so the first test interaction is fast
if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf 'Re-warming LLM...\n'
  python3 "$ROOT_DIR/scripts/warm_llm.py" \
    && printf 'LLM warm.\n' \
    || printf 'LLM warmup failed — model may still be loading.\n'
fi

printf '\nLorevox API reloaded and ready.\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'UI still at: http://127.0.0.1:%s/ui/lori8.0.html\n' "$UI_PORT"
