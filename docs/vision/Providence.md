Lorevox 7.1 — Providence
Master Checklist · March 2026

This document is the single source of truth for what is done, what is in progress, and what comes next. Update it after every significant session.

System Status

Architecture: 95%+ complete
UI shell: 92% complete
Runtime integration: 84% complete
Validation harness: complete
Model behavior: pending Run 2
Agent loop wiring: partial — timeline/affect/safety connected, direct memory/RAG adapter pending

✅ DONE — Architecture & Design

 v7.1 doctrine defined: Archive → History → Memoir

 Lori as guide, not side panel — role defined

 Timeline Spine as structural backbone — 6 life periods, age bands, era keys

 Multi-pass interview model: Pass 1 (seed), Pass 2A (chronological walk), Pass 2B (narrative depth)

 Affect support layer designed: MediaPipe, smoothed states, prompt/TTS shaping

 Cognitive support layer designed: recognition mode, repetition detection, aging-safe signals

 Session Vitals design: fatigue score, turn count, close recommendation

 Session Engine design: pass routing, era advancement, mode selection

 OpenClaw-pattern adaptation defined for Lorevox: hooks, skills, policies, reflection

 Agent behavior doctrine aligned to Lorevox’s own archive-first and local-first philosophy

✅ DONE — Backend Python Runtime

 session_engine.py — SessionEngine class with full prompt tables for 2A and 2B across all 6 eras

 session_vitals.py — SessionVitals dataclass with estimate_fatigue() and recommend_close()

 prompt_composer.py — compose_system_prompt() with runtime71 parameter

 prompt_composer.py — LORI_RUNTIME: block injected on every turn

 prompt_composer.py — Pass-level directives: Pass 1, 2A, 2B with explicit DO/DO NOT language

 prompt_composer.py — Mode modifiers: recognition, grounding, light — with DO/DO NOT language

 prompt_composer.py — Cognitive support block with concrete anchor examples

 prompt_composer.py — Fatigue signals: MODERATE (≥50) and HIGH (≥70) with behavioral constraints

 chat_ws.py — Extracts runtime71 from params on every start_turn

 chat_ws.py — Forwards runtime71 to compose_system_prompt() on every turn

 chat_ws.py — Compact INFO log per turn: pass/era/mode/affect/fatigue/cog

 chat_ws.py — Full system prompt log when LV_DEV_MODE=1

 agent_loop.py — initial agent loop scaffold added

 hooks.py — pre/post LLM hook structure added

 policies.py — initial heuristics for biography, kinship, dates, uncertainty, emotion, and retrieval decisions

 reflection.py — conservative post-turn reflection with candidate write planning

 skills.py — wired to real Lorevox timeline endpoints

 skills.py — wired to real Lorevox affect-context endpoint

 skills.py — derives real safety context from segment flags

 skills.py — direct memory/RAG adapter still pending correct Lorevox retrieval module

 hooks.py — still needs timeline context added to before_llm()

 hooks.py — still needs year/date-driven timeline tool routing in after_llm()

 reflection.py — should prefer timeline suggestion candidates when date/time cues are present

✅ DONE — Frontend JS State Layer

ui/js/state.js

 state.timeline — seedReady, spine, memories

 state.session — currentPass, currentEra, currentMode

 state.runtime — affectState, affectConfidence, cognitiveMode, fatigueScore

 localStorage spine persistence: saveSpineLocal() / loadSpineLocal(pid)

 Getters: getTimelineSeedReady(), getCurrentLifePeriods(), getCurrentPass(), getCurrentEra(), getCurrentMode()

 Setters: setPass(), setEra(), setMode()

ui/js/app.js

 initTimelineSpine() — builds 6 life periods from DOB, persists to localStorage, advances to pass 2A

 update71RuntimeUI() — paints all runtime pills on every state change

 loadPerson() — restores spine and advances pass on person load

 updateArchiveReadiness() — timeline-first checklist

 Both start_turn WebSocket sends include full runtime71 object

 console.log("[Lori 7.1] runtime71 → model: ...") before every send

 CognitiveAuto.processUserTurn(text) called before every send

ui/js/interview.js

 renderRoadmap() — 7.1 clickable life-period items + legacy fallback

 updateContextTriggers() — ERA_PROMPTS dict + legacy fallback

 build71InterviewPrompt() → _timelinePassPrompt() / _depthPassPrompt()

 setInterviewMode() — sets pass and calls update71RuntimeUI()

