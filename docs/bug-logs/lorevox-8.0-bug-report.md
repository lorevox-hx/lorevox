# Lorevox 8.0 Celebrity Stress Test — Bug Report

**Date:** March 30, 2026
**Tester:** Automated (Claude + Chrome)
**Build:** Lorevox 8.0 (lori8.0.html)

---

## Executive Summary

Eight celebrity narrators were created and tested across seven phases: Bio Builder verification, chronology normalization, relationship handling, Lori grounding, peek panels (Life Map and Memoir), and delete/restore safety. **9 bugs confirmed: 2 High, 4 Medium, 3 Low.** (LV-001 was a false positive — see note below.)

**Test narrators:** Walt Disney (d. 1966), Donald Trump, Martha Stewart, William Shatner, Billie Jean King, Maggie Smith (d. 2024), James Baldwin (d. 1987), Bayard Rustin (d. 1987). Existing narrator Walter retained.

---

## Bug Summary Table

| ID | Title | Severity | Phase |
|---|---|---|---|
| ~~LV-001~~ | ~~Dual profile endpoints return different data~~ | ~~HIGH~~ | ~~FALSE POSITIVE~~ |
| LV-002 | Lori greets deceased narrators in present tense | **HIGH** | Phase 3 |
| LV-003 | All narrators show REAL badge — no TEST/REAL distinction | MEDIUM | Phase 2 |
| LV-004 | Idle prompt system fires ghost greetings during automation | MEDIUM | Phase 5 |
| LV-005 | Family Tree tab ignores profile kinship data | **HIGH** | Phase 2 |
| LV-006 | Header bar and narrator cards don't show deceased status | MEDIUM | Phase 3 |
| LV-007 | POB truncated in active narrator header | LOW | Phase 3 |
| LV-008 | Life Map era labels truncated and overlapping | LOW | Phase 6 |
| LV-009 | Questionnaire Parents section empty despite profile kinship | MEDIUM | Phase 2 |
| LV-010 | No age calculation displayed anywhere in UI | LOW | Phase 3 |

---

## Detailed Bug Reports

### ~~LV-001 — Dual profile endpoints return different data~~ [FALSE POSITIVE]

**Status:** Closed — false positive. On re-investigation, `/api/profile/{id}` (singular) returns 404 Not Found, not stale data. Only `/api/profiles/{id}` (plural) exists. No frontend code references the singular form. The original observation was a testing artifact from the earlier session.

---

### LV-002 — Lori greets deceased narrators in present tense [HIGH]

**Phase:** 3 — Chronology Normalization

**Description:** When a narrator has `deceased=true` and a `dod` in their profile, Lori still greets them as if alive. Walt Disney (d. 1966) gets: "Welcome back, Walt, it's great to have you here today." Maggie Smith (d. 2024) gets similar present-tense greetings.

**Steps to Reproduce:**
1. Create narrator with `deceased: true` and `dod` set
2. Switch to that narrator
3. Observe Lori's greeting uses present tense

**Expected:** Lori should use past-tense or memorial framing appropriate for a life archive of a deceased person.
**Actual:** Lori uses present tense for all narrators regardless of deceased status.

---

### LV-003 — All narrators show REAL badge — no TEST/REAL distinction [MEDIUM]

**Phase:** 2 — Bio Builder Verification

**Description:** Narrator card badges always display "REAL" regardless of creation method. `lv80NarratorKind()` checks the person's `role` field, but API-created narrators get `role=""` (empty), which maps to "real". No API field or mechanism to mark a narrator as test data.

**Steps to Reproduce:**
1. Create narrators via `POST /api/people`
2. Open narrator picker — all show "REAL" badge

**Expected:** Ability to mark narrators as test data, with "TEST" badge displayed.
**Actual:** All narrators show "REAL" badge. No test/real distinction mechanism exists.

---

### LV-004 — Idle prompt system fires ghost greetings during automation [MEDIUM]

**Phase:** 5 — Lori Grounding

**Description:** The idle prompt system (`lori8.0.html` line 2241) fires `sendSystemPrompt()` on user idle. The idle timer clears on `keydown` events on chatInput (line 3770-3771). Browser automation bypasses keydown, so idle timers never clear. This causes cascading ghost greeting bubbles and 30-second timeout errors appearing as "Chat service unavailable" messages.

**Steps to Reproduce:**
1. Open UI via automation tool
2. Switch narrators or wait idle
3. Multiple LORI greeting bubbles accumulate
4. "Chat service unavailable" timeout errors appear

**Expected:** Idle prompt system should be resilient to non-keyboard input or have an automation-safe flag.
**Actual:** Ghost greetings accumulate. Each triggers a 30s timeout that can produce error bubbles.

---

