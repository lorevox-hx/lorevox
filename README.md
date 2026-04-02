# Lorevox

**A local-first, privacy-first memoir and life-story platform for older adults and their families.**

Lorevox captures a person's memories through guided interview conversations, organises them into a verified timeline, and drafts a human-readable memoir. The AI is a scribe — it structures, prompts, and drafts. The human is the author. Every word they speak is the ground truth.

**Lorevox 8.0 — pre-production ready. Phase D complete. Full test harness active.**

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

## Shipped Systems

### Identity-first onboarding
Lori learns the narrator's name, date of birth, and birthplace before any memoir interview begins. The identity phase is gated — no interview pass fires until core identity is established. The flow is warm and conversational, not form-like.

### A three-pass interview model
Every session follows a deliberate structure. **Pass 1** seeds the timeline — birth year, birthplace, a few anchoring facts. **Pass 2A** walks the chronological spine — six named life periods from Early Childhood through Later Life. **Pass 2B** goes deep into scenes, sensory memory, and emotional texture. The interview has shape and direction. Lori knows where she is in the story.

### A live cognitive state layer — runtime71
Every turn, Lorevox sends a full cognitive state payload to the model:

```json
{
  "current_pass":       "pass2a",
  "current_era":        "early_childhood",
  "current_mode":       "open",
  "affect_state":       "reflective",
  "affect_confidence":  0.87,
  "cognitive_mode":     "open",
  "fatigue_score":      18,
  "media_count":        3,
  "narrator_location":  "Duluth, MN"
}
```

This isn't metadata. It drives the model's behavior through explicit behavioral directives in the system prompt — DO/DO NOT language for every pass, era, mode, and fatigue level. The model knows when someone is tired and shortens its responses. The model knows when someone is confused and offers anchoring language. The model knows when someone is distressed and slows down.

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
AffectBridge74 → state.session.visualSignals → buildRuntime71()
    ↓
prompt_composer.py → behavioral directives → LLM
```

No video ever leaves the browser. No landmarks are logged. No raw emotion labels are transmitted. Only derived affect states cross to the backend — and only after the narrator's facial expression has been sustained for two seconds, with a minimum three-second gap between signals.

### Camera consent and preview
Before the camera activates, a dedicated consent modal requires the narrator to read an explicit explanation of facial expression analysis, check an acknowledgment box, and confirm. The button is disabled until the checkbox is ticked. Once consented, a draggable floating camera preview panel shows the narrator exactly what the camera sees. The preview can be hidden and re-opened. Closing the consent modal or declining disables emotion-aware mode for the session.

### Transparency rule (v8.0)
If the narrator directly asks whether Lorevox is using their camera, recording their voice, tracking their location, or sensing their emotions — Lori answers truthfully based on the actual runtime state. Never denies an active capability. Never asserts an inactive one. This is enforced by a dedicated directive in `prompt_composer.py`, anchored to LORI_RUNTIME, not to model heuristics.

### Cognitive mode intelligence
The system continuously reads the narrator's inputs and affect state and selects a cognitive mode for each turn:

- **Open** — default; warm, open-ended questions, normal pacing
- **Recognition** — activated by uncertainty language or confusion signals; Lori uses anchoring language, concrete memory cues, shorter questions
- **Grounding** — activated by distress or dissociation signals; Lori slows down, uses present-moment language, removes all pressure
- **Light** — activated by fatigue signals; Lori shortens responses, offers breaks, reduces question complexity

### A safety layer that never uses the LLM
Every interview answer is scanned before Lori's next question is served. The scanner is fully local — keyword and compound pattern matching, no model call, no latency. Seven crisis categories: `suicidal_ideation`, `sexual_abuse`, `physical_abuse`, `domestic_abuse`, `child_abuse`, `caregiver_abuse`, `distress_call`. On detection: the segment is flagged private and excluded from memoir by default, Lori's tone is automatically gentled, and a crisis resource overlay surfaces category-relevant hotlines.

### Meaning engine
Every turn is scanned for narrative significance using local regex and pattern matching. Turning points ("that was when everything changed"), reflections ("looking back…"), loss, identity, and change events are detected, tagged, and fed into memoir section routing. The model receives emotional theme context so memoir sections receive appropriate narrative weight.

### Bio Builder (Phases D / E / F)
A structured candidate pipeline that extracts biographical facts from conversation and surfaces them for narrator review. Phase D extracts candidates. Phase E presents them in a review queue — approve, edit, or reject. Phase F orchestrates the downstream sync: only approved items flow into the Life Map, Timeline, and Memoir Preview. No raw candidates ever reach downstream systems. Anti-leakage is enforced in code, not convention.

### Life Map navigator
A mind-map canvas (powered by a local vendored Mind Elixir library) showing people, memories, events, and places derived from approved Bio Builder items. Updates on every Phase F run.

### Media Builder
Full photo lifecycle — upload (multipart POST), serve (FileResponse), gallery (3-column grid), lightbox (full-size view + metadata edit), attach photos to memoir sections, delete. DOCX memoir export includes photos inline at section headings (`doc.add_picture` via python-docx). Photo count (`media_count`) is emitted in runtime71 so Lori can acknowledge uploaded photos naturally in conversation.

### Memoir DOCX export
Server-side export via `memoir_export.py`. Two export modes: Threads (one section per heading, photos inline) and Draft (narrative + photo appendix). Attached photos included via `AttachedPhoto` model. Graceful skip on corrupt or missing photo files — a single bad photo does not abort the export.

### Paired interview mode
Harold and June can use Lorevox together. The `paired` and `paired_speaker` flags in runtime71 signal coupled-narrator sessions to the model. Identity extraction and memoir attributions maintain speaker context.

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

## Architecture

```
Narrator speaks (voice or keyboard)
        ↓
   cognitive-auto.js — reads message + affect state, selects cognitive mode
        ↓
   buildRuntime71() — assembles full cognitive state payload
   (pass, era, mode, affect, fatigue, location, media_count, meaning tags, paired state)
        ↓
   WebSocket → chat_ws.py
        ↓
   prompt_composer.py — injects behavioral directives + TRANSPARENCY RULE
        ↓
   Llama 3.1-8B — generates response shaped by live cognitive state
        ↓
   Response → Archive (raw) → History (candidate facts) → Memoir (narrative)

