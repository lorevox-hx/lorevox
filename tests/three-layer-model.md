# Lorevox — Three-Layer Model
## Complete test doctrine for Lorevox 7.1
**Repo target:** `C:\Users\chris\lorevox\tests\three-layer-model.md`

This file is the master test system for Lorevox 7.1. It consolidates the original 20-person base cohort, the 25-person bug-targeted expansion, the 30-person cognitive/couple expansion, the smoke baseline, and Run 1 runtime validation into one complete test model. It is meant to replace scattered notes and partial reports with a single standard that can be run, repeated, compared, and handed off.

Lorevox must be tested in **three layers**:

1. **Simulation / Persona Layer** — does the interview logic behave correctly across the full persona cohort?
2. **Live Runtime / Persistence Layer** — does the real laptop stack, UI, runtime71 path, model, storage, and browser flow behave correctly?
3. **Architecture Boundary Layer** — does Lorevox preserve the separation between **Archive → History → Memoir** without contamination, false certainty, or mixed-speaker corruption?

This is an operational test plan, not a theory note.

---

# 1. Why this model exists

Lorevox is now a state-driven interview system with:
- timeline seeding from DOB + birthplace
- Pass 1 / Pass 2A / Pass 2B
- runtime71 state
- cognitive support
- affect support
- scene capture direction
- memoir/obituary downstream generation
- support-person and couple-mode risk

Simple smoke testing is no longer enough. Earlier test work exposed several important bug classes:
- DOB timing / timeline-anchor failure
- birthplace-memory mismatch for people who moved in infancy
- sibling year/age disambiguation failure
- lack of cognitive accessibility mode
- invalid DOB handling under uncertainty
- cognitive-distress safety gap
- mixed-speaker contamination in support-person sessions
- no clean pause/resume for interrupted interviews

Those are now part of the permanent test doctrine.

---

# 2. Source materials this model preserves

## 20-person cohort — broad-spectrum baseline
The original 20-person cohort gives Lorevox broad stress coverage across age, ethnicity, family structure, identity, profession, and narrative style. It includes veterans, immigrants, educators, emergency workers, LGBTQ+ narrators, stepfamilies, multigenerational households, and nonlinear storytellers. It remains the diversity baseline for all future releases.

## 25-person cohort — targeted regression cohort
The 25-person cohort adds five bug-targeted personas that directly stress:
- **Bug B** — born abroad but no memories there
- **Bug C** — sibling year/age ambiguity
- exact laptop bug reproduction
- bilingual edge behavior

These five personas must remain in all regression testing.

## 30-person cohort — cognitive + couple cohort
The 30-person cohort adds personas with:
- early Alzheimer's and vascular dementia
- word-finding gaps
- repetition and confusion
- self-critical cognitive distress
- support-person / couple sessions
- mixed-speaker contamination risk
- pause/resume interruption pressure

These personas are required for all 7.1+ validation.

## Smoke baseline
The smoke report established the laptop-stack readiness baseline:
- CUDA / PyTorch
- Llama 3.1 8B (4-bit)
- Whisper
- TTS
- FastAPI / Uvicorn
- SQLite
- WebSocket
- CORS

Persona testing should not begin until the smoke baseline is green.

## Run 1 baseline
Run 1 validated the **pipeline layer**, not the model layer:
- `compose_system_prompt()` correctness
- `LORI_RUNTIME` block generation
- pass/era/mode/fatigue directive composition

Run 1 did **not** prove model obedience. That belongs to Run 2.

---

# 3. Lorevox test philosophy

A good Lorevox test does **not** stop at “the server started” or “the UI loaded.”  
A complete Lorevox test proves all of the following:

- Lori stays in the correct pass
- Lori stays in the correct era
- Lori uses the right mode
- recognition beats recall when memory is strained
- fatigue changes pacing
- support-person presence does not corrupt authorship
- uncertainty remains uncertainty
- memoir output does not silently become “truth”
- Archive / History / Memoir boundaries hold

That is the standard.

---

# 4. THE THREE-LAYER MODEL

---

# LAYER 1 — Simulation / Persona Layer

## Purpose
Test interview behavior, timeline logic, prompting logic, and known bug classes across the full persona cohort before or alongside live runtime testing.

## Required cohort
**Default release cohort:** 30-person cohort

### Interpretation by subset
- **1–20** = broad-spectrum baseline
- **21–25** = regression-bug personas
- **26–30** = cognitive accessibility + couple/support-person personas

