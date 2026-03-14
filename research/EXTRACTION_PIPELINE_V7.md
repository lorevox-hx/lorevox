# EXTRACTION_PIPELINE_V7.md

**Status:** Proposed for Lorevox v7 Phase 3  
**Scope:** Archive/History pipeline following the Guided Narrative Engine  
**Primary role:** Convert conversation into structured, reviewable history without collapsing archival truth into chatbot memory

---

## 1. Purpose

Lorevox v7 needs a structured extraction pipeline that preserves the product promise:

- the user talks naturally to Lori
- the UI begins to fill in while the conversation happens
- the archive remains trustworthy
- AI suggestions do not silently become facts

This document defines the extraction architecture for v7.

The extraction pipeline is responsible for converting transcript material into:
- candidate profile patches
- claims
- entities
- relationships
- event suggestions
- review queue items
- later, verified facts and timeline events after review

It must support the live “Lori is learning” experience without compromising archival integrity.

---

## 2. Core doctrine

Lorevox is **not** an AI chatbot with mutable memory.

The extraction pipeline must preserve this chain:

```text
person → sessions → claims → review → facts → events → memoir / obituary
```

Every step matters.

### Non-negotiable rules

1. Transcript is source material.
2. A claim is what someone said.
3. A fact is a reviewed claim.
4. Events are built from reviewed facts, not raw chat impressions.
5. Approximate dates must stay approximate.
6. AI suggestions enter review before they become fact or timeline truth.
7. Consolidation may suggest; it may not silently rewrite.
8. Narrative outputs must trace back to verified history.

---

## 3. Why v7 needs a hybrid pipeline

A single extraction pass at session end is too slow for the desired UI experience.
A continuously self-updating memory blob is too dangerous for archive integrity.

The right answer for Lorevox v7 is a **dual-lane extraction system**:

1. a fast provisional lane during conversation
2. a slower archival lane after the session or on demand

This gives Lorevox both:
- a living archive feel in the UI
- disciplined review before anything becomes truth

---

## 4. High-level architecture

```text
Conversation lane
  User ↔ Lori
    ↓
Transcript persisted
    ↓
Lane A: Live provisional extraction (async, rate-limited)
    ↓
Live profile projection / tab updates

Session close or process-now trigger
    ↓
Lane B: Session archival extraction
    ↓
Claims / entities / relationships / event suggestions / review items
    ↓
Human review
    ↓
Approved claims become facts
    ↓
Timeline builder creates verified events
    ↓
Narrative generation uses verified events + facts
```

---

## 5. Pipeline lanes

## Lane A — Live provisional extraction

### Purpose

Keep Lori context-aware and keep the visible tabs alive while the user is talking.

### Timing

- run asynchronously after assistant turns
- only if at least 2 new turns since the last extraction
- rate-limit to avoid model thrash
- never block the main Lori response

### Recommended inputs

- person id
- session id
- last 4–8 turns
- optional current narrative phase
- optional active UI tab
- current live profile projection

### Recommended outputs

- `candidate_profile_patch`
- `candidate_people`
- `candidate_relationships`
- `candidate_eras`
- `candidate_scene_markers`
- `candidate_values`
- `candidate_interests`

### What these outputs are for

- Profile tab live updates
- Family Tree preview nodes
- Timeline placeholders
- Lori skip logic on future turns
- Guided Narrative Engine context

### What these outputs are **not** for

- reviewed fact acceptance
- final event creation
- irreversible profile truth

### Storage target

Write to a provisional area, not directly to the accepted fact store.

Recommended examples:

```text
memory/archive/people/<person_id>/extracted/live_profile_projection.json
memory/archive/people/<person_id>/extracted/live_candidates.jsonl
```

---

## Lane B — Session archival extraction

### Purpose

Convert a completed or paused session into reviewable historical structure.

### Timing

Run when:
- the user ends the session
- Lori enters session close / fatigue pause and the session idles
- the user clicks “process today’s interview”
- a batch consolidation job is invoked manually

### Recommended inputs

- full session transcript
- session metadata
- any images or source docs linked to the session
- current entity dictionary / alias map
- current accepted facts for contradiction checks

### Required outputs

