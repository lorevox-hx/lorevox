# Lorevox Action Plan
**Generated: March 21, 2026 — Revised March 21, 2026 (Phase 0 added, build order corrected)**
**Updated: March 27, 2026 — Transparency Rule patched (v8.0). Camera stream unification logged. Phase 8–9 remaining.**

## ✅ Completed This Session
- **Phase 0** — DB verification: `inspect_db.py`, `db.py` logging
- **Phase 1** — Startup stability: `run_all_dev.sh`, `stop_all_dev.sh`, `warm_llm.py`, `warm_tts.py`, `lorevox-serve.py` comment fix
- **Phase 2** — Speech: `isLoriSpeaking` flag, TTS/STT feedback loop fix, voice send commands
- **Phase 3** — Chat bubbles: `appendBubble()` refactor, speaker labels, 18px font, `_bubbleBody()` helper
- **Phase 4** — Helper mode: `assistantRole` state, `_isHelpIntent()`, `_HELP_KEYWORDS`, `prompt_composer.py` helper/onboarding early returns
- **Phase 5** — Fact humility: FACT HUMILITY RULE in `DEFAULT_CORE`
- **Phase 6** — Identity-first startup: `startIdentityOnboarding()`, `_advanceIdentityPhase()`, `_resolveOrCreatePerson()`, `_parseDob()`, `window.onload` wired
- **Phase 7** — Archive auto-population: `extractFactsFromTurn()`, `_extractAndPostFacts()`, `/api/facts/add` fire-and-forget after each turn
- **ISSUE-15** — Archive growth visible: `updateArchiveReadiness()` called after fact extraction
- **ISSUE-16** — Active person display: `#dockActivePerson` in Lori dock header, `_updateDockActivePerson()`

## ✅ Additional Completed (March 27, 2026)
- **v8.0 — Transparency Rule** — Added `TRANSPARENCY RULE` directive to `prompt_composer.py`
  `_build_directive_block()`. Anchors Lori's trust-question answers to actual LORI_RUNTIME
  state. Prevents false denial and false assertion. Applies universally (all roles).
- **v8.0 — 20-Run Deep Runtime Report** — `docs/LOREVOX_20_RUN_DEEP_RUNTIME_REPORT.md`.
  20/20 PASS across TP-01 (Nora Vance ×10) and TC-01 (Harold & June Mercer ×10).
  No critical failures. No drift. Architecture integrity confirmed.
- **Step 3 — Camera Preview** — `window.lv74.showCameraPreview()` IIFE in `lori8.0.html`.
  Draggable, closeable, re-openable.
- **Media Builder** — Full photo lifecycle: upload, gallery, lightbox, attach-to-section,
  DOCX export with inline photos. Bug MB-01 (router/db signature mismatch) fixed.

## 🔲 Remaining
- **Phase 8** — MediaPipe WASM crash fix: vendor asset verification, SIMD path testing
- **Phase 9** — UI scale and focus mode: widen Lori dock, wire focus mode CSS

## 📋 Tracked Issues (non-blocking)
- **ISSUE-17 — Camera stream unification** *(logged 2026-03-27)*
  `window.lv74.showCameraPreview()` calls `getUserMedia` independently from the emotion
  engine (`LoreVoxEmotion`). On browsers that haven't cached the camera permission, the
  user may see a second permission dialog when the preview activates. This is a UX issue
  only — no data leakage. Fix: pass the existing `LoreVoxEmotion` MediaStream into the
  preview element instead of opening a new stream. Priority: low. Do before first public
  narrator session.

---

## What Lorevox Is

Lorevox is a conversation-first personal history system. Lori (the AI) is front and center. The profile, timeline, memoir, and family record form behind her — from what is said, not from forms. Every design and code decision should serve this principle.

**The test:** If someone's grandmother opened this, would it feel like talking to Lori — or filling out paperwork? It must always feel like Lori.

---

## Current State (What We Confirmed in the Code)

> **DB status note:** The SQLite file exists at `server/data/db/lorevox.sqlite3`. Whether it is being written correctly on every save/create/event insert has not yet been verified end-to-end. Phase 0 closes that gap before anything else.

