# Lorevox 8.0 — Mick Jagger Diagnostic Bug Report (Complete Test Accountability)

**Date:** 2026-04-01
**Environment:** Clean slate — all 53 prior narrators deleted, localStorage fully cleared (`localStorage.clear()`), one fresh "Mick" narrator created via API (`49e9ec15`), identity gate completed through UI.

---

## Requirement Clarification

This test establishes a strict rule:

Claude must report all defects observed during execution, not only those that fit the predefined test scope.

A valid test report must include: primary pipeline failures, secondary system failures, UI inconsistencies, state mismatches, and persistence anomalies. If a defect is observed during testing, it must be included. Failure to include observed defects is itself a reporting failure.

---

## Test Results Summary

| Test | Target | Result |
|------|--------|--------|
| 1a — Direct projection write (flat) | `LorevoxProjectionSync.projectValue("personal.fullName", ...)` | **PASS** |
| 1b — Direct projection write (repeatable) | `LorevoxProjectionSync.projectValue("parents[0].firstName", ...)` | **PASS** |
| 2 — Backend extraction endpoint | `POST /api/extract-fields` with compound answer | **PARTIAL PASS** |
| 3 — Live compound-answer bridge | Type compound answer in UI, check projection after | **FAIL** |

---

## Complete Bug List (All Observed During Test)

### Bug 1: Person Duplication on Identity Gate Save

**Description:** Identity gate creates a new person instead of updating the existing narrator.

**Observed Behavior:**
- Initial narrator: `49e9ec15` (display_name "Mick")
- New narrator created: `ae4711aa` (display_name "Michael")
- `state.person_id` switches to new ID
- API now contains 2 people instead of 1

**Impact:** Breaks continuity. Causes downstream data loss. Every identity gate completion doubles the narrator count.

**Where to look:** `ui/js/interview.js` — the identity gate completion handler. It does a `POST /api/people` (create) instead of `PATCH /api/people/{id}` (update) when `state.person_id` already exists.

---

### Bug 2: Projection State Wiped on Person Switch

**Description:** Projection data is reset when `person_id` changes.

**Observed Behavior:**
- Projection populated before identity completion (2 manually-written fields)
- After identity gate save: projection empty (`fields: {}`)
- localStorage keys `lorevox_proj_draft_*` and `lorevox_qq_draft_*` cleared to `null`
- `resetForNarrator()` called for the new person ID, destroying all existing data

**Impact:** Loss of all structured data. Any projection writes made before the identity gate completes are orphaned.

---

### Bug 3: Place of Birth Field Contaminated

**Description:** Entire compound answer stored in `place_of_birth`.

**Observed Behavior:**
- New person record `ae4711aa` has:
  ```
  place_of_birth: "Yes, I grew up right there in Dartford. My father Joe was a PE teacher and my mum Eva was a hairdresser. We lived at 39 Denver Road. I had a younger brother Chris. It was a pretty ordinary working-class childhood really."
  ```
- Should have been: "Dartford, Kent, England"

**Impact:** Corrupts canonical identity data. POB extraction grabs raw answer text of whatever turn follows DOB, rather than extracting just the place content. Since the DOB answer already contained the POB ("born July 26, 1943 in Dartford, Kent, England"), the system didn't ask a separate POB question — and assigned the next turn's full answer as POB.

**Where to look:** Identity gate in `interview.js` assigns turn answers positionally (turn 1 = name, turn 2 = DOB, turn 3 = POB) without extracting the actual field value from the answer.

---

### Bug 4: LLM Extraction Not Executing

**Description:** Extraction endpoint uses rules fallback only; LLM never fires.

**Observed Behavior:**
- `POST /api/extract-fields` returns status 200
- Response: `"method": "rules"`, `"raw_llm_output": null`
- Single item returned with the entire answer echo-dumped into `current_target_path`

**Impact:** No multi-field extraction. The entire extraction pipeline is reduced to a dumb echo.

**Where to look:** `server/code/api/routers/extract.py` — the LLM call path. Either the LLM API key is misconfigured, the call is failing silently and falling through to rules, or LLM extraction is disabled.

---

### Bug 5: Multi-Field Extraction Failure

**Description:** Compound answers not decomposed into multiple fields.

**Observed Behavior:**
- Answer: "My father was a PE teacher, my mother was a hairdresser, and we lived on Denver Road in Dartford."
- Expected: 4+ field items (father name/occupation, mother name/occupation, childhood address, location)
- Actual: 1 item — entire string dumped into `earlyMemories.firstMemory`

