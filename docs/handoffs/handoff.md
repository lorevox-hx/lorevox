# Lorevox 7.1 — Providence
## Project Handoff Control File · March 2026

*This document is the master handoff, continuity, and execution file for Lorevox 7.1. It is designed so that if the current lead is unavailable, another engineer or architect can continue the project without guessing at intent, architecture, priorities, or sequence.*

---

## Purpose of This File

`Providence.md` is not just a checklist. It is the control document for:

- current system status
- governing doctrine
- work completed
- work in progress
- blocked items
- execution order
- project risks
- testing doctrine
- Claude Code readiness
- handoff guidance for the next engineer

If there is a conflict between casual notes and this file, this file wins until it is intentionally updated.

---

## System Status

**Architecture:** 95%+ complete  
**UI shell:** 92% complete  
**Runtime integration:** 84% complete  
**Validation harness:** complete  
**Model behavior:** pending Run 2  
**Agent loop wiring:** partial — timeline/affect/safety connected, direct memory/RAG adapter pending  
**Pre-Claude testing:** conceptually defined, not yet formalized into repo docs  
**Handoff readiness:** moderate — architecture is clear, but testing docs and dependency flow still need formal completion

---

## Source of Truth

The following rules and documents define Lorevox 7.1:

- `Providence.md` is the master project control and handoff file
- Lorevox doctrine is:
  - **Archive** = immutable source material
  - **History** = derived, reviewable, auditable interpretation
  - **Memoir** = generated narrative draft
- Live runtime Python integration belongs in `server/code/api/`
- Testing must precede Claude Code planning
- Simulation findings and live runtime findings must be kept distinct
- Claude Code is an implementation/research partner, not product truth
- Timeline anchors are first-class system inputs, not minor profile fields
- Storage paths and schema behavior must not change silently

If a new engineer joins, they should read this file first, then read the architecture/testing docs it references.

---

## Governing Doctrine

Lorevox is not a generic chatbot. It is a **timeline reconstruction, archive, and memoir system** designed to gather imperfect human memory and preserve source truth while enabling structured interpretation and narrative generation.

The three layers must never be collapsed into one another:

### Archive
Immutable source material.

Examples:
- raw transcripts
- audio
- images
- scans
- original session metadata tied to capture context

### History
Derived, structured, auditable interpretation.

Examples:
- extracted events
- entities
- relationships
- dates
- timeline entries
- scene candidates
- confidence/provenance markers

### Memoir
Generated narrative output.

Examples:
- memoir chapters
- obituary drafts
- life summaries
- family sketches
- scene-based narratives

### Non-Negotiable Rules
- Archive must remain immutable source
- Derived history must remain reviewable and auditable
- Memoir output must be clearly labeled as generated narrative
- No generated prose may silently become historical truth
- No support-person speech may silently become subject truth
- No schema or path migration may happen without notes and tests

---

## Operating Assumptions

These assumptions currently define how work should proceed:

- Lorevox is **local-first**
- Privacy is a first-class constraint
- Deterministic storage and reproducible behavior matter more than flashy AI behavior
- The interview system is really a memory/timeline system
- DOB, birthplace, and raised-in are foundational anchors
- Support-person mode is a core real-world use case, not an edge case
- Cognitive accessibility is a required product capability
- Timeline coherence matters as much as conversational quality
- Testing must validate archive truth preservation, not just prompt quality

---

## Blocked By / Dependencies

This section exists so a new engineer can understand execution order without inferring it.

### Claude Code Planning Depends On
`claude_code_plan.md` must not be finalized until these exist:

- `TEST_STRATEGY.md`
- `PERSONA_SIMULATION_PROTOCOL.md`
- `LIVE_RUNTIME_TEST_CHECKLIST.md`
- `TEST_BASELINE_REPORT.md`

Claude Code planning must be based on verified findings, not theory alone.

### Agent Loop Live Retrieval Wiring Depends On
- identifying the real Lorevox memory/RAG retrieval module
- confirming where retrieval actually lives in the repo
- replacing temporary empty direct retrieval fallback in `skills.py`

