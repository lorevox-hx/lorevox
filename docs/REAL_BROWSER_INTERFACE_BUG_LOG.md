# Real-Browser Interface Bug Log — Lorevox 8.0

**Date:** 2026-03-30
**Tester:** Automated (Claude via Chrome MCP)
**Test type:** Real-browser DOM interaction

---

## BUG-001: WebSocket Fails to Reconnect on F5/Ctrl+Shift+R After API Downtime

**Severity:** Medium
**Status:** Open
**Component:** WebSocket initialization / lori8.0.html

**Description:**
After the API server (port 8000) goes down and is restarted, pressing F5 or Ctrl+Shift+R to reload the page fails to re-establish the WebSocket connection. The UI loads but `state.chat.ws` remains null (`hasWs: false`), and Lori displays "Chat service unavailable — start the Lorevox backend to enable AI responses."

**Repro steps:**
1. Load Lorevox 8.0 with API running — WebSocket connects (green dot)
2. Stop the API server
3. Observe "Failed to fetch" errors in console for `_memoirLoadStoredFacts` and `lv80LoadPeople`
4. Restart the API server
5. Press F5 or Ctrl+Shift+R
6. Page reloads but WebSocket does NOT connect — blue/grey dot, `hasWs: false`
7. Workaround: Full URL navigation (`navigate` to `http://localhost:8080/ui/lori8.0.html`) successfully reconnects

**Root cause hypothesis:** Race condition in WebSocket initialization during page reload. The `onload` handler may attempt WebSocket connection before the API server's socket listener is fully ready, and there is no retry/backoff mechanism.

**Impact:** User must know to do a full URL navigation instead of a simple refresh after API recovery. Not critical (self-heals with full navigation) but confusing UX.

**Suggested fix:** Add WebSocket connection retry with exponential backoff (e.g., 1s, 2s, 4s, max 30s) when initial connection fails.

---

## BUG-002: Life Map Era Date Ranges Not Recalculated on Narrator Switch

**Severity:** Low (downgraded from Medium)
**Status:** Open
**Component:** Life Map era calculation / lori8.0.html

**Description:**
Life Map era date ranges are computed once from the first narrator loaded in a session and cached. When switching narrators within the same session (without page reload), subsequent narrators display era dates computed from the first narrator's date of birth rather than their own.

**Repro steps:**
1. Load page — Walter (DOB 1901-12-05) loads as default narrator
2. Open Life Map — shows Born 1901, School Years 1907–1913 (correct)
3. Switch to Chuck Norris (DOB 1940-03-10) — do NOT reload page
4. Open Life Map — shows Born 1901, School Years 1907–1913 (WRONG — should be 1940, 1946–1952)
5. Reload page (full URL navigation)
6. Open Life Map for Chuck Norris — shows Born 1940, School Years 1946–1952 (CORRECT)

**Root cause:** Era date ranges are calculated once during initial Life Map render and stored in a session-scoped variable. The `lv80SwitchPerson` flow does not trigger era recalculation.

**Impact:** Visual incorrectness only — era nodes show wrong date ranges after in-session narrator switch. Self-heals on page reload. No data corruption.

**Suggested fix:** Recalculate era date ranges in `_onNarratorSwitch()` or on Life Map popover open, using active narrator's DOB from `state.profile.dob`.

---

## WD-1: Questionnaire Data Loss on Narrator Switch

**Severity:** Medium
**Status:** FIXED (2026-03-30) — verified in real browser
**Component:** bio-builder.js, `_resetNarratorScopedState()` (line 237)

**Description:**
All questionnaire data except Personal Information is lost when switching narrators. The `_resetNarratorScopedState(newId)` function clears `bb.questionnaire = {}` on every narrator switch. Only the `personal` section is restored via `_hydrateQuestionnaireFromProfile(bb)` which reads from the server-persisted profile.

**Repro steps:**
1. On Mark Twain, open Bio Builder → Questionnaire → Parents
2. Enter First Name: "John", Last Name: "Clemens"
3. Click "Save Parents" — Parents shows "1 entry"
4. Switch to Chuck Norris via narrator dropdown
5. Switch back to Mark Twain
6. Open Bio Builder → Questionnaire
7. **Result:** Parents shows "Empty" — John Clemens data is gone
8. **Expected:** Parents should show "1 entry" with John Clemens data

**Sections affected (8 of 9):**
- Parents
- Grandparents
- Siblings
- Early Memories
- Education & Career
- Later Years
- Hobbies & Interests
- Additional Notes

**Section NOT affected (1 of 9):**
- Personal Information (6/7 filled — survives via server profile hydration)

**Root cause:** No persistence layer (localStorage or server-side) exists for non-personal questionnaire sections. Data lives only in `state.bioBuilder.questionnaire` (JS heap memory) and is wiped by `_resetNarratorScopedState()`.

**Impact:** Users who fill out questionnaire sections and then switch narrators lose all work. This is a significant data loss risk for multi-narrator workflows.

**Suggested fix:** Persist questionnaire data per narrator to localStorage using key `lorevox_questionnaire_{person_id}`, similar to how Family Tree uses `lorevox_ft_draft_{pid}`. Restore on narrator switch via the existing `_onNarratorSwitch()` flow.

---

## WD-2: Questionnaire Data Loss on Page Refresh

**Severity:** Medium
**Status:** FIXED (2026-03-30) — verified in real browser
**Component:** bio-builder.js, state initialization

**Description:**
All questionnaire data except Personal Information is lost on page refresh. Same root cause as WD-1 — no persistence layer.

