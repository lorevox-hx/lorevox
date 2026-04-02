# Lorevox 8.0 — Bio Builder Bug Fix Action Plan

**Date:** 2026-04-02
**Related Report:** `bio-bug.md`
**Priority Order:** Fixes are ordered by dependency chain — Bug 1 is the root cause for Bugs 2 and 3, so it must be fixed first.

---

## Phase 1 — Root Cause Fix (Bug 1)

### Action 1.1: Hydrate `bb.questionnaire` from localStorage on every panel open

**File:** `ui/js/bio-builder-questionnaire.js`
**Estimated Effort:** 30 minutes

The core issue is that `bb.questionnaire` lives in a closure and is never re-hydrated from `localStorage` when the Bio Builder popover is reopened. The DOM renders correctly because `_renderSectionDetail` reads from localStorage, but the in-memory object stays empty.

**Fix Steps:**

1. Find the function that runs when the Bio Builder popover opens (likely the tab switch handler or the popover toggle handler).

2. Add a call to load the questionnaire draft from localStorage into `bb.questionnaire`:
   ```javascript
   // At the start of Bio Builder popover open or tab switch to Questionnaire:
   const qqKey = `lorevox_qq_draft_${state.person_id}`;
   const draft = localStorage.getItem(qqKey);
   if (draft) {
     const parsed = JSON.parse(draft);
     bb.questionnaire = parsed.d || {};
   }
   ```

3. Also ensure `_saveSection()` writes to BOTH `bb.questionnaire` AND localStorage (verify it already does — if not, add the in-memory write).

4. Verify `_sectionFillCount()` now returns correct badge counts after reopening the panel.

**Test:** Save Parents with 1 entry → close Bio Builder → reopen → badge should show "1 entry" → click "Add another" → should add Parent 2 without error.

---

## Phase 2 — "Add Another" Fixes (Bugs 2 + 3)

### Action 2.1: Stop event propagation on "Add another" button click

**File:** `ui/js/bio-builder-questionnaire.js`
**Estimated Effort:** 15 minutes

The "Add another" button's click event bubbles up to the popover container, sometimes triggering the popover's dismiss handler.

**Fix:**
Find the onclick handler for the "Add another" button (in `_renderSectionDetail`, look for the button that calls `_addRepeatEntry`). Add `event.stopPropagation()`:

```javascript
// In the button's onclick:
onclick="event.stopPropagation(); window.LorevoxBioBuilder._addRepeatEntry('${sectionId}')"
```

Or if using addEventListener:
```javascript
btn.addEventListener('click', function(e) {
  e.stopPropagation();
  _addRepeatEntry(sectionId);
});
```

### Action 2.2: Auto-save before re-render on "Add another"

**File:** `ui/js/bio-builder-questionnaire.js`
**Affected Function:** `_addRepeatEntry()`
**Estimated Effort:** 30 minutes

Before pushing an empty entry and re-rendering, capture current DOM values into the state.

**Fix:**
```javascript
function _addRepeatEntry(sectionId, renderCallback) {
  // NEW: Save current DOM values before modifying state
  _saveSection(sectionId);  // This reads DOM → writes to bb.questionnaire + localStorage

  // EXISTING: Push empty entry
  if (!bb.questionnaire[sectionId]) bb.questionnaire[sectionId] = [];
  bb.questionnaire[sectionId].push({});

  // EXISTING: Persist and re-render
  _persistDrafts();
  if (renderCallback) renderCallback();
}
```

**Test:** Fill Parent 1 fields without saving → click "Add another" → Parent 1 data should be preserved → Parent 2 empty form should appear.

---

## Phase 3 — Name Hydration Fix (Bug 4)

### Action 3.1: Use full display name for questionnaire fullName field

**File:** `ui/js/bio-builder-questionnaire.js`
**Affected Function:** `_hydrateQuestionnaireFromProfile()` (~line 368-445)
**Estimated Effort:** 15 minutes

**Fix:**
Find where `fullName` is populated from the profile. It's likely reading `state.profile.basics.preferred_name` or just the first name. Change it to read `state.profile.basics.display_name` or construct it from first + last:

```javascript
// BEFORE (likely):
q.personal.fullName = basics.preferred_name || basics.first_name;

// AFTER:
q.personal.fullName = basics.display_name
  || [basics.first_name, basics.last_name].filter(Boolean).join(' ')
  || basics.preferred_name;
```

**Test:** Create a new narrator "John Smith" → open Bio Builder → Personal Info → fullName should show "John Smith" not just "John".

---

## Phase 4 — Peek at Memoir Fix (Bug 5)

### Action 4.1: Debug memoir popover toggle handler

