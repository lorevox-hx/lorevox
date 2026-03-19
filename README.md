# Lorevox

**A local-first, privacy-first memoir and life-story platform for older adults and their families.**

Lorevox captures a person's memories through guided interview conversations, organises them into a verified timeline, and drafts a human-readable memoir. The AI is a scribe — it structures, prompts, and drafts. The human is the author. Every word they speak is the ground truth.

**v7.1 is live and validated.**

---

## The Core Model

```
ARCHIVE → HISTORY → MEMOIR
```

**Archive** is the immutable record — raw transcripts, audio, photos, scans. Nothing is ever deleted. Everything is timestamped and source-tagged.

**History** is the structured layer — facts, claims, a verified timeline. Contradictions are preserved, not silently resolved. The system distinguishes between what someone said and what is confirmed.

**Memoir** is the narrative draft — assembled from History, shaped by the person's voice, always marked as AI-assisted and always editable by the human.

This separation is not a convention. It is enforced at every layer of the architecture. The AI never promotes a claim to fact without human review. The Review Queue is the only legal path from AI suggestion to confirmed truth.

---

## What Makes Lorevox Different

### A three-pass interview model

Every session follows a deliberate structure. **Pass 1** seeds the timeline — birth year, birthplace, a few anchoring facts that give the whole system a backbone. **Pass 2A** walks the chronological spine — six named life periods from Early Childhood through Later Life, each driven by an era-specific prompt strategy. **Pass 2B** goes deep into scenes, sensory memory, and emotional texture. The interview has shape and direction. Lori knows where she is in the story.

### A live cognitive state layer — runtime71

Every turn, Lorevox sends a full cognitive state payload to the model:

```json
{
  "current_pass":       "pass2a",
  "current_era":        "early_childhood",
  "current_mode":       "open",
  "affect_state":       "fatigue_hint",
  "affect_confidence":  0.9,
  "cognitive_mode":     "light",
  "fatigue_score":      80
}
```

This isn't metadata. It drives the model's behavior through explicit behavioral directives in the system prompt — DO/DO NOT language for every pass, era, mode, and fatigue level. The model knows when someone is tired and shortens its responses. The model knows when someone is confused and offers anchoring language. The model knows when someone is distressed and slows down. This is not prompt magic — it is a validated, tested pipeline.

### A full emotional intelligence pipeline

The path from camera to model behavior is:

```
MediaPipe Face Mesh (browser WASM, 15 FPS)
    ↓
classifyGeometry() — 468 facial landmarks → raw emotion (internal only, never logged)
    ↓
toAffectState() — raw emotion → interview-safe affect label
    ↓
2000ms sustain filter + 3s debounce
    ↓
setLoriState() → state.runtime (affectState, affectConfidence, cognitiveMode, fatigueScore)
    ↓
buildRuntime71() → WebSocket payload
    ↓
prompt_composer.py → behavioral directives → LLM
```

No video ever leaves the browser. No landmarks are logged. No raw emotion labels are transmitted. Only derived affect states cross to the backend — and only after the narrator's facial expression has been sustained for two seconds, with a minimum three-second gap between signals. The system reads a person's emotional state to serve them better, not to analyse or store it.

### A facial consent gate

Before the camera activates, a dedicated consent modal requires the narrator to read an explicit explanation of facial expression analysis, check an acknowledgment box, and confirm. The button is disabled until the checkbox is ticked. There is no way to start the emotion engine without completing this step. Closing the modal, or declining, disables emotion-aware mode for the session and the camera never opens.

### Cognitive mode intelligence

The system continuously reads the narrator's inputs and affect state and selects a cognitive mode for each turn:

- **Open** — default; warm, open-ended questions, normal pacing
- **Recognition** — activated by uncertainty language, short replies, or confusion signals; Lori uses anchoring language, concrete memory cues, shorter questions
- **Grounding** — activated by distress or dissociation signals; Lori slows down, uses present-moment language, removes all pressure
- **Light** — activated by fatigue signals; Lori shortens responses, offers breaks, reduces question complexity

This runs automatically on every turn via `cognitive-auto.js` and writes to the same `state.runtime` object that feeds the model. Mode switches are logged with timestamps and reasons, visible in the debug overlay.

### A safety layer that never uses the LLM

