#!/usr/bin/env bash
# scripts/stop_all.sh — Hornelore 1.0
# Stops all three Hornelore services (UI first, then TTS, then API).
# Sets a clean-start flag so the next startup clears Hornelore browser state.
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

stop_named_process "Hornelore UI"  "$UI_PID_FILE"  "hornelore-serve.py|http.server.*${UI_PORT}"
stop_named_process "Hornelore TTS" "$TTS_PID_FILE" "hornelore_run_tts_8001|run_tts_8001|uvicorn.*${TTS_PORT}"
stop_named_process "Hornelore API" "$API_PID_FILE" "hornelore_run_gpu_8000|run_gpu_8000|uvicorn.*${API_PORT}"

# ── Set clean-start flag for next startup ────────────────────────
# When Hornelore restarts, the browser will auto-clear all Hornelore-scoped
# localStorage/sessionStorage/caches so the session starts fresh.
if [[ "$_set_clean_flag" -eq 1 ]]; then
  mkdir -p "$RUNTIME_DIR"
  printf '%s\n' "$(date -Iseconds)" > "$RUNTIME_DIR/reset_on_start"
  printf 'Clean-start flag set — next startup will clear browser state.\n'
fi

printf '\nAll Hornelore services stopped.\n'
