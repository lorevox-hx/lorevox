# Cold Start Persistence and Visual Truth Test — Fix Plan

## Fixes Applied in This Session

### 1. Bio Builder Popover Render Guard (CS-1) — DONE

**Files:** `ui/js/bio-builder.js` lines 1244, 3193
**Category:** UI rendering issue
**What was wrong:** The render guard checked `host.hasAttribute("open")` but the Popover API uses `:popover-open` CSS pseudo-class, not an HTML `open` attribute.
**Fix:** Added `:popover-open` check as fallback: `if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;`
**Verified:** Bio Builder now renders "Capturing biography" on cold start for all 3 narrators.

### 2. Life Map Popover Render Guard (CS-2) — DONE

**File:** `ui/js/life-map.js` line 621
**Category:** UI rendering issue
**What was wrong:** Same pattern as CS-1 — checked `popover.hasAttribute("open")` instead of also checking `:popover-open`.
**Fix:** Added `:popover-open` check: `(popover && !popover.hasAttribute("open") && !popover.matches(":popover-open"))`
**Verified:** Life Map now renders 6-period MindElixir scaffold on cold start for all 3 narrators.

### 3. Profile Loading Race Condition (CS-3) — DONE

**File:** `ui/js/app.js` line 311
**Category:** State management / async race condition
**What was wrong:** `loadPerson()` had no guard against superseded async fetches. During rapid narrator switching, a slow API response for narrator A could overwrite `state.profile` after the user had already switched to narrator B.
**Fix:** Added `_loadGeneration` counter. Each call to `loadPerson()` increments the counter. After `fetch()` completes, checks `gen !== _loadGeneration` before assigning `state.profile`. If the generation has advanced, the stale response is silently discarded.
**Verified:** Rapid switching Chuck → MT → Janice → Chuck no longer leaves stale profile data.

---

## Fixes Still Needed

### 4. FT/LT Draft Loading on Cold Start (CS-4)

**Priority:** High — affects data that users already entered
**Category:** Storage ↔ state hydration gap
**File:** `ui/js/bio-builder.js` — `_personChanged()` function (line 309)

**Problem:** Mark Twain has Family Tree drafts (12 nodes, 10 edges) and Life Threads drafts (13 nodes, 12 edges) persisted in localStorage under `lorevox_ft_draft_{pid}` and `lorevox_lt_draft_{pid}`. However, after a cold start and narrator switch to Mark Twain, `state.bioBuilder.familyTreeDraftsByPerson[pid]` shows 0 nodes.

**Suspected cause:** Either `_personChanged()` is not loading from localStorage on narrator switch, or the data wrapper format `{v:1, data:{nodes, edges}}` is not being unwrapped correctly.

**Investigation needed:**
1. Read `_personChanged()` (bio-builder.js line 309-327) to trace the localStorage load path
2. Check if the `{v:1, data:{nodes, edges}}` format is expected or if the loader expects `{nodes, edges}` flat
3. Verify the localStorage key naming convention matches what `_personChanged()` looks for

**Fix approach:** Ensure `_personChanged()` reads from `lorevox_ft_draft_{pid}` and `lorevox_lt_draft_{pid}`, unwraps the `{v, data}` envelope if present, and populates `state.bioBuilder.familyTreeDraftsByPerson[pid]` and `state.bioBuilder.lifeThreadsDraftsByPerson[pid]`.

### 5. Quick Capture Placeholder (CS-5)

**Priority:** Low — cosmetic only
**Category:** UI text not updating on narrator switch
**File:** `ui/js/bio-builder.js` — Quick Capture render section

**Problem:** Placeholder text says "e.g. Janice was born in Spokane, WA in 1939" regardless of which narrator is selected.

**Fix:** In the Quick Capture render function, dynamically set the placeholder using `state.profile?.basics?.preferred` and `state.profile?.basics?.pob`.

### 6. Zodiac Auto-Derive on Hydration (CS-6)

**Priority:** Low — cosmetic, no data loss
**Category:** Hydration gap
**File:** `ui/js/bio-builder.js` — `_hydrateQuestionnaireFromProfile()`

**Problem:** The `autoDerive: "zodiacFromDob"` trigger only fires on manual DOB input through the questionnaire form, not during reverse hydration from profile.

**Fix:** In `_hydrateQuestionnaireFromProfile()`, after setting the DOB field, call the zodiac derivation function if DOB is present and zodiac is empty.

---

## What Must Be Fixed Before More Real Family Narrators Are Added

### Must-fix (blocking):
1. **CS-4 (FT/LT loading)** — If a user enters family tree data for Janice in one session, closes the browser, and reopens, that family tree data must appear in the UI. Right now it's saved but not loaded. This is the #1 trust issue remaining.

### Should-fix (recommended):
2. **CS-5 (placeholder)** — The wrong narrator name in the placeholder is confusing for real users.
3. **CS-6 (zodiac)** — Minor but adds to the impression of polish.

### Already fixed (verified):
4. **CS-1 + CS-2 (popover guards)** — Bio Builder and Life Map now render on cold start.
5. **CS-3 (race condition)** — Profile loading is now guarded against rapid switching.

---

## Structural Classification

| Issue Type | Count | Examples |
|-----------|-------|---------|
| UI rendering (popover guard) | 2 | CS-1, CS-2 — FIXED |
| State management (race condition) | 1 | CS-3 — FIXED |
| Storage ↔ state hydration | 1 | CS-4 — OPEN |
| UI text (cosmetic) | 1 | CS-5 — OPEN |
| Hydration gap | 1 | CS-6 — OPEN |

The two most impactful issues (popover guards) were the same root cause in two files. Once fixed, the system moved from "requires developer intervention" to "works for real users" on cold start.

---

## Recommendation

**Lorevox is now trustworthy for real family capture** with the popover fixes applied, provided users understand that questionnaire answers, quick capture items, source inbox cards, and candidate queues are session-scoped and will not survive browser restarts. The FT/LT draft loading issue (CS-4) should be fixed before encouraging users to build complex family trees, as the data is being saved but not visually restored.
