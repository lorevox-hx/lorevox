#!/usr/bin/env bash
# launchers/run_all_dev.sh — Lorevox v7.4D
# Single-command dev launcher. Starts backend, TTS, and UI server in
# separate gnome-terminal windows, then warms both AI services.
#
# Port layout:
#   8000 — LLM backend  (run_gpu_8000.sh)
#   8001 — TTS server   (run_tts_8001.sh)
#   8080 — UI server    (lorevox-serve.py)
#
# Usage:
#   bash launchers/run_all_dev.sh
#
# Requires: gnome-terminal, bash, python3

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Lorevox — Starting dev environment (v7.4D)"
echo "  Repo: $REPO_DIR"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Kill any stale processes on our ports ─────────────────────────
echo "[launcher] Clearing ports 8000, 8001, 8080..."
pkill -f "uvicorn.*8000"    2>/dev/null || true
pkill -f "uvicorn.*8001"    2>/dev/null || true
pkill -f "lorevox-serve.py" 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true
sleep 1
echo "[launcher] Ports cleared."
echo ""

# ── Step 2: Terminal A — LLM backend (port 8000) ──────────────────────────
echo "[launcher] Starting LLM backend on port 8000..."
gnome-terminal --title="Lorevox Backend (8000)" -- bash -c "
  cd \"$REPO_DIR\"
  echo '── Lorevox LLM Backend ─────────────────────────────'
  bash launchers/run_gpu_8000.sh
  exec bash
" 2>/dev/null || {
  # Fallback: run in background if gnome-terminal not available (e.g. WSL headless)
  echo "[launcher] gnome-terminal not found — starting backend in background"
  cd "$REPO_DIR"
  bash launchers/run_gpu_8000.sh &
  BACKEND_PID=$!
  echo "[launcher] Backend PID: $BACKEND_PID"
}

# ── Step 3: Terminal B — TTS server (port 8001) ───────────────────────────
echo "[launcher] Starting TTS server on port 8001..."
gnome-terminal --title="Lorevox TTS (8001)" -- bash -c "
  cd \"$REPO_DIR\"
  echo '── Lorevox TTS Server ──────────────────────────────'
  bash launchers/run_tts_8001.sh
  exec bash
" 2>/dev/null || {
  echo "[launcher] gnome-terminal not found — starting TTS in background"
  cd "$REPO_DIR"
  bash launchers/run_tts_8001.sh &
  TTS_PID=$!
  echo "[launcher] TTS PID: $TTS_PID"
}

# ── Step 4: Wait for services to be reachable ─────────────────────────────
echo ""
echo "[launcher] Waiting 8 seconds for services to come up..."
sleep 8

# ── Step 5: Warm LLM ──────────────────────────────────────────────────────
echo "[launcher] Warming LLM (first response will be fast)..."
cd "$REPO_DIR"
python3 scripts/warm_llm.py || echo "[launcher] LLM warmup skipped (backend not yet ready — it may still be loading the model)"

# ── Step 6: Warm TTS ──────────────────────────────────────────────────────
echo "[launcher] Warming TTS..."
python3 scripts/warm_tts.py || echo "[launcher] TTS warmup skipped (TTS not yet ready)"

# ── Step 7: Terminal C — UI server (port 8080) ────────────────────────────
echo ""
echo "[launcher] Starting UI server on port 8080..."
gnome-terminal --title="Lorevox UI (8080)" -- bash -c "
  cd \"$REPO_DIR\"
  echo '── Lorevox UI Server ───────────────────────────────'
  python3 lorevox-serve.py
  exec bash
" 2>/dev/null || {
  echo "[launcher] gnome-terminal not found — starting UI server in background"
  cd "$REPO_DIR"
  python3 lorevox-serve.py &
  UI_PID=$!
  echo "[launcher] UI server PID: $UI_PID"
}

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Lorevox is ready."
echo ""
echo "  Open: http://localhost:8080/ui/lori7.4c.html"
echo ""
echo "  Backend : http://localhost:8000"
echo "  TTS     : http://localhost:8001"
echo "  UI      : http://localhost:8080"
echo ""
echo "  To stop all services:"
echo "    bash launchers/stop_all_dev.sh"
echo "════════════════════════════════════════════════════════"
echo ""
