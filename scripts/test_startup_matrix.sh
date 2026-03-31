#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Lorevox 8.0 — Startup Matrix Test Runner
# Tests full start/stop/restart cycles, service isolation, and
# rapid-restart behavior. Run from repo root.
#
# Usage:  bash scripts/test_startup_matrix.sh
#
# WARNING: This script stops and starts services. Run only when
#          you are ready for services to cycle.
# ─────────────────────────────────────────────────────────────────
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/common.sh"
set +e  # common.sh enables -e; disable it so test assertions don't abort the script

PASS=0; FAIL=0; SKIP=0; TOTAL=0
RESULTS=()

pass()  { (( ++PASS )); (( ++TOTAL )); RESULTS+=("PASS  | $1"); echo "  ✓ PASS  $1"; }
fail()  { (( ++FAIL )); (( ++TOTAL )); RESULTS+=("FAIL  | $1 — $2"); echo "  ✗ FAIL  $1 — $2"; }
skip()  { (( ++SKIP )); (( ++TOTAL )); RESULTS+=("SKIP  | $1 — $2"); echo "  ⊘ SKIP  $1 — $2"; }

port_free() { ! ss -tlnp 2>/dev/null | grep -q ":${1} " ; }
port_open() { ss -tlnp 2>/dev/null | grep -q ":${1} " ; }

wait_port_open() {
  local port=$1 timeout=${2:-90} elapsed=0
  while ! port_open "$port"; do
    sleep 1; ((elapsed++))
    if (( elapsed >= timeout )); then return 1; fi
  done
}

wait_port_free() {
  local port=$1 timeout=${2:-15} elapsed=0
  while port_open "$port"; do
    sleep 1; ((elapsed++))
    if (( elapsed >= timeout )); then return 1; fi
  done
}

wait_healthy() {
  local url=$1 timeout=${2:-90} elapsed=0
  while ! curl -sf "$url" >/dev/null 2>&1; do
    sleep 1; ((elapsed++))
    if (( elapsed >= timeout )); then return 1; fi
  done
}

echo ""
echo "═══════════════════════════════════════════════════"
echo " Lorevox 8.0 — Startup Matrix Tests"
echo " WARNING: Services will be cycled during this run."
echo "═══════════════════════════════════════════════════"
echo ""

# ── SM-01: Baseline Reset (stop_all + ports freed) ──────────────
echo "── SM-01: Baseline Reset ──"
bash "$SCRIPT_DIR/stop_all.sh" >/dev/null 2>&1 || true
sleep 2

ALL_FREE=true
for p in 8000 8001 8080; do
  if ! port_free "$p"; then
    ALL_FREE=false
    fail "SM-01: Baseline reset — port $p freed" "port still open after stop_all"
  fi
done
if $ALL_FREE; then
  pass "SM-01: Baseline reset — all ports freed after stop_all"
fi

# ── SM-02: Clean Startup ────────────────────────────────────────
echo ""
echo "── SM-02: Clean Startup (start_all) ──"
echo "  Starting all services... (this may take 60-90 seconds)"
bash "$SCRIPT_DIR/start_all.sh" >/dev/null 2>&1 &
START_PID=$!

# Wait for all ports
API_OK=false; TTS_OK=false; UI_OK=false

if wait_healthy "http://127.0.0.1:8000/api/ping" 120; then API_OK=true; fi
if wait_healthy "http://127.0.0.1:8001/api/tts/voices" 120; then TTS_OK=true; fi
if wait_healthy "http://127.0.0.1:8080/ui/lori8.0.html" 60; then UI_OK=true; fi

wait $START_PID 2>/dev/null || true

if $API_OK; then pass "SM-02a: API healthy after clean start"; else fail "SM-02a: API healthy after clean start" "timeout"; fi
if $TTS_OK; then pass "SM-02b: TTS healthy after clean start"; else fail "SM-02b: TTS healthy after clean start" "timeout"; fi
if $UI_OK;  then pass "SM-02c: UI healthy after clean start";  else fail "SM-02c: UI healthy after clean start" "timeout"; fi