### Backend-Authoritative Pass Advancement Depends On
- live session engine integration in `chat_ws.py`
- stable pass/era/mode authority flow from backend to UI
- confirmed handling of DOB + birthplace before pass advancement

### Memoir Alignment Depends On
- stable timeline spine
- scene capture implementation
- scene schema stability
- clear archive/history separation

### Scene Capture Depends On
- stable memory schema direction
- confirmation that scene objects are the preferred unit for Pass 2B capture
- timeline indexing support

### Claude Code Refactor Work Depends On
- stable baseline report from real runtime
- distinction between simulation findings and runtime-confirmed findings
- ranked priorities by risk and subsystem

---

## Current Risks

These are the highest current project risks.

### 1. Retrieval Wiring Risk
The real Lorevox retrieval/RAG module has not yet been identified for agent-loop integration. Current `skills.py` timeline/affect/safety wiring is real, but direct retrieval remains unresolved.

### 2. Support-Person Truth Corruption Risk
Support-person and mixed-speaker sessions remain one of the highest truth-integrity risks. If not handled correctly, transcripts and memoir generation can misattribute one person’s speech to another.

### 3. Unvalidated Real Model Behavior
Run 2 has not yet been executed against the real Llama 3.1 8B runtime. Prompt behavior is pipeline-validated, but not yet fully runtime-confirmed.

### 4. Unformalized Pre-Claude Testing
Testing philosophy has been clarified, but the actual repo-ready testing package has not yet been written and used.

### 5. Affect Engine Not Yet Live
Affect support is designed and partially represented in UI/runtime state, but backend affect integration is not yet in the live loop.

### 6. Cognitive Accessibility Still Partially Theoretical
The design intent is increasingly clear, but live testing and implementation still need to confirm whether Lorevox actually adapts well for memory loss, fatigue, confusion, and self-critical distress.

### 7. Flat Memory Model Risk
Scene capture is not yet implemented. Until it is, memory storage remains flatter than desired, which may make memoir alignment and timeline richness weaker than intended.

---

## Handoff Notes

If another engineer or architect takes over, this is the required starting sequence:

1. Read `Providence.md` fully before touching code.
2. Do not start with Claude Code planning.
3. Confirm the repo structure and live runtime paths.
4. Execute Run 2 model validation.
5. Formalize the pre-Claude testing docs.
6. Run targeted live tests on high-risk issues.
7. Only then finalize Claude Code planning and refactor work.

### What Not To Do
- Do not collapse Archive, History, and Memoir into one storage or logic layer.
- Do not assume single-speaker input.
- Do not silently change storage paths.
- Do not silently reinterpret old data.
- Do not refactor broadly before testing baseline is written.
- Do not let agent-loop candidate writes become truth without review path.

### What Is Safe To Do Now
- formalize testing documents
- run model validation
- trace retrieval module location
- patch `hooks.py` and `reflection.py` for timeline-aware agent loop behavior
- inspect actual live persistence behavior
- improve documentation and execution clarity

### What Is Not Safe To Do Yet
- broad memoir-generation rewrites
- collapsing legacy branches before 7.1 stabilizes
- deep refactors of storage semantics without migration plan
- heavy Claude Code planning without baseline report

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
- [x] OpenClaw-pattern adaptation defined for Lorevox: hooks, skills, policies, reflection
- [x] Agent behavior doctrine aligned to Lorevox’s archive-first and local-first philosophy
- [x] Testing direction clarified: Lorevox must be validated as a memory/timeline system, not just a conversational shell
- [x] Claude Code role clarified: implementation/research partner, not system truth

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
- [x] `agent_loop.py` — initial agent loop scaffold added
- [x] `hooks.py` — pre/post LLM hook structure added
- [x] `policies.py` — initial heuristics for biography, kinship, dates, uncertainty, emotion, and retrieval decisions
- [x] `reflection.py` — conservative post-turn reflection with candidate write planning
- [x] `skills.py` — wired to real Lorevox timeline endpoints
- [x] `skills.py` — wired to real Lorevox affect-context endpoint
- [x] `skills.py` — derives real safety context from segment flags
- [x] `skills.py` — confirmed placement belongs in `server/code/api/`
- [ ] `skills.py` — direct memory/RAG adapter still pending correct Lorevox retrieval module
- [ ] `hooks.py` — still needs timeline context added to `before_llm()`
- [ ] `hooks.py` — still needs year/date-driven timeline tool routing in `after_llm()`
- [ ] `reflection.py` — should prefer timeline suggestion candidates when date/time cues are present
- [ ] agent loop still not connected to live retrieval/history write path