Parallel: MediaPipe Face Mesh (browser) → AffectBridge74 → visual_signals → runtime71
Parallel: safety.py — local scan on every answer, no LLM involved
Parallel: Bio Builder pipeline → candidate review → Phase F → Life Map / Timeline / Memoir Preview
```

### Three-service runtime

| Service | Port | Handles |
|---|---|---|
| LLM / Interview API | 8000 | Interview engine, LLM chat, prompt composition, affect events, safety scan, media, facts, DOCX export |
| TTS | 8001 | Text-to-speech synthesis, voice playback |
| UI Server | 8080 | Static file serving with COOP/COEP headers for WASM + SharedArrayBuffer + camera |

All three services are managed by the scripts in `scripts/`. The API runs under a GPU-enabled Python venv, TTS under its own venv, and the UI server is a lightweight Python HTTP server (`lorevox-serve.py`) with `SO_REUSEADDR` for instant rebind on restart.

---

## Quick Start

### Prerequisites

- WSL2 (Ubuntu 22.04 recommended)
- NVIDIA GPU, CUDA 12.x
- Python 3.11+
- Chrome (recommended for MediaPipe WASM + WebSocket)

### Setup

```bash
git clone git@github.com:lorevox-hx/lorevox.git
cd lorevox
cp .env.example .env
# Edit .env — set DATA_DIR (absolute path), DB_NAME if non-default

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
```

### Launch

```bash
# All services — recommended (starts API, TTS, UI + warmup)
bash scripts/start_all.sh

# Or via Windows Terminal (opens 3 tabs automatically)
start_lorevox.bat

# Or individually in separate terminals:
bash scripts/start_api_visible.sh    # Terminal 1 — API (port 8000)
bash scripts/start_tts_visible.sh    # Terminal 2 — TTS (port 8001)
bash scripts/start_ui_visible.sh     # Terminal 3 — UI  (port 8080)
```

Then open: **http://localhost:8080/ui/lori8.0.html**

The UI server provides cross-origin isolation headers (COOP/COEP) required for reliable camera access and the multi-threaded WASM path.

### Desktop Shortcuts

To create a `Lori` folder on your Desktop with one-click shortcuts for Start, Stop, Reload, Status, and Logs:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup_desktop_shortcuts.ps1
```

Alternatively, copy the `.bat` files from `shortcuts/` to wherever you want them. They use relative paths and will work from any location as long as the repo is at `C:\Users\chris\lorevox`.