# ── SM-03: Status Accuracy ──────────────────────────────────────
echo ""
echo "── SM-03: Status Accuracy ──"
STATUS_OUT=$(bash "$SCRIPT_DIR/status_all.sh" 2>&1 || true)
echo "$STATUS_OUT" | head -20

# Check status reports all healthy
if echo "$STATUS_OUT" | grep -qi "api.*healthy\|api.*running\|api.*UP"; then
  pass "SM-03a: status_all reports API healthy"
else
  fail "SM-03a: status_all reports API healthy" "status output doesn't match"
fi

if echo "$STATUS_OUT" | grep -qi "tts.*healthy\|tts.*running\|tts.*UP"; then
  pass "SM-03b: status_all reports TTS healthy"
else
  fail "SM-03b: status_all reports TTS healthy" "status output doesn't match"
fi

if echo "$STATUS_OUT" | grep -qi "ui.*healthy\|ui.*running\|ui.*UP"; then
  pass "SM-03c: status_all reports UI healthy"
else
  fail "SM-03c: status_all reports UI healthy" "status output doesn't match"
fi

# ── SM-04: UI Rapid Restart (SO_REUSEADDR) ──────────────────────
echo ""
echo "── SM-04: UI Rapid Restart ──"

# Get current UI PID
UI_PID_FILE="$REPO_ROOT/.runtime/pids/ui.pid"
if [[ -f "$UI_PID_FILE" ]]; then
  OLD_UI_PID=$(cat "$UI_PID_FILE")
  # Kill UI
  kill "$OLD_UI_PID" 2>/dev/null || true
  sleep 1

  # Immediately restart — this is the SO_REUSEADDR test
  cd "$REPO_ROOT"
  python3 lorevox-serve.py &
  NEW_UI_PID=$!
  disown $NEW_UI_PID 2>/dev/null || true
  echo "$NEW_UI_PID" > "$UI_PID_FILE"

  if wait_healthy "http://127.0.0.1:8080/ui/lori8.0.html" 10; then
    pass "SM-04: UI rapid restart — no address-in-use error"
  else
    fail "SM-04: UI rapid restart — no address-in-use error" "UI failed to bind port 8080"
  fi
else
  skip "SM-04: UI rapid restart" "no UI PID file found"
fi

# ── SM-05: TTS Restart Isolation ────────────────────────────────
echo ""
echo "── SM-05: TTS Restart Isolation ──"

# Record API and UI PIDs before TTS restart
API_PID_BEFORE=""
UI_PID_BEFORE=""
[[ -f "$REPO_ROOT/.runtime/pids/api.pid" ]] && API_PID_BEFORE=$(cat "$REPO_ROOT/.runtime/pids/api.pid")
[[ -f "$UI_PID_FILE" ]] && UI_PID_BEFORE=$(cat "$UI_PID_FILE")

# Restart TTS
TTS_PID_FILE="$REPO_ROOT/.runtime/pids/tts.pid"
if [[ -f "$TTS_PID_FILE" ]]; then
  OLD_TTS_PID=$(cat "$TTS_PID_FILE")
  kill "$OLD_TTS_PID" 2>/dev/null || true
  wait_port_free 8001 15 || true
  # Note: full TTS restart requires the TTS startup command from common.sh
  # For this test we just verify siblings survived
fi

sleep 2

# Check API survived
if [[ -n "$API_PID_BEFORE" ]] && kill -0 "$API_PID_BEFORE" 2>/dev/null; then
  pass "SM-05a: API survived TTS restart (PID $API_PID_BEFORE still running)"
else
  fail "SM-05a: API survived TTS restart" "API PID $API_PID_BEFORE no longer running"
fi

# Check UI survived
if [[ -n "$UI_PID_BEFORE" ]] && kill -0 "$UI_PID_BEFORE" 2>/dev/null; then
  pass "SM-05b: UI survived TTS restart (PID $UI_PID_BEFORE still running)"
else
  fail "SM-05b: UI survived TTS restart" "UI PID $UI_PID_BEFORE no longer running"
fi

# ── SM-06: API Restart Isolation ────────────────────────────────
echo ""
echo "── SM-06: API Restart Isolation ──"

