# Lorevox v7.1 — March 2026 Status & Roadmap

*Last updated: March 17, 2026*

---

## Current Status

**Architecture: 95%+ complete**
**UI shell: 90%+ complete**
**Runtime integration: 80%+ complete**

The central bridge is now in place. As of today, Lorevox 7.1 is no longer just UI-aware of the runtime state — the model itself is now timeline-aware, pass-aware, and mode-aware on every turn. That is the system milestone. What remains is behavior refinement and downstream integration, not core architecture.

---

## What Is Fully Done

### Architecture & Design
- v7.1 doctrine: Archive → History → Memoir; Lori as guide not side panel; Timeline Spine as structural backbone
- Multi-pass interview model fully specified (Pass 1 / 2A / 2B)
- Six life periods defined with age bands and era keys
- Affect support layer designed (MediaPipe, smoothed states, prompt/TTS shaping)
- Cognitive support layer designed (recognition mode, repetition detection, aging-safe signals)
- Session Vitals / Session Engine designed and instantiated

### Backend — Python Runtime
- `session_engine.py` — `SessionEngine` class: `initialize_from_seed()`, `choose_mode()`, `next_prompt()`, `advance_era()`, `start_depth_pass()`. Full prompt tables for 2A and 2B across all 6 eras with mode modifiers.
- `session_vitals.py` — `SessionVitals` dataclass: tracks turn count, response lengths, affect state, fatigue score (0–100). `estimate_fatigue()`, `recommend_close()` (triggers at ≥70).

### Frontend — JS State Layer (`ui/js/state.js`)
- `state.timeline` — `seedReady`, `spine`, `memories`
- `state.session` — `currentPass`, `currentEra`, `currentMode`
- `state.runtime` — `affectState`, `affectConfidence`, `cognitiveMode`, `fatigueScore`
- localStorage spine persistence: `saveSpineLocal()` / `loadSpineLocal(pid)`
- Getters: `getTimelineSeedReady()`, `getCurrentLifePeriods()`, `getCurrentPass()`, `getCurrentEra()`, `getCurrentMode()`
- Setters: `setPass()`, `setEra()`, `setMode()`

### Frontend — App Logic (`ui/js/app.js`)
- `initTimelineSpine()` — builds 6 life periods from DOB, persists to localStorage, advances to pass 2A
- `update71RuntimeUI()` — paints all runtime pills (topbar, interview header, Lori panel) on every state change
- `loadPerson()` — restores spine from localStorage, advances pass if spine exists
- `updateArchiveReadiness()` — timeline-first checklist (DOB, birthplace, seed ready, pass 2A available)
- Both `start_turn` WebSocket sends now include `runtime71` object on every turn

### Frontend — Interview (`ui/js/interview.js`)
- `renderRoadmap()` — 7.1 path: clickable life-period items with year ranges; legacy fallback preserved
- `updateContextTriggers()` — 7.1 path: `ERA_PROMPTS` dict with 3 prompts per era + mode hints; legacy fallback
- `build71InterviewPrompt()` → `_timelinePassPrompt()` (2A) / `_depthPassPrompt()` (2B)
- `setInterviewMode()` — sets pass (2A / 2B) and calls `update71RuntimeUI()`

### Frontend — Timeline (`ui/js/timeline-ui.js`)
- `renderTimeline()` — 7.1 fast-path: Timeline Seed → Life Periods (primary story) → World Context (optional overlay) → Affect Arc; active era highlighted; saved memories indented under matching period band
- Legacy path fully preserved

### UI Shell (`ui/lori7.1.html`)
- Runtime status bar in top bar (pass/era/mode pills)
- Life Periods sidebar with clickable period bands
- Interview header with pass/era/mode labels
- Lori panel state strip
- Timeline seed badge + pass 2A availability badge

### The Prompt Bridge — COMPLETED March 17, 2026
This is the milestone that connects the two halves of the system.

**`ui/js/app.js`** — Both `start_turn` WebSocket sends now include `runtime71`:
```javascript
{ current_pass, current_era, current_mode, affect_state,
  affect_confidence, cognitive_mode, fatigue_score }
```

**`server/code/api/routers/chat_ws.py`** — Extracts `runtime71` from `params` and forwards to `compose_system_prompt` on every turn.

**`server/code/api/prompt_composer.py`** — New `runtime71` parameter injects a `LORI_RUNTIME:` directive block into every system prompt:
- Pass-level directive (what Lori should be doing right now)
- Era label (plain English, e.g. "School Years")
- Mode modifier (recognition / grounding / light / open)
- Cognitive support block when `cognitive_mode = "recognition"`
- Fatigue warnings at ≥50 (moderate) and ≥70 (high)
- Fully backward-compatible — SSE path and older UI are unaffected

**What this means:** The model now knows it is in Pass 2A walking someone through their School Years, or in Pass 2B deepening a Midlife memory, or in grounding mode with a distressed narrator. It did not know any of this before.

---

## Next Integration Targets

These are ranked by impact. The core architecture is done; these are behavior refinement and downstream integration.

---

### Target 1 — Real Affect Runtime Integration

**Status:** Wired in structure, not yet live.

