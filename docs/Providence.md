# Lorevox 7.1 — Providence
## Master Checklist · March 2026

*This document is the single source of truth for what is done, what is in progress, and what comes next. Update it after every significant session.*

---

## System Status

**Architecture:** 95%+ complete
**UI shell:** 92% complete
**Runtime integration:** 82% complete
**Validation harness:** complete
**Model behavior:** pending Run 2

---

## ✅ DONE — Architecture & Design

- [x] v7.1 doctrine defined: Archive → History → Memoir
- [x] Lori as guide, not side panel — role defined
- [x] Timeline Spine as structural backbone — 6 life periods, age bands, era keys
- [x] Multi-pass interview model: Pass 1 (seed), Pass 2A (chronological walk), Pass 2B (narrative depth)
- [x] Affect support layer designed: MediaPipe, smoothed states, prompt/TTS shaping
- [x] Cognitive support layer designed: recognition mode, repetition detection, aging-safe signals
- [x] Session Vitals design: fatigue score, turn count, close recommendation
- [x] Session Engine design: pass routing, era advancement, mode selection

---

## ✅ DONE — Backend Python Runtime

- [x] `session_engine.py` — `SessionEngine` class with full prompt tables for 2A and 2B across all 6 eras
- [x] `session_vitals.py` — `SessionVitals` dataclass with `estimate_fatigue()` and `recommend_close()`
- [x] `prompt_composer.py` — `compose_system_prompt()` with `runtime71` parameter
- [x] `prompt_composer.py` — `LORI_RUNTIME:` block injected on every turn
- [x] `prompt_composer.py` — Pass-level directives: Pass 1, 2A, 2B with explicit DO/DO NOT language
- [x] `prompt_composer.py` — Mode modifiers: recognition, grounding, light — with DO/DO NOT language
- [x] `prompt_composer.py` — Cognitive support block with concrete anchor examples
- [x] `prompt_composer.py` — Fatigue signals: MODERATE (≥50) and HIGH (≥70) with behavioral constraints
- [x] `chat_ws.py` — Extracts `runtime71` from `params` on every `start_turn`
- [x] `chat_ws.py` — Forwards `runtime71` to `compose_system_prompt()` on every turn
- [x] `chat_ws.py` — Compact INFO log per turn: pass/era/mode/affect/fatigue/cog
- [x] `chat_ws.py` — Full system prompt log when `LV_DEV_MODE=1`

---

## ✅ DONE — Frontend JS State Layer

**`ui/js/state.js`**
- [x] `state.timeline` — `seedReady`, `spine`, `memories`
- [x] `state.session` — `currentPass`, `currentEra`, `currentMode`
- [x] `state.runtime` — `affectState`, `affectConfidence`, `cognitiveMode`, `fatigueScore`
- [x] localStorage spine persistence: `saveSpineLocal()` / `loadSpineLocal(pid)`
- [x] Getters: `getTimelineSeedReady()`, `getCurrentLifePeriods()`, `getCurrentPass()`, `getCurrentEra()`, `getCurrentMode()`
- [x] Setters: `setPass()`, `setEra()`, `setMode()`

**`ui/js/app.js`**
- [x] `initTimelineSpine()` — builds 6 life periods from DOB, persists to localStorage, advances to pass 2A
- [x] `update71RuntimeUI()` — paints all runtime pills on every state change
- [x] `loadPerson()` — restores spine and advances pass on person load
- [x] `updateArchiveReadiness()` — timeline-first checklist
- [x] Both `start_turn` WebSocket sends include full `runtime71` object
- [x] `console.log("[Lori 7.1] runtime71 → model: ...")` before every send
- [x] `CognitiveAuto.processUserTurn(text)` called before every send

**`ui/js/interview.js`**
- [x] `renderRoadmap()` — 7.1 clickable life-period items + legacy fallback
- [x] `updateContextTriggers()` — `ERA_PROMPTS` dict + legacy fallback
- [x] `build71InterviewPrompt()` → `_timelinePassPrompt()` / `_depthPassPrompt()`
- [x] `setInterviewMode()` — sets pass and calls `update71RuntimeUI()`

**`ui/js/timeline-ui.js`**
- [x] `renderTimeline()` — 7.1 path: Timeline Seed → Life Periods → World Context → Affect Arc
- [x] Active era highlighted; memories indexed under matching period band
- [x] Legacy path fully preserved

---

## ✅ DONE — UI Shell

