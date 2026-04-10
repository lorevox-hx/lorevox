#!/usr/bin/env bash
# Hornelore — LLM server (port 8000)
# Uses Hornelore repo config and hornelore_data.
set -e

REPO_DIR=/mnt/c/Users/chris/lorevox/hornelore
PARENT_REPO_DIR=/mnt/c/Users/chris/lorevox

# ── Load Hornelore .env (repo root) ───────────────────────────────────────
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  source "$REPO_DIR/.env"
  set +a
  echo "[launcher] Loaded Hornelore .env"
fi

# ── Defaults (only apply if not already set by Hornelore .env) ───────────
export USE_TTS=${USE_TTS:-0}
export DATA_DIR=${DATA_DIR:-/mnt/c/hornelore_data}
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
mkdir -p "$DATA_DIR"/{db,voices,cache_audio,memory,projects,interview,logs,templates}

# ── Start server ──────────────────────────────────────────────────────────
# Activate venv from parent repo (that's where the shared venv lives)
cd "$PARENT_REPO_DIR"
source .venv-gpu/bin/activate
# WO-10L: cwd MUST be the hornelore/server tree so `python -m uvicorn code.api.main:app`
# loads the hornelore source tree, NOT the stale parent server/ copy.
cd "$REPO_DIR/server"

echo "[launcher] cwd=$(pwd)"
echo "[launcher] Starting Hornelore LLM server on port $PORT"
echo "[launcher] DATA_DIR=$DATA_DIR"
echo "[launcher] MODEL_PATH=${MODEL_PATH:-<not set — will use MODEL_ID>}"
echo "[launcher] STT_MODEL=$STT_MODEL  STT_GPU=$STT_GPU"

python -m uvicorn code.api.main:app --host "$HOST" --port "$PORT"