### Restart

```bash
# Restart API only (TTS and UI survive — Phase D scoped kill)
bash scripts/restart_api_visible.sh

# Restart everything
bash scripts/stop_all.sh && bash scripts/start_all.sh
```

### Stop

```bash
bash scripts/stop_all.sh
```

### Status

```bash
bash scripts/status_all.sh
```

Prints a table showing each service's PID, process state, and health endpoint result.

### Verify

Open the browser console. Send a message to Lori. You should see:

```
[Lori 8.0] runtime71 → model: { "current_pass": ..., "fatigue_score": ..., ... }
```

On narrator switch, the console should show:

```
[WO-2] Session verified for person_id: <id>
```

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

---

## Database

The database is a local SQLite file. Path logic (from `server/code/api/db.py`):

```python
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_DIR   = DATA_DIR / "db"
DB_NAME  = os.getenv("DB_NAME", "lorevox.sqlite3")
DB_PATH  = DB_DIR / DB_NAME
```

| Variable | Default | Override via `.env` |
|---|---|---|
| `DATA_DIR` | `data` (relative to server CWD) | `DATA_DIR=/absolute/path/to/data` |
| `DB_NAME` | `lorevox.sqlite3` | `DB_NAME=mydb.sqlite3` |
| `DB_PATH` | `data/db/lorevox.sqlite3` | Derived |

`DB_DIR` is created automatically on first startup. Set `DATA_DIR` to an absolute path in `.env` for production reliability. The database path is logged at startup: `Lorevox DB: <path>`.

---

## Active Folder Structure

