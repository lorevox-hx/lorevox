# GUIDED_NARRATIVE_ENGINE.md

**Status:** Proposed for Lorevox v7 Phase 2  
**Scope:** Backend orchestration layer for Lori's interview behavior  
**Primary role:** Make Lori feel warm and natural while the backend quietly enforces coverage, scene depth, pacing, and safety

---

## 1. Purpose

The Guided Narrative Engine is the hidden control layer behind Lori in Lorevox v7.

The user should never experience a rigid questionnaire, visible interview checklist, or mechanical state machine. The user experiences a warm conversation. The backend tracks interview progress, narrative depth, fatigue, affect state, and coverage gaps invisibly.

This engine exists to satisfy the core v7 product direction:

- Lori is the app.
- The UI should reduce cognitive load, not show capability.
- The interview must remain conversational, but not structureless.
- The archive must become structured enough to support timeline, family tree, memoir, and obituary generation.

The Guided Narrative Engine is therefore **not** a writing mode, **not** a storage system, and **not** a fact authority. It is a **conversation planner and directive composer**.

---

## 2. Design goals

### Required outcomes

The engine must:

1. Keep Lori conversational and emotionally appropriate.
2. Move the interview through life-review phases without exposing those phases to the user.
3. Detect when the user has offered a summary and gently deepen it into a scene.
4. Detect fatigue, distress, or overload and shift Lori into grounding or pause behavior.
5. Prevent Lori from asking questions the archive already knows the answer to.
6. Support family-tree discovery through natural conversation.
7. Support historical anchoring without turning Lori into a trivia bot.
8. Resume intelligently across sessions.
9. Hand off the conversation safely to the extraction pipeline without letting prompt logic become truth storage.

### Non-goals

The engine must **not**:

- write reviewed facts directly
- collapse transcript, claims, facts, and events into one memory blob
- silently rewrite profile truth
- rely on visible UI progress bars or numbered sections
- force chronological precision where the subject is uncertain
- continue pushing when the user is tired or emotionally saturated

---

## 3. Product doctrine

The user experiences **a memory conversation in the foreground, with a living archive quietly assembling in the background**.

The Guided Narrative Engine operationalizes that doctrine by separating:

- **conversation control** from **fact storage**
- **narrative guidance** from **review and acceptance**
- **provisional working memory** from **archival truth**

The engine is allowed to influence Lori's next move. It is not allowed to decide what becomes historical truth.

---

## 4. Placement in the architecture

The engine sits between inbound chat turns and the LLM call.

```text
User turn received
  → transcript persisted
  → session vitals updated
  → archive snapshot / live profile projection loaded
  → narrative planner evaluates next phase + next goal
  → directive composer builds final system prompt bundle
  → Lori response generated
  → assistant turn persisted
  → async provisional extraction scheduled
```

It should be wired into the main chat path, not a separate interview-only route.

---

## 5. Core components

The Guided Narrative Engine should be implemented as a small group of focused backend modules.

### Recommended files

```text
server/code/api/
  narrative_engine.py          # façade entrypoint
  narrative_state.py           # enums, state transitions, next-goal planner
  session_vitals.py            # fatigue, distress, silence, pace metrics
  reentry_manager.py           # cross-session restart logic
  historical_anchors.py        # age/year/world-event resolution
  relationship_mapper.py       # person mention detection + relation goals
  prompt_directives.py         # directive objects and priority ordering
  prompt_composer.py           # final system prompt assembly
```

### Responsibilities

- `narrative_state.py` decides the current hidden phase and next turn objective.
- `session_vitals.py` computes fatigue, distress, and narrative momentum.
- `reentry_manager.py` chooses how Lori resumes after a break.
- `historical_anchors.py` injects quiet age-aware world context when useful.
- `relationship_mapper.py` recognizes newly introduced people and shifts Lori into family discovery mode.
- `prompt_directives.py` defines prompt rules as composable priority blocks.
- `prompt_composer.py` assembles the final instruction stack for the LLM.
- `narrative_engine.py` coordinates the whole flow.

---

## 6. Hidden interview phases

