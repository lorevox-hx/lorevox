#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Hornelore 1.0 — Unified Test Runner
# Runs all test layers in sequence and produces a summary.
#
# Usage:
#   bash scripts/test_all.sh              # full suite
#   bash scripts/test_all.sh --skip-llm   # skip LLM chat tests (faster)
#   bash scripts/test_all.sh --health     # health tests only
#   bash scripts/test_all.sh --api        # API smoke tests only
#   bash scripts/test_all.sh --db         # DB smoke tests only
#   bash scripts/test_all.sh --e2e        # Playwright e2e only
# ─────────────────────────────────────────────────────────────────
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="${1:-all}"
SKIP_LLM=false
if [[ "$MODE" == "--skip-llm" ]]; then MODE="all"; SKIP_LLM=true; fi

LAYER_PASS=0; LAYER_FAIL=0; LAYER_SKIP=0
SUMMARY=()

run_layer() {
  local name=$1; shift
  local cmd="$@"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " Layer: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if eval "$cmd"; then
    ((LAYER_PASS++))
    SUMMARY+=("✓ $name — PASSED")
  else
    ((LAYER_FAIL++))
    SUMMARY+=("✗ $name — FAILED (exit $?)")
  fi
}

skip_layer() {
  local name=$1; local reason=$2
  ((LAYER_SKIP++))
  SUMMARY+=("⊘ $name — SKIPPED ($reason)")
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " Layer: $name — SKIPPED ($reason)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   Hornelore 1.0 — Full Test Suite          ║"
echo "║   $(date '+%Y-%m-%d %H:%M:%S')                    ║"
echo "╚═══════════════════════════════════════════╝"

# ── Pre-flight: check services ───────────────────────────────────
echo ""
echo "Pre-flight check..."
API_UP=false; TTS_UP=false; UI_UP=false
curl -sf http://127.0.0.1:8000/api/ping >/dev/null 2>&1 && API_UP=true
curl -sf http://127.0.0.1:8001/api/tts/voices >/dev/null 2>&1 && TTS_UP=true
curl -sf http://127.0.0.1:8080/ui/lori9.0.html >/dev/null 2>&1 && UI_UP=true
echo "  API: $($API_UP && echo UP || echo DOWN)"
echo "  TTS: $($TTS_UP && echo UP || echo DOWN)"
echo "  UI:  $($UI_UP && echo UP || echo DOWN)"

if ! $API_UP; then
  echo ""
  echo "ERROR: API is not running. Start services first:"
  echo "  bash scripts/start_all.sh"
  exit 1
fi

# ── Layer 1: Stack Health ────────────────────────────────────────
if [[ "$MODE" == "all" || "$MODE" == "--health" ]]; then
  run_layer "Stack Health" "bash '$SCRIPT_DIR/test_stack_health.sh'"
fi

# ── Layer 2: API Smoke ───────────────────────────────────────────
if [[ "$MODE" == "all" || "$MODE" == "--api" ]]; then
  if $SKIP_LLM; then
    run_layer "API Smoke (skip LLM)" "cd '$REPO_ROOT' && python3 tests/test_api_smoke.py -v -k 'not Chat' 2>&1"
  else
    run_layer "API Smoke" "cd '$REPO_ROOT' && python3 tests/test_api_smoke.py -v 2>&1"
  fi
fi

# ── Layer 3: DB Smoke ────────────────────────────────────────────
if [[ "$MODE" == "all" || "$MODE" == "--db" ]]; then
  run_layer "DB Smoke" "cd '$REPO_ROOT' && python3 tests/test_db_smoke.py -v 2>&1"
fi

# ── Layer 4: Playwright E2E ──────────────────────────────────────
if [[ "$MODE" == "all" || "$MODE" == "--e2e" ]]; then
  if command -v npx >/dev/null 2>&1 && [[ -d "$REPO_ROOT/node_modules/@playwright" ]]; then
    if $SKIP_LLM; then
      run_layer "Playwright E2E (skip LLM)" "cd '$REPO_ROOT' && npx playwright test tests/e2e/ --grep-invert 'REST.*chat|SSE.*stream' 2>&1"
    else
      run_layer "Playwright E2E" "cd '$REPO_ROOT' && npx playwright test tests/e2e/ 2>&1"
    fi
  else
    skip_layer "Playwright E2E" "playwright not installed — run: npm install && npx playwright install"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   TEST SUITE SUMMARY                      ║"
echo "╠═══════════════════════════════════════════╣"
for s in "${SUMMARY[@]}"; do
  printf "║ %-41s ║\n" "$s"
done
TOTAL=$((LAYER_PASS + LAYER_FAIL + LAYER_SKIP))
echo "╠═══════════════════════════════════════════╣"
printf "║ Total: %d pass, %d fail, %d skip / %d  %-5s ║\n" $LAYER_PASS $LAYER_FAIL $LAYER_SKIP $TOTAL ""
echo "╚═══════════════════════════════════════════╝"
echo ""

exit $LAYER_FAIL
