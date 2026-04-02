# Lorevox 8.0 — Bio Builder Pipeline Bug Report (Christopher Horne Full Re-Test)

**Date:** 2026-04-02
**Environment:** Clean slate — all 3 prior narrators (Christopher, Janice, Kent) deleted, `lorevox_device_onboarded` cleared, fresh Christopher Horne narrator created through identity onboarding gate. Backend services: API:8000, TTS:8001, UI:8080.
**Narrator PID:** `055772eb-e370-4fae-920e-454bc061faf0`

---

## Test Scope

Full end-to-end re-test of every data collection path in Lorevox 8.0:

1. Identity onboarding (name / DOB / birthplace)
2. Bio Builder Questionnaire (Personal Info, Parents, Siblings, Education & Career)
3. Repeatable section "Add another" workflow (Parents x2, Siblings x2)
4. Family Tree seeding from Questionnaire
5. Life Story interview (conversational capture + fact extraction)
6. Life Map rendering
7. Peek at Memoir
8. Projection sync and localStorage persistence audit

---

## Test Results Summary

| Test | Target | Result |
|------|--------|--------|
| Identity onboarding | name → DOB → birthplace state machine | **PASS** |
| Profile hydration into questionnaire | `_hydrateQuestionnaireFromProfile()` | **PARTIAL** — fullName only got first name |
| Personal Information save | 5/7 fields auto-populated, zodiac derived | **PASS** |
| Parents save (single entry) | Kent Horne, Father | **PASS** |
| "Add another parent" | Add Janice Horne as Parent 2 | **FAIL** on first attempt, **PASS** on retry |
| Parents save (two entries) | Kent + Janice, 2 entries badge | **PASS** |
| Siblings save (single + add another) | Vincent + Jason, 2 entries badge | **PASS** |
| Education & Career save | 4/6 fields filled | **PASS** |
| Family Tree seed from Questionnaire | 5 nodes, 4 edges created | **PASS** |
| Life Story interview send | Message sent, Lori responded | **PASS** |
| Fact extraction ("Added to Story") | Badge appeared after Lori response | **PASS** |
| Life Map rendering | Mind Elixir map with 7 life periods | **PASS** |
| Peek at Memoir | Popover should open | **FAIL** — popover exists but not displayed |
| Chat service stability | Sustained conversation | **FAIL** — dropped after first response |
| Projection sync | All fields persisted with correct sources | **PASS** |
| localStorage final audit | 8 keys, all consistent | **PASS** |

---

## Bug List

### Bug 1 — CRITICAL: `bb.questionnaire` in-memory state not hydrated from localStorage

**Severity:** Critical
**Component:** `ui/js/bio-builder-questionnaire.js`
**Affected Functions:** `_addRepeatEntry()`, `_sectionFillCount()`, `_renderSectionDetail()`

**Description:**
The closure-internal `bb.questionnaire` object remains empty (`undefined`) even after data is successfully saved to localStorage via `_saveSection()`. The section detail view renders correctly by reading from localStorage into the DOM, but the in-memory state used by `_addRepeatEntry` and `_sectionFillCount` is stale or non-existent.

**Evidence:**
```
window.LorevoxBioBuilder.bb  →  undefined
window.LorevoxBioBuilder.bb.questionnaire  →  Cannot read properties of undefined
localStorage qq_draft has: { personal: {...}, parents: [{Kent...}] }  →  correctly persisted
```

**Impact:**
- `_addRepeatEntry('parents')` pushes to an empty/undefined array instead of the array with existing entries
- `_sectionFillCount()` may return incorrect badge counts when the in-memory state diverges from localStorage
- This is the root cause of Bugs 2 and 3

**Root Cause Theory:**
`_saveSection()` writes to localStorage but the closure-local `bb` object is either not initialized from localStorage on panel reopen, or the reference is stale after the popover is dismissed and reopened. The `_loadDrafts()` function may not be called when the Bio Builder popover is toggled.

---

### Bug 2 — HIGH: "Add another" button intermittently dismisses Bio Builder panel

