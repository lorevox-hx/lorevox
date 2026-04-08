#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Hornelore status ===\n\n'
bash "$ROOT_DIR/scripts/status_all.sh" || true

printf '\n=== Following logs ===\n'
printf 'API: %s\n' "$LOG_DIR/api.log"
printf 'TTS: %s\n' "$LOG_DIR/tts.log"
printf 'UI:  %s\n\n' "$LOG_DIR/ui.log"

touch "$LOG_DIR/api.log" "$LOG_DIR/tts.log" "$LOG_DIR/ui.log"

tail -f "$LOG_DIR/api.log" "$LOG_DIR/tts.log" "$LOG_DIR/ui.log"
