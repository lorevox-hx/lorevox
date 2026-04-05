#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# launch_lorevox_test_browser.sh — Lorevox 8.0 Phase O
# Opens Lorevox in a dedicated Chrome/Edge test profile with
# cache-busting and optional clean-state reset.
#
# Usage:
#   bash scripts/launch_lorevox_test_browser.sh                 # clean mode (default)
#   bash scripts/launch_lorevox_test_browser.sh --persistence   # persistence mode
#   bash scripts/launch_lorevox_test_browser.sh --browser edge  # use Edge
#   bash scripts/launch_lorevox_test_browser.sh --port 9090     # custom UI port
#
# Environment:
#   LOREVOX_TEST_BROWSER   chrome | edge      (default: chrome)
#   LOREVOX_UI_PORT        port number        (default: 8080)
#   LOREVOX_TEST_PROFILE   path to profile    (auto-created if absent)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Defaults ─────────────────────────────────────────────────────
MODE="clean"
BROWSER="${LOREVOX_TEST_BROWSER:-chrome}"
UI_PORT="${LOREVOX_UI_PORT:-8080}"
PROFILE_DIR="${LOREVOX_TEST_PROFILE:-$ROOT_DIR/.runtime/test-browser-profile}"

# ── Parse args ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --persistence) MODE="persistence"; shift ;;
    --clean)       MODE="clean"; shift ;;
    --browser)     BROWSER="$2"; shift 2 ;;
    --port)        UI_PORT="$2"; shift 2 ;;
    --profile)     PROFILE_DIR="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Resolve browser binary ──────────────────────────────────────
resolve_browser() {
  case "$BROWSER" in
    chrome)
      # Windows paths (via WSL or Git Bash)
      for p in \
        "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
        "/c/Program Files/Google/Chrome/Application/chrome.exe" \
        "C:/Program Files/Google/Chrome/Application/chrome.exe" \
        "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"; do
        if [[ -f "$p" ]]; then echo "$p"; return; fi
      done
      # Linux / macOS
      command -v google-chrome-stable 2>/dev/null && return
      command -v google-chrome 2>/dev/null && return
      command -v chromium-browser 2>/dev/null && return
      ;;
    edge)
      for p in \
        "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
        "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; do
        if [[ -f "$p" ]]; then echo "$p"; return; fi
      done
      command -v microsoft-edge 2>/dev/null && return
      ;;
  esac
  echo ""
}

BROWSER_BIN="$(resolve_browser)"

if [[ -z "$BROWSER_BIN" ]]; then
  echo "ERROR: Could not find $BROWSER binary."
  echo "Set LOREVOX_TEST_BROWSER=chrome|edge or --browser <name>"
  exit 1
fi

# ── Ensure profile directory ────────────────────────────────────
mkdir -p "$PROFILE_DIR"

# ── Build URL ────────────────────────────────────────────────────
TIMESTAMP="$(date +%s%N 2>/dev/null || date +%s)"
URL="http://127.0.0.1:${UI_PORT}/ui/lori9.0.html?test_run=${TIMESTAMP}&test_mode=${MODE}"

# ── Print status ─────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   Lorevox Test Browser Launcher            ║"
echo "╠═══════════════════════════════════════════╣"
echo "║ Mode:    ${MODE}"
echo "║ Browser: ${BROWSER} (${BROWSER_BIN})"
echo "║ Profile: ${PROFILE_DIR}"
echo "║ URL:     ${URL}"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ── Launch ───────────────────────────────────────────────────────
"$BROWSER_BIN" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --disable-extensions \
  --disable-background-networking \
  --disable-sync \
  --disable-translate \
  --disable-default-apps \
  "$URL" &

BROWSER_PID=$!
echo "Browser launched (pid $BROWSER_PID)."
echo "$BROWSER_PID" > "$ROOT_DIR/.runtime/pids/test_browser.pid"
