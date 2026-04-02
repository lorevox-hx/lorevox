# Lorevox 8.0 — System Architecture Review

**Date:** 2026-04-02
**Scope:** Full-stack architecture analysis of the Lorevox 8.0 AI memoir studio
**Entry Point:** `ui/lori8.0.html`

---

## 1. High-Level Architecture

Lorevox 8.0 is a local-first AI memoir studio built on a three-service architecture. All data stays on the user's device — there is no cloud sync, no remote telemetry, and no external API calls beyond the local LLM inference server.

### Services

| Service | Port | Technology | Role |
|---------|------|------------|------|
| UI | 8080 | Static file server | Serves the single-page application |
| API | 8000 | Python / FastAPI | LLM inference, chat, extraction, CRUD |
| TTS | 8001 | Python | Text-to-speech for memoir narration |

### Technology Stack

**Frontend:** Vanilla JavaScript (no framework, no build system), Tailwind CSS, HTML5 Popover API, Web Speech API, MediaPipe face mesh (WASM). 32 JS modules loaded via `<script>` tags in dependency order.

**Backend:** FastAPI with 18 route modules, Llama 3.1-8B (4-bit quantized via bitsandbytes), SQLite for persistent storage, WebSocket streaming for chat.

**Persistence Model:** Dual-layer — localStorage for all frontend draft state (questionnaire, family tree, life threads, projections, spine), SQLite for backend records (people, conversations, segments, extractions).

---

## 2. Directory Structure

```
lorevox/
├── ui/                          # Frontend SPA
│   ├── lori8.0.html             # Entry point (187KB, loads all 32 JS modules)
│   ├── js/                      # 32 vanilla JS modules
│   │   ├── state.js             # Global state singleton (loaded first)
│   │   ├── app.js               # Core init, identity onboarding, chat (141KB)
│   │   ├── bio-builder-*.js     # 10 Bio Builder sub-modules
│   │   ├── projection-*.js      # Projection sync layer (2 files)
│   │   ├── interview.js         # Interview session management (46KB)
│   │   ├── emotion.js           # Emotional intelligence (16KB)
│   │   ├── affect-bridge.js     # Affect state bridging (7KB)
│   │   └── ...                  # See full load order below
│   ├── css/                     # Stylesheet stack
│   │   ├── tailwind.min.css     # Utility framework
│   │   ├── base.css             # Design tokens and resets
│   │   ├── layout.css           # Structural layout
│   │   ├── safety.css           # Safety UI overlays
│   │   ├── affect.css           # Emotion visualization
│   │   ├── lori80.css           # App-specific styles
│   │   └── bio-*.css            # Bio Builder component styles
│   └── vendor/                  # Third-party libraries (no npm)
│       ├── face_mesh/           # MediaPipe WASM binaries
│       ├── floating-ui/         # Popover positioning
│       └── mind-elixir/         # Mind map visualization
│
├── server/
│   └── code/api/
│       ├── main.py              # FastAPI app, mounts 18 routers
│       ├── api.py               # LLM loading, POST /api/chat
│       ├── prompt_composer.py   # System prompt with runtime71 injection (47KB)
│       ├── db.py                # SQLite schema and all CRUD (76KB)
│       └── routers/
│           ├── chat_ws.py       # WebSocket streaming chat (46KB)
│           ├── extract.py       # Multi-field fact extraction
│           ├── people.py        # Person CRUD
│           └── ...              # 15 more route modules
│
├── config/                      # YAML configuration files
├── schemas/                     # JSON schemas for data validation
├── scripts/                     # Utility and deployment scripts
├── logs/                        # Runtime logs
└── docs/                        # Documentation and bug reports
```

---

## 3. Frontend Module Load Order

All 32 modules are loaded synchronously via `<script>` tags in `lori8.0.html`. Order matters — each module may depend on globals set by earlier ones. `state.js` loads first (establishes the shared state object), and `app.js` loads in the middle (not last) to allow Bio Builder modules to register against the initialized app.

```
 1. state.js                    ← Global state singleton
 2. data.js                     ← Data utilities
 3. api.js                      ← HTTP/WS client helpers
 4. tabs.js                     ← Tab/panel switching
 5. safety-ui.js                ← Safety overlays
 6. permissions.js              ← Permission management
 7. emotion.js                  ← MediaPipe emotion detection
 8. facial-consent.js           ← Camera consent flow
 9. affect-bridge.js            ← Emotion → session state bridge
10. emotion-ui.js               ← Emotion visualization widgets
11. timeline-ui.js              ← Timeline rendering
12. interview.js                ← Interview session management
13. app.js                      ← Core init, onboarding, chat UI
14. cognitive-auto.js           ← Cognitive state automation
15. mind-elixir.js              ← Vendor: mind map library
16. life-map.js                 ← Life Map visualization
17. bio-builder-core.js         ← Bio Builder shared foundation
18. projection-map.js           ← Field mapping definitions
19. projection-sync.js          ← Projection engine
20. bio-builder-questionnaire.js ← Questionnaire intake
21. bio-builder-sources.js      ← Source card management
22. bio-builder-candidates.js   ← Candidate review
23. bio-builder-family-tree.js  ← Family tree draft
24. bio-builder-life-threads.js ← Life threads draft
25. bio-builder.js              ← Bio Builder orchestrator
26. narrator-preload.js         ← Narrator data preloading
27. bio-review.js               ← Bio review phase
28. bio-promotion-adapters.js   ← Phase promotion adapters
29. bio-phase-f.js              ← Phase F processing
30. bio-phase-f-report.js       ← Phase F reporting
31. bio-phase-f-test-harness.js ← Phase F test harness
32. bio-control-center.js       ← Bio control center
```

