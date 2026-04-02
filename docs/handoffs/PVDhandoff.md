# Lorevox — PVD Master Handoff
**Version:** 7.2 (Cognitive Support Layer Integrated)
**Date:** 2026-03-20
**Status:** ✅ LIVE · VALIDATED · HANDOFF-READY
**Supersedes:** `docs/Providence.md`, `docs/handoff.md`, `HANDOFF_MEDIAPIPE_OFFLINE.md`, `MOVE_TO_V7.md`

---

## 1. PURPOSE OF THIS DOCUMENT

This is the single source of truth for Lorevox 7.1.

If the original builder is unavailable, this document must allow a new engineer to:
- Start the system
- Understand the architecture
- Verify behaviour
- Continue development without breaking what works

**This is a control file, not a note. It is updated after every significant session.**

---

## 1b. STRATEGIC DIRECTION — WHERE THIS IS GOING

### The v7 Vision (Corrected)

**Lori stays with the user everywhere, and the tabs are the places where the life story can be reviewed, edited, and shaped.**

The original `MOVE_TO_V7.md` sentence — "Lori is the app. Everything else is what she builds" — was a useful break from the v6 mindset but overshot. The codebase never implemented chat-only. `interview.js` still exists. The tabs still work. The runtime pipeline is what actually got built and validated.

The corrected direction is:

**Chat-first, not chat-only.**

### What This Means

The user should always be able to:
- talk naturally with Lori
- see what Lori has learned
- correct mistakes
- edit facts directly in the tabs
- move between tabs without losing Lori's presence

The tabs are not being removed. They remain essential workspaces — especially for older adults who benefit from stable layout, clear location, and easy correction.

Lori's role: guide, ask, notice, encourage, help populate the archive.
Tabs' role: display, organize, confirm, and allow editing of what has been captured.

### Product Shape — v7.3

v7.3 is the next UI shell. It carries forward all of v7.1/v7.2 and adds:

```
┌──────────────────────────────────────────────┬───────────────┐
│ Sidebar / Tabs                               │               │
│ Profile | Interview | Timeline | Memoir      │   Lori        │
│                                              │   Bubble /    │
│ CONTENT AREA (editable)                      │   Panel       │
│                                              │               │
│ - profile fields (correctable)               │  "Tell me..." │
│ - timeline entries (editable)                │  [ mic ]      │
│ - interview content                          │               │
│ - memoir draft (editable)                    │               │
└──────────────────────────────────────────────┴───────────────┘
```

Lori: always visible, collapsible to avatar + mic, context-aware of active tab.
Tabs: real editable workspaces — Profile, Interview, Timeline, Memoir, and (future) Family Tree.

### Versioning

| Version | What it is |
|---|---|
| `lori7.1.html` | Validated artifact — stable runtime shell. Do not modify. |
| v7.2 | Behavioral layer — cognitive support + alongside + paired interview. Already integrated. |
| v7.3 | New HTML shell — persistent Lori companion + editable tabs + accessibility. |

### Accessibility Commitments — v7.3

Lorevox is designed for older adults first. This is not optional.

**Visual:** larger base font (18–20px), high contrast, large hit targets (≥44px), clear labels, stable layout.
**Hearing:** always-visible transcript, replay Lori's last response, adjustable voice speed, clear mic state.
**Cognitive:** one clear action at a time, predictable tab structure, gentle prompting, easy correction paths, Lori present without requiring the user to navigate.

### Non-Negotiable Architectural Rule

All new v7.3 behavior — accessibility states, shell interactions, paired interview logic, any new Lori mode — must continue to use the existing runtime pipeline:

```
state.runtime → buildRuntime71() → WebSocket/SSE → prompt_composer.py
```

No second behavioral pipeline is allowed. This rule has no exceptions.

### What MOVE_TO_V7.md Got Right (Still Valid)

- Chat→DB extraction pipeline — still planned, still correct
- Family Tree interview mode — still planned, still correct
- Offline bundling plan for UI vendor assets — still needed (see Section 10)
- The layout model (sidebar + tabs + Lori panel) — still correct, semantics updated

### What MOVE_TO_V7.md Got Wrong (Superseded)

- "Lori is the app. Everything else is what she builds" — too absolute
- Tabs as read-only live views — wrong for older adults who need correction capability
- Delete `interview.js` — not needed; extend it
- Replace MediaPipe with face-api.js — never happened; MediaPipe is still correct
- DeepFace server-side — good idea, not yet built, not a v7.3 blocker

