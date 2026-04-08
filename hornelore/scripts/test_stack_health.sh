#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Hornelore 1.0 — Stack Health Test Runner
# Tests service health, port binding, PID accuracy, and isolation.
# Run from the repo root:  bash scripts/test_stack_health.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/common.sh"

PASS=0; FAIL=0; SKIP=0; TOTAL=0
RESULTS=()

# ── Helpers ──────────────────────────────────────────────────────
pass()  { (( ++PASS )); (( ++TOTAL )); RESULTS+=("PASS  | $1"); echo "  ✓ PASS  $1"; }
fail()  { (( ++FAIL )); (( ++TOTAL )); RESULTS+=("FAIL  | $1 — $2"); echo "  ✗ FAIL  $1 — $2"; }
skip()  { (( ++SKIP )); (( ++TOTAL )); RESULTS+=("SKIP  | $1 — $2"); echo "  ⊘ SKIP  $1 — $2"; }

port_free() { ! ss -tlnp 2>/dev/null | grep -q ":${1} " ; }
port_open() { ss -tlnp 2>/dev/null | grep -q ":${1} " ; }

wait_port_open() {
  local port=$1 timeout=${2:-30} elapsed=0
  while ! port_open "$port"; do
    sleep 1; ((elapsed++))
    if (( elapsed >= timeout )); then return 1; fi
  done
  return 0
}

wait_port_free() {
  local port=$1 timeout=${2:-15} elapsed=0
  while port_open "$port"; do
    sleep 1; ((elapsed++))
    if (( elapsed >= timeout )); then return 1; fi
  done
  return 0
}

# ── Test Group: Service Health ───────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo " Hornelore 1.0 — Stack Health Tests"
echo "═══════════════════════════════════════════"
echo ""

echo "── Group 1: Port Availability ──"

if port_open 8000; then
  pass "SH-01: API port 8000 is listening"
else
  fail "SH-01: API port 8000 is listening" "port 8000 not open"
fi

if port_open 8001; then
  pass "SH-02: TTS port 8001 is listening"
else
  fail "SH-02: TTS port 8001 is listening" "port 8001 not open"
fi

if port_open 8080; then
  pass "SH-03: UI port 8080 is listening"
else
  fail "SH-03: UI port 8080 is listening" "port 8080 not open"
fi

echo ""
echo "── Group 2: Health Endpoints ──"

if curl -sf http://127.0.0.1:8000/api/ping >/dev/null 2>&1; then
  pass "SH-04: API /api/ping returns 200"
else
  fail "SH-04: API /api/ping returns 200" "curl failed or non-200"
fi

if curl -sf http://127.0.0.1:8001/api/tts/voices >/dev/null 2>&1; then
  pass "SH-05: TTS /api/tts/voices returns 200"
else
  fail "SH-05: TTS /api/tts/voices returns 200" "curl failed or non-200"
fi

if curl -sf http://127.0.0.1:8080/ui/lori9.0.html >/dev/null 2>&1; then
  pass "SH-06: UI /ui/lori9.0.html returns 200"
else
  fail "SH-06: UI /ui/lori9.0.html returns 200" "curl failed or non-200"
fi

echo ""
echo "── Group 3: PID File Accuracy ──"

PID_DIR="$REPO_ROOT/.runtime/pids"
for svc in api tts ui; do
  pf="$PID_DIR/${svc}.pid"
  if [[ -f "$pf" ]]; then
    pid=$(cat "$pf")
    if kill -0 "$pid" 2>/dev/null; then
      pass "SH-07-${svc}: PID file $svc.pid ($pid) matches running process"
    else
      fail "SH-07-${svc}: PID file $svc.pid ($pid) matches running process" "PID $pid is not running"
    fi
  else
    fail "SH-07-${svc}: PID file $svc.pid exists" "file not found at $pf"
  fi
done

echo ""
echo "── Group 4: Cross-Origin Isolation Headers ──"