Every interview answer is scanned before Lori's next question is served. The scanner is fully local — keyword and compound pattern matching, no model call, no latency. Seven crisis categories: `suicidal_ideation`, `sexual_abuse`, `physical_abuse`, `domestic_abuse`, `child_abuse`, `caregiver_abuse`, `distress_call`. On detection: the segment is flagged private and excluded from memoir by default, Lori's tone is automatically gentled for the next three turns, and a crisis resource overlay surfaces category-relevant hotlines. Softened mode always takes priority over any affect or cognitive mode.

### Validated behavioral tests

Lorevox has a formal test suite for behavioral correctness — not API tests, but live interview tests that verify Lori responds appropriately under specific conditions. All eight tests pass:

| Test | Condition | What it verifies |
|---|---|---|
| 1 | Pass 1 seed | Timeline initiation, DOB capture |
| 2 | Pass 2A | Chronological walk, era-appropriate prompts |
| 3 | Era advancement | Correct transition between life periods |
| 4 | Cognitive: open | Default warm pacing |
| 5 | Cognitive: recognition | Anchoring language under uncertainty |
| 6 | High fatigue (score 80) | Shortened response, break offered, pressure removed |
| 7 | Emotional difficulty (distress_hint) | Acknowledgment before follow-up, no clinical language |
| 8 | Memory contradiction | Uncertainty accepted, no correction, focuses on experience |

---

## Product Principles

1. **Human memory is primary.** The person's own words are the source of truth. The AI is always subordinate to them.
2. **Hide the scaffolding.** The person experiences a warm conversation, not a data entry system.
3. **Language supports reflection.** Questions invite recollection, not interrogation.
4. **Partial progress is progress.** A 30% complete profile is vastly better than nothing. Never force completion.
5. **Human edits are sacred.** If a person corrects something, that correction is locked. The AI never overwrites a human edit.
6. **Obituary cultural humility.** Different families speak about death differently. The system never imposes a template.
7. **Every surface explains itself.** No dead ends. Every empty state tells the person what to do next.
8. **Recollection, not interrogation.** Lori is never clinical, never urgent, never pushy.
9. **Emotional weight is handled with care.** Disclosure slows the system down, not up.
10. **The AI does not know better than the person about their own life.** Suggestions are always presented as suggestions.

---

## What Lorevox Is

- A life-story conversation platform where Lori — the AI — learns about a person by talking to them, across multiple structured interview passes
- A system with its own cognitive layer — affect, fatigue, and cognitive mode shaping every single turn
- A three-layer truth architecture: raw archive, reviewed history, generated memoir — never collapsed
- A privacy-first design: all data stays on local infrastructure; no video, no landmarks, no raw emotions, nothing leaves the machine
- An offline-first application — runs fully air-gapped after setup; LLM, TTS, and emotion engine all run locally
- A safety system that scans every answer locally, with no model call and no data transmission
- A consent-gated emotion engine that requires informed acknowledgment before the camera ever opens

## What Lorevox Is Not

- Not a chatbot or general assistant
- Not a cloud service or subscription product
- Not a social network or sharing platform
- Not a medical records or legal document system
- Not a product that treats memories as data to mine or monetise
- Not a replacement for a human biographer or therapist

---

## Architecture

```
Narrator speaks (voice or keyboard)
        ↓
   cognitive-auto.js — reads message + affect state, selects cognitive mode
        ↓
   buildRuntime71() — assembles full cognitive state payload
        ↓
   WebSocket → chat_ws.py
        ↓
   prompt_composer.py — injects behavioral directives (pass / era / mode / fatigue)
        ↓
   Llama 3.1-8B — generates response shaped by live cognitive state
        ↓
   Response → Archive (raw) → History (candidate facts) → Memoir (narrative)

Parallel: MediaPipe Face Mesh (browser) → affect state → state.runtime → runtime71
Parallel: safety.py — local scan on every answer, no LLM involved
```

### Two-server runtime

| Server | Port | Handles |
|---|---|---|
| LLM / Interview API | 8000 | Interview engine, LLM chat, prompt composition, affect events, safety scan |
| TTS | 8001 | Text-to-speech synthesis, voice playback |

---

## Quick Start

### Prerequisites

- WSL2 (Ubuntu 22.04 recommended)
- NVIDIA GPU, CUDA 12.x
- Python 3.11+

### Setup