---

## 2. SYSTEM OVERVIEW

Lorevox is a local-first memoir and oral history system. It is NOT a chatbot.

```
ARCHIVE  →  HISTORY  →  MEMOIR
```

| Layer | What it holds | Rules |
|---|---|---|
| Archive | Raw transcripts, audio, images | Immutable |
| History | Structured facts, events, timeline | Editable with full audit |
| Memoir | Generated narrative | Fully editable |

**This separation must never be collapsed. Ever.**

---

## 3. CURRENT STATE (AUTHORITATIVE)

### ✅ Fully Working
- Local LLM running offline
- Lori 7.1 UI operational
- Runtime → model pipeline wired and validated
- Emotional + cognitive behaviours validated (Tests 1–8)
- Claude test harness working

### ✅ Validated Tests

| Test | Description | Result |
|---|---|---|
| 1 | Pass 1 seed — timeline initiation | PASS |
| 2 | Pass 2A — chronological walk | PASS |
| 3 | Era advancement | PASS |
| 4 | Cognitive mode: open | PASS |
| 5 | Cognitive mode: recognition | PASS |
| 6 | High fatigue — gentle close | PASS (after patch) |
| 7 | Emotional difficulty — distress_hint affect | PASS |
| 8 | Memory contradiction — uncertainty-tolerant | PASS |

**System is operational, not experimental.**

### ✅ v7.2 Cognitive Support Layer (2026-03-20)

All four files extended via the existing runtime pipeline. No parallel system created.

| Change | File | Detail |
|---|---|---|
| `alongside` in `normalizeLoriState()` | `ui/js/app.js` | New cognitive mode entry — sustained fragmentation/confusion |
| `paired` / `paired_speaker` in `buildRuntime71()` | `ui/js/app.js` | Paired interview metadata flows to backend on every turn |
| `confusionTurnCount` in `state.session` | `ui/js/state.js` | Session-persistent confusion counter (not a loose global) |
| `paired` / `pairedSpeaker` in `state.interview` | `ui/js/state.js` | Paired session state |
| Sustained confusion escalation | `ui/js/cognitive-auto.js` | `confusionTurnCount ≥ 3` → `alongside`; tightened regex; fixed `shortReply` threshold |
| `alongside` directive block | `server/code/api/prompt_composer.py` | Intentional-stance instructions — no structured questions, reflect meaning |
| Paired interview directive block | `server/code/api/prompt_composer.py` | Co-construction framing; no contradiction correction |

**Persona validation:** All 5 personas in `tests/persona_cognitive_cohort_v65.json` (Harold Jensen, Maria Alvarez, Thomas Reed, Lila Chen, George & Eleanor Whitman) reach `alongside` mode correctly. Recovery path confirmed gradual. ✅

### ⚠️ Pending (not blockers)
- Run 2 model validation (`test_model.py --verbose`) not yet executed with live GPU
- MediaPipe offline bundling not done — camera requires internet (see Section 10)
- SessionVitals not yet in live loop — fatigue currently set manually via console
- Backend-authoritative pass advancement not yet wired
- Agent loop direct retrieval adapter pending (real RAG module not yet identified)

---

## 4. ZERO-FAIL STARTUP (CRITICAL)

### ❌ DO NOT DO THIS
```bash
cd /mnt/c/lorevox   # WRONG PATH
```

### ✅ CORRECT ROOT
```bash
cd /mnt/c/Users/chris/lorevox
```

---

### 🧠 TERMINAL 1 — Backend / LLM

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

cd /mnt/c/Users/chris/lorevox/server
export PYTHONPATH=/mnt/c/Users/chris/lorevox/server
```

### 🧪 STEP 1 — Verify Model (MANDATORY before starting backend)

```bash
python - <<'PY'
from code.api.api import _load_model
m, t = _load_model()
print("MODEL OK:", type(m).__name__, type(t).__name__)
PY
```

✅ Expected output: `MODEL OK: ...`

❌ If it fails: wrong directory / venv not active / PYTHONPATH missing. Fix before continuing.

### ▶️ STEP 2 — Start Backend

```bash
# Preferred:
cd /mnt/c/Users/chris/lorevox
bash launchers/run_gpu_8000.sh