**`ui/lori7.1.html`** — now acts as a true shell, not a monolithic page
- [x] Runtime status bar in top bar (pass/era/mode pills)
- [x] Life Periods sidebar with clickable period bands
- [x] Interview header with pass/era/mode labels
- [x] Lori panel state strip
- [x] Timeline seed badge + pass 2A availability badge
- [x] Inline debug overlay removed — HTML is clean
- [x] External scripts loaded: `js/debug-overlay.js`, `js/cognitive-auto.js`
- [x] Cognitive auto shim: `processUserTurn()` called before every send

---

## ✅ DONE — Runtime Support Layer (Externalized)

**`ui/js/debug-overlay.js`** — observability tool
- [x] `window.LORI71` namespace established
- [x] Live panel: pass (color-coded), era, mode, affect, confidence, cognitive mode, fatigue bar, seed status, period count, memory count
- [x] Cognitive auto-log: last 5 mode switches with timestamps and reasons
- [x] Hooks into `setPass`, `setEra`, `setMode` — updates immediately on state changes
- [x] Also refreshes on click/input events
- [x] Auto-refresh every 2 seconds while visible
- [x] Keyboard toggle: `Ctrl+Shift+D`
- [x] Draggable panel
- [x] `window.__loriDebug` alias for backward compat

**`ui/js/cognitive-auto.js`** — runtime cognitive intelligence
- [x] `window.LORI71.CognitiveAuto` object
- [x] `processUserTurn(text)` — reads user message + runtime state, returns mode + reason
- [x] `inferSignals(text)` — detects: uncertainty language, short reply, confusion affect, distress/dissociation affect, fatigue
- [x] `chooseMode(signals)` — distress → grounding; fatigue → light; confusion/uncertainty/short → recognition; else → open
- [x] `applyMode(mode, reason)` — writes to `state.runtime.cognitiveMode` and `state.session.currentMode`
- [x] Reason log stored in `state.runtime.cognitiveReasonLog` (last 10 entries)
- [x] Auto-refreshes debug overlay after mode switch
- [x] Runtime-only — never writes to archive or history records

---

## ✅ DONE — Validation Harness

**Pipeline tests (Run 1) — `server/code/` (inline Python, no GPU needed)**
- [x] 10/10 groups passing on prompt pipeline
- [x] Verified: correct `LORI_RUNTIME:` block for every pass/era/mode/fatigue combination
- [x] Verified: no regression across 7 sequential state transitions

**Model validation (Run 2) — `server/code/test_model.py`**
- [x] Loads real Llama 3.1 8B via `.env` (same config as live server)
- [x] Scoring system: 0–100 per test (required 40 + forbidden 20 + structural 30 + discipline 10)
- [x] Grade thresholds: A ≥90, B ≥70, C ≥50, F <50
- [x] Structural checks per group: choice-pattern detection, scene-vs-broad distinction, empathy-first check, pause-offer check, word count, question count
- [x] Global negative check: "do you remember a time" penalized across all groups
- [x] `--no-model` flag for pipeline-only verification without GPU
- [x] `--verbose` flag for full response inspection
- [x] `--group N` flag for single-group iteration
- [x] JSON result file: `test_model_results.json`
- [x] Exit code: 0 if overall ≥ 70, else 1 (CI-ready)
- [ ] **Run 2 not yet executed** — pending live session with Llama 3.1 8B

---

## 🔲 NEXT — Ordered by Impact

### 1. Run 2 — Real Model Validation
**Status:** Ready to execute. `test_model.py` is written and tested in `--no-model` mode.

```bash
# From server/code/ with lorevox venv active:
python test_model.py --verbose

# Single group to iterate fast:
python test_model.py --group 5 --verbose
```

Expected to pass easily: Groups 1, 2, 3.
Expected mixed: Groups 4A, 4B (pass/scene distinction).
Likely fail initially: Groups 5 (recognition), 6 (fatigue), 7b (grounding).

**If a group fails:** Adjust directive text in `prompt_composer.py` only. Do not touch UI, WebSocket, or state. Re-run the failing group. Repeat until all groups score ≥ 70.

---

### 2. Real Affect Engine Wiring
**Status:** Designed. MediaPipe exists in UI. `affect_engine.py` exists in backend. Not connected.

**What is needed:**
- Wire `affect_engine.py` into the live session loop
- Smooth raw MediaPipe observations into: neutral, moved, reflective, distressed, fatigue_hint, grounding
- Write smoothed state to `state.runtime.affectState` + `state.runtime.affectConfidence` on each observation cycle
- `cognitive-auto.js` then picks up the live state automatically (already reads `runtime.affectState`)
- Wire the same state to TTS pacing and pitch shaping

