# Lorevox 8.0 — File Map for the 6 Data Collection Points

**Date:** 2026-04-02
**Entry Point:** `ui/lori8.0.html`

This document maps every file (JS, CSS, backend route, vendor library) involved in each of the six data collection pipelines that feed into the Lorevox narrator profile.

---

## 1. Identity Onboarding

The first-touch narrator creation flow. A state machine gates progression through name, date of birth, and birthplace before the narrator record is created.

### Frontend Files

| File | Role |
|------|------|
| `ui/js/state.js` | Holds `state.profile.basics` where onboarding data lands |
| `ui/js/app.js` | `startIdentityOnboarding()` (~line 1488), `_parseDob()` (~line 1544), state machine logic (askName → askDob → askBirthplace → complete) |
| `ui/js/api.js` | HTTP client for `POST /api/people` and `PATCH /api/people/{pid}` |

### CSS Files

| File | Role |
|------|------|
| `ui/css/lori80.css` | Chat UI styling where onboarding prompts render |
| `ui/css/layout.css` | Panel and container layout |

### Backend Routes

| Route | File | Purpose |
|-------|------|---------|
| `POST /api/people` | `routers/people.py` | Creates narrator record |
| `PATCH /api/people/{pid}` | `routers/people.py` | Updates profile after each onboarding step |

### localStorage Keys

| Key | Content |
|-----|---------|
| `lorevox_device_onboarded` | Device-level flag (not per-narrator) |
| `lorevox_offline_profile_{pid}` | Full profile with basics (name, DOB, birthplace) |
| `lorevox_offline_people` | People index updated with new narrator |
| `lorevox_draft_pids` | PID tracking updated |

---

## 2. Bio Builder Questionnaire

Structured intake across 9 sections: Personal Info, Parents, Grandparents, Siblings, Early Memories, Education & Career, Later Years, Hobbies & Interests, Additional Notes. Supports repeatable sections (Parents, Siblings, Grandparents) with "Add another" workflow.

### Frontend Files

| File | Role |
|------|------|
| `ui/js/state.js` | `state.bioBuilder` namespace |
| `ui/js/bio-builder-core.js` | Shared foundation: `_persistDrafts()`, `_loadDrafts()`, `_clearDrafts()`, `_resetNarratorScopedState()`, narrator scoping utilities |
| `ui/js/bio-builder-questionnaire.js` | Section definitions (lines 86-193), `_renderSectionDetail()`, `_saveSection()`, `_addRepeatEntry()`, `_sectionFillCount()`, `_hydrateQuestionnaireFromProfile()`, normalization helpers (DOB, time-of-birth, place, zodiac) |
| `ui/js/bio-builder.js` | Orchestrator: coordinates questionnaire with other Bio Builder sub-modules, exposes `window.LorevoxBioBuilder` |
| `ui/js/projection-sync.js` | `projectValue()`, write mode enforcement, confidence gating, `markHumanEdit()` |
| `ui/js/projection-map.js` | Field mapping definitions between projection keys and questionnaire fields |

### CSS Files

| File | Role |
|------|------|
| `ui/css/bio-builder.css` | Bio Builder panel, section cards, badges |
| `ui/css/bio-questionnaire.css` | Questionnaire form fields, section detail view |
| `ui/css/layout.css` | Panel positioning and popover layout |

### Backend Routes

None directly — questionnaire is entirely client-side with localStorage persistence. Data reaches the backend only when promoted through Phase F or when the projection sync layer writes to the profile.

### localStorage Keys

| Key | Content |
|-----|---------|
| `lorevox_qq_draft_{pid}` | Full questionnaire draft: `{ personal: {...}, parents: [{...}], siblings: [{...}], ... }` |
| `lorevox_proj_draft_{pid}` | Projected fields with source attribution and confidence scores |

---

## 3. Bio Builder Source Inbox

File upload, paste text, and drag-and-drop intake for external source documents (photos, letters, documents). Sources go through extraction and review before facts are promoted.

### Frontend Files

