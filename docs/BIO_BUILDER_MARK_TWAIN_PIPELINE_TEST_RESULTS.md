# Bio Builder — Mark Twain Full Pipeline Test Results

**Date:** 2026-03-28
**Narrator:** Mark Twain (Samuel Langhorne Clemens)
**Test ID:** mark_twain_test_001

---

## Test Summary

| Suite | Tests | Passed | Failed |
|---|---:|---:|---:|
| Questionnaire Normalization (Pass A) | 10 | 10 | 0 |
| Reverse Hydration (Pass E) | 2 | 2 | 0 |
| Section Save (Pass B) | 9 | 9 | 0 |
| Narrator Switch (Pass C) | 4 | 4 | 0 |
| Profile Sync (Pass D) | 1 | 1 | 0 |
| Identity Drift (Pass G) | 1 | 1 | 0 |
| Quick Capture | 2 | 2 | 0 |
| Source Inbox | 4 | 4 | 0 |
| Candidates | 4 | 4 | 0 |
| Family Tree | 5 | 5 | 0 |
| Life Threads | 6 | 6 | 0 |
| **Total** | **48** | **48** | **0** |

Regression suites also passed: v4/v5 baseline (103/103), v6 stress tests (31/31). Grand total: 182 tests, 0 failures.

---

## Stage 1: Questionnaire Results

### Pass A — Normalization
All normalization functions work correctly:
- `11301835` → `1835-11-30` ✓
- `12241962` → `1962-12-24` ✓
- `12/24/1962` → `1962-12-24` ✓
- `Dec 24 1962` → `1962-12-24` ✓
- `1250p` → `12:50 PM` ✓
- `12:50pm` → `12:50 PM` ✓
- `Florida MO` → `Florida, Missouri` ✓
- `Williston ND` → `Williston, North Dakota` ✓
- Zodiac derivation from DOB: `Sagittarius` (Nov 30) ✓, `Capricorn` (Dec 24) ✓

### Pass B — Section Save
All 9 sections save and read back correctly: personal (7 fields), parents (2 entries), grandparents (2 entries), siblings (2 entries), earlyMemories (3 fields), education (6 fields), laterYears (3 fields), hobbies (4 fields), additionalNotes (2 fields).

### Pass C — Narrator Switch
- Switching away resets questionnaire state (by design — questionnaire is session-scoped, FT/LT are persisted via localStorage)
- Switching back triggers reverse hydration: personal section repopulated from `state.profile.basics`, parents/siblings from `state.profile.kinship`
- Non-hydrateable sections (grandparents, earlyMemories, education, laterYears, hobbies, additionalNotes) do NOT survive switch — this is a known limitation

### Pass D — Profile Sync
`buildCanonicalBasicsFromBioBuilder()` correctly produces all canonical fields: fullname, preferred, dob, pob, legalFirstName, legalMiddleName, legalLastName, birthOrder, zodiacSign.

### Pass E — Reverse Hydration (Bug Fix Verified)
The core bug was confirmed and fixed:
- **Before fix:** Opening Bio Builder for an existing person showed blank questionnaire even though `state.profile.basics` had data
- **After fix:** `_hydrateQuestionnaireFromProfile()` runs in `_personChanged()` and populates empty questionnaire sections from the active profile
- Personal, parents, and siblings all hydrate correctly

### Pass G — Identity Drift
Legal name (`Samuel Langhorne Clemens`) and preferred name (`Mark Twain`) remain distinct through all pipeline stages. No collapse observed.

---

## Stage 2: Quick Capture Results
11 quick capture items saved and correctly tied to the Mark Twain narrator. No duplication, no drift.

## Stage 3: Source Inbox Results
Text extraction (`_parseTextItems`) on the Mark Twain source text:
- Places detected: Florida, Missouri; Hannibal (via movement verb anchors)
- People: Conservative detection — the parser requires "my/his/her + relation + ProperNoun" anchors. "His brother Orion" pattern may not fully match in all sentence structures (known parser limitation, not a bug)
- Dates and memories: structure present, detection is conservative by design

## Stage 4: Candidates Results
- 4 people candidates from questionnaire (John Marshall Clemens, Jane Lampton Clemens, Orion Clemens, Henry Clemens)
- 3 place candidates (Virginia, Kentucky, Florida Missouri)
- No narrator self-duplication (Samuel Clemens and Mark Twain correctly excluded)
- No bucket mislabeling

## Stage 5: Family Tree Results
- Narrator root: display name "Mark Twain", legal label "Samuel Langhorne Clemens"
- Parents: John Marshall Clemens (father), Jane Lampton Clemens (mother) — both connected with biological edges
- Siblings: Orion Clemens, Henry Clemens — both connected as siblings
- 0 duplicates across 5 nodes
- Identity coherent: pen name vs legal name preserved at root level

## Stage 6: Life Threads Results
- 6 themes seeded: Writing & Literature, The Mississippi River, Travel & Exploration, Grief & Loss, Humor & Storytelling, Debt & Financial Struggle
- 4 places: Hannibal Missouri, Florida Missouri, Europe, Middle East
- 4 events: Tom Sawyer, Huckleberry Finn, Henry's death, Marriage to Olivia
- 0 duplicates across 14 nodes
- No narrator self-duplication in LT
- Grief/loss thread correctly supports Henry's death event

---

## Known Limitations (Not Bugs)

| ID | Description | Severity |
|---|---|---|
| MT-LIMIT-001 | Questionnaire sections other than personal/parents/siblings do not survive narrator switch | Medium |
| MT-LIMIT-002 | Source text people detection is conservative — requires relationship keyword anchors | Low |
| MT-LIMIT-003 | Quick Capture items do not survive narrator switch (session-scoped) | Medium |
| MT-LIMIT-004 | Source cards do not survive narrator switch (session-scoped) | Medium |