```
lorevox/
├── ui/
│   ├── lori8.0.html                 # Active shell — 8.0 UI, Bio Builder, Media Builder
│   ├── lori7.5.html                 # Legacy 7.5 shell (reference only)
│   ├── css/
│   │   ├── tailwind.min.css         # Utility CSS base
│   │   ├── base.css                 # Global base styles
│   │   ├── layout.css               # Shell layout
│   │   ├── safety.css               # Crisis overlay styles
│   │   ├── affect.css               # Emotion toggle / affect arc
│   │   ├── lori80.css               # Primary 8.0 styles (chat, tabs, media builder, camera preview)
│   │   ├── bio-review.css           # Bio Builder candidate cards
│   │   ├── bio-phase-f-*.css        # Phase F debug / report / test / control center styles
│   │   └── bio-control-center.css   # Bio Builder control center
│   ├── js/
│   │   ├── state.js                 # All shared mutable state
│   │   ├── data.js                  # Data layer helpers
│   │   ├── api.js                   # API client
│   │   ├── tabs.js                  # Tab switching
│   │   ├── safety-ui.js             # Crisis overlay render
│   │   ├── permissions.js           # Mic / camera / location toggles
│   │   ├── emotion.js               # LoreVoxEmotion — MediaPipe engine
│   │   ├── facial-consent.js        # FacialConsent — session-scoped camera consent gate
│   │   ├── affect-bridge.js         # AffectBridge74 — debounce + baseline
│   │   ├── emotion-ui.js            # Emotion toggle UI, camera lifecycle
│   │   ├── timeline-ui.js           # Timeline render
│   │   ├── interview.js             # Interview session, pass / era routing
│   │   ├── app.js                   # Core: buildRuntime71, meaning engine, send flow, memoir export
│   │   ├── cognitive-auto.js        # Auto cognitive mode selection per turn
│   │   ├── life-map.js              # Life Map navigator canvas
│   │   ├── narrator-preload.js      # Narrator preload / template loader
│   │   ├── projection-map.js        # Projection map renderer
│   │   ├── projection-sync.js       # Projection sync logic
│   │   ├── bio-builder.js           # Bio Builder — quick capture, candidate pipeline
│   │   ├── bio-builder-*.js         # Bio Builder modules (core, candidates, family-tree, life-threads, questionnaire, sources)
│   │   ├── bio-review.js            # Bio Builder review surface
│   │   ├── bio-promotion-adapters.js # Promotion adapters — candidates → structuredBio
│   │   ├── bio-phase-f.js           # Phase F orchestrator — approved-only downstream sync
│   │   ├── bio-phase-f-report.js    # Phase F run report UI
│   │   ├── bio-phase-f-test-harness.js # Phase F test harness (dev/QA)
│   │   └── bio-control-center.js    # Bio Builder control center
│   ├── templates/                   # Narrator profile templates (JSON)
│   ├── docs/                        # UI-specific architecture docs
│   └── vendor/
│       ├── mediapipe/               # MediaPipe Face Mesh + camera utils (local WASM)
│       ├── floating-ui/             # Tooltip / popover positioning
│       └── mind-elixir/             # Life Map mind-map renderer
│
├── server/
│   ├── requirements.blackwell.txt   # GPU/LLM Python dependencies (RTX 5080 / Blackwell)
│   ├── requirements.tts.txt         # TTS Python dependencies (separate venv)
│   ├── schema/
│   │   └── migrate_ai_extensions.sql # DB migration scripts
│   ├── scripts/
│   │   └── seed_rag_docs.py         # RAG document seeder
│   └── code/
│       └── api/
│           ├── main.py              # FastAPI entrypoint; .env loader; CORS; mounts /ui
│           ├── db.py                # SQLite CRUD; all table init; media + attachments
│           ├── api.py               # LLM REST router
│           ├── safety.py            # Crisis detection — local, no LLM
│           ├── prompt_composer.py   # System prompt assembly; runtime71 directives; TRANSPARENCY RULE
│           ├── affect_service.py    # Affect state service layer
│           ├── archive.py           # Archive / transcript storage
│           ├── interview_engine.py  # Interview plan engine
│           ├── llm_interview.py     # LLM-driven interview logic
│           ├── tts_service.py       # TTS client bridge
│           └── routers/
│               ├── chat_ws.py       # WebSocket turn handler
│               ├── people.py        # Narrator entity CRUD
│               ├── profiles.py      # Profile: basics, facts, career, family map
│               ├── media.py         # Photo upload / serve / delete / attach
│               ├── timeline.py      # Life periods, events
│               ├── interview.py     # Session / question advancement
│               ├── sessions.py      # Session management
│               ├── facts.py         # Fact extraction POST
│               ├── extract.py       # LLM-powered biographical extraction pipeline
│               ├── stt.py           # Speech-to-text
│               ├── affect.py        # Affect event logging
│               ├── memoir_export.py # DOCX export with AttachedPhoto support
│               ├── calendar.py      # Calendar utilities
│               ├── db_inspector.py  # DB inspection (dev tool)
│               ├── ping.py          # Health check endpoint
│               ├── stream_bus.py    # SSE event stream bus
│               └── tts.py           # TTS endpoint (optional; LV_ENABLE_TTS=1)
│
├── shortcuts/                       # Desktop shortcut .bat files (portable)
│   ├── Start Lori.bat               # Launch all services via Windows Terminal
│   ├── Stop Lori.bat                # Stop all services
│   ├── Reload API.bat               # Restart API only
│   ├── Status.bat                   # Print service status
│   └── Logs.bat                     # Tail combined logs
│
├── launchers/                       # WSL shell launchers (Linux-native)
│   ├── run_all_dev.sh               # Start all services
│   ├── stop_all_dev.sh              # Stop all services
│   ├── run_gpu_8000.sh              # LLM / API server
│   └── run_tts_8001.sh              # TTS server
│
├── scripts/
│   ├── common.sh                    # Shared variables, health checks, process helpers
│   ├── start_all.sh                 # Shell-native launcher (all 3 services + warmup)
│   ├── restart_api.sh               # Shell-native API restart + warmup
│   ├── stop_all.sh                  # Stop all services
│   ├── status_all.sh                # Print service status
│   ├── start_api_visible.sh         # Visible API startup (Windows Terminal tab)
│   ├── start_tts_visible.sh         # Visible TTS startup (Windows Terminal tab)
│   ├── start_ui_visible.sh          # Visible UI startup (Windows Terminal tab)
│   ├── restart_api_visible.sh       # Visible API restart (Windows Terminal tab)
│   ├── logs_visible.sh              # Visible combined log tail (Windows Terminal tab)
│   ├── bootstrap.sh                 # First-time setup helper
│   ├── test_all.sh                  # Unified test runner (all layers)
│   ├── test_stack_health.sh         # Stack health tests (ports, PIDs, VRAM guard)
│   ├── test_startup_matrix.sh       # Startup cycle tests (isolation, rapid restart)
│   ├── inspect_db.py                # DB inspection utility
│   ├── seed_interview_plan.py       # Seed default interview plan
│   ├── warm_llm.py                  # LLM warm-up
│   └── warm_tts.py                  # TTS warm-up
│
├── tools/
│   ├── LOREVOX_80_DEBUG_TIMELINE_INSPECTOR.html  # Session debug visualiser
│   └── samples/                     # Sample data files for testing
│
├── tests/
│   ├── test_api_smoke.py            # API endpoint smoke tests (31 tests)
│   ├── test_db_smoke.py             # DB persistence/isolation tests (14 tests)
│   └── e2e/
│       ├── test_lori80_smoke.spec.ts    # Browser smoke + regression (15 tests)
│       ├── test_narrator_switch.spec.ts # Narrator isolation (6 tests)
│       ├── test_bio_builder.spec.ts     # Bio Builder contracts (9 tests)
│       ├── lorevox-smoke-flow.spec.ts   # Legacy backend contract test
│       └── lorevox-ui-audit.spec.ts     # Legacy UI audit
│
├── docs/                            # All project documentation
│   ├── architecture/                # System design, philosophy, action plans
│   ├── reports/                     # Phase reports, validation results, ship reports
│   ├── bug-logs/                    # Bug logs, fix plans, failure logs
│   ├── work-orders/                 # Work orders, implementation plans
│   ├── test-matrices/               # Test plans, test checklists, scoring
│   ├── release-notes/               # Version release notes
│   ├── handoffs/                    # Handoff docs, session reports, audits
│   ├── vision/                      # Conceptual docs, digital sunset, personas
│   ├── runbook/                     # Operational guides
│   └── scratch/                     # Temporary notes
│
├── eval/                            # Evaluation scripts
│   └── eval_onboarding.py
├── expansion ideas/                 # Future feature exploration (v7.1 packs)
├── research/                        # Background research docs
├── schemas/                         # JSON schemas (persona scoring, ingestion)
│
├── lorevox-serve.py                 # Local UI HTTP server (COOP/COEP for WASM)
├── start_lorevox.bat                # Windows: start all services (Windows Terminal)
├── stop_lorevox.bat                 # Windows: stop all services
├── reload_api.bat                   # Windows: restart API only
├── status_lorevox.bat               # Windows: print service status
├── logs_lorevox.bat                 # Windows: tail combined logs
├── setup_desktop_shortcuts.ps1      # Create Desktop/Lori shortcut folder
├── .env                             # Local environment config (not committed)
└── .env.example                     # Environment template
```