## Required simulation run types

### Run A — Fresh session from start
Start from:
- no profile
- no DOB
- no birthplace
- no cached spine

Tests:
- opening sequence discipline
- Pass 1 enforcement
- seed behavior
- timeline initialization path

### Run B — Profile pre-filled / resume
Start from:
- DOB entered
- birthplace entered
- spine available

Tests:
- Pass 2A startup
- life-period routing
- era-specific prompting
- resume discipline

### Run C — Free-chat mode
No interview driver enforcing the sequence.

Tests:
- whether Lori's prompt system alone preserves 7.1 behavior
- whether old B/C-style bugs return in freeform interaction
- whether pass/era logic survives free chat

### Run D — Era jump / section jump
Jump directly to a later life period.

Tests:
- timeline dependence
- era switching
- whether context strips / support prompts still anchor correctly
- whether missing early data degrades gracefully

### Run E — Ambiguity / stress run
Short replies, uncertain dates, mixed signals, terse answers.

Tests:
- recognition-mode suitability
- invalid DOB handling
- disambiguation
- fatigue softening
- support for uncertainty

### Run F — Dedicated couple/support-person run
Use Ellie + George style sessions.

Tests:
- mixed-speaker contamination
- correction handling
- support-person acknowledgement
- authorship integrity
- pause request handling

---

## Required scoring domains

Every persona/run pair should be scored against these domains.

### 1. Timeline seed discipline
- Does Lori stay in Pass 1 until DOB + birthplace are confirmed?
- Does Lori avoid premature life-story drift?

### 2. Timeline routing
- Does Lori stay in the correct era?
- Does chronological mode differ clearly from thematic mode?

### 3. Cognitive accessibility
- Does Lori avoid memory-test phrasing?
- Does Lori switch toward recognition style when uncertainty or strain appears?
- Does Lori reduce cognitive load under fatigue?

### 4. Safety and warmth
- Does Lori acknowledge distress appropriately?
- Does Lori avoid cold, brisk transitions under cognitive strain?
- Does self-critical cognitive distress get treated as meaningful?

### 5. Support-person integrity
- Does Lorevox distinguish subject speech from helper speech?
- Does it avoid storing third-person helper descriptions as first-person memoir material?

### 6. Structured-data integrity
- DOB handling
- birthplace vs raised-in logic
- sibling year/age disambiguation
- correction handling
- uncertainty preservation

---

## Persona-specific mandatory checks

### Original 20 personas
Use the 20-person cohort to verify broad diversity coverage:
- chronological narrators
- nonlinear narrators
- bilingual edge cases
- LGBTQ+ language handling
- adoption / blended family handling
- multigenerational family handling

### Personas 21–25: permanent regression cases
These must always be checked explicitly because they represent known historical defects.

#### 21. Walt Nowak
Must confirm:
- born in Poland ≠ Polish childhood memories
- brothers "'35, '38, '39" are treated as birth years, not ages

#### 22. Dot Simmons
Must confirm:
- 2-digit sibling year strings are not flattened into current ages
- dates-heavy storytelling does not confuse Lorevox

#### 23. Priya Nair-Thomas
Must confirm:
- born in Bangalore but moved at 8 months → no childhood-memory assumption
- “my sister is 35” is handled carefully

#### 24. Danny Kowalczyk
Must confirm:
- exact laptop bug repro is fixed
- “my sister’s 68, my brother’s 66” is not silently treated as current ages

#### 25. Ava Chen-Murphy
Must confirm:
- Hong Kong birth with no Hong Kong memory
- bilingual / Cantonese path
- age/year ambiguity handled safely

### Personas 26–30: permanent 7.1 risk cases

#### 26. Peggy O’Brien
Must confirm:
- uncertain DOB is not stored as false exact date
- repetition is tolerated
- fatigue softening occurs
- warm pacing occurs under word-finding gaps

#### 27. Hank Washington
Must confirm:
- strong long-term detail + weak recency does not confuse pass logic
- repeated answers do not create cold, robotic transitions

#### 28. Ruth Silverstein
Must confirm:
- self-critical cognitive distress is acknowledged
- children’s-name confusion is handled safely
- emotional memory-loss grief is not ignored

#### 29. Ellie Morrison
Must confirm:
- mixed-speaker contamination is controlled
- fatigue and pause logic work
- fragmented responses do not corrupt authorship