The phase model should be derived from the v7 planning synthesis. These phases are **backend states**, not user-facing sections.

### Phase A — ORIENTATION

Purpose:
- locate the person in time, place, and family baseline

Typical targets:
- approximate birth era or DOB
- birthplace or where they grew up
- household structure
- cultural / regional roots

Lori behavior:
- broad, warm, open-ended
- one gentle question at a time
- no interrogation for exact dates

### Phase B — LIFE_CHAPTERS

Purpose:
- identify natural eras of life without making the user create an outline manually

Typical targets:
- childhood / school years
- work or training era
- marriage / partnership era
- parenting / caregiving era
- relocation or reinvention periods

Lori behavior:
- map boundaries of an era
- ask what daily life was like
- ask who was around during that period

### Phase C — SCENE_CAPTURE

Purpose:
- convert summary into memoir-grade scene material

Typical triggers:
- turning point
- first time / last time
- sudden change
- strong emotional memory
- high point / low point

Lori behavior:
- do not ask “what happened next?”
- ask for one sensory detail, object, or immediate internal feeling
- stay inside the moment

### Phase D — THEMATIC_DEEPENING

Purpose:
- identify recurring patterns and meaning across eras

Typical themes:
- resilience
- duty
- belonging
- faith
- migration
- humor
- grief
- chosen family

Lori behavior:
- gently connect current material to an emerging pattern
- invite reflection without over-interpreting

### Phase E — LEGACY_MODE

Purpose:
- shift from history gathering toward memory, values, lessons, and obituary tone

Typical targets:
- what mattered most
- what they want remembered
- what family legacy means
- preferred tone for remembrance
- what should never be included

Lori behavior:
- respectful and spacious
- no pressure toward closure
- especially careful around vulnerability and mortality

---

## 7. Support states

In addition to the main interview phases, Lorevox v7 should include support states.

### GENTLE_REENTRY

Purpose:
- start a new session in a humane way

Lori behavior:
- welcome the user back
- reference the last meaningful topic or scene
- offer a choice between resuming or shifting topics

### RELATIONSHIP_MAPPING

Purpose:
- discover who a newly mentioned person is and why they matter

Lori behavior:
- ask relation and personality/vibe naturally
- avoid genealogy-software tone

### CHRONOLOGY_CLARIFICATION

Purpose:
- clarify rough ordering when the memory matters but timing is fuzzy

Lori behavior:
- ask for relative order or rough era
- never force false precision

### GROUNDING

Purpose:
- reduce emotional load without necessarily ending the session

Lori behavior:
- soften tone
- move to safe sensory or present-time anchors
- reduce cognitive demand

### FATIGUE_PAUSE

Purpose:
- stop exploratory questioning when the user is clearly tired or saturated

Lori behavior:
- validate
- briefly summarize progress
- offer to pause for the day

### SESSION_CLOSE

Purpose:
- close well rather than “squeeze in one more question”

Lori behavior:
- mark completion warmly
- note what was gathered today
- leave a gentle doorway for next time

---

## 8. State selection model

A single state is not enough. Each turn should produce a **planning result**.

### Recommended planning object

```python
class NextTurnPlan(BaseModel):
    current_phase: str
    state_reason: str
    next_goal: str
    question_style: str
    allowed_moves: list[str] = []
    blocked_moves: list[str] = []
    historical_anchor: str | None = None
    person_focus: str | None = None
    fatigue_score: int = 0
    distress_score: int = 0
    momentum_score: int = 0
```

This makes the engine more stable than a bare enum because two moments in the same phase may still require different question styles.

Example:

```python
NextTurnPlan(
    current_phase="scene_capture",
    state_reason="user described leaving old house",
    next_goal="anchor departure moment",
    question_style="single sensory prompt",
    allowed_moves=["sensory detail", "physical object", "felt sense"],
    blocked_moves=["broad summary", "future jump", "checklist question"],
)
```

---

## 9. Session vitals

The Guided Narrative Engine should track live session health.

### Minimum vitals

