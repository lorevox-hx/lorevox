#!/usr/bin/env bash
# scripts/start_all.sh — Lorevox 9.0
# Shell-native launcher: starts all three services, runs health checks
# and warmup, then prints status. For the visible Windows Terminal version,
# use start_lorevox.bat instead.
#
# Usage:
#   bash scripts/start_all.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Starting Lorevox stack ===\n\n'

# Pre-flight: kill ALL stale services and show VRAM before fresh start
kill_all_lorevox
show_vram

start_named_process "Lorevox API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"
start_named_process "Lorevox TTS" "$TTS_CMD" "$TTS_PID_FILE" "$LOG_DIR/tts.log"
start_named_process "Lorevox UI"  "$UI_CMD"  "$UI_PID_FILE"  "$LOG_DIR/ui.log"

printf '\n--- Health checks ---\n'
wait_for_health "Lorevox API" api_up 90 || true
wait_for_health "Lorevox TTS" tts_up 90 || true
wait_for_health "Lorevox UI"  ui_up  30 || true

# ── LLM readiness loop (matches start_ui_visible.sh gating) ──
# Model shard loading + first warmup typically takes 2–3 minutes.
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

if [[ -f "$ROOT_DIR/scripts/warm_tts.py" ]]; then
  printf 'Warming TTS...\n'
  python3 "$ROOT_DIR/scripts/warm_tts.py" \
    && printf 'TTS warm.\n' \
    || printf 'TTS warmup failed.\n'
fi

printf '\n=== Lorevox stack ready ===\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'TTS: http://127.0.0.1:%s\n' "$TTS_PORT"
printf 'UI:  http://127.0.0.1:%s/ui/lorevox10.0.html\n' "$UI_PORT"
printf '     (v9 baseline still available at /ui/lori9.0.html)\n'

open_ui_in_windows