ui/js/timeline-ui.js

 renderTimeline() — 7.1 path: Timeline Seed → Life Periods → World Context → Affect Arc

 Active era highlighted; memories indexed under matching period band

 Legacy path fully preserved

✅ DONE — UI Shell

ui/lori7.1.html — now acts as a true shell, not a monolithic page

 Runtime status bar in top bar (pass/era/mode pills)

 Life Periods sidebar with clickable period bands

 Interview header with pass/era/mode labels

 Lori panel state strip

 Timeline seed badge + pass 2A availability badge

 Inline debug overlay removed — HTML is clean

 External scripts loaded: js/debug-overlay.js, js/cognitive-auto.js

 Cognitive auto shim: processUserTurn() called before every send

✅ DONE — Runtime Support Layer (Externalized)

ui/js/debug-overlay.js — observability tool

 window.LORI71 namespace established

 Live panel: pass (color-coded), era, mode, affect, confidence, cognitive mode, fatigue bar, seed status, period count, memory count

 Cognitive auto-log: last 5 mode switches with timestamps and reasons

 Hooks into setPass, setEra, setMode — updates immediately on state changes

 Also refreshes on click/input events

 Auto-refresh every 2 seconds while visible

 Keyboard toggle: Ctrl+Shift+D

 Draggable panel

 window.__loriDebug alias for backward compat

ui/js/cognitive-auto.js — runtime cognitive intelligence

 window.LORI71.CognitiveAuto object

 processUserTurn(text) — reads user message + runtime state, returns mode + reason

 inferSignals(text) — detects: uncertainty language, short reply, confusion affect, distress/dissociation affect, fatigue

 chooseMode(signals) — distress → grounding; fatigue → light; confusion/uncertainty/short → recognition; else → open

 applyMode(mode, reason) — writes to state.runtime.cognitiveMode and state.session.currentMode

 Reason log stored in state.runtime.cognitiveReasonLog (last 10 entries)

 Auto-refreshes debug overlay after mode switch

 Runtime-only — never writes to archive or history records

✅ DONE — Validation Harness

Pipeline tests (Run 1) — server/code/ (inline Python, no GPU needed)

 10/10 groups passing on prompt pipeline

 Verified: correct LORI_RUNTIME: block for every pass/era/mode/fatigue combination

 Verified: no regression across 7 sequential state transitions

Model validation (Run 2) — server/code/test_model.py

 Loads real Llama 3.1 8B via .env (same config as live server)

 Scoring system: 0–100 per test (required 40 + forbidden 20 + structural 30 + discipline 10)

 Grade thresholds: A ≥90, B ≥70, C ≥50, F <50

 Structural checks per group: choice-pattern detection, scene-vs-broad distinction, empathy-first check, pause-offer check, word count, question count

 Global negative check: "do you remember a time" penalized across all groups

 --no-model flag for pipeline-only verification without GPU

 --verbose flag for full response inspection

 --group N flag for single-group iteration

 JSON result file: test_model_results.json

 Exit code: 0 if overall ≥ 70, else 1 (CI-ready)

 Run 2 not yet executed — pending live session with Llama 3.1 8B

🔲 NEXT — Ordered by Impact
1. Run 2 — Real Model Validation

Status: Ready to execute. test_model.py is written and tested in --no-model mode.

# From server/code/ with lorevox venv active:
python test_model.py --verbose

# Single group to iterate fast:
python test_model.py --group 5 --verbose

Expected to pass easily: Groups 1, 2, 3.
Expected mixed: Groups 4A, 4B (pass/scene distinction).
Likely fail initially: Groups 5 (recognition), 6 (fatigue), 7b (grounding).

If a group fails: Adjust directive text in prompt_composer.py only. Do not touch UI, WebSocket, or state. Re-run the failing group. Repeat until all groups score ≥ 70.

2. Real Affect Engine Wiring

Status: Designed. MediaPipe exists in UI. affect_engine.py exists in backend. Not connected.

What is needed:

Wire affect_engine.py into the live session loop

Smooth raw MediaPipe observations into: neutral, moved, reflective, distressed, fatigue_hint, grounding

Write smoothed state to state.runtime.affectState + state.runtime.affectConfidence on each observation cycle

cognitive-auto.js then picks up the live state automatically

Wire the same state to TTS pacing and pitch shaping

Files: affect_engine.py, emotion.js, app.js (observer loop), tts.py

3. Automatic Fatigue Score (SessionVitals in live loop)

Status: SessionVitals exists. Not yet called per turn.

What is needed:

Initialize SessionVitals per session in chat_ws.py

Call vitals.register_user_turn(user_text) on every turn

Call vitals.set_affect(state, confidence) when affect arrives

vitals.estimate_fatigue() then auto-populates fatigue score

Return fatigue score to UI (via done message or session endpoint) → writes to state.runtime.fatigueScore

Files: chat_ws.py, session_vitals.py

4. Backend-Authoritative Pass Advancement (Session Engine Loop)

Status: Pass advancement is currently UI-only (initTimelineSpine() on the JS side).

What is needed:

Use SessionEngine.next_prompt() in the backend to make pass advancement decisions

Return a session_advance signal in the done WebSocket message: {next_pass, next_era, next_mode, reason}

JS receives signal and calls setPass(), setEra(), setMode(), update71RuntimeUI() — backend drives, UI follows

Pass 1 → 2A advancement becomes authoritative: model must confirm DOB + birthplace before advance

Files: chat_ws.py, session_engine.py, app.js

5. Agent Loop Live Wiring

Status: Partial. Scaffold exists and now touches real timeline, affect, and safety surfaces. Direct retrieval is not yet connected to the actual Lorevox memory/RAG module.

What is needed:

Identify the real Lorevox retrieval function/module for memory or RAG

Replace temporary direct retrieval fallback in skills.py

Add timeline context to before_llm() in hooks.py

Add year/date-sensitive timeline routing in after_llm() in hooks.py

Prefer timeline suggestion writes in reflection.py when date/time cues are present

Keep all writes candidate-only until review/history integration is confirmed

Verify whether a dedicated safety-context summary endpoint should be added later instead of deriving from segment flags

Files: server/code/api/skills.py, server/code/api/hooks.py, server/code/api/reflection.py, real retrieval module once identified

6. Scene Capture

Status: Not started. Memories still save as flat text items.

What is needed:

Redefine memory schema as a Scene object: {scene_id, era, pass, place, people, sensory_detail, emotional_tone, source_turn_id}

"Save as Memory" in Pass 2B creates a scene candidate, not a flat note

Scenes indexed under their matching life period band in the timeline

renderTimeline() already has memory slots — feed scene objects in

Files: data.js or backend schema layer, interview.js, timeline-ui.js, DB schema

7. Memoir Alignment

Status: Memoir generation exists but is not spine-aware or scene-aware.

What is needed:

Memoir composer walks the timeline spine period by period

Pulls richest scenes from each period (Pass 2B output)

Timeline structure becomes the chapter skeleton

"Generate Memoir" gated on: timeline seed + at least one scene per visited period

Files: memoir_composer.py, app.js (generate action), scene data layer

8. Legacy Fallback Cleanup

Status: Intentionally deferred. Do not touch until 7.1 is stable in production.

What is needed (later):

Remove stale section-first logic from interview.js

Remove pre-7.1 roadmap rendering

Simplify renderTimeline() — remove legacy branch once all sessions have a spine

Consolidate if (getTimelineSeedReady()) { ... } else { ... } patterns

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
Validation	server/code/test_model.py	Complete — Run 2 pending
Debug Reference
Tool	How to use
Runtime overlay	Ctrl+Shift+D in browser
Cognitive auto log	Visible in overlay when mode has switched
runtime71 per turn	Browser console: [Lori 7.1] runtime71 → model: {...}
Compact server log	Always on: `[chat_ws] turn: conv=...
Full system prompt	Set LV_DEV_MODE=1 in .env, restart server
Pipeline test	python test_model.py --no-model
Real model test	python test_model.py --verbose
Single group	python test_model.py --group 5 --verbose
Notes From Recent Sessions
March 19, 2026 — Agent Loop Wiring Check

Confirmed new agent-loop files belong in server/code/api/, not loose top-level server/

Confirmed skills.py can stay as the live adapter layer in server/code/api/

Confirmed timeline, affect, and safety endpoint wiring is the correct direction

Confirmed server/code/api/api.py is the chat/model router and does not contain rag_search

Added temporary plan to leave direct retrieval empty until the real Lorevox memory/RAG function is identified

Next code step: patch hooks.py and reflection.py to use live timeline context and timeline-sensitive routing

March 17, 2026 — Providence Baseline

v7.1 shell stabilized around timeline-first interview flow

Runtime pills, debug overlay, and cognitive auto mode switching landed

Prompt pipeline validated without GPU

Run 2 prepared but not yet executed

Providence — March 19, 2026
Next update: after Run 2 results and agent loop timeline wiring