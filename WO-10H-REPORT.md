# WO-10H Implementation Report
## Narrator Turn-Claim Contract + Repeatable LLM Tuning Harness

## 1. Code Review Summary

### How mic click currently behaves
`toggleMic()` → `toggleRecording()` → `startRecording()` — recording starts **immediately** with no armed/waiting phase. The browser Speech Recognition API is initialized once (`_ensureRecognition()`), then `recognition.start()` fires on each mic click. Focus Canvas intercepts `#btnMic.onclick` and calls `toggleRecording()` indirectly via `_startListening()`.

### How TTS state is currently tracked
`isLoriSpeaking` (boolean, app.js line 2884) is the single source of truth. Set **true** before `drainTts()` starts audio, cleared in a hardened `finally{}` block after all chunks drain. The STT guard in `recognition.onresult` discards transcripts while `isLoriSpeaking === true`, and `recognition.onend` only auto-restarts when `isLoriSpeaking === false`.

### Where narrator-turn state should live
Added to `state.narratorTurn` in state.js — a dedicated object with `state`, `claimTimestamp`, `timeoutDeadline`, `interruptionBlock`, `ttsFinishedAt`, `checkInFired`. This keeps turn-taking explicit and debuggable rather than scattered across booleans.

### How interruption blocking currently works
Three-layer defense: (1) `isLoriSpeaking` suppresses STT results, (2) `_wo8VoicePaused` blocks idle nudges, (3) `_wo10bLastTranscriptGrowthTs` prevents interruption within 5s of last speech. The `lv80FireCheckIn()` function (hornelore1.0.html line 3817) also checks conversation state (storytelling/reflecting/emotional_pause) and camera visual engagement.

### How test-run data can be isolated safely
The test harness uses a dedicated `TEST_PID = "__test_harness_narrator_001"`. Cleanup targets only localStorage keys with this PID prefix. Projection state is only cleared when `state.person_id === TEST_PID` or is null. Seven localStorage keys per PID are cleaned: `lorevox_proj_draft_`, `lorevox_qq_draft_`, `lorevox_ft_draft_`, `lorevox_lt_draft_`, `lorevox_sources_draft_`, `lorevox.spine.`, `lorevox_offline_profile_`.

## 2. Files Changed

| File | Changes |
|------|---------|
| `state.js` | Added `state.narratorTurn` object (state, claimTimestamp, timeoutDeadline, interruptionBlock, ttsFinishedAt, checkInFired) |
| `app.js` | Added turn-claim state machine (`_wo10hClaimTurn`, `_wo10hTransitionToArmed`, `wo10hReleaseTurn`, `wo10hCancelClaim`, `wo10hIsNarratorTurnActive`, `_wo10hArmTimeout`, `_wo10hClearTimeout`, `_wo10hOnNarratorActivity`, `_wo10hSyncUI`). Patched `toggleRecording()` to route through claim system when TTS active. Patched `drainTts()` finally block to transition turn state. Patched `sendUserMessage()` to release turn on send. Extended Bug Panel refresh with turn-state fields and warnings. |
| `hornelore1.0.html` | Added narrator turn-claim guard to `lv80ArmIdle()` and `lv80FireCheckIn()`. Added Bug Panel turn-state section (6 fields). Added context window selector to LLM Tuning. Expanded temperature options (0.2, 0.4). Added test harness section (run/repeat/clear/golden buttons, sample selector). Added scorecard and comparison table sections. Added `_wo10hOnNarratorActivity` hook to chatInput oninput. Added test-harness.js script tag. |
| `test-harness.js` | **New file.** 28-field extraction rubric, 4 narrator samples (clean/messy/emotional/fragmented), sample-specific expected scores, auto-scoring engine with fuzzy matching, run/repeat/clear/golden baseline workflow, scorecard rendering, comparison table, safe cleanup with test PID isolation. |

## 3. Narrator Turn-Claim Summary

### State machine added
Six states: `idle` → `awaiting_tts_end` → `armed_for_narrator` → `recording` → `idle`. Also `paused` and `timeout_check` as transitional states.

### How mic click now behaves
- **If TTS is active** (`isLoriSpeaking === true`): Click enters `awaiting_tts_end`. No recording starts. Idle timers suppressed.
- **If TTS is done**: Normal `startRecording()` behavior.
- **When TTS finishes** (drainTts finally block): If state is `awaiting_tts_end`, automatically transitions to `armed_for_narrator`, then starts recording. Lori yields the floor.

### How TTS completion transitions into narrator turn
The `drainTts()` finally block now records `ttsFinishedAt` and checks if `state.narratorTurn.state === "awaiting_tts_end"`. If so, it calls `_wo10hTransitionToArmed()` which: starts recording, arms the timeout, suppresses idle, and syncs the UI.

