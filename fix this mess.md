# Lorevox Desktop Repo Fix — Work Order

**Date:** 2026-04-06
**Machine this file is FOR:** Desktop (high-power machine)
**Machine this file was CREATED ON:** Laptop (Legion Pro 7i / WSL2)
**Prepared by:** Claude (Cowork session on laptop)

---

## What Already Happened (Laptop — Done)

A Claude Cowork session on the laptop verified and locked down the source-of-truth repo. Here is what was confirmed:

- **Repo location on laptop:** `C:\Users\chris\lorevox` (WSL: `/mnt/c/Users/chris/lorevox`)
- **Branch:** `main`
- **Remote:** `https://github.com/lorevox-hx/lorevox.git`
- **Latest commit:** `b1c4fbb` — "Create DESKTOP_HANDOFF.md"
- **Prior commit:** `bb4143e` — "git changes"
- **Q.4 commit:** `6412c02` — "Phase Q.4 complete: readiness gate, audit hardening, 9.0 test migration"
- **Working tree:** Clean. Everything committed and pushed.
- **Safety tag:** `q4-all-green-2026-04-06` created locally, pushed via GitHub Desktop.
- **Active app shell:** `ui/lori9.0.html`
- **Q.3 green, Q.4 complete/all suites green:** Confirmed in the commit history.

The laptop repo is healthy and fully pushed. No more laptop work is needed.

---

## What This File Is For

This is a work order for a **new Claude session on the desktop machine**. Claude should read this file, then execute Parts 2 through 9 below in order. The goal is to make the desktop Lorevox setup match the laptop setup without losing any useful desktop-local assets.

---

## Core Rules

1. **The GitHub repo is the source of truth for all code.** Clone fresh from `https://github.com/lorevox-hx/lorevox.git`, branch `main`.
2. **Do NOT delete the existing desktop lorevox folder without backing it up first.** Rename it to `lorevox_old_backup`.
3. **Do NOT redownload large model files** if usable copies already exist on the desktop.
4. **Do NOT overwrite the desktop `.env`** without comparing it to the laptop version first.
5. **Treat repo code and local runtime data as two separate layers.** The repo layer comes from git. The runtime layer (models, caches, `.env`, `lorevox_data`) is machine-local and must be inventoried and preserved.

---

## Part 2 — Inventory the Existing Desktop Setup

**Do this BEFORE changing anything.**

The desktop may already have a lorevox repo, model files, caches, `lorevox_data`, and a `.env`. Find and document all of it.

### Tasks

1. Search for any existing lorevox folder. Check these locations:
   - `C:\Users\chris\lorevox`
   - `C:\Users\chris\Desktop\lorevox`
   - `D:\lorevox` (if D: drive exists)
   - Any other obvious location
2. If found, inspect git health:
   ```
   cd <path-to-lorevox>
   git status
   git branch --show-current
   git remote -v
   git log --oneline -5
   ```
3. List the full contents of the folder (including hidden files).
4. Identify local-only assets worth preserving:
   - `.env`
   - `lorevox_data/` (may be inside the repo folder or at `C:\lorevox_data`)
   - Model folders (Llama, TinyLlama GGUF, Whisper, TTS, etc.)
   - HuggingFace cache (`hf_home`, `.cache/huggingface`, etc.)
   - `.venv-gpu/`, `.venv-tts/` (virtual environments)
   - Any large files that should not be redownloaded
   - Any desktop-local JSON, config, or runtime files