---

## 4. State Management

### Frontend State (`state.js`)

A single global state object serves as the source of truth for all mutable UI state. Key namespaces:

| Namespace | Purpose |
|-----------|---------|
| `state.narratorUi` | Current narrator selection, panel state |
| `state.interview` | Active interview session, roadmap progress |
| `state.timeline` | Spine data (life periods, segments) |
| `state.session` | Session-level state including `visualSignals` from emotion pipeline |
| `state.interviewProjection` | Extracted facts pending projection |
| `state.bioBuilder` | Bio Builder panel state |
| `state.archive` | Archive entries |
| `state.facts` | Extracted fact registry |
| `state.profile` | Narrator profile (basics, kinship) |

### localStorage Keys (per narrator, keyed by `{pid}`)

| Key Pattern | Module | Content |
|-------------|--------|---------|
| `lorevox_offline_profile_{pid}` | app.js | Full narrator profile |
| `lorevox_proj_draft_{pid}` | projection-sync.js | Projected fields with source + confidence |
| `lorevox_qq_draft_{pid}` | bio-builder-questionnaire.js | Questionnaire draft data |
| `lorevox_ft_draft_{pid}` | bio-builder-family-tree.js | Family tree nodes and edges |
| `lorevox_lt_draft_{pid}` | bio-builder-life-threads.js | Life thread nodes and connections |
| `lorevox.spine.{pid}` | app.js / timeline-ui.js | Timeline spine with periods |
| `lorevox.done.{pid}` | interview.js | Completed interview sections |
| `lorevox.segs.{pid}` | interview.js | Interview segment data |
| `lorevox_device_onboarded` | app.js | Device-level onboarding flag |
| `lorevox_offline_people` | app.js | People index |
| `lorevox_draft_pids` | bio-builder-core.js | Active draft PID tracking |

### Narrator Scoping

All persistent state is keyed by `person_id`. When the user switches narrators, `_resetNarratorScopedState()` in `bio-builder-core.js` tears down the current state and `_onNarratorSwitch()` rehydrates from the new narrator's localStorage keys. This ensures complete isolation between narrator datasets.

---

## 5. Data Processing Pipelines

### 5.1 Identity Onboarding Pipeline

A state machine in `app.js` that gates first-time narrator creation:

```
askName → askDob → askBirthplace → complete
```

Each state transition validates input (including `_parseDob()` which handles 10+ date formats) and writes to `state.profile.basics`. On completion, a person record is created via `POST /api/people` and the profile is persisted to localStorage.

### 5.2 Bio Builder Pipeline (Phases D → E → F)

The Bio Builder follows a three-phase pipeline for promoting data from draft to structured storage:

**Phase D (Candidate Intake):** Raw data enters through the questionnaire, source inbox, or interview extraction. Data lives in localStorage drafts.

**Phase E (Review):** Candidates are surfaced for human review in the Bio Review panel. Users can accept, edit, or reject extracted facts.

**Phase F (Promotion):** Accepted data is promoted to structured fields in the narrator profile. `bio-phase-f.js` handles the promotion logic, `bio-promotion-adapters.js` maps between draft schemas and profile schemas.

### 5.3 Projection Sync Pipeline

The projection layer (`projection-sync.js`) manages the flow of AI-extracted data into human-editable fields:

```
Interview extraction → projectValue() → confidence gate → write mode check → localStorage proj_draft → _syncToBioBuilder()
```

Key rules enforced by this pipeline:

- **Human edit locking:** Once a user manually edits a field, `markHumanEdit()` sets `source: "human_edit"` and `confidence: 1.0`. The AI can never overwrite a locked field.
- **Confidence gating:** AI projections can only upgrade confidence, never downgrade. A field at confidence 0.9 cannot be overwritten by a projection at 0.8.
- **Write modes:** `prefill_if_blank` (fill only if empty), `candidate_only` (queue for review, don't auto-fill), `suggest_only` (show suggestion, require user action).

### 5.4 Emotional Intelligence Pipeline

```
Camera → MediaPipe face mesh (WASM) → emotion.js (classification) → affect-bridge.js (state mapping) → state.session.visualSignals
```

The `facial-consent.js` module manages camera permission. When enabled, `emotion.js` runs MediaPipe face mesh detection and classifies expressions into affect states. `affect-bridge.js` maps these to session-level signals that are included in the `runtime71` cognitive state payload sent with every chat turn.

### 5.5 runtime71 Cognitive State

Every chat message sent to the LLM includes a `runtime71` payload — a cognitive state snapshot containing:

- **pass:** Current interview pass/phase
- **era:** Life period being discussed
- **mode:** Conversation mode (interview, freeform, etc.)
- **affect:** Emotional state from the affect bridge
- **fatigue:** Estimated user fatigue level

This allows the LLM to adapt its tone, question depth, and topic sensitivity based on the narrator's current state.

### 5.6 Fact Extraction Pipeline

After every chat response from Lori, `_runDeferredInterviewExtraction()` in `app.js` processes the conversation:

```
Chat response → _extractFacts() → regex-based extraction → projectValue() → _syncToBioBuilder() → "Added to Story" badge
```

`_extractFacts()` (lines 2177-2259 in app.js) uses pattern matching to identify birthplace, DOB, marriage, employment, and other biographical facts from conversational text.

---

## 6. Backend Architecture

### FastAPI Application (`main.py`)

The API server mounts 18 route modules covering all backend operations. Key routers:

| Router | File | Purpose |
|--------|------|---------|
| Chat WebSocket | `chat_ws.py` (46KB) | Streaming chat with SSE, context management |
| Extraction | `extract.py` | Multi-field fact extraction engine |
| People | `people.py` | Person CRUD operations |
| Prompt Composer | `prompt_composer.py` (47KB) | System prompt assembly with runtime71 injection |

### LLM Configuration (`api.py`)

- Model: Llama 3.1-8B
- Quantization: 4-bit via bitsandbytes
- Inference: Local, no external API calls
- Context: Managed per-narrator with conversation history

### Database (`db.py` — 76KB)

SQLite with a comprehensive schema covering people, conversations, segments, extractions, relationships, and timeline data. All CRUD operations are defined in this single module.

---

## 7. Archive → History → Memoir Separation

Lorevox maintains a strict three-tier content hierarchy:

1. **Archive (Immutable Raw):** Original conversation transcripts and source documents. Never modified after creation.

2. **History (Structured Verified):** Extracted and human-verified facts, organized by life period and category. Can be edited by the user.

3. **Memoir (AI-Drafted Narrative):** AI-generated narrative prose assembled from History data. Regenerated as History is updated. Displayed in the "Peek at Memoir" popover using the parchment scroll UI.

---

## 8. Design Decisions and Trade-offs

### Strengths

1. **Local-first privacy:** All data stays on-device. No cloud dependency, no telemetry. SQLite + localStorage means the user owns their data completely.

2. **Human sovereignty over data:** The projection sync layer's locking and confidence gating ensures the AI can assist but never override human input. This is a thoughtful design for a memoir tool where accuracy of personal history is paramount.

3. **Narrator isolation:** Per-PID keying of all state means multiple narrators can coexist without data leakage.

4. **Emotional awareness:** The affect pipeline adds genuine value for an interview tool — adapting tone based on detected user state is well-suited to sensitive biographical conversations.

5. **No build system simplicity:** 32 script tags is unusual but means zero build tooling, zero transpilation, and trivial debugging with browser DevTools.

### Areas of Concern

1. **Monolithic JS files:** `app.js` at 141KB and `db.py` at 76KB are large single files. As features grow, these will become harder to maintain and debug.

2. **Closure-internal state:** The Bio Builder modules use closure-scoped variables (like `bb.questionnaire`) that aren't rehydrated from localStorage on panel reopen. This is the root cause of the critical Bug 1 identified in testing — the in-memory state diverges from persisted state after a panel close/reopen cycle.

3. **No automated testing:** The test harness (`bio-phase-f-test-harness.js`) exists for Phase F but there's no evidence of unit tests, integration tests, or CI/CD pipeline for the broader application.

4. **Single-threaded extraction:** The fact extraction pipeline runs synchronously after each chat response, which may contribute to the chat service dropping after the first response (Bug 6).

5. **Regex-based extraction:** `_extractFacts()` uses pattern matching rather than structured LLM extraction. This is fast but brittle for varied biographical phrasing.

6. **localStorage size limits:** With potentially large family trees, life threads, and questionnaire data all stored in localStorage (5-10MB browser limit), heavy users may hit storage limits.

---

## 9. Security Considerations

- No authentication layer — local-only tool assumes physical device access equals authorization
- No input sanitization visible in the chat pipeline — the LLM prompt composer should guard against injection
- SQLite has no encryption at rest — narrator data is readable by any process with filesystem access
- TTS service on a separate port (8001) has no visible auth — any local process could call it

These are reasonable trade-offs for a local-only desktop application, but would need addressing if Lorevox ever moves to a networked or multi-user model.

---

## 10. Deployment

The application runs as three co-located services on the user's machine. No containerization, no orchestration — the scripts folder likely contains start/stop utilities. The `config/` directory holds YAML configuration, and `schemas/` contains JSON schemas for data validation.

The entire stack (including the quantized LLM) runs on consumer hardware, which is consistent with the local-first philosophy. The 4-bit quantization of Llama 3.1-8B keeps memory requirements manageable while preserving reasonable generation quality for biographical interview tasks.