# Or direct:
uvicorn code.api.main:app --host 127.0.0.1 --port 8000
```

### 🔊 TERMINAL 2 — TTS

```bash
cd /mnt/c/Users/chris/lorevox
bash launchers/run_tts_8001.sh
```

### 🖥️ STEP 3 — UI

```
file:///C:/Users/chris/lorevox/ui/lori7.1.html
```

### ✅ Final Startup Check

| Check | Expected |
|---|---|
| Model loads | `MODEL OK:` printed |
| Backend | Running on :8000 |
| TTS | Running on :8001 |
| UI loads | Lori 7.1 shell visible |
| Lori responds | First message answered |
| Console | `[Lori 7.1] runtime71 → model: {...}` visible on every send |

---

## 5. ARCHITECTURE

```
UI (Lori 7.1)
    ↓
state.runtime  ←──── SINGLE SOURCE OF TRUTH
    ↓
buildRuntime71()  ←── ONLY builder for the payload
    ↓
WebSocket (start_turn)
    ↓
Backend — chat_ws.py
    ↓
prompt_composer.py
    ↓
LLM
```

### Separation of Concerns

| Layer | Files | Status |
|---|---|---|
| HTML shell | `ui/lori7.1.html` | Clean — external scripts only |
| UI state | `ui/js/state.js` | Complete |
| UI behaviour | `ui/js/app.js`, `interview.js`, `timeline-ui.js` | Complete |
| Observability | `ui/js/debug-overlay.js` | Complete |
| Runtime cognitive | `ui/js/cognitive-auto.js` | Complete |
| Facial consent gate | `ui/js/facial-consent.js`, `ui/css/facial-consent.css` | Complete |
| Emotion engine | `ui/js/emotion.js`, `ui/js/emotion-ui.js` | Complete — online only (see Section 10) |
| Prompt bridge | `server/code/api/prompt_composer.py` | Complete — directives strengthened |
| WebSocket router | `server/code/api/routers/chat_ws.py` | Complete |
| Session intelligence | `server/code/api/session_engine.py` | Exists — not yet in live loop |
| Session vitals | `server/code/api/session_vitals.py` | Exists — not yet in live loop |
| Agent loop | `agent_loop.py`, `hooks.py`, `policies.py`, `reflection.py`, `skills.py` | Partial — timeline/affect/safety wired, direct retrieval pending |
| Validation | `server/code/test_model.py` | Complete — Run 2 pending |

---

## 6. RUNTIME71 SYSTEM (CRITICAL)

This is the core behaviour engine. If this breaks, the model receives no context.

### Canonical Payload

```json
{
  "current_pass":      "pass2a",
  "current_era":       "early_childhood",
  "current_mode":      "open",
  "affect_state":      "fatigue_hint",
  "affect_confidence": 0.9,
  "cognitive_mode":    "alongside",
  "fatigue_score":     80,
  "paired":            false,
  "paired_speaker":    null
}
```

`cognitive_mode` valid values: `null` | `"open"` | `"recognition"` | `"grounding"` | `"light"` | `"alongside"`

### Contract

| Rule | Detail |
|---|---|
| **Single source of truth** | `state.runtime` only. Nothing else. |
| **Single builder** | `buildRuntime71()` only. Never construct this object inline. |
| **Single entry point** | `setLoriState()` only. Never write to `state.runtime` directly from other paths. |

---

## 7. FATIGUE PATCH — ROOT CAUSE AND FIX (2026-03-19)

### What was broken

1. `setLoriState()` updated only the UI badge — `state.runtime` was never written.
2. `setLoriState("thinking")` was called **before** `buildRuntime71()`, resetting `fatigueScore` to 0 before the payload was built.

Result: the model always received `fatigue_score: 0` regardless of actual state.

### Fix Summary

**1. `normalizeLoriState()`**
Maps semantic state labels to canonical `{ affectState, affectConfidence, cognitiveMode, fatigueScore }`.
Returns `null` for transitional/UI-only states.

**2. Transitional states — UI only, never touch runtime**
```
thinking   drafting   listening
```
These are badge-only. `normalizeLoriState()` returns `null` for all three. `setLoriState()` skips `state.runtime` when `null` is returned.

**3. `setLoriState()` — now writes runtime**
Updates `state.runtime` only when `normalizeLoriState()` returns a non-null value.

**4. `buildRuntime71()` — single builder**
Reads `state.runtime` and assembles the full payload. Used by both `ws.send()` paths.

**5. Send-path ordering — CRITICAL**
```javascript
// ✅ CORRECT — runtime captured before badge transition
const _rt71 = buildRuntime71();
setLoriState("thinking");
ws.send(JSON.stringify({ ..., runtime71: _rt71 }));