# This is the KEY test for the kill_stale_lorevox scope fix.
# Restarting API must NOT kill TTS or UI.

# Record TTS and UI PIDs before API restart — but only if they're actually alive.
# SM-05 kills TTS and doesn't restart it, so the PID file may contain a dead PID.
TTS_PID_BEFORE=""
UI_PID_BEFORE2=""
if [[ -f "$TTS_PID_FILE" ]]; then
  _tts_pid=$(cat "$TTS_PID_FILE")
  kill -0 "$_tts_pid" 2>/dev/null && TTS_PID_BEFORE="$_tts_pid"
fi
if [[ -f "$UI_PID_FILE" ]]; then
  _ui_pid=$(cat "$UI_PID_FILE")
  kill -0 "$_ui_pid" 2>/dev/null && UI_PID_BEFORE2="$_ui_pid"
fi

# Use the scoped kill function
kill_stale_lorevox 2>/dev/null || true
sleep 2

# Check TTS survived
if [[ -n "$TTS_PID_BEFORE" ]] && kill -0 "$TTS_PID_BEFORE" 2>/dev/null; then
  pass "SM-06a: TTS survived API restart (PID $TTS_PID_BEFORE still running)"
elif [[ -z "$TTS_PID_BEFORE" ]]; then
  skip "SM-06a: TTS survived API restart" "TTS was not running (killed in SM-05)"
else
  fail "SM-06a: TTS survived API restart" "TTS PID $TTS_PID_BEFORE no longer running"
fi

# Check UI survived
if [[ -n "$UI_PID_BEFORE2" ]] && kill -0 "$UI_PID_BEFORE2" 2>/dev/null; then
  pass "SM-06b: UI survived API restart (PID $UI_PID_BEFORE2 still running)"
else
  fail "SM-06b: UI survived API restart" "UI PID $UI_PID_BEFORE2 no longer running"
fi

# ── SM-07: stop_all Completeness ────────────────────────────────
echo ""
echo "── SM-07: stop_all Completeness ──"
bash "$SCRIPT_DIR/stop_all.sh" >/dev/null 2>&1 || true
sleep 3

ALL_STOPPED=true
for p in 8000 8001 8080; do
  if ! port_free "$p"; then
    ALL_STOPPED=false
    fail "SM-07: stop_all completeness — port $p freed" "port still open"
  fi
done
if $ALL_STOPPED; then
  pass "SM-07: stop_all completeness — all ports freed"
fi

# ── SM-08: Clean Restart After stop_all ─────────────────────────
echo ""
echo "── SM-08: Clean Restart After stop_all ──"
echo "  Starting all services again... (60-90 seconds)"
bash "$SCRIPT_DIR/start_all.sh" >/dev/null 2>&1 &
START_PID=$!

API_OK2=false; TTS_OK2=false; UI_OK2=false
if wait_healthy "http://127.0.0.1:8000/api/ping" 120; then API_OK2=true; fi
if wait_healthy "http://127.0.0.1:8001/api/tts/voices" 120; then TTS_OK2=true; fi
if wait_healthy "http://127.0.0.1:8080/ui/lori8.0.html" 60; then UI_OK2=true; fi

wait $START_PID 2>/dev/null || true

if $API_OK2; then pass "SM-08a: API healthy after clean restart"; else fail "SM-08a: API healthy after clean restart" "timeout"; fi
if $TTS_OK2; then pass "SM-08b: TTS healthy after clean restart"; else fail "SM-08b: TTS healthy after clean restart" "timeout"; fi
if $UI_OK2;  then pass "SM-08c: UI healthy after clean restart";  else fail "SM-08c: UI healthy after clean restart" "timeout"; fi

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo " RESULTS: $PASS passed, $FAIL failed, $SKIP skipped / $TOTAL total"
echo "═══════════════════════════════════════════════════"
echo ""

if (( FAIL > 0 )); then
  echo "FAILED TESTS:"
  for r in "${RESULTS[@]}"; do
    if [[ "$r" == FAIL* ]]; then echo "  $r"; fi
  done
  echo ""
fi

exit $FAIL