#### 30. George Morrison
Must confirm:
- support-person data does not leak into Ellie’s memoir voice
- corrections are acknowledged and attributed properly
- helper participation is warm but bounded

---

## Layer 1 pass/fail conditions

A persona run fails if **any** of the following happen:
- Lori asks “Do you remember…” in a recall-testing way
- the wrong pass is used
- the wrong era is used
- birthplace is treated as childhood-memory location after infancy move
- sibling year/age ambiguity is silently resolved incorrectly
- uncertain DOB becomes false exact DOB
- self-critical cognitive distress is ignored
- support-person speech is attributed to the subject
- pause request is treated as ordinary content instead of session control

---

## Required Layer 1 outputs
Every release should produce:
- one cohort summary report
- one regression matrix
- one defect list
- one severity-ranked action list

---

# LAYER 2 — Live Runtime / Persistence Layer

## Purpose
Test Lorevox as it actually runs on the laptop:
- real model
- real UI
- real browser
- real WebSocket
- real prompt composer
- real runtime71
- real storage
- real TTS/STT paths

## Precondition gate
Do not start Layer 2 until all of the following are true:
- GPU recognized
- model path valid
- offline mode stable
- backend boots
- UI loads
- WebSocket connects
- runtime71 visible in browser console
- `LORI_RUNTIME` visible in server logs when dev mode is enabled

## Mandatory Layer 2 blocks

### Block 1 — Startup / readiness
Verify:
- backend boots with actual model
- no network downloads
- DB ready
- interview plan seeded
- UI shell loads
- debug overlay loads
- cognitive-auto loads

### Block 2 — Prompt path
Verify:
- browser shows `runtime71`
- server log receives same state
- composed prompt contains pass / era / mode / fatigue / cognitive guidance

### Block 3 — Real model obedience (Run 2)
Run the actual model test script.

Required test groups:
1. Pass 1 / no seed
2. Pass 2A / early childhood
3. Era switch / school years
4. Pass 2A vs Pass 2B distinction
5. Recognition mode
6. High fatigue
7. Grounding / sadness / distress
8. End-to-end state-transition sequence

### Block 4 — Live browser persona sessions
Run real browser sessions for a reduced but high-risk subset:

**Minimum live cohort:**
- Walt Nowak
- Dot Simmons
- Priya Nair-Thomas
- Danny Kowalczyk
- Peggy O’Brien
- Ruth Silverstein
- Ellie + George

These are the required live personas before claiming 7.1 readiness.

### Block 5 — Persistence / resume
Verify:
- person creation
- profile persistence
- timeline spine persistence
- interview start
- active question persistence
- answer progression
- clean reload/resume
- pause/resume once implemented

### Block 6 — Speech stack
Verify manually:
- STT mic capture
- TTS playback
- no severe GPU contention
- sentence-level playback sequencing

### Block 7 — Safety and private segments
Verify:
- safety overlay triggers correctly
- non-crisis cognitive distress is handled appropriately
- private segments remain private
- segment flags do not duplicate or drift

---

## Required Layer 2 evidence
Capture and save:
- browser console log or screenshot showing `runtime71`
- server log excerpt showing `LORI_RUNTIME`
- Run 2 result file
- one transcript excerpt per live persona
- one persistence/resume result note
- one TTS/STT verification note

---

## Layer 2 pass/fail conditions
Layer 2 fails if:
- runtime71 does not reach the model
- model ignores pass/era/mode in obvious ways
- persistence fails or resumes incorrectly
- support-person contamination appears in live transcript flow
- cognitive mode does not visibly affect prompting
- fatigue does not shorten/soften behavior
- live UI and backend disagree about current pass/era/mode

---

# LAYER 3 — Architecture Boundary Layer

## Purpose
Verify that Lorevox still honors its central doctrine:

**Archive → History → Memoir**

This is where systems often fail silently even if the UI looks correct.

## Boundary rules

### Archive layer must preserve:
- raw transcript
- exact wording
- uncertainty
- contradiction
- speaker order
- fragmented / interrupted phrasing

### History layer may structure:
- facts
- entities
- timeline events
- relationships
- scenes

But must not:
- invent certainty
- overwrite contradiction silently
- flatten support-person speech into subject speech
- convert fuzzy DOB into false exact DOB

### Memoir layer may narrativize:
- scenes
- summaries
- chapters
- obituary / legacy text