| File | Role |
|------|------|
| `ui/js/state.js` | Source state namespace |
| `ui/js/bio-builder-core.js` | Shared persistence and narrator scoping |
| `ui/js/bio-builder-sources.js` | Source card creation, file upload handling, paste text, drag-and-drop, source card schema (status: pending → extracted → pasted → reviewed) |
| `ui/js/bio-builder-candidates.js` | Candidate review for extracted facts from sources |
| `ui/js/bio-builder.js` | Orchestrator coordination |

### CSS Files

| File | Role |
|------|------|
| `ui/css/bio-builder.css` | Source card styling |
| `ui/css/bio-sources.css` | Upload zone, source list, extraction status indicators |

### Backend Routes

| Route | File | Purpose |
|-------|------|---------|
| Extraction endpoints | `routers/extract.py` | Multi-field extraction from uploaded source content |

### localStorage Keys

| Key | Content |
|-----|---------|
| `lorevox_sources_draft_{pid}` | Source cards with metadata and extraction status |

---

## 4. Life Story Interview

Conversational AI interview with Lori. Messages are sent via WebSocket, responses stream back via SSE. After each response, the fact extraction pipeline runs to pull biographical data from the conversation. Includes emotional intelligence (camera-based affect detection) and cognitive state tracking.

### Frontend Files

| File | Role |
|------|------|
| `ui/js/state.js` | `state.interview`, `state.session`, `state.interviewProjection`, `state.facts` |
| `ui/js/app.js` | `sendUserMessage()`, `streamSse()`, `_runDeferredInterviewExtraction()`, `_extractFacts()` (lines 2177-2259, regex-based extraction for birthplace, DOB, marriage, employment, etc.) |
| `ui/js/interview.js` | Interview session management, roadmap rendering, 37 interview sections, section logic, memory triggers |
| `ui/js/api.js` | WebSocket and HTTP client for chat endpoints |
| `ui/js/emotion.js` | MediaPipe face mesh detection, expression classification |
| `ui/js/facial-consent.js` | Camera permission consent flow |
| `ui/js/affect-bridge.js` | Maps emotion classifications to `state.session.visualSignals` |
| `ui/js/emotion-ui.js` | Emotion state visualization widgets |
| `ui/js/cognitive-auto.js` | Cognitive state automation, runtime71 payload assembly |
| `ui/js/projection-sync.js` | Routes extracted facts through confidence gating to questionnaire/profile |
| `ui/js/projection-map.js` | Field mapping for extraction targets |
| `ui/js/timeline-ui.js` | Timeline rendering for interview progress |

### Vendor Libraries

| File | Role |
|------|------|
| `ui/vendor/face_mesh/` | MediaPipe WASM binaries for facial landmark detection |

### CSS Files

| File | Role |
|------|------|
| `ui/css/lori80.css` | Chat bubbles, message styling, "Added to Story" badge |
| `ui/css/affect.css` | Emotion visualization overlays |
| `ui/css/layout.css` | Chat panel layout |

### Backend Routes

| Route | File | Purpose |
|-------|------|---------|
| WebSocket `/chat/ws` | `routers/chat_ws.py` (46KB) | Streaming chat with context management |
| `POST /api/chat` | `api.py` | Fallback non-streaming chat endpoint |
| `/interview/*` | `routers/interview.py` | Interview session management |
| Extraction | `routers/extract.py` | Server-side fact extraction |

### Backend Core

| File | Role |
|------|------|
| `api.py` | LLM loading (Llama 3.1-8B, 4-bit quantized) |
| `prompt_composer.py` (47KB) | System prompt assembly with runtime71 cognitive state injection |
| `db.py` (76KB) | Conversation and segment storage |

### localStorage Keys

| Key | Content |
|-----|---------|
| `lorevox_proj_draft_{pid}` | Projected fields from extraction, with source + confidence |
| `lorevox.spine.{pid}` | Timeline spine with life periods (populated from interview) |
| `lorevox.done.{pid}` | Completed interview sections |
| `lorevox.segs.{pid}` | Interview segment data |

---

## 5. Family Tree

