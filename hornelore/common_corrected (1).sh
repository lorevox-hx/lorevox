#!/usr/bin/env bash
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

API_PORT="${LOREVOX_API_PORT:-8000}"
TTS_PORT="${LOREVOX_TTS_PORT:-8001}"
UI_PORT="${HORNELORE_UI_PORT:-8082}"

API_PID_FILE="$PID_DIR/api.pid"
TTS_PID_FILE="$PID_DIR/tts.pid"
UI_PID_FILE="$PID_DIR/ui.pid"

# Hornelore uses its own launcher copies in hornelore/launchers.
API_CMD_DEFAULT="bash launchers/hornelore_run_gpu_8000.sh"
TTS_CMD_DEFAULT="bash launchers/hornelore_run_tts_8001.sh"
UI_CMD_DEFAULT="python3 hornelore-serve.py"

API_CMD="${LOREVOX_API_CMD:-$API_CMD_DEFAULT}"
TTS_CMD="${LOREVOX_TTS_CMD:-$TTS_CMD_DEFAULT}"
UI_CMD="${LOREVOX_UI_CMD:-$UI_CMD_DEFAULT}"

api_up() { curl -fsS "http://127.0.0.1:${API_PORT}/api/ping" >/dev/null 2>&1; }
tts_up() { curl -fsS "http://127.0.0.1:${TTS_PORT}/api/tts/voices" >/dev/null 2>&1; }
ui_up()  { curl -fsS "http://127.0.0.1:${UI_PORT}/ui/hornelore1.0.html" >/dev/null 2>&1; }

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
  local new_pid
  new_pid="$(read_pid "$pid_file" || true)"
  if pid_is_running "$new_pid"; then
    printf '%s started (pid %s).\n' "$name" "$new_pid"
  else
    printf '%s failed to start. Check %s\n' "$name" "$log_file"
    return 1
  fi
}

stop_named_process() {
  local name="$1" pid_file="$2" fallback_pattern="$3"
  local stopped=0
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(read_pid "$pid_file" || true)"
    if pid_is_running "$pid"; then
      printf 'Stopping %s (pid %s)...\n' "$name" "$pid"
      kill "$pid" 2>/dev/null || true
      sleep 1
      if pid_is_running "$pid"; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      stopped=1
    fi
    clear_pid "$pid_file"
  fi

  if pgrep -f "$fallback_pattern" >/dev/null 2>&1; then
    printf 'Stopping stray %s processes...\n' "$name"
    pkill -f "$fallback_pattern" || true
    stopped=1
  fi

  if [[ "$stopped" -eq 0 ]]; then
    printf '%s was not running.\n' "$name"
  fi
}

wait_for_health() {
  local name="$1" check_fn="$2" timeout_s="${3:-45}"
  local i=0
  until "$check_fn"; do
    i=$((i+1))
    if [[ "$i" -ge "$timeout_s" ]]; then
      printf '%s did not become healthy within %ss.\n' "$name" "$timeout_s"
      return 1
    fi
    sleep 1
  done
  printf '%s is healthy.\n' "$name"
}

open_ui_in_windows() {
  local url="${1:-http://localhost:${UI_PORT}/ui/hornelore1.0.html}"
  if [[ -f "$RUNTIME_DIR/reset_on_start" ]]; then
    url="${url}?lorevox_reset=clean"
    rm -f "$RUNTIME_DIR/reset_on_start"
    printf '[startup] Clean-start flag detected — browser will auto-clear state.\n'
  fi
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 || true
  fi
}

kill_stale_lorevox() {
  local killed=0
  for pattern in "hornelore_run_gpu_8000|run_gpu_8000" "uvicorn.*8000"; do
    if pgrep -f "$pattern" >/dev/null 2>&1; then
      printf 'Killing stale process: %s\n' "$pattern"
      pkill -f "$pattern" 2>/dev/null || true
      killed=1
    fi
  done
  if [[ "$killed" -eq 1 ]]; then
    printf 'Waiting for GPU memory to release...\n'
    local _waited=0
    while [[ "$_waited" -lt 15 ]]; do
      sleep 1
      _waited=$((_waited + 1))
      if command -v nvidia-smi >/dev/null 2>&1; then
        local _used
        _used="$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1 | xargs)"
        if [[ "$_used" -lt 1000 ]]; then
          printf 'GPU memory freed (%s MB used).\n' "$_used"
          break
        fi
        if (( _waited % 5 == 0 )); then
          printf '  Still waiting... (%s MB used, %ds)\n' "$_used" "$_waited"
        fi
      else
        sleep 4
        break
      fi
    done
    printf 'Stale processes cleaned up.\n'
  fi
  for f in "$API_PID_FILE"; do
    if [[ -f "$f" ]]; then
      local pid
      pid="$(tr -d '[:space:]' < "$f")"
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$f"
      fi
    fi
  done
}

kill_all_hornelore() {
  local killed=0
  for pattern in "hornelore_run_gpu_8000|run_gpu_8000" "uvicorn.*8000" "hornelore_run_tts_8001|run_tts_8001" "uvicorn.*8001" "hornelore-serve"; do
    if pgrep -f "$pattern" >/dev/null 2>&1; then
      printf 'Killing stale process: %s\n' "$pattern"
      pkill -f "$pattern" 2>/dev/null || true
      killed=1
    fi
  done
  if [[ "$killed" -eq 1 ]]; then
    printf 'Waiting for ports to release...\n'
    sleep 2
    printf 'Stale processes cleaned up.\n'
  fi
  for f in "$API_PID_FILE" "$TTS_PID_FILE" "$UI_PID_FILE"; do
    if [[ -f "$f" ]]; then
      local pid
      pid="$(tr -d '[:space:]' < "$f")"
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$f"
      fi
    fi
  done
}

show_vram() {
  if command -v nvidia-smi >/dev/null 2>&1; then
    printf '\n--- GPU VRAM ---\n'
    nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total --format=csv,noheader,nounits \
      | while IFS=',' read -r name used free total; do
          printf '  %s: %s MB used / %s MB free / %s MB total\n' \
            "$(echo "$name" | xargs)" "$(echo "$used" | xargs)" "$(echo "$free" | xargs)" "$(echo "$total" | xargs)"
        done
  fi
}
