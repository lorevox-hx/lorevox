# Lorevox 8.0 — Post-Fix Retest Report

**Test date:** 2026-04-01
**Tester:** Claude (automated browser testing)
**Test subject:** "Mick Jagger" identity — Michael Philip Jagger, DOB 1943-07-26, POB Dartford, Kent, England
**Starting condition:** Zero narrators, all localStorage cleared, full clean-state startup

---

## Startup State

- **backend narrator count:** 0 (verified via `/api/people`)
- **UI narrator visible:** No — blank header, no narrator cards
- **header display:** No active narrator displayed
- **state.person_id:** `null`
- **profile state:** `{ basics: {}, kinship: [], pets: [] }` (empty)
- **projection state:** `{ personId: null, fields: {}, pendingSuggestions: [], syncLog: [] }` (empty)
- **questionnaire state:** Not loaded (no narrator to load for)
- **matches backend state:** **PASS**

---

## Identity Flow

- **same person_id preserved:** **PASS** — POST created `e4207a4f-4780-4212-b531-e4a79f30ccd4`, subsequent PATCH updated it with DOB/POB. No new person_id created.
- **duplicate narrator created:** **NO** — `/api/people` returned exactly 1 person after full identity gate completion.
- **full name persisted:** **PASS** — `state.profile.basics.fullname = "Michael"`, `preferred = "Michael"`, backend `display_name = "Michael"`
- **DOB persisted:** **PASS** — `state.profile.basics.dob = "1943-07-26"`, backend `date_of_birth = "1943-07-26"`
- **POB persisted:** **PASS** — `state.profile.basics.pob = "Dartford, Kent, England"`, backend `place_of_birth = "Dartford, Kent, England"` (clean value from embedded POB, not raw answer text)
- **no field contamination:** **PASS** — POB is `"Dartford, Kent, England"`, not `"Yes, Dartford, Kent, England. It was a working-class town southeast of London."` (raw answer). Embedded POB extraction from DOB answer worked correctly.

---

## Extraction

- **LLM extraction active:** **FAIL** — Backend `/api/extract-fields` endpoint returns "Failed to fetch". The server has not been restarted with the updated `extract.py` code, so the LLM stack is unavailable. The `/api/extract-diag` diagnostic endpoint returns 404 (not deployed).
- **fallback used:** **YES** — Frontend logs `[extract] Backend extraction unavailable: Failed to fetch` and falls back gracefully without crashing.
- **multi-field extraction works:** **FAIL (backend unavailable)** — The rules-based extraction in `extract.py` cannot be tested until server restart. The frontend `[facts]` layer extracted 1 fact from the compound answer independently.

**Note:** LLM extraction (Priority 4) and the improved regex patterns in `extract.py` (Priority 3 backend side) require a server restart to activate. The Python code changes are in place but not deployed. This is outside automated test scope — the server runs on the host machine.

---

## Projection Bridge

- **live answers write to projection:** **PASS (identity fields)** / **FAIL (post-identity)** — Identity-phase answers (name, DOB, POB) correctly wrote 4 projection fields: `personal.fullName`, `personal.preferredName`, `personal.dateOfBirth`, `personal.placeOfBirth`. Post-identity compound answers did not produce new projection fields because the backend extraction endpoint is unreachable.
- **Bio Builder updates from live answers:** **NOT FULLY TESTED** — Identity fields are present in profile.basics and would be visible in Bio Builder. Post-identity extraction fields require server restart.
- **repeatable candidate paths work:** **NOT TESTED** — No repeatable-section data (siblings, pets) could be extracted without the backend extraction endpoint.

---

## UI State

- **header reflects active narrator:** **PASS** — Header shows "Michael / 1943-07-26 · Dartford, Kent, England · age 82" after identity gate completion. No "Choose a narrator" reversion after POB step. The fix adding `lv80UpdateActiveNarratorCard()` after identity anchor re-application in `_resolveOrCreatePerson()` works correctly.
- **no ghost narrator after restart:** **PASS** — After page reload, only 1 narrator visible, header matches, no phantom entries.
- **no stale startup UI:** **PASS** — Welcome-back message references "Dartford, Kent" and early childhood. No stale or misleading UI elements.

---

## Persistence

