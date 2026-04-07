# Lorevox 9.0 — Narrator Open Gating: Live Chrome Test Report

**Date:** April 6, 2026
**Tester:** Claude (automated live browser test via Chrome)
**Environment:** Lorevox 9.0 on laptop, backend running at localhost:8000, Chrome browser
**Page tested:** `http://localhost:8000/ui/lori9.0.html`

---

## 1. Environment

Lorevox backend was running on the laptop serving static files at port 8000. The test was conducted live in Chrome using the Claude in Chrome browser automation tools. All actions were executed against the real running app with a real backend and three existing narrators in the database: Kent James Horne, Janice Josephine Horne, and Christopher Todd Horne. All three had "DOB unknown" status (incomplete identity records).

---

## 2. Test Matrix

| Test | Narrator | Expected | Observed | Pass/Fail |
|------|----------|----------|----------|-----------|
| A. Startup neutrality | (none) | Blank chat, narrator selector opens, Lori silent | **First run:** Lori auto-started onboarding. **After fix:** Blank chat, selector opens, Lori silent | **PASS after fix** |
| B. + New narrator flow | (new) | `lv80NewPerson()` clears chat, starts onboarding, single Lori greeting | Chat cleared, single onboarding greeting from Lori | **PASS** |
| C. Open existing incomplete narrator (CTH) | Christopher Todd Horne | Classified "incomplete", explicit UI card, Lori silent | "Narrator record incomplete" card shown, missing name + DOB listed, Lori silent | **PASS** |
| D. Open existing incomplete narrator (Kent) | Kent James Horne | Same as C | Same incomplete card, Lori silent | **PASS** |
| E. Rapid-click (3x) on Kent | Kent James Horne | 1 load, 2 ignored, no stacked intros | Click 1 accepted, clicks 2+3 logged as "Open click ignored — already loading", single incomplete card | **PASS** |
| F. "Complete profile basics" button | Christopher Todd Horne | Clears incomplete card, starts onboarding, single Lori greeting | **First run:** Incomplete card remained above Lori bubble. **After fix:** Card cleared, single Lori bubble | **PASS after fix** |
| G. Regression: startup after all fixes | (none) | Blank chat, selector opens | Blank startup confirmed | **PASS** |

---

## 3. Findings

### Finding 1: Startup neutrality violation (FIXED)

**Root cause:** `_onModelReady()` in `app.js` checked `localStorage.getItem("lorevox_device_onboarded")`. When not set (which is the case on this laptop), it called `setTimeout(startIdentityOnboarding, 400)`, causing Lori to auto-greet before any narrator was selected.

**Fix:** Replaced the branching logic with unconditional startup neutrality — both new devices and returning devices now open the narrator selector on startup. Onboarding only begins when the user explicitly clicks "+ New" or "Complete profile basics."

### Finding 2: Incomplete card not cleared on deliberate onboarding (FIXED)

**Root cause:** `lv80BeginOnboardingFromIncomplete()` called `startIdentityOnboarding()` without first clearing the chat area, leaving the "Narrator record incomplete" card visible above Lori's greeting bubble.

**Fix:** Added `chat.innerHTML = ""` to `lv80BeginOnboardingFromIncomplete()` before calling `startIdentityOnboarding()`.

### Finding 3: All three existing narrators classify as incomplete

This is expected/correct behavior — all three narrators in the DB lack both name and DOB in `state.profile.basics`. The classifier `getNarratorOpenState()` correctly returns "incomplete" for all of them. Once their profiles have name + DOB populated (via onboarding or direct edit), they will classify as "ready" and get the normal resume greeting path instead.

---

## 4. Files Changed

| File | Change |
|------|--------|
| `ui/js/state.js` | Added `narratorOpen` state object (loadingPid, openStatus, incompletePid, openError) |
| `ui/js/app.js` | Added `getNarratorOpenState(pid)` classifier; replaced `_onModelReady()` branching with startup-neutral path |
| `ui/lori9.0.html` | Patched `lv80ConfirmNarratorSwitch` (debounce); rewrote `lv80SwitchPerson` (gated flow); added `lv80ShowIncompleteNarratorUi`, `lv80BeginOnboardingFromIncomplete`, `lv80ShowNarratorOpenError` |

---

## 5. Patch Summary

**`ui/js/state.js`** — Added a `narratorOpen` block to the global state object with four fields: `loadingPid` (tracks which narrator is currently loading), `openStatus` (idle/loading/ready/incomplete/error), `incompletePid` (which narrator was classified incomplete), and `openError` (error message if load failed).

**`ui/js/app.js`** — Two changes: (1) Added `getNarratorOpenState(pid)` after `lvxSwitchNarratorSafe`, which checks `state.profile.basics` for name + DOB and returns "ready", "incomplete", "missing", or "new". (2) Replaced the `_onModelReady()` new-device vs returning-device branching with a single startup-neutral path that always opens the narrator selector. The old code auto-started onboarding for new devices.

**`ui/lori9.0.html`** — Five changes: (1) `lv80ConfirmNarratorSwitch` now checks `state.narratorOpen.loadingPid` and `openStatus` to debounce repeated clicks. (2) `lv80SwitchPerson` fully rewritten with gated flow: sets loading state → calls `lvxSwitchNarratorSafe` in try/catch → classifies readiness → routes to ready (resume greeting) or incomplete (explicit card) or error (error card). No longer calls `startIdentityOnboarding()`. (3) New `lv80ShowIncompleteNarratorUi(pid)` renders explicit "Narrator record incomplete" card with missing fields and action buttons. (4) New `lv80BeginOnboardingFromIncomplete(pid)` clears chat and deliberately starts onboarding when user clicks "Complete profile basics." (5) New `lv80ShowNarratorOpenError(pid, msg)` renders error card with Retry/Back buttons.

---

## 6. Retest Results

After all fixes applied, full reload sequence verified:

1. **Startup:** Blank, narrator selector opens, Lori silent — PASS
2. **Open CTH (incomplete):** Incomplete card shown, Lori silent — PASS
3. **"Complete profile basics" on CTH:** Card clears, single Lori greeting — PASS
4. **Reload → Open Kent (rapid 3x):** 1 accepted, 2 debounced, single incomplete card — PASS
5. **Reload → "+ New":** Chat clears, single Lori onboarding greeting — PASS

---

## 7. Final Status

### **PASS**

All acceptance criteria met after two surgical fixes (startup neutrality + card cleanup on deliberate onboarding).

---

## 8. Follow-up Items

1. **No "ready" narrator available to test resume path.** All three narrators in the DB are incomplete (missing name + DOB). The "ready" branch of `lv80SwitchPerson` (which calls `sendSystemPrompt` with a resume greeting) has not been exercised in this live test. It should be tested once a narrator has complete identity basics.

2. **Header still shows "Choose a narrator" after opening an incomplete narrator.** The `lv80UpdateActiveNarratorCard()` call runs, but since basics are empty it renders the default "Choose a narrator" text. This is cosmetically correct but could be improved to show the narrator's display_name from the people cache even when profile basics are empty.

3. **Error path (`lv80ShowNarratorOpenError`) not exercised.** The backend didn't throw during `lvxSwitchNarratorSafe` for any of the test narrators, so the error card was never triggered in live testing. It was verified by code review only.