5. Search for model/cache files at common locations:
   - `C:\Llama-3.1-8B\`
   - `C:\stories\models\`
   - `C:\lorevox_data\tts_cache\`
   - `%USERPROFILE%\.cache\huggingface\`
   - Any paths referenced in the desktop `.env` (if one exists)

### Deliverable

Report clearly:
- What repo code exists and whether the old repo is healthy or broken
- What local runtime data exists
- What looks reusable
- What looks broken or stale
- What must be backed up before replacement

---

## Part 3 — Back Up the Existing Desktop Lorevox Folder

**Do NOT delete. Rename instead.**

### Tasks

1. Rename the existing desktop lorevox folder:
   ```
   Rename-Item lorevox lorevox_old_backup
   ```
   Or if using WSL:
   ```
   mv lorevox lorevox_old_backup
   ```
2. If the rename fails (e.g., a process has a file locked), diagnose and report before trying anything destructive.
3. If specific files need to be copied out of the old folder before replacement (like `.env` or `lorevox_data`), copy them to a safe temp location first.

### Deliverable

Report:
- Whether backup rename succeeded
- Backup folder name and location
- Whether any data had to be copied out separately

---

## Part 4 — Fresh Clone the Repo on Desktop

### Tasks

1. Clone from GitHub:
   ```
   git clone https://github.com/lorevox-hx/lorevox.git lorevox
   cd lorevox
   git checkout main
   git pull
   ```
2. Verify the clone:
   ```
   git status
   git branch --show-current
   git remote -v
   git log --oneline -10
   ```
3. The latest commit should be `b1c4fbb` or newer (if more commits were pushed after this work order was created). The Q.4 commit `6412c02` should be in the history.

### Requirements
- Do NOT copy `.git` folders manually.
- Do NOT try to merge old broken repo metadata into the new clone.
- The desktop repo must be a clean clone.

### Deliverable

Report:
- Remote used
- Branch checked out
- Latest commit hash
- Whether git status is clean

---

## Part 5 — Reuse Existing Desktop Models and Caches

The desktop likely already has large model files downloaded. Find them and reuse them.

### Tasks

1. Search for model/cache files on the desktop. Look for:
   - Llama 3.1 8B model files (`.safetensors`, `.bin`, etc.)
   - TinyLlama GGUF file (`TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf`)
   - Whisper model cache
   - Coqui TTS model cache
   - HuggingFace hub cache
   - `sentence-transformers/all-MiniLM-L6-v2` embeddings model
2. Compare found locations against what the `.env` expects (see laptop paths below for reference).
3. If valid model files exist on desktop, **adjust the `.env` to point to them** rather than duplicating or redownloading.
4. Only flag files for download if they truly do not exist on the desktop.

### Laptop .env Model Paths (for reference)

These are the laptop paths. The desktop equivalents may be at the same or different locations:

| Variable | Laptop Value |
|---|---|
| `MODEL_PATH` | `/mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct` |
| `MODEL_DIR` | `/mnt/c/Llama-3.1-8B` |
| `HF_HOME` | `/mnt/c/Llama-3.1-8B/hf_home` |
| `TRANSFORMERS_CACHE` | `/mnt/c/Llama-3.1-8B/hf_home` |
| `CHAT_GGUF_PATH` | `/mnt/c/stories/models/TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf` |
| `TTS_HOME` | `/mnt/c/lorevox_data/tts_cache` |

### Deliverable

Report:
- Model/cache locations found on desktop
- Whether they appear valid and usable
- Whether `.env` path changes were made to point to them
- Whether anything truly needs to be downloaded

---

## Part 6 — Recreate or Align lorevox_data

`lorevox_data` is the local runtime data directory. It lives OUTSIDE the git repo (typically at `C:\lorevox_data`).

### Tasks

1. Check if the desktop already has `lorevox_data` at:
   - `C:\lorevox_data`
   - Inside the old backup folder
   - Any path referenced in the desktop `.env`
2. If it exists and is healthy, **keep using it**. Do not overwrite.
3. If it does not exist, create the expected structure:
   ```
   mkdir C:\lorevox_data
   mkdir C:\lorevox_data\authors
   mkdir C:\lorevox_data\tts_cache
   mkdir C:\lorevox_data\uploads
   mkdir C:\lorevox_data\media
   ```
4. Check whether seed JSON files or runtime config files are needed. If the old backup folder has them, copy them into the new location.

### Deliverable

Report:
- `lorevox_data` path used
- Whether existing data was reused
- Which files were copied (if any)
- Which existing desktop files were preserved

---

## Part 7 — Set Up .env for Desktop

The `.env` file is machine-specific and gitignored. The repo contains `.env.desktop-template` with `[DESKTOP-CHECK]` markers at every path that needs adjustment.

### Tasks

1. Check whether `.env` exists in:
   - The new desktop clone (it shouldn't — it's gitignored)
   - The old backup folder (`lorevox_old_backup/.env`)
2. Decide the best base:
   - If the old desktop `.env` exists and has correct desktop model/cache paths, **start from that** and update any new settings from the template.
   - If no old `.env` exists, copy `.env.desktop-template` to `.env` and fill in all `[DESKTOP-CHECK]` values.
3. Key settings that MUST be correct for the desktop:
   - All model paths must point to real desktop locations (from Part 5)
   - `DATA_DIR`, `AUTHORS_DIR`, `KNOWLEDGE_DIR` must point to `lorevox_data` (from Part 6)
   - `DB_PATH` must point to the real SQLite location
   - `TTS_HOME` must point to the real TTS cache
   - `INTERVIEW_PLAN_PATH` must point to `interview_plan.json` inside the cloned repo
   - `UI_DIR` must point to `ui/` inside the cloned repo
   - `HUGGINGFACE_HUB_TOKEN` must be set (check old `.env` or ask the user)
   - `ATTN_IMPL` — if the desktop has `flash-attn` installed, use `flash_attention_2`; otherwise keep `sdpa`
4. Verify all paths in the final `.env` actually resolve to real files/directories on the desktop.

### Deliverable

Report:
- Which `.env` was used as the base
- Whether it was copied, merged, or edited
- Which settings were changed
- Whether the final `.env` appears valid

---

## Part 8 — Verify Desktop Matches Laptop

### Checks

Compare these between desktop and what's documented above for the laptop:

| Check | Laptop Value |
|---|---|
| Branch | `main` |
| Remote | `https://github.com/lorevox-hx/lorevox.git` |
| Latest commit | `b1c4fbb` or newer |
| Q.4 commit in history | `6412c02` |
| Git status | Clean |