```python
class SessionVitals(BaseModel):
    session_id: str
    session_start_at: str | None = None
    last_user_turn_at: str | None = None
    turn_count: int = 0
    recent_response_lengths: list[int] = []
    recent_question_types: list[str] = []
    silence_duration_ms: int | None = None
    last_affect_state: str = "steady"
    last_safe_topic: str | None = None
    last_completed_phase: str | None = None
    turns_since_new_fact: int = 0
    turns_since_new_person: int = 0
    scene_depth_score: int = 0
    fatigue_reason_codes: list[str] = []
```

### Why these matter

- `turn_count` helps estimate session length and pacing load.
- `recent_response_lengths` helps detect drop-off into short or fatigued replies.
- `last_affect_state` supports softened mode and pause logic.
- `turns_since_new_fact` helps detect stalled questioning.
- `scene_depth_score` helps know whether Lori is actually getting memoir-grade material.
- `recent_question_types` prevents repetitive interviewing.

---

## 10. Scoring model

The engine should compute three independent scores.

### 10.1 Fatigue score

Purpose:
- detect cognitive tiredness or saturation

Likely signals:
- too many turns
- response length drop-off
- long uninterrupted session
- flatlining affect after long engagement

### 10.2 Distress score

Purpose:
- detect emotional overload or destabilization

Likely signals:
- affect states like `distressed` or `overwhelmed`
- safety or heaviness flags from backend text analysis
- sudden silence after an intense disclosure

### 10.3 Narrative momentum score

Purpose:
- detect whether Lori is still getting useful material

Likely signals:
- richer replies
- new people / places / scenes being introduced
- rising scene depth
- active elaboration

### Why split the scores

One number is not enough.

Examples:
- high fatigue + low distress → pause warmly
- low fatigue + high distress → ground first
- low fatigue + low momentum → change technique
- high momentum + low fatigue → keep going or deepen scene

---

## 11. Prompt directive stack

Prompting should be modeled as a priority-ordered directive stack.

### Recommended directive model

```python
class PromptDirective(BaseModel):
    priority: int
    kind: str
    content: str

class PromptBundle(BaseModel):
    persona: str
    directives: list[PromptDirective]
    known_facts: dict
    hidden_context: dict
```

### Recommended order

1. safety override
2. distress / grounding override
3. fatigue pause or session close override
4. current narrative phase directive
5. next-goal directive
6. skip-logic / known facts
7. historical anchor
8. active-tab or UI context
9. style and output constraints

This ordering ensures urgent conditions override narrative ambitions.

---

## 12. Prompt doctrine

Lori's base instruction should remain stable.

### Base persona rules

Lori should:
- sound warm, patient, and grounded
- ask one question at a time
- remain conversational, never clinical
- use short responses by default
- listen for scenes, people, and meaning
- respect uncertainty and ambiguity
- avoid sounding like a form or survey

Lori should not:
- ask multiple unrelated questions at once
- over-praise or exaggerate
- infer unsupported facts
- force chronology when the user is unsure
- keep probing when the user is tired or moved

---

## 13. Skip logic and working memory

The engine should load a lightweight archive snapshot or live profile projection before each response.

### Use of known facts

Known facts are used to:
- avoid repetitive questions
- personalize follow-ups
- support re-entry
- support relationship-aware questions

Known facts are **not** used as proof that a reviewed fact exists.

Recommended naming:
- `LiveProfileProjection`
- `ArchiveSnapshot`
- `SessionWorkingMemory`

Avoid names that imply final truth if the data came from provisional extraction.

---

## 14. Historical anchors

Historical anchors are optional context injections used when Lori has enough temporal grounding.

### Use cases

- age-aware era recall
- historically meaningful periods
- culturally relevant prompts

### Rules

- only use when it fits naturally
- never dominate the conversation
- do not turn Lori into a history lecturer
- only inject if there is enough DOB/era confidence to avoid nonsense

Example:

```text
[SYSTEM FACT: User was approximately 17 in 1969. Relevant world context: Apollo 11, Woodstock. Use only if it fits naturally.]
```

---

## 15. Family-tree conversational mode

When a new person is introduced, the engine may shift into `RELATIONSHIP_MAPPING`.