---

## Active Code Inventory by Layer

### Backend core modules
`server/code/api/main.py` · `server/code/api/db.py` · `server/code/api/api.py` · `server/code/api/prompt_composer.py` · `server/code/api/safety.py` · `server/code/api/affect_service.py` · `server/code/api/archive.py` · `server/code/api/interview_engine.py` · `server/code/api/llm_interview.py` · `server/code/api/tts_service.py`

### Active routers (all registered in `main.py`)
`chat_ws` · `people` · `profiles` · `media` · `timeline` · `interview` · `sessions` · `facts` · `extract` · `stt` · `affect` · `memoir_export` · `db_inspector` · `ping` · `stream_bus` · `calendar` · `tts` *(optional)*

### Active frontend JavaScript (loaded by `lori8.0.html`)
`state.js` · `data.js` · `api.js` · `tabs.js` · `safety-ui.js` · `permissions.js` · `emotion.js` · `facial-consent.js` · `affect-bridge.js` · `emotion-ui.js` · `timeline-ui.js` · `interview.js` · `app.js` · `cognitive-auto.js` · `life-map.js` · `narrator-preload.js` · `projection-map.js` · `projection-sync.js` · `bio-builder.js` · `bio-builder-core.js` · `bio-builder-candidates.js` · `bio-builder-family-tree.js` · `bio-builder-life-threads.js` · `bio-builder-questionnaire.js` · `bio-builder-sources.js` · `bio-review.js` · `bio-promotion-adapters.js` · `bio-phase-f.js` · `bio-phase-f-report.js` · `bio-phase-f-test-harness.js` · `bio-phase-f-debug.js` · `bio-control-center.js` + Media Builder IIFE + Camera Preview IIFE (both inline in `lori8.0.html`)

### Vendored dependencies (all local, no CDN)
`mediapipe/face_mesh/face_mesh.js` · `mediapipe/camera_utils/camera_utils.js` · `floating-ui/core.min.js` · `floating-ui/dom.min.js` · `mind-elixir/mind-elixir.js`

