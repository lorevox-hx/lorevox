#!/usr/bin/env bash
# Lorevox — LLM server (port 8000)
# Loads model from MODEL_PATH (local folder) if set, otherwise falls back to MODEL_ID (HuggingFace).
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
export USE_TTS=${USE_TTS:-0}
export DATA_DIR=${DATA_DIR:-/mnt/c/lorevox_data}
export HOST=${HOST:-0.0.0.0}
export PORT=${PORT:-8000}

# LLM
export LOAD_IN_4BIT=${LOAD_IN_4BIT:-1}
export TORCH_DTYPE=${TORCH_DTYPE:-bfloat16}
export ATTN_IMPL=${ATTN_IMPL:-flash_attention_2}
export MAX_NEW_TOKENS=${MAX_NEW_TOKENS:-7168}

# STT (served on this port alongside the LLM)
export STT_MODEL=${STT_MODEL:-large-v3}
export STT_GPU=${STT_GPU:-1}

# ── Kill any stale process on this port ───────────────────────────────────
fuser -k ${PORT}/tcp 2>/dev/null || true

# ── Create data dirs ──────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"/{db,voices,cache_audio,memory,projects,interview,logs}

# ── Start server ──────────────────────────────────────────────────────────
cd "$REPO_DIR"
source .venv-gpu/bin/activate
cd server

echo "[launcher] Starting LLM server on port $PORT"
echo "[launcher] DATA_DIR=$DATA_DIR"
echo "[launcher] MODEL_PATH=${MODEL_PATH:-<not set — will use MODEL_ID>}"
echo "[launcher] STT_MODEL=$STT_MODEL  STT_GPU=$STT_GPU"

python -m uvicorn code.api.main:app --host "$HOST" --port "$PORT"
