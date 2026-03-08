#!/usr/bin/env bash
set -e
fuser -k 8000/tcp || true

cd /mnt/c/Users/chris/lorevox
source .venv-gpu/bin/activate

export USE_TTS=0
export DATA_DIR="/home/chris/lorevox_data"
mkdir -p "$DATA_DIR"/{db,voices,cache_audio,memory,projects,interview,logs}

cd server
python -m uvicorn code.api.main:app --host 0.0.0.0 --port 8000