| Area | What Exists | What's Missing |
|------|-------------|----------------|
| **Chat bubbles** | `bubble-ai`, `bubble-user` CSS classes, 13px font | Speaker labels ("You" / "Lori"), adequate size |
| **TTS playback** | `drainTts()` works via NDJSON stream | Does NOT stop mic. No `isLoriSpeaking` guard |
| **Speech recognition** | Continuous, auto-restarts on end | Restarts during TTS — transcribes Lori's voice |
| **Send flow** | Clears input, sends to WS | Does NOT stop STT before sending |
| **Prompt composer** | pass1, pass2a/b, cognitive modes, visual affect | No helper mode, no fact humility rule |
| **Startup** | Loads last person from localStorage | No identity-first onboarding flow |
| **Profile creation** | `createPersonFromForm()` + `saveProfile()` | User must manually click `+ New Person` |
| **Archive auto-fill** | Not wired in current send loop | Nothing extracts facts from chat turns |
| **lorevox-serve.py** | PORT = 8080, COOP/COEP headers set | Comment still says "open lori7.3.html" |
| **CSS base font** | `--lv73-base-font: 18px` defined | Bubbles override to 13px in layout.css |
| **Lori dock** | 380px wide | Competes with main content; no focus mode wired |

---

## Locked Principles (Do Not Violate)

1. If it's not saved → it doesn't exist
2. If it's saved → the user must be able to see it
3. Lori leads → not forms
4. Conversation builds the archive
5. User memory outranks system assumption (never correct personal facts confidently)
6. One authoritative path per behavior
7. If it requires internet → it's not Lorevox
8. If it's cold on first use → it's not ready

---

## Issue Registry

### ISSUE-00 — DB writes are unverified (CRITICAL INFRASTRUCTURE)
**Symptom:** We do not know for certain that `createPerson`, `saveProfile`, and `insertEvent` are actually writing rows. If the DB is silently failing, every higher-level feature is untrustworthy.
**Root cause:** No end-to-end DB verification pass has been run. `scripts/inspect_db.py` does not exist. No visible "Saved" confirmation in the UI.
**Files:** `scripts/inspect_db.py` (create), `server/code/api/db.py` (verify logging), `ui/lori7.4c.html` (add save confirmation)
**Fix:** Create inspect script, run it after a person is created and profile is saved, confirm rows exist, confirm data survives restart.

---

### ISSUE-01 — Chat bubbles have no speaker labels (CRITICAL UX)
**Symptom:** Conversation looks like a wall of run-on text. User and Lori are hard to distinguish.
**Root cause:** `appendBubble()` in `ui/js/app.js` line 1046 uses only `d.textContent = text` with no header. Bubble CSS in `ui/css/layout.css` line 65 sets font-size to 13px.
**Files:** `ui/js/app.js`, `ui/css/layout.css`
**Fix:** Add speaker header to each bubble; increase font-size to 18px; add margin between turns.

---

### ISSUE-02 — Lori's TTS is transcribed back into the input box (CRITICAL BUG)
**Symptom:** After Lori speaks, her words appear in the chat input. User has to delete them.
**Root cause:** `recognition.onend` in `app.js` line 1146 auto-restarts recognition whenever `isRecording` is true — including while TTS is playing. There is no `isLoriSpeaking` guard.
**Files:** `ui/js/app.js` lines 1077–1160
**Fix:** Add `let isLoriSpeaking = false`. Set it true before TTS plays, false when done. Check it in the recognition result handler and skip if true.

---

### ISSUE-03 — Saying "send" types the word instead of sending (BUG)
**Symptom:** Voice command "send" is treated as dictation content.
**Root cause:** No command layer in the recognition result handler. All recognized speech goes to `chatInput`.
**Files:** `ui/js/app.js` lines 1141–1143
**Fix:** In the final transcript handler, check for "send" / "send it" / "okay send" and call `sendUserMessage()` instead of appending to input.

---

