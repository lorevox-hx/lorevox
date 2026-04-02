# OpenClaw Patterns in Lorevox

This document explains how Lorevox can absorb the **good behavioral patterns** of an OpenClaw-class agent system without importing its framework, weakening its archive rules, or drifting away from its local-first philosophy.

The goal is not to make Lorevox into a general-purpose automation shell.
The goal is to make Lorevox a **better memoir and oral-history agent**.

---

## 1. What Lorevox should borrow

OpenClaw-class systems tend to do four things well:

1. **Agent loop orchestration**
   - Every turn goes through a repeatable cognitive loop.
   - The system does not merely answer; it **recalls, decides, acts, and reflects**.

2. **Hooks around every turn**
   - Work happens **before** the LLM call, **after** the LLM call, and **after** tools run.
   - This is where memory recall, retrieval, policy checks, and post-turn writing happen.

3. **RAG as a skill**
   - Retrieval is not a separate product surface.
   - It is one of the agent’s internal capabilities and is invoked only when useful.

4. **Reflection and memory hygiene**
   - After a turn, the system distills what mattered.
   - It creates compact internal artifacts instead of repeatedly stuffing raw transcript text back into prompts.

Those patterns fit Lorevox extremely well because Lorevox already has the richer architecture:

- an immutable archive
- a structured history layer
- a memoir layer
- a review queue
- timeline/event concepts
- safety and affect systems
- a local-first runtime

What Lorevox is missing is **not schema richness**. It is a lightweight, stable **behavior layer** on top of the schema.

---

## 2. What Lorevox must not borrow

Lorevox must not copy the weakest habits of generic memory agents.

### 2.1 Never let summaries become truth

Lorevox’s truth model is:

```text
ARCHIVE → HISTORY → MEMOIR
```

That means:

- transcripts, audio, photos, and documents remain immutable
- extracted claims are not facts
- AI suggestions do not silently become facts
- memoir prose is downstream of reviewed history

So Lorevox should **not** adopt a loop where the system rewrites its own running memory summary and then treats that summary as authoritative.

### 2.2 Never collapse “memory” into a single blob

Generic agent systems often use one memory store for everything:

- preferences
- recent context
- facts
- plans
- summaries
- retrieval snippets

Lorevox should not do that.

Lorevox needs distinct memory classes because its domain is biographical truth, not generic productivity chat.

### 2.3 Never auto-merge biographical events

A generic agent may see:

- “moved in 1989”
- “started college in 1989”

and compress them into one narrative memory.

Lorevox must not.

Two events sharing a year are not the same event.
Dates must preserve uncertainty and separation unless the source explicitly links them.

---

## 3. Lorevox-native mental model

Lorevox should treat the OpenClaw pattern as a **cognitive shell** around the current system.

```text
user turn
  → before_llm hook
  → LLM decision step
  → optional skill execution
  → after_tool hook
  → reflection
  → reviewable writes
```

This does not replace the current product philosophy.
It strengthens it.

The agent loop should live in the **History layer**, never in the Archive layer.

That gives Lorevox a safe division of labor:

### Archive
- raw transcript turns
- raw audio
- raw images/docs
- affect events as captured
- safety flags as captured

### History
- extracted claims
- proposed tags
- candidate timeline entries
- candidate entity links
- turn summaries
- retrieval summaries
- review queue items

### Memoir
- chapter drafts
- obituary/life summary drafts
- narrative excerpts

---

## 4. The five behavioral upgrades Lorevox should implement

## 4.1 Before-LLM recall

Before Lori answers, the system should gather only the context that is useful for the current turn.

That context can include:

- recent conversation turns
- active person profile
- current interview section
- prior section summaries
- affect context from the browser-derived affect stream
- safety-softening state
- verified timeline anchors relevant to the question
- compact retrieval snippets from prior sessions/documents

The point is not to flood the prompt.
The point is to give Lori the **right memory, not all memory**.

### Example

If the user says:

> Tell me more about when my dad worked on the railroad.

The recall layer should prioritize:

- previous railroad mentions
- work-history facts or claims
- nearby date anchors
- related people/entities
- perhaps one short transcript excerpt

Not unrelated childhood material.

---

## 4.2 RAG as an internal skill

Lorevox already has retrieval-shaped concepts. The improvement is to make retrieval part of the loop.

RAG should be invoked when the system needs help answering one of these questions:

- Have we heard this before?
- Is there a prior session that deepens this topic?
- Is there a stored document or transcript that clarifies a date, place, or person?
- Is Lori about to ask a follow-up that would benefit from historical continuity?

RAG is especially useful in Lorevox for:

- cross-session continuity
- resurfacing family names and aliases
- locating timeline anchors
- reminding Lori of prior emotionally important disclosures
- supporting memoir drafting from reviewed material

RAG should **not** decide truth.
It should surface evidence.

---

## 4.3 Memory policies

OpenClaw-class systems are strongest when they decide not just *how* to store memory, but *whether* to store it.

Lorevox should formalize that with explicit policy classes.

### Suggested policy classes

#### Ephemeral
For turn-local or section-local context only.
Examples:
- “ask shorter questions for a few turns”
- “the user wants to skip this topic today”
- “browser affect shows reflective state right now”

#### Session
Important in the current interview session, but not necessarily long-term.
Examples:
- current interview mode
- section progress
- repeated name pronunciation hints
- local interview preferences discovered today

#### Persistent
Likely worth carrying across sessions.
Examples:
- stable preferences about tone or pacing
- recurring identity/cultural framing preferences
- preferred names for relatives
- repeated autobiographical anchors

#### Temporal / Timeline-sensitive
Could affect chronology and should be turned into a claim or review item.
Examples:
- dates, date ranges, ages, moves, marriages, jobs, births, deaths, migrations