### How timeout/check-in works
Staged wait model: 0–45s silent wait, 45s subtle visual cue (IdleCue), 60s one gentle check-in via `sendSystemPrompt()`. The check-in says "Take your time. I'm here when you're ready." — no questions, no nudges, no pressure. Fires only once per claimed turn (`checkInFired` guard). Narrator typing/speaking activity resets the timeout deadline.

## 4. Bug Panel Extension Summary

### Turn-state fields added
- `turn_state`: Current state machine value (idle/awaiting_tts_end/armed_for_narrator/recording/timeout_check)
- `tts_active`: Whether `isLoriSpeaking` is true
- `tts_finished_at`: Timestamp of last TTS completion
- `narrator_turn_claimed`: How long ago the narrator claimed the floor
- `interruptions_blocked_by`: Reason string ("narrator_claimed_turn" or "none")
- `pending_timeout_at`: Seconds until timeout check-in fires

### How they are populated
All read directly from `state.narratorTurn` and `isLoriSpeaking` in the `lv10dRefreshBugPanel()` function. Auto-refreshes every 2s while panel is open.

## 5. LLM Tuning Harness Summary

### How the 1000-word test works
The test harness stores 4 narrator samples as frontend constants in `test-harness.js`. The operator selects a sample and clicks "Run Test". The sample text is injected into `chatInput` and submitted via `sendUserMessage()`. After 15s extraction delay, the auto-scoring engine reads `state.interviewProjection.fields` and scores against the 28-field rubric.

### How results are scored
Fuzzy matching: each rubric field's expected value is split into tokens (>2 chars). The engine searches all extracted projection values and profile basics for these tokens. A field scores as "hit" if >= 50% of expected tokens are found. Category scores (Identity, Parents, Siblings, Education, Career, Relationships, Children, Life Events, Narrative) are computed separately. Quality tiers: 24–28 Excellent, 18–23 Good, 12–17 Weak, <12 Broken.

### How repeat/clear works
- **Clear**: Removes projection fields, pending extraction, and 7 localStorage keys — but ONLY for the test PID (`__test_harness_narrator_001`). Real narrator data is untouched.
- **Repeat**: Calls clear, then reruns the last sample with current LLM settings.
- **Golden Baseline**: Saves the best run. Comparison table marks it with `*`. Future runs can be compared against it.

### Sample-specific expected scores
- Clean: 24–28 (Excellent)
- Messy: 22–26 (Good)
- Emotional: 18–24 (Good)
- Fragmented: 12–18 (Acceptable)

## 6. Validation Results

| # | Test | Result |
|---|------|--------|
| 1 | Turn claim during TTS | PASS |
| 2 | Capture starts only after TTS ends | PASS |
| 3 | Interruption blocking during narrator claim | PASS |
| 4 | Send ends claimed turn | PASS |
| 5 | Timeout check-in (60s, one gentle prompt, fires once) | PASS |
| 6 | Bug Panel turn-state visibility (6 fields) | PASS |
| 7 | Test narrator run (4 samples) | PASS |
| 8 | LLM tuning comparison (ctx/temp/tokens + table) | PASS |
| 9 | Clear test data (safe, test PID only) | PASS |
| 10 | Repeatability (clear → rerun → compare) | PASS |
| 11 | Focus Canvas compatibility (shares toggleRecording) | PASS |
| 12 | No regressions (WO-10D/E/F/G intact) | PASS |

## 7. Observations and Bug Reports

- **Timeout timing**: The 60s check-in may feel fast for elderly narrators in Cognitive Support Mode. Consider extending to 120s when CSM is active. Currently WO-10H uses fixed timing regardless of CSM state.
- **TTS chunk gap**: If TTS has a brief gap between chunks (network latency), the narrator could theoretically mic-click during the gap and get the "claim" path even though another chunk is about to play. This is unlikely in practice since `isLoriSpeaking` stays true across the entire drain loop.
- **Focus Canvas visual**: When narrator claims turn via Focus Canvas, the Focus Canvas overlay doesn't show a "Claiming..." state. The header mic button shows it, but Focus Canvas uses its own visual states.
- **Extraction delay**: The 15s scoring delay after test run is a fixed estimate. If the backend is slow, extraction may not be complete. A more robust approach would poll for extraction completion.
- **Cleanup scope**: `clearTestData()` only clears frontend state and localStorage. If the test text was actually sent to the backend and stored in transcript history, that backend data persists. For complete isolation, the backend would need a test-mode transcript purge endpoint.

## 8. Final Status

**PASS**

The narrator turn-claim contract works end-to-end: mic click during TTS claims the floor, TTS completion transitions to armed recording, Lori yields with no interruptions, send releases the claim, timeout produces one gentle check-in. The test harness provides repeatable 28-field scoring across 4 narrator styles with comparison table and golden baseline support. All 12 validation tests pass with no regressions to existing WO-10D/E/F/G functionality.
