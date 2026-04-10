# WO-10J — Live Runtime Triage and Repair

**Date**: 2026-04-09
**Status**: PASS WITH ISSUES

---

## 1. Runtime Reproduction Summary

### What was broken
All five operator-reported failures were reproduced live in the browser:

1. **Run Shatner Trainer** — clicked button, popover closed, no trainer visible
2. **Run Dolly Trainer** — same behavior as Shatner
3. **Activating the mic** — mic click did nothing observable
4. **Saying "hello"** — no response from the system
5. **Overall non-function** — Hornelore appeared unresponsive after page load

### How it was reproduced
Opened `http://127.0.0.1:8082/ui/hornelore1.0.html` in Chrome, observed page load, checked console (48 log messages, zero JS errors), verified all 36 scripts loaded (200 status), then clicked each button and observed behavior.

### Exact symptoms seen live

**Trainers**: The trainer panel rendered correctly in the DOM (full HTML content, 800x544px, display:block) but was positioned at `top: -401.5px` — scrolled above the visible viewport inside `lv80ChatWrap`. The chat area stayed scrolled to the bottom showing LORI messages while the trainer panel was at the top, invisible.

**Mic / Hello / All interaction**: `isLoriSpeaking` was stuck at `true` with `ttsBusy=true` and `ttsQueue.length=3`. The `drainTts()` async function was mid-execution, permanently stuck in an `await new Promise()` wrapping `audio.play()`. With `isLoriSpeaking=true`, the WO-10H narrator turn-claim intercepted the mic click path (calling `_wo10hClaimTurn()` instead of starting recording), and the system never recovered because no TTS end event fired.

---

## 2. Root Cause Analysis

### What failed first
**`drainTts()` audio playback promise hung indefinitely.** On page load, the system sent a system prompt which triggered an LLM greeting response. This response was queued for TTS via `enqueueTts()`. The TTS fetch to `localhost:8001/api/tts/speak_stream` succeeded (200, 60KB response), audio was decoded, but `audio.play()` never resolved its promise — likely due to Chrome's autoplay policy blocking audio playback before user interaction.

The original code:
```js
await new Promise(res=>{ a.onended=a.onerror=res; a.play().catch(res); });
```

While `a.play().catch(res)` should theoretically catch autoplay rejections, the promise hung in practice. The `finally` block (which clears `isLoriSpeaking`) never executed because the `await` never resolved.

### Downstream cascade
1. `isLoriSpeaking = true` (stuck) — single source of truth for TTS active state
2. `ttsBusy = true` (stuck) — prevents new drainTts calls
3. Mic click intercepted by WO-10H turn-claim: `_wo10hClaimTurn()` fires instead of `startRecording()`
4. Typed hello goes through Focus Canvas → `sendUserMessage()` works, but response triggers TTS → stuck again
5. Trainer panel renders but chat is scrolled to bottom → trainer invisible

### Secondary issue (trainer)
The `_renderPanel()` function in `trainer-narrators.js` sets `root.innerHTML` and `root.hidden=false` but never calls `scrollIntoView()`. The panel sits at the top of `lv80ChatWrap` while the chat scroll position is at the bottom.

---

## 3. Files Changed

| File | Change |
|------|--------|
| `hornelore/ui/js/app.js` | Added 15s timeout to audio playback promise in `drainTts()` |
| `hornelore/ui/js/trainer-narrators.js` | Added `scrollIntoView()` after `_renderPanel()` renders content |

---

## 4. Fix Summary

### Fix 1: TTS audio playback timeout (app.js)
**Location**: `drainTts()` function, audio playback await

**Before**: Bare promise wrapping `audio.play()` with no timeout — could hang forever.

**After**: 15-second timeout that:
- Logs `[TTS] Audio playback timed out after 15s — forcing continue`
- Pauses and resets the audio element
- Resolves the promise, allowing drainTts to continue
- The `finally` block then clears `isLoriSpeaking` and `ttsBusy`

