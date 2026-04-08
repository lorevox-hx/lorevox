#!/usr/bin/env bash
set -euo pipefail
trap 'printf "\n*** Script failed. Press Enter to close. ***\n"; read' ERR
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Hornelore TTS visible startup ===\n'
printf 'Repo: %s\n' "$ROOT_DIR"
printf 'Log:  %s\n\n' "$LOG_DIR/tts.log"

start_named_process "Hornelore TTS" "$TTS_CMD" "$TTS_PID_FILE" "$LOG_DIR/tts.log"

printf 'Waiting for TTS health...\n'
if wait_for_health "Hornelore TTS" tts_up 90; then
  printf 'TTS health check passed.\n'
else
  printf 'TTS health check FAILED.\n'
fi

if [[ -f "$ROOT_DIR/scripts/warm_tts.py" ]]; then
  printf 'Warming TTS...\n'
  python3 "$ROOT_DIR/scripts/warm_tts.py" \
    && printf 'TTS warm.\n' \
    || printf 'TTS warmup failed.\n'
fi

printf '\nTTS visible startup complete.\n'
printf 'TTS: http://127.0.0.1:%s\n' "$TTS_PORT"
printf 'Tailing TTS log. Press Ctrl+C to stop tail.\n\n'

touch "$LOG_DIR/tts.log"
tail -f "$LOG_DIR/tts.log"
