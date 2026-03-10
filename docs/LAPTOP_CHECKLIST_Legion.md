# Lorevox — Legion Pro 7i Gen 10 Laptop Test Checklist

**Machine:** Lenovo Legion Pro 7i Gen 10 · RTX 5080 · Windows 11
**Runtime:** WSL2 Ubuntu 24.04 · CUDA 12.8 · two venvs (`.venv-gpu`, `.venv-tts`)
**Repo:** `C:\Users\chris\lorevox` | **Data:** `C:\lorevox_data` | **Model:** `C:\Llama-3.1-8B`

Work through this top to bottom on first install. Each section has a clear pass/fail check.

---

## Phase 1 — Windows Prerequisites

- [ ] Windows Update fully applied and rebooted
- [ ] NVIDIA driver 572+ installed (RTX 5080 / Blackwell requires 572+)
  - Verify: `nvidia-smi` from WSL shows the RTX 5080
- [ ] WSL2 enabled (`wsl --install` from admin PowerShell)
- [ ] Ubuntu 24.04 installed and set as default WSL distro

**Pass:** `nvidia-smi` inside WSL shows `CUDA Version: 12.x` and the RTX 5080 name.

---

## Phase 2 — Folder Layout

Create these on Windows (do once):

```
mkdir C:\lorevox_data
mkdir C:\Llama-3.1-8B
```

Data subfolders (the launcher creates these automatically, but you can pre-create):

```
mkdir C:\lorevox_data\db
mkdir C:\lorevox_data\voices
mkdir C:\lorevox_data\cache_audio
mkdir C:\lorevox_data\memory
mkdir C:\lorevox_data\projects
mkdir C:\lorevox_data\interview
mkdir C:\lorevox_data\logs
```

- [ ] `C:\lorevox_data` exists
- [ ] `C:\Llama-3.1-8B` exists (model files go here)
- [ ] `C:\Users\chris\lorevox` is the repo (not `C:\lorevox`)

---

## Phase 3 — CUDA Toolkit in WSL

> Install the toolkit **inside WSL**, not from the Windows NVIDIA site.

```bash
# Inside Ubuntu WSL:
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
sudo apt-get -y install cuda-toolkit-12-8
```

- [ ] `nvcc --version` inside WSL shows 12.8
- [ ] `python3 -c "import torch; print(torch.cuda.is_available())"` returns `True` (after venv setup)

---

## Phase 4 — Clone / Open the Repo

```bash
# Inside WSL (repo already exists — just enter it):
cd /mnt/c/Users/chris/lorevox
git status
git log --oneline -5
```

- [ ] Repo is present at `/mnt/c/Users/chris/lorevox`
- [ ] `git status` is clean (no unexpected modified files)
- [ ] Latest commit is the v6.2 work

---

## Phase 5 — Create Venvs

```bash
cd /mnt/c/Users/chris/lorevox
python3 -m venv .venv-gpu
python3 -m venv .venv-tts
```

- [ ] `.venv-gpu` folder exists
- [ ] `.venv-tts` folder exists
- [ ] Neither appears in `git status` (covered by `.gitignore`)

---

## Phase 6 — Install GPU / LLM Requirements

> Torch for Blackwell (sm_100) needs cu128 build — install it first before the requirements file.

```bash
source .venv-gpu/bin/activate
pip install --upgrade pip

# Install Blackwell-compatible torch (cu128) FIRST:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128

# Then the rest:
pip install -r server/requirements.blackwell.txt
deactivate
```

- [ ] `pip install torch ...` completes without error
- [ ] `python3 -c "import torch; print(torch.version.cuda)"` shows `12.8`
- [ ] `python3 -c "import torch; print(torch.cuda.get_device_name(0))"` shows RTX 5080

**Caution:** If `flash-attn` fails to build, comment it out in `requirements.blackwell.txt` — the server runs without it (slower attention only).

---

## Phase 7 — Install TTS Requirements

```bash
source .venv-tts/bin/activate
pip install --upgrade pip
pip install -r server/requirements.tts.txt
deactivate
```

- [ ] Coqui TTS installs without error
- [ ] `python3 -c "from TTS.api import TTS; print('TTS ok')"` passes

---

## Phase 8 — Configure `.env`

```bash
cd /mnt/c/Users/chris/lorevox
cp .env.example .env
```

Open `.env` and confirm these paths match your machine:

```
DATA_DIR=/mnt/c/lorevox_data
MODEL_PATH=/mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct
HF_HOME=/mnt/c/Llama-3.1-8B/hf_home
HF_HUB_OFFLINE=1
TRANSFORMERS_OFFLINE=1
```