- atomic claims with source spans
- uncertainty/confidence markers
- entities
- relationship proposals
- event suggestions
- conflict flags
- review queue items

### Core principle

This lane is allowed to become structured. It is not allowed to become unquestioned truth.

---

## Lane C — Consolidation and gap analysis

### Purpose

Read across sessions to identify:
- contradictions
- missing life eras
- underdeveloped family branches
- recurring themes
- likely duplicate entities
- suggested next interview targets

### Timing

Run:
- nightly
- on demand
- after N new sessions

### Output behavior

All consolidation output goes to review or suggestion layers. None of it silently rewrites facts.

---

## 6. Data flow in detail

### Step 1 — Transcript persistence

Every turn must be written as immutable session source material.

Minimum session files:

```text
memory/archive/people/<person_id>/sessions/<session_id>/
  meta.json
  transcript.jsonl
  transcript.txt
```

The transcript is the source of truth for what was said.

### Step 2 — Provisional extraction

The live extractor reads recent turns and emits narrow JSON.

Examples of valid output:
- name or preferred name
- birthplace mention
- “Melanie” as spouse
- “moved to Chicago in my twenties” as era candidate
- “the day we left the farm” as scene marker

### Step 3 — Session archival extraction

The archival extractor reads the whole session and emits atomic claims.

Each claim should include:
- `claim_id`
- `person_id`
- `session_id`
- `source_span`
- `claim_type`
- `statement`
- `date_text`
- `date_precision`
- `confidence`
- `status`

### Step 4 — Review queue population

Claims, merges, date clarifications, and event suggestions should appear in a review system before they become archival truth.

### Step 5 — Fact acceptance

Approved claims become facts.

### Step 6 — Timeline building

Timeline events are built from approved facts, preserving uncertainty.

### Step 7 — Narrative generation

Memoir and obituary generation should operate on verified events and facts, not on provisional extraction or raw transcripts alone.

---

## 7. Storage model

The extraction pipeline should map cleanly onto the person-first archive layout.

### Recommended folder alignment

```text
DATA_DIR/
  memory/
    archive/
      people/
        <person_id>/
          sessions/
            <session_id>/
              meta.json
              transcript.jsonl
              transcript.txt
          extracted/
            claims.jsonl
            facts.jsonl
            entities.jsonl
            relationships.jsonl
            live_profile_projection.json
            live_candidates.jsonl
          review/
            queue.jsonl
            decisions.jsonl
            conflicts.jsonl
          timeline/
            events.jsonl
            life_phases.jsonl
            event_fact_links.jsonl
          narrative/
            chapter_drafts/
```

### Why this matters

The folder design keeps:
- source material separate from extracted suggestions
- reviewed facts separate from provisional claims
- timeline separate from raw extraction
- narrative separate from historical source material

---

## 8. Live profile projection vs archival truth

This distinction must remain explicit.

### Live profile projection

Purpose:
- convenience for UI
- skip logic for Lori
- lightweight visible progress

Properties:
- may be provisional
- may contain unreviewed or tentative material
- should be replaceable or regenerable

### Accepted fact store

Purpose:
- trusted historical record
- timeline source
- narrative source

Properties:
- derived from reviewed claims
- auditable
- provenance-preserving
- stable unless changed through explicit review or correction

### Rule

The live projection may inform Lori. It does not define history.

---

## 9. What gets extracted

The extraction pipeline should operate at multiple levels.

### 9.1 Claims

Examples:
- “I was born in Williston, North Dakota.”
- “We moved to Santa Fe after Dad retired.”
- “My brother Jay ran naked around the house when ‘The Streak’ came out.”

Claims should be atomic whenever possible.

### 9.2 Entities

Examples:
- people
- places
- schools
- employers
- military branches
- churches
- organizations
- named historical events

### 9.3 Relationships

Examples:
- spouse
- child
- mother
- father
- sibling
- aunt / uncle
- friend / mentor / pastor / caregiver

Relationships should allow uncertainty and narrative notes.

### 9.4 Eras / life phases

Examples:
- school years
- army period
- Chicago years
- raising children
- post-divorce rebuilding

### 9.5 Scene markers

