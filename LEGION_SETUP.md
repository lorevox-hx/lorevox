# Lorevox — Legion Pro 7i Gen 10 Setup Guide

**Hardware:** Lenovo Legion Pro 7i Gen 10 · RTX 5080 (Blackwell) · Windows 11 fresh install
**Goal:** WSL2 + CUDA → clone repo → both servers running → interview pipeline tested

---

## Phase 1 — Windows Prerequisites

### 1.1 Windows Update
Run Windows Update fully before anything else. RTX 5080 drivers and WSL2 kernels ship via Windows Update.

Start → Settings → Windows Update → Check for updates → install all → reboot.

### 1.2 NVIDIA Driver (RTX 5080 / Blackwell)
The RTX 5080 needs driver **572+** for Blackwell (sm_100) support.

1. Go to https://www.nvidia.com/download/index.aspx
2. Select: **GeForce → RTX 5080 → Windows 11 → Game Ready Driver**
3. Download and install.
4. Reboot.
5. Verify in WSL later with `nvidia-smi`.

> **Note:** Do NOT install CUDA toolkit from the NVIDIA site — you'll install it inside WSL2 instead.

---

## Phase 2 — WSL2 + Ubuntu

### 2.1 Enable WSL2

Open **PowerShell as Administrator** and run:

```powershell
wsl --install
```

This installs WSL2 and Ubuntu 24.04 LTS by default. Reboot when prompted.

If WSL was already partially installed, force Ubuntu 24.04:

```powershell
wsl --install -d Ubuntu-24.04
wsl --set-default-version 2
```

### 2.2 First Ubuntu Launch

After reboot, open **Ubuntu** from the Start menu. It will finish setup and ask for a username/password. Use something simple (e.g., `chris` / a short password) — you'll type it often with `sudo`.

### 2.3 Update Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential python3-pip python3-venv unzip
```

### 2.4 CUDA Toolkit 12.8 inside WSL2

NVIDIA provides a WSL-specific CUDA toolkit (no driver install needed — driver is shared from Windows).

```bash
# Add NVIDIA package repo for WSL-Ubuntu
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update

# Install CUDA 12.8 toolkit (compiler + libs, no driver)
sudo apt-get install -y cuda-toolkit-12-8
```

Add CUDA to your PATH — paste these into `~/.bashrc`:

```bash
echo 'export PATH=/usr/local/cuda-12.8/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.8/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

Verify:

```bash
nvidia-smi          # should show RTX 5080
nvcc --version      # should show 12.8
```

---

## Phase 3 — Model Files

The Llama 3.1-8B model needs to be on the new machine at `C:\Llama-3.1-8B\`.
Choose the fastest transfer method available:

### Option A — USB 3.2 / Thunderbolt Drive (recommended)
Fastest if you have a fast external drive. Model folder is ~16 GB (4-bit GGUF) or ~30 GB (full BF16 HF format).

On the **old laptop**, copy:
```
C:\Llama-3.1-8B\   →   external drive
```

On the **new laptop**, paste back to:
```
C:\Llama-3.1-8B\
```

Expected folder structure:
```
C:\Llama-3.1-8B\
  hf\
    Meta-Llama-3.1-8B-Instruct\
      config.json
      tokenizer.json
      model-00001-of-00004.safetensors
      ...
  hf_home\
    ...
```

### Option B — Local Network (if both laptops are on the same WiFi/LAN)

On the old laptop in PowerShell:
```powershell
# Share the folder temporarily
net share llama=C:\Llama-3.1-8B /GRANT:Everyone,FULL
```

On the new laptop — open File Explorer → `\\OldLaptopName\llama` → copy across.

### Option C — HuggingFace Download (if you don't have the old laptop handy)

This requires ~30 GB download. In WSL2:

```bash
pip install huggingface-hub --break-system-packages
huggingface-cli login   # paste your HF token
huggingface-cli download meta-llama/Meta-Llama-3.1-8B-Instruct \
  --local-dir /mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct
```

---

## Phase 4 — GitHub Desktop + Repo

### 4.1 GitHub Desktop

1. Download from https://desktop.github.com/
2. Install and sign in with your GitHub account.
3. File → Clone repository → `lorevox-hx/lorevox`
4. Set local path to: `C:\Users\chris\lorevox`
5. Click Clone.

### 4.2 SSH Key (for WSL git operations)

GitHub Desktop handles the Windows-side pushing fine, but WSL also needs SSH access:

```bash
# In WSL terminal
ssh-keygen -t ed25519 -C "dev@lorevox.com"
# Press Enter for all prompts (default path, no passphrase)

cat ~/.ssh/id_ed25519.pub
# Copy the output
```

Go to https://github.com/settings/keys → New SSH key → paste → Save.

Test:
```bash
ssh -T git@github.com
# Should say: Hi lorevox-hx! You've successfully authenticated...
```

Set the WSL remote to SSH:
```bash
cd /mnt/c/Users/chris/lorevox
git remote set-url origin git@github.com:lorevox-hx/lorevox.git
```

---

## Phase 5 — Python Environments

The repo uses **two separate venvs** to avoid torch version conflicts:

| venv | Port | Contents |
|------|------|----------|
| `.venv-gpu` | 8000 | PyTorch (Blackwell), transformers, faster-whisper |
| `.venv-tts` | 8001 | Coqui TTS (pins older torch) |

```bash
cd /mnt/c/Users/chris/lorevox
```

### 5.1 LLM + STT venv (`.venv-gpu`)

```bash
python3 -m venv .venv-gpu
source .venv-gpu/bin/activate

