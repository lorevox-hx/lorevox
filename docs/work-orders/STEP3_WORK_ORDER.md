# Lorevox Step 3 — Runtime Polish & Stabilization
## Work Order

**Status:** Ready to begin
**Scope:** Runtime hardening only. No new Bio Builder architecture. Phase F is complete.

---

## Framing

Step 3 is a stabilization and readiness pass. The goal is to make Lorevox work reliably for real older users on real hardware — correct mic/TTS behavior, readable text, accurate device context, smooth onboarding, and a working camera path.

No new pipeline architecture. No new state layers. No new phases.

---

## Task 1 — Mic / STT vs Lori TTS leakage

**Problem:** The STT engine can transcribe Lori's own voice when TTS plays through the speaker, creating feedback-loop artifacts in the conversation.

**What exists:** `app.js` has an `isLoriSpeaking` flag (added at v7.4D) that discards recognition results while Lori is speaking and suppresses mic auto-restart. The guard is there but needs verification and hardening.

**Deliverables:**
- Audit `isLoriSpeaking` guard in `app.js` — confirm it is set before TTS audio starts and cleared reliably when TTS ends (including error paths and stream interruptions)
- Confirm `recognition.onresult` discards correctly while flag is set
- Confirm `recognition.onend` only auto-restarts when `isRecording && !isLoriSpeaking`
- Confirm the flag is reset if TTS errors mid-stream (not left stuck in speaking state)
- Add a `console.warn` diagnostic if recognition fires while `isLoriSpeaking` is true, so it is visible during testing
- Document the guard contract in a comment block at the top of the mic/STT section

**Files:** `app.js`

---

## Task 2 — Larger text for older eyes

**Problem:** `lori8.0.html` uses predominantly 11–14px font sizes throughout the UI. This is too small for older users with reduced visual acuity.

**Deliverables:**
- Audit all `font-size` declarations in `lori8.0.html` inline styles
- Audit `lori80.css` for `font-size` rules
- Increase baseline body/conversation text to minimum 16px
- Increase secondary/meta text (timestamps, labels, helper text) to minimum 14px
- Increase primary action labels and buttons to minimum 15px
- Increase any heading or title text proportionally
- Verify no layout breakage at increased sizes on a standard viewport
- Document the font-size scale used in a comment block at the top of the relevant CSS section

**Files:** `lori8.0.html`, `ui/css/lori80.css`

---

## Task 3 — Remove CDN dependencies (Floating UI)

**Problem:** `lori8.0.html` still imports two Floating UI scripts from jsDelivr:
```html
<script src="https://cdn.jsdelivr.net/npm/@floating-ui/core@1.6.4"></script>
<script src="https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.3"></script>
```
This breaks fully-offline/local-network deployments and introduces a CDN availability dependency.

**Deliverables:**
- Download `@floating-ui/core@1.6.4` and `@floating-ui/dom@1.6.3` as local vendor files into `ui/vendor/floating-ui/`
- Replace the two CDN `<script>` tags with local paths:
  ```html
  <script src="vendor/floating-ui/core.min.js"></script>
  <script src="vendor/floating-ui/dom.min.js"></script>
  ```
- Verify Golden Thread badge anchoring still works after the swap
- Confirm no other CDN URLs remain in `lori8.0.html` after this patch

**Files:** `lori8.0.html`, new `ui/vendor/floating-ui/` files

---

## Task 4 — Device date / time / timezone

**Problem:** Lori's conversation context and prompt composition do not reliably include the user's local date, time, and timezone. Responses can reference wrong times of day or omit useful temporal grounding.

**Deliverables:**
- Identify where device date/time/timezone is (or is not) currently injected into the prompt payload in `app.js`
- Add reliable injection of:
  - current local date (e.g. `Friday, March 28 2026`)
  - current local time of day (e.g. `2:14 PM`)
  - timezone name (e.g. `America/New_York` or human-readable equivalent)
- Use `Intl.DateTimeFormat().resolvedOptions().timeZone` for timezone
- Ensure this context reaches the server-side prompt in `prompt_composer.py` or equivalent
- Write a diagnostic that logs the injected device context block to console on each session start

**Files:** `app.js`, server-side prompt composer if applicable

---

## Task 5 — Optional location