// ❌ WRONG — thinking resets fatigueScore before payload is built
setLoriState("thinking");
buildRuntime71();
```

This ordering must be preserved in **both** send paths (user message send and `sendSystemPrompt`).

---

## 8. VALIDATED BEHAVIOUR

### Test 6 — High Fatigue / Gentle Close
- Shortened response
- Softer tone, no pressure
- Break or pause offered
- Console confirmed: `fatigue_score: 80` in payload

### Test 7 — Emotional Difficulty (`distress_hint`)
- Emotion acknowledged before any follow-up
- No clinical language
- No abrupt chronological pivot
- Console confirmed: `affect_state: "distress_hint"`, `affect_confidence: 0.75`

### Test 8 — Memory Contradiction
- Uncertainty accepted without correction
- "That's okay, these details can be fuzzy over time"
- Redirected to experience, not exact age
- No memory-test pressure

---

## 9. REGRESSION GUARDRAILS

These rules protect the work that has been validated. Each guardrail has a specific trigger that must stop work and require a test pass before proceeding.

### G1 — runtime71 Contract Lock
**Rule:** `state.runtime` is the only source of truth. `buildRuntime71()` is the only assembler. `setLoriState()` is the only writer.

**Trigger:** Any PR or change that writes to `state.runtime` directly from outside `setLoriState()`, or constructs a `runtime71` object inline in a send path, must be rejected.

**Verification:** Run Test 6 after any change to `app.js`, `state.js`, or `buildRuntime71()`. `fatigue_score: 80` must appear in the console payload.

---

### G2 — Transitional State Isolation
**Rule:** `thinking`, `drafting`, and `listening` must never modify `state.runtime`.

**Trigger:** Any new state added to `normalizeLoriState()` must be classified as either semantic (returns full norm object) or transitional (returns `null`). No in-between.

**Verification:** After adding a new state, call it via console, then call `buildRuntime71()` and confirm the previously-set `fatigueScore` is unchanged.

---

### G3 — Send-Path Ordering
**Rule:** In every `ws.send()` path, `buildRuntime71()` must be called and captured **before** any `setLoriState()` call.

**Trigger:** Any refactor of the send paths in `app.js` must preserve `const _rt71 = buildRuntime71()` as the first statement before state transitions.

**Verification:** Check browser console log — the `[Lori 7.1] runtime71 → model: {...}` entry must appear before any `setLoriState → thinking` entry in the same turn.

---

### G4 — Test Gate Before Merge
**Rule:** Tests 6, 7, and 8 must all PASS after any change to:
- `ui/js/app.js`
- `server/code/api/prompt_composer.py`
- `server/code/api/routers/chat_ws.py`

**Trigger:** These files form the UI→runtime→model pipeline. A change to any one of them can break the others silently.

**Verification:** Run the live browser test sequence from `tests/CLAUDE_LIVE_VALIDATION_SET_LOREVOX_7_1.md`. Confirm console payloads and Lori's responses match PASS criteria before considering the change stable.

---

### G5 — Affect Pipeline Write Path
**Rule:** When live MediaPipe affect detection is wired, affect states must still enter `state.runtime` via `setLoriState()` only. The affect engine must never write directly to `state.runtime.affectState`.

**Trigger:** Any implementation of the MediaPipe → runtime wiring that bypasses `setLoriState()` violates the contract and must be rejected.

**Verification:** After wiring, confirm via console that `setLoriState("moved")` (or whichever affect-mapped state) is the call that appears in the log, not a bare `state.runtime.affectState = ...` assignment.

---

### G6 — Three-Layer Separation
**Rule:** Archive is immutable. History is audited. Memoir is generated. These layers must never collapse.

**Trigger:** Any feature that writes to Archive directly from a turn, or generates Memoir without consulting History, or collapses History into raw transcript storage.

**Verification:** No automated test — code review only. Flag immediately.

---

## 10. MEDIAPIPE OFFLINE — PENDING TASK

**Current state:** The emotion engine requires an internet connection. All MediaPipe assets load from `cdn.jsdelivr.net` at runtime. Without a connection, `LoreVoxEmotion.init()` fails and the camera does not activate.

**The consent gate and `LoreVoxEmotion.start()` are not affected by this change** — they will continue to work correctly once assets are local.

### What loads from the internet

| File | Source | Size |
|---|---|---|
| `face_mesh.js` | `cdn.jsdelivr.net/npm/@mediapipe/face_mesh/` | ~20 KB |
| `camera_utils.js` | `cdn.jsdelivr.net/npm/@mediapipe/camera_utils/` | ~20 KB |
| `face_mesh_solution_packed_assets.data` | Fetched by `locateFile` at init | ~2 MB |
| `face_mesh_solution_simd_wasm_bin.wasm` | Fetched by `locateFile` at init | ~6 MB |
| `face_mesh_solution_wasm_bin.wasm` | Fetched by `locateFile` at init | ~5 MB |
| Supporting `.js` loaders | Fetched by `locateFile` at init | ~50 KB |

**Total: ~13–15 MB to vendor.**

### Fix — 3 code changes, 1 new directory

**Step 1 — Download packages**
```bash
mkdir -p /tmp/mediapipe_vendor && cd /tmp/mediapipe_vendor
npm pack @mediapipe/face_mesh@latest
npm pack @mediapipe/camera_utils@latest
tar -xzf mediapipe-face_mesh-*.tgz
tar -xzf mediapipe-camera_utils-*.tgz
```
Pin the version from `cat package/package.json | grep '"version"'`. Document it. Do not silently upgrade.

**Step 2 — Copy into project**
```
ui/vendor/mediapipe/face_mesh/       ← all face_mesh package files
ui/vendor/mediapipe/camera_utils/    ← camera_utils.js
```
Required files in `face_mesh/`: `face_mesh.js`, `face_mesh_solution_packed_assets.data`, `face_mesh_solution_packed_assets_loader.js`, `face_mesh_solution_simd_wasm_bin.wasm`, `face_mesh_solution_simd_wasm_bin.js`, `face_mesh_solution_wasm_bin.wasm`, `face_mesh_solution_wasm_bin.js`

**Step 3 — Update `ui/lori7.1.html` (lines 13–14)**
```html
<!-- BEFORE -->
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>

