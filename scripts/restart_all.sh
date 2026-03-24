#!/usr/bin/env bash
# scripts/restart_all.sh — Lorevox 7.4C
# Stops all services then starts them again.
#
# Usage:
#   bash scripts/restart_all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/stop_all.sh"
sleep 1
"$ROOT/start_all.sh"
