# WO-10D/E/F/G Implementation Report

## Summary

Four work orders implemented as a single bundle, adding operator-facing diagnostics, live LLM tuning, transcript route verification, and camera signal reliability to the Hornelore UI.

## Files Changed

| File | Changes |
|------|---------|
| `state.js` | Added `state.inputState` (micActive, micPaused, cameraActive, cameraConsent) |
| `hornelore1.0.html` | Added header control strip CSS (~85 lines), Bug Panel CSS (~65 lines), header control HTML (Mic/Cam/Bug Panel buttons), Bug Panel popover HTML (~90 lines with Session/Inputs/Memory/Services/LLM Tuning/Warnings/Actions sections) |
| `app.js` | Added `lv10dToggleMic()`, `lv10dToggleCamera()`, `lv10dSyncHeaderControls()`, `lv10dRefreshBugPanel()`, `lv10dCheckRoutes()`, `lv10dCopyDiag()`, `lv10dSetLlmParam()`, auto-refresh timer, 1s header sync interval. Patched both WS send paths to use tunable LLM params. Added `cameraActive` guard to `buildRuntime71()` hasFreshLiveAffect. |
| `emotion-ui.js` | `stopEmotionEngine()` now hard-clears all `state.session.visualSignals` fields and syncs `state.inputState`. `startEmotionEngine()` syncs `state.inputState` on success. |

## WO-10D: Header Controls + Bug Panel

**Header controls** — Three persistent buttons added to the header right section, before existing tool buttons:

- **Mic toggle** (`lv10dMicBtn`): Shows dot indicator (green=active, yellow=paused, gray=off). Calls real `wo8PauseListening()`/`wo8ResumeListening()`/`startRecording()`. Clears WO-11B pause flag on resume.
- **Camera toggle** (`lv10dCamBtn`): Camera ON goes through `beginCameraConsent74()` consent path — never bypasses permission. Camera OFF calls `stopEmotionEngine()`.
- **Bug Panel** (`lv10dBugBtn`): Opens popover via native Popover API.

**Bug Panel** — Live diagnostics popover, auto-refreshes every 2s while open:

- **Session**: narrator name, person_id, mode, pass/era, assistant role, LLM ready state
- **Inputs**: mic recording state, listening paused, WO-8 voice paused, camera active, emotion aware, affect state + signal age
- **Memory**: rolling-summary and recent-turns route health (live fetch)
- **Services**: API (8000), TTS (8001), WebSocket connection status
- **Warnings**: auto-detected state inconsistencies (stale signals, mic/pause conflicts, etc.)
- **Actions**: Refresh Now, Check Routes (tests 6 transcript endpoints), Copy Diagnostics (JSON to clipboard)

## WO-10E: LLM Tuning

Temperature and max_new_tokens selectors added inside the Bug Panel. Changes take effect on the next message send. Both `sendUserMessage()` and `sendSystemPrompt()` WebSocket paths read from `window._lv10dLlmParams` instead of hardcoded values.

## WO-10F: Transcript Route Verification

The Bug Panel's Memory section performs live GET requests against `/api/transcript/rolling-summary` and `/api/transcript/recent-turns` on every refresh cycle. The "Check Routes" action tests all 6 transcript endpoints (health, rolling-summary, recent-turns, history, sessions, thread-anchor) and reports status codes.

Code review confirmed all routes exist in `server/code/api/routers/transcript.py` and are properly registered in `main.py`. If 404s occur at runtime, the Bug Panel will surface them.

## WO-10G: Camera Truth Model + Visual Signal Reliability

Three fixes:

1. **Hard-clear on camera off**: `stopEmotionEngine()` now nulls all `state.session.visualSignals` fields (affectState, confidence, gazeOnScreen, blendConfidence, timestamp). Previously signals persisted after camera off and could leak into `buildRuntime71()` within the 8s stale window.

2. **Camera gate in buildRuntime71**: `hasFreshLiveAffect` now requires `cameraActive === true` in addition to timestamp freshness. This is a defense-in-depth guard — even if the hard-clear races, the runtime won't emit visual signals when the camera is off.

3. **inputState sync**: `state.inputState.cameraActive` is set true on successful camera start and false on stop, providing a single source of truth for the Bug Panel.

## Validation Results

| # | Test | Result |
|---|------|--------|
| 1 | Header controls exist in HTML | PASS |
| 2 | Mic toggle wires to real functions | PASS |
| 3 | Camera toggle enforces consent path | PASS |
| 4 | Bug Panel popover with all sections | PASS |
| 5 | Bug Panel reads real state (not fake) | PASS |
| 6 | LLM tuning params wired into WS sends | PASS |
| 7 | Route health check tests 6 endpoints | PASS |
| 8 | Visual signals cleared on camera off | PASS |
| 9 | Camera gate in buildRuntime71 | PASS |
| 10 | state.inputState exists with 4 fields | PASS |

## Manual Test Plan

1. Load page → header shows Mic / Cam / Bug Panel buttons
2. Click Mic → dot turns green, mic activates; click again → pauses
3. Click Cam → consent dialog appears (never bypasses); after consent, dot turns green
4. Turn Cam off → visual signals immediately clear (check Bug Panel Affect State = "—")
5. Open Bug Panel → all sections populated with real values, auto-refreshes
6. Change Temperature in Bug Panel → send a message → check console log for new temperature value in WS payload
7. Click "Check Routes" → see status of all 6 transcript endpoints
8. Click "Copy Diagnostics" → paste into text editor → valid JSON with all state
