#!/usr/bin/env bash
# scripts/start_all.sh — Hornelore 1.0
# Starts all three Hornelore services in the correct order:
#   1. API  → wait for health → wait for LLM ready
#   2. TTS  → wait for health → warm
#   3. UI   → wait for health → open browser
#
# Usage:
#   bash scripts/start_all.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '\n=== Starting Hornelore stack ===\n\n'

# Pre-flight: kill ALL stale services and show VRAM before fresh start
kill_all_hornelore
show_vram

# ── 1. API ───────────────────────────────────────────────────────
start_named_process "Hornelore API" "$API_CMD" "$API_PID_FILE" "$LOG_DIR/api.log"

printf 'Waiting for API health...\n'
if ! wait_for_health "Hornelore API" api_up 90; then
  printf 'ERROR: Hornelore API did not become healthy. Aborting.\n'
  exit 1
fi

# LLM readiness loop — model shard loading + warmup typically takes 2–3 min
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

# ── 2. TTS ───────────────────────────────────────────────────────
start_named_process "Hornelore TTS" "$TTS_CMD" "$TTS_PID_FILE" "$LOG_DIR/tts.log"

printf 'Waiting for TTS health...\n'
if wait_for_health "Hornelore TTS" tts_up 90; then
  if [[ -f "$ROOT_DIR/scripts/warm_tts.py" ]]; then
    printf 'Warming TTS...\n'
    python3 "$ROOT_DIR/scripts/warm_tts.py" \
      && printf 'TTS warm.\n' \
      || printf 'TTS warmup failed (non-fatal).\n'
  fi
else
  printf 'TTS health check failed (non-fatal — continuing without TTS).\n'
fi

# ── 3. UI ────────────────────────────────────────────────────────
start_named_process "Hornelore UI" "$UI_CMD" "$UI_PID_FILE" "$LOG_DIR/ui.log"

printf 'Waiting for UI health...\n'
wait_for_health "Hornelore UI" ui_up 30 || true

# ── Open browser ─────────────────────────────────────────────────
printf '\n=== Hornelore stack ready ===\n'
printf 'API: http://127.0.0.1:%s\n' "$API_PORT"
printf 'TTS: http://127.0.0.1:%s\n' "$TTS_PORT"
printf 'UI:  http://127.0.0.1:%s/ui/hornelore1.0.html\n' "$UI_PORT"

open_ui_in_windows