Examples:
- first day at bakery
- leaving the old farm
- wedding reception in church hall
- last conversation with mother

Scene markers are not yet memoir paragraphs. They are strong candidates for future narrative drafting.

### 9.6 Event suggestions

Examples:
- marriage event
- relocation event
- employment change
- military service start
- death or loss event

These remain suggestions until grounded in reviewed facts.

---

## 10. Extraction prompt strategy

Use different prompts for different lanes.

### Live provisional extractor prompt

Characteristics:
- short context window
- JSON only
- conservative field set
- no inference beyond what is explicit
- optimized for speed and UI usefulness

### Session archival extractor prompt

Characteristics:
- full transcript or transcript chunking
- atomic claim extraction
- source-span aware
- confidence and uncertainty marking
- richer output schema

### Consolidation prompt

Characteristics:
- cross-session reasoning
- conflict detection
- gap suggestion
- alias/entity merge proposals
- strictly suggestion-only output

---

## 11. Source spans and provenance

Every extracted claim should point back to where it came from.

### Minimum provenance requirements

Each claim should include:
- session id
- turn index or turn ids
- source text span if available
- extraction timestamp
- extraction model version or lane label

This is what makes later review and narrative traceability possible.

---

## 12. Review queue design

The review queue is mandatory for Lorevox.

### Item types

- extracted claim
- entity merge proposal
- relationship proposal
- date conflict
- event suggestion
- consolidation suggestion

### Minimum fields

```json
{
  "item_id": "rq_001",
  "item_type": "claim",
  "item_ref": "c_001",
  "suggestion": "Birthplace is Williston, North Dakota",
  "confidence": 0.92,
  "source": {
    "session_id": "sess_003",
    "turn_index": 14
  },
  "status": "pending"
}
```

### User actions

- approve
- edit then approve
- reject
- mark uncertain
- defer / ask later

Lorevox should never skip this layer for claims that materially shape history.

---

## 13. Contradiction handling

Contradictions are expected, not failures.

The pipeline should flag:
- conflicting years
- incompatible family relationships
- duplicate but mismatched entities
- contradictory place histories

### Correct handling

- keep the contradiction visible
- send it to review
- allow “uncertain” as an acceptable resolution
- never overwrite older facts silently

---

## 14. Date precision rules

Date handling must preserve uncertainty.

### Valid examples

- `1962`
- `around 1975`
- `spring 1984`
- `uncertain: early 1990s`
- `1989-06-14` when explicitly stated

### Invalid behavior

Do not convert:
- “around 1975” → `1975-06-01`
- “high school years” → exact dates without evidence

The pipeline must carry:
- raw date text
- normalized date if possible
- date precision
- approximation flag

---

## 15. Event synthesis rules

Timeline events should be conservative.

### Allowed event creation

Create event suggestions when:
- a single reviewed fact is already event-shaped
- multiple reviewed facts are explicitly linked and clearly refer to the same event

### Forbidden event creation

Do not auto-merge facts into one event because they share only:
- the same year
- the same city
- the same family member

Lorevox should prefer fewer, trustworthy events over flashy but fabricated timelines.

---

## 16. Model strategy

### Recommended starting point

Use the same local model stack for both conversation and extraction, but in separate lanes.

- Lane 1: Lori conversation
- Lane 2: short async extraction call
- Lane 3: session archival extraction after close or on demand

This is simpler to implement and easier to debug initially.

### Later optimization

If needed, split roles across models:
- larger conversational model for Lori
- smaller structured extractor for claims / entities / relationships
- tiny classifier for scene / era / fatigue hints

Model split is a performance decision, not the first architectural decision.

The key design issue is authority, not model size.

---

## 17. Integration with the Guided Narrative Engine

The extraction pipeline should exchange only bounded information with the Guided Narrative Engine.

### The narrative engine may provide

- current hidden phase
- next-goal hints
- active person focus
- whether Lori is in family mapping or scene capture

### The extraction pipeline may provide back

- live profile projection updates
- new person candidates
- era candidates
- scene markers
- contradiction warnings for future review

### Required boundary

Prompt routing and interview guidance must remain separate from archival acceptance.

---

## 18. Suggested modules

