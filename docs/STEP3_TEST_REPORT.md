# Step 3 — Runtime Stabilization Test Report

**Project:** Lorevox 8.0
**Step:** 3 — Runtime Polish & Stabilization
**Date:** 2026-03-27
**Status:** ✅ All 8 tasks complete

---

## Overview

Step 3 is a hardening pass only. No new Bio Builder architecture was introduced. Phase F is complete and sealed. All changes are runtime polish: guard contracts, accessibility, offline resilience, context enrichment, and camera lifecycle correctness.

---

## Task Completion Summary

| # | Task | Files Changed | Status |
|---|------|---------------|--------|
| 1 | Harden STT/TTS leakage guard | `ui/js/app.js` | ✅ Done |
| 2 | Font sizes for older eyes | `ui/lori8.0.html`, `ui/css/lori80.css` | ✅ Done |
| 3 | Vendor Floating UI locally | `ui/vendor/floating-ui/`, `ui/lori8.0.html` | ✅ Done |
| 4 | Device date/time/timezone in runtime payload | `ui/js/app.js` | ✅ Done |
| 5 | Optional consent-gated location | `ui/js/app.js`, `ui/js/permissions.js`, `ui/js/state.js`, `ui/lori8.0.html` | ✅ Done |
| 6 | Onboarding auto-start audit & fixes | `ui/js/app.js`, `ui/js/state.js` | ✅ Done |
| 7 | Camera stream lifecycle fixes | `ui/js/emotion.js`, `ui/js/emotion-ui.js` | ✅ Done |
| 8 | This report | `docs/STEP3_TEST_REPORT.md` | ✅ Done |

---

## Task 1 — STT/TTS Feedback-Loop Guard

**Problem:** `drainTts()` set `isLoriSpeaking = false` in the regular code path but inside a bare `catch{}` with no `finally`. If an unexpected exception escaped the inner loop, `isLoriSpeaking` would be stuck `true` forever, permanently suppressing all voice input — silently and irreversibly.

**Fix applied:** Wrapped the entire `while(ttsQueue.length)` loop in a `try { ... } finally { isLoriSpeaking=false; ttsBusy=false; }` block so the flags are always cleared on exit regardless of the exit path.

**Additional hardening:**
- Added `console.warn("[STT guard] Recognition fired while isLoriSpeaking=true — result discarded.")` in `recognition.onresult` so feedback-loop events are visible in DevTools during testing.
- Added a full guard-contract comment block at the top of the VOICE INPUT section documenting the invariant.

**Verification test:**
1. Start TTS playback (click Send with a long prompt).
2. Open DevTools console, watch for `[STT guard]` messages — there should be none unless the mic fires during speech.
3. After TTS finishes, confirm microphone starts/stops normally.
4. To force test the `finally` path: pause at `drainTts` with a breakpoint and manually throw — confirm `isLoriSpeaking` is still `false` after resuming.

---

## Task 2 — Font Sizes

**Problem:** Primary text throughout the UI was 11–13px — too small for the target demographic (older adults, people with vision impairments).

**Scale applied:**

| Role | Before | After | Where |
|------|--------|-------|-------|
| Main conversation bubbles (`.bubble`, `.bubble-body`) | 18px | 18px | `layout.css` — already good, unchanged |
| System bubbles (`.bubble-sys`) | 13px !important | 16px !important | `lori80.css` |
| Speaker labels (`.bubble-speaker`) | 11px | 14px | `lori80.css` |
| Segmented control pills (`.seg-pill`) | 12px | 14px | `lori80.css` |
| Golden Thread badge | 11px | 14px | `lori80.css` |
| Memoir section headings | 11px | 14px | `lori80.css` |
| Memoir placeholder text | 13px | 14px | `lori80.css` |
| Memoir fragment note | 11px | 14px | `lori80.css` |
| Memoir action buttons | 13px | 15px | `lori80.css` |
| Peek at Memoir button | 13px | 15px | `lori80.css` |
| New Narrator button | 12px | 14px | `lori8.0.html` |
| Posture badge | 11px | 14px | `lori8.0.html` |
| Brand version tag | 11px | 14px | `lori8.0.html` |
| Threads hint / editor hint | 13px | 14px | `lori8.0.html` |
| Bio Control Center button | 13px | 15px | `lori8.0.html` |
| Chat input (`#chatInput`) | 15px | 15px | `lori8.0.html` — already good |
| Send button | 15px | 15px | `lori8.0.html` — already good |
| Memoir body (`.scroll-body`) | 17px | 17px | `lori80.css` — already good |

