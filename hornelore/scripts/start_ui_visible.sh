#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Hornelore UI visible startup ===\n'
printf 'Repo: %s\n' "$ROOT_DIR"
printf 'Log:  %s\n\n' "$LOG_DIR/ui.log"

start_named_process "Hornelore UI" "$UI_CMD" "$UI_PID_FILE" "$LOG_DIR/ui.log"

printf 'Waiting for UI health...\n'
if wait_for_health "Hornelore UI" ui_up 30; then
  printf 'UI health check passed.\n'
else
  printf 'UI health check FAILED.\n'
fi

printf '\nWaiting for API to be ready before opening browser...\n'
_llm_ready=0
_oom_count=0
_max_oom=2
_check_interval=10
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
        printf '\n  CUDA OOM %d times — GPU cannot allocate inference memory.\n' "$_oom_count"
        printf '  Opening browser anyway — chat may work after other GPU processes finish.\n'
        break
      fi
      printf '  CUDA OOM (attempt %d/%d) — waiting %ds for VRAM to settle...\n' "$_oom_count" "$_max_oom" "$_check_interval"
    fi
  fi
  sleep "$_check_interval"
  _elapsed=$((_elapsed + _check_interval))
  printf '  Waiting for LLM... (%ds / %ds)\n' "$_elapsed" "$_max_wait"
done

if [[ "$_llm_ready" -eq 1 ]]; then
  printf 'LLM is warm. Opening browser.\n'
elif [[ "$_elapsed" -ge "$_max_wait" ]]; then
  printf 'LLM not ready after %ds — opening browser anyway.\n' "$_max_wait"
fi

open_ui_in_windows

printf '\nUI visible startup complete.\n'
printf 'UI: http://127.0.0.1:%s/ui/hornelore1.0.html\n' "$UI_PORT"
printf 'Tailing UI log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/ui.log"
tail -f "$LOG_DIR/ui.log"