### ISSUE-04 — STT does not stop when user sends a message (BUG)
**Symptom:** After pressing Send, mic keeps listening, may pick up background audio.
**Root cause:** `sendUserMessage()` in `app.js` line 894 never calls `stopRecording()`.
**Files:** `ui/js/app.js` line 894
**Fix:** Call `stopRecording()` as the first line of `sendUserMessage()`.

---

### ISSUE-05 — No identity-first startup (CRITICAL FLOW)
**Symptom:** App starts with empty form. User must manually create a person. Lori doesn't ask for name/DOB/birthplace. Returning users cannot be recognized by name+DOB.
**Root cause:** `window.onload` in `app.js` calls `initSession()`, `refreshPeople()`, and tries `loadPerson()` from localStorage — but never triggers an onboarding conversation asking for identity.
**Files:** `ui/js/app.js` (onload), `ui/js/lori73-shell.js` (startOnboarding)
**Fix:** After permissions, Lori asks name → DOB → birthplace. Backend or frontend looks up existing person by normalized name+DOB. If found, loads. If not, auto-creates. Timeline spine is built automatically from the identity anchors.

---

### ISSUE-06 — Profile form not connected to Lori conversation (CRITICAL FLOW)
**Symptom:** User says life facts to Lori but the Profile tab doesn't update. Archive feels disconnected from the conversation.
**Root cause:** `sendUserMessage()` has no extraction hook. Facts stay in chat only. `saveProfile()` only saves what's manually entered in the form.
**Files:** `ui/js/app.js`, `server/code/api/prompt_composer.py`
**Fix:** After each chat turn, run a lightweight fact extractor to update profile basics and create timeline event stubs. This can start simple (place mentions, person mentions, dates) and grow over time.

---

### ISSUE-07 — Lori ignores questions about how to use the app (UX GAP)
**Symptom:** User asks "how do I save this?" or "how do I create a profile?" and Lori keeps interviewing.
**Root cause:** `prompt_composer.py` has no helper mode. No help-intent detection exists in `sendUserMessage()` or the prompt layer.
**Files:** `server/code/api/prompt_composer.py`, `ui/js/app.js`
**Fix:** Add help-intent detection (keywords: "how do I", "why didn't", "what does this", "help me use"). When detected, set `assistantRole = "helper"` in the runtime, inject a helper directive in `prompt_composer.py` that suppresses interview behavior and instructs Lori to explain UI elements directly.

---

### ISSUE-08 — Lori over-corrects user facts (TRUST BUG)
**Symptom:** User says "Hazleton ND" and Lori corrects it to "Hazen ND" without being asked. User memory is not treated as authoritative.
**Root cause:** No fact humility rule in `prompt_composer.py`. The model uses its general training to "correct" place names.
**Files:** `server/code/api/prompt_composer.py`
**Fix:** Add a pinned rule to `DEFAULT_CORE` or the directive block: "Never correct the narrator's place names, personal names, or biographical facts unless explicitly asked. If something seems unusual, ask a clarifying question instead of asserting a correction. The narrator's lived memory is always more authoritative than external data."

---

### ISSUE-09 — Bubble font is 13px (READABILITY FAILURE)
**Symptom:** Chat text is too small for older users. Hard to read during long sessions.
**Root cause:** `ui/css/layout.css` line 65 sets `.bubble { font-size: 13px }` which overrides the 18px root variable.
**Files:** `ui/css/layout.css`
**Fix:** Change bubble font-size to 18px. Increase line-height to 1.6. Add 16px margin between bubbles.

---

### ISSUE-10 — lorevox-serve.py doc comment still says port 8000 and lori7.3.html
**Symptom:** Minor but causes confusion when following the startup guide.
**Root cause:** The comment at the top of `lorevox-serve.py` was not updated when PORT changed to 8080.
**Files:** `lorevox-serve.py`
**Fix:** Update the comment to say port 8080 and `lori7.4c.html`.

---