**Severity:** High
**Component:** `ui/js/bio-builder-questionnaire.js` / popover event handling
**Affected Function:** `_addRepeatEntry()` onclick handler

**Description:**
Clicking the "+ Add another parent" button dismissed the entire Bio Builder popover on the first attempt. The button's click event appears to bubble up to the popover's dismiss handler. On a second attempt (after reopening the Bio Builder), the same button worked correctly and Parent 2 appeared.

**Steps to Reproduce:**
1. Open Bio Builder → Questionnaire → Parents
2. Fill and save Parent 1 (Kent Horne)
3. Return to sections list, reopen Parents
4. Click "+ Add another parent"
5. **First attempt:** Bio Builder panel closes, returns to chat view
6. Reopen Bio Builder → Parents section still shows only Parent 1
7. Click "+ Add another parent" again → **Works:** Parent 2 form appears

**Expected:** Button should always add a new entry form without dismissing the panel.

**Root Cause Theory:**
Event propagation issue — the `onclick` handler on the "Add another" button triggers `_addRepeatEntry` which calls a render callback, and the re-render may momentarily remove/replace the popover container, causing the browser to treat it as a "click outside" event that triggers popover dismissal. Alternatively, the `stopPropagation()` call may be missing on the button's click handler.

---

### Bug 3 — HIGH: "Add another" re-render wipes unsaved DOM data

**Severity:** High
**Component:** `ui/js/bio-builder-questionnaire.js`
**Affected Functions:** `_addRepeatEntry()` → `_renderSectionDetail()`

**Description:**
When `_addRepeatEntry` succeeds and triggers a re-render via the callback, `_renderSectionDetail` rebuilds the HTML from the in-memory `bb.questionnaire[sectionId]` state — NOT from the current DOM values. Any data the user typed into existing entry fields that hasn't been explicitly saved via the "Save" button is lost.

