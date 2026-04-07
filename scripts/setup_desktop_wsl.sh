#!/usr/bin/env bash
# ============================================================
# Lorevox Desktop WSL Setup — Remaining Blockers
# Run from WSL:  cd /mnt/c/Users/chris/lorevox && bash scripts/setup_desktop_wsl.sh
# ============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="/mnt/c/lorevox_data"
MODELS_DIR="$DATA_DIR/models"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { printf "\n${CYAN}=== %s ===${NC}\n" "$1"; }
ok()   { printf "  ${GREEN}OK:${NC} %s\n" "$1"; }
warn() { printf "  ${YELLOW}WARN:${NC} %s\n" "$1"; }
fail() { printf "  ${RED}FAIL:${NC} %s\n" "$1"; }

cd "$REPO_DIR"

# ============================================================
# 1. Download TinyLlama GGUF (if missing)
# ============================================================
step "1/4 — TinyLlama GGUF model"

GGUF_FILE="$MODELS_DIR/TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf"
HF_REPO="TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF"
HF_FILENAME="tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

if [[ -f "$GGUF_FILE" ]]; then
    SIZE=$(du -m "$GGUF_FILE" | cut -f1)
    if [[ "$SIZE" -gt 500 ]]; then
        ok "TinyLlama GGUF already exists at $GGUF_FILE (${SIZE} MB)"
    else
        warn "GGUF file exists but looks corrupt (${SIZE} MB). Deleting and re-downloading."
        rm -f "$GGUF_FILE"
    fi
fi

if [[ ! -f "$GGUF_FILE" ]]; then
    mkdir -p "$MODELS_DIR"
    printf "  Downloading TinyLlama GGUF (~670 MB)...\n"

    if command -v huggingface-cli >/dev/null 2>&1; then
        printf "  Using huggingface-cli...\n"
        huggingface-cli download "$HF_REPO" "$HF_FILENAME" --local-dir "$MODELS_DIR"
        # huggingface-cli saves with the original filename (lowercase)
        DOWNLOADED="$MODELS_DIR/$HF_FILENAME"
        if [[ -f "$DOWNLOADED" && "$DOWNLOADED" != "$GGUF_FILE" ]]; then
            mv "$DOWNLOADED" "$GGUF_FILE"
        fi
    elif pip install -q huggingface_hub 2>/dev/null; then
        printf "  Installed huggingface_hub, using huggingface-cli...\n"
        huggingface-cli download "$HF_REPO" "$HF_FILENAME" --local-dir "$MODELS_DIR"
        DOWNLOADED="$MODELS_DIR/$HF_FILENAME"
        if [[ -f "$DOWNLOADED" && "$DOWNLOADED" != "$GGUF_FILE" ]]; then
            mv "$DOWNLOADED" "$GGUF_FILE"
        fi
    else
        # Fallback to curl with the correct resolve URL
        GGUF_URL="https://huggingface.co/$HF_REPO/resolve/main/$HF_FILENAME"
        printf "  Using curl (fallback)...\n"
        printf "  From: %s\n" "$GGUF_URL"
        curl -L --progress-bar -o "$GGUF_FILE" "$GGUF_URL"
    fi

    if [[ -f "$GGUF_FILE" ]]; then
        SIZE=$(du -m "$GGUF_FILE" | cut -f1)
        if [[ "$SIZE" -gt 500 ]]; then
            ok "Downloaded TinyLlama GGUF (${SIZE} MB)"
        else
            fail "File seems too small (${SIZE} MB). May be corrupted — delete and retry."
            fail "Manual download: huggingface-cli download $HF_REPO $HF_FILENAME --local-dir $MODELS_DIR"
        fi
    else
        fail "Download failed. Try manually:"
        fail "  huggingface-cli download $HF_REPO $HF_FILENAME --local-dir $MODELS_DIR"
    fi
fi

# ============================================================
# 2. npm install
# ============================================================
step "2/4 — Node.js dependencies (npm install)"

if command -v npm >/dev/null 2>&1; then
    printf "  Running npm install...\n"
    npm install 2>&1 | tail -5
    if [[ -d "$REPO_DIR/node_modules" ]]; then
        ok "node_modules installed"
    else
        fail "npm install did not create node_modules"
    fi