---

## Shipped vs Pending

### Shipped (v8.0 — confirmed active)

- Identity-first onboarding
- Three-pass interview model (Pass 1, Pass 2A, Pass 2B)
- runtime71 cognitive state pipeline
- Cognitive auto-mode selection (open / recognition / grounding / light)
- Affect / emotion pipeline (MediaPipe → AffectBridge74 → model)
- Camera consent gate + draggable preview
- Transparency Rule — trust-question truthful answers
- Safety scan (local, no LLM, 7 categories)
- Meaning engine (turning points, reflections, loss, identity)
- Bio Builder D / E / F (candidate pipeline → review → Phase F sync)
- Phase F orchestration (approved-only downstream; Life Map / Timeline / Memoir preview)
- Life Map navigator
- Media Builder (upload / gallery / lightbox / attach / DOCX embed)
- Memoir DOCX export (Threads + Draft modes, photo embed)
- Paired interview mode (Harold and June pattern)
- TTS voice (Coqui XTTS-v2 / Kokoro)
- Voice input (browser speech recognition)
- Debug Timeline Inspector (`tools/LOREVOX_80_DEBUG_TIMELINE_INSPECTOR.html`)
- 20-run deep runtime test — 20/20 PASS, 0 critical failures

### Pending

- Phase 8 — MediaPipe WASM crash fix (vendor asset verification, SIMD path testing)
- Phase 9 — UI scale and focus mode (widen Lori dock, focus mode CSS)
- ISSUE-17 — Camera stream unification (preview + emotion engine share one `getUserMedia` call)
- First Narrator Session Protocol (behavioral guide for first real narrator session — not more code)

### Deliberately out of scope

- Cloud sync or remote storage
- Social sharing or family collaboration
- Voice cloning
- Medical or legal document processing
- Advertising, analytics, or any data leaving the local installation

---

## Trust, Privacy, and Local-First Stance

- **No video ever leaves the browser.** MediaPipe runs entirely in the browser via WASM. No video frames, no facial landmarks, no raw emotion labels are transmitted to the backend or stored.
- **Only derived, aggregated signals cross to the backend.** Affect state labels (`reflective`, `moved`, `steady`, etc.) and only after a 2-second sustain and 3-second inter-event gap.
- **No cloud dependency at runtime.** LLM, TTS, and emotion engine all run locally. The system operates fully air-gapped after setup.
- **Camera requires informed consent.** A dedicated modal with a checkbox acknowledgment — the button is disabled until checked. No camera opens without completing this step.
- **Transparency is enforced.** If a narrator asks whether the camera, location, or emotion sensing is active, Lori answers truthfully based on actual runtime state — not model heuristics.
- **Safety scan is local.** Crisis detection runs without a model call, without network access, without storing the flagged content in any external service.
- **Data stays on your machine.** The database, media files, and all transcripts are stored in `data/` on the local machine. Nothing is sent anywhere.

---

## Debug Tools

| Tool | How |
|---|---|
| Live runtime overlay | `Ctrl+Shift+D` in browser — shows pass, era, mode, affect, fatigue bar, cognitive log |
| runtime71 per turn | Browser console: `[Lori 8.0] runtime71 → model: {...}` |
| Compact server log | Always on: `[chat_ws] turn: conv=...` with affect/fatigue summary |
| Full system prompt | Set `LV_DEV_MODE=1` in `.env` and restart backend |
| DB inspector | `python scripts/inspect_db.py` from repo root |
| **8.0 Runtime Inspector** | `http://localhost:8080/tools/LOREVOX_80_DEBUG_TIMELINE_INSPECTOR.html` — drag-drop or paste a `window.__lv80TurnDebug` JSON export to render a visual session timeline |

### Lori 8.0 — Runtime Inspector

The Debug Timeline Inspector is a standalone dev tool for visualising `window.__lv80TurnDebug` session exports.

1. Open a Lori 8.0 session and run some turns
2. In the browser console: `copy(JSON.stringify(window.__lv80TurnDebug))`
3. Paste into the inspector and click **Render Timeline**

The inspector renders a vertical event timeline colour-coded by posture (indigo = life_story, teal = memory_exercise, amber = companion, rose = safety). Summary stat cards cover: total events, mode transitions, suppressed extractions, idle cancellations, override transitions, manual mode switches, and narrator resets.