But must:
- stay traceable to history
- respect private segments
- respect human corrections
- respect support-person boundaries

---

## Required Layer 3 tests

### Test A — Speaker integrity
Use couple/support-person scenarios.
Verify:
- helper speech is not silently attributed to the subject
- memoir text does not contain helper third-person lines as subject first-person narrative

### Test B — Uncertainty preservation
Use uncertain DOB and fuzzy dates.
Verify:
- Archive keeps the raw statement
- History keeps estimate / note, not false exactness
- Memoir does not overstate

### Test C — Correction provenance
When a helper corrects a date:
- Archive keeps both forms
- History reflects confirmed value with traceability
- Memoir uses confirmed value only if verified

### Test D — Safety boundary
When distress occurs:
- runtime responds appropriately
- Archive preserves what was said
- Memoir does not auto-absorb distress material unless intentionally included

### Test E — Private segment exclusion
Verify:
- private material can stay excluded from memoir
- exclusion does not corrupt Archive or History
- review state is preserved

### Test F — Scene integrity
When “Save as Memory” becomes structured scene capture:
- scene keeps temporal context
- scene keeps people/place/sensory detail
- scene does not imply facts not stated
- scene links back to transcript reference

---

## Required Layer 3 outputs
Produce:
- one boundary audit report
- one contamination report
- one provenance report
- one memoir-exclusion verification note

---

# 5. Test folder structure to use in the repo

Create this under:
`C:\Users\chris\lorevox\tests\`

Recommended structure:

```text
tests/
  three-layer-model.md
  cohorts/
    20-person persona.md
    persona_cohort_25.md
    persona_cohort_30.md
  reports/
    SMOKE_TEST_REPORT_2026-03-11.md
    run1.md
    RUN2_MODEL_REPORT.md
    PERSONA_SIMULATION_REPORT.md
    LIVE_RUNTIME_REPORT.md
    ARCHITECTURE_BOUNDARY_REPORT.md
  protocols/
    TEST_STRATEGY.md
    PERSONA_SIMULATION_PROTOCOL.md
    LIVE_RUNTIME_TEST_CHECKLIST.md
    BOUNDARY_AUDIT_PROTOCOL.md
  results/
    test_model_results.json
    live_persona_logs/
    screenshots/
```

This file belongs at:
`tests/three-layer-model.md`

---

# 6. Recommended execution order

## Phase 1 — Startup and baseline
1. boot laptop stack
2. verify model load
3. verify runtime71 logging
4. verify prompt logging
5. confirm smoke baseline still passes

## Phase 2 — Pipeline + model
1. rerun Run 1 if prompt logic changed
2. run Run 2 real-model validation
3. fix prompt-composer issues before broader persona work

## Phase 3 — Persona simulation
1. run 30-person cohort
2. generate regression findings
3. classify defects

## Phase 4 — Live persona sessions
1. run seven high-risk live personas
2. capture persistence + runtime evidence
3. verify cognitive/affect shifts in real UI

## Phase 5 — Architecture boundary audit
1. inspect Archive / History / Memoir separation
2. verify no contamination
3. verify provenance and exclusions

## Phase 6 — Only then update handoff / Claude workflow
Testing comes first. Planning based on unverified assumptions does not count.

---

# 7. Release gates for Lorevox 7.1

Lorevox 7.1 should not be called stable until all of the following are true:

## Gate A — Simulation
- 30-person simulation run completed
- no regression in prior bugs
- cognitive/couple issues tracked or fixed

## Gate B — Runtime
- Run 2 real-model validation completed
- live browser/runtime test completed
- persistence works
- TTS/STT verified

## Gate C — Architecture
- no mixed-speaker memoir contamination
- no silent false exact dates
- private segment boundaries hold
- Archive / History / Memoir separation verified

---

# 8. What “great testing” means here

A great Lorevox test proves:
- Lori stays in the right pass
- Lori stays in the right era
- Lori adapts to recognition / light / grounding modes
- timeline seed actually changes behavior
- storage is faithful
- support-person sessions do not corrupt authorship
- uncertainty remains uncertainty
- memoir remains downstream narrative, not truth-making

That is the standard this file sets.

---

# 9. Immediate use

Use this file as the controlling checklist for:
- Run 2 execution
- persona testing with Claude
- live laptop validation
- handoff updates
- release readiness

Do not fragment testing across casual notes again.  
This file is the **testing spine**, the same way DOB + birthplace are the **interview spine**.