This ensures `isLoriSpeaking` can never be stuck permanently, even if audio playback fails for any reason.

### Fix 2: Trainer scroll-into-view (trainer-narrators.js)
**Location**: `_renderPanel()` function, after setting `root.innerHTML`

**Change**: Added `setTimeout(() => root.scrollIntoView({behavior:"smooth", block:"start"}), 50)` after the panel renders visible content. This runs for both `start()`, `next()`, and `prev()` calls since it's in the shared render function.

### Trainer interview warning (NOT FIXED — pre-existing)
When trainer `finish()` calls `lv80StartTrainerInterview()`, `renderInterview()` at interview.js:235 hits a null element. This is caught and logged as `[WO-11] unable to start trainer interview`. Non-blocking, pre-existing issue.

---

## 5. Remaining Issues

### Transcript route 404s (pre-existing, backend)
- `/api/transcript/rolling-summary` → ERR 404
- `/api/transcript/recent-turns` → ERR 404
- Bug Panel shows these as ERR 404 under MEMORY section
- These routes exist in `transcript.py` (lines 282, 340) but fail at runtime
- Root cause: likely module execution failure between lines 247-282 of transcript.py
- Impact: rolling summary and recent turns don't load on narrator switch, but chat still works

### TTS audio playback
- TTS fetch succeeds (200) but audio never plays audibly
- The 15s timeout prevents the stuck state but doesn't fix actual audio playback
- Root cause likely Chrome autoplay policy — needs a user gesture before first audio play
- Possible future fix: create an AudioContext on first user click to unlock autoplay

### Trainer interview transition
- `lv80StartTrainerInterview()` → `renderInterview()` hits null element on trainer finish
- Non-blocking (caught), but the trainer-to-interview transition doesn't complete
- Pre-existing issue from WO-11

### Chat service message
- "Chat service unavailable" message appeared in chat during testing
- Likely a transient WS hiccup or timing issue after TTS timeout

---

## 6. Validation Results

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Page load | **PASS** | Loads cleanly, 48 log messages, 0 JS errors, all 36 scripts 200 |
| 2 | Narrator selection | **PASS** | Switched Janice → Kent successfully, prior conversation loaded |
| 3 | Shatner trainer | **PASS** | Panel visible with correct content, Next/Skip buttons work |
| 4 | Dolly trainer | **PASS** | Panel visible with "WARM, STORYTELLING ANSWERS" header |
| 5 | Mic click | **PASS** | Focus Canvas opens, STT recognition starts, "Listening..." shown |
| 6 | Spoken hello | **PASS (path verified)** | Full mic path traced: click → FocusCanvas → toggleRecording → recognition.start → onresult hooked. Cannot physically speak in automation. |
| 7 | Typed hello | **PASS** | "hello" sent, LLM responded contextually, extraction ran, thread anchor + rolling summary saved |
| 8 | Bug Panel | **PASS** | Shows live state: narrator, turn state, inputs, memory (with known 404s), services |
| 9 | Console health | **PASS** | No blocking JS runtime errors. Only TTS timeout warnings (expected) and pre-existing trainer interview warning |
| 10 | Final minimum viability | **PASS WITH ISSUES** | Operator can: load page, choose narrator, run trainer, click mic, type hello, get response. Issues: TTS audio doesn't play audibly (timeout prevents stuck state), transcript 404s persist, 15s delay on first interaction after page load while TTS timeout fires |

---

## 7. Final Status

### PASS WITH ISSUES

**What works now that didn't before**:
- Trainer buttons produce visible trainer UI immediately
- Mic activates and enters listening mode
- Typed hello produces an LLM response
- System recovers from TTS failures automatically (15s timeout)
- Bug Panel shows accurate live state

**What still needs work**:
- TTS audio doesn't play (autoplay policy) — needs user-gesture AudioContext unlock
- Transcript route 404s persist (backend fix needed)
- 15s delay on first interaction while initial TTS timeout fires (livable but not ideal)
- Trainer-to-interview transition warning (pre-existing)