### ISSUE-11 — No startup launcher scripts exist (OPS GAP)
**Symptom:** Starting Lorevox requires manually running three terminal commands in the right order. Port conflicts cause failures on restart.
**Root cause:** `launchers/` only has `run_gpu_8000.sh` and `run_tts_8001.sh`. No master launcher, no stop script.
**Files:** `launchers/` directory
**Fix:** Create `launchers/run_all_dev.sh` and `launchers/stop_all_dev.sh`.

---

### ISSUE-12 — No DB inspection tool (OPS GAP)
**Symptom:** Cannot verify DB is writing without using raw SQLite tools.
**Root cause:** `scripts/inspect_db.py` does not exist yet.
**Files:** `scripts/` directory
**Fix:** Create `scripts/inspect_db.py` that prints persons, profiles, events, and last-save timestamps in readable format.

---

### ISSUE-13 — MediaPipe WASM crash (7.4 BLOCKER)
**Symptom:** Affect events never fire. `state.session.visualSignals` stays null. Baseline samples stay at 0.
**Root cause:** Likely a vendored asset issue (missing or mismatched `.wasm`, `.data`, or graph files) or SIMD vs non-SIMD path mismatch.
**Files:** `ui/vendor/mediapipe/` (need to verify), `ui/js/emotion.js`
**Fix:** Verify all vendored assets. Check Network tab for failed requests. Test SIMD vs fallback path. Confirm `onBrowserAffectEvent()` fires.

---

### ISSUE-15 — Archive growth is not visibly alive (PRODUCT PROMISE GAP)
**Symptom:** User says life facts during conversation. Even if something changes internally in state, the Profile tab and Timeline tab don't visibly react. The archive feels static, not growing. This breaks the core promise that "Lori builds the archive from what you say."
**Root cause:** No live UI refresh is triggered after user messages. Archive tabs only update when the user manually opens them or saves the form.
**Files:** `ui/js/app.js` (sendUserMessage / onAssistantReply), `ui/js/timeline-ui.js`, `ui/js/tabs.js`
**Fix:** After each exchange, quietly refresh the active tab's display (if Profile or Timeline is open). Add a subtle visual indicator ("Archive updated") when new facts are captured. Archive should feel like it's breathing.

---

### ISSUE-16 — Active person state is unclear to the user (UX CONFUSION)
**Symptom:** User cannot reliably tell who is loaded. Save/create/load actions are easy to misread. After form actions, it's not obvious whether the operation succeeded or who the data was saved to. This is upstream of profile confusion — all form confusion flows from here.
**Root cause:** The status badge updates exist (`updateProfileStatus()`, `updateArchiveReadiness()`) but are small and easy to miss. There is no prominent "Working with: [Name]" indicator that stays visible throughout the session.
**Files:** `ui/lori7.4c.html`, `ui/js/app.js` (`loadPerson`, `createPersonFromForm`, `saveProfile`)
**Fix:** Add a persistent, visible "Active: [Full Name]" display in the Lori dock header or topbar that updates immediately whenever `state.person_id` changes. If no person is loaded, show "No one loaded — tell Lori your name to begin."

---

### ISSUE-14 — Free-form input mode not yet implemented (FEATURE GAP)
**Symptom:** Users who want to tell their story naturally have no clear entry point. The guided interview is the only option.
**Root cause:** No "Tell Lori freely" mode exists.
**Files:** `ui/lori7.4c.html`, `ui/js/app.js`, `server/code/api/prompt_composer.py`
**Fix:** Add a free-form input area. Lori reads the input, identifies anchors (places, people, dates), reflects what she heard, and asks one clarifying question at a time.

---

## Build Order (Corrected Sequence)

