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

printf '\nUI visible startup complete.\n'
printf 'UI: http://127.0.0.1:%s/ui/lori8.0.html\n' "$UI_PORT"
printf 'Tailing UI log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/ui.log"
tail -f "$LOG_DIR/ui.log"
