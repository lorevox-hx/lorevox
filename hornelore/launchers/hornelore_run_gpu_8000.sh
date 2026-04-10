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

# WO-10M: Token cap separation by task.
# The old 7168 default was an unsafe ceiling for a 16 GB co-resident stack
# once WO-10 memory features (rolling summary + thread anchor + recent turns)
# are active. Chat replies in practice are 1–3 sentences for operator_feedback
# and 4–8 for content_answer, so 256 is a safe default that still covers
# normal operator turns. Raise to 512 manually only after stability is proven.
# Extraction and summary get their own caps.
export MAX_NEW_TOKENS=${MAX_NEW_TOKENS:-256}
export MAX_NEW_TOKENS_CHAT=${MAX_NEW_TOKENS_CHAT:-256}
export MAX_NEW_TOKENS_EXTRACT=${MAX_NEW_TOKENS_EXTRACT:-128}
export MAX_NEW_TOKENS_SUMMARY=${MAX_NEW_TOKENS_SUMMARY:-1024}

# WO-10M: VRAM guard thresholds (read by chat_ws.py pre-generation guard).
# required_mb = VRAM_GUARD_BASE_MB + (prompt_tokens + max_new) * VRAM_GUARD_PER_TOKEN_MB
# 0.14 MB/token covers KV cache (~128 KB) + forward-pass activation overhead.
# 600 MB base covers transient MLP down_proj spikes (SwiGLU bottleneck).
export VRAM_GUARD_BASE_MB=${VRAM_GUARD_BASE_MB:-600}
export VRAM_GUARD_PER_TOKEN_MB=${VRAM_GUARD_PER_TOKEN_MB:-0.14}
export VRAM_GUARD_ENABLED=${VRAM_GUARD_ENABLED:-1}

# WO-10M: Allocator fragmentation mitigation.
# Long-running WebSocket inference accumulates fixed-size segments in the
# PyTorch CUDA allocator; a large transient allocation can then fail even
# with enough total free VRAM, because no single segment is big enough.
# expandable_segments lets the allocator re-map physical VRAM across
# segment boundaries so small gaps don't block large tensors.
export PYTORCH_CUDA_ALLOC_CONF=${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}

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
echo "[launcher] WO-10M caps: chat=$MAX_NEW_TOKENS_CHAT extract=$MAX_NEW_TOKENS_EXTRACT summary=$MAX_NEW_TOKENS_SUMMARY"
echo "[launcher] WO-10M VRAM guard: enabled=$VRAM_GUARD_ENABLED base=${VRAM_GUARD_BASE_MB}MB per_token=${VRAM_GUARD_PER_TOKEN_MB}MB"
echo "[launcher] WO-10M allocator: PYTORCH_CUDA_ALLOC_CONF=$PYTORCH_CUDA_ALLOC_CONF"

python -m uvicorn code.api.main:app --host "$HOST" --port "$PORT"