**File:** `ui/js/app.js` or `ui/js/memoir.js`
**Estimated Effort:** 30 minutes

**Investigation Steps:**

1. Find the click handler for the "Peek at Memoir" button. Search for `memoirScrollPopover` or `peek` or `memoir` in the JS.

2. Check if the toggle logic has a guard condition (e.g., requires minimum segments in the spine, or requires the AI backend to be online).

3. If the popover uses the Popover API (`popover` attribute), verify the `showPopover()` / `togglePopover()` call is being reached.

4. If it uses CSS class toggle, verify the class is being applied:
   ```javascript
   // Check if it's toggling a class:
   memoirScrollPopover.classList.toggle('visible');
   // vs setting display directly:
   memoirScrollPopover.style.display = 'block';
   ```

5. Check if the popover is positioned off-screen via CSS (e.g., `top: -9999px` or `opacity: 0`).

**Fix:** Depends on investigation — likely either a missing guard condition being met, or a CSS positioning issue.

---

## Phase 5 — Narrator Delete Cleanup (Bug 7)

### Action 5.1: Add FT and LT draft cleanup to delete function

**File:** `ui/js/app.js`
**Affected Function:** `lvxDeleteNarratorConfirmed()` (~line 662-707)
**Estimated Effort:** 5 minutes

**Fix:** Add two lines to the localStorage cleanup section:

```javascript
// EXISTING cleanup:
localStorage.removeItem(`lorevox_offline_profile_${pid}`);
localStorage.removeItem(`lorevox_proj_draft_${pid}`);
localStorage.removeItem(`lorevox_qq_draft_${pid}`);
localStorage.removeItem(`lorevox.spine.${pid}`);
localStorage.removeItem(`lorevox.done.${pid}`);
localStorage.removeItem(`lorevox.segs.${pid}`);

// NEW — add these two:
localStorage.removeItem(`lorevox_ft_draft_${pid}`);
localStorage.removeItem(`lorevox_lt_draft_${pid}`);
```

**Test:** Create narrator → seed Family Tree → delete narrator → verify no orphaned `ft_draft` or `lt_draft` keys remain.

---

## Phase 6 — Backend Stability (Bug 6)

### Action 6.1: Investigate chat service drop after first response

**Estimated Effort:** 1-2 hours (investigation)

**Investigation Steps:**

1. Check `logs/` folder for API crash logs around the time of the test.

2. Check if the fact extraction pipeline (`_extractFacts` → `projectValue` → `_syncToBioBuilder`) is running synchronously and blocking the chat endpoint.

3. Check if the TTS service (port 8001) crash causes the chat service health check to fail.

4. Add timeout and retry logic to the chat endpoint if the extraction pipeline is slow.

5. Check if the API process has a memory limit that's being exceeded after processing a long conversational message.

---

## Fix Priority and Dependency Order

```
Phase 1 (Bug 1) ─── ROOT CAUSE ───────────────────────── Must fix first
    │
    ├── Phase 2 (Bugs 2+3) ─── Depends on Phase 1 ──── Fix second
    │
    ├── Phase 3 (Bug 4) ─── Independent ──────────────── Fix anytime
    │
    ├── Phase 4 (Bug 5) ─── Independent ──────────────── Fix anytime
    │
    └── Phase 5 (Bug 7) ─── Independent, 5 min ──────── Fix anytime

Phase 6 (Bug 6) ─── Backend investigation ────────────── Separate track
```

**Total Estimated Effort:** ~3-4 hours for all code fixes + 1-2 hours for backend investigation.

---

## Verification Test Plan

After all fixes are applied, run this exact sequence to verify:

1. Delete all narrators, clear `lorevox_device_onboarded`
2. Create new narrator "Christopher Horne"
3. Complete identity onboarding (name, DOB: 1962-12-24, birthplace: Williston ND)
4. Open Bio Builder → Personal Info → verify fullName is "Christopher Horne" (not just "Christopher")
5. Open Parents → fill Parent 1 (Kent, Father) → do NOT save → click "Add another"
6. Verify Parent 1 data is preserved (auto-save fix) and Parent 2 form appears
7. Fill Parent 2 (Janice, Mother) → Save → verify "2 entries"
8. Open Siblings → add Vincent and Jason → verify "2 entries"
9. Fill Education & Career → Save → verify "4/6 filled"
10. Go to Family Tree → Seed from Questionnaire → verify 5 nodes with "Christopher Horne" as narrator name
11. Send Life Story message → verify Lori responds → verify "Added to Story" → verify conversation continues (no service drop)
12. Open Life Map → verify periods render
13. Click Peek at Memoir → verify popover opens with content
14. Delete narrator → verify `ft_draft` and `lt_draft` keys are cleaned up
