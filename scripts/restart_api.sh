#!/usr/bin/env bash
# scripts/restart_api.sh — Lorevox 8.0
# Shell-native API restart: stops the API, restarts it, runs health check
# and LLM warmup. For the visible Windows Terminal version, use
# reload_api.bat instead.
#
# Usage:
#   bash scripts/restart_api.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Restarting Lorevox API ===\n\n'

stop_named_process "Lorevox API" "$API_PID_FILE" "run_gpu_8000.sh|uvicorn.*8000"
sleep 1

start_named_process "Lorevox API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"

printf '\nWaiting for API health...\n'
wait_for_health "Lorevox API" api_up 90 || true

if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf '\nRe-warming LLM...\n'
  python3 "$ROOT_DIR/scripts/warm_llm.py" \
    && printf 'LLM warm.\n' \
    || printf 'LLM warmup failed.\n'
fi

printf '\n=== API restart complete ===\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
