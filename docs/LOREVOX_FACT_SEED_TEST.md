# LOREVOX_FACT_SEED_TEST.md

## Test name
`LOREVOX_FACT_SEED_TEST`

## Purpose

Validate the Memory Exercise Fact-Seed Follow-Up Flow end-to-end.
Confirms fragment detection, WS context injection, panel rendering,
debug event emission, clear-answer conversion, vague-answer preservation,
and override protection.

---

## Turn script

| Turn | Type | Input | Expected detection | Expected action |
|---|---|---|---|---|
| T1 | anchored sensory | `I liked the smell of pizza at Shakey's Pizza in Grand Forks.` | `memory_fragment_detected` · anchor_type: place_business | `_lv80FactSeedPending` set · fragment in Memory Moments panel |
| T2 | WS injection | (Lori sends follow-up response) | `fact_seed_followup_asked` logged | WS context = `memory_exercise_fact_seed` |
| T3 | clear follow-up answer | `I think I was about 12 and we lived in Grand Forks then.` | `fact_seed_converted_to_fact` | structured fact(s) posted · fragment removed from panel |
| T4 | vague follow-up answer | `I'm not sure, just when I was young.` | `fact_seed_not_converted` · `memory_fragment_preserved` | no hard fact · fragment stays in panel |
| T5 | user resists | `I don't know and don't want to think that hard.` | no fragment detected | no `_lv80FactSeedPending` set · no follow-up |
| T6 | safety override | `I feel dizzy right now and my chest is tight.` | safetyTriggered=true | fact-seed detection block skipped entirely |
| T7 | companion mode | (switch to Companion posture) | `_lv80FactSeedPending` cleared | no follow-up fired on mode change |

---

## Validation layers

### A — Fragment detection

- [ ] T1: `memory_fragment_detected` event in `__lv80TurnDebug`
- [ ] T1: `anchor_type` is `place_business`
- [ ] T1: `_lv80FactSeedPending` is set with `asked: false`
- [ ] T1: fragment appears in `_lv80MemoryFragments[]`
- [ ] T5: no fragment detected for short refusal
- [ ] T5: `_lv80FactSeedPending` remains null

### B — WS context injection

- [ ] After T1 send: WS context key = `memory_exercise_fact_seed`
- [ ] `fact_seed_followup_asked` logged before WS send
- [ ] `_lv80FactSeedPending.asked` = true after injection
- [ ] On T3 answer turn: WS context key = `memory_exercise_followup`

### C — Conversion (clear answer)

- [ ] T3: `fact_seed_converted_to_fact` in debug log
- [ ] T3: `_lv80FactSeedPending` cleared to null
- [ ] T3: `_lv80MemoryFragments[0].converted_to_fact` = true
- [ ] T3: fragment section removed from panel (or fragment removed from it)
- [ ] T3: structured fact(s) appear in memoir panel from backend

### D — Preservation (vague answer)

- [ ] T4: `fact_seed_not_converted` in debug log, reason: `no_facts_extracted`
- [ ] T4: `memory_fragment_preserved` in debug log
- [ ] T4: fragment stays in Memory Moments panel
- [ ] T4: fragment `followup_answered` = true (no "awaiting context" note)
- [ ] T4: no hard fact posted to backend

### E — Override protection

- [ ] T6: safety triggered → fact-seed block not entered
- [ ] T6: no `memory_fragment_detected` event
- [ ] T7: switching away from memory_exercise → `_lv80FactSeedPending` = null

### F — Panel and export

- [ ] Memory Moments section visible in "Peek at Memoir" during T1–T4
- [ ] Fragments styled with `mark.fragment-fact` (green italic)
- [ ] Unanswered fragment shows "— awaiting context" note
- [ ] Answered-but-not-converted fragment drops the note
- [ ] TXT export in threads state includes `Memory Moments` section with `~` prefix
- [ ] No `<mark>` or HTML artifacts in export

---

## Run method

Chrome MCP. Requires Lorevox at `http://localhost:8080`.

```javascript
// Inspect fact-seed state
_lv80FactSeedPending
_lv80MemoryFragments

// Inspect debug stream
window.__lv80TurnDebug.filter(e => e.event?.startsWith("fact_seed") || e.event?.startsWith("memory_fragment"))

// Manual fragment detection test
_lv80DetectMemoryFragment("I liked the smell of pizza at Shakey's Pizza in Grand Forks.")
```

---

## Definition of done

Test passes when all layers A–F are confirmed with no open failures.
Results must be recorded in `LOREVOX_FACT_SEED_TEST_RESULTS.md`.
One known-good sample run artifact must be saved to `tools/samples/`.
