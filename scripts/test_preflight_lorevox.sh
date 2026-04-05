#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# test_preflight_lorevox.sh — Lorevox 8.0 Phase O
# Standard entrypoint for all Lorevox test runs.
#
# This script is the required preflight step before any formal
# Lorevox regression or verification test.
#
# Usage:
#   bash scripts/test_preflight_lorevox.sh                    # clean mode (default)
#   bash scripts/test_preflight_lorevox.sh --mode persistence # persistence mode
#   bash scripts/test_preflight_lorevox.sh --mode clean       # explicit clean
#   bash scripts/test_preflight_lorevox.sh --cleanup          # also run test-data cleanup
#   bash scripts/test_preflight_lorevox.sh --no-browser       # skip browser launch
#   bash scripts/test_preflight_lorevox.sh --restart          # restart Lorevox stack
#   bash scripts/test_preflight_lorevox.sh --browser edge     # use Edge
#
# Environment:
#   LOREVOX_UI_PORT          UI port (default: 8080)
#   LOREVOX_TEST_BROWSER     chrome|edge (default: chrome)
#   LOREVOX_TEST_PROFILE     browser profile path
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/common.sh"

# ── Defaults ─────────────────────────────────────────────────────
MODE="clean"
DO_CLEANUP=false
DO_RESTART=false
LAUNCH_BROWSER=true
BROWSER_ARG=""
PORT_ARG=""

# ── Parse args ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)          MODE="$2"; shift 2 ;;
    --clean)         MODE="clean"; shift ;;
    --persistence)   MODE="persistence"; shift ;;
    --cleanup)       DO_CLEANUP=true; shift ;;
    --restart)       DO_RESTART=true; shift ;;
    --no-browser)    LAUNCH_BROWSER=false; shift ;;
    --browser)       BROWSER_ARG="--browser $2"; shift 2 ;;
    --port)          PORT_ARG="--port $2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Banner ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Lorevox 8.0 — Test Preflight Harness            ║"
echo "║   $(date '+%Y-%m-%d %H:%M:%S')                         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║ Mode:    ${MODE}"
echo "║ Cleanup: ${DO_CLEANUP}"
echo "║ Restart: ${DO_RESTART}"
echo "║ Browser: ${LAUNCH_BROWSER}"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Optionally restart Lorevox stack ─────────────────────
if $DO_RESTART; then
  echo "Step 1: Restarting Lorevox stack..."
  if [[ -f "$SCRIPT_DIR/stop_all.sh" ]]; then
    bash "$SCRIPT_DIR/stop_all.sh" || true
  fi
  bash "$SCRIPT_DIR/start_all.sh"
  echo ""
else
  echo "Step 1: Checking Lorevox stack health..."
  API_OK=false; UI_OK=false
  api_up && API_OK=true
  ui_up  && UI_OK=true
  echo "  API: $($API_OK && echo UP || echo DOWN)"
  echo "  UI:  $($UI_OK && echo UP || echo DOWN)"
  if ! $UI_OK; then
    echo ""
    echo "WARNING: UI is not running. Start services first:"
    echo "  bash scripts/start_all.sh"
    echo "  — or use --restart flag"
    exit 1
  fi
  echo ""
fi

# ── Step 2: Browser-state reset (clean mode only) ───────────────
if [[ "$MODE" == "clean" ]]; then
  echo "Step 2: Clearing Lorevox browser state..."
  echo "  (This will be executed in the browser after launch.)"
  echo "  Reset script: scripts/reset_lorevox_browser_state.js"
  echo ""
elif [[ "$MODE" == "persistence" ]]; then
  echo "Step 2: Persistence mode — browser state preserved."
  echo ""
else
  echo "ERROR: Unknown mode '$MODE'. Use 'clean' or 'persistence'."
  exit 1
fi

# ── Step 3: Optional backend test-data cleanup ───────────────────
if $DO_CLEANUP; then
  echo "Step 3: Running test-data cleanup..."
  if [[ -f "$SCRIPT_DIR/cleanup_lorevox_test_data.sh" ]]; then
    bash "$SCRIPT_DIR/cleanup_lorevox_test_data.sh" --dry-run
    echo ""
    echo "  (Dry run shown above. Use --confirm flag in cleanup script to delete.)"
  else
    echo "  WARNING: cleanup_lorevox_test_data.sh not found. Skipping."
  fi
  echo ""
else
  echo "Step 3: Backend cleanup — skipped (use --cleanup to enable)."
  echo ""
fi

# ── Step 4: Launch dedicated test browser ────────────────────────
if $LAUNCH_BROWSER; then
  echo "Step 4: Launching dedicated test browser..."
  LAUNCH_ARGS="--${MODE}"
  [[ -n "$BROWSER_ARG" ]] && LAUNCH_ARGS="$LAUNCH_ARGS $BROWSER_ARG"
  [[ -n "$PORT_ARG" ]]    && LAUNCH_ARGS="$LAUNCH_ARGS $PORT_ARG"

  if [[ -f "$SCRIPT_DIR/launch_lorevox_test_browser.sh" ]]; then
    bash "$SCRIPT_DIR/launch_lorevox_test_browser.sh" $LAUNCH_ARGS
  else
    echo "  WARNING: launch_lorevox_test_browser.sh not found."
    echo "  Opening in default browser..."
    TIMESTAMP="$(date +%s)"
    URL="http://127.0.0.1:${UI_PORT}/ui/lori9.0.html?test_run=${TIMESTAMP}&test_mode=${MODE}"
    echo "  URL: $URL"
    # Try common openers
    xdg-open "$URL" 2>/dev/null || open "$URL" 2>/dev/null || start "$URL" 2>/dev/null || true
  fi
  echo ""
else
  echo "Step 4: Browser launch — skipped (--no-browser)."
  echo ""
fi

# ── Step 5: Print status ────────────────────────────────────────
echo "╔══════════════════════════════════════════════════╗"
echo "║   PREFLIGHT COMPLETE                              ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║ Mode:        ${MODE}"
if [[ "$MODE" == "clean" ]]; then
echo "║ Browser reset: PENDING (runs on page load)"
echo "║"
echo "║ To execute reset in browser console, paste:"
echo "║   scripts/reset_lorevox_browser_state.js"
echo "║ Or it auto-runs via ?test_mode=clean URL param"
fi
if [[ "$MODE" == "persistence" ]]; then
echo "║ Browser state: PRESERVED"
fi
echo "║"
echo "║ Ready for testing."
echo "╚══════════════════════════════════════════════════╝"
echo ""
