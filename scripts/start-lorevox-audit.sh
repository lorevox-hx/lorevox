#!/usr/bin/env bash
# start-lorevox-audit.sh
# ─────────────────────────────────────────────────────────────────────────────
# Starts the Lorevox backend for Playwright audit runs.
# Called by playwright.config.ts webServer block.
# reuseExistingServer: true means this only fires if port 8000 is not already up.
#
# Override any variable before running:
#   export LOREVOX_REPO=/mnt/c/Users/chris/lorevox   # desktop clone
#   export LOREVOX_VENV=/mnt/c/Users/chris/lorevox/.venv-gpu
#   export DATA_DIR=/home/chris/lorevox_data
#   npm run audit:all
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="${LOREVOX_REPO:-/mnt/c/lorevox}"
VENV_DIR="${LOREVOX_VENV:-/mnt/c/lorevox/.venv-gpu}"
DATA_DIR="${DATA_DIR:-/home/chris/lorevox_data}"
USE_TTS="${USE_TTS:-0}"

echo "[audit] repo:    $REPO_DIR"
echo "[audit] venv:    $VENV_DIR"
echo "[audit] data:    $DATA_DIR"
echo "[audit] USE_TTS: $USE_TTS"

cd "$REPO_DIR"

# Activate the GPU/LLM virtual environment
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

export USE_TTS
export DATA_DIR

# Ensure runtime directories exist
mkdir -p "$DATA_DIR"/{db,voices,cache_audio,memory,projects,interview,logs}

# exec replaces this shell so Playwright can track the process cleanly
exec python -m uvicorn code.api.main:app --host 0.0.0.0 --port 8000
