# Lorevox

**Lorevox** is a local-first AI memory and oral history platform. It lets you conduct structured life-history interviews with a local LLM, store memories and facts, browse a personal timeline, and chat — all running privately on your own hardware with no cloud dependency.

---

## Features

- **Oral history interviews** — guided multi-section interview sessions with voice input (Whisper STT) and voice output (TTS), streamed sentence-by-sentence for near-real-time conversation
- **Memory archive** — structured storage of life events, people, facts, and media organized on a personal timeline
- **Calendar** — attach events and memories to specific dates
- **RAG chat** — ask questions about stored memories using retrieval-augmented generation
- **Fully local** — runs on a local LLM (Llama 3.1-8B), local STT (faster-whisper), and local TTS (Coqui VITS); no internet required after setup

---

## Architecture

Two separate servers run in parallel:

| Server | Port | venv | Role |
|--------|------|------|------|
| LLM + STT | 8000 | `.venv-gpu` | FastAPI, transformers, faster-whisper, WebSocket chat |
| TTS | 8001 | `.venv-tts` | Coqui TTS, sentence-streaming audio |

The UI is served statically from `ui/index.html` and communicates with both servers.

---

## Requirements

- **OS:** Windows 11 + WSL2 (Ubuntu 22.04 or 24.04)
- **GPU:** NVIDIA RTX 3080+ recommended (16 GB VRAM for RTX 5080 / Blackwell)
- **CUDA:** 12.4+ (12.8 for Blackwell / RTX 5080)
- **Python:** 3.11+
- **Model:** Meta Llama 3.1-8B-Instruct (HuggingFace format)

---

## Quick Start

### 1. Clone the repo

```bash
git clone git@github.com:lorevox-hx/lorevox.git
cd lorevox
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env and set MODEL_PATH, DATA_DIR, etc.
nano .env
```

Key variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `MODEL_PATH` | Path to local Llama model | `/mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct` |
| `DATA_DIR` | Where Lorevox stores its data | `/mnt/c/lorevox_data` |
| `STT_MODEL` | Whisper model size | `large-v3` |
| `STT_GPU` | Use GPU for STT (`1`/`0`) | `1` |
| `TTS_GPU` | Use GPU for TTS (`1`/`0`) | `0` |

### 3. Create the Python environments

```bash
# LLM + STT environment
python3 -m venv .venv-gpu
source .venv-gpu/bin/activate
pip install -r server/requirements.blackwell.txt
deactivate

# TTS environment
python3 -m venv .venv-tts
source .venv-tts/bin/activate
pip install -r server/requirements.tts.txt
deactivate
```

### 4. Seed the database

```bash
source .venv-gpu/bin/activate
export DATA_DIR=/mnt/c/lorevox_data
python scripts/seed_oral_history.py
deactivate
```

### 5. Launch

Open two terminals:

```bash
# Terminal 1 — LLM + STT
bash launchers/run_gpu_8000.sh

# Terminal 2 — TTS
bash launchers/run_tts_8001.sh
```

Then open **http://localhost:8000** in your browser.

---

## Project Structure

```
lorevox/
├── server/
│   └── code/
│       └── api/
│           ├── main.py              # FastAPI app entry point
│           ├── api.py               # Core LLM, embed, chat endpoints
│           └── routers/             # Route modules (people, interview, stt, ...)
├── ui/
│   └── index.html                   # Single-file frontend (vanilla JS)
├── scripts/
│   ├── seed_oral_history.py         # Seed interview system docs into RAG
│   └── seed_rag_docs.py             # General RAG doc seeder
├── launchers/
│   ├── run_gpu_8000.sh              # Start LLM + STT server
│   └── run_tts_8001.sh              # Start TTS server
├── .env.example                     # Reference config (copy to .env)
└── LEGION_SETUP.md                  # New machine setup guide
```

---

## Voice Pipeline

The interview and chat use a real-time voice pipeline:

1. **STT:** Browser captures mic audio via `MediaRecorder` → POSTs WebM to `/api/stt/transcribe` → faster-whisper returns transcript
2. **LLM:** Text sent over WebSocket → tokens streamed back to the UI
3. **TTS:** As tokens arrive, sentence boundaries are detected → each complete sentence POSTs to `/api/tts/speak_stream` → WAV audio decoded and queued in `AudioContext` for gapless playback

First audio typically starts within 1.5–2.5 seconds of the LLM beginning to generate.

---

## VRAM Budget (RTX 5080 / 16 GB)

| Component | VRAM |
|-----------|------|
| Llama 3.1-8B (4-bit NF4) | ~5 GB |
| Whisper large-v3 (CUDA fp16) | ~3 GB |
| Coqui TTS VITS (CPU) | 0 GB |
| **Total** | **~8 GB** |

---

## License

MIT — see [LICENSE](LICENSE)