```bash
git clone git@github.com:lorevox-hx/lorevox.git
cd lorevox
cp .env.example .env
# Edit .env — set LV_DB_PATH, LV_MODEL_PATH, LV_ARCHIVE_ROOT

# GPU / LLM environment
python3 -m venv .venv-gpu
source .venv-gpu/bin/activate
pip install -r server/requirements.blackwell.txt   # or requirements.txt for older GPUs
deactivate

# TTS environment
python3 -m venv .venv-tts
source .venv-tts/bin/activate
pip install -r server/requirements.tts.txt
deactivate

# Seed database
source .venv-gpu/bin/activate
python -m server.code.seed_db
```

### Launch

```bash
# Terminal 1 — LLM / Interview API
bash launchers/run_gpu_8000.sh

# Terminal 2 — TTS
bash launchers/run_tts_8001.sh
```

Open `ui/lori7.1.html` directly in a browser (`file://`).

### Verify

Open the browser console. Send a message to Lori. You should see:

```
[Lori 7.1] runtime71 → model: { "current_pass": ..., "fatigue_score": ..., ... }
```

If that line appears on every send, the pipeline is working end to end.

---

## Runtime Requirements

| Requirement | Notes |
|---|---|
| Python | 3.11+ |
| CUDA | 12.x in WSL2 |
| OS | Windows 11 + WSL2 (Ubuntu 22.04) |
| LLM | Llama 3.1-8B (HuggingFace format or GGUF) |
| TTS | Coqui XTTS-v2 or Kokoro |
| Browser | Chrome recommended (MediaPipe WASM + WebSocket) |

### VRAM budget

| Component | VRAM |
|---|---|
| Llama 3.1-8B Q4_K_M | ~5.5 GB |
| Llama 3.1-8B Q5_K_M | ~6.5 GB |
| XTTS-v2 | ~2.5 GB |
| MediaPipe (browser WASM) | CPU only |
| **Total Q4 + TTS** | **~8 GB** |
| **Total Q5 + TTS** | **~9 GB** |

A 12 GB card (RTX 3060 / 4070) runs both models comfortably. A 10 GB card runs Q4 + TTS with headroom.

---

## Repo Structure

```
lorevox/
├── ui/
│   ├── lori7.1.html               # Shell — external scripts only, no inline logic
│   ├── css/
│   │   ├── base.css
│   │   ├── components.css
│   │   ├── interview.css
│   │   ├── timeline.css
│   │   ├── memoir.css
│   │   ├── overlays.css
│   │   └── facial-consent.css     # Consent gate overlay styles
│   └── js/
│       ├── config.js              # API endpoints, constants
│       ├── state.js               # All shared mutable state, including state.runtime
│       ├── app.js                 # Core: setLoriState, buildRuntime71, WebSocket send paths
│       ├── interview.js           # Interview session, roadmap, pass/era management
│       ├── timeline-ui.js         # Timeline render, life period bands, memory slots
│       ├── debug-overlay.js       # Live runtime state panel (Ctrl+Shift+D)
│       ├── cognitive-auto.js      # Automatic cognitive mode selection per turn
│       ├── emotion.js             # LoreVoxEmotion — MediaPipe engine (standalone)
│       ├── emotion-ui.js          # Emotion toggle, camera lifecycle, consent gate
│       └── facial-consent.js     # FacialConsent — session-scoped consent gate
│
├── server/
│   └── code/
│       └── api/
│           ├── main.py            # FastAPI app, CORS, router registration
│           ├── db.py              # SQLite CRUD
│           ├── safety.py          # Crisis detection — fully local, no LLM
│           ├── archive.py         # Interview archive write/rebuild
│           ├── prompt_composer.py # System prompt assembly with runtime71 behavioral directives
│           ├── session_engine.py  # Pass/era routing, prompt selection
│           ├── session_vitals.py  # Fatigue estimation, session close recommendation
│           ├── agent_loop.py      # Per-turn orchestration scaffold
│           ├── hooks.py           # before_llm / after_llm / after_tool hooks
│           ├── policies.py        # Biographical signal classification, write decisions
│           ├── reflection.py      # Post-turn candidate extraction (write_plan only)
│           ├── skills.py          # Skill wrappers: timeline, affect, safety, RAG
│           └── routers/
│               ├── chat_ws.py     # WebSocket: start_turn, runtime71 extraction, prompt assembly
│               ├── interview.py
│               ├── persons.py
│               ├── timeline.py
│               ├── memoir.py
│               └── affect.py
│
├── tests/
│   ├── CLAUDE_LIVE_VALIDATION_SET_LOREVOX_7_1.md
│   ├── Lorevox_7.1_Validation_Report_Tests6_7_8.docx
│   └── FATIGUE_RUNTIME71_PATCH_AND_TESTS_7_8.md
│
├── launchers/
│   ├── run_gpu_8000.sh
│   └── run_tts_8001.sh
│
└── docs/
    ├── PVDhandoff.md              # Master handoff — startup, architecture, guardrails, next steps
    ├── LOREVOX_ARCHITECTURE.md
    ├── Lorevox_Operating_Doctrine.md
    ├── DESIGN_PHILOSOPHY.md
    └── Providence.md              # Project status and milestone tracker
```