**Files:** `affect_engine.py`, `emotion.js`, `app.js` (observer loop), `tts.py`

---

### 3. Automatic Fatigue Score (SessionVitals in live loop)
**Status:** `SessionVitals` exists. Not yet called per turn.

**What is needed:**
- Initialize `SessionVitals` per session in `chat_ws.py`
- Call `vitals.register_user_turn(user_text)` on every turn
- Call `vitals.set_affect(state, confidence)` when affect arrives
- `vitals.estimate_fatigue()` then auto-populates fatigue score
- Return fatigue score to UI (via `done` message or session endpoint) → writes to `state.runtime.fatigueScore`

**Files:** `chat_ws.py`, `session_vitals.py`

---

### 4. Backend-Authoritative Pass Advancement (Session Engine Loop)
**Status:** Pass advancement is currently UI-only (`initTimelineSpine()` on the JS side).

**What is needed:**
- Use `SessionEngine.next_prompt()` in the backend to make pass advancement decisions
- Return a `session_advance` signal in the `done` WebSocket message: `{next_pass, next_era, next_mode, reason}`
- JS receives signal and calls `setPass()`, `setEra()`, `setMode()`, `update71RuntimeUI()` — backend drives, UI follows
- Pass 1 → 2A advancement becomes authoritative: model must confirm DOB + birthplace before advance

**Files:** `chat_ws.py`, `session_engine.py`, `app.js`

---

### 5. Scene Capture
**Status:** Not started. Memories save as flat text items.

**What is needed:**
- Redefine memory schema as a `Scene` object: `{scene_id, era, pass, place, people, sensory_detail, emotional_tone, source_turn_id}`
- "Save as Memory" in Pass 2B creates a scene candidate, not a flat note
- Scenes indexed under their matching life period band in the timeline
- `renderTimeline()` already has memory slots — feed scene objects in

**Files:** `data.js` (schema), `interview.js`, `timeline-ui.js`, DB schema

---

### 6. Memoir Alignment
**Status:** Memoir generation exists but is not spine-aware or scene-aware.

**What is needed:**
- Memoir composer walks the timeline spine period by period
- Pulls richest scenes from each period (Pass 2B output)
- Timeline structure becomes the chapter skeleton
- "Generate Memoir" gated on: timeline seed + at least one scene per visited period

**Files:** `memoir_composer.py`, `app.js` (generate action), scene data layer

---

### 7. Legacy Fallback Cleanup
**Status:** Intentionally deferred. Do not touch until 7.1 is stable in production.

**What is needed (later):**
- Remove stale section-first logic from `interview.js`
- Remove pre-7.1 roadmap rendering
- Simplify `renderTimeline()` — remove legacy branch once all sessions have a spine
- Consolidate `if (getTimelineSeedReady()) { ... } else { ... }` patterns

---

## Separation of Concerns — Current Architecture

| Layer | Files | Status |
|-------|-------|--------|
| HTML shell | `ui/lori7.1.html` | Clean — external scripts only |
| UI state | `ui/js/state.js` | Complete |
| UI behavior | `ui/js/app.js`, `interview.js`, `timeline-ui.js` | Complete |
| Observability | `ui/js/debug-overlay.js` | Complete |
| Runtime cognitive | `ui/js/cognitive-auto.js` | Complete |
| Prompt bridge | `server/code/api/prompt_composer.py` | Complete — directives strengthened |
| WebSocket router | `server/code/api/routers/chat_ws.py` | Complete |
| Session intelligence | `server/code/api/session_engine.py` | Exists — not yet in live loop |
| Session vitals | `server/code/api/session_vitals.py` | Exists — not yet in live loop |
| Validation | `server/code/test_model.py` | Complete — Run 2 pending |

---

## Debug Reference

| Tool | How to use |
|------|-----------|
| Runtime overlay | `Ctrl+Shift+D` in browser |
| Cognitive auto log | Visible in overlay when mode has switched |
| runtime71 per turn | Browser console: `[Lori 7.1] runtime71 → model: {...}` |
| Compact server log | Always on: `[chat_ws] turn: conv=... | pass=... era=...` |
| Full system prompt | Set `LV_DEV_MODE=1` in `.env`, restart server |
| Pipeline test | `python test_model.py --no-model` |
| Real model test | `python test_model.py --verbose` |
| Single group | `python test_model.py --group 5 --verbose` |

---

*Providence — March 17, 2026*
*Next update: after Run 2 results*
