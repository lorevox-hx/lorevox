# Lorevox Desktop Handoff — 2026-04-06

## Status: Part 1 Complete (Laptop), Parts 2–9 Ready for Desktop

---

## 1. Laptop Repo Status (Verified)

| Field | Value |
|---|---|
| Branch | `main` |
| Remote | `https://github.com/lorevox-hx/lorevox.git` |
| Latest commit | `bb4143e` — "git changes" |
| Q.4 commit | `6412c02` — "Phase Q.4 complete: readiness gate, audit hardening, 9.0 test migration" |
| Working tree | Clean, up to date with origin/main |
| New commit created | No (nothing to commit) |
| Push result | Already up to date |
| Safety tag | `q4-all-green-2026-04-06` exists locally |
| Tag pushed to remote | **NOT YET** — push failed from sandbox (403). Run `git push --tags` from laptop terminal. |

### Action needed before desktop work:
```bash
cd /mnt/c/Users/chris/lorevox
git push --tags
```

---

## 2. Laptop .env Key Paths (Reference for Desktop Alignment)

These are the laptop-specific paths that the desktop .env will need to mirror or adjust:

| Variable | Laptop Value (WSL path) | Notes |
|---|---|---|
| MODEL_PATH | `/mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct` | Desktop may have model elsewhere |
| MODEL_DIR | `/mnt/c/Llama-3.1-8B` | |
| HF_HOME | `/mnt/c/Llama-3.1-8B/hf_home` | |
| TRANSFORMERS_CACHE | `/mnt/c/Llama-3.1-8B/hf_home` | |
| DATA_DIR | `/mnt/c/lorevox_data` | Desktop needs equivalent |
| AUTHORS_DIR | `/mnt/c/lorevox_data/authors` | |
| KNOWLEDGE_DIR | `/mnt/c/lorevox_data` | |
| TTS_HOME | `/mnt/c/lorevox_data/tts_cache` | |
| DB_PATH | `/mnt/c/lorevox_data/lorevox.sqlite3` | |
| UPLOADS_DIR | `/mnt/c/lorevox_data/uploads` | |
| MEDIA_DIR | `/mnt/c/lorevox_data/media` | |
| INTERVIEW_PLAN_PATH | `/mnt/c/Users/chris/lorevox/interview_plan.json` | Repo-relative on desktop |
| UI_DIR | `/mnt/c/Users/chris/lorevox/ui` | Repo-relative on desktop |
| CHAT_GGUF_PATH | `/mnt/c/stories/models/TinyLlama-1.1B-Chat-v1.0.Q4_K_M.gguf` | Desktop may differ |
| ATTN_IMPL | `sdpa` | Desktop may support `flash_attention_2` |

### Desktop .env template already exists:
The file `.env.desktop-template` is in the repo with `[DESKTOP-CHECK]` markers for all paths that need adjustment.

---

## 3. Laptop Repo Structure (What Will Clone)

Active app shell: `ui/lori9.0.html`

Key tracked directories:
- `ui/` — frontend (19MB, includes lori9.0.html)
- `server/` — Python backend (2.1MB)
- `scripts/` — utility scripts
- `tests/` — Playwright tests
- `schemas/` — JSON schemas
- `config/` — configuration
- `docs/` — documentation
- `launchers/` — startup scripts
- `eval/`, `tools/`, `research/`, `data/`

Key tracked files at root:
- `lorevox-serve.py` — main server entry point
- `interview_plan.json` — interview plan data
- `package.json` / `playwright.config.ts` — Node/test config
- `start_lorevox.bat`, `stop_lorevox.bat`, `status_lorevox.bat` — Windows launchers
- `setup_desktop_shortcuts.ps1` — desktop shortcut setup script

---

## 4. What is LOCAL-ONLY on Laptop (Will NOT Clone)

These are gitignored and must be recreated or reused from desktop:

| Asset | Laptop Location | Desktop Action |
|---|---|---|
| `.env` | repo root | Use `.env.desktop-template` as base, adjust paths |
| `.venv-gpu/` | repo root | Recreate with `python -m venv .venv-gpu` |
| `.venv-tts/` | repo root | Recreate with `python -m venv .venv-tts` |
| `.runtime/` (logs, pids) | repo root | Auto-created on startup |
| `node_modules/` | repo root | Recreate with `npm install` |
| `lorevox_data/` | `C:\lorevox_data` (outside repo) | Inventory desktop's existing copy |
| Llama model files | `C:\Llama-3.1-8B\` | Inventory desktop's existing copy |
| TinyLlama GGUF | `C:\stories\models\` | Inventory desktop's existing copy |
| HF cache | `C:\Llama-3.1-8B\hf_home` | Inventory desktop's existing copy |
| SQLite DB | `C:\lorevox_data\lorevox.sqlite3` | Preserve desktop's if exists |

---

## 5. Desktop Work Plan (Parts 2–9)

When Claude reopens on the desktop machine, execute in this order:

### Part 2: Inventory Desktop
```
# Check for existing lorevox repo
# Look in: C:\Users\chris\lorevox, C:\Users\chris\Desktop\lorevox, D:\lorevox, etc.
# Check git health of any found repo
# List local-only assets: .env, lorevox_data, model folders, caches
```

### Part 3: Backup Old Desktop Repo
```
# Rename existing repo folder to lorevox_old_backup
# Do NOT delete it
```

### Part 4: Fresh Clone
```
git clone https://github.com/lorevox-hx/lorevox.git lorevox
cd lorevox
git checkout main
git log --oneline -5
# Verify latest commit matches: bb4143e
```

### Part 5: Reuse Desktop Models/Caches
```
# Search for existing model files on desktop
# Common locations: C:\Llama-3.1-8B, C:\models, D:\models, HF cache
# Do NOT redownload if valid copies exist
# Adjust .env paths to point to desktop locations
```

### Part 6: Align lorevox_data
```
# Check if desktop has C:\lorevox_data or equivalent
# If exists and healthy, reuse it
# If missing, create structure: lorevox_data/{authors,tts_cache,uploads,media}
# Copy needed seed JSON files from old backup if available
```

### Part 7: Set Up .env
```
# Start from .env.desktop-template in the cloned repo
# Adjust all [DESKTOP-CHECK] paths to match desktop reality
# Preserve desktop HF token if different
# Verify all paths resolve
```

### Part 8: Compare State
```
# git log --oneline -10 on desktop should match laptop
# Commit hash bb4143e should be HEAD
# Branch should be main
```

### Part 9: Startup Readiness
```
# npm install
# python -m venv .venv-gpu && pip install -r requirements.txt
# Verify .env paths all resolve
# Verify lorevox_data exists and contains expected files
# Run status check or lorevox-serve.py --check if available
```

---

## 6. Key Safety Rules

- **NEVER delete the old desktop folder without backing up first**
- **NEVER redownload models if desktop already has them**
- **NEVER overwrite desktop .env without comparing to laptop first**
- **NEVER force-push to GitHub**
- **Preserve desktop lorevox_data — it may have unique runtime data**
