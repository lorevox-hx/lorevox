# Curated Narrator Set Report — Lorevox 8.0

**Date:** 2026-03-30
**Purpose:** Document the three-narrator curated test set maintained for Lorevox 8.0 development and QA

---

## Narrator Roster

All non-essential narrators have been deleted. The following three narrators are the active curated set.

### 1. Walt Disney ("Walter") — REAL

| Field | Value |
|-------|-------|
| UUID | `2ed81e8d-baa3-4613-882d-966e87f8f835` |
| Full Name | Walter |
| DOB | 1901-12-05 |
| POB | Chicago IL |
| Badge | REAL |
| Spouse | Lillian Bounds Disney (added Phase 2) |

**Role in test suite:** Primary / default narrator. Loaded first on page initialization. Used as baseline for era date calculations and profile hydration testing. Not to be used for destructive testing.

**Family Tree:** Contains seeded family members.
**Life Threads:** Contains seeded data.
**Questionnaire:** Personal Information 6/7 filled (from server profile).

---

### 2. Chuck Norris — TEST

| Field | Value |
|-------|-------|
| UUID | `4b6ee62a-c5a0-4d46-8e3d-694e20249784` |
| Full Name | Chuck Norris |
| Legal Name | Carlos Ray Norris |
| DOB | 1940-03-10 |
| POB | Ryan, Oklahoma |
| Badge | TEST |
| Spouse | Dianne Holechek (added Phase 2) |

**Role in test suite:** Secondary test narrator. Used for narrator switch testing, cross-narrator bleed verification, and Lori grounding checks. Safe for destructive questionnaire testing.

**Family Tree:** Contains seeded family members.
**Life Threads:** Contains seeded data.
**Questionnaire:** Personal Information 6/7 filled (from server profile). All other sections empty (by design — no persistence).
**Lori behavior:** Correctly greets as "Chuck", references Ryan Oklahoma and Texas childhood, asks about martial arts and military service.

---

### 3. Mark Twain — TEST

| Field | Value |
|-------|-------|
| UUID | `eebf0314-2fba-4e27-95a5-80f649abaa3e` |
| Full Name | Mark Twain |
| Legal Name | Samuel Langhorne Clemens |
| DOB | 1835-11-30 |
| POB | Florida, Missouri |
| Badge | TEST |
| Spouse | Olivia "Livy" Langdon Clemens (added Phase 2) |

**Role in test suite:** Richest test narrator. Has the most Family Tree data (11+ members including John Marshall Clemens, Livy, Samuel B. Clemens as grandparent), Life Threads data (persons, places including Hannibal MO, Hartford CT, Elmira NY), and interview history. Primary narrator for questionnaire persistence testing (WD-1/WD-2 repro).

**Family Tree (verified post-refresh):**
- PARENT (1): John Marshall Clemens — seeded, "Justice of the peace, died 1847"
- SPOUSE (1): Livy — deceased, manual, b. 1845-11-27, d. 1904-06-05, married Feb 2 1870 in Elmira NY
- GRANDPARENT (4): Samuel B. Clemens + others
- Stats: 10 unconnected, 11 unsourced

**Life Threads (verified post-refresh):**
- PERSONS (1): Mark Twain
- PLACES (4): Hannibal Missouri, Hartford Connecticut, Elmira New York, + 1 more
- 12 orphan edges

**Questionnaire:** Personal Information 6/7 filled. Parents and all other sections empty (data loss confirmed via WD-1/WD-2 testing).

**Lori behavior:** Correctly greets as "Mark", references Florida Missouri childhood, asks about community, family, siblings, and literary circle with William Dean Howells. Correctly references spouse Olivia Langdon when asking about relationships.

---

## Spouse Records (Added Phase 2)

All three narrators had spouse/wife records added during Phase 2 of this work order:

| Narrator | Spouse Name | Marriage Details |
|----------|-------------|-----------------|
| Walter (Walt Disney) | Lillian Bounds Disney | — |
| Chuck Norris | Dianne Holechek | — |
| Mark Twain | Olivia "Livy" Langdon Clemens | Feb 2, 1870, Elmira NY; b. 1845-11-27, d. 1904-06-05 |

Lori correctly incorporates spouse data into interview questions for all three narrators.

---

## Narrator Interaction Matrix

| Action | Walter | Chuck Norris | Mark Twain |
|--------|--------|-------------|------------|
| Lori greeting (correct name) | PASS | PASS | PASS |
| Lori greeting (correct POB) | PASS | PASS | PASS |
| Bio Builder Quick Capture placeholder | PASS | PASS | PASS |
| Questionnaire Personal Info (6/7) | PASS | PASS | PASS |
| Family Tree (persisted) | PASS | PASS | PASS |
| Life Threads (persisted) | PASS | PASS | PASS |
| Life Map (correct eras after load) | PASS | PASS | PASS |
| Peek at Memoir (clean state) | PASS | PASS | PASS |
| WebSocket connection | PASS | PASS | PASS |
| Cross-narrator identity bleed | NONE | NONE | NONE |

---

## Runtime Model Verification

Runtime model (`[Lori 7.1] runtime71 (sys) → model:`) verified for each narrator after switch:

**Walter:**
- `speaker_name`: "Walter"
- `dob`: "1901-12-05"
- `pob`: "Chicago IL"
- `identity_complete`: true
- `effective_pass`: "pass2a"

**Chuck Norris:**
- `speaker_name`: "Chuck Norris"
- `dob`: "1940-03-10"
- `pob`: "Ryan, Oklahoma"
- `identity_complete`: true
- `effective_pass`: "pass2a"

**Mark Twain:**
- `speaker_name`: "Mark Twain"
- `dob`: "1835-11-30"
- `pob`: "Florida, Missouri"
- `identity_complete`: true
- `effective_pass`: "pass2a"

All runtime models are clean — no stale data from previous narrators in the active model at time of greeting.

---

## Recommendations

1. **Do not delete these three narrators** — they form the curated test set for ongoing QA
2. **Do not use Walter for destructive testing** — he is the REAL narrator
3. **Mark Twain is the preferred narrator for persistence bug repro** — richest data set
4. **Next work order priority:** Implement per-narrator questionnaire persistence to resolve WD-1/WD-2, using the same localStorage pattern already proven by Family Tree (`lorevox_ft_draft_{pid}`)