HEADERS=$(curl -sI http://127.0.0.1:8080/ui/lori9.0.html 2>/dev/null || true)
if echo "$HEADERS" | grep -qi "Cross-Origin-Opener-Policy"; then
  pass "SH-08: UI serves COOP header"
else
  fail "SH-08: UI serves COOP header" "header missing"
fi

if echo "$HEADERS" | grep -qi "Cross-Origin-Embedder-Policy"; then
  pass "SH-09: UI serves COEP header"
else
  fail "SH-09: UI serves COEP header" "header missing"
fi

echo ""
echo "── Group 5: API Response Validation ──"

PING_BODY=$(curl -sf http://127.0.0.1:8000/api/ping 2>/dev/null || echo '{}')
if echo "$PING_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('ok')==True" 2>/dev/null; then
  pass "SH-10: /api/ping returns {\"ok\": true}"
else
  fail "SH-10: /api/ping returns {\"ok\": true}" "unexpected body: $PING_BODY"
fi

PEOPLE_BODY=$(curl -sf http://127.0.0.1:8000/api/people 2>/dev/null || echo '{}')
if echo "$PEOPLE_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d.get('items') or d.get('people'), list)" 2>/dev/null; then
  pass "SH-11: /api/people returns list"
else
  fail "SH-11: /api/people returns list" "unexpected response"
fi

echo ""
echo "── Group 6: VRAM Guard Config ──"

if grep -q "MAX_CONTEXT_WINDOW" "$REPO_ROOT/.env" 2>/dev/null; then
  MCW=$(grep "MAX_CONTEXT_WINDOW" "$REPO_ROOT/.env" | head -1 | cut -d= -f2)
  if [[ "$MCW" == "4096" ]]; then
    pass "SH-12: .env has MAX_CONTEXT_WINDOW=4096"
  else
    fail "SH-12: .env has MAX_CONTEXT_WINDOW=4096" "found value=$MCW"
  fi
else
  fail "SH-12: .env has MAX_CONTEXT_WINDOW=4096" "key not found in .env"
fi

# Check VRAM guard is in active api.py
if grep -q "VRAM.GUARD\|VRAM-GUARD\|MAX_CONTEXT_WINDOW" "$REPO_ROOT/server/code/api/api.py" 2>/dev/null; then
  pass "SH-13: VRAM guard present in api.py"
else
  fail "SH-13: VRAM guard present in api.py" "guard code not found"
fi

# Check VRAM guard is in active chat_ws.py
if grep -q "VRAM.GUARD\|VRAM-GUARD\|MAX_CONTEXT_WINDOW" "$REPO_ROOT/server/code/api/routers/chat_ws.py" 2>/dev/null; then
  pass "SH-14: VRAM guard present in chat_ws.py"
else
  fail "SH-14: VRAM guard present in chat_ws.py" "guard code not found"
fi

echo ""
echo "── Group 7: WO-2 Identity Handshake in Active Files ──"

if grep -q "sync_session" "$REPO_ROOT/server/code/api/routers/chat_ws.py" 2>/dev/null; then
  pass "SH-15: sync_session handler in active chat_ws.py"
else
  fail "SH-15: sync_session handler in active chat_ws.py" "not found"
fi

if grep -q "session_verified" "$REPO_ROOT/server/code/api/routers/chat_ws.py" 2>/dev/null; then
  pass "SH-16: session_verified response in active chat_ws.py"
else
  fail "SH-16: session_verified response in active chat_ws.py" "not found"
fi

if grep -q "sync_session" "$REPO_ROOT/ui/js/app.js" 2>/dev/null; then
  pass "SH-17: sync_session send in active app.js"
else
  fail "SH-17: sync_session send in active app.js" "not found"
fi

if grep -q "session_verified" "$REPO_ROOT/ui/js/app.js" 2>/dev/null; then
  pass "SH-18: session_verified handler in active app.js"
else
  fail "SH-18: session_verified handler in active app.js" "not found"
fi

echo ""
echo "── Group 8: Dead File Verification ──"

DEAD_FILES=(
  "server/code/api/v16api.py"
  "server/code/api/v16db.py"
  "server/code/api/routers/v16chat_ws.py"
  "server/code/api/routers/v1chat_ws.py"
  "server/code/api/v1main.py"
  "server/code/api/v2main.py"
  "server/code/api/v3main.py"
  "server/code/api/v5main.py"
  "ui/lori7.4c.html"
  "ui/lori7.3.html"
  "ui/lori7.1.html"
)

dead_found=0
for df in "${DEAD_FILES[@]}"; do
  if [[ -f "$REPO_ROOT/$df" ]]; then
    ((dead_found++))
    fail "SH-19: Dead file absent: $df" "file still exists"
  fi
done
if [[ $dead_found -eq 0 ]]; then
  pass "SH-19: All ${#DEAD_FILES[@]} known dead files confirmed absent"
fi

echo ""
echo "── Group 9: Startup Script Scoping ──"

# Verify kill_stale_hornelore only targets API
if grep -q 'kill_stale_hornelore' "$SCRIPT_DIR/common.sh" 2>/dev/null; then
  # Check that kill_stale_hornelore does NOT match tts or hornelore-serve patterns
  STALE_BODY=$(sed -n '/^kill_stale_hornelore/,/^}/p' "$SCRIPT_DIR/common.sh")
  if echo "$STALE_BODY" | grep -q "8001\|hornelore-serve\|tts"; then
    fail "SH-20: kill_stale_hornelore scoped to API only" "still references TTS/UI patterns"
  else
    pass "SH-20: kill_stale_hornelore scoped to API only"
  fi
else
  fail "SH-20: kill_stale_hornelore exists" "function not found"
fi

# Verify kill_all_hornelore exists for full teardown
if grep -q 'kill_all_hornelore' "$SCRIPT_DIR/common.sh" 2>/dev/null; then
  pass "SH-21: kill_all_hornelore function exists for full-stack teardown"
else
  fail "SH-21: kill_all_hornelore function exists for full-stack teardown" "not found"
fi

# Verify SO_REUSEADDR in hornelore-serve.py
if grep -q "allow_reuse_address\|ReusableTCPServer" "$REPO_ROOT/hornelore-serve.py" 2>/dev/null; then
  pass "SH-22: SO_REUSEADDR enabled in hornelore-serve.py"
else
  fail "SH-22: SO_REUSEADDR enabled in hornelore-serve.py" "not found"
fi

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo " RESULTS: $PASS passed, $FAIL failed, $SKIP skipped / $TOTAL total"
echo "═══════════════════════════════════════════"
echo ""

if (( FAIL > 0 )); then
  echo "FAILED TESTS:"
  for r in "${RESULTS[@]}"; do
    if [[ "$r" == FAIL* ]]; then echo "  $r"; fi
  done
  echo ""
fi

exit $FAIL