<!-- AFTER -->
<script src="vendor/mediapipe/face_mesh/face_mesh.js"></script>
<script src="vendor/mediapipe/camera_utils/camera_utils.js"></script>
```
Remove `crossorigin` — causes CORS error on local file paths.

**Step 4 — Update `ui/js/emotion.js` (line 365)**
```javascript
// BEFORE
locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,

// AFTER
locateFile: (file) => `vendor/mediapipe/face_mesh/${file}`,
```
This is the critical change. Without it, `face_mesh.js` loads locally but fetches WASM from the CDN at init.

**Step 5 — Verify offline**
- Disconnect / set DevTools → Network → Offline
- Load `lori7.1.html`, enable emotion-aware mode, approve consent
- Console must show: `[LoreVoxEmotion] Camera started — affect detection active.`
- Network tab: all `mediapipe` requests must resolve to `vendor/mediapipe/...`, none to `cdn.jsdelivr.net`

**Note on Tailwind CSS:** `https://cdn.tailwindcss.com` (line 8 of `lori7.1.html`) is also CDN-loaded and will break layout offline. This is a separate task — compile Tailwind locally and replace the CDN tag with a local `<link>`. Do not conflate with the MediaPipe task.

---

## 11. REQUIRED NEXT STEPS (ORDERED BY IMPACT)

### 0. v7.3 Shell — Persistent Lori Companion + Editable Tabs
Status: Planned. `lori7.1.html` is the artifact to preserve; `lori7.3.html` is the next shell.

New shell must carry forward all existing JS files unchanged. Changes are additive:
- Persistent Lori panel (fixed right side, collapsible to avatar + mic)
- Tab bar: Profile, Interview, Timeline, Memoir (all remain editable workspaces)
- Lori receives active tab via `runtime71` (add `current_tab` field)
- Accessibility defaults: 18–20px base font, high contrast, ≥44px hit targets
- Mobile: Lori docks as bottom drawer
- Tailwind CDN replaced with compiled local stylesheet (separate from MediaPipe task)