**Rule enforced:** Nothing below 14px for any user-facing text. Decorative elements (icons, dots) are excluded.

**Verification test:** Open `lori8.0.html` in Chrome, open DevTools → Elements, inspect each element type listed above and confirm `font-size` matches the After column.

---

## Task 3 — Floating UI CDN Removal

**Problem:** `lori8.0.html` loaded `@floating-ui/core` and `@floating-ui/dom` from `cdn.jsdelivr.net` — a hard CDN dependency that breaks in offline environments and introduces a runtime failure mode if the CDN is down.

**Fix applied:** Wrote purpose-built `ui/vendor/floating-ui/core.min.js` and `ui/vendor/floating-ui/dom.min.js` that expose the exact API surface Lorevox uses:

- `window.FloatingUICore` — `offset`, `flip`, `shift` middleware primitives
- `window.FloatingUIDOM` — `computePosition`, `autoUpdate`, `offset`, `flip`, `shift`

The implementation covers the exact call pattern used by the Golden Thread badge anchoring:
```js
computePosition(badge, popover, {
  placement: "left-start",
  middleware: [offset(20), flip(), shift({ padding: 10 })]
})
autoUpdate(reference, floating, updateFn) → cleanup()
```

CDN `<script>` tags at lines 13–14 of `lori8.0.html` replaced with local `vendor/` paths.

**Verification test:**
1. Open `lori8.0.html` with network offline (Chrome DevTools → Network → Offline).
2. Click the golden thread badge on any memoir thread.
3. Confirm the popover anchors correctly to the badge position.
4. Confirm no `net::ERR_INTERNET_DISCONNECTED` errors in the console.

---

## Task 4 — Device Context in Runtime Payload

**Problem:** `buildRuntime71()` sent no date, time, or timezone to the backend. Lori could not ground responses temporally ("this morning", "last Tuesday", "it's evening") without this.

**Fix applied:** Added `device_context` block to the `buildRuntime71()` return value:

```js
device_context: {
  date:     new Intl.DateTimeFormat("en-US", { weekday:"long", year:"numeric",
              month:"long", day:"numeric" }).format(new Date()),
  time:     new Intl.DateTimeFormat("en-US", { hour:"numeric",
              minute:"2-digit", hour12:true }).format(new Date()),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}
```

Values are computed fresh on every call so they stay current across a long session. A diagnostic `console.log("[device_context]", _dc)` logs the block on every page load.

**Verification test:**
1. Open `lori8.0.html`, open DevTools → Console.
2. On load, confirm `[device_context]` log appears with correct date, time, and local timezone.
3. Send a message to Lori. In the Network tab, inspect the WebSocket `start_turn` payload. Confirm `runtime71.device_context` is present with the correct values.

---

## Task 5 — Optional Consent-Gated Location

**Problem:** Lori had no way to know the user's general location, limiting contextual responses (local time of day, regional references). No location UI or consent flow existed.

**Design constraints (all met):**
- Location is **never requested on page load or automatically**.
- Only `navigator.geolocation` is called — never directly reading IP or system data.
- Only city/region string is stored — raw coordinates are never stored or sent.
- Location lives in `state.session.locationContext` (in-memory only, cleared on page reload).
- `location_context` in `buildRuntime71()` is `null` when not shared — `prompt_composer.py` must never assume it is present.

**Implementation:**
- `state.js`: Added `let permLocOn = false;`
- `permissions.js`: Added `togglePermLoc()`, `requestOptionalLocation()`, `clearOptionalLocation()`, `_lv80UpdateLocStatus()`. Geolocation is called only from `requestOptionalLocation()`. Reverse geocoding uses BigDataCloud's free client-side API (no API key required).
- `app.js` `buildRuntime71()`: Added `location_context: state.session?.locationContext || null`
- `lori8.0.html`: Added `#lv80SettingsPopover` with location opt-in UI, CSS, and `toggleSettings()` function. The gear icon in the header now opens this panel.
- `lori8.0.html`: Added `#permCard` shim (hidden) so `interview.js` doesn't throw when it attempts to show the legacy permission card.