**Impact:** Loss of structured data. Compound answers that contain multiple extractable facts produce zero useful projections.

---

### Bug 6: Projection Bridge Not Triggered

**Description:** Live interview answers do not write to projection.

**Observed Behavior:**
- Manual `LorevoxProjectionSync.projectValue()` calls succeed (Test 1)
- Live answers typed into UI and processed by Lori produce zero new projection fields
- After live compound answer: `projection_field_count: 0`

**Impact:** The system does not capture conversation data into structured fields during live interview. The entire extraction-to-projection bridge is non-functional.

---

### Bug 7: Ghost Narrator After API Wipe

**Description:** UI shows narrator after backend confirms empty state.

**Observed Behavior:**
- All 53 narrators deleted via API (verified: `GET /api/people` returns 0)
- All localStorage cleared (verified: `localStorage.clear()`, 0 keys)
- Page reloaded
- UI still displays "Mick" with DOB 1943-01-01 and POB "Dartford, Kent, England" in the header
- `state.person_id` confirmed as the old deleted ID

**Root cause:** Four localStorage keys survived the first targeted wipe (`lorevox_offline_profile_*`, `lorevox_offline_people`, `lv_active_person_v55`, `__mj_test_pid`). The offline people cache and active-person pointer were not covered by the prefix-based cleanup. Required `localStorage.clear()` to fully purge.

**Impact:** Invalid test baseline. Misleading state. Ghost narrators can persist across wipes if offline cache keys are not cleared.

---

### Bug 8: Header Not Reflecting Active Narrator

**Description:** Header shows "Choose a narrator" while narrator is active and conversation is in progress.

**Observed Behavior:**
- `state.person_id` is valid (`49e9ec15`)
- Lori is actively conversing (asking DOB question)
- Interview is in progress
- Header displays "Choose a narrator / Choose a narrator" instead of "Mick"

**Impact:** UI inconsistency. Confuses user and tester. Header state is not bound to `state.person_id` or updates lag behind state changes.

---

### Bug 9: Identity Data Not Persisting from Conversation

**Description:** Name, DOB, and POB provided during identity gate are not written to profile or projection.

**Observed Behavior:**
- Turn 1: "My name is Michael Philip Jagger, but everyone calls me Mick." — Lori acknowledges ("wonderful to meet you, Michael")
- Turn 2: "I was born on July 26, 1943 in Dartford, Kent, England." — Lori acknowledges ("July 26th, 1943, in Dartford, Kent, England")
- After both turns: `state.profile.basics.fullname: ""`, `state.profile.basics.dob: ""`, `state.profile.basics.pob: ""`
- Projection fields: `{}` (empty)

**Impact:** Core intake broken at entry point. Lori verbally confirms identity data but the system never writes it to the profile or projection state. The identity gate is conversational theater — it collects nothing.

---

## Failure Chain Summary

```
Identity gate starts with existing person_id (49e9ec15)
  → Identity answers (name, DOB, POB) NOT written to profile or projection (Bug 9)
  → Identity gate completes
    → interview.js creates NEW person (Bug 1) instead of updating existing
      → person_id changes to ae4711aa
        → projection system resets for new person (Bug 2), wiping all data
          → POB gets entire raw answer text (Bug 3)
  → Compound answer goes to extraction
    → LLM extraction doesn't fire (Bug 4), rules fallback echo-dumps (Bug 5)
      → Bridge never writes to projection (Bug 6)
        → Zero structured data captured from entire conversation

Meanwhile:
  → UI header never updates to show active narrator (Bug 8)
  → Ghost narrators persist through incomplete wipes (Bug 7)
```

---

## Test Detail: Test 1 — Direct Projection Write (PASS)

Called `LorevoxProjectionSync.projectValue()` directly from console after Mick narrator was activated.

- `personal.fullName` = "Michael Philip Jagger" — wrote correctly, confidence 0.9, persisted to localStorage key `lorevox_proj_draft_49e9ec15`, synced to Bio Builder (`bb_prefilled` in syncLog).
- `parents[0].firstName` = "Basil" — wrote correctly as repeatable candidate, persisted to localStorage.

**Conclusion:** The projection-sync layer itself is solid. Both flat and repeatable field paths work. Write-mode enforcement, confidence gating, localStorage persistence, and BB sync are all functional.