- [ ] `.env` exists at repo root
- [ ] `git status` does **not** show `.env` (must be gitignored)
- [ ] All three paths point to real folders on your machine

---

## Phase 9 — Model in Place

Expected location:

```
C:\Llama-3.1-8B\hf\Meta-Llama-3.1-8B-Instruct\
C:\Llama-3.1-8B\hf_home\
```

In WSL:

```bash
ls /mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct/
# Should show: config.json, tokenizer.json, model-*.safetensors, etc.
```

- [ ] Model folder exists with `.safetensors` files inside
- [ ] `HF_HUB_OFFLINE=1` so the server won't try to fetch anything on startup

---

## Phase 10 — Quick Model Smoke Test

Before starting the full server:

```bash
cd /mnt/c/Users/chris/lorevox
source .venv-gpu/bin/activate
set -a; source .env; set +a

python3 - << 'EOF'
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
import os

model_path = os.environ["MODEL_PATH"]
print(f"Loading from: {model_path}")
tok = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
print("Tokenizer OK")
# Load only config to check — skip full model load for speed
from transformers import AutoConfig
cfg = AutoConfig.from_pretrained(model_path, local_files_only=True)
print(f"Model config OK: {cfg.model_type}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {torch.cuda.get_device_name(0)}")
EOF
```

- [ ] Script prints `Tokenizer OK` and `Model config OK`
- [ ] `CUDA available: True`
- [ ] No `FileNotFoundError` or `OSError`

---

## Phase 11 — Start the LLM Server

```bash
# Terminal 1 — LLM + STT server
cd /mnt/c/Users/chris/lorevox
bash launchers/run_gpu_8000.sh
```

Watch the output. Expected sequence:

```
[launcher] Loaded .env
[launcher] Starting LLM server on port 8000
...
INFO: Application startup complete.
```

- [ ] No import errors on startup
- [ ] Server reports `Application startup complete.`
- [ ] `curl http://127.0.0.1:8000/api/ping` returns `{"status":"ok"}` (or similar)

---

## Phase 12 — Start the TTS Server

```bash
# Terminal 2 — TTS server
cd /mnt/c/Users/chris/lorevox
bash launchers/run_tts_8001.sh
```

- [ ] TTS server starts on port 8001
- [ ] No missing dependency errors

---

## Phase 13 — Open the UI

Open `ui/6.1.html` directly in your browser (double-click or drag into Chrome/Edge).

- [ ] UI loads without console errors
- [ ] Status bar shows `v6.2`
- [ ] Chat panel is visible

---

## Phase 14 — First Functional Tests

Run these in order. Stop if anything fails — don't skip forward.

| # | Test | Pass signal |
|---|------|-------------|
| 1 | Create a person in Profile tab | Person appears in sidebar |
| 2 | Save profile | "💾 Profile saved." system bubble |
| 3 | Send a chat message to Lori | Lori responds in chat panel |
| 4 | Start interview | First question appears in chat |
| 5 | Speak an answer (mic) | STT transcribes speech to text |
| 6 | Submit answer | Next question appears, progress bar advances |
| 7 | TTS play | Lori's response plays as audio |
| 8 | Check Private Segments tab | Tab is accessible, shows empty state message |

---

## Phase 15 — Track A + Track B Tests

Only after Phase 14 passes fully:

**Track A (Safety):**
- [ ] Type an answer that mentions distress or crisis
- [ ] Safety overlay appears with resource cards
- [ ] Cards are tap-to-call links (not plain text)
- [ ] "Take a break" surfaces resources in chat

**Track B (Emotion Signal):**
- [ ] Click the emotion-aware toggle
- [ ] Browser asks for camera permission
- [ ] Permission card appears; accept
- [ ] Camera dot indicator goes active
- [ ] Affect state visible in debug pills (if `LV_SHOW_DEBUG_PILLS=1`)

---

## Phase 16 — Git Hygiene Check

Before committing anything from the laptop:

```bash
git status
```

Must NOT appear:

- `.env`
- `.venv-gpu/` or `.venv-tts/`
- `C:\lorevox_data` contents
- `*.sqlite3`
- `*.safetensors`
- `*.log`

- [ ] `git status` shows only files you intentionally changed
- [ ] `git diff --stat` shows only intentional edits

---

## Quick Reference — Launcher Commands

```bash
# Start LLM + STT server
bash /mnt/c/Users/chris/lorevox/launchers/run_gpu_8000.sh

# Start TTS server (second terminal)
bash /mnt/c/Users/chris/lorevox/launchers/run_tts_8001.sh

# Check server is alive
curl http://127.0.0.1:8000/api/ping
curl http://127.0.0.1:8001/api/ping

# Git sync (after changes)
git -C /mnt/c/Users/chris/lorevox push origin main
```