### Goals

- discover relation to the subject
- discover side of family where possible
- capture the person's emotional or narrative role
- keep the conversation natural

### Minimum person-related metadata to support later extraction

```json
{
  "name": "Uncle Joe",
  "relation_type": "maternal_uncle",
  "certainty": "medium",
  "side_of_family": "maternal",
  "importance": "high",
  "tone": "warm",
  "alive_status": "unknown",
  "source_session_id": "sess_001"
}
```

The engine may seek this information conversationally, but it should not interrogate for all of it at once.

---

## 16. Re-entry rules

Re-entry must be cross-session, not just “turn count is zero.”

The engine should consult:
- last meaningful topic
- last hidden phase
- unresolved scene
- last fatigue endpoint
- any sensitive flags
- elapsed time since last session

### Re-entry choices

- resume the last scene
- widen back out to the larger era
- choose a lighter/safe topic
- offer the user an open choice

Example Lori openings:
- “Last time you were telling me about leaving the old house. We can go back there, or stay with that general chapter of life.”
- “We ended on a heavy topic last time. We can return to it, or talk about something lighter today.”

---

## 17. Integration with affect and safety

The engine should consume affect state as a derived signal, not raw camera telemetry.

### Affect integration rules

- affect state may modify tone and pacing
- affect state may raise distress or fatigue scores
- raw video, landmarks, or face details should not be required in the engine

### Safety integration rules

- severe safety events should override interview progression
- heavy but non-severe material should trigger softened mode or grounding
- the engine must never compete with the safety layer for control

---

## 18. Boundaries with extraction

The Guided Narrative Engine should cooperate with extraction, but remain separate from it.

### The engine may

- trigger provisional extraction after turns
- load a live profile projection for skip logic
- expose person/topic/phase hints useful to extraction

### The engine may not

- write reviewed facts directly
- mark claims approved
- create verified events by itself
- silently merge uncertain relationship data into archival truth

This separation is mandatory.

---

## 19. Suggested request flow

```text
1. Receive user message
2. Persist transcript turn
3. Load session vitals
4. Load live profile projection / archive snapshot
5. Load prior session re-entry context if needed
6. Compute fatigue, distress, and momentum scores
7. Evaluate hidden phase + next-turn plan
8. Build directive stack
9. Compose final system prompt
10. Generate Lori response
11. Persist Lori response
12. Schedule async provisional extraction if rate limits allow
```

---

## 20. Implementation order

### Step 1
Create planning objects and vitals models.

### Step 2
Implement fatigue, distress, and momentum scoring.

### Step 3
Implement hidden phase evaluation and next-turn planning.

### Step 4
Implement prompt directives and composer.

### Step 5
Wire the engine into the main chat path.

### Step 6
Add cross-session re-entry logic.

### Step 7
Add relationship mapping and historical anchors.

### Step 8
Tune with real interviews.

---

## 21. Minimal acceptance criteria

Phase 2 is working when:

1. Lori no longer asks visibly checklist-like questions.
2. Lori can shift from broad era discovery into scene capture naturally.
3. Lori stops or softens when fatigue or distress rises.
4. Lori does not repeatedly ask for already-known facts.
5. Lori can resume intelligently at the start of a new session.
6. Newly mentioned relatives can be followed up conversationally.
7. The conversation remains warm even though the backend is structured.

---

## 22. Future extensions

Later versions may add:
- chapter-coverage maps
- memoir-scene scoring
- obituary-tone capture prompts
- proxy/support-person mode adjustments
- adaptive pacing by age, sensory needs, or speech tempo
- topic recommendation from review queue gaps

These are extensions, not prerequisites for Phase 2.

---

## 23. Summary

The Guided Narrative Engine is the hidden backend planner that makes Lorevox v7 feel effortless.

It gives Lori enough structure to produce memoir-grade interviews without exposing structure to the user. It protects cognitive load, supports scene-rich storytelling, respects uncertainty, and keeps the archive doctrine intact by refusing to treat conversational guidance as historical truth.

That is the heart of Phase 2.
