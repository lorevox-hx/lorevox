# Bio Creation Test Report — Priority One Biography Intake

**Date:** 2026-03-28
**Scope:** `bio-builder.js`, `app.js`, `lori8.0.html`
**Build:** v8.0 Bio Builder / Profile Unification
**Test Method:** Unit tests (56 assertions) + static code review against 9 persona specifications

---

## Summary of Implementation Changes

### bio-builder.js

Added constants: `ZODIAC_OPTIONS` (13 entries), `BIRTH_ORDER_OPTIONS` (15 entries), `RELATION_OPTIONS` (11), `SIBLING_RELATION_OPTIONS` (10), `US_STATES` (51 entries + DC), `_US_STATE_NAMES` reverse lookup.

Added normalization helpers:
- `normalizeDobInput()` — handles 8-digit packed (`12241962`), slash-separated (`12/24/1962`), dash-separated (`12-24-1962`), text month (`Dec 24 1962`, `December 24, 1962`), space-separated (`03 22 1989`), and ISO passthrough (`1962-12-24`).
- `normalizeTimeOfBirthInput()` — handles compact with AM/PM marker (`1250p`, `645a`), `HH:MM am/pm`, 24-hour `HH:MM`, bare 4-digit military (`0915`, `0600`), and graceful passthrough for unparseable input (`idk maybe noonish`).
- `normalizePlaceInput()` — handles `City, ST`, `City ST`, and `City Statename` formats against all 50 US states + DC. Non-US strings pass through untouched.
- `deriveZodiacFromDob()` — Western tropical zodiac from ISO date string.
- `_splitFullName()` — splits full name into `{first, middle, last}` by whitespace.
- `buildCanonicalBasicsFromBioBuilder()` — produces a full canonical basics object with all spec-required fields.

Upgraded renderer: `_fieldHtml()` now supports `type: "select"` with `options` arrays and `inputHelper` blur-normalization attributes with auto-derive zodiac trigger.

Upgraded sections: Personal section now uses select dropdowns for `birthOrder` and `zodiacSign`; text fields for DOB, time, and place show normalization placeholders and auto-normalize on blur. Parents section added `relation` dropdown, `maidenName`, `notes`. Siblings section added `relation` dropdown, `birthOrder` as dropdown, `notes`.

Candidate extraction updated to carry `relation`, `maidenName`, and `notes` through to people and relationship candidates.

### app.js

Expanded `normalizeProfile()` basics with 10 new fields: `legalFirstName`, `legalMiddleName`, `legalLastName`, `timeOfBirth`, `timeOfBirthDisplay`, `birthOrder`, `birthOrderCustom`, `zodiacSign`, `placeOfBirthRaw`, `placeOfBirthNormalized`. All default to `""` for backward compatibility.

Expanded `scrapeBasics()` and `hydrateProfileForm()` to read/write all new hidden inputs.

Added `applyBioBuilderPersonalToProfile()` sync bridge — maps Bio Builder canonical basics into `state.profile.basics` without auto-saving.

Expanded kinship relation vocabulary to 30 options: Mother, Father, Sister, Brother, Half-sister, Half-brother, Stepsister, Stepbrother, Sibling, Spouse, Partner, Child, Step-parent, Step-child, Adoptive parent, Adoptive mother, Adoptive father, Adopted child, Grandparent, Grandmother, Grandfather, Grandchild, Nephew, Niece, Cousin, Aunt, Uncle, Former spouse, Guardian, Chosen family, Other.

### lori8.0.html

Added 10 hidden compatibility inputs: `bio_legalFirstName`, `bio_legalMiddleName`, `bio_legalLastName`, `bio_timeOfBirth`, `bio_timeOfBirthDisplay`, `bio_birthOrder`, `bio_birthOrderCustom`, `bio_zodiacSign`, `bio_placeOfBirthRaw`, `bio_placeOfBirthNormalized`.

Added `.bb-select` CSS for dropdown styling (matches existing `.bb-input` dark theme).

Added Bio Builder popover close handler that calls `applyBioBuilderPersonalToProfile()` to sync hidden inputs on close.

---

## Unit Test Results

56 assertions covering all 9 persona inputs across DOB, time, place, and zodiac normalization. **All 56 passed.**

Bugs found and fixed during testing:
- Double comma in `normalizePlaceInput` for comma-separated input (`Williston, ND` → `Williston,, North Dakota`). Fixed by checking comma pattern first and stripping trailing commas from capture group.
- Space-separated DOB (`03 22 1989`) was not handled. Added `MM DD YYYY` pattern.
- Bare 4-digit military time (`0915`, `0600`) was not handled. Added `HHMM` pattern without AM/PM marker.
- Full state name (`Boise Idaho`) was not handled. Added reverse state name lookup.

