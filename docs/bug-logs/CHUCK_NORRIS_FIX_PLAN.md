# Chuck Norris — Fix Plan

## Priority 1: CN-1 — Profile Stale After Rapid Narrator Switch

**Severity:** High
**Impact:** Wrong narrator data displayed on all profile-dependent surfaces after rapid switching
**File:** `ui/js/app.js` — `loadPerson()` function (line 311)

### Root Cause

When the narrator dropdown changes rapidly (e.g., Chuck → MT → Janice → Chuck), `loadPerson()` is called multiple times. The async profile fetch from the API may complete out of order, causing `state.profile` to be assigned data from a previous narrator while `state.person_id` already points to the new narrator.

### Fix

Add a generation counter or person_id guard to `loadPerson()`:

```javascript
let _loadGeneration = 0;
async function loadPerson(pid) {
  const gen = ++_loadGeneration;
  state.person_id = pid;
  localStorage.setItem(LS_ACTIVE, pid);
  // ... existing code ...
  try {
    const r = await fetch(API.PROFILE(pid));
    if (!r.ok) throw new Error();
    const j = await r.json();
    // Guard: only assign if this is still the active load
    if (gen !== _loadGeneration) return;
    state.profile = normalizeProfile(j.profile || j || {});
    // ... rest of function
  } catch {
    if (gen !== _loadGeneration) return;
    // ... offline fallback ...
  }
}
```

### Testing

1. Switch Chuck → Mark Twain → Janice → Chuck rapidly
2. Verify `state.profile.basics.preferred` matches the dropdown selection
3. Open Life Map — root node should match current narrator
4. Open BB Questionnaire — hydrated data should match current narrator

---

## Priority 2: CN-3 + CN-4 — Popover Render Guard (Bio Builder + Life Map)

**Severity:** Medium
**Impact:** BB and Life Map require manual `setAttribute("open", "")` workaround for programmatic renders
**Files:** `ui/js/bio-builder.js` line 1244, `ui/js/life-map.js` line 621

### Root Cause

The render guards check `host.hasAttribute("open")` but the Popover API uses the `:popover-open` CSS pseudo-class, not an HTML `open` attribute.

### Fix

**bio-builder.js line 1244:**
```javascript
// Before:
if (!host || !host.hasAttribute("open")) return;
// After:
if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;
```

**life-map.js line 621:**
```javascript
// Before:
if (popover && !popover.hasAttribute("open")) return;
// After:
if (popover && !popover.hasAttribute("open") && !popover.matches(":popover-open")) return;
```

### Testing

1. Click Bio Builder button — should render immediately without blank state
2. Click Life Map button — MindElixir should render scaffold immediately
3. No need for manual `setAttribute("open", "")` workaround

---

## Priority 3: CN-2 — Quick Capture Placeholder Uses Wrong Narrator

**Severity:** Low
**Impact:** Cosmetic — placeholder references Janice instead of current narrator
**File:** `ui/js/bio-builder.js` — Quick Capture render section

### Root Cause

The Quick Capture placeholder text is hardcoded or cached from the first narrator loaded, not dynamically updated on narrator switch.

### Fix

In the Quick Capture render function, dynamically set the placeholder:

```javascript
const name = state.profile?.basics?.preferred || "the narrator";
const pob = state.profile?.basics?.pob || "their hometown";
const year = (state.profile?.basics?.dob || "").substring(0, 4) || "YYYY";
factInput.placeholder = `Add a quick fact — e.g. ${name} was born in ${pob} in ${year}`;
```

### Testing

1. Select Chuck Norris
2. Open BB Quick Capture
3. Placeholder should say "e.g. Chuck Norris was born in Ryan, Oklahoma in 1940"

---

## Priority 4: CN-5 — Zodiac Not Auto-Derived on Hydration

**Severity:** Low
**Impact:** Zodiac field empty after reverse hydration when DOB is known
**File:** `ui/js/bio-builder.js` — `_hydrateQuestionnaireFromProfile()`

### Root Cause

The `autoDerive: "zodiacFromDob"` trigger only fires on manual input through the questionnaire form, not during reverse hydration.

### Fix

In `_hydrateQuestionnaireFromProfile()`, after setting the DOB field, call the zodiac derivation:

```javascript
if (basics.dob && !q.personal.zodiacSign) {
  q.personal.zodiacSign = _deriveZodiacFromDob(basics.dob);
}
```

### Testing

1. Create a new narrator with DOB 1940-03-10
2. Open BB Questionnaire → Personal Information
3. Zodiac should show "Pisces"

---

## Implementation Order

1. **CN-1** (High) — Fix immediately. Profile race condition can cause wrong narrator data to display.
2. **CN-3 + CN-4** (Medium) — Fix together. Both are the same pattern, same root cause.
3. **CN-2** (Low) — Fix when touching Quick Capture code.
4. **CN-5** (Low) — Fix when touching hydration code.

## Structural Observations

Chuck Norris as a stress-test narrator confirmed that Lorevox handles high-density career data well. The film/TV title content did not cause any bucketing, rendering, or duplication issues. The only structural weakness exposed is the **profile loading race condition** (CN-1), which is not specific to Chuck but becomes more visible when switching rapidly between narrators with very different profiles (1835 vs 1940 DOB makes the stale data immediately obvious).

The popover render guard issues (CN-3, CN-4) were previously known from the Mark Twain/Janice test but are re-confirmed here as affecting every narrator uniformly.

**Recommendation:** Fix CN-1 before adding more real family narrators, as rapid switching between narrators is a common user workflow.