---

## Test Detail: Test 2 — Backend Extraction Endpoint (PARTIAL PASS)

Called `POST /api/extract-fields` directly with:
```json
{
  "person_id": "49e9ec15",
  "answer": "My father was a PE teacher, my mother was a hairdresser, and we lived on Denver Road in Dartford.",
  "current_section": "early_childhood",
  "current_target_path": "earlyMemories.firstMemory",
  "profile_context": {}
}
```

**Response (status 200):**
```json
{
  "items": [{
    "fieldPath": "earlyMemories.firstMemory",
    "value": "My father was a PE teacher, my mother was a hairdresser, and we lived on Denver Road in Dartford.",
    "writeMode": "suggest_only",
    "confidence": 0.7,
    "source": "backend_extract",
    "extractionMethod": "rules"
  }],
  "method": "rules",
  "raw_llm_output": null
}
```

Endpoint responds but LLM path is dead. Rules fallback is the only path executing.

---

## Test Detail: Test 3 — Live Compound-Answer Bridge (FAIL)

Typed compound answer: "Yes, I grew up right there in Dartford. My father Joe was a PE teacher and my mum Eva was a hairdresser. We lived at 39 Denver Road. I had a younger brother Chris. It was a pretty ordinary working-class childhood really."

UI showed "Profile saved." then "Timeline spine initialized — Pass 2A (Timeline Walk) ready."

**Before:**
```
person_id: 49e9ec15-e44f-4638-b923-f2279e1342dd
projection fields: 2 (manual test data)
```

**After:**
```
person_id: ae4711aa-01cf-46ad-ac1e-27c5ad13aec2  ← CHANGED
projection fields: {}  ← WIPED
proj_ls: null  ← DESTROYED
qq_ls: null  ← DESTROYED

API people: [
  { id: ae4711aa, name: "Michael", dob: "1943-07-26", pob: "<entire compound answer>" },
  { id: 49e9ec15, name: "Mick", dob: "", pob: "" }
]
```

---

## Plan of Action

### Priority 1 — Fix Person Duplication (Bug 1)
**File:** `ui/js/interview.js`
- Identity gate completion handler must check `state.person_id`
- If person exists: `PATCH /api/people/{id}`, not `POST /api/people`
- Preserve person_id through identity-to-timeline transition

### Priority 2 — Fix Identity Data Persistence (Bug 9)
**File:** `ui/js/interview.js`
- Identity gate answers must write to `state.profile.basics` and call `LorevoxProjectionSync.projectValue()` for name, DOB, POB
- Each identity turn should extract and persist its field immediately, not batch at gate completion

### Priority 3 — Fix LLM Extraction (Bugs 4, 5)
**File:** `server/code/api/routers/extract.py`
- Add logging to LLM call path
- Determine why LLM is not executing (API key? model endpoint? silent exception?)
- Rules fallback should be last resort, not default

### Priority 4 — Fix POB Extraction (Bug 3)
**File:** `ui/js/interview.js`
- Extract POB value from answer text, not assign raw answer
- If DOB answer already contains POB, extract it from that turn
- Don't assign non-POB turn answers to POB field

### Priority 5 — Fix Projection Bridge (Bug 6)
**File:** `ui/js/interview.js`
- Trace `processInterviewAnswer()` → `_projectAnswerToField()` → `_extractAndProjectMultiField()` path
- Determine why live answers produce zero projection writes when direct calls work

### Priority 6 — Fix UI State Sync (Bugs 7, 8)
**Files:** `ui/js/app.js`, `ui/lori8.0.html`
- Header must bind to `state.person_id` reactively
- Offline people cache (`lorevox_offline_people`, `lv_active_person_v55`) must be cleared during narrator wipe
- Narrator display must update on state change, not just on page load

### Priority 7 — Defensive Projection Reset Guard (Bug 2)
**File:** `ui/js/projection-sync.js`
- If `resetForNarrator()` is called with same person_id, skip reset
- Before resetting, persist current state for recovery

---

## Final Status

| System | Status |
|--------|--------|
| Conversation system | Functioning |
| Projection system (direct) | Functioning |
| Extraction system | Degraded (LLM dead, rules-only) |
| Projection bridge | Non-functional |
| Identity flow | Incorrect (duplicates, no persistence) |
| UI state synchronization | Inconsistent |

**Overall Status: Not ready for next iteration.**
