# Lorevox

**An AI-assisted memoir and life-story platform for older adults and their families.**

Lorevox captures a person's memories through guided interview conversations, organises them into a verified timeline, and drafts a human-readable memoir. The AI is a scribe — it structures, prompts, and drafts. The human is the author. Every word they speak is the ground truth.

---

## The Core Model

```
ARCHIVE → HISTORY → MEMOIR
```

**Archive** is the immutable record — raw transcripts, audio, photos, scans. Nothing is ever deleted from the archive. Everything added is timestamped and source-tagged.

**History** is the structured layer — facts, claims, a verified timeline. Contradictions are preserved, not silently resolved. The system distinguishes between what someone said and what is confirmed.

**Memoir** is the narrative draft — assembled from History, shaped by the person's voice, always marked as AI-assisted and always editable by the human.

---

## Product Principles

These govern every design and implementation decision:

1. **Human memory is primary.** The person's own words, photos, and records are the source of truth. The AI is always subordinate to them.
2. **Hide the scaffolding.** The person should experience a warm conversation, not a data entry system. Technical structure stays invisible.
3. **Language supports reflection.** Questions are phrased to invite recollection, not interrogate. "Tell me about the house you grew up in" not "Enter childhood address."
4. **Partial progress is progress.** A 30% complete profile is vastly better than nothing. Never force completion. Never show a person how far they have to go.
5. **Human edits are sacred.** If a person corrects something the AI drafted, that correction is locked. The AI never overwrites a human edit.
6. **Obituary cultural humility.** Different families and cultures speak about death very differently. The system never imposes a Western funeral-home template.
7. **Every surface explains itself.** No dead ends. Every empty state tells the person what to do next.
8. **Recollection, not interrogation.** Lori — the interview AI — is never clinical, never urgent, never pushy.
9. **Emotional weight is handled with care.** If someone discloses trauma or crisis, the system slows down, softens its tone, and surfaces appropriate support resources.
10. **The AI does not know better than the person about their own life.** Suggestions are always presented as suggestions.

---

## What Lorevox Is

- A guided life-story interview system with a structured roadmap of topics
- A memory timeline for photos, documents, and personal milestones
- A section-by-section memoir draft assembled from verified interview answers
- A private, local-first application — data stays on the family's infrastructure
- An emotionally-aware interview assistant (v6.1) that reads affect signals and adjusts tone
- A safety-aware system (v6.1) that detects crisis disclosures and surfaces support resources

## What Lorevox Is Not

- Not a social network or sharing platform
- Not a medical records system
- Not a public genealogy database
- Not a replacement for a human biographer or therapist
- Not a product that treats memories as data to mine or monetise

---

## Architecture at a Glance

```
Person speaks (voice or type)
        ↓
   Lori (LLM interview AI) — FastAPI server, port 8000
        ↓
   Interview answer → safety scan → section summary
        ↓
   Archive (raw transcript, .txt rebuild)
        ↓
   Claims extracted → reviewed → Facts confirmed
        ↓
   Timeline events → ordered by date
        ↓
   Memoir draft assembled from section summaries
```

The emotion engine (v6.1 Track B) runs entirely in the browser via MediaPipe Face Mesh. Only derived affect states (`steady`, `engaged`, `reflective`, `moved`, `distressed`, `overwhelmed`) cross to the backend — no video, no landmarks, no raw emotion labels ever leave the browser.

---

## Quick Start

### Prerequisites

- WSL2 (Ubuntu 22.04 recommended)
- NVIDIA GPU, CUDA 12.x drivers installed in WSL2
- Python 3.11+
- Node.js not required — the UI is plain HTML/CSS/JS

### Clone

```bash
git clone git@github.com:lorevox-hx/lorevox.git
cd lorevox
```

### Configure environment

```bash
cp .env.example .env
# Edit .env — set your DB path, model path, and TTS settings
```

Key `.env` values:

| Variable | Description |
|---|---|
| `LV_DB_PATH` | Path to the SQLite database file |
| `LV_MODEL_PATH` | Path to your Llama 3.1-8B GGUF model |
| `LV_TTS_HOST` | TTS server host (default: `localhost:8001`) |
| `LV_ARCHIVE_ROOT` | Where interview archives are written |

### Set up Python environments

Lorevox uses two separate virtual environments — one for the GPU/LLM server, one for TTS — to avoid dependency conflicts.

```bash
# GPU / LLM server
python3 -m venv .venv-gpu
source .venv-gpu/bin/activate
pip install -r server/requirements.blackwell.txt
deactivate

# TTS server
python3 -m venv .venv-tts
source .venv-tts/bin/activate
pip install -r server/requirements.tts.txt
deactivate
```

