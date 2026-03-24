#!/usr/bin/env bash
# scripts/stop_all.sh — Lorevox 7.4C
# Stops all three services (UI first, then TTS, then API).
#
# Usage:
#   bash scripts/stop_all.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

stop_named_process "Lorevox UI"  "$UI_PID_FILE"  "lorevox-serve.py|http.server.*8080"
stop_named_process "Lorevox TTS" "$TTS_PID_FILE" "run_tts_8001.sh|uvicorn.*8001"
stop_named_process "Lorevox API" "$API_PID_FILE" "run_gpu_8000.sh|uvicorn.*8000"