Run on desktop:
```
git branch --show-current
git remote -v
git log --oneline -10
git status
```

Clearly separate:
- **Tracked repo parity** (should be identical)
- **Local runtime parity** (will differ by machine — that's expected)
- **Machine-specific differences** (paths, GPU config, etc. — expected and fine)

---

## Part 9 — Verify Desktop Startup Readiness

### Tasks

1. Install Node dependencies:
   ```
   npm install
   ```
2. Set up Python virtual environments (if not reusing from old backup):
   ```
   python -m venv .venv-gpu
   .venv-gpu\Scripts\activate
   pip install -r requirements.txt
   ```
   (Repeat for `.venv-tts` if needed.)
3. Verify all `.env` paths resolve:
   - Do the model directories exist?
   - Does `lorevox_data` exist with expected contents?
   - Does the SQLite DB path resolve (or will it be created on first run)?
4. If the repo has a startup/status command (like `python lorevox-serve.py --check` or `status_lorevox.bat`), run it.
5. Report whether the desktop appears ready to run `lori9.0.html`.

### Deliverable

Report:
- Repo code aligned: yes/no
- `.env` valid: yes/no
- Model/cache paths resolve: yes/no
- `lorevox_data` found: yes/no
- Desktop startup ready: yes/no
- Any remaining blockers

---

## Part 10 — Report Any Remaining Blockers

If anything is still broken after Parts 2–9, list it explicitly:

- Desktop repo was broken and could not be salvaged
- Desktop remote did not match laptop remote
- Desktop was on wrong branch
- Useful local assets existed and were (or were not) preserved
- Model/cache paths were wrong and could not be resolved
- `.env` needed fixes that could not be automated
- `lorevox_data` was missing or incomplete
- Some files still need manual copy from the laptop
- Startup is blocked by a desktop-local issue (missing Python packages, CUDA issues, etc.)

---

## Quick Reference

| Item | Value |
|---|---|
| GitHub repo | `https://github.com/lorevox-hx/lorevox.git` |
| Branch | `main` |
| Laptop latest commit | `b1c4fbb` |
| Safety tag | `q4-all-green-2026-04-06` |
| Active app shell | `ui/lori9.0.html` |
| `.env` template | `.env.desktop-template` (in repo, has `[DESKTOP-CHECK]` markers) |
| `lorevox_data` expected at | `C:\lorevox_data` (outside repo) |