---

## Key Documents

| Document | Purpose |
|---|---|
| `docs/handoffs/REPO_AUDIT_AND_RUNTIME_INVENTORY.md` | Complete active file inventory, DB path logic, legacy classification |
| `docs/reports/LOREVOX_20_RUN_DEEP_RUNTIME_REPORT.md` | 20-run deep runtime test — 20/20 PASS, 0 critical failures |
| `docs/architecture/LOREVOX_ACTION_PLAN.md` | Current action plan — milestones, remaining phases, tracked issues |
| `docs/architecture/Lorevox_Operating_Doctrine.md` | 10 product principles with implementation rules |
| `docs/architecture/DESIGN_PHILOSOPHY.md` | UX rationale and decision history |
| `docs/architecture/AGING_UI_PRINCIPLES.md` | Accessibility and aging-first UI principles |
| `docs/reports/MEDIA_BUILDER_TEST_REPORT.md` | Media Builder ship report |
| `docs/reports/CAMERA_PREVIEW_SHIP_REPORT.md` | Camera preview ship report |
| `docs/reports/MEANING_ENGINE_POSTSHIP_REPORT.md` | Meaning engine post-ship analysis |
| `docs/reports/BIO_BUILDER_PHASE_F_REPORT.md` | Bio Builder Phase F ship report |
| `docs/test-matrices/LOREVOX_80_RUNTIME_ASSESSMENT_UPDATED.md` | 10-turn runtime matrix — behaviorally validated |
| `ui/docs/BIO_BUILDER_ARCHITECTURE.md` | Bio Builder architecture detail |
| `ui/docs/LIFE_MAP_BEHAVIOR_TESTS.md` | Life Map behavior validation |
| `tests/SAFETY_TEST_MATRIX_911_988.md` | Safety scan test matrix |

---

## Testing

Lorevox 8.0 ships with a layered test harness covering startup, API, DB, and browser behavior.

### Run all tests

```bash
bash scripts/test_all.sh              # full suite (requires running stack)
bash scripts/test_all.sh --skip-llm   # skip LLM chat tests (faster, no GPU needed)
bash scripts/test_all.sh --health     # stack health only
bash scripts/test_all.sh --api        # API smoke only
bash scripts/test_all.sh --db         # DB smoke only
bash scripts/test_all.sh --e2e        # Playwright E2E only
```

### Individual test layers

```bash
# Layer 1: Stack health (ports, PIDs, headers, VRAM guard, dead files)
bash scripts/test_stack_health.sh

# Layer 2: Startup matrix (start/stop/restart cycles, service isolation)
bash scripts/test_startup_matrix.sh    # WARNING: cycles services

# Layer 3: API smoke (CRUD, sessions, facts, timeline, chat)
python tests/test_api_smoke.py -v

# Layer 4: DB smoke (persistence, isolation, cascades, soft delete)
python tests/test_db_smoke.py -v

# Layer 5: Playwright E2E (UI, narrator switch, Bio Builder, contracts)
npx playwright test tests/e2e/
```

### Test files

| File | Tests | Focus |
|---|---|---|
| `scripts/test_stack_health.sh` | SH-01 to SH-22 | Ports, health, PIDs, VRAM guard, WO-2 code, dead files, kill scope |
| `scripts/test_startup_matrix.sh` | SM-01 to SM-08 | Start/stop cycles, restart isolation, SO_REUSEADDR |
| `tests/test_api_smoke.py` | AS-01 to AS-31 | REST endpoints, CRUD, chat, narrator isolation |
| `tests/test_db_smoke.py` | DB-01 to DB-14 | Persistence, cross-narrator isolation, cascades, soft delete |
| `tests/e2e/test_lori80_smoke.spec.ts` | E2E-01 to E2E-15 | UI load, status, modules, chat, interview |
| `tests/e2e/test_narrator_switch.spec.ts` | NS-01 to NS-06 | Cross-narrator isolation, rapid switching |
| `tests/e2e/test_bio_builder.spec.ts` | BB-01 to BB-09 | Bio Builder contracts, meaning engine, UI modules |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Address already in use" on UI restart | Previous socket in TIME_WAIT | Fixed in Phase D: `ReusableTCPServer` sets `SO_REUSEADDR`. If it still occurs, run `bash scripts/stop_all.sh` and retry. |
| API restart kills TTS | `kill_stale_lorevox()` was too broad | Fixed in Phase D: scoped to API-only patterns. Use `restart_api_visible.sh`. |
| Narrator identity bleed across switches | Backend retains previous narrator's turns | Fixed in Phase D (WO-2): `sync_session`/`session_verified` handshake flushes context on switch. |
| CUDA OOM / API self-terminates | Input tokens exceed KV cache | Fixed in Phase D (WO-1): `MAX_CONTEXT_WINDOW=4096` guard truncates inputs. |
| Chat input stuck on "Syncing session" | `session_verified` not received | Restart the API (`bash scripts/restart_api_visible.sh`). Chat input unlocks when the new WS handshake completes. |
| Stale PID files | Process died but PID file remains | Run `bash scripts/stop_all.sh` to clean up, then `bash scripts/start_all.sh`. |
| TTS not loading | `USE_TTS=0` in .env | Set `USE_TTS=1` in `.env` and restart. TTS requires its own venv. |
| VRAM guard triggers constantly | Context window too small | Increase `MAX_CONTEXT_WINDOW` in `.env` (default 4096). Monitor with `nvidia-smi`. |

