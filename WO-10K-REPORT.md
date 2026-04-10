# WO-10K — Health Route, Transcript Route, Resume URL, and TTS Unlock Repair

## 1. Runtime Reproduction Summary

### Failing callers found

| Caller | Location | What it polls | Expected | Actual |
|--------|----------|---------------|----------|--------|
| `lv10dRefreshBugPanel()` API health | app.js:4909 | `ORIGIN + "/api/health"` | 200 | 404 — no `/api/health` route on API server |
| `lv10dRefreshBugPanel()` TTS health | app.js:4912 | `TTS_ORIGIN + "/health"` (falls back to `ORIGIN.replace(":8000",":8001") + "/health"`) | 200 | 404 — wrong variable name (`TTS_ORIGIN` undefined, should be `TTS_ORIG`) AND wrong path (`/health` vs `/api/health`) |
| `lv10dCheckRoutes()` health | app.js:4940 | `ORIGIN + "/api/health"` | 200 | 404 — same as above |
| `lv10dRefreshBugPanel()` rolling-summary | app.js:4898 | `ORIGIN + "/api/transcript/rolling-summary?person_id=..."` GET | 200 | 404 — route exists in source but not available at runtime |
| `lv10dRefreshBugPanel()` recent-turns | app.js:4902 | `ORIGIN + "/api/transcript/recent-turns?person_id=..."` GET | 200 | 404 — same |
| Auto-resume confidence fetch | app.js:4318 | `` `${API.RESUME_PREVIEW}?person_id=...` `` | 200 | 404 — `API.RESUME_PREVIEW` is a function, not a string. Stringified to `(pid) => \`${ORIGIN}/api/transcript/resume-preview?...\`` producing malformed URL |

### Which failures were caller bugs vs backend bugs

- **API health 404**: Caller bug — no `/api/health` route existed on API server. Fixed by adding route AND pointing caller at `/api/ping`.
- **TTS health 404**: Caller bug — wrong variable name (`TTS_ORIGIN` instead of `TTS_ORIG`) AND wrong path (`/health` instead of `/api/health`). TTS server has `/api/health` at `tts_service.py:36`.
- **Resume-preview malformed URL**: Caller bug — function treated as string at app.js:4318.
- **Transcript route 404s**: Backend issue — routes exist in source code, module compiles, archive functions exist, router is mounted in main.py. All code is syntactically correct. Most likely cause: **server needs restart** to pick up WO-9/WO-10 route additions. See Root Cause Analysis below.

---

## 2. Root Cause Analysis

### TTS health 404

**Cause**: Two bugs in one line (app.js:4912):
1. Variable name mismatch: `TTS_ORIGIN` is undefined. The actual constant defined in api.js is `TTS_ORIG`.
2. Path mismatch: Bug Panel polled `/health` but TTS server's health route is `/api/health` (tts_service.py:36-38).

The expression `typeof TTS_ORIGIN !== "undefined"` always evaluated to false, falling back to `ORIGIN.replace(":8000", ":8001") + "/health"` = `http://localhost:8001/health`, which doesn't exist.

### API health 404

**Cause**: Bug Panel polled `ORIGIN + "/api/health"` but API server (main.py) had no `/api/health` route. The only health-like route was `/api/ping` in ping.py.

### Transcript route 404s

**Cause**: The transcript.py source file contains all routes (rolling-summary at line 282, recent-turns at line 340, update-threads at line 319, resume-preview at line 356). The archive.py module exports all required functions. The router is mounted in main.py at line 102.

Static analysis confirms:
- `transcript.py` syntax: PASS
- `archive.py` syntax: PASS
- All imported functions exist in archive.py
- Router prefix `/api/transcript` is correct
- Route decorator paths match frontend expectations

**Why they 404 at runtime**: The WO-8 routes (history, sessions, export, thread-anchor) work because they were present when the server was last started. The WO-9 routes (rolling-summary, recent-turns) and WO-10 routes (update-threads, resume-preview, session-timeline) were added to the source file AFTER the last server start. The server runs `uvicorn code.api.main:app` WITHOUT `--reload` (launchers/hornelore_run_gpu_8000.sh:49), so it does not pick up source changes.

**Fix required**: Restart the API server. No code change needed — the routes are correctly defined. Cleared stale `__pycache__/archive.cpython-310.pyc` to ensure clean bytecode on next startup.