**Rationale for this order:** DB verification comes first because if data isn't saving, nothing above it can be trusted. Warmup comes next so the first user response is fast. Speech bugs come before readability because they make the app feel broken. Readability and fact humility are fast wins that transform trust. Helper mode and identity startup are bigger but critical. Affect pipeline last because it's 7.4 work and requires the rest to be stable first.

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 4 → Phase 6 → Phase 7 → Phase 8 → Phase 9
DB       Startup   Speech    Chat      Humility  Helper   Identity  Archive   Affect   UI Focus
```

---

### Phase 0 — Database Creation + Persistence Verification (Do Before Anything Else)

**Goal:** Prove Lorevox is creating the DB and saving data. If this isn't verified, nothing above it can be trusted.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 0.1 | Confirm DB path logs on backend startup | `server/code/api/db.py` | Log path at startup: `logger.info("DB: %s", DB_PATH)` |
| 0.2 | Confirm DB file auto-creates on first run | `server/code/api/db.py` | Should already work; verify |
| 0.3 | Confirm `createPerson` writes a row | `server/code/api/db.py` | Add `logger.info("person created: %s", pid)` |
| 0.4 | Confirm `saveProfile` persists | `server/code/api/db.py` | Add `logger.info("profile saved: %s", pid)` |
| 0.5 | Confirm `insertEvent` writes a row | `server/code/api/db.py` | Add `logger.info("event inserted: %s", eid)` |
| 0.6 | Create `scripts/inspect_db.py` | `scripts/inspect_db.py` | Print persons, profiles, events in readable format |
| 0.7 | Add "Saved to local archive" visible confirmation in UI | `ui/lori7.4c.html` | Toast or status line that appears on save |
| 0.8 | Add "Reload from DB" button | `ui/lori7.4c.html` | Calls `loadPerson(state.person_id)` to rehydrate form |

**Acceptance:** Create person → row in DB. Save profile → persists. Restart Lorevox → data still present. `inspect_db.py` shows correct output.

---

### Phase 1 — Startup Stability + Warmup (Do First — Everything Else Depends on This)

**Goal:** System starts cleanly every time. Port conflicts don't kill the session. First response is fast — no cold-start lag.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 1.1 | Fix `lorevox-serve.py` comment (port 8080, lori7.4c.html) | `lorevox-serve.py` | 5-minute fix |
| 1.2 | Create `launchers/stop_all_dev.sh` | `launchers/stop_all_dev.sh` | `pkill -f "uvicorn.*8000\|uvicorn.*8001\|lorevox-serve.py"` |
| 1.3 | Create `launchers/run_all_dev.sh` | `launchers/run_all_dev.sh` | Kill old procs → Terminal A (backend) → Terminal B (TTS) → sleep 5 → warm both → Terminal C (UI) |
| 1.4 | Create `scripts/warm_llm.py` | `scripts/warm_llm.py` | POST to `/api/chat/stream` with a tiny dummy message; log "LLM ready" |
| 1.5 | Create `scripts/warm_tts.py` | `scripts/warm_tts.py` | POST to TTS `/api/tts/speak_stream` with a tiny dummy utterance; log "TTS ready" |
| 1.6 | Wire warmup into `run_all_dev.sh` after `sleep 5` | `launchers/run_all_dev.sh` | `python3 scripts/warm_llm.py && python3 scripts/warm_tts.py` |

**Acceptance:** Three services start from one command. Restart doesn't cause port conflict. First user message gets a fast response (model already warm). "LLM ready" and "TTS ready" appear in terminal.

---

### Phase 2 — Speech Bug Fixes (High Impact, Quick Wins)

**Goal:** Lori never transcribes herself. "Send" works. Mic stops when it should.

| # | Task | File(s) | Function(s) |
|---|------|---------|-------------|
| 2.1 | Add `isLoriSpeaking = false` flag | `ui/js/app.js` | module-level var |
| 2.2 | Set `isLoriSpeaking = true` before TTS plays, `false` after | `ui/js/app.js` | `drainTts()` line ~1097 |
| 2.3 | Guard recognition results: `if (isLoriSpeaking) return;` | `ui/js/app.js` | `recognition.onresult` line 1141 |
| 2.4 | Stop STT on send: call `stopRecording()` in `sendUserMessage()` | `ui/js/app.js` | `sendUserMessage()` line 894 |
| 2.5 | Add "send" voice command detection | `ui/js/app.js` | `recognition.onresult` handler |
| 2.6 | Do NOT auto-restart recognition after Lori responds | `ui/js/app.js` | `recognition.onend` line 1146 |

**Acceptance:** Lori's voice is never typed into input. "Send" command sends the message. Mic stays off after Lori responds.

---

### Phase 3 — Chat Readability (Immediate UX Improvement)

**Goal:** Anyone can scan a 10-turn conversation and instantly know who said what.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 3.1 | Add speaker label to `appendBubble()` | `ui/js/app.js` line 1046 | Add "You" / "Lori" header div inside each bubble |
| 3.2 | Increase bubble font-size from 13px to 18px | `ui/css/layout.css` line 65 | `.bubble { font-size: 18px }` |
| 3.3 | Increase bubble line-height to 1.65 | `ui/css/layout.css` | `.bubble { line-height: 1.65 }` |
| 3.4 | Add 16px bottom margin between bubbles | `ui/css/layout.css` | `.bubble { margin-bottom: 16px }` |
| 3.5 | Add padding inside bubbles | `ui/css/layout.css` | `.bubble { padding: 14px 16px }` |
| 3.6 | Differentiate user vs Lori bubble colors more clearly | `ui/css/layout.css` | Make distinction obvious, not subtle |

**Acceptance:** 6-turn conversation is easy to scan. User/Lori turns are unmistakable. No wall-of-text feeling.

---

### Phase 4 — Helper Mode (Critical UX)

**Goal:** When a user asks how to use the app, Lori helps immediately and returns to the interview afterward.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 4.1 | Add `assistantRole` to session state | `ui/js/state.js` | `state.session.assistantRole = "interviewer"` |
| 4.2 | Add help-intent detection in `sendUserMessage()` | `ui/js/app.js` | Check for "how do I", "why didn't", "where is", "what does this", "help me use" |
| 4.3 | Set `assistantRole = "helper"` when intent detected | `ui/js/app.js` | Set in state before building runtime |
| 4.4 | Pass `assistantRole` in `buildRuntime71()` | `ui/js/app.js` | Add to runtime block |
| 4.5 | Add helper mode directive in `prompt_composer.py` | `server/code/api/prompt_composer.py` | If `assistant_role == "helper"`: suppress interview, explain UI directly, do not advance pass |
| 4.6 | Reset role to "interviewer" after one helper exchange | `ui/js/app.js` | In `onAssistantReply()` line 999 |

**Acceptance:** User asks "how do I save this?" → Lori answers directly. Does not continue interview in same reply. Returns to interview after.

---

### Phase 5 — Fact Humility (Trust Fix)

**Goal:** Lori never confidently corrects user memories of places, names, or personal facts.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 5.1 | Add fact humility rule to `DEFAULT_CORE` in `prompt_composer.py` | `server/code/api/prompt_composer.py` line 26 | See exact wording below |

**Exact addition to DEFAULT_CORE:**
```
"Never correct the narrator's place names, personal names, or biographical details unless explicitly asked to verify them. "
"If a fact seems unusual or ambiguous, ask one clarifying question instead of asserting a correction. "
"The narrator's lived memory is always more authoritative than external data or general knowledge."
```

**Acceptance:** User says "Hazleton ND" → Lori asks "Tell me more about Hazleton" rather than correcting to "Hazen".

---

### Phase 6 — Identity-First Startup (Foundation Work)

**Goal:** Lori asks name, DOB, birthplace on first launch. Finds or creates the person automatically. Archive begins.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 6.1 | Add `state.session.onboardingPhase` to state | `ui/js/state.js` | Track: `null`, `"identity"`, `"complete"` |
| 6.2 | Modify `window.onload` to detect new vs returning user | `ui/js/app.js` | If no person in localStorage, trigger identity onboarding |
| 6.3 | Add `startIdentityOnboarding()` function | `ui/js/app.js` | Lori asks name → DOB → birthplace in sequence |
| 6.4 | Add `resolveOrCreatePerson(name, dob, birthplace)` | `ui/js/app.js` | Look up by name+DOB; load if found, create if not |
| 6.5 | Auto-build timeline spine from DOB + birthplace | `ui/js/app.js` | Call existing `buildTimelineSpine` with identity data |
| 6.6 | Show active person prominently after identity | `ui/lori7.4c.html` | Display "Lori is working with: [Name]" |
| 6.7 | Add returning-user recognition path | `ui/js/app.js` | If person exists, greet by name, confirm, resume |

**Acceptance:** No `+ New Person` button needed to start. Active person is obvious. Timeline spine appears immediately. Returning user recognized by name+DOB.

---

### Phase 7 — Conversation → Archive Auto-Population

**Goal:** Every turn the user speaks, the archive grows.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 7.1 | Add `extractFactsFromTurn(text)` in `ui/js/app.js` | `ui/js/app.js` | Basic pattern matching: places, dates, person names |
| 7.2 | Call `extractFactsFromTurn()` inside `sendUserMessage()` after send | `ui/js/app.js` | After user text is captured, before API call |
| 7.3 | Wire extracted facts to profile and timeline state | `ui/js/data.js` or `app.js` | Update `state.profile` and `state.timeline` |
| 7.4 | Reflect profile changes in the Profile tab automatically | `ui/js/app.js` | Refresh form display after extraction |
| 7.5 | Add "Tell Lori Freely" mode option after identity complete | `ui/lori7.4c.html` | Button: "Let Lori guide me" / "Tell Lori freely" |
| 7.6 | Add free-form prompt directive in `prompt_composer.py` | `server/code/api/prompt_composer.py` | When mode is `free_form`: reflect, identify anchors, ask one clarifying question |

**Acceptance:** Speaking life facts updates profile and timeline. User can see it happening. Free-form mode works.

---

### Phase 8 — MediaPipe Affect Pipeline (7.4 Completion)

**Goal:** Real camera affect events flow. Baseline establishes. Visual signals enter the prompt.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 8.1 | Add no-cache headers to all JS vendor assets | `lorevox-serve.py` | Already done — confirm working |
| 8.2 | Inspect all MediaPipe vendor assets | `ui/vendor/mediapipe/` | Verify `.wasm`, `.data`, graph files all present |
| 8.3 | Check browser Network tab for 404s on MediaPipe assets | DevTools | Find the exact failing request |
| 8.4 | Test SIMD vs non-SIMD WASM path | `ui/js/emotion.js` | Try fallback if SIMD crashes |
| 8.5 | Confirm `onBrowserAffectEvent()` fires | DevTools Console | Should fire within 5 seconds of camera consent |
| 8.6 | Confirm `AffectBridge74` writes to `state.session.visualSignals` | DevTools Console | Check `state.session.visualSignals` |
| 8.7 | Confirm `buildRuntime71()` includes `visual_signals` | DevTools Console | Check `buildRuntime71()` output |
| 8.8 | Confirm baseline establishes after ~30 samples | DevTools Console | `state.session.affectBaseline.samples.length` |

**Acceptance:** Affect events fire. Baseline establishes. Visual signals present in runtime. Camera-off behavior unchanged.

---

### Phase 9 — UI Scale and Focus Mode

**Goal:** Lori is front and center. Archive forms beside/behind her. Focus mode available.

| # | Task | File(s) | Detail |
|---|------|---------|--------|
| 9.1 | Widen Lori dock (380px → 480px minimum) | `ui/css/lori73.css` | `--lv73-dock-width: 480px` |
| 9.2 | Increase chat input font to 18px | `ui/css/lori73.css` | Input area font-size |
| 9.3 | Make focus mode actually hide left nav | `ui/css/lori73.css`, `ui/js/app.js` | `.focus-mode #lv73Nav { display: none }` |
| 9.4 | Make focus mode expand Lori dock to 60%+ width | `ui/css/lori73.css` | `.focus-mode .lv73-lori-dock { width: 65vw }` |
| 9.5 | Add "Focus on Lori" button visibly in UI | `ui/lori7.4c.html` | Top bar or Lori dock header |
| 9.6 | Ensure archive tabs update live during conversation | `ui/js/app.js` | After extract, refresh visible tab if open |

