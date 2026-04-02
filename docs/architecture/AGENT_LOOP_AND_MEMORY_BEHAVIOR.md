# Agent Loop and Memory Behavior

This document defines the first stable version of Lorevox’s agent loop.

It is intentionally minimal.
The purpose is to create a clean behavioral core that can improve later without destabilizing the archive model.

---

## 1. Purpose

Lorevox already has:

- an interview agent
- a memory/archive architecture
- timeline and memoir concepts
- safety and affect systems
- existing endpoints that act like tools

What this loop adds is a repeatable cognitive sequence around each turn:

```text
observe → recall → decide → act → reflect → write candidates
```

The loop is not there to make Lorevox more aggressive.
It is there to make Lorevox more coherent, more context-aware, and more disciplined.

---

## 2. Design goals

1. **Local-first**
   - No cloud dependence.
   - No remote memory layer.

2. **Archive-safe**
   - Never rewrite transcripts or raw source material.
   - Never let internal summaries become source-of-truth.

3. **Minimal first**
   - Heuristics before heavy automation.
   - Simple routing before full tool planning.

4. **Domain-aware**
   - Designed for memoir interviews, not generic task chat.
   - Sensitive to timeline, people, affect, and safety.

5. **Review-safe**
   - Claims, merges, and timeline changes become candidates or suggestions.
   - Human review remains the firewall.

---

## 3. Turn lifecycle

## 3.1 Input

A turn enters the loop with a payload like:

```python
{
    "person_id": "chris_horne",
    "session_id": "sess_2026_03_19_001",
    "message": "Tell me more about when my dad worked on the railroad.",
    "mode": "interview",
    "section_id": "career_and_work",
    "recent_turns": [...],
}
```

Optional context may also include:

- active memoir chapter
- affect status
- softened mode state
- current UI tab
- current interview roadmap position

---

## 3.2 Before-LLM hook

The loop calls `before_llm()`.

This stage gathers context and shapes the prompt package.

### Responsibilities

- recall relevant memories
- gather recent session summaries
- optionally run RAG
- load safety/affect context
- load section/timeline hints
- produce a compact context object

### Output shape

```python
{
    "system_notes": [...],
    "recalled_memories": [...],
    "retrieval_snippets": [...],
    "affect_context": {...},
    "safety_context": {...},
    "write_plan": [],
}
```

This stage should stay compact.
It exists to improve judgment, not to dump the archive into the prompt.

---

## 3.3 LLM decision step

The loop passes the user message plus context into the LLM runner.

The LLM output should be normalized into a structured shape, even if the model itself returns plain text.

### Output shape

```python
{
    "assistant_text": "That sounds important. What do you remember about the kind of work he did there?",
    "tool_calls": [],
    "intent": "follow_up_question",
    "reasoning_notes": [],
}
```

Possible intents:

- `follow_up_question`
- `direct_answer`
- `retrieve_then_answer`
- `write_candidate`
- `ask_for_clarification`
- `comfort_and_slow_down`

The first implementation can infer these using simple parsing or wrapper logic.
No complicated planner is required yet.

---

## 3.4 After-LLM hook

The loop calls `after_llm()`.

This stage inspects the LLM output before any skills run.

### Responsibilities

- normalize tool calls
- reject unsafe or unsupported tool calls
- expand simple intents into executable skill calls
- add policy hints to the write plan

### Example

If the model says:

- “I should look for previous mentions of railroad work”

Then `after_llm()` can translate that into:

```python
[{"name": "rag_search", "args": {"query": "railroad work father", "person_id": "..."}}]
```

This lets the loop stay stable even if the model’s tool formatting is rough early on.

---

## 3.5 Tool execution

The loop calls `execute_tool_calls()` from `server/skills.py`.

This stage executes only a narrow set of stable internal skills.

### Initial skills

- `query_memory`
- `rag_search`
- `write_memory`
- `write_claim_candidate`
- `write_review_item`
- `write_timeline_suggestion`
- `get_affect_context`
- `get_safety_context`
- `tts`
- `whisper`

Each skill returns a normalized result object.

### Result shape

```python
{
    "ok": True,
    "name": "rag_search",
    "data": {...},
    "summary": "Found 3 prior references to railroad work.",
}
```

---

## 3.6 After-tool hook

The loop calls `after_tool()`.

This stage integrates tool results into the assistant’s final output and prepares post-turn writes.

### Responsibilities

- combine retrieval results into compact evidence
- decide whether a candidate write is justified
- add follow-up hints for Lori
- prepare reflection input

This is also where the system should decide whether the current turn surfaced:

- a timeline anchor
- a new named entity
- a possible contradiction
- a relationship clarification

---

## 3.7 Reflection

The loop calls `run_reflection()`.

Reflection is not the main assistant response.
It is the internal distillation step that creates future usefulness.

### Reflection outputs

- `turn_summary`
- `memory_candidates`
- `claim_candidates`
- `timeline_suggestions`
- `review_items`
- `follow_up_opportunities`
- `tags`

### Example output

