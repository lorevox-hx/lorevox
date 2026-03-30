#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Lorevox API visible restart ===\n'
printf 'Stopping API...\n'
stop_named_process "Lorevox API" "$API_PID_FILE" "run_gpu_8000.sh|uvicorn.*8000"

sleep 1

printf 'Starting API...\n'
start_named_process "Lorevox API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"

printf 'Waiting for API health...\n'
if wait_for_health "Lorevox API" api_up 90; then
  printf 'API health check passed.\n'
else
  printf 'API health check FAILED.\n'
fi

if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf '\nRe-warming LLM...\n'
  python3 "$ROOT_DIR/scripts/warm_llm.py" \
    && printf 'LLM warm.\n' \
    || printf 'LLM warmup failed — model may still be loading or chat backend may be failing.\n'
fi

printf '\nAPI restart complete.\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'Tailing API log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/api.log"
tail -f "$LOG_DIR/api.log"
