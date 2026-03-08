#!/usr/bin/env bash
set -e
fuser -k 8001/tcp || true

cd /mnt/c/Users/chris/lorevox
source .venv-tts/bin/activate

export USE_TTS=1
export DATA_DIR="/home/chris/lorevox_data"
mkdir -p "$DATA_DIR"/{db,voices,cache_audio,memory,projects,interview,logs}

export TTS_MODEL="tts_models/en/vctk/vits"
export TTS_GPU=1
export TTS_SPEAKER_LORI="p335"

cd server
python -m uvicorn code.api.main:app --host 0.0.0.0 --port 8001