**Guard contract:**
```
navigator.geolocation is NEVER called except from requestOptionalLocation()
requestOptionalLocation() is ONLY reachable via user clicking "Share my location"
location_context is null unless the user explicitly clicked and confirmed
```

**Verification test:**
1. Open `lori8.0.html`, click the gear icon → Settings popover opens.
2. Confirm "Not shared this session" shows.
3. Click "Share my location" → browser shows permission prompt.
4. Deny permission → confirm error message shows, location stays null.
5. Allow permission → confirm city/region label appears.
6. Send a message; confirm `runtime71.location_context` is populated in the WS payload.
7. Reload the page → confirm location is cleared (session-scoped).

---

## Task 6 — Onboarding Auto-Start Audit

**Findings:**

| Check | Result | Notes |
|-------|--------|-------|
| Auto-start for new users wired | ✅ | `setTimeout(startIdentityOnboarding, 800)` in `window.onload` |
| Returning users bypass onboarding | ✅ | `loadPerson(saved)` path skips `startIdentityOnboarding` |
| `state.session` initialized before `startIdentityOnboarding()` | ✅ | `state.js` always initializes `state.session` on load |
| `FacialConsent.request()` shown before camera | ✅ | Called inside `startEmotionEngine()` — only triggered by explicit user opt-in |
| Consent is session-scoped | ✅ | `FacialConsent._consentGranted` is in-memory only, never persisted |
| `identityPhase` initial value | ⚠️ **Fixed** | Duplicate key bug: `state.session` had two `identityPhase` declarations — `"incomplete"` at line 46 and `null` at line 89. Last-write wins in JS, so it was always `null`. `getIdentityPhase74()` handled null gracefully (it has the fallback logic), but the duplicate was confusing and a latent risk. Removed the shadowed `"incomplete"` entry. |
| Back-compat guard in `window.onload` | ⚠️ **Fixed** | Guard checked `=== undefined` but `identityPhase` is `null` — guard never fired. Replaced with explanatory comment documenting why null is the correct value for both paths. |

**Additional change:** Added `console.log("[onboarding] startIdentityOnboarding() — new user path, phase=askName")` at the top of `startIdentityOnboarding()` as a diagnostic marker.

**Verification test:**
1. Clear localStorage (DevTools → Application → Local Storage → Clear).
2. Reload `lori8.0.html`.
3. Confirm console shows `[onboarding] startIdentityOnboarding()`.
4. Confirm Lori introduces herself and asks for the user's name within 2 seconds.
5. Provide a name, DOB, and birthplace. Confirm `identityPhase` reaches `"complete"`.
6. Reload the page — confirm returning user path fires (welcome back message, NOT re-onboarding).

---

## Task 7 — Camera Stream Lifecycle Fixes

**Bugs found:**

**Bug 1 — `cameraActive=true` set even on failed start (emotion-ui.js)**

`LoreVoxEmotion.start()` returns `false` on camera access denial — it does not throw. The outer `try/catch` in `startEmotionEngine()` was transparent to this, so `cameraActive=true` was called unconditionally after `await LoreVoxEmotion.start()`, even if the camera never started. The button showed "On" but no camera was running.

Fix: Check the return value before setting `cameraActive`. If `false`, set `emotionAware=false` and call `updateEmotionAwareBtn()`.

**Bug 2 — `_videoEl` orphaned in DOM on failed start (emotion.js)**

If `_camera.start()` threw (permission denied, hardware error, etc.), the catch block set `_active=false` and returned `false` — but left `_videoEl` still attached to `document.body`. Repeated failures (e.g., user toggling affect-aware on/off) accumulated hidden `<video>` elements in the DOM.

Fix: Added explicit cleanup of `_videoEl` and `_camera` in the `start()` catch block.

**Bug 3 — `_faceMesh` not reset on `stop()` (emotion.js)**

`LoreVoxEmotion.stop()` cleaned up `_camera` and `_videoEl` but left `_faceMesh` pointing to the old instance. On the next `init()` call, a new `FaceMesh` was created but the old one was never closed — potential resource/memory leak on repeated start/stop cycles.