**Problem:** Location is useful for Lori to contextualise responses (e.g. "It's evening in New York…") but must be strictly optional and consent-gated — never assumed.

**Deliverables:**
- Confirm that `navigator.geolocation` is only called after explicit user opt-in (not on page load)
- Confirm that if location is declined or unavailable, Lori functions normally without it
- Add a clear UI affordance in the permissions/settings panel indicating location is optional
- If location is granted, inject approximate city/region (not raw coordinates) into the Lori context payload
- Location must not be stored beyond the current session

**Files:** `app.js`, `permissions.js`

---

## Task 6 — Onboarding / consent auto-start

**Problem:** The identity-first onboarding sequence should begin automatically for new users (no saved profile) and should not require manual triggering. The consent gate (facial-consent.js) should appear at the right moment in the flow.

**Deliverables:**
- Audit `app.js` onboarding entry point — confirm that a new session with no saved profile automatically starts the identity onboarding flow (`setAssistantRole("onboarding")` path)
- Confirm returning users bypass onboarding and go straight to resume
- Confirm `facial-consent.js` is shown at the correct point (before any camera access, after initial greeting)
- Confirm the consent decision is persisted correctly in `state` and respected on subsequent sessions
- Identify and fix any path where onboarding silently fails to start or gets stuck
- Write a short test plan for the full new-user flow

**Files:** `app.js`, `facial-consent.js`

---

## Task 7 — Camera preview restoration

**Problem:** The camera preview (used during affect-aware mode) may not restore correctly after interruptions — e.g. tab switch, popover open, mic toggle, or TTS playback.

**Deliverables:**
- Audit the camera stream lifecycle in `app.js`, `facial-consent.js`, and `permissions.js`
- Identify any path where `getUserMedia` stream is acquired but not released on session end, or where the preview element loses its `srcObject` without reacquiring
- Fix stream restoration after visibility/focus change if broken
- Confirm that camera-off state (`cameraOff` / null visual signal) is correctly communicated to the prompt layer
- Add a `console.warn` if the stream is expected but `srcObject` is null on page focus

**Files:** `app.js`, `facial-consent.js`, `permissions.js`, `affect-bridge.js`

---

## Task 8 — Regression testing and reporting

**Deliverables:**
- After all above tasks are complete, run a structured regression pass covering:
  - New user onboarding flow (no saved profile)
  - Returning user flow (saved profile, bypass onboarding)
  - Mic on / Lori speaks / mic does not transcribe Lori
  - Camera consent → affect mode on → camera off → graceful fallback
  - Date/time/timezone visible in Lori's first contextual response
  - Location opted out → no location in context
  - UI readable at new font sizes (spot check)
  - Golden Thread badge anchoring working (Floating UI local)
  - No console errors on clean load
- Write `STEP3_TEST_REPORT.md` with pass/fail/inspected results for each check

**Files:** `docs/STEP3_TEST_REPORT.md` (to be created)

---

## Explicit constraints for Step 3

1. **No new Bio Builder architecture.** Phase F is complete. Step 3 is runtime polish only.
2. **No new state layers, phases, or pipeline stages.**
3. **No CDN additions.** The Floating UI fix removes a CDN dependency; nothing new may add one.
4. **No changes to `state.archive`, `state.facts`, or `state.timeline.spine`** as part of this pass.
5. **Truth isolation from Phase D/E/F is preserved.** Step 3 does not touch the Bio Builder pipeline.

---

## Files Step 3 will touch

| File | Task(s) |
|------|---------|
| `ui/lori8.0.html` | 2, 3 |
| `ui/css/lori80.css` | 2 |
| `ui/js/app.js` | 1, 4, 5, 6, 7 |
| `ui/js/facial-consent.js` | 6, 7 |
| `ui/js/permissions.js` | 5, 7 |
| `ui/js/affect-bridge.js` | 7 |
| `ui/vendor/floating-ui/` (new) | 3 |
| `docs/STEP3_TEST_REPORT.md` (new) | 8 |

---

## Files to review after Step 3

Per the architect review that initiated this work order, the following files should be shared for verification after Step 3 is complete:

- `lori8.0.html`
- `app.js`
- `emotion.js`
- `emotion-ui.js`
- `facial-consent.js`
- `permissions.js`
- `affect-bridge.js`
- mic/STT logic section of `app.js`
- `STEP3_TEST_REPORT.md`