**Repro steps:**
1. On Mark Twain, open Bio Builder → Questionnaire → Parents
2. Enter First Name: "John", Last Name: "Clemens"
3. Click "Save Parents" — Parents shows "1 entry"
4. Navigate to `http://localhost:8080/ui/lori8.0.html` (full page reload)
5. Open Bio Builder → Questionnaire
6. **Result:** Parents shows "Empty" — John Clemens data is gone

**Root cause:** Same as WD-1. `state.bioBuilder.questionnaire` is initialized to `{}` on page load. No hydration from localStorage or server for non-personal sections.

**Impact:** Any browser refresh, crash, or accidental navigation loses all questionnaire work (except Personal).

**Suggested fix:** Same as WD-1 — localStorage persistence keyed by `person_id`.

---

## WD-3: Form Field Key Mismatch (from prior session)

**Severity:** Low
**Status:** Open
**Component:** bio-builder.js, questionnaire form rendering

**Description:**
Some questionnaire form field keys don't match the expected profile key names. This is a cosmetic/mapping issue that doesn't cause data loss but may cause confusion in the UI or incorrect field pre-population.

**Impact:** Minor — cosmetic only. Does not affect data integrity.

---

## Persistence Matrix

| Data Type | Narrator Switch | Page Refresh | Storage Mechanism |
|-----------|----------------|--------------|-------------------|
| Personal Info (questionnaire) | SURVIVES | SURVIVES | Server profile → `_hydrateQuestionnaireFromProfile()` |
| Parents–Additional Notes (questionnaire) | SURVIVES | SURVIVES | localStorage (`lorevox_qq_draft_{pid}`) — FIXED 2026-03-30 |
| Family Tree | SURVIVES | SURVIVES | localStorage (`lorevox_ft_draft_{pid}`) |
| Life Threads | SURVIVES | SURVIVES | localStorage |
| Life Map era dates | STALE (cached) | CORRECT (recalculated) | Computed on load, cached in session |
| Memoir state | CLEAN | CLEAN | Server-side |
| Chat history | RESET | RESET | Session-scoped |

---

## Priority Recommendations

1. ~~**HIGH:** Implement per-narrator questionnaire persistence (WD-1/WD-2)~~ — **DONE** (2026-03-30)
2. **MEDIUM:** Add WebSocket reconnection retry logic (BUG-001)
3. **LOW:** Trigger Life Map era recalculation on narrator switch (BUG-002)
4. **LOW:** Fix form field key mismatches (WD-3)

---

## WD-1/WD-2 Fix Verification Report (2026-03-30)

**Fix applied to:** `ui/js/bio-builder.js`
**localStorage key pattern:** `lorevox_qq_draft_{person_id}`
**Schema:** `{ v: 1, d: <questionnaire_object> }`

### Changes Made

1. **`_LS_QQ_PREFIX` constant** — `"lorevox_qq_draft_"` added alongside FT/LT prefixes
2. **`_persistDrafts(pid)`** — saves `bb.questionnaire` to localStorage, GUARDED by `pid === bb.personId` to prevent cross-narrator writes (FT/LT use per-person containers so don't need this guard)
3. **`_loadDrafts(pid)`** — loads questionnaire from localStorage BEFORE the FT early-return guard (the original early return at line 315 was preventing QQ from loading when FT data was already in memory)
4. **`_clearDrafts(pid)`** — removes questionnaire localStorage key
5. **`_resetNarratorScopedState(newId)`** — persist outgoing narrator's data before clearing, load incoming after
6. **`_personChanged(newId)`** — same persist-before-clear pattern
7. **`_saveSection()`** — calls `_persistDrafts(pid)` immediately on save for instant persistence

### Bugs Found During Initial Fix Attempt

Two bugs in the first implementation were caught during testing:

1. **Early return bug:** `_loadDrafts()` had an early return (line 315) when FT data was already in memory. This prevented QQ from ever being loaded. Fix: moved QQ load above the early return guard.
2. **Cross-narrator write bug:** `_persistDrafts(pid)` saved `bb.questionnaire` (which belongs to the CURRENT narrator) to whatever `pid` was passed. Since FT/LT operations call `_persistDrafts(pid)` frequently, this could write the wrong narrator's QQ to the wrong key. Fix: guard `if (pid === bb.personId)` around QQ persist.

### Verification Results

| Test | Narrator | Result |
|------|----------|--------|
| WD-1: Data survives narrator switch | Mark Twain → Chuck Norris → Mark Twain | **PASS** |
| WD-2: Data survives page refresh | Mark Twain (full URL navigation reload) | **PASS** |
| Cross-narrator bleed check | Chuck Norris (no Mark Twain data leaks) | **PASS** |
| Console errors during full test | All narrators | **ZERO** |

### Sections Verified (Mark Twain)

| Section | Data Entered | After Switch (WD-1) | After Refresh (WD-2) |
|---------|-------------|---------------------|---------------------|
| Personal Information | 6/7 (server) | 6/7 filled ✓ | 6/7 filled ✓ |
| Parents | Father: John Marshall Clemens | 1 entry ✓ | 1 entry ✓ |
| Siblings | Brother: Orion Clemens | 1 entry ✓ | 1 entry ✓ |
| Early Memories | Mississippi River + father's death | 2/3 filled ✓ | 2/3 filled ✓ |

### Deep Data Verification

Parents form fields after page refresh: Relation=Father, First Name=John, Middle Name=Marshall, Last Name=Clemens — all field values preserved exactly.

**Verdict: WD-1 and WD-2 are RESOLVED. Questionnaire persistence is now on par with Family Tree and Life Threads.**