else
    # Try Windows npm via interop
    if command -v npm.cmd >/dev/null 2>&1; then
        printf "  WSL npm not found, using Windows npm.cmd...\n"
        npm.cmd install 2>&1 | tail -5
        ok "node_modules installed (via Windows npm)"
    else
        fail "npm not found in WSL or Windows PATH"
        printf "  Install Node.js, then re-run. Or run from PowerShell:\n"
        printf "    cd C:\\Users\\chris\\lorevox\n"
        printf "    npm install\n"
    fi
fi

# ============================================================
# 3. Python virtual environments
# ============================================================
step "3/4 — Python virtual environments"

# Detect python
PYTHON=""
for candidate in python3.11 python3.10 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
        PYTHON="$candidate"
        break
    fi
done

if [[ -z "$PYTHON" ]]; then
    fail "No Python found in WSL. Install python3 first:"
    printf "    sudo apt update && sudo apt install python3 python3-venv python3-pip\n"
else
    PYVER=$($PYTHON --version 2>&1)
    ok "Found $PYVER at $(command -v $PYTHON)"

    # --- .venv-gpu (main LLM + API server) ---
    printf "\n  Setting up .venv-gpu...\n"
    if [[ -d "$REPO_DIR/.venv-gpu" ]]; then
        ok ".venv-gpu already exists"
    else
        $PYTHON -m venv "$REPO_DIR/.venv-gpu"
        ok "Created .venv-gpu"
    fi

    printf "  Installing GPU requirements (this may take a few minutes)...\n"
    source "$REPO_DIR/.venv-gpu/bin/activate"
    pip install --upgrade pip -q 2>&1 | tail -1
    pip install -r "$REPO_DIR/server/requirements.blackwell.txt" 2>&1 | tail -5
    deactivate
    ok ".venv-gpu packages installed"

    # --- .venv-tts (Coqui TTS server) ---
    printf "\n  Setting up .venv-tts...\n"
    if [[ -d "$REPO_DIR/.venv-tts" ]]; then
        ok ".venv-tts already exists"
    else
        $PYTHON -m venv "$REPO_DIR/.venv-tts"
        ok "Created .venv-tts"
    fi

    printf "  Installing TTS requirements...\n"
    source "$REPO_DIR/.venv-tts/bin/activate"
    pip install --upgrade pip -q 2>&1 | tail -1
    pip install -r "$REPO_DIR/server/requirements.tts.txt" 2>&1 | tail -5
    deactivate
    ok ".venv-tts packages installed"
fi

# ============================================================
# 4. Check flash-attn and update ATTN_IMPL
# ============================================================
step "4/4 — Flash Attention check"

ENV_FILE="$REPO_DIR/.env"

if [[ -d "$REPO_DIR/.venv-gpu" ]]; then
    source "$REPO_DIR/.venv-gpu/bin/activate"

    if python -c "import flash_attn; print(flash_attn.__version__)" 2>/dev/null; then
        ok "flash-attn is installed"
        if [[ -f "$ENV_FILE" ]]; then
            # Update ATTN_IMPL to flash_attention_2
            sed -i 's/^ATTN_IMPL=sdpa$/ATTN_IMPL=flash_attention_2/' "$ENV_FILE"
            ok "Updated .env: ATTN_IMPL=flash_attention_2"
        fi
    else
        warn "flash-attn not installed (sdpa will be used — this is fine)"
        printf "  To install later (optional, may need CUDA toolkit):\n"
        printf "    source .venv-gpu/bin/activate\n"
        printf "    pip install flash-attn --no-build-isolation\n"
    fi

    deactivate
else
    warn "Skipped — .venv-gpu not available"
fi

# ============================================================
# Final summary
# ============================================================
step "Setup Summary"

printf "\n"
[[ -f "$GGUF_FILE" ]]               && ok "TinyLlama GGUF: ready"      || fail "TinyLlama GGUF: missing"
[[ -d "$REPO_DIR/node_modules" ]]    && ok "node_modules: installed"    || fail "node_modules: missing"
[[ -d "$REPO_DIR/.venv-gpu" ]]       && ok ".venv-gpu: exists"         || fail ".venv-gpu: missing"
[[ -d "$REPO_DIR/.venv-tts" ]]       && ok ".venv-tts: exists"         || fail ".venv-tts: missing"

printf "\n${GREEN}Done.${NC} To start Lorevox:\n"
printf "  cd /mnt/c/Users/chris/lorevox\n"
printf "  bash scripts/start_all.sh\n\n"