### Logs

| Service | Log location |
|---|---|
| API | `.runtime/logs/api.log` (also visible in terminal when using `start_api_visible.sh`) |
| TTS | `.runtime/logs/tts.log` |
| UI | `.runtime/logs/ui.log` |
| Combined | `bash scripts/logs_visible.sh` tails all three |

Set `LV_DEV_MODE=1` in `.env` to see full system prompts in the API log.

---

## Phase D Fixes (Active)

Phase D addressed four operational risk areas. All fixes are verified and active in the current codebase.

**WO-1 — VRAM Guard:** `MAX_CONTEXT_WINDOW=4096` (configurable in `.env`). Before every `model.generate()` call in `api.py` and `chat_ws.py`, input tokens are truncated via tail-slice if they exceed the window. Prevents CUDA OOM and the 100-second model reload.

**WO-2 — Identity-Session Handshake:** On WebSocket open and narrator switch, the UI sends `sync_session` with the active `person_id`. The backend flushes old conversation turns on mismatch and responds with `session_verified`. The chat input is locked until verification completes. Prevents narrator identity contamination.

**Startup Orchestration:** `kill_stale_lorevox()` is scoped to API processes only — TTS and UI survive API restarts. `kill_all_lorevox()` handles full-stack teardown. `lorevox-serve.py` uses `ReusableTCPServer` (SO_REUSEADDR) for instant port rebind.

**Repo Cleanup:** 40 dead files removed (versioned copies: v1-v16 Python, old HTML/JS/CSS). Active import chain verified: `main.py → api.py → db.py → chat_ws.py`. UI entry: `lori8.0.html`.

---

## Status — v8.0

### Pre-production ready

- 20-run deep runtime test: 20/20 PASS, 0 critical failures
- Phase D work orders complete (VRAM guard, identity handshake)
- Startup orchestration verified (service isolation, rapid restart)
- Full test harness active (health, API, DB, E2E)
- No drift across repeated runs
- Architecture integrity confirmed (Phase F anti-leakage, meaning engine, affect pipeline, identity gate)
- All core invariants holding
- Trust/privacy alignment enforced (TRANSPARENCY RULE, consent gate, local-only processing)

### One tracked issue before first narrator session

**ISSUE-17 — Camera stream unification.** The draggable preview and emotion engine currently call `getUserMedia` separately. On some browsers this may surface a second permission dialog. Fix: pass the existing emotion engine MediaStream into the preview element. Priority: low but should resolve before first narrator session.

---

## License

Copyright (c) 2026 Chris (dev@lorevox.com). All rights reserved.

Lorevox is **source-available, not open source.** You may view and study this code and run it locally for personal, non-commercial use. You may not use it commercially, host it for others, or redistribute it in any form without written permission.

The name Lorevox, the Lori interviewer persona, the runtime71 cognitive state system, the multi-pass interview model, all prompt and directive text, and all documentation are explicitly reserved and are not licensed under any terms.

Contributions are by invitation only and require full assignment of rights to the copyright holder.

See [LICENSE](LICENSE) for complete terms. For permissions: dev@lorevox.com

---

*Lorevox 8.0 — local-first, privacy-first, human-first. Every word they speak is the ground truth. Lori is the app.*
