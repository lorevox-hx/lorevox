#!/usr/bin/env bash
# launchers/run_all_dev.sh — Hornelore
# Single-command dev launcher. Starts backend, TTS, and UI server.
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo ""
echo "════════════════════════════════════════════════════════"
echo "  Hornelore — Starting dev environment"
echo "  Repo: $REPO_DIR"
echo "════════════════════════════════════════════════════════"
echo ""

echo "[launcher] Clearing ports 8000, 8001, 8082..."
pkill -f "uvicorn.*8000"    2>/dev/null || true
pkill -f "uvicorn.*8001"    2>/dev/null || true
pkill -f "hornelore-serve.py" 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true
fuser -k 8082/tcp 2>/dev/null || true
sleep 1
echo "[launcher] Ports cleared."
echo ""

echo "[launcher] Starting LLM backend on port 8000..."
gnome-terminal --title="Hornelore Backend (8000)" -- bash -c "
  cd \"$REPO_DIR\"
  echo '── Hornelore LLM Backend ───────────────────────────'
  bash launchers/run_gpu_8000.sh
  exec bash
" 2>/dev/null || {
  echo "[launcher] gnome-terminal not found — starting backend in background"
  cd "$REPO_DIR"
  bash launchers/run_gpu_8000.sh &
  BACKEND_PID=$!
  echo "[launcher] Backend PID: $BACKEND_PID"
}

echo "[launcher] Starting TTS server on port 8001..."
gnome-terminal --title="Hornelore TTS (8001)" -- bash -c "
  cd \"$REPO_DIR\"
  echo '── Hornelore TTS Server ───────────────────────────'
  bash launchers/run_tts_8001.sh
  exec bash
" 2>/dev/null || {
  echo "[launcher] gnome-terminal not found — starting TTS in background"
  cd "$REPO_DIR"
  bash launchers/run_tts_8001.sh &
  TTS_PID=$!
  echo "[launcher] TTS PID: $TTS_PID"
}

echo ""
echo "[launcher] Waiting 8 seconds for services to come up..."
sleep 8

echo "[launcher] Warming LLM (first response will be fast)..."
cd "$REPO_DIR"
python3 scripts/warm_llm.py || echo "[launcher] LLM warmup skipped (backend not yet ready — it may still be loading the model)"

echo "[launcher] Warming TTS..."
python3 scripts/warm_tts.py || echo "[launcher] TTS warmup skipped (TTS not yet ready)"

echo ""
echo "[launcher] Starting UI server on port 8082..."
gnome-terminal --title="Hornelore UI (8082)" -- bash -c "
  cd \"$REPO_DIR\"
  echo '── Hornelore UI Server ────────────────────────────'
  python3 hornelore-serve.py
  exec bash
" 2>/dev/null || {
  echo "[launcher] gnome-terminal not found — starting UI server in background"
  cd "$REPO_DIR"
  python3 hornelore-serve.py &
  UI_PID=$!
  echo "[launcher] UI server PID: $UI_PID"
}

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Hornelore is ready."
echo ""
echo "  Open:    http://localhost:8082/ui/hornelore1.0.html"
echo ""
echo "  Backend : http://localhost:8000"
echo "  TTS     : http://localhost:8001"
echo "  UI      : http://localhost:8082"
echo ""
echo "  To stop all services:"
echo "    bash launchers/stop_all_dev.sh"
echo "════════════════════════════════════════════════════════"
echo ""
