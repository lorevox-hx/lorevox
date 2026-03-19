# Claude Live Validation Set — Lorevox 7.1
**Purpose:** Small, high-value live test set for Claude to run against the working Lorevox 7.1 system and produce a usable report.

**Use this when:**
- Lorevox is already running
- LLM backend is live
- TTS is live
- UI is live
- You want Claude to test behavior interactively without attempting the full three-layer model

**Do not use this as a replacement for the full Three-Layer Model.**  
This is the **live validation subset** for quick behavioral verification and reporting.

---

# 1. Instructions for Claude

Use the running Lorevox 7.1 UI and perform the six live tests below.

For each test:
1. State the setup
2. State the action taken
3. Record the observed Lori response
4. Mark:
   - PASS
   - PARTIAL
   - FAIL
5. Briefly explain why
6. Note any likely defect location:
   - UI/runtime state
   - prompt composer
   - model behavior
   - persistence
   - TTS
   - unknown

At the end, produce:
- a one-paragraph summary
- a defect list
- a recommended next step list

---

# 2. Live Test Set (6 tests)

## Test 1 — Pass 1 enforcement
### Goal
Verify Lori stays in timeline-seed mode when DOB and birthplace are missing.

### Setup
- Create a new person
- Do not enter DOB
- Do not enter birthplace

### Action
Send:
> Hi Lori, I’d like to tell my story.

### Expected
- Lori asks for DOB and/or birthplace
- Lori does not jump into life-story questions
- Lori does not behave as if the timeline already exists

### PASS criteria
- Lori clearly remains in Pass 1
- Lori asks for the missing seed information
- No drift into memoir or scene questions

---

## Test 2 — Timeline seed -> Pass 2A
### Goal
Verify DOB + birthplace create timeline behavior.

### Setup
Enter and save:
- DOB
- birthplace

Example:
- DOB: 1942-08-16
- Birthplace: Topeka, Kansas

### Action
Send:
> Okay, let’s begin.

### Expected
- Lori shifts into Pass 2A
- Lori asks an early-life / place-anchored question
- Lori behaves like a chronological guide, not a deep memoir interviewer yet

### PASS criteria
- Lori’s question is about early life, home, place, or who was around in childhood
- Response reflects timeline-seeded behavior

---

## Test 3 — Era switch
### Goal
Verify Lori follows the selected life period.

### Setup
- With timeline seed active
- Click a different life period in the UI (example: School Years)

### Action
Send:
> Let’s talk about that time.

### Expected
- Lori asks a question appropriate to the selected era
- Lori does not remain stuck in early childhood

### PASS criteria
- Question clearly matches the clicked era
- Era switch is reflected in behavior

---

## Test 4 — Pass 2A vs Pass 2B distinction
### Goal
Verify chronological mode and thematic mode behave differently.

### Setup
Part A:
- Set mode to Chronological

### Action A
Send:
> Tell me more.

### Expected A
- Lori continues timeline walk
- broad chronological question
- not a specific scene prompt

### Setup B
- Switch mode to Thematic

### Action B
Send:
> Tell me more.

### Expected B
- Lori shifts into scene/depth behavior
- asks for a specific moment, scene, feeling, or person
- not just a broad timeline walk

### PASS criteria
- Part A and Part B clearly differ
- Chronological = broad timeline
- Thematic = scene/depth

---

## Test 5 — Recognition mode / cognitive support
### Goal
Verify Lori reduces recall pressure and offers anchors.

### Setup
Trigger recognition mode by either:
- entering uncertain language naturally
- or manually setting recognition mode in console

### Action
Send:
> I’m not really sure. It’s hard to remember.

### Expected
- Lori offers anchors/options/cues
- Lori avoids memory-test phrasing
- Lori does not say “Do you remember...?”

### PASS criteria
- Response uses recognition support
- Response does not increase cognitive pressure
- No recall-test wording

---

## Test 6 — High fatigue / gentle close
### Goal
Verify Lori shortens, softens, and offers pause when fatigue is high.

### Setup
Set fatigue high in the runtime state if needed.

### Action
Send:
> We can keep going.

### Expected
- Lori shortens the response
- Lori softens tone
- Lori offers pause, break, or reduced pressure
- Lori does not ask a demanding next question

### PASS criteria
- Response reflects fatigue-aware behavior
- Lori offers relief, not pressure

---

# 3. Optional live test add-on

## Add-on A — Emotional difficulty
### Goal
Check acknowledgment under mild sadness/distress.

### Action
Send:
> That was a very hard time.

### Expected
- Lori acknowledges difficulty
- Lori does not become clinical
- Lori does not abruptly change subject without acknowledgment

Use this as optional if time allows.

---

# 4. Claude report format

Use this exact structure in the final report.

## Lorevox 7.1 Live Validation Report

### Environment
- Date:
- Tester:
- Backend running: Yes/No
- TTS running: Yes/No
- UI running: Yes/No
- Model loaded: Yes/No

---

### Test 1 — Pass 1 enforcement
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

### Test 2 — Timeline seed -> Pass 2A
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

### Test 3 — Era switch
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

### Test 4 — Pass 2A vs Pass 2B
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

### Test 5 — Recognition mode / cognitive support
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

### Test 6 — High fatigue / gentle close
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

---

### Summary
Write one paragraph summarizing whether Lori behaved like a true 7.1 interviewer:
- pass-aware
- era-aware
- recognition-capable
- fatigue-aware

---

### Defects found
List each defect with:
- short name
- severity: low / medium / high
- likely source

Example:
- Era switch ignored — medium — prompt composer/runtime bridge
- Fatigue not respected — high — model directive strength
- Recognition too vague — medium — prompt composer wording

---

### Recommended next steps
List the top 3–5 actions.

Example:
1. Strengthen recognition-mode directive wording in prompt composer
2. Shorten fatigue-mode response instruction
3. Add stronger era-specific language in runtime directive block

---

# 5. Practical note

This live set is intentionally small. It is not trying to replace:
- Run 2 real-model testing
- 30-person simulation
- architecture boundary audit

It is meant to answer one question quickly:

**Does the running Lorevox 7.1 system behave correctly in the most important live scenarios?**
