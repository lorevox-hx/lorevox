#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Restarting Hornelore API ===\n\n'

stop_named_process "Hornelore API" "$API_PID_FILE" "hornelore_run_gpu_8000|run_gpu_8000|uvicorn.*${API_PORT}"
sleep 1

start_named_process "Hornelore API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"

printf '\nWaiting for API health...\n'
if wait_for_health "Hornelore API" api_up 90; then
  printf 'API health check passed.\n'
else
  printf 'API health check FAILED.\n'
fi

if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf '\nRe-warming LLM...\n'
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

printf '\n=== API restart complete ===\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'Tailing API log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/api.log"
tail -f "$LOG_DIR/api.log"
