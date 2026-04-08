#!/usr/bin/env bash
# scripts/restart_api.sh — Hornelore 1.0
# Shell-native API restart: stops the API, restarts it, runs health check
# and LLM warmup. For the visible Windows Terminal version, use
# reload_api.bat instead.
#
# Usage:
#   bash scripts/restart_api.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Restarting Hornelore API ===\n\n'

stop_named_process "Hornelore API" "$API_PID_FILE" "hornelore_run_gpu_8000|run_gpu_8000|uvicorn.*${API_PORT}"
sleep 1

start_named_process "Hornelore API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"

printf '\nWaiting for API health...\n'
wait_for_health "Hornelore API" api_up 90 || true

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