**Scenario:**
1. Open Parents section, fill Parent 1 fields (name, birthplace, etc.) — do NOT save yet
2. Click "+ Add another parent"
3. Re-render reads from in-memory state where Parent 1 has only empty `{}` (because save wasn't clicked)
4. Parent 1 fields appear blank — all typed data lost

**Workaround:** Always click "Save [Section]" before clicking "Add another". This persists the data to both in-memory state and localStorage before the re-render.

**Fix Recommendation:** Before re-rendering, call `_saveSection()` to capture current DOM values into the state, or read DOM values directly during re-render to preserve unsaved input.

---

### Bug 4 — MEDIUM: Narrator fullName hydrated as first name only

**Severity:** Medium
**Component:** `ui/js/bio-builder-questionnaire.js`
**Affected Function:** `_hydrateQuestionnaireFromProfile()`

**Description:**
During identity onboarding, the user provides their name as "Christopher Horne". The profile stores this correctly. However, when `_hydrateQuestionnaireFromProfile()` populates the questionnaire's `personal.fullName` field, it writes only "Christopher" instead of "Christopher Horne".

**Evidence:**
```json
{
  "personal": {
    "fullName": "Christopher",     // ← should be "Christopher Horne"
    "preferredName": "Christopher"  // ← correct (preferred can be first name)
  }
}
```

**Impact:**
- Family Tree narrator node displays as just "Christopher" instead of "Christopher Horne"
- Dedup logic using `displayName.toLowerCase()` may create false matches between unrelated "Christopher" entries
- Memoir and exports show incomplete narrator name

**Root Cause Theory:**
The hydration function may be reading `state.profile.basics.preferred_name` (which is first-name only) for the fullName field instead of `state.profile.basics.display_name` or concatenating first + last name fields.

---

### Bug 5 — MEDIUM: Peek at Memoir popover doesn't display

**Severity:** Medium
**Component:** `ui/js/app.js` or memoir popover handler
**Element:** `#memoirScrollPopover` (class `parchment-scroll`)

**Description:**
Clicking the "Peek at Memoir" toolbar button does not make the memoir popover visible. The popover element exists in the DOM with content (1866 characters, 5 child elements) but its `display` style is not toggled.

**Evidence:**
```javascript
document.getElementById('memoirScrollPopover')
// → exists, className: "parchment-scroll", 5 children, 1866 chars of text
// → style.display: "" (not toggled to 'block' or 'flex')
```

**Possible Causes:**
1. The click handler requires the AI backend to be running to generate/refresh memoir content before showing the popover
2. The toggle logic checks a condition that isn't met (e.g., minimum story segments required)
3. CSS `display` property is set via class toggle rather than inline style, and the class isn't being applied

---

### Bug 6 — MEDIUM: Chat service drops after first response

**Severity:** Medium
**Component:** Backend API service (port 8000)

**Description:**
The Life Story interview successfully sent a message and received Lori's contextual response (with "Added to Story" badge). Immediately after, a second Lori bubble appeared: "Chat service unavailable — start or restart the Lorevox AI backend to enable responses."

**Impact:** Interview flow is broken after one exchange. User cannot continue the conversation.

**Possible Causes:**
1. Backend process crashed or timed out after handling the first request
2. Connection pool exhausted
3. The fact extraction / projection sync pipeline triggered a long-running operation that blocked the chat endpoint
4. TTS service (port 8001) failure cascading to chat service health check

---

### Bug 7 — LOW: Narrator delete doesn't clean up Family Tree and Life Threads drafts

**Severity:** Low
**Component:** `ui/js/app.js`
**Affected Function:** `lvxDeleteNarratorConfirmed()` (lines 662-707)

**Description:**
When deleting a narrator, the cleanup routine clears these localStorage keys:
- `lorevox_offline_profile_{pid}`
- `lorevox_proj_draft_{pid}`
- `lorevox_qq_draft_{pid}`
- `lorevox.spine.{pid}`
- `lorevox.done.{pid}`
- `lorevox.segs.{pid}`

But it does NOT clear:
- `lorevox_ft_draft_{pid}` (Family Tree draft)
- `lorevox_lt_draft_{pid}` (Life Threads draft)

**Impact:** Orphaned Family Tree and Life Threads data remains in localStorage after narrator deletion. If a new narrator is created with the same PID (unlikely but possible), stale FT/LT data could be loaded.

**Fix:** Add two lines to `lvxDeleteNarratorConfirmed()`:
```javascript
localStorage.removeItem(`lorevox_ft_draft_${pid}`);
localStorage.removeItem(`lorevox_lt_draft_${pid}`);
```

---

## Final State Audit

**localStorage (8 keys, all healthy):**

| Key | Status | Content |
|-----|--------|---------|
| `lorevox_proj_draft_{pid}` | OK | 5 personal fields + 2 parents + 2 siblings + education, all `human_edit` locked |
| `lorevox_qq_draft_{pid}` | OK | personal + parents[2] + siblings[2] + education |
| `lorevox_ft_draft_{pid}` | OK | 5 nodes (Christopher, Kent, Janice, Vincent, Jason), 4 biological edges |
| `lorevox_offline_profile_{pid}` | OK | Narrator profile with basics and kinship |
| `lorevox.spine.{pid}` | OK | Timeline spine with life periods |
| `lorevox_device_onboarded` | OK | `true` |
| `lorevox_offline_people` | OK | People index |
| `lorevox_draft_pids` | OK | PID tracking |

---

## What Worked Well

1. **Identity onboarding state machine** — Clean flow through askName → askDob → askBirthplace → complete
2. **Zodiac sign auto-derivation** — Capricorn correctly derived from Dec 24 DOB
3. **Questionnaire save/load cycle** — Data persists correctly through panel close/reopen for saved entries
4. **Family Tree seeding** — All 5 family members created with correct role groupings (Narrator, Parent, Sibling) and bidirectional edges
5. **Life Map visualization** — Beautiful mind map with era-matched life periods, fact counts, and navigation affordances
6. **Projection sync** — All manually-edited questionnaire data correctly marked as `human_edit` with `locked: true`
7. **"Added to Story" extraction** — Conversational narrative was parsed and facts were added to the story spine
