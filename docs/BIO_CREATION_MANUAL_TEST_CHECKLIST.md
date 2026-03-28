# Bio Creation Manual Test Checklist

**Date:** 2026-03-28
**Files:** `bio-builder.js`, `app.js`, `lori8.0.html`

Use this checklist for each persona or regression run. Check off each item as you go.

---

## A. Bio Builder Personal Section

- [ ] Open Bio Builder popover
- [ ] Enter full/legal name → verify it appears in field
- [ ] Enter preferred name → verify it appears in field
- [ ] Enter DOB in any supported format → tab out → verify normalized to `YYYY-MM-DD`
  - Test formats: `12241962`, `12/24/1962`, `12-24-1962`, `Dec 24 1962`, `03 22 1989`
- [ ] Verify zodiac sign auto-derives from DOB after normalization
- [ ] Manually change zodiac dropdown → verify override is preserved (not re-derived)
- [ ] Enter time of birth in any supported format → tab out → verify normalized to `H:MM AM/PM`
  - Test formats: `1250p`, `12:50 pm`, `645a`, `0915`, `14:30`, `idk maybe noonish` (passthrough)
- [ ] Enter place of birth → tab out → verify state abbreviation expanded
  - Test formats: `Williston ND`, `Williston, ND`, `Boise Idaho`, `Portland OR`
- [ ] Select birth order from dropdown → verify selection sticks
- [ ] Set pronouns (including `they/them` and custom) → verify persists
- [ ] Save section → verify no console errors

## B. Family Structure Section

- [ ] Add a parent entry → verify relation dropdown includes: Mother, Father, Stepmother, Stepfather, Adoptive mother, Adoptive father, Guardian, Other
- [ ] Verify parent entry has: first name, middle name, last name, maiden/birth name, birth date, birth place, occupation, notable life events, additional notes
- [ ] Add a sibling entry → verify relation dropdown includes: Sister, Brother, Half-sister, Half-brother, Stepsister, Stepbrother, Other
- [ ] Verify sibling entry has: birth order as dropdown
- [ ] Save section → verify candidates generated with correct relation labels

## C. Legacy Kinship Rows

- [ ] Add kinship row → verify relation dropdown includes at minimum: Mother, Father, Sister, Brother, Spouse, Partner, Former spouse, Child, Step-child, Nephew, Niece, Cousin, Aunt, Uncle, Chosen family, Other
- [ ] Add a spouse row → check deceased checkbox → verify it turns red
- [ ] Add a second kinship row with different relation → verify both persist
- [ ] Verify name, birthplace, occupation fields accept input

## D. Save / Reload / Switch Narrator

- [ ] Fill in all personal section fields
- [ ] Save profile
- [ ] Close Bio Builder popover
- [ ] Switch to a different narrator
- [ ] Switch back to original narrator
- [ ] Reopen Bio Builder → verify all fields retained
- [ ] Check `state.profile.basics` in console → verify new fields present:
  - `legalFirstName`, `legalMiddleName`, `legalLastName`
  - `timeOfBirth`, `timeOfBirthDisplay`
  - `birthOrder`, `birthOrderCustom`
  - `zodiacSign`
  - `placeOfBirthRaw`, `placeOfBirthNormalized`
- [ ] Verify no cross-narrator contamination (other person's data should not bleed through)

## E. Bio Builder → Profile Sync Bridge

- [ ] Fill Bio Builder personal section
- [ ] Close Bio Builder popover (triggers sync)
- [ ] Check console: `state.profile.basics.dob` should match Bio Builder DOB
- [ ] Check: `state.profile.basics.zodiacSign` should have derived or selected value
- [ ] Check: `state.profile.basics.legalFirstName` / `Middle` / `Last` should be populated
- [ ] Click Save Profile → verify round-trips on reload

## F. Timeline Seed Readiness

- [ ] Enter DOB and birthplace for a persona
- [ ] Verify age display updates (e.g., `~78 years old`)
- [ ] Verify generation badge updates (e.g., `Silent Generation`, `Baby Boomer`)
- [ ] Verify `getTimelineSeedReady()` returns `true` in console

## G. Backward Compatibility

- [ ] Load a person with an old thin profile (no v8.0 fields)
- [ ] Verify no console errors
- [ ] Verify all existing fields display correctly
- [ ] Verify new fields show as empty (not `undefined` or broken)
- [ ] Save profile → verify old data not corrupted

## H. Candidate/Review Safety

- [ ] Fill Bio Builder parents or siblings
- [ ] Save section → check candidates tab
- [ ] Verify candidates created with `status: "pending"`
- [ ] Verify no auto-promotion to structured history
- [ ] Verify `state.facts`, `state.archive`, `state.timeline` not modified

## I. Sarcasm / Edge Case Resilience

- [ ] Enter nonsense time of birth (e.g., `idk maybe noonish`) → verify stored as-is, not fabricated
- [ ] Enter empty DOB → verify zodiac stays empty (no derivation from empty)
- [ ] Enter non-US place (e.g., `London, England`) → verify passes through unchanged
- [ ] Enter already-normalized place (e.g., `Williston, North Dakota`) → verify not double-normalized

---

## Quick Persona Smoke Test

For each of the 9 personas, enter their specific inputs and verify:

| # | Name | DOB Input | Expected DOB | Time Input | Expected Time | Place Input | Expected Place |
|---|---|---|---|---|---|---|---|
| 1 | Tom | `02141948` | `1948-02-14` | `645a` | `6:45 AM` | `Amarillo TX` | `Amarillo, Texas` |
| 2 | Maggie | `07/03/1952` | `1952-07-03` | `11:20 pm` | `11:20 PM` | `St Paul MN` | `St Paul, Minnesota` |
| 3 | Daniel | `1961-09-18` | `1961-09-18` | `0915` | `9:15 AM` | `Santa Fe NM` | `Santa Fe, New Mexico` |
| 4 | Sharon | `11081958` | `1958-11-08` | `5:40a` | `5:40 AM` | `Boise Idaho` | `Boise, Idaho` |
| 5 | Avery | `03 22 1989` | `1989-03-22` | `1250p` | `12:50 PM` | `Portland OR` | `Portland, Oregon` |
| 6 | Becca | `04111963` | `1963-04-11` | `7:05 PM` | `7:05 PM` | `Mobile AL` | `Mobile, Alabama` |
| 7 | Mike | `12-01-1955` | `1955-12-01` | `10:10a` | `10:10 AM` | `Cleveland OH` | `Cleveland, Ohio` |
| 8 | Jordan | `1949-06-29` | `1949-06-29` | `0600` | `6:00 AM` | `Burlington VT` | `Burlington, Vermont` |
| 9 | Frank | `01091947` | `1947-01-09` | `idk maybe noonish` | `idk maybe noonish` | `Cheyenne WY` | `Cheyenne, Wyoming` |