#### Relational
Names or links between people/entities that matter to later questioning.
Examples:
- “Aunt Rosie was really my mother’s cousin but we called her aunt”
- “Bill and William Arsene LaPlante may be the same person”

The policy engine decides the route:

```text
discard
keep in turn context only
store as session note
store as persistent memory
create claim candidate
create review item
create timeline suggestion
```

---

## 4.4 Reflection after action

After Lori responds, and especially after tools run, Lorevox should distill what happened.

Reflection should answer:

- What did the user actually reveal?
- What is worth remembering?
- What should stay ephemeral?
- What deserves a claim candidate?
- What deserves a review item?
- What follow-up gap was exposed?

In Lorevox, reflection is not a poetic summary step.
It is an **information-shaping step**.

A good reflection output might produce:

- a compact turn summary
- extracted candidate facts
- tags for section/topic/entity
- a follow-up hint for Lori
- a retrieval breadcrumb for future recall

---

## 4.5 Skill wrappers around existing capabilities

Lorevox should treat its own backend capabilities as skills, even if they are currently exposed as endpoints.

Initial wrappers should include:

- `skill_query_memory`
- `skill_write_memory`
- `skill_rag_search`
- `skill_write_claim_candidate`
- `skill_write_review_item`
- `skill_write_timeline_suggestion`
- `skill_get_affect_context`
- `skill_get_safety_context`
- `skill_tts`
- `skill_whisper`

This matters because an agent loop should not care whether a capability is implemented by:

- direct Python call
- SQLite query
- existing HTTP endpoint
- future service split

The loop only needs a stable skill contract.

---

## 5. Mapping these patterns onto Lorevox’s existing architecture

## 5.1 Existing strengths

Lorevox already has strong foundations:

- person-first archive structure
- immutable transcripts and source files
- claim → review → fact workflow
- timeline and calendar concepts
- affect-aware conversation support
- safety scanning and softened mode
- local two-server split for LLM and TTS

That means the missing work is orchestration, not reinvention.

## 5.2 Recommended module placement

### `server/agent_loop.py`
Owns one turn of cognition.

Responsibilities:
- receive the turn
- build context from hooks
- call the LLM runner
- execute selected skills
- run reflection
- return user-facing output plus structured side effects

### `server/hooks.py`
Owns the three lifecycle stages:
- `before_llm`
- `after_llm`
- `after_tool`

Responsibilities:
- recall memory
- optionally trigger RAG
- gather safety/affect context
- call policy helpers
- prepare reviewable writes

### `server/skills.py`
Owns wrappers around existing retrieval, storage, safety, affect, and media capabilities.

Responsibilities:
- provide a single agent-facing function surface
- normalize inputs/outputs
- keep implementation details out of the loop

### `server/policies.py`
Owns heuristics and routing decisions.

Responsibilities:
- decide what class of memory an item belongs to
- decide whether to store, summarize, or ignore
- decide whether something should become a claim/review/timeline suggestion

### `server/reflection.py`
Owns post-turn distillation.

Responsibilities:
- build compact summaries
- extract structured follow-up cues
- create write plans
- avoid bloating the prompt path

---

## 6. Domain-specific changes that make this Lorevox instead of generic agentware

## 6.1 Safety and affect must become first-class inputs

Lorevox is not a generic agent shell.
It is a sensitive interview system.

So the loop should consider:

- current softened mode
- recent safety triggers
- recent affect trend
- whether the current section is emotionally heavy

That means the before-LLM hook should be able to add guidance like:

- ask more gently
- shorten the next question
- avoid pressure for detail
- stay in the same topic rather than pivoting

## 6.2 Interview section and timeline state should bias recall

Lorevox already has interview roadmap and timeline concepts.
These should shape retrieval.

If the person is in a childhood section, recall should favor:

- early-life anchors
- family-of-origin entities
- school/place memories
- era-specific prompts

If the person is in memoir drafting mode, recall should favor:

- reviewed facts
- timeline events
- approved chapter sources

## 6.3 Review queue remains the firewall

This is the single most important constraint.

Any OpenClaw-style autonomy in Lorevox should end at the review queue when the output touches biography, chronology, identity, or relationships.

That means:

- a hook may propose
- reflection may suggest
- policies may route
- skills may write candidate items

But reviewed history remains human-governed.

---

## 7. Implementation sequence

The right order is:

### Phase 1 — Stable loop skeleton
- add `server/agent_loop.py`
- add `server/hooks.py`
- add `server/skills.py`
- keep policies heuristic and simple
- keep reflection compact and deterministic

### Phase 2 — Safer memory routing
- classify more memory types
- distinguish session vs persistent vs claim-worthy material
- bias retrieval by person, section, and timeline era

### Phase 3 — Better reflection
- produce better turn summaries
- detect contradictions
- propose timeline placements
- surface missing-life-gap prompts

### Phase 4 — Deeper automation, still review-safe
- auto-ingest documents/photos into review candidates
- nightly memory hygiene jobs
- contradiction surfacing
- draft support for memoir chapters

---

## 8. Bottom line

The right takeaway from OpenClaw is this:

**Lorevox should borrow the loop, the hooks, the policies, the skill model, and the reflection pattern.**

It should not borrow:

- blob-style truth memory
- self-rewriting memory as authority
- silent fact mutation
- generic productivity-first assumptions

If implemented carefully, these patterns make Lorevox:

- more coherent across sessions
- better at recalling prior material
- more capable of surfacing timeline evidence
- more stable as an interview agent
- more “alive” without becoming less trustworthy

That is the right trade:

**OpenClaw-style behavior, Lorevox-native truth model.**