**Gate:** `lori7.3.html` loads with no CDN requests. Lori responds. All existing Tests 1–8 pass in the new shell.

### 1. MediaPipe Offline Bundle
See Section 10. ~13 MB vendor, 3 code lines.
**Gate:** Verify offline with DevTools → Network → Offline.

### 2. Run 2 — Real Model Validation
Status: Ready. `test_model.py` written and tested in `--no-model` mode.
```bash
# From server/code/ with lorevox venv active:
python test_model.py --verbose
python test_model.py --group 5 --verbose   # single group iteration
```
Expected easy pass: Groups 1, 2, 3. Mixed: 4A, 4B. Likely initial fail: Groups 5, 6, 7b.
If a group fails: adjust directive text in `prompt_composer.py` only. Do not touch UI, WebSocket, or state. Re-run the failing group until ≥ 70.

### 3. Add Backend Logging for runtime71
File: `chat_ws.py`
Log on every `start_turn`: `runtime71["fatigue_score"]`, `runtime71["affect_state"]`, `runtime71["cognitive_mode"]`
This closes the current gap — fatigue correctness is only console-verified today, not server-confirmed.

### 4. Test Remaining Cognitive Modes
```javascript
setLoriState("grounding")
setLoriState("recognition")
```
Verify via console and Lori response. Add to validation report.

### 5. Real Affect Engine Wiring (MediaPipe → setLoriState)
Status: Designed. MediaPipe exists in UI. `affect_engine.py` exists in backend. Not connected.
Flow: `MediaPipe landmarks → emotion.js classifyGeometry() → toAffectState() → setLoriState(mapped_state)`
Files: `emotion.js`, `emotion-ui.js`, `app.js` (observer loop), `affect_engine.py`, `tts.py`
**Guardrail G5 applies:** affect states must enter runtime via `setLoriState()` only.

### 6. SessionVitals in Live Loop
Status: `session_vitals.py` exists, not called per turn.
Wire in `chat_ws.py`: `vitals.register_user_turn()`, `vitals.set_affect()`, return `fatigue_score` to UI → `state.runtime.fatigueScore`.

### 7. Backend-Authoritative Pass Advancement
Status: Currently UI-only (`initTimelineSpine()` on JS side).
Wire `SessionEngine.next_prompt()` to return `{next_pass, next_era, next_mode, reason}` in the `done` WebSocket message. JS receives signal and calls `setPass()`, `setEra()`, `setMode()`. Backend drives, UI follows.

### 8. Agent Loop — Direct Retrieval Completion
Status: Scaffold exists. Timeline/affect/safety wired. Direct memory/RAG adapter pending.
- Identify real Lorevox retrieval function/module
- Replace temporary fallback in `skills.py`
- Add timeline context to `before_llm()` in `hooks.py`
- Add year/date-sensitive routing in `after_llm()` in `hooks.py`
- Prefer timeline suggestion writes in `reflection.py` when date/time cues present

### 9. Scene Capture
Status: Memories save as flat text. Not started.
Redefine memory schema as `{ scene_id, era, pass, place, people, sensory_detail, emotional_tone, source_turn_id }`. "Save as Memory" in Pass 2B creates a scene candidate. Feed scene objects into `renderTimeline()`.

### 10. Memoir Alignment
Status: Memoir generation exists, not spine-aware or scene-aware.
Memoir composer walks timeline spine period by period, pulls richest scenes, timeline structure becomes chapter skeleton.

### 11. Legacy Fallback Cleanup (deferred — do not touch until 7.1 is stable in production)
Remove stale section-first logic in `interview.js`, pre-7.1 roadmap rendering, legacy branches in `renderTimeline()`.

---

## 12. DEBUG REFERENCE

| Tool | How to use |
|---|---|
| Runtime overlay | `Ctrl+Shift+D` in browser |
| Cognitive auto log | Visible in overlay when mode has switched |
| runtime71 per turn | Browser console: `[Lori 7.1] runtime71 → model: {...}` |
| Compact server log | Always on: `[chat_ws] turn: conv=...` |
| Full system prompt | Set `LV_DEV_MODE=1` in `.env`, restart server |
| Pipeline test (no GPU) | `python test_model.py --no-model` |
| Real model test | `python test_model.py --verbose` |
| Single group | `python test_model.py --group 5 --verbose` |

---

## 13. CLAUDE ROLE IN THIS PROJECT

