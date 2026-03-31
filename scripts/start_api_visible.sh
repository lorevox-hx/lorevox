#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Lorevox API visible startup ===\n'
printf 'Repo: %s\n' "$ROOT_DIR"
printf 'Log:  %s\n\n' "$LOG_DIR/api.log"

# Pre-flight: kill stale API processes and show VRAM
# NOTE: kill_stale_lorevox only targets API (port 8000) — it does NOT
# touch TTS or UI, so they survive an API restart without port conflicts.
kill_stale_lorevox
show_vram

start_named_process "Lorevox API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"

printf 'Waiting for API health...\n'
if wait_for_health "Lorevox API" api_up 90; then
  printf 'API health check passed.\n'
else
  printf 'API health check FAILED.\n'
fi

if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf '\nWarming LLM (first attempt)...\n'
  _rc=0
  python3 "$ROOT_DIR/scripts/warm_llm.py" || _rc=$?
  if [[ "$_rc" -eq 0 ]]; then
    printf 'LLM warm.\n'
  elif [[ "$_rc" -eq 2 ]]; then
    printf 'CUDA OOM on first try — VRAM freed, retrying in 10s...\n'
    sleep 10
    python3 "$ROOT_DIR/scripts/warm_llm.py" \
      && printf 'LLM warm on retry.\n' \
      || printf 'LLM warmup still failing — VRAM too tight for inference.\n'
  else
    printf 'LLM warmup skipped — model may still be loading. Chat will work once loading finishes.\n'
  fi
fi

printf '\nAPI visible startup complete.\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'Tailing API log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/api.log"
tail -f "$LOG_DIR/api.log"