# PyTorch for Blackwell (RTX 5080 = sm_100, requires torch 2.6+ or nightly)
pip install --pre torch torchvision torchaudio \
  --index-url https://download.pytorch.org/whl/nightly/cu128

# Core server deps
pip install -r server/requirements.blackwell.txt

# Verify GPU is detected
python -c "import torch; print(torch.cuda.get_device_name(0))"
# Should print: NVIDIA GeForce RTX 5080

deactivate
```

> **Blackwell note:** PyTorch 2.6 stable supports sm_100 via CUDA 12.8. If you hit "no kernel image" errors, use `--pre` nightly until 2.7 stable ships.

### 5.2 TTS venv (`.venv-tts`)

```bash
python3 -m venv .venv-tts
source .venv-tts/bin/activate

pip install -r server/requirements.tts.txt

# Pre-download the TTS model so it's cached before first run
python -c "from TTS.api import TTS; TTS('tts_models/en/vctk/vits')"

deactivate
```

---

## Phase 6 — Configuration

### 6.1 Create `.env`

```bash
cd /mnt/c/Users/chris/lorevox
cp .env.example .env
```

The `.env.example` defaults are already correct for this machine. Verify these key lines:

```bash
nano .env
```

Check / edit:
```
DATA_DIR=/mnt/c/lorevox_data
MODEL_PATH=/mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct
HF_HOME=/mnt/c/Llama-3.1-8B/hf_home
STT_MODEL=large-v3
STT_GPU=1
TTS_GPU=0
MAX_NEW_TOKENS=7168
```

Save and exit (`Ctrl+X → Y → Enter` in nano).

### 6.2 Create Data Directories

```bash
mkdir -p /mnt/c/lorevox_data/{db,voices,cache_audio,memory,projects,interview,logs}
```

### 6.3 Git Identity (WSL only)

```bash
cd /mnt/c/Users/chris/lorevox
git config user.email "dev@lorevox.com"
git config user.name "Chris"
```

---

## Phase 7 — Seed the Database

```bash
cd /mnt/c/Users/chris/lorevox
source .venv-gpu/bin/activate

# Initialize DB and seed system docs
export DATA_DIR=/mnt/c/lorevox_data
python scripts/seed_oral_history.py

# If you have other seed scripts, run them too:
# python scripts/seed_rag_docs.py

deactivate
```

Expected output:
```
Seeded oral-history docs into RAG.
RAG stats: {'doc_count': 2, ...}
```

---

## Phase 8 — Launch and Test

You need **two terminal windows** in WSL.

### Terminal 1 — LLM + STT server (port 8000)

```bash
bash /mnt/c/Users/chris/lorevox/launchers/run_gpu_8000.sh
```

Wait for:
```
[launcher] Starting LLM server on port 8000
INFO:     Application startup complete.
```

Model load takes 30–60 seconds the first time. Watch for:
```
[STT] faster-whisper: large-v3 on cuda (float16)
```

### Terminal 2 — TTS server (port 8001)

```bash
bash /mnt/c/Users/chris/lorevox/launchers/run_tts_8001.sh
```

Wait for:
```
[launcher] Starting TTS server on port 8001
INFO:     Application startup complete.
```

### Open the UI

In a browser: **http://localhost:8000**

### Quick Smoke Tests

**1. Health checks:**
```bash
curl http://localhost:8000/api/ping
# {"ok": true}

curl http://localhost:8000/api/stt/status
# {"ok": true, "engine": "faster_whisper", "device": "cuda", "model": "large-v3"}

curl http://localhost:8001/api/tts/status
# {"ok": true, ...}
```

**2. Chat test:** Type a message in the chat box → send → verify a response streams in.

**3. Voice test:** Click the mic button → say something → verify it transcribes into the text box.

**4. TTS test:** Enable "Auto-speak" → send a chat message → verify audio plays sentence by sentence as the response streams.

**5. Interview test:** Start a new interview → verify the first question is spoken aloud.

---

## Troubleshooting

### `nvidia-smi` not found in WSL
Driver wasn't installed on Windows side, or WSL kernel is outdated.
```bash
wsl --update   # in PowerShell (Windows side)
```

### "no kernel image is available for execution on the device" (PyTorch)
RTX 5080 (sm_100) needs torch 2.6+ compiled for CUDA 12.8.
Use the nightly install command from Phase 5.1.

### Model loads on CPU instead of GPU
Check that `MODEL_PATH` in `.env` points to the correct HF folder.
Check `LOAD_IN_4BIT=1` is set (reduces VRAM to ~5 GB).

### TTS stuttering or slow
`TTS_GPU=0` intentionally runs TTS on CPU to save VRAM for LLM+STT. The VITS model on CPU produces ~200-400ms per sentence which is normal. If you have VRAM headroom you can set `TTS_GPU=1`.

### Port already in use
```bash
fuser -k 8000/tcp
fuser -k 8001/tcp
```
Then re-run the launchers.

### faster-whisper not available, falling back to openai-whisper
```bash
source .venv-gpu/bin/activate
pip install faster-whisper
```

---

## VRAM Budget (RTX 5080, 16 GB)

| Component | VRAM |
|-----------|------|
| Llama 3.1-8B (4-bit NF4) | ~5 GB |
| Whisper large-v3 (CUDA fp16) | ~3 GB |
| TTS VITS (CPU — 0 VRAM) | 0 GB |
| **Total used** | **~8 GB** |
| **Headroom** | **~8 GB** |

---

*Last updated: March 2026*
