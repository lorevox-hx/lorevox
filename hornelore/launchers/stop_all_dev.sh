#!/usr/bin/env bash
# launchers/stop_all_dev.sh — Lorevox v7.4D
# Stop all three Lorevox dev services (backend, TTS, UI).
# Safe to run even if services are not currently running.
#
# Usage:
#   bash launchers/stop_all_dev.sh

echo "[stop] Stopping Lorevox dev services..."

pkill -f "uvicorn.*8000" 2>/dev/null && echo "[stop] Backend (8000) stopped" || echo "[stop] Backend (8000) was not running"
pkill -f "uvicorn.*8001" 2>/dev/null && echo "[stop] TTS (8001) stopped"     || echo "[stop] TTS (8001) was not running"
pkill -f "lorevox-serve.py"  2>/dev/null && echo "[stop] UI (8080) stopped"  || echo "[stop] UI (8080) was not running"

# Belt-and-suspenders: also release the ports directly if pkill missed anything
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true

echo "[stop] Done. Ports 8000, 8001, 8080 are clear."