**Acceptance:** Lori is visually dominant. Archive is visible and alive but not competing. Focus mode makes conversation full-width.

---

## What Is Already Working (Don't Break These)

- `lorevox-serve.py` port 8080 with COOP/COEP headers
- `--lv73-base-font: 18px` CSS variable (just not applied to bubbles)
- `prompt_composer.py` pass1/pass2a/2b directives
- Cognitive mode support (recognition, grounding, alongside, light)
- Paired interview mode (v7.2)
- Visual affect directives gated on `baseline_established`
- `buildRuntime71()` passing runtime context to backend
- Camera consent and preview flow (lori73-shell.js)
- TTS streaming via NDJSON
- WebSocket chat path with SSE fallback
- Session persistence and reload
- Memoir draft generation
- Obituary generation
- Timeline spine builder (called from `saveProfile()`)

---

## Quick Reference: Key File Map

| What | Where |
|------|-------|
| Chat send + TTS + mic | `ui/js/app.js` lines 894–1160 |
| Bubble rendering | `ui/js/app.js` line 1046, `ui/css/layout.css` line 65 |
| Prompt building | `server/code/api/prompt_composer.py` |
| Lori state + onboarding | `ui/js/lori73-shell.js` |
| Session/person state | `ui/js/state.js` |
| DB operations | `server/code/api/db.py` |
| Interview flow | `ui/js/interview.js` |
| Affect bridge | `ui/js/affect-bridge.js` |
| Emotion/MediaPipe | `ui/js/emotion.js`, `ui/js/emotion-ui.js` |
| CSS: shell layout | `ui/css/lori73.css` |
| CSS: bubbles + chat | `ui/css/layout.css` |
| Startup launchers | `launchers/` |
| Dev scripts | `scripts/` |

