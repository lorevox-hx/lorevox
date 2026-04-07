# Lorevox 9.0 — Narrator Open Gating: Live Chrome Test Report (v2)

**Date:** April 6, 2026, 5:49–5:52 PM MDT
**Tester:** Claude (live browser automation via Chrome)
**Environment:** Lorevox 9.0 on laptop, freshly restarted backend + WSL + Chrome cleanup
**Page tested:** `http://localhost:8000/ui/lori9.0.html`
**Backend:** Running at localhost:8000, model warm (latency 0.71s)

---

## 1. Fresh Code Verification

Before any acceptance testing, confirmed the browser is running the patched v9 code:

**Console proof on page load:**
```
[startup] Enforced blank startup state — no active narrator.
[startup] v8.1 — blank state enforced. User must select a narrator.
[readiness] Model warm and ready. Latency: 0.71s
[readiness] _onModelReady — firing deferred startup.
[readiness] v9 — startup neutral. Opening narrator selector.
```

The critical line `v9 — startup neutral` confirms the patched `_onModelReady()` is running — NOT the old code that would print "New device detected — starting welcome onboarding."

**Result: CONFIRMED — fresh v9 code running, no stale JS.**

---

## 2. Test Matrix

| # | Test | Narrator | Expected | Observed | Pass/Fail |
|---|------|----------|----------|----------|-----------|
| A | Startup neutrality | (none) | Blank chat, narrator selector opens, Lori silent | Narrator selector popover opened. Chat behind it: completely empty. Lori silent. Header: "Choose a narrator". | **PASS** |
| B | + New narrator flow | (new) | Clears chat, starts onboarding, single Lori greeting | `lv80NewPerson()` → chat cleared → single Lori bubble asking for name. Console: `startIdentityOnboarding() — new user path, phase=askName` | **PASS** |
| C | Open existing narrator (CTH) | Christopher Todd Horne | Classified incomplete, explicit UI card, Lori silent | "Narrator record incomplete" card: "missing: name and date of birth." Two buttons: "Complete profile basics" / "Back to narrators". Lori silent. | **PASS** |
| D | "Complete profile basics" button | Christopher Todd Horne | Clears card, starts deliberate onboarding, single Lori greeting | Incomplete card cleared. Single Lori onboarding bubble. Console: `User chose to complete basics for 1ec33c14...` → `startIdentityOnboarding()` | **PASS** |
| E | Rapid-click (4x) on Kent | Kent James Horne | 1 load accepted, 3 ignored, single UI result | Click 1: `Opening narrator: 54857478...` Click 2–4: `Open click ignored — already loading 54857478...` Single incomplete card. No stacking. | **PASS** |
| F | Switch from Kent to Janice | Janice Josephine Horne | Previous state cleared, new incomplete card for Janice | Kent's card replaced by Janice's incomplete card. Clean load: `Opening narrator: a1d3e99f...` → `classified as: incomplete`. Lori silent. | **PASS** |

---

## 3. Findings

**No new bugs found during this test run.** All patches from the previous session are working correctly after the fresh Lorevox restart and Chrome cleanup.

### Observation: All three narrators are incomplete

Kent James Horne, Janice Josephine Horne, and Christopher Todd Horne all have empty `state.profile.basics` (no name, no DOB). The classifier `getNarratorOpenState()` correctly returns "incomplete" for all of them. This means the "ready" resume-greeting path (which calls `sendSystemPrompt` with a welcome-back message) was **not exercisable** in this test — there is no narrator with complete identity in the current DB.

### Note: Error path not exercised

`lv80ShowNarratorOpenError()` was not triggered because `lvxSwitchNarratorSafe()` succeeded for all three narrators. The error card UI was verified by code review only.

---

## 4. Files Changed

No files were changed during this test run. All patches were already in place from the previous session:

| File | Previous Patch |
|------|---------------|
| `ui/js/state.js` | Added `narratorOpen` state object |
| `ui/js/app.js` | Added `getNarratorOpenState()` classifier; replaced `_onModelReady()` with startup-neutral path |
| `ui/lori9.0.html` | Debounce in `lv80ConfirmNarratorSwitch`; gated `lv80SwitchPerson`; added `lv80ShowIncompleteNarratorUi`, `lv80BeginOnboardingFromIncomplete`, `lv80ShowNarratorOpenError` |

---

## 5. Patch Summary

**`ui/js/state.js`** — `narratorOpen` block with `loadingPid`, `openStatus` ("idle"/"loading"/"ready"/"incomplete"/"error"), `incompletePid`, and `openError`.

**`ui/js/app.js`** — (1) `getNarratorOpenState(pid)` checks `state.profile.basics` for name + DOB → returns "ready", "incomplete", "missing", or "new". (2) `_onModelReady()` unconditionally opens narrator selector instead of branching between auto-onboarding and selector.

**`ui/lori9.0.html`** — (1) `lv80ConfirmNarratorSwitch` debounces by checking `loadingPid` and `openStatus`. (2) `lv80SwitchPerson` gated flow: loading state → `lvxSwitchNarratorSafe` → classify → route to ready/incomplete/error. (3) `lv80ShowIncompleteNarratorUi` renders explicit card with missing fields and action buttons. (4) `lv80BeginOnboardingFromIncomplete` clears chat then calls `startIdentityOnboarding`. (5) `lv80ShowNarratorOpenError` renders error card with Retry/Back.

---

## 6. Retest Results

This IS the retest — run against a freshly restarted Lorevox instance with clean Chrome state. All six tests pass with zero failures and zero fixes needed.

---

## 7. Final Status

### **PASS**

All acceptance criteria verified live in Chrome:
- A. Startup neutrality: **PASS**
- B. New narrator flow: **PASS**
- C. Existing narrator (incomplete) open: **PASS**
- D. Deliberate onboarding from incomplete UI: **PASS**
- E. Rapid-click protection: **PASS**
- F. Narrator switching: **PASS**

---

## 8. Follow-up Items

1. **"Ready" narrator resume path untested live.** All three DB narrators are incomplete. Once any narrator has name + DOB populated, the resume-greeting branch should be verified.

2. **Error path untested live.** `lv80ShowNarratorOpenError` was not triggered. To test, would need to simulate a backend failure during `lvxSwitchNarratorSafe`.

3. **Header shows "Choose a narrator" even after opening an incomplete narrator.** This is cosmetically correct (no basics to display) but could be improved to show the narrator's `display_name` from the people cache.