### Malformed resume-preview URL

**Cause**: At app.js:4318, the code was:
```javascript
const r = await fetch(`${API.RESUME_PREVIEW}?person_id=${encodeURIComponent(pid)}`);
```

`API.RESUME_PREVIEW` is defined in api.js:74 as a **function**:
```javascript
RESUME_PREVIEW: (pid) => `${ORIGIN}/api/transcript/resume-preview?person_id=${encodeURIComponent(pid)}`
```

Using it in a template literal stringifies the function definition, producing:
```
(pid) => `http://localhost:8000/api/transcript/resume-preview?person_id=${encodeURIComponent(pid)}`?person_id=actual_pid
```

This is the exact malformed URL seen in logs: `GET /ui/(pid)%20=%3E%20%60$%7BORIGIN%7D/api/transcript/resume-preview?...`

Note: The correct usage exists at app.js:3465: `fetch(API.RESUME_PREVIEW(pid), ...)`.

### TTS autoplay / audible issue

**Cause**: Chrome's autoplay policy blocks `audio.play()` until a user gesture has occurred. The existing `unlockAudio()` function (app.js:2888) created an Audio element and played silence, but:
1. It did NOT create an `AudioContext`, which is the primary mechanism Chrome uses for autoplay gating.
2. It was only called from `sendUserMessage()` and `toggleRecording()` — NOT on first page interaction.
3. If TTS was triggered before the user clicked Send or Mic (e.g., auto-greeting), `audio.play()` would hang, `drainTts()` would never resolve, and `isLoriSpeaking` would be stuck true permanently.
4. The WO-10J 15-second timeout prevented permanent lockup but introduced a 15-second dead period on every blocked playback.

---

## 3. Files Changed

### `ui/js/app.js` — 4 changes

1. **Lines 2888-2925**: Upgraded `unlockAudio()` to create and resume an `AudioContext`. Added global first-interaction listener (click/touchstart/keydown) so audio unlocks on ANY user gesture, not just Send/Mic.

2. **Lines ~2997-3004** (in `drainTts()`): Added pre-play check — if `_audioUnlocked` is false, skip the chunk instead of hanging. Also attempts `AudioContext.resume()` before each play.

3. **Line 4318**: Fixed `${API.RESUME_PREVIEW}` → `API.RESUME_PREVIEW(pid)` (call function instead of stringify).

4. **Lines 4909-4914**: Fixed Bug Panel health polling:
   - API: `ORIGIN + "/api/health"` → `ORIGIN + "/api/ping"`
   - TTS: `(typeof TTS_ORIGIN !== "undefined" ? TTS_ORIGIN : ORIGIN.replace(":8000", ":8001")) + "/health"` → `TTS_ORIG + "/api/health"`

5. **Line 4940**: Fixed route check: `ORIGIN + "/api/health"` → `ORIGIN + "/api/ping"`, label "health" → "ping".

### `server/code/api/routers/ping.py` — 1 change

Added `/api/health` route for API server consistency with TTS server. Both services now respond to `/api/health`.

### `server/code/api/__pycache__/archive.cpython-310.pyc` — deleted

Cleared stale bytecode to ensure clean recompilation on next server startup.

---

## 4. Fix Summary

### Health endpoint fixes

| Service | Before | After |
|---------|--------|-------|
| API Bug Panel health | Polls `ORIGIN + "/api/health"` → 404 | Polls `ORIGIN + "/api/ping"` → 200. Also added `/api/health` route to ping.py for future consistency. |
| TTS Bug Panel health | Polls `TTS_ORIGIN + "/health"` (wrong var + wrong path) → 404 | Polls `TTS_ORIG + "/api/health"` → 200 (route exists at tts_service.py:36) |
| Route check | Lists `ORIGIN + "/api/health"` as "health" | Lists `ORIGIN + "/api/ping"` as "ping" |

### Resume-preview URL fix

| Before | After |
|--------|-------|
| `` `${API.RESUME_PREVIEW}?person_id=${encodeURIComponent(pid)}` `` (stringifies function) | `API.RESUME_PREVIEW(pid)` (calls function, returns proper URL) |

### TTS audio unlock fix

| Component | Before | After |
|-----------|--------|-------|
| `unlockAudio()` | Creates Audio, plays silence. No AudioContext. | Creates AudioContext + resumes it. Creates Audio + plays silence. Logs success/failure. |
| Global listener | None — only called from Send/Mic | Added click/touchstart/keydown listeners on document (capture phase). Removed after first trigger. |
| `drainTts()` pre-check | None — attempts play even if blocked | Checks `_audioUnlocked`. If false, skips chunk with console warning instead of hanging. Attempts `AudioContext.resume()` before each play. |
| Timeout safeguard | 15s timeout (WO-10J) | Kept as fallback. Now should rarely trigger since audio is unlocked on first gesture. |

### Transcript route fix

No code change to transcript.py or archive.py — both are correct. **Server restart required** to load WO-9/WO-10 routes that were added after last startup.

---

## 5. Validation Results

**Note**: Both API (port 8000) and TTS (port 8001) servers returned connection refused (HTTP 000) during this session. Live browser testing was not possible. Results below are based on static verification and code path analysis.

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | TTS health polling | **PASS (code fix verified)** | `TTS_ORIG + "/api/health"` correctly targets tts_service.py:36. Variable name and path both fixed. Syntax verified. |
| 2 | API health polling | **PASS (code fix verified)** | `ORIGIN + "/api/ping"` targets existing ping.py route. Also added `/api/health` to ping.py. Both syntax verified. |
| 3 | Transcript rolling-summary | **BLOCKED — needs server restart** | Route exists in source (transcript.py:282). Archive function exists (archive.py:340). Server restart will register it. |
| 4 | Transcript recent-turns | **BLOCKED — needs server restart** | Route exists in source (transcript.py:340). Archive function exists (archive.py:844). |
| 5 | Transcript update-threads | **BLOCKED — needs server restart** | Route exists in source (transcript.py:319). Archive function exists (archive.py:569). |
| 6 | Resume-preview URL | **PASS (code fix verified)** | `API.RESUME_PREVIEW(pid)` properly calls the function. No more stringified function in URL. |
| 7 | Bug Panel truth | **PASS (code fix verified)** | All Bug Panel health checks now target real routes. Rolling-summary and recent-turns checks will work after server restart. |
| 8 | Typed hello | **CANNOT TEST** | Server not running. No code changes affect chat path — should not regress. |
| 9 | Mic path | **CANNOT TEST** | Server not running. `unlockAudio()` is still called from `toggleRecording()`. No regression expected. |
| 10 | Audible TTS | **CANNOT TEST (fix applied)** | AudioContext unlock + global listener implemented. Pre-play check prevents hang. Timeout kept as fallback. Requires live browser test to confirm audibility. |

---

## 6. Remaining Issues

### Must do (next server restart)

1. **Restart API server** — Required for transcript routes (rolling-summary, recent-turns, update-threads, resume-preview, session-timeline) to become available. No code change needed; routes are already correctly defined.

### Should verify after restart

2. **Audible TTS** — The AudioContext + global listener fix is the correct approach per Chrome autoplay policy. Must be verified live with: page load → click anything → trigger TTS → confirm audio plays.

3. **Bug Panel 404 spam** — After server restart and health fix deployment, the 2-second polling interval should produce clean 200s instead of 404s. If polling volume is still too high, consider increasing interval to 5s.

### Pre-existing (not in WO-10K scope)

4. **Trainer-to-interview transition** — `lv80StartTrainerInterview()` → `renderInterview()` hits null element (WO-11 issue, pre-existing).

5. **TTS `/health` on API server** — Now added via ping.py. If TTS module is mounted on API server (USE_TTS=1), the TTS router's health may conflict. Low risk since USE_TTS is normally 0.

---

## 7. Final Status

### **PASS WITH ISSUES**

**Fixes applied and syntax-verified**: 5 code changes across 2 files (app.js, ping.py). All target the exact broken callers identified from live evidence.

**Primary blocker for full PASS**: Services not running — cannot perform live validation. Server restart is required for transcript routes.

**Audio unlock**: Properly implemented with AudioContext + global gesture listener + pre-play guard in drainTts(). This is the correct Chrome autoplay fix. The WO-10J 15s timeout is retained as an edge-case fallback. Live browser test needed to confirm audibility.

**Confidence level**: HIGH that all fixes are correct. The root causes are unambiguous (wrong variable name, wrong path, function-as-string, missing AudioContext). The transcript route 404s are explained by stale server state, not code bugs.