---

## Verification Checklist (Run After Each Phase)

**After Phase 0 (DB Verification):**
- [ ] Backend logs DB path on startup
- [ ] Create a person → `python3 scripts/inspect_db.py` shows that person's row
- [ ] Save profile → inspect_db shows updated data
- [ ] Restart backend → data still present
- [ ] UI shows "Saved to local archive" after save

**After Phase 1 (Startup + Warmup):**
- [ ] `bash launchers/run_all_dev.sh` starts all three services
- [ ] No port conflict on restart
- [ ] `python3 scripts/inspect_db.py` shows person rows

**After Phase 2 (Speech):**
- [ ] Press Send → mic stops
- [ ] Lori speaks → mic stays off
- [ ] Lori's words do NOT appear in input
- [ ] Saying "send" triggers Send

**After Phase 3 (Chat readability):**
- [ ] Bubbles show "You" / "Lori" labels
- [ ] Font is readable without zooming
- [ ] Turns are visually distinct

**After Phase 4 (Helper mode):**
- [ ] "How do I save this?" → Lori explains the UI
- [ ] Lori does not continue interview in same reply
- [ ] Next user message resumes interview normally

**After Phase 5 (Fact humility):**
- [ ] Unusual place name → Lori asks, does not correct

**After Phase 6 (Identity startup):**
- [ ] First launch → Lori asks name, DOB, birthplace
- [ ] Person is created automatically
- [ ] Returning user is recognized by name+DOB
- [ ] Timeline shows birth event immediately

**After Phase 7 (Archive auto-population):**
- [ ] Speaking life facts → Profile tab visibly updates (not just internal state)
- [ ] Timeline grows during conversation — user can see new events appearing
- [ ] Free-form mode available and working
- [ ] Active person name is visible at all times in UI (ISSUE-16)
- [ ] Archive updating feels alive, not silent

**After Phase 8 (Affect pipeline):**
- [ ] `onBrowserAffectEvent()` fires in console
- [ ] `state.session.affectBaseline.samples.length > 30`
- [ ] `state.session.visualSignals` not null when camera on

**After Phase 9 (UI scale):**
- [ ] Lori dock at least 480px wide
- [ ] Focus mode hides left nav and expands Lori
- [ ] Chat input font 18px+

---

## Design Reference: The One-Sentence Test

> *Lori greets you, learns your name and when and where you were born, builds the first page of your life story, and then listens — and everything you say makes the archive grow.*

If that isn't the experience, something on this list still needs to be done.