Claude is:
- Test executor (live browser validation)
- Behavioural validator (response quality assessment)
- Patch verifier (console + payload confirmation)
- Report generator (validation reports to `tests/`)
- Handoff maintainer (this document)

Claude is not an architect. Claude does not make structural decisions unilaterally.

---

## 14. DEVELOPMENT RULES

### NEVER
- Bypass `state.runtime` — no direct payload construction
- Write to `state.runtime` from outside `setLoriState()`
- Call `buildRuntime71()` after a transitional `setLoriState()` in a send path
- Mix UI state and runtime state
- Collapse Archive, History, and Memoir layers
- Deploy a change to `app.js`, `chat_ws.py`, or `prompt_composer.py` without running Tests 6, 7, 8

### ALWAYS
- Validate changes via the live test sequence
- Verify via browser console runtime71 payload before calling a test PASS
- Update this document after any significant session
- Update `tests/CLAUDE_LIVE_VALIDATION_SET_LOREVOX_7_1.md` if new tests are added

---

## 15. KEY PRINCIPLE

> **If the model does not receive the state, the feature does not exist.**

This caused the fatigue failure. The fix is in production and validated. This must never happen again.

The enforcement mechanism is Guardrails G1–G3 in Section 9.

---

## 16. SESSION NOTES

### 2026-03-20 — v7.2 Cognitive Support Layer + v7.3 Vision

- Integrated `alongside` as new cognitive mode across all four files: `state.js`, `app.js`, `prompt_composer.py`, `cognitive-auto.js`
- Added `confusionTurnCount` to `state.session` — session-persistent counter replaces loose global
- Added paired interview metadata (`paired`, `paired_speaker`) to `state.interview` and `buildRuntime71()`
- Prompt composer now has explicit `alongside` directive (intentional stance) and paired interview directive (co-construction, no contradiction framing)
- `cognitive-auto.js`: tightened uncertainty regex (removed `i think` / `maybe`), fixed `shortReply` threshold (requires ≥12 chars), added sustained confusion escalation with graceful recovery path
- Persona cohort `persona_cognitive_cohort_v65.json` copied to `tests/`; all 5 personas validated against escalation path
- PVDhandoff.md updated to supersede `MOVE_TO_V7.md` — vision corrected from "chat-only" to "chat-first"
- v7.3 direction established: persistent Lori companion + editable tabs + accessibility-first shell
- `lori7.1.html` confirmed as historical artifact; next shell will be `lori7.3.html`

### 2026-03-19 — Fatigue Patch + Tests 6/7/8

- Identified root cause of Test 6 failure: `setLoriState()` badge-only, `buildRuntime71()` called after transitional state reset
- Applied two-part fix: `normalizeLoriState()` returning `null` for transitional states; `buildRuntime71()` moved before `setLoriState("thinking")` in both send paths
- Test 6 re-run: PASS — `fatigue_score: 80` confirmed in console payload
- Test 7 (emotional difficulty): PASS — `distress_hint` confirmed sent; Lori led with empathy
- Test 8 (memory contradiction): PASS — "That's okay, these details can be fuzzy over time"
- Added `facial-consent.js` and `facial-consent.css` — `LoreVoxEmotion.start()` now blocked behind explicit consent gate with checkbox acknowledgment
- Confirmed MediaPipe loads from CDN — offline bundling documented in Section 10
- Validation reports saved to `tests/`

### 2026-03-19 — Agent Loop Wiring Check

- Confirmed new agent-loop files belong in `server/code/api/`, not top-level `server/`
- Confirmed `skills.py` stays as live adapter layer
- Confirmed timeline, affect, and safety endpoint wiring is correct direction
- Confirmed `server/code/api/api.py` is the chat/model router and does not contain `rag_search`
- Temporary: direct retrieval left empty until real Lorevox memory/RAG function identified
- Next code step: patch `hooks.py` and `reflection.py` to use live timeline context

### 2026-03-17 — Providence Baseline

- v7.1 shell stabilised around timeline-first interview flow
- Runtime pills, debug overlay, and cognitive auto mode switching landed
- Prompt pipeline validated without GPU (Run 1: 10/10 groups passing)
- Run 2 prepared but not yet executed

---

*Next update: after v7.3 shell start, Run 2 results, MediaPipe offline bundling, and backend runtime71 logging.*