```text
server/code/api/
  extract_live.py            # recent-turn provisional extraction
  extract_session.py         # full-transcript archival extraction
  review_queue.py            # pending suggestions and decisions
  entity_resolution.py       # alias / merge proposals
  event_builder.py           # verified-event creation from facts
  consolidation.py           # nightly or on-demand suggestions
  projection.py              # builds live profile projection for UI/Lori
```

### Module roles

- `extract_live.py` emits provisional JSON for live UI and Lori context.
- `extract_session.py` emits atomic claims and structured proposals from full sessions.
- `review_queue.py` stores and updates pending review items.
- `entity_resolution.py` proposes merges, never applies automatically.
- `event_builder.py` creates timeline events from reviewed facts.
- `consolidation.py` finds gaps, conflicts, and possible connections.
- `projection.py` builds fast-read views from accepted + provisional material.

---

## 19. Suggested API / job triggers

### Live lane trigger

```text
after_assistant_turn(person_id, session_id, recent_turns)
```

### Session lane trigger

```text
process_session(person_id, session_id)
```

### Consolidation trigger

```text
consolidate_person_memory(person_id)
```

### Projection refresh trigger

```text
rebuild_live_projection(person_id)
```

---

## 20. Suggested output schemas

### 20.1 Live candidate example

```json
{
  "session_id": "sess_001",
  "candidate_profile_patch": {
    "birthplace": "Williston, North Dakota"
  },
  "candidate_people": [
    {
      "name": "Melanie",
      "relation": "spouse",
      "certainty": "high"
    }
  ],
  "candidate_eras": [
    {
      "label": "Chicago years",
      "certainty": "medium"
    }
  ]
}
```

### 20.2 Atomic claim example

```json
{
  "claim_id": "c_000123",
  "person_id": "chris_horne",
  "session_id": "sess_004",
  "source_span": {
    "turn_index": 22,
    "char_start": 18,
    "char_end": 104
  },
  "claim_type": "relocation",
  "statement": "We packed the truck and left the old house for New Mexico.",
  "date_text": "when we moved to New Mexico",
  "date_precision": "unknown",
  "confidence": 0.84,
  "status": "pending_review"
}
```

### 20.3 Event suggestion example

```json
{
  "suggestion_id": "evs_001",
  "event_type": "move",
  "title": "Move to New Mexico",
  "supported_by_claim_ids": ["c_000123", "c_000130"],
  "date_text": "unknown",
  "confidence": 0.71,
  "status": "pending_review"
}
```

---

## 21. Failure handling

Failures in Lane A must never interrupt conversation.

### Live lane failures

- log error
- skip silently
- preserve conversation continuity

### Session lane failures

- mark processing state
- preserve transcript
- allow re-run
- never discard partial source material

### Review / projection failures

- preserve raw extracted output
- retry projection separately
- never let projection failure imply archive failure

---

## 22. Minimal acceptance criteria

Phase 3 extraction is working when:

1. The Profile tab begins filling during conversation without visible forms.
2. Lori becomes less repetitive because skip logic can use live projection.
3. Full session processing creates atomic claims with source spans.
4. AI suggestions appear in a review queue rather than silently becoming facts.
5. Contradictions can be surfaced without overwriting old material.
6. Timeline events are created from reviewed facts, not raw chat summaries.
7. Memoir generation can later cite verified historical material.

---

## 23. Implementation order

### Step 1
Build `extract_live.py` and write provisional outputs only.

### Step 2
Build `projection.py` so the UI and Lori can read a live profile projection.

### Step 3
Build `extract_session.py` with atomic claim output and source spans.

### Step 4
Build `review_queue.py` and wire all archival suggestions into it.

### Step 5
Build `entity_resolution.py` and conflict handling.

### Step 6
Build `event_builder.py` from reviewed facts only.

### Step 7
Only then wire memoir / obituary generation to verified facts and events.

---

## 24. Summary

Lorevox v7 should use a hybrid extraction pipeline.

A fast provisional lane keeps Lori context-aware and makes the UI feel alive. A slower archival lane converts transcript into claims, review items, entities, relationships, and event suggestions with provenance. Review remains the gate between what was said and what becomes history.

That is how Lorevox can feel effortless without becoming careless.
