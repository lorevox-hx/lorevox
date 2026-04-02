# LOREVOX_MEANING_AWARE_MEMOIR_TEST.md

## Test name
`LOREVOX_MEANING_AWARE_MEMOIR_TEST`

## Purpose

Validate that the Meaning Engine (Phases A–E) works end-to-end across a single
narrator conversation. Confirms fact extraction, meaning tag assignment, narrative
role detection, dual persona capture, section grouping, contamination protection,
and TXT export — all in one live run.

---

## Test persona

**P_MAT_01 — Steel Worker, Pittsburgh**

Born 1941, Pittsburgh PA. Worked the mills, moved several times, married and
divorced, went back to school, eventually found peace in San Diego. Covers all
five arc parts and both meaning signal types (stakes + vulnerability).

---

## Turn script

| Turn | Type | Input | Expected extraction | Expected meaning |
|---|---|---|---|---|
| T1 | structural (birth) | `I was born in Pittsburgh, Pennsylvania in 1941. My father worked the furnaces at US Steel.` | `Born or raised in Pittsburgh, Pennsylvania` · fact_type: birth | narrative_role: setup |
| T2 | structural (work) | `I worked at the steel mill for thirty years. Went to work right out of high school.` | `Worked: the steel mill for thirty years` · fact_type: employment_start | narrative_role: setup |
| T3 | structural (move) | `We moved to Cleveland when the mill started laying people off. Had to make a life somewhere new.` | `Residence: Cleveland` · fact_type: residence | narrative_role: inciting · section: change_transition |
| T4 | vulnerability | `I married Dorothy in 1962. She left me in 1971. I was alone for the first time in my life.` | `Married Dorothy` · fact_type: marriage | meaning_tags: [vulnerability] · section: hard_moments |
| T5 | stakes | `Moved to Cincinnati in 1973. There was no choice — the mills were dying and I had to get out.` | `Residence: Cincinnati` · fact_type: residence | meaning_tags: [stakes] · narrative_role: escalation · section: hard_moments |
| T6 | turning point | `I graduated from night school in 1974. That was when everything changed. I had become a different person.` | `Education: night school in 1974` · fact_type: education | meaning_tags: [turning_point, identity] · narrative_role: climax · section: turning_points |
| T7 | reflection (dual persona) | `I settled in San Diego in 1980. Looking back, I understand now that all those hard years made me who I am.` | `Residence: San Diego` · fact_type: residence | narrative_role: reflection · section: identity_belonging · experience: null · reflection: text |
| T8 | companion (non-memoir) | `My hip has been giving me trouble lately. Hard to walk some days.` | 0 facts · suppressed: true | no meaning tags |
| T9 | recovery | `I should mention, I worked at a sheet metal plant in San Diego in 1981.` | `Worked: a sheet metal plant in San Diego in 1981` · fact_type: employment_start | extraction resumes · narrative_role: setup |

---

## Validation layers

### A — Extraction quality

- [ ] T1–T3, T6, T9: ≥1 fact extracted per turn
- [ ] T4: vulnerability tag present on extracted fact
- [ ] T5: stakes tag present on extracted fact
- [ ] T6: turning_point tag present on extracted fact
- [ ] `vulnerability` detected at least once across all turns
- [ ] `stakes` detected at least once across all turns

### B — Narrative structure

- [ ] At least one fact mapped to `climax` role (T6)
- [ ] At least one fact mapped to `escalation` role (T5)
- [ ] At least one fact mapped to `reflection` role (T7)
- [ ] Turning Points section populated in panel (T6 fact present)
- [ ] Hard Moments section populated in panel (T4 and/or T5 fact present)
- [ ] Identity & Belonging section populated in panel (T7 fact present)

### C — Dual persona

- [ ] T7 fact: `reflection` field is non-null (narrator used reflection language)
- [ ] T7 fact: `experience` field is null (pure reflection turn)
- [ ] T1–T6 facts: `experience` field is non-null, `reflection` is null

### D — Memoir panel

- [ ] Panel shows Family & Relationships section with content (T4)
- [ ] Panel shows at least one Meaning section with content (Turning Points, Hard Moments, or Identity & Belonging)
- [ ] Empty meaning sections show narrative-aware placeholder copy (not blank)
- [ ] Panel never shows raw JSON or debug artifacts

### E — Contamination protection

- [ ] T8: `suppressed: true` in debug log
- [ ] T8: `facts_extracted_count: 0`
- [ ] T8: no meaning tags emitted
- [ ] T8 content does not appear in memoir panel threads
- [ ] T9: extraction resumes (mode returns to life_story)

### F — Export

- [ ] TXT export in threads state downloads successfully
- [ ] Exported file contains section headings (Turning Points, Hard Moments, etc.)
- [ ] "Story arc:" line is present in exported file header
- [ ] No placeholder text exported (only real facts)
- [ ] No `<mark>` or HTML artifacts in exported file

---

## Run method

Chrome MCP harness. Requires Lorevox running at `http://localhost:8080`.

```javascript
// Send a turn
window.__lv80Send("turn text here");

// Read debug log after each turn
window.__lv80TurnDebug.at(-1);

// Full debug log
window.__lv80TurnDebug;
```

---

## Definition of done

Test passes when all validation layers A–F are confirmed with no open failures.
Results must be recorded in `LOREVOX_MEANING_AWARE_MEMOIR_TEST_RESULTS.md`.
One known-good TXT export artifact must be saved to `tools/samples/`.
