# LOREVOX_35_PERSONA_MODE_TEST_PLAN.md

## Purpose

This plan validates Lori 8.0 as a behaviorally correct interaction engine across real human situations, not just isolated prompts.

It extends the validated runtime contract into:
- multi-speaker contexts
- social/companionship scenarios
- ambiguous memory
- safety interruptions

---

## Test Scope

**Cohort**
- Original personas: 30
- New personas: 5
- **Total: 35 personas**

---

## New Personas (Critical Additions)

### Persona 31 — Son Helping Mother
- Mother = primary narrator; son assists with details
- **Tests:** narrator identity stability, speaker attribution, Lori addressing correct person
- **Risks:** Lori talks to son instead of mother; son's facts attributed incorrectly

### Persona 32 — Elderly Couple A (Cooperative)
- Shared storytelling; partners finish each other's memories
- **Tests:** dual input handling, narrative continuity
- **Risks:** blended authorship, duplicate or conflicting facts

### Persona 33 — Elderly Couple B (Dominant Partner)
- One partner dominates; one is quieter
- **Tests:** narrator control, turn targeting
- **Risks:** Lori follows dominant speaker; intended narrator lost

### Persona 34 — Lonely Widow A (Open)
- Social, conversational
- **Tests:** Companion mode quality, balance of story vs presence
- **Risks:** over-pushing memoir

### Persona 35 — Lonely Widow B (Withdrawn)
- Hesitant, minimal responses
- **Tests:** idle behavior, emotional pacing
- **Risks:** pressure from Lori, over-extraction, awkward silence handling

---

## Scenario Structure (All 35 Personas)

Each persona run uses a 4-part sequence:

### Part 1 — Clean Memoir Turn
Clear autobiographical fact.
- **Validates:** extraction, posture = `life_story`, no suppression

### Part 2 — Ambiguous / Uncertain Memory
Hedged or incomplete recall.
- **Validates:** `memory_exercise` behavior, no forced precision, filtering of weak facts

### Part 3 — Companion / Off-Domain Turn
Social comment, concern, or unrelated thought.
- **Validates:** `non_memoir` routing, companion behavior, extraction suppression, idle suppression

### Part 4 — Recovery to Memoir
Clear life-story answer.
- **Validates:** override clears, posture returns to `life_story`, extraction resumes, no sticky modes

---

## Core Mode Validation

| Mode | Required behavior |
|---|---|
| **Life Story** | Extracts facts correctly, advances timeline, structured questioning |
| **Memory Exercise** | Accepts uncertainty, avoids pressure, suppresses low-confidence facts |
| **Companion** | Natural conversation, no forced redirection, no extraction |
| **Safety** | Overrides any mode, suppresses extraction + idle, provides support behavior |

---

## Runtime Fields to Record

### Per-turn fields

| Field | Type |
|---|---|
| `detected_category` | string / null |
| `interaction_mode` | string / null |
| `effective_posture` | string |
| `override_reason` | string / null |
| `facts_extracted_count` | integer |
| `facts_posted_count` | integer |
| `suppressed` | boolean |
| `suppression_reason` | string / null |
| `idle_will_arm` | boolean / null |
| `idle_cancel_reason` | string / null |
| `memoir_state_before` | empty / threads / draft / null |
| `memoir_state_after` | empty / threads / draft / null |
| `turn_pass` | boolean |
| `notes` | string |

### Session-level metrics (required)

Captured from the inspector after each run (`window.__lv80TurnDebug` export).

| Metric | Source |
|---|---|
| Override transitions | `mode_transition` events with reason `non_memoir_pattern` or `safety_pattern` |
| Manual mode switches | `mode_switch` events |
| Narrator resets | `mode_transition` events with reason `narrator_switch` or `new_narrator` |
| System intervention rate | `override_transitions / total_transitions` |
| User control ratio | `manual_switches / (manual_switches + override_transitions)` |
| Denominator values | e.g., `2 / 3 transitions`, `1 / 3 posture changes` |

---

## Session Metric Interpretation Rules

### System Intervention Rate

| Range | Reading |
|---|---|
| ≤ 25% | Stable, user-led |
| 26–60% | Moderate system correction — review |
| > 60% | Excessive steering — investigate |

### User Control Ratio

| Range | Reading |
|---|---|
| ≥ 60% | User-driven session |
| 25–59% | Mixed control |
| < 25% | System-driven — investigate |

### Narrator Resets

| Count | Reading |
|---|---|
| 0 | Stable session |
| > 0 | Boundary event — expected only in explicit switch tests |

---

## Special Checks by Persona Type

### Assisted Narrator (Persona 31)

- [ ] Primary narrator maintained throughout?
- [ ] Correct person addressed on each turn?
- [ ] Speaker attribution clean?

### Couples (Personas 32–33)

- [ ] Who is Lori addressing at each turn?
- [ ] Spouse input handled cleanly?
- [ ] Facts attributed to correct speaker?
- [ ] Turn-taking preserved?

### Lonely Widows (Personas 34–35)

- [ ] Companion mode appropriate and not forced?
- [ ] No memoir pressure during companion turns?
- [ ] Conversation meaningful without extraction?
- [ ] Idle behavior appropriate to emotional state?

---

## Pass / Fail Conditions

### Turn-level pass

- Correct posture for turn type
- Override behavior matches expected (`override_reason` field)
- Extraction correctly gated (suppressed when required, active when safe)
- Idle behavior correct (arms or cancels with correct reason)

### Session-level pass

- Intervention rate reasonable for persona type
- User control ratio appropriate for scenario
- No narrator confusion logged
- No memoir contamination

---

## Supporting Artifacts

| File | Location | Purpose |
|---|---|---|
| `LOREVOX_35_PERSONA_MODE_TEST_SHEET.csv` | `tools/` | Per-turn + session scoring worksheet |
| `LOREVOX_35_PERSONA_MODE_SCORING_SCHEMA.json` | `schemas/` | JSON schema for structured run records |
| `LOREVOX_80_DEBUG_TIMELINE_INSPECTOR.html` | `tools/` | Visual session inspector for `window.__lv80TurnDebug` exports |

Export a session log after each run and save to `tools/samples/` using the naming convention:

```
YYYY-MM-DD_P<id>_<scenario>.json
```

Example: `2026-03-26_P31_son_helping_mother_clean_run.json`

---

## Rollout Plan

### Phase 1 — New Personas Only (5 runs)
Personas 31–35. Focus on edge cases: multi-speaker behavior, companionship scenarios, emotional pacing.

### Phase 2 — Full 35 Persona Sweep
Each persona runs all four parts. Safety scenario optional per persona.

### Phase 3 — Comparative Analysis
Group results by persona type:

| Group | Personas |
|---|---|
| Single narrator | original 30 |
| Assisted narrator | 31 |
| Couple | 32–33 |
| Socially isolated | 34–35 |

**Goal:** Determine whether Lori's mode system is universally stable or only stable in ideal single-user scenarios.

---

## Key Insight

This plan does not just test:

> "Did Lori respond correctly?"

It tests:

> "Did Lori choose the correct role, maintain it, and recover correctly across real human interaction patterns?"

---

## Final Position

The system is already:
- architecturally correct
- behaviorally validated (10/10 harness pass, three defects fixed in session)

This plan ensures it is:
- robust across real-world human use patterns
- inspectable and comparable across runs via structured logs and the timeline inspector