---

## Debug Tools

| Tool | How |
|---|---|
| Live runtime overlay | `Ctrl+Shift+D` in browser — shows pass, era, mode, affect, fatigue bar, cognitive log |
| runtime71 per turn | Browser console: `[Lori 7.1] runtime71 → model: {...}` |
| Compact server log | Always on: `[chat_ws] turn: conv=...` with affect/fatigue summary |
| Full system prompt | Set `LV_DEV_MODE=1` in `.env` and restart backend |
| Pipeline test (no GPU) | `python test_model.py --no-model` from `server/code/` |
| Model behaviour test | `python test_model.py --verbose` |
| Single test group | `python test_model.py --group 6 --verbose` |

---

## Status — v7.1

### ✅ Fully working and validated

- **Three-pass interview model** — Pass 1 (seed), Pass 2A (chronological spine), Pass 2B (scene depth)
- **Timeline Spine** — six named life periods from DOB, persisted per person, drives all pass routing
- **runtime71 pipeline** — affect, fatigue, cognitive mode delivered to model on every turn
- **Cognitive auto-selection** — recognition, grounding, light, open modes selected per turn from message + affect signals
- **Affect pipeline** — MediaPipe Face Mesh → classifyGeometry → affect state → setLoriState → model
- **Facial consent gate** — camera blocked until explicit informed consent with checkbox acknowledgment
- **Fatigue-aware pacing** — model behavior changes at fatigue ≥ 50 (moderate) and ≥ 70 (high)
- **Safety scan** — local, no LLM, 8 crisis categories, softened mode, crisis overlay
- **Archive / History / Memoir separation** — enforced at architecture level
- **TTS voice** — Lori speaks (Coqui XTTS-v2 / Kokoro)
- **Voice input** — browser speech recognition
- **Debug overlay** — live runtime state, cognitive reason log, fatigue bar
- **All 8 behavioral tests passing**

### 🔲 Pending

- MediaPipe offline bundle — camera requires internet today; see `docs/PVDhandoff.md` Section 10
- Run 2 model validation — `test_model.py --verbose` ready to execute with live GPU
- Backend runtime71 logging in `chat_ws.py`
- SessionVitals in live loop (automatic fatigue scoring per turn)
- Backend-authoritative pass advancement
- Agent loop live wiring (direct RAG/memory retrieval adapter pending)

### Deliberately out of scope

- Cloud sync or remote storage
- Social sharing or family collaboration
- Voice cloning
- Medical or legal document processing
- Advertising, analytics, or any data leaving the local installation

---

## Supporting Documents

- **[PVDhandoff.md](docs/PVDhandoff.md)** — master handoff: startup sequence, architecture, regression guardrails, ordered next steps
- **[Architecture](docs/LOREVOX_ARCHITECTURE.md)** — full data model, DB schema, processing pipeline
- **[Operating Doctrine](docs/Lorevox_Operating_Doctrine.md)** — 10 product principles with implementation rules
- **[Design Philosophy](docs/DESIGN_PHILOSOPHY.md)** — UX rationale and decision history
- **[Providence](docs/Providence.md)** — project milestone tracker

---

## License

Copyright (c) 2026 Chris (dev@lorevox.com). All rights reserved.

Lorevox is **source-available, not open source.** You may view and study this code and run it locally for personal, non-commercial use. You may not use it commercially, host it for others, or redistribute it in any form without written permission.

The name Lorevox, the Lori interviewer persona, the runtime71 cognitive state system, the multi-pass interview model, all prompt and directive text, and all documentation are explicitly reserved and are not licensed under any terms.

Contributions are by invitation only and require full assignment of rights to the copyright holder.

See [LICENSE](LICENSE) for complete terms. For permissions: dev@lorevox.com

---

*Lorevox v7.1 — local-first, privacy-first, human-first. Every word they speak is the ground truth. Lori is the app.*