> `requirements.blackwell.txt` targets NVIDIA Blackwell / Ada. If you are on an older architecture, use `server/requirements.txt` instead.

### Seed the database

```bash
source .venv-gpu/bin/activate
python -m server.code.seed_db
```

### Launch

Open two terminals:

```bash
# Terminal 1 — GPU / LLM / Interview API (port 8000)
bash launchers/run_gpu_8000.sh

# Terminal 2 — TTS server (port 8001)
bash launchers/run_tts_8001.sh
```

Then open `ui/6.1.html` directly in a browser (file://) or serve it with any static server.

---

## Current Stack & Runtime

### Two-server architecture

| Server | Port | Env | Handles |
|---|---|---|---|
| LLM / Interview API | 8000 | `.venv-gpu` | Interview engine, LLM chat, safety scan, memoir draft, affect events |
| TTS | 8001 | `.venv-tts` | Text-to-speech synthesis, voice playback |

### Runtime requirements

| Requirement | Notes |
|---|---|
| Python | 3.11+ |
| CUDA | 12.x, in WSL2 |
| GPU VRAM | See budget below |
| OS | Windows 11 + WSL2 (Ubuntu 22.04) |
| LLM | Llama 3.1-8B (GGUF, Q4_K_M or Q5_K_M) |
| TTS | Coqui XTTS-v2 or Kokoro |
| SQLite | Bundled with Python |

### VRAM budget (approximate)

| Component | VRAM |
|---|---|
| Llama 3.1-8B Q4_K_M | ~5.5 GB |
| Llama 3.1-8B Q5_K_M | ~6.5 GB |
| XTTS-v2 TTS model | ~2.5 GB |
| MediaPipe (browser WASM) | CPU only |
| **Total (Q4 + TTS)** | **~8 GB** |
| **Total (Q5 + TTS)** | **~9 GB** |

A 12 GB card (RTX 3060 / 4070) runs both models comfortably. A 10 GB card (RTX 3080) runs Q4 + TTS with headroom.

### v6.1 Track A — Safety (runtime)

- Every interview answer is scanned server-side via `safety.py` before the next question is served
- Detected categories: `suicidal_ideation`, `sexual_abuse`, `physical_abuse`, `domestic_abuse`, `child_abuse`, `caregiver_abuse`, `distress_call`
- On trigger: segment flagged private + excluded from memoir, session enters softened mode for 3 turns, crisis resources surfaced in UI
- No LLM call involved — fully local keyword + compound pattern matching

### v6.1 Track B — Affect Awareness (runtime)

- Entirely opt-in; camera off by default
- MediaPipe Face Mesh runs in browser WASM at 15 FPS
- Raw geometry → raw emotion (internal, never logged or sent) → affect state
- Affect states posted to backend only after 2000ms sustained detection, debounced at 3s
- Affect state feeds tone nudges in Lori's next question prompt; softened mode (Track A) always takes priority

---

## Repo Structure

```
lorevox/
├── ui/
│   ├── 6.1.html                   # Thin shell — loads all CSS and JS modules
│   ├── css/
│   │   ├── base.css               # Reset, typography, layout foundations
│   │   ├── components.css         # Buttons, cards, chips, inputs
│   │   ├── interview.css          # Interview panel, roadmap, section labels
│   │   ├── timeline.css           # Timeline cards, affect arc
│   │   ├── memoir.css             # Memoir output panels
│   │   └── overlays.css           # Safety overlay, modals, permission card
│   └── js/
│       ├── config.js              # API endpoints, constants (load order: 1)
│       ├── state.js               # All shared mutable state (load order: 2)
│       ├── utils.js               # DOM helpers, esc(), getv(), setv() (load order: 3)
│       ├── data.js                # INTERVIEW_ROADMAP, ALL_EVENTS, THEMATIC_GROUPS (load order: 4)
│       ├── chat.js                # Chat panel, Lori message handling (load order: 5)
│       ├── timeline-ui.js         # Timeline render, affect arc (load order: 6)
│       ├── emotion-ui.js          # Emotion engine toggle, affect arc renderer (load order: 7)
│       ├── safety-ui.js           # Safety overlay, resources, sensitive segment UI (load order: 8)
│       ├── interview.js           # Interview session, roadmap, answer processing (load order: 9)
│       ├── app.js                 # Tab routing, init, profile, memoir (load order: 10)
│       └── emotion.js             # LoreVoxEmotion — MediaPipe engine (standalone)
│
├── server/
│   └── code/
│       └── api/
│           ├── main.py            # FastAPI app, CORS, router registration
│           ├── db.py              # SQLite CRUD — all tables
│           ├── safety.py          # Crisis detection — fully local, no LLM
│           ├── archive.py         # Interview archive write/rebuild
│           ├── interview_engine.py # Section/question/transcript helpers
│           ├── llm_interview.py   # LLM calls — summaries, memoir, follow-ups
│           └── routers/
│               ├── interview.py   # /api/interview/start, /answer, /progress, /summaries
│               ├── chat.py        # /api/chat
│               ├── persons.py     # /api/persons
│               ├── profile.py     # /api/profile
│               ├── timeline.py    # /api/timeline
│               ├── memoir.py      # /api/memoir
│               └── affect.py      # /api/interview/affect-event
│
├── data/
│   ├── persons/                   # Per-person archives and exports
│   │   └── {person_id}/
│   │       ├── sessions/          # Interview session archives
│   │       ├── facts/             # Confirmed facts (JSON)
│   │       ├── claims/            # Unverified claims (JSON)
│   │       └── exports/           # Generated memoir drafts
│   └── lorevox.db                 # SQLite database
│
├── launchers/
│   ├── run_gpu_8000.sh            # Start LLM / Interview API
│   └── run_tts_8001.sh            # Start TTS server
│
├── docs/
│   ├── LOREVOX_ARCHITECTURE.md    # Full data model, DB schema, processing pipeline
│   ├── Lorevox_Operating_Doctrine.md  # 10 product principles with implementation rules
│   └── DESIGN_PHILOSOPHY.md       # UX rationale and v5.x decision history
│
├── .env.example
├── server/requirements.blackwell.txt
├── server/requirements.tts.txt
└── README.md                      # This file
```

---

## Status — What Works Now

### Fully working

- **Interview engine** — guided roadmap, section navigation, question delivery, skip, save-as-memory
- **Lori (LLM chat)** — warm conversational interface, system prompt injection, streaming responses
- **Section summaries** — auto-generated by LLM at each section boundary, persisted to DB
- **Follow-up questions** — auto-proposed by LLM at end of base plan, inserted into question queue
- **Final memoir draft** — assembled from full session transcript when all follow-ups complete
- **Memory archive** — every session written to disk as structured events + human-readable `.txt`
- **Timeline** — manual memory cards (title, date, description, kind)
- **Profile** — basics, family, career, health, preferences panels
- **Roadmap navigation** — thematic and chronological views, section done/visited state persisted
- **Memory triggers** — world events matched to person's birth year and current section tags
- **Youth mode** — optional sections for younger narrators
- **TTS voice** — text-to-speech for Lori's responses (Coqui XTTS-v2 / Kokoro)
- **Voice input** — browser speech recognition for hands-free answers

### v6.1 Track A — Safety ✅

- Sentence-level crisis scanning on every answer (fully local, no LLM)
- 7 crisis categories, compound child-abuse detection, 8 false-positive guards
- Segment flagging: sensitive answers private + excluded from memoir by default
- Softened interview mode: Lori's tone automatically gentled for 3 turns post-disclosure
- Crisis resource overlay with category-relevant hotlines (988, RAINN, DV Hotline, Eldercare)
- Sensitive segment indicators in roadmap sidebar

### v6.1 Track B — Affect Awareness ✅

- Opt-in camera; fully local MediaPipe WASM processing
- 6 affect states: `steady`, `engaged`, `reflective`, `moved`, `distressed`, `overwhelmed`
- 2s sustain + 3s debounce before backend posting
- Affect arc visualisation in timeline (per-section dot trail)
- Affect nudges in Lori's question prompts (tone context appended to system instruction)
- Section sync: affect events tagged with current roadmap section ID

### In progress / next

- Claim extraction from interview transcripts (structured NLP pipeline)
- Fact verification UI (human review of extracted claims)
- Timeline-to-memoir assembly from confirmed facts
- Photo/document upload and tagging
- Multi-session continuity (resume interview across days)
- Export — PDF memoir, printable timeline

### Deliberately out of scope

- Cloud sync or remote data storage
- Social sharing or family collaboration in real time
- Voice cloning or synthetic voice of the narrator
- Medical or legal document processing
- Advertising, analytics, or any data leaving the local installation

---

## Supporting Documents

- **[Architecture](docs/LOREVOX_ARCHITECTURE.md)** — full data model, DB schema, processing pipeline, feature map, milestone targets
- **[Operating Doctrine](docs/Lorevox_Operating_Doctrine.md)** — 10 product principles with implementation must-do / must-not rules and a 5-question design test
- **[Design Philosophy](docs/DESIGN_PHILOSOPHY.md)** — UX decision history from v5.2 through v5.5, rationale for every major UI pattern

---

*Lorevox v6.1 — local-first, privacy-first, human-first.*