```python
{
    "turn_summary": "User discussed father's railroad employment and recalled the work as physically demanding but was unsure of dates.",
    "memory_candidates": [
        {
            "kind": "persistent",
            "text": "Father worked on the railroad; date not yet confirmed.",
            "importance": 0.72,
        }
    ],
    "claim_candidates": [
        {
            "fact_type": "employment",
            "statement": "User's father worked on the railroad.",
            "date_text": null,
        }
    ],
    "timeline_suggestions": [],
    "review_items": [],
    "follow_up_opportunities": [
        "Ask what town or railroad company this was associated with."
    ],
    "tags": ["family", "father", "work", "railroad"],
}
```

---

## 4. Memory behavior rules

## 4.1 Memory classes

The first stable version should support these classes.

### Ephemeral
Lives only in turn/session context.

Examples:
- ask gently for the next few turns
- user is tired of this topic today
- stay brief

### Session
Useful during the current interview session.

Examples:
- this relative’s nickname for this session
- section-local repeated detail
- current pronunciation hints

### Persistent
Likely useful across future sessions.

Examples:
- stable names and kinship framing
- recurring preference for tone/style
- enduring autobiographical anchors

### Claim candidate
Something biographical that should not become a fact automatically.

Examples:
- move dates
- marriages
- jobs
- migrations
- schooling
- deaths
- key family relationships

### Timeline suggestion
A candidate event placement or date anchor.

Examples:
- “around 1978”
- “before Amelia was born”
- “after moving to Las Vegas”

---

## 4.2 Storage rule of thumb

### Store immediately when

- the user clearly states a stable preference
- the same autobiographical detail appears repeatedly
- the current turn clarifies an existing ambiguous memory
- the turn provides a strong retrieval breadcrumb for future continuity

### Store as claim candidate when

- the content is biographical and could matter to timeline/history
- the detail is important but not yet verified
- the person expresses uncertainty that should be preserved explicitly

### Do not store when

- the content is generic phatic chat
- the content is only an assistant instruction for one turn
- the content is too vague to be useful later
- the content is redundant with a stronger existing memory

---

## 4.3 Merge/update rule of thumb

Update an existing memory rather than creating a new one when:

- the same topic is being clarified
- a previous memory is partial and the new turn fills in missing context
- a nickname, alias, or relationship description becomes more precise

Do **not** silently merge when:

- two events merely share a date or year
- two relatives have similar names
- the speaker is unsure and uncertainty matters

---

## 4.4 Retrieval rule of thumb

The recall layer should rank by:

1. same person
2. same session or adjacent sessions
3. same interview section
4. same entities/tags
5. same timeline era
6. recency and importance

Lorevox should favor **precision over volume**.
Five good snippets are better than fifty mediocre ones.

---

## 5. Affect and safety behavior

## 5.1 Affect

If recent affect context shows `reflective`, `moved`, `distressed`, or `overwhelmed`, the loop should be able to influence response style.

Possible effects:

- shorter questions
- more validation language
- fewer topic pivots
- slower cadence
- avoid extraction-heavy phrasing

## 5.2 Safety

If softened mode is active or a safety category triggered recently, the loop should:

- avoid aggressive probing
- prefer grounding and support phrasing
- suppress upbeat pivots
- reduce pressure for date precision

Safety and affect should shape the assistant’s behavior, but should not silently rewrite the historical record.

---

## 6. Initial heuristics for stable v1

The first working version should stay simple.

### Policy heuristics

- If a message contains a year/date phrase, mark as potentially timeline-sensitive.
- If a message contains kinship terms plus a named person, mark as relational.
- If the same noun phrase appears in recent memories, prefer update over create.
- If the user expresses uncertainty, preserve uncertainty in the candidate write.
- If the turn is emotional but low-fact, prefer a session note over claim extraction.

### Reflection heuristics

- Create one short turn summary per user turn.
- Cap tags to 3–6 strong tags.
- Create claim candidates only for clearly biographical material.
- Create timeline suggestions only when there is a date cue or order cue.
- Never auto-promote reflection output to verified fact.

---

## 7. Failure modes to avoid

1. **Prompt bloat**
   - Do not dump too much recall into the LLM context.

2. **Over-storage**
   - Not every sentence deserves memory.

3. **Over-merging**
   - Similarity is not identity.

4. **Assistant truth drift**
   - Internal summaries must not become archival truth.

5. **Premature autonomy**
   - Keep the first skill set narrow.

---

## 8. Minimal implementation contract

The first stable loop should guarantee:

- one `process_turn()` entry point
- one lifecycle with hooks
- one normalized skill interface
- one policy layer
- one reflection layer
- all history-affecting writes routed as candidates, not facts

Once that is stable, the next iteration can improve the heuristics without rewriting the architecture.

---

## 9. Bottom line

Lorevox does not need a giant agent framework.
It needs a disciplined loop that makes Lori better at:

- remembering the right things
- retrieving the right evidence
- asking better follow-ups
- writing safer candidate memory artifacts
- staying faithful to the archive/history/memoir model

That is the right v1 behavior target.