Visual family tree builder with card, graph, and scaffold view modes. Can be seeded automatically from questionnaire data or built manually. Supports 10 role types and 7 relationship types.

### Frontend Files

| File | Role |
|------|------|
| `ui/js/state.js` | Family tree state namespace |
| `ui/js/bio-builder-core.js` | Shared persistence (`_persistDrafts`), narrator scoping |
| `ui/js/bio-builder-family-tree.js` (59KB) | `_ftSeedFromQuestionnaire()` (line 448-553), `_ftSeedFromProfile()` (line 555-639+), node/edge CRUD, view mode switching (cards/graph/scaffold) |
| `ui/js/bio-builder.js` | Orchestrator coordination |

### Roles and Relationship Types

**Roles:** narrator, parent, sibling, spouse, child, grandparent, grandchild, guardian, chosen_family, other

**Relationship types:** biological, adoptive, step, marriage, partnership, and more

### Vendor Libraries

| File | Role |
|------|------|
| `ui/vendor/mind-elixir/` | Mind map library (used in graph view mode) |

### CSS Files

| File | Role |
|------|------|
| `ui/css/bio-builder.css` | Family tree panel |
| `ui/css/bio-family-tree.css` | Node cards, edge rendering, view mode layouts |

### Backend Routes

None directly — Family Tree is entirely client-side. Data reaches the backend through Phase F promotion.

### localStorage Keys

| Key | Content |
|-----|---------|
| `lorevox_ft_draft_{pid}` | Nodes array (each with id, name, role, metadata) and edges array (each with source, target, relationship type) |

---

## 6. Life Threads

Thematic thread mapping that connects memories, people, places, events, and themes into a web of relationships with strength scores. Provides a non-linear view of the narrator's life story.

### Frontend Files

| File | Role |
|------|------|
| `ui/js/state.js` | Life threads state namespace |
| `ui/js/bio-builder-core.js` | Shared persistence, narrator scoping |
| `ui/js/bio-builder-life-threads.js` (32KB) | Thread node CRUD (types: memory, person, place, event, theme), connection management with strength scores |
| `ui/js/bio-builder.js` | Orchestrator coordination |
| `ui/js/life-map.js` (30KB) | Mind Elixir read-only mind map visualization, reads from `state.timeline.spine.periods`, click-to-navigate via `setEra()` |

### Vendor Libraries

| File | Role |
|------|------|
| `ui/vendor/mind-elixir/` | Mind map rendering engine |

### CSS Files

| File | Role |
|------|------|
| `ui/css/bio-builder.css` | Life threads panel |
| `ui/css/bio-life-threads.css` | Thread node styling, connection visualization |

### Backend Routes

None directly — Life Threads is entirely client-side.

### localStorage Keys

| Key | Content |
|-----|---------|
| `lorevox_lt_draft_{pid}` | Thread nodes and connections with strength scores |

---

## Cross-Cutting Files

These files are involved in all or most data collection points:

| File | Role | Used By |
|------|------|---------|
| `ui/js/state.js` | Global state singleton | All 6 points |
| `ui/js/bio-builder-core.js` | Persistence, narrator scoping | Points 2-6 |
| `ui/js/bio-builder.js` | Module orchestration | Points 2-6 |
| `ui/js/projection-sync.js` | Data projection with locking | Points 2, 4 |
| `ui/js/projection-map.js` | Field mapping definitions | Points 2, 4 |
| `ui/js/app.js` | Core app, chat, extraction | Points 1, 4 |
| `ui/js/narrator-preload.js` | Narrator data preloading | All on narrator switch |
| `ui/css/layout.css` | Structural layout | All 6 points |
| `ui/css/base.css` | Design tokens | All 6 points |
| `server/code/api/db.py` | SQLite CRUD | Points 1, 4 |

---

## Cleanup on Narrator Delete

`lvxDeleteNarratorConfirmed()` in `app.js` (lines 662-707) clears these keys:

**Currently cleaned:** `offline_profile`, `proj_draft`, `qq_draft`, `spine`, `done`, `segs`

**Missing cleanup (Bug 7):** `ft_draft`, `lt_draft`