`affect_state` and `affect_confidence` already flow through `runtime71` to the model. But the source is still `state.runtime.affectState` set manually or via test. The MediaPipe pipeline exists in the UI but its output is not yet writing to `state.runtime`.

**What is needed:**
- Wire `affect_engine.py` into the live session loop
- Smooth raw observations into stable affect states (`neutral`, `moved`, `reflective`, `distressed`, `fatigue_hint`, `grounding`)
- Write smoothed state to `state.runtime.affectState` + `state.runtime.affectConfidence` on each observation cycle
- Wire the same state to TTS pacing and pitch shaping (already designed; not yet connected)

**Files involved:** `affect_engine.py`, `emotion.js`, `app.js` (observer loop), `tts.py` or `tts_stub.py`

---

### Target 2 — Automatic Cognitive Mode Switching

**Status:** Wired in structure, not yet automatic.

Setting `state.runtime.cognitiveMode = "recognition"` manually works end-to-end. The model responds correctly. The switch just isn't automatic yet.

**What is needed:**
- Detect confusion / repeated uncertainty signals in the conversation turn stream
- Detect fatigue-driven response length drop below a threshold
- Detect aging-safe signals from the profile (narrator age, response patterns)
- Auto-write `state.runtime.cognitiveMode = "recognition"` when signals accumulate
- Clear back to `null` when signals normalize

**Files involved:** `interview.js` (turn observer), `session_vitals.py` (signal thresholds), `app.js` (mode setter)

---

### Target 3 — Scene Capture

**Status:** Not started. Memories save as flat text items.

The interview is now pass-aware and era-aware, but "Save as Memory" still creates a flat, unstructured memory object. Scenes are the foundation that Pass 2B is designed to produce, and that Memoir generation is supposed to consume.

**What is needed:**
- Redefine the memory schema as a `Scene` object:
  - `scene_id`, `era`, `timestamp`, `pass` (2A or 2B)
  - `place` — specific location name
  - `people` — list of names mentioned
  - `sensory_detail` — extracted or typed description
  - `emotional_tone` — inferred from affect or manually tagged
  - `source_turn_id` — links back to the interview turn
- "Save as Memory" in Pass 2B should create a scene candidate, not a flat note
- Scenes should be indexed under their matching life period band in the timeline
- Timeline `renderTimeline()` already has indented memory slots — feed scene objects in

**Files involved:** `interview.js`, `data.js` (schema), `timeline-ui.js`, DB schema (new `scenes` table or extend existing memories table)

---

### Target 4 — Memoir Alignment

**Status:** Memoir generation exists but is not yet spine-aware or scene-aware.

**What is needed:**
- Memoir composer should walk the timeline spine period by period
- Pull the richest scenes from each life period (Pass 2B output)
- Use the timeline structure as the chapter skeleton
- Draft text that transitions between periods using the narrator's own words from scenes
- "Generate Memoir" should be gated on having at minimum a timeline seed + at least one scene per period the narrator has visited

**Files involved:** `memoir_composer.py` (or equivalent), `app.js` (generate action), timeline/scene data layer

---

### Target 5 — Legacy Fallback Cleanup

**Status:** Deferred intentionally. Do not touch until 7.1 is fully stable in production.

The v6.x fallback paths are correct and safe. Once 7.1 behavior is validated across the test personas, the cleanup pass should:
- Remove stale section-first logic from `interview.js`
- Remove or archive pre-7.1 roadmap rendering
- Simplify `renderTimeline()` — remove the legacy branch once no sessions lack a spine
- Consolidate the hybrid `if (getTimelineSeedReady()) { ... } else { ... }` patterns throughout

---

## Test Plan — Ready to Run Now

These test the completed bridge end-to-end.

1. **New person, no DOB/birthplace** — send any message. Model should stay in pass1 / Timeline Seed. Lori asks only for DOB and birthplace.

2. **Save DOB + birthplace** — spine initializes, pass advances to `pass2a`, era = `early_childhood`. Send a message. Model directive says "Pass 2A / Early Childhood / place-anchored." Lori asks about early life.

3. **Click a different era** (e.g. School Years in roadmap) — send a message. Directive updates to "School Years." Lori shifts her question.

4. **Switch to Thematic / Pass 2B** — send a message. Directive says "Pass 2B — Narrative Depth." Lori asks for a specific memory, not a timeline walk.

5. **Force recognition mode** — `state.runtime.cognitiveMode = "recognition"` in console, send a message. Model offers 2–3 concrete anchors.

6. **Force high fatigue** — `state.runtime.fatigueScore = 80` in console, send a message. Model shortens response and offers to pause.

7. **Grounding mode** — `state.session.currentMode = "grounding"` in console, send a message. Model keeps it minimal and safe.

---

## Guiding Principle

Lori 7.1 is not about more UI. It is about making the system think and adapt.

The central bridge is now in place. The model is no longer generic. The remaining work is making the inputs to that bridge real (live affect, automatic cognitive switching), making the outputs of the interview structured (scenes), and making the end product coherent (memoir from spine + scenes).

No new features until Targets 1 and 2 are solid.