---

## ✅ DONE — Frontend JS State Layer

### `ui/js/state.js`
- [x] `state.timeline` — `seedReady`, `spine`, `memories`
- [x] `state.session` — `currentPass`, `currentEra`, `currentMode`
- [x] `state.runtime` — `affectState`, `affectConfidence`, `cognitiveMode`, `fatigueScore`
- [x] localStorage spine persistence: `saveSpineLocal()` / `loadSpineLocal(pid)`
- [x] Getters: `getTimelineSeedReady()`, `getCurrentLifePeriods()`, `getCurrentPass()`, `getCurrentEra()`, `getCurrentMode()`
- [x] Setters: `setPass()`, `setEra()`, `setMode()`

### `ui/js/app.js`
- [x] `initTimelineSpine()` — builds 6 life periods from DOB, persists to localStorage, advances to pass 2A
- [x] `update71RuntimeUI()` — paints all runtime pills on every state change
- [x] `loadPerson()` — restores spine and advances pass on person load
- [x] `updateArchiveReadiness()` — timeline-first checklist
- [x] Both `start_turn` WebSocket sends include full `runtime71` object
- [x] `console.log("[Lori 7.1] runtime71 → model: ...")` before every send
- [x] `CognitiveAuto.processUserTurn(text)` called before every send

### `ui/js/interview.js`
- [x] `renderRoadmap()` — 7.1 clickable life-period items + legacy fallback
- [x] `updateContextTriggers()` — `ERA_PROMPTS` dict + legacy fallback
- [x] `build71InterviewPrompt()` → `_timelinePassPrompt()` / `_depthPassPrompt()`
- [x] `setInterviewMode()` — sets pass and calls `update71RuntimeUI()`

### `ui/js/timeline-ui.js`
- [x] `renderTimeline()` — 7.1 path: Timeline Seed → Life Periods → World Context → Affect Arc
- [x] Active era highlighted; memories indexed under matching period band
- [x] Legacy path fully preserved

---

## ✅ DONE — UI Shell

### `ui/lori7.1.html`
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

### `ui/js/debug-overlay.js`
- [x] `window.LORI71` namespace established
- [x] Live panel: pass (color-coded), era, mode, affect, confidence, cognitive mode, fatigue bar, seed status, period count, memory count
- [x] Cognitive auto-log: last 5 mode switches with timestamps and reasons
- [x] Hooks into `setPass`, `setEra`, `setMode` — updates immediately on state changes
- [x] Also refreshes on click/input events
- [x] Auto-refresh every 2 seconds while visible
- [x] Keyboard toggle: `Ctrl+Shift+D`
- [x] Draggable panel
- [x] `window.__loriDebug` alias for backward compat

### `ui/js/cognitive-auto.js`
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

### Pipeline tests (Run 1) — `server/code/`
- [x] 10/10 groups passing on prompt pipeline
- [x] Verified: correct `LORI_RUNTIME:` block for every pass/era/mode/fatigue combination
- [x] Verified: no regression across 7 sequential state transitions

### Model validation (Run 2) — `server/code/test_model.py`
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

## ✅ DONE — Testing Direction / Pre-Claude Workflow

- [x] Decided that testing comes before Claude Code planning
- [x] Decided that Lorevox needs a three-layer test model:
  - simulation/persona layer
  - live runtime/persistence layer
  - architecture-boundary layer
- [x] Clarified that DOB and birthplace are timeline anchors
- [x] Clarified that every serious persona test must begin with:
  - full legal name
  - date of birth
  - preferred name
  - place of birth
  - raised in / moved-young distinction