### LV-005 — Family Tree tab ignores profile kinship data [HIGH]

**Phase:** 2 — Bio Builder Verification

**Description:** The Family Tree tab reads exclusively from localStorage drafts (`familyTreeDraftsByPerson`), not from the server-side `profile.kinship` field. Profile kinship data seeded via `PUT/PATCH /api/profiles/{id}` is invisible to the Family Tree tab. Shows empty state with "Seed from Questionnaire" and "Seed from Candidates" buttons, but no "Seed from Profile" option.

**Steps to Reproduce:**
1. Seed kinship data via `PATCH /api/profiles/{id}` with kinship array (e.g. 4 family members for Maggie Smith)
2. Open Bio Builder → Family Tree tab
3. Tab shows empty state despite server-side kinship data existing

**Expected:** Family Tree should auto-populate from profile kinship or offer "Seed from Profile" button.
**Actual:** Family Tree shows empty. No connection to server-side kinship data.

**Code:** `bio-builder-core.js` lines 122-129 — `_loadDrafts()` reads from `localStorage.getItem(_LS_FT_PREFIX + pid)` only.

---

### LV-006 — Header bar and narrator cards don't show deceased status or death date [MEDIUM]

**Phase:** 3 — Chronology Normalization

**Description:** Active narrator header (`lv80UpdateActiveNarratorCard`, line 2037-2038) only displays fullname, dob, and pob. Never checks `deceased` or `dod`. Narrator cards in picker (line 2062) also only show DOB and POB. Deceased narrators (Disney d.1966, Smith d.2024, Baldwin d.1987, Rustin d.1987) are visually indistinguishable from living narrators.

**Steps to Reproduce:**
1. Create narrators with `deceased: true` and `dod`
2. Open narrator picker — no deceased indicator
3. Switch to deceased narrator — header shows only DOB, no DOD or age

**Expected:** Deceased narrators show death date and/or visual indicator (e.g. "1901-1966" or memorial icon).
**Actual:** No deceased indicator anywhere in UI chrome.

---

### LV-007 — POB truncated in active narrator header [LOW]

**Phase:** 3 — Chronology Normalization

**Description:** Long place-of-birth strings are truncated with ellipsis. William Shatner shows "Montreal, Quebec, Cana..." instead of full "Montreal, Quebec, Canada".

**Expected:** Full POB visible, or smart abbreviation.
**Actual:** Hard truncation mid-word.

---

### LV-008 — Life Map era labels truncated and overlapping [LOW]

**Phase:** 6 — Peek Panels

**Description:** Life Map radial layout truncates era date ranges (e.g. "Early Childhood · 1931-19..." instead of full year range) and two bottom nodes overlap ("Early Adulthood" and "Adolescence" collide visually).

**Expected:** All era labels fully visible with no overlaps.
**Actual:** Truncated dates and overlapping nodes at bottom of radial layout.

---

### LV-009 — Questionnaire Parents section empty despite profile kinship data [MEDIUM]

**Phase:** 2 — Bio Builder Verification

**Description:** Questionnaire tab's "Parents" section shows "Empty" even when profile kinship array contains father and mother entries. Similar to LV-005 — Questionnaire sections don't cross-reference server-side kinship data. Only Personal Information (5/7 filled) reads from profile basics.

**Expected:** Parents section should pre-populate or indicate kinship data exists.
**Actual:** Parents shows "Empty" despite kinship data present server-side.

---

### LV-010 — No age calculation displayed anywhere in UI [LOW]

**Phase:** 3 — Chronology Normalization

**Description:** No part of the UI calculates or displays narrator's current age (living) or age at death (deceased). Header shows raw DOB only. For a life archive application, age context is important.

**Expected:** Age in header or cards (e.g. "William Shatner, 95" or "Walt Disney, 1901-1966 (age 65)").
**Actual:** Only raw DOB shown. No age computation.

---

## What Worked Well

- Chat backend is stable after CUDA OOM fixes (thread lock, non-fatal warmup, warmup loop break)
- Profile seeding via PUT/PATCH `/api/profiles` works correctly for basics and kinship data
- Narrator creation via POST `/api/people` works reliably for all 8 celebrity test narrators
- Bio Builder popover renders all 6 tabs without errors
- Questionnaire Personal Information section correctly populates from profile basics (5/7 fields)
- Candidates tab renders clean empty state with proper category filters
- Lori grounding uses correct preferred name, birth city, and era context for each narrator
- Life Map auto-generates era nodes from DOB with correct date ranges
- Memoir peek panel renders with Save TXT/DOCX export buttons
- Soft delete with DELETE confirmation dialog works correctly
- API restore (`POST /api/people/{id}/restore`) works correctly
- Delete/restore round-trip preserves all narrator data including profile