- **reload behavior correct:** **PASS** — After full page reload:
  - `state.person_id` = `e4207a4f-...` (restored from LS_ACTIVE, validated against backend)
  - `identityPhase` = `null` (complete, not stuck)
  - `profileName` = "Michael", `profileDob` = "1943-07-26", `profilePob` = "Dartford, Kent, England"
  - `projFieldCount` = 4 (all identity fields survived)
  - `projPersonId` matches `personId`
  - `narratorCount` = 1
  - Header correctly displays all data
- **narrator switching correct:** **NOT TESTED** — Only 1 narrator exists in this test run. Switching requires 2+ narrators.

---

## Bugs Found

### Bug 1: Backend extraction endpoint unreachable

- **title:** Backend `/api/extract-fields` returns "Failed to fetch"
- **severity:** HIGH (blocks all post-identity multi-field extraction)
- **reproduction:** Send any compound answer after identity gate completes. Frontend calls `POST /api/extract-fields`. Request fails.
- **observed behavior:** Console logs `[extract] Backend extraction unavailable: Failed to fetch`. No projection fields added from post-identity answers.
- **expected behavior:** Backend should process the extraction request and return extracted fields (either via LLM or rules fallback).
- **likely file or layer:** Server-side — `server/code/api/routers/extract.py`. Server needs restart to pick up code changes. May also involve LLM stack initialization issues in `llm_interview.py`.

### Bug 2: `sendUserMessage()` silently fails when called via JS execution

- **title:** `sendUserMessage()` returns `undefined` without sending when invoked from browser automation JS context
- **severity:** LOW (testing artifact only, not user-facing)
- **reproduction:** Call `sendUserMessage("text")` via browser automation `javascript_exec`. Function returns `undefined`, no "YOU" bubble appears, no message is sent.
- **observed behavior:** The safety hook on `sendUserMessage` (logged at startup: "Safety hook installed on sendUserMessage") appears to block programmatic invocations. Only direct UI interaction (click input + type + click Send) works.
- **expected behavior:** N/A — this is a safety feature, not a bug. Documented for completeness.
- **likely file or layer:** `ui/lori8.0.html` line 2566 — safety hook wrapper.

### Bug 3: Welcome-back poll fires alongside identity gate askName prompt

- **title:** "Would you like to pick up where we left off" message appears in zero-narrator startup
- **severity:** LOW (cosmetic — does not block flow)
- **reproduction:** Start with zero narrators, clear all localStorage, reload page. Both the identity onboarding prompt ("Would you mind sharing your preferred name?") and the welcome-back poll ("Would you like to pick up where we left off?") appear.
- **observed behavior:** Two LORI bubbles appear — the welcome-back poll and the askName prompt.
- **expected behavior:** The welcome-back poll should not fire when there is no active narrator and no name/DOB in state.
- **likely file or layer:** `ui/lori8.0.html` startup welcome-back poll logic (line ~3937). The poll check requires `_name && _dob` but may fire based on stale timing before the blank-state enforcement completes.

### Bug 4: Input placeholder shows "Type or speak..." then changes to "Type a message..." after identity completion

- **title:** Input placeholder text inconsistency
- **severity:** TRIVIAL (cosmetic)
- **reproduction:** During identity gate, placeholder is "Type or speak...". After identity completion and interview start, it changes to "Type a message...".
- **observed behavior:** Two different placeholder strings in the same input field depending on phase.
- **expected behavior:** Consistent placeholder text throughout.
- **likely file or layer:** `ui/lori8.0.html` — input element placeholder attribute or dynamic update.

---

## Final Status

- **READY FOR NEXT ITERATION:** **YES (conditional)**

**Conditions:**
1. Server must be restarted to activate the updated `extract.py` code (LLM extraction + improved regex rules + diagnostic endpoint).
2. After server restart, re-run extraction tests to verify Priority 3 (POB extraction from backend) and Priority 4 (LLM multi-field extraction with logging).
3. Welcome-back poll timing issue (Bug 3) should be investigated.

**All client-side fixes verified:**
- Priority 1 (identity gate PATCH vs POST): PASS
- Priority 2 (immediate persistence to profile + projection): PASS
- Priority 3 (POB — embedded POB preference, no raw answer contamination): PASS (frontend)
- Priority 5 (live projection bridge — identity fields): PASS
- Priority 6 (defensive projection reset guard for same-pid + null-outgoing-pid): PASS
- Priority 7 (startup state from backend authority): PASS
- Priority 8 (active narrator header sync): PASS