Fix: Added `_faceMesh = null` to `stop()` so re-init always starts clean.

**Additional diagnostic:**

After a successful `start()`, `emotion-ui.js` now checks whether `_videoEl.srcObject` is set:
```js
if (videoEl && !videoEl.srcObject) {
  console.warn("[camera] Video element has no srcObject after start — stream may not have attached.");
}
```

**Verification test:**
1. Open `lori8.0.html`, click the Affect-aware toggle → FacialConsent dialog appears.
2. **Deny** consent → confirm camera does NOT start (`cameraActive` stays false), button shows "Off".
3. Toggle affect-aware again → consent dialog appears again (correct: session-scoped consent).
4. **Allow** consent → confirm camera starts, `[LoreVoxEmotion] Camera started` appears in console.
5. Toggle affect-aware off → confirm `[LoreVoxEmotion] Stopped.` appears; confirm no `<video>` elements remain in the DOM (inspect in Elements panel).
6. Toggle affect-aware on again → confirm camera restarts cleanly without errors.

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `ui/js/app.js` | Modified | Task 1: `finally` block in `drainTts()`, `console.warn` in `recognition.onresult`, guard contract comment; Task 4: `device_context` in `buildRuntime71()`, startup log; Task 5: `location_context` in `buildRuntime71()`; Task 6: replaced dead back-compat guard, `console.log` in `startIdentityOnboarding()` |
| `ui/css/lori80.css` | Modified | Task 2: font scale comment + all size increases |
| `ui/lori8.0.html` | Modified | Task 2: inline CSS font sizes; Task 3: CDN → local vendor; Task 5: settings popover DOM + CSS + `toggleSettings()`, permCard shim |
| `ui/vendor/floating-ui/core.min.js` | **Created** | Task 3: `window.FloatingUICore` — middleware primitives |
| `ui/vendor/floating-ui/dom.min.js` | **Created** | Task 3: `window.FloatingUIDOM` — `computePosition`, `autoUpdate`, middleware |
| `ui/js/permissions.js` | Modified | Task 5: location toggle, `requestOptionalLocation()`, geolocation guard contract |
| `ui/js/state.js` | Modified | Task 5: `permLocOn` variable; Task 6: removed duplicate `identityPhase` key, added state machine comment |
| `ui/js/emotion.js` | Modified | Task 7: `_videoEl` cleanup on failed start, `_faceMesh = null` in `stop()` |
| `ui/js/emotion-ui.js` | Modified | Task 7: check return value of `LoreVoxEmotion.start()`, `srcObject` diagnostic |

---

## Constraint Verification

| Constraint | Status |
|------------|--------|
| No new Bio Builder architecture introduced | ✅ Confirmed — zero changes to bio-*.js, bio-*.css |
| No new CDN imports added | ✅ Confirmed — Floating UI moved from CDN to local vendor |
| No new state layers | ✅ Confirmed — `locationContext` uses existing `state.session`, `permLocOn` is an existing-pattern let variable |
| Phase F sealed | ✅ Confirmed — no changes to `bio-phase-f.js`, `bio-promotion-adapters.js`, `bio-phase-f-report.js`, `bio-phase-f-test-harness.js`, `bio-control-center.js` |
| Location never auto-requested | ✅ Confirmed — `requestOptionalLocation()` only reachable via explicit user button press |
| Location never persisted | ✅ Confirmed — `state.session.locationContext` is in-memory only |
| FacialConsent shown before camera | ✅ Confirmed — `FacialConsent.request()` is the first thing `startEmotionEngine()` does after guard checks |

---

## Known Remaining Gaps (Not in Step 3 Scope)

- `prompt_composer.py` backend does not yet use `device_context` or `location_context` — Step 3 only instruments the frontend to send these fields. Backend integration is a separate task.
- Floating UI vendor implementation is a purpose-built polyfill. If Lorevox uses more Floating UI API surface in future (arrow, hide, size middleware, etc.), the vendor files will need to be updated or replaced with the full UMD bundles.
- `BigDataCloud` reverse-geocode API is a free third-party service. If it becomes unavailable, the fallback stores "Location shared (approximate)" without city/region. A future improvement could use IP-based geolocation as a secondary fallback.
