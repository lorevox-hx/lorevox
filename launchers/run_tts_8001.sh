#!/usr/bin/env bash
# Lorevox — TTS server (port 8001)
# Runs Coqui VITS in its own venv (separate torch pin from LLM venv).
# All config lives in .env at the repo root — edit that file, not this script.
set -e

REPO_DIR=/mnt/c/Users/chris/lorevox

# ── Load .env (repo root) ──────────────────────────────────────────────────
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  source "$REPO_DIR/.env"
  set +a
  echo "[launcher] Loaded .env"
fi

# ── Defaults (only apply if not already set by .env) ──────────────────────
export USE_TTS=${USE_TTS:-1}
export DATA_DIR=${DATA_DIR:-/mnt/c/lorevox_data}
export HOST=${HOST:-0.0.0.0}
export TTS_PORT=${TTS_PORT:-8001}

# TTS — default GPU=0 to keep VRAM free for LLM + large-v3 STT
export TTS_MODEL=${TTS_MODEL:-tts_models/en/vctk/vits}
export TTS_GPU=${TTS_GPU:-0}
export TTS_SPEAKER_LORI=${TTS_SPEAKER_LORI:-p335}

# ── Kill any stale process on this port ───────────────────────────────────
fuser -k ${TTS_PORT}/tcp 2>/dev/null || true

# ── Create data dirs ──────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"/{db,voices,cache_audio,memory,projects,interview,logs}

# ── Start server ──────────────────────────────────────────────────────────
cd "$REPO_DIR"
source .venv-tts/bin/activate
cd server

echo "[launcher] Starting TTS server on port $TTS_PORT"
echo "[launcher] DATA_DIR=$DATA_DIR"
echo "[launcher] TTS_MODEL=$TTS_MODEL  TTS_GPU=$TTS_GPU  SPEAKER=$TTS_SPEAKER_LORI"

python -m uvicorn code.api.main:app --host "$HOST" --port "$TTS_PORT"
