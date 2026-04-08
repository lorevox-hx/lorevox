#!/usr/bin/env bash
# launchers/stop_all_dev.sh — Hornelore
# Stop all three Hornelore dev services.

echo "[stop] Stopping Hornelore dev services..."

pkill -f "uvicorn.*8000" 2>/dev/null && echo "[stop] Backend (8000) stopped" || echo "[stop] Backend (8000) was not running"
pkill -f "uvicorn.*8001" 2>/dev/null && echo "[stop] TTS (8001) stopped"     || echo "[stop] TTS (8001) was not running"
pkill -f "hornelore-serve.py"  2>/dev/null && echo "[stop] UI (8082) stopped"  || echo "[stop] UI (8082) was not running"

fuser -k 8000/tcp 2>/dev/null || true
fuser -k 8001/tcp 2>/dev/null || true
fuser -k 8082/tcp 2>/dev/null || true

echo "[stop] Done. Ports 8000, 8001, 8082 are clear."
