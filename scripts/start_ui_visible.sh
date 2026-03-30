#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Lorevox UI visible startup ===\n'
printf 'Repo: %s\n' "$ROOT_DIR"
printf 'Log:  %s\n\n' "$LOG_DIR/ui.log"

start_named_process "Lorevox UI" "$UI_CMD" "$UI_PID_FILE" "$LOG_DIR/ui.log"

printf 'Waiting for UI health...\n'
if wait_for_health "Lorevox UI" ui_up 30; then
  printf 'UI health check passed.\n'
else
  printf 'UI health check FAILED.\n'
fi

# Wait for API + LLM to be ready before opening browser,
# so Lori's greeting doesn't fire into a dead backend.
printf '\nWaiting for API to be ready before opening browser...\n'
_llm_ready=0
for _i in $(seq 1 180); do
  if api_up; then
    # API is healthy — try a quick warmup check
    if python3 "$ROOT_DIR/scripts/warm_llm.py" >/dev/null 2>&1; then
      _llm_ready=1
      break
    fi
  fi
  # Show progress every 15 seconds
  if (( _i % 15 == 0 )); then
    printf '  Still waiting for LLM... (%ds)\n' "$_i"
  fi
  sleep 1
done

if [[ "$_llm_ready" -eq 1 ]]; then
  printf 'LLM is warm. Opening browser.\n'
else
  printf 'LLM not ready after 3 min — opening browser anyway.\n'
fi

open_ui_in_windows

printf '\nUI visible startup complete.\n'
printf 'UI: http://127.0.0.1:%s/ui/lori8.0.html\n' "$UI_PORT"
printf 'Tailing UI log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/ui.log"
tail -f "$LOG_DIR/ui.log"
