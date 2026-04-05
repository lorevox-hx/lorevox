#!/usr/bin/env bash
# scripts/stop_all.sh — Lorevox 9.0
# Stops all three services (UI first, then TTS, then API).
# Sets a clean-start flag so the next startup clears Lorevox browser state.
#
# Usage:
#   bash scripts/stop_all.sh            # stop + set clean-start flag (default)
#   bash scripts/stop_all.sh --no-clean # stop without setting clean-start flag
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

# ── Parse flags ──────────────────────────────────────────────────
_set_clean_flag=1
for arg in "$@"; do
  case "$arg" in
    --no-clean) _set_clean_flag=0 ;;
  esac
done

stop_named_process "Lorevox UI"  "$UI_PID_FILE"  "lorevox-serve.py|http.server.*8080"
stop_named_process "Lorevox TTS" "$TTS_PID_FILE" "run_tts_8001.sh|uvicorn.*8001"
stop_named_process "Lorevox API" "$API_PID_FILE" "run_gpu_8000.sh|uvicorn.*8000"

# ── Set clean-start flag for next startup ────────────────────────
# When Lori restarts, the browser will auto-clear all Lorevox-scoped
# localStorage/sessionStorage/caches so the session starts fresh.
if [[ "$_set_clean_flag" -eq 1 ]]; then
  mkdir -p "$RUNTIME_DIR"
  printf '%s\n' "$(date -Iseconds)" > "$RUNTIME_DIR/reset_on_start"
  printf 'Clean-start flag set — next startup will clear browser state.\n'
fi

printf '\nAll Lorevox services stopped.\n'