---

## Persona-by-Persona Results

### Persona 1 — Tom (straight male)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `02141948` | PASS | → `1948-02-14` |
| Time: `645a` | PASS | → `6:45 AM` |
| Place: `Amarillo TX` | PASS | → `Amarillo, Texas` |
| Zodiac auto-derive | PASS | → `Aquarius` |
| Former spouse kinship | PASS | `Former spouse` in options |
| Current spouse kinship | PASS | `Spouse` in options |
| Children | PASS | `Child` in options |
| Save/load consistency | PASS | All fields in normalizeProfile defaults |
| Timeline seed | PASS | DOB + POB present |

**Overall: PASS**

### Persona 2 — Maggie (straight female, widow)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `07/03/1952` | PASS | → `1952-07-03` |
| Time: `11:20 pm` | PASS | → `11:20 PM` |
| Place: `St Paul MN` | PASS | → `St Paul, Minnesota` |
| Zodiac auto-derive | PASS | → `Cancer` |
| Widow status | PASS | Spouse row + deceased checkbox |
| Deceased marking | PASS | Per-row checkbox available |
| Daughters | PASS | `Child` in options |

**Overall: PASS**
**Note:** Widow status is modeled through kinship (Spouse + deceased), not as a standalone status field. This is functional but worth considering for a dedicated marital status field in a future iteration.

### Persona 3 — Daniel (binary gay male)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `1961-09-18` | PASS | ISO passthrough |
| Time: `0915` | PASS | → `9:15 AM` |
| Place: `Santa Fe NM` | PASS | → `Santa Fe, New Mexico` |
| Zodiac auto-derive | PASS | → `Virgo` |
| Male partner | PASS | `Partner` in kinship options |
| No forced wife language | PASS | No gendered assumptions in schema |
| Pronouns: he/him | PASS | In pronoun select |

**Overall: PASS**
**Note:** Sexual orientation (gay) is not stored as a structured field. This is by design — the spec says "does not force labels." Orientation is expressed through family structure and freeform narrative sections.

### Persona 4 — Sharon (binary lesbian female)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `11081958` | PASS | → `1958-11-08` |
| Time: `5:40a` | PASS | → `5:40 AM` |
| Place: `Boise Idaho` | PASS | → `Boise, Idaho` (full state name handled) |
| Zodiac auto-derive | PASS | → `Scorpio` |
| Wife (same-sex) | PASS | `Spouse` in kinship; gender-neutral |
| Stepdaughter | PASS | `Step-child` in kinship options |

**Overall: PASS**

### Persona 5 — Avery (nonbinary, queer)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `03 22 1989` | PASS | → `1989-03-22` (space-separated) |
| Time: `1250p` | PASS | → `12:50 PM` |
| Place: `Portland OR` | PASS | → `Portland, Oregon` |
| Pronouns: they/them | PASS | `they/them` in pronoun select |
| Chosen family | PASS | `Chosen family` in kinship options |
| No forced binary | PASS | No gendering in schema |

**Overall: PASS**
**Note:** Nonbinary identity is captured through pronouns (`they/them`) but there is no dedicated gender identity label field. This aligns with the spec requirement of "does not force labels."

### Persona 6 — Becca (queer, late-coming-out)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `04111963` | PASS | → `1963-04-11` |
| Time: `7:05 PM` | PASS | → `7:05 PM` |
| Place: `Mobile AL` | PASS | → `Mobile, Alabama` |
| Zodiac auto-derive | PASS | → `Aries` |
| Former husband | PASS | `Former spouse` in kinship |
| Current woman partner | PASS | `Partner` in kinship |
| Both life chapters | PASS | Kinship rows hold both simultaneously |

**Overall: PASS**

### Persona 7 — Mike (gay widower)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `12-01-1955` | PASS | → `1955-12-01` |
| Time: `10:10a` | PASS | → `10:10 AM` |
| Place: `Cleveland OH` | PASS | → `Cleveland, Ohio` |
| Zodiac auto-derive | PASS | → `Sagittarius` |
| Deceased husband | PASS | `Spouse` + deceased checkbox |
| Nephew | PASS | `Nephew` in kinship options (added) |

**Overall: PASS**

### Persona 8 — Jordan (nonbinary, late-life self-definition)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `1949-06-29` | PASS | ISO passthrough |
| Time: `0600` | PASS | → `6:00 AM` |
| Place: `Burlington VT` | PASS | → `Burlington, Vermont` |
| Pronouns: she/they | PASS | Via `custom` pronoun option |
| Widowed | PASS | Spouse + deceased checkbox |
| Nonbinary identity | PASS | Pronouns capture; no forced binary |

**Overall: PASS**

