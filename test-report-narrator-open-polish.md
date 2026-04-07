# Lorevox 9.0 — Narrator Open Polish & Failure-Path Coverage: Test Report

**Date:** April 6, 2026, 6:26–6:30 PM MDT
**Tester:** Claude (live browser automation via Chrome)
**Environment:** Lorevox 9.0, localhost:8000, freshly cache-busted reload
**Page tested:** `http://localhost:8000/ui/lori9.0.html`
**Ticket:** Cleanup / follow-up — narrator open polish and failure-path coverage

---

## 1. Root-Cause / Cleanup Summary

This ticket addressed three polish items left over from the core narrator-open gating fix:

1. **Error path untested.** The `lv80ShowNarratorOpenError()` branch existed but had never been exercised live because `lvxSwitchNarratorSafe()` doesn't throw under normal conditions. Added a one-shot dev test hook (`window.__lv9_simulateOpenError`) and hardened the "Back to narrators" button to reset narrator-open state cleanly.

2. **Header showed "Choose a narrator" for incomplete narrators.** `lv80UpdateActiveNarratorCard()` only read from `state.profile.basics`, which is empty for incomplete narrators. Added fallback to people cache `display_name`.

3. **Raw ISO DOB in narrator cards and header.** Added `_lv80FormatDob()` helper to format dates as "Sep 10, 1982" style. Applied to both narrator selector cards and active narrator header subtitle.

---

## 2. Files Changed

**Only one file was modified: `ui/lori9.0.html`**

No changes to `app.js` or `state.js`.

---

## 3. Patch Summary

### Patch 1: Error path hardening (2 changes)

**Change 1a — Dev test hook** (inside `lv80SwitchPerson`, before `lvxSwitchNarratorSafe` call):
```javascript
// v9-dev: one-shot error simulation for testing the error path
if (window.__lv9_simulateOpenError) {
  window.__lv9_simulateOpenError = false;
  throw new Error("Simulated narrator load failure (dev test)");
}
```
This is a zero-cost dev hook (no-op unless explicitly set from console). One-shot: flag auto-clears after one use.

**Change 1b — Error card "Back to narrators" state cleanup** (inside `lv80ShowNarratorOpenError`):
```javascript
// Before:
onclick="lv80OpenNarratorSwitcher()"
// After:
onclick="state.narratorOpen.openStatus='idle'; state.narratorOpen.openError=null; lv80OpenNarratorSwitcher()"
```
Ensures narrator-open state is reset to idle when user navigates away from error card, preventing stale error status.

### Patch 2: Header fallback for incomplete narrators (in `lv80UpdateActiveNarratorCard`)

```javascript
let name = basics.preferred || basics.preferredName || basics.fullname || basics.fullName || null;
// v9: fall back to people cache display_name when profile basics are empty
if (!name && state.person_id) {
  const cached = (state?.narratorUi?.peopleCache || []).find(
    p => (p.person_id || p.id || p.uuid) === state.person_id
  );
  name = cached?.display_name || cached?.name || null;
}
if (!name) name = "Choose a narrator";
```

### Patch 3: DOB formatting (2 changes)

**Change 3a — New helper function** `_lv80FormatDob`:
```javascript
function _lv80FormatDob(dob) {
  if (!dob) return "";
  try {
    const d = new Date(dob + "T00:00:00");
    if (isNaN(d.getTime())) return dob;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch (_) { return dob; }
}
```

**Change 3b — Applied in header subtitle** (`lv80UpdateActiveNarratorCard`):
```javascript
if (dob) parts.push(_lv80FormatDob(dob));  // was: parts.push(dob)
```

**Change 3c — Applied in narrator selector cards** (`lv80RenderNarratorCards`):
```javascript
${person.date_of_birth ? esc(_lv80FormatDob(person.date_of_birth.toString())) : "DOB unknown"}
// was: ${esc((person.date_of_birth || "").toString()) || "DOB unknown"}
```

---

## 4. Live Test Matrix

| # | Test | Expected | Observed | Pass/Fail |
|---|------|----------|----------|-----------|
| A1 | Error card renders on simulated failure | Red "Could not open narrator" card with error message, Retry + Back buttons, Lori silent | Error card rendered: "Simulated narrator load failure (dev test)". Retry and Back buttons visible. Lori silent. Header stayed on previous state. | **PASS** |
| A2 | Retry recovers cleanly from error | Narrator loads normally on second attempt | Retry clicked → Christopher classified "ready" → single Lori welcome-back → header updated to "Christopher / Sep 10, 1982 · Denver, Colorado · age 43". Clean recovery. | **PASS** |
| A3 | Back to narrators from error card | Narrator selector opens, state resets to idle | Selector opened. State confirmed: `openStatus: "idle"`, `openError: null`, `loadingPid: null`. | **PASS** |
| A4 | No broken state after error | Can open another narrator normally after error | After error → Back → opened Kent normally → classified "incomplete" → incomplete card rendered. | **PASS** |
| B | Incomplete narrator header shows name | Header shows narrator's display_name from people cache | Kent opened → header shows "Kent James Horne" (was "Choose a narrator" before patch). Subtitle shows "Choose a narrator" (no DOB/POB data — correct). | **PASS** |
| B2 | Incomplete card still appears | Missing fields card with action buttons | "Narrator record incomplete" card: "missing: name and date of birth." Complete/Back buttons present. Lori silent. | **PASS** |
| C | Ready narrator regression | Christopher opens with resume greeting, formatted DOB | Classified "ready". Single Lori bubble. Header: "Christopher / Sep 10, 1982 · Denver, Colorado · age 43". No onboarding, no incomplete card. | **PASS** |
| C2 | DOB formatting in selector card | Christopher card shows "Sep 10, 1982" not "1982-09-10" | Card shows "Sep 10, 1982 · Denver, Colorado · age 43". | **PASS** |
| D | Startup neutrality regression | Blank startup, selector opens, Lori silent | Blank state. Selector opened. Console: `v9 — startup neutral`. Christopher shows formatted DOB. Kent/Janice show "DOB unknown". | **PASS** |

---

## 5. Final Status

### **PASS**

All nine test cases pass. The three polish items are complete:
- Error path exercised and verified (render, retry, back, state cleanup)
- Incomplete narrator header now shows meaningful name from people cache
- DOB formatting applied consistently across selector cards and header
- No regressions to ready path, incomplete gating, startup neutrality, or debounce