- [x] Clarified that persona testing should be timeline-aware, not just profile-field-aware
- [x] Clarified that support-person/couple mode must be treated as a core test scenario
- [x] Clarified that simulation findings and runtime findings must be kept distinct
- [x] Clarified that Claude Code should work from verified reports, not speculative intent

---

## 🔲 NEXT — Ordered by Impact

### 1. Run 2 — Real Model Validation
**Status:** Ready to execute.

```bash
# From server/code/ with lorevox venv active:
python test_model.py --verbose

# Single group to iterate fast:
python test_model.py --group 5 --verbose


Expected to pass easily: Groups 1, 2, 3.
Expected mixed: Groups 4A, 4B (pass/scene distinction).
Likely fail initially: Groups 5 (recognition), 6 (fatigue), 7b (grounding).

Rule: If a group fails, adjust directive text in prompt_composer.py only. Do not touch UI, WebSocket, or state until prompt-level behavior is confirmed.

2. Real Affect Engine Wiring

Status: Designed; not live.

What is needed:

Wire affect_engine.py into the live session loop

Smooth raw MediaPipe observations into:

neutral

moved

reflective

distressed

fatigue_hint

grounding

Write smoothed state to state.runtime.affectState and state.runtime.affectConfidence

Ensure cognitive-auto.js consumes real affect state

Connect affect state to TTS pacing and pitch shaping

Files: affect_engine.py, emotion.js, app.js, tts.py

3. Automatic Fatigue Score (SessionVitals in Live Loop)

Status: Exists in design and code; not live.

What is needed:

Initialize SessionVitals per session in chat_ws.py

Call vitals.register_user_turn(user_text) on every turn

Call vitals.set_affect(state, confidence) when affect arrives

Call vitals.estimate_fatigue()

Return fatigue score to UI and write to state.runtime.fatigueScore

Files: chat_ws.py, session_vitals.py

4. Backend-Authoritative Pass Advancement (Session Engine Loop)

Status: UI-only today.

What is needed:

Use SessionEngine.next_prompt() in backend to decide pass advancement

Return session_advance in WebSocket done message:

next_pass

next_era

next_mode

reason

UI should follow backend

Pass 1 → 2A advancement must require confirmed DOB + birthplace anchors

Files: chat_ws.py, session_engine.py, app.js

5. Pre-Claude Testing Package

Status: Defined conceptually; not yet written into repo.

What is needed:

Create TEST_STRATEGY.md

Create PERSONA_SIMULATION_PROTOCOL.md

Create LIVE_RUNTIME_TEST_CHECKLIST.md

Create TEST_BASELINE_REPORT.md

Only after results exist, create claude_code_plan.md

Requirements:

testing must start with anchor capture

simulation and runtime findings must remain separate

architecture-boundary checks must be explicit

each issue must be labeled as:

confirmed bug

high-confidence design gap

needs runtime confirmation

6. Persona Simulation Protocol (30-Persona / 5-Run / Timeline-Aware)

Status: Testing direction is clear; repo-ready protocol still needs to be formalized.

What is needed:

Formalize 30-persona cohort

Require 5 runs per persona

Start every run with:

full legal name

DOB

preferred name

birthplace

raised in / moved-young distinction

Add opening stress matrix for:

exact DOB

partial DOB

uncertain DOB

conflicted DOB

support-corrected DOB

birthplace with no memory

infant relocation

birthplace/raised-in divergence

Add pass/fail criteria for:

anchor capture

timeline coherence

cognitive accessibility

support-person handling

transcript integrity

safety response

archive truth preservation

Required special cohorts:

cognitive decline

support-person/couple mode

repeated-answer scenarios

fatigue/interruption scenarios

contradiction/correction scenarios

7. Targeted Live Runtime Confirmation of High-Risk Findings

Status: Not yet run.

Priority order:

support-person transcript contamination

uncertain DOB handling

pause/resume behavior

cognitive-distress safety response

fatigue/cognitive accessibility adaptation

Live checks must inspect:

UI behavior

API payloads

saved files on disk

transcript.jsonl

transcript.txt

structured values written

generated summaries/narratives if present

8. Agent Loop Live Wiring

Status: Partial. Timeline/affect/safety connected; direct retrieval not yet connected.

What is needed:

identify real Lorevox retrieval function/module

replace temporary direct retrieval fallback in skills.py

add timeline context to before_llm() in hooks.py

add year/date-sensitive timeline routing in after_llm() in hooks.py

prefer timeline suggestion writes in reflection.py when date/time cues are present

keep all writes candidate-only until review/history integration is confirmed

decide whether a dedicated safety-context summary endpoint should replace current derivation from segment flags

Files: server/code/api/skills.py, server/code/api/hooks.py, server/code/api/reflection.py, retrieval module once identified

9. Scene Capture

Status: Not started. Memory is still flatter than desired.

What is needed:

Redefine memory schema as a Scene object:

scene_id

era

pass

place

people

sensory_detail

emotional_tone

source_turn_id

Make “Save as Memory” in Pass 2B create a scene candidate

Index scenes under matching life period bands

Feed scene objects into timeline rendering

Files: backend schema layer, interview.js, timeline-ui.js, DB schema

10. Memoir Alignment

Status: Exists conceptually, not yet scene-aware or spine-aware enough.

What is needed:

Memoir composer should walk timeline spine period by period

Pull richest scenes from each period

Use timeline structure as chapter skeleton

Gate memoir generation on:

timeline seed

at least one scene per visited period

Files: memoir_composer.py, app.js, scene data layer

11. Legacy Fallback Cleanup

Status: Deferred until 7.1 is stable.

What is needed later:

Remove stale section-first logic from interview.js

Remove pre-7.1 roadmap rendering

Simplify renderTimeline() by removing legacy branch

Consolidate if (getTimelineSeedReady()) { ... } else { ... } patterns

Pre-Claude Testing Principles

Before claude_code_plan.md exists, Lorevox should be evaluated with three layers.

A. Simulation / Persona Layer

Purpose:

stress-test Lori behavior under diverse conditions

surface unsupported modes and design gaps

test repeated-run consistency

Should include:

30 personas

5 runs per persona

couple/support-person mode

cognitive decline scenarios

timeline-anchor validation

fatigue/interruption/contradiction scenarios

B. Live Runtime / Persistence Layer

Purpose:

verify what current build actually does

inspect real files, payloads, and state transitions

confirm or disconfirm simulation findings

Should include:

startup/model readiness

interview turn flow

archive file creation

transcript persistence

payload/response inspection

pause/resume

support-person contamination tests

safety response tests

C. Architecture Boundary Layer

Purpose:

protect archive truth

verify separation of archive/history/memoir

prevent generated or interpreted text from leaking into source truth

Should include:

raw transcript fidelity checks

structured fact separation checks

memoir labeling checks

correction provenance checks

multi-speaker contamination checks

Confirmed Testing Priorities
Anchor Capture

DOB and birthplace are first-class timeline anchors.

Timeline Coherence

Lorevox must be tested as a chronology reconstruction system.

Support-Person Handling

Single-speaker assumptions are unsafe and must be tested aggressively.

Cognitive Accessibility

Lorevox must support uncertainty, repetition, fatigue, and memory frustration.

Archive Integrity

Source material must remain distinct from interpretation and generated prose.

Claude Code Use — Agreed Direction

Claude Code should be used after testing, not before.

Claude Code’s Proper Role

repo-aware research

architecture tracing

spec generation

patch planning

test generation

documentation updates

Claude Code’s Improper Role

deciding Lorevox philosophy

collapsing archive/history/memoir boundaries

silently redefining storage truth

planning against unverified assumptions

Core Claude Workflow

Research

Plan

Review

Implement

Test

Document

Claude Guardrails

do not collapse Archive, History, Memoir

do not silently migrate or reinterpret source data

do not assume single-speaker input

preserve uncertainty where confidence is low

require confirmation for support-person corrections

prefer small explicit patches over sweeping rewrites

Separation of Concerns — Current Architecture
Layer	Files	Status
HTML shell	ui/lori7.1.html	Clean — external scripts only
UI state	ui/js/state.js	Complete
UI behavior	ui/js/app.js, interview.js, timeline-ui.js	Complete
Observability	ui/js/debug-overlay.js	Complete
Runtime cognitive	ui/js/cognitive-auto.js	Complete
Prompt bridge	server/code/api/prompt_composer.py	Complete — directives strengthened
WebSocket router	server/code/api/routers/chat_ws.py	Complete
Session intelligence	server/code/api/session_engine.py	Exists — not yet in live loop
Session vitals	server/code/api/session_vitals.py	Exists — not yet in live loop
Agent loop	server/code/api/agent_loop.py, hooks.py, policies.py, reflection.py, skills.py	Partial — timeline/affect/safety wired, direct retrieval pending
Testing docs	TEST_STRATEGY.md, PERSONA_SIMULATION_PROTOCOL.md, LIVE_RUNTIME_TEST_CHECKLIST.md, TEST_BASELINE_REPORT.md	Planned
Validation	server/code/test_model.py	Complete — Run 2 pending
Debug Reference
Tool	How to use
Runtime overlay	Ctrl+Shift+D in browser
Cognitive auto log	Visible in overlay when mode has switched
runtime71 per turn	Browser console: [Lori 7.1] runtime71 → model: {...}
Compact server log	Always on: [chat_ws] turn: conv=... | pass=... era=...
Full system prompt	Set LV_DEV_MODE=1 in .env, restart server
Pipeline test	python test_model.py --no-model
Real model test	python test_model.py --verbose
Single group	python test_model.py --group 5 --verbose
Decision Log
March 19, 2026 — Agent Loop Wiring

New agent-loop files belong in server/code/api/

skills.py is the live adapter layer

Timeline, affect, and safety endpoint wiring is the correct direction

server/code/api/api.py is the chat/model router and does not contain rag_search

Direct retrieval remains unresolved until the real retrieval module is identified

March 19, 2026 — Testing Before Claude Code

Claude Code planning must follow testing

Lorevox requires formal pre-Claude testing docs

Lorevox must be tested as a memory/timeline system, not just a chat UI

DOB and birthplace are mandatory opening anchors

Simulation, runtime, and architecture-boundary testing must remain distinct

March 19, 2026 — Persona Protocol Direction

30-persona / 5-run standard confirmed

Tests must begin with:

full name

DOB

preferred name

birthplace

raised in

Timeline coherence must be tested explicitly

Support-person and mixed-speaker testing is required

Cognitive accessibility and fatigue-aware testing are required

Simulation results will later drive Claude Code workstreams

March 17, 2026 — Providence Baseline

v7.1 shell stabilized around timeline-first interview flow

Runtime pills, debug overlay, and cognitive auto mode switching landed

Prompt pipeline validated without GPU

Run 2 prepared but not yet executed

Open Questions Requiring Resolution

These are known unresolved questions.

Where is the real Lorevox retrieval/memory search function or module?

Should safety context continue to be derived from segment flags, or should a dedicated summary endpoint be added?

Should scene capture live in the current memory layer, or be introduced as a separate schema track first?

What is the correct authoritative write path for derived history candidates from the agent loop?

How should support-person attribution be stored without contaminating archive truth?

Immediate Execution Order

If work resumes now, do this in order:

Run 2 real model validation

Formalize pre-Claude testing docs

Run targeted live runtime confirmation on highest-risk issues

Locate real retrieval/RAG module

Patch agent loop for timeline-aware hooks/reflection

Stabilize affect and fatigue live loop behavior

Finalize Claude Code plan from verified findings

Move to scene capture and memoir alignment

End State Definition

Lorevox 7.1 can be considered operationally stable when:

Run 2 passes or is iterated to acceptable threshold

testing docs exist and are used

high-risk runtime issues are confirmed or disproven

support-person contamination path is understood

anchor capture is robust

timeline flow is backend-authoritative enough to trust

affect/fatigue behavior is live

agent loop is wired to real retrieval/history surfaces

scene capture direction is stable

memoir alignment is anchored to spine + scene structure

Archive, History, and Memoir boundaries remain intact

Providence — March 19, 2026
Next required update: after Run 2, formal testing docs, targeted live runtime confirmations, and retrieval module identification