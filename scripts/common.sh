#!/usr/bin/env bash
# scripts/common.sh — Lorevox shared shell helpers.
#
# Sourced by start_all.sh, stop_all.sh, status_all.sh, etc. Defines
# port assignments, PID/log paths, command lookup, and process
# helpers used across the launcher scripts.
#
# Override any default by setting the corresponding LOREVOX_* env
# var in .env or in the shell before invoking the launcher.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_DIR="$RUNTIME_DIR/pids"
LOG_DIR="$RUNTIME_DIR/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

# ── Load .env if present ─────────────────────────────────────────
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

# ── Port assignments (LOREVOX_*_PORT overrides defaults) ─────────
API_PORT="${LOREVOX_API_PORT:-8000}"
TTS_PORT="${LOREVOX_TTS_PORT:-8001}"
UI_PORT="${LOREVOX_UI_PORT:-8080}"

API_PID_FILE="$PID_DIR/api.pid"
TTS_PID_FILE="$PID_DIR/tts.pid"
UI_PID_FILE="$PID_DIR/ui.pid"

# ── Service commands. Override via LOREVOX_*_CMD env vars. ──────
API_CMD_DEFAULT="bash launchers/run_gpu_8000.sh"
TTS_CMD_DEFAULT="bash launchers/run_tts_8001.sh"
UI_CMD_DEFAULT="python3 lorevox-serve.py"

API_CMD="${LOREVOX_API_CMD:-$API_CMD_DEFAULT}"
TTS_CMD="${LOREVOX_TTS_CMD:-$TTS_CMD_DEFAULT}"
UI_CMD="${LOREVOX_UI_CMD:-$UI_CMD_DEFAULT}"

# ── Health probes. Cheap GET to canonical surface per service. ──
api_up() { curl -fsS "http://127.0.0.1:${API_PORT}/api/ping" >/dev/null 2>&1; }
tts_up() { curl -fsS "http://127.0.0.1:${TTS_PORT}/api/tts/voices" >/dev/null 2>&1; }
ui_up()  { curl -fsS "http://127.0.0.1:${UI_PORT}/ui/lorevox10.0.html" >/dev/null 2>&1; }

# ── Process / PID helpers ───────────────────────────────────────
pid_is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  tr -d '[:space:]' < "$file"
}

write_pid() {
  local file="$1" pid="$2"
  printf '%s\n' "$pid" > "$file"
}

clear_pid() {
  local file="$1"
  rm -f "$file"
}

start_named_process() {
  local name="$1" cmd="$2" pid_file="$3" log_file="$4"
  if [[ -f "$pid_file" ]]; then
    local old_pid
    old_pid="$(read_pid "$pid_file" || true)"
    if pid_is_running "$old_pid"; then
      printf '%s already running (pid %s).\n' "$name" "$old_pid"
      return 0
    fi
    clear_pid "$pid_file"
  fi

  printf 'Starting %s...\n' "$name"
  (
    cd "$ROOT_DIR"
    nohup bash -lc "$cmd" >> "$log_file" 2>&1 &
    echo $! > "$pid_file"
  )

  sleep 1
}

wait_for_health() {
  local name="$1" probe_fn="$2" max_seconds="${3:-60}"
  local elapsed=0
  while [[ "$elapsed" -lt "$max_seconds" ]]; do
    if "$probe_fn"; then
      printf '%s: healthy (%ds).\n' "$name" "$elapsed"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  printf '%s: did NOT come up within %ds.\n' "$name" "$max_seconds"
  return 1
}

# ── Cleanup helpers ─────────────────────────────────────────────
kill_pid_file() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 0
  local pid
  pid="$(read_pid "$pid_file" || true)"
  if pid_is_running "$pid"; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    pid_is_running "$pid" && kill -9 "$pid" 2>/dev/null || true
  fi
  clear_pid "$pid_file"
}

kill_all_lorevox() {
  printf 'Killing any stale Lorevox processes...\n'
  kill_pid_file "$API_PID_FILE"
  kill_pid_file "$TTS_PID_FILE"
  kill_pid_file "$UI_PID_FILE"
  # Also free the ports in case PID files are stale
  fuser -k "${API_PORT}/tcp" 2>/dev/null || true
  fuser -k "${TTS_PORT}/tcp" 2>/dev/null || true
  fuser -k "${UI_PORT}/tcp"  2>/dev/null || true
}

show_vram() {
  if command -v nvidia-smi >/dev/null 2>&1; then
    printf '\n--- GPU state ---\n'
    nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader 2>/dev/null || true
  fi
}
