#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Hornelore API visible startup ===\n'
printf 'Repo: %s\n' "$ROOT_DIR"
printf 'Log:  %s\n\n' "$LOG_DIR/api.log"

kill_stale_hornelore
show_vram

start_named_process "Hornelore API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"

printf 'Waiting for API health...\n'
if wait_for_health "Hornelore API" api_up 90; then
  printf 'API health check passed.\n'
else
  printf 'API health check FAILED.\n'
fi

if [[ -f "$ROOT_DIR/scripts/warm_llm.py" ]]; then
  printf '\nWaiting for LLM model to become ready...\n'
  _llm_ready=0
  _oom_count=0
  _max_oom=2
  _check_interval=15
  _max_wait=300
  _elapsed=0

  while [[ "$_elapsed" -lt "$_max_wait" ]]; do
    if api_up; then
      _rc=0
      python3 "$ROOT_DIR/scripts/warm_llm.py" || _rc=$?
      if [[ "$_rc" -eq 0 ]]; then
        _llm_ready=1
        break
      elif [[ "$_rc" -eq 2 ]]; then
        _oom_count=$((_oom_count + 1))
        if [[ "$_oom_count" -ge "$_max_oom" ]]; then
          printf '\n  CUDA OOM %d times — VRAM too tight for inference.\n' "$_oom_count"
          break
        fi
        printf '  CUDA OOM (attempt %d/%d) — waiting %ds for VRAM...\n' "$_oom_count" "$_max_oom" "$_check_interval"
      else
        printf '  Model still loading... (%ds / %ds)\n' "$_elapsed" "$_max_wait"
      fi
    else
      printf '  API not yet healthy... (%ds / %ds)\n' "$_elapsed" "$_max_wait"
    fi
    sleep "$_check_interval"
    _elapsed=$((_elapsed + _check_interval))
  done

  if [[ "$_llm_ready" -eq 1 ]]; then
    printf 'LLM is warm and ready.\n'
  elif [[ "$_elapsed" -ge "$_max_wait" ]]; then
    printf 'LLM not ready after %ds — chat will work once model finishes loading.\n' "$_max_wait"
  fi
fi

printf '\nAPI visible startup complete.\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'Tailing API log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/api.log"
tail -f "$LOG_DIR/api.log"