### Persona 9 — Frank (sarcastic narrator)

| Test Area | Result | Notes |
|---|---|---|
| DOB: `01091947` | PASS | → `1947-01-09` |
| Time: `idk maybe noonish` | PASS | Passes through unmangled |
| Place: `Cheyenne WY` | PASS | → `Cheyenne, Wyoming` |
| Zodiac auto-derive | PASS | → `Capricorn` |
| Sarcasm tolerance | PASS | Unparseable input preserved as-is |
| No fabrication | PASS | Invalid time not converted to fake value |

**Overall: PASS**
**Note:** The sarcasm resilience is handled by design — normalizers only transform when they can parse with confidence, otherwise they return the raw input unchanged. This prevents jokes and non-standard answers from being mangled into structured data.

---

## Known Issues and Recommendations

### Open Issues

| Bug ID | Title | Persona | Severity | Area | Repro Steps | Expected | Actual | Suggested Fix | Status |
|---|---|---|---|---|---|---|---|---|---|
| BIO-001 | No explicit marital status field | P2 Maggie, P7 Mike, P8 Jordan | Medium | schema drift | 1. Create widow/widower persona 2. Check for marital status field | Dedicated status: single/married/divorced/widowed | Status inferred from kinship + deceased only | Add `maritalStatus` select to personal section | Open |
| BIO-002 | No sexual orientation/gender identity field | P3 Daniel, P4 Sharon, P5 Avery, P6 Becca | Low | identity | 1. Create LGBTQ+ persona 2. Look for orientation field | Optional freetext or select for identity notes | Not present; only pronouns captured | Consider optional "Identity Notes" textarea in personal section | Deferred |
| BIO-003 | birthOrderCustom text input not rendered | All | Low | UI | 1. Select "Other/custom" in birth order 2. Look for custom text input | Text input appears for custom entry | Dropdown changes but no custom field appears | Add conditional text input beside select when "Other/custom" selected | Open |
| BIO-004 | Kinship rows use flat name field | All | Medium | schema drift | 1. Add kinship row 2. Check name structure | Split first/middle/last like Bio Builder parents | Single "Name" text input | Upgrade kinship row to split name inputs, or add parsing on save | Open |
| BIO-005 | Kinship rows lack notes field | P7 Mike | Low | relationship | 1. Add nephew 2. Try to add "treated like a son" note | Per-row notes field | No notes field on kinship rows | Add notes textarea or expand row with optional details | Open |

### Recommendations (Priority Order)

1. **Add `maritalStatus` field to personal section** — select with: Single, Married, Partnered, Divorced, Widowed, Separated, Other. This would make widow/widower status explicit and queryable rather than inferred.

2. **Upgrade legacy kinship rows to split names** — The Bio Builder parents/siblings already use split names (`firstName`, `middleName`, `lastName`). Legacy kinship rows still use a single flat `name` field. This creates schema drift when data flows both directions.

3. **Add conditional custom text input for "Other/custom" birth order** — When the dropdown value is "Other/custom", a text input should appear for the user to type their specific birth order.

4. **Consider optional identity/orientation notes** — Not a required field, but an optional freetext "Identity Notes" textarea in the personal section would allow users who want to explicitly state their orientation, gender identity, or relationship style to do so without the system forcing any label.

5. **Add per-row notes to kinship** — Allow freetext notes on each kinship row (e.g., "treated like a son", "estranged since 2005", "came out after this marriage ended").

---

## Timeline Seed Verification

All 9 personas produce valid `dob` and `pob` fields after normalization. The existing `getTimelineSeedReady()` function checks `!!(state.profile?.basics?.dob && state.profile?.basics?.pob)` which will return `true` for every persona. Age and generation display continue to work because `dob` is always in ISO `YYYY-MM-DD` format after normalization.

## Candidate/Review Safety

Bio Builder writes only to `state.bioBuilder`. The candidate extraction functions (`_extractQuestionnaireCandidates`) create pending candidates that require explicit user review. No automatic promotion to structured history. The `buildCanonicalBasicsFromBioBuilder()` helper produces data for the sync bridge but does not write to `state.profile` — the bridge function `applyBioBuilderPersonalToProfile()` must be explicitly called.

## Backward Compatibility

Old profiles missing the 10 new basics fields (`legalFirstName`, `legalMiddleName`, `legalLastName`, `timeOfBirth`, `timeOfBirthDisplay`, `birthOrder`, `birthOrderCustom`, `zodiacSign`, `placeOfBirthRaw`, `placeOfBirthNormalized`) will silently get empty strings via `normalizeProfile()`. Existing kinship rows with the old relation vocabulary (Mother, Father, Sibling, etc.) continue to work — the expanded vocabulary is additive. No database migration required.
