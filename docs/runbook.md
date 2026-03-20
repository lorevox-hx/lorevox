1. RUNBOOK.md
# Lorevox — Runbook

Version: 7.3  
Date: 2026-03-21  
Purpose: Operational guide to start, run, and verify Lorevox locally

---

## 1. Overview

This runbook provides step-by-step instructions to:

- start backend services
- run the UI
- validate system behavior
- run in fully offline mode

No prior project knowledge is required.

---

## 2. Prerequisites

- Windows 11 + WSL2
- Node installed (for Tailwind build)
- Python venv already created:
  - `.venv-gpu`
- Model files present locally:

/mnt/c/Llama-3.1-8B/


---

## 3. Start Backend (Terminal 1)

```bash
cd /mnt/c/Users/chris/lorevox
source .venv-gpu/bin/activate

export MODEL_PATH=/mnt/c/Llama-3.1-8B/hf/Meta-Llama-3.1-8B-Instruct
export HF_HOME=/mnt/c/Llama-3.1-8B/hf_home
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

export DATA_DIR=/mnt/c/lorevox_data
export ATTN_IMPL=sdpa
export LV_DEV_MODE=1

mkdir -p /mnt/c/lorevox_data/{db,interview,logs,cache_audio,memory,projects,tts_cache,uploads,media}

cd server
export PYTHONPATH=/mnt/c/Users/chris/lorevox/server
Verify Model
python - <<'PY'
from code.api.api import _load_model
m, t = _load_model()
print("MODEL OK:", type(m).__name__, type(t).__name__)
PY
Start Server
bash launchers/run_gpu_8000.sh
4. Start TTS (Terminal 2)
cd /mnt/c/Users/chris/lorevox
bash launchers/run_tts_8001.sh
5. Run UI (Terminal 3 — 7.4+ standard path)

cd /mnt/c/Users/chris/lorevox
python lorevox-serve.py

Open in browser:

http://localhost:8000/ui/lori7.3.html

Note: file:///C:/Users/chris/lorevox/ui/lori7.3.html may still work for basic
UI use but is not the supported path for 7.4+. The local server is required for
reliable camera permission and WASM performance.
6. Expected Behavior

Lori interface loads immediately

Timeline spine visible

Chat interaction functional

Debug overlay available (Ctrl+Shift+D)

7. Offline Mode Test (Required)
Step 1

Start backend + TTS

Step 2

Open UI

Step 3

Disable network:

turn off WiFi OR

Chrome DevTools → Network → Offline

Step 4 — Validate
UI

styles load correctly

Chat

responses generated locally

Emotion

camera initializes

no load failures

8. Network Audit

Open DevTools → Network

Verify:

❌ No requests to:

cdn.tailwindcss.com

cdn.jsdelivr.net

external domains

✅ All requests:

file:///C:/Users/chris/lorevox/ui/
9. Troubleshooting
UI missing styles

→ rebuild Tailwind

npx @tailwindcss/cli \
  -i ./ui/css/tailwind-input.css \
  -o ./ui/css/tailwind.min.css \
  --minify
Camera fails

→ use Chrome
→ fallback: serve UI via local HTTP server

Model fails

→ verify MODEL_PATH
→ re-run model test snippet

10. Shutdown

Stop:

backend terminal (Ctrl+C)

TTS terminal (Ctrl+C)

No persistent services remain

11. Operational Principle

Lorevox must run without internet.

If any feature requires network access, it is considered a defect.


---

# 2. `march21handoff.md`

```md
# Lorevox — Handoff

Version: 7.3  
Date: 2026-03-21  
Purpose: System state, completion status, and continuation requirements

---

## 1. Scope

This document defines:

- current system state
- completed work
- in-progress components
- remaining required work

---

## 2. System State

### Architecture

- Archive → History → Memoir enforced
- Timeline Spine (6 life periods)
- Multi-pass interview system

### Runtime

- runtime71 active end-to-end
- full propagation:
  - pass / era / mode
  - affectState
  - fatigueScore

### UI

- lori7.3.html entry point
- persistent Lori model
- timeline-driven interaction

---

## 3. Offline Status

### Completed

- Tailwind compiled locally
- CDN removed
- MediaPipe vendored
- emotion.js patched
- CSS fully local

Result:
UI runs from `file://` with no external dependencies

---

## 4. Completion Checklist

### ✅ Completed

- [x] runtime71 propagation
- [x] prompt injection (prompt_composer)
- [x] WebSocket runtime forwarding
- [x] UI runtime state model
- [x] timeline rendering
- [x] cognitive auto mode
- [x] debug overlay
- [x] Tailwind offline build
- [x] MediaPipe local bundle

---

### ⚠ In Progress

- [ ] Affect → runtime integration
- [ ] SessionVitals (fatigue scoring)
- [ ] SessionEngine (pass control)
- [ ] Agent loop integration
- [ ] Memory retrieval (RAG)

---

### ⛔ Not Started

- [ ] Scene-based memory model
- [ ] Memoir generation pipeline
- [ ] Backend-driven session control
- [ ] Timeline-aware routing
- [ ] UI simplification pass

---

## 5. Known Constraints

- camera + wasm may fail under file://
- UI path structure is fixed
- backend not fully authoritative yet

---

## 6. Required Next Actions

1. Validate offline operation
2. eliminate all external calls
3. move session control to backend
4. integrate affect into runtime
5. complete agent loop

---

## 7. Operational Summary

- system is local-first
- UI is fully offline-capable
- runtime is stable
- backend partially complete
3. March21Providence.md
# Lorevox — Providence

Version: March 21  
Purpose: System philosophy, invariants, and architectural truth

---

## 1. Core Principle

Lorevox is not a chatbot.

It is a personal historical archive system.

AI is used to:

- conduct interviews
- extract structured meaning
- generate narrative

Truth does not live in the model.

Truth lives in the archive.

---

## 2. Immutable Layers

### ARCHIVE (Immutable)
- transcripts
- audio
- documents

Never modified.

---

### HISTORY (Mutable with audit)
- events
- facts
- entities
- timeline

Structured interpretation layer.

---

### MEMOIR (Regenerable)
- narrative output
- chapters
- summaries

Always derived from History.

---

## 3. Timeline Spine

All data is anchored to:

1. Early Childhood  
2. Late Childhood  
3. Adolescence  
4. Early Adulthood  
5. Midlife  
6. Later Life  

No memory exists outside time.

---

## 4. Interview System

### Pass 1
- establish timeline

### Pass 2A
- chronological traversal

### Pass 2B
- narrative depth and meaning

---

## 5. Runtime Model

Each turn includes:

- pass
- era
- affect state
- fatigue score
- cognitive mode

This is not optional.

This defines system behavior.

---

## 6. Authority Direction

Current:
- UI partially controls session

Target:
- backend fully authoritative

UI becomes:
- projection layer only

---

## 7. Offline Requirement

Lorevox must:

- run without internet
- load all assets locally
- execute all inference locally

External dependency = system failure

---

## 8. Design Principle

The system must behave like an appliance:

- predictable
- stable
- no hidden dependencies

User should not think about:

- servers
- models
- connectivity

---

## 9. Memory Model Direction

Current:
- flat memory extraction

Target:
- scene-based memory
- time-anchored events
- cross-linked entities

---

## 10. End State

Lorevox becomes:

- a permanent personal archive
- a structured life history system
- a memoir generator grounded in truth

Not a conversation tool.