# Lorevox v7 Phase 2 Review Bundle

This bundle turns the Phase 2 planning work into a coherent review set of Python modules.

## Files included

- `lorevox_v7/narrative_engine.py`
  - Hidden state machine for Lori
  - Session vitals and scoring
  - Phase routing
  - Directive-stack prompt composition
  - Historical anchor injection

- `lorevox_v7/extract_live.py`
  - Lane A provisional extraction
  - Strict JSON schema
  - Updates `LiveProfileProjection`
  - Non-blocking and non-authoritative by design

- `lorevox_v7/extract_session.py`
  - Lane B full-session extraction
  - Atomic claims, entities, relationships, events
  - Exact source quote + turn index required
  - Writes only to the review queue

- `lorevox_v7/review_queue.py`
  - Human approve / reject / edit gatekeeper
  - Append-only archive commits
  - Decision log for audit trail
  - Preserves sacred edits via `provenance_flag = "human_edited"`

- `lorevox_v7/storage.py`
  - Simple local JSONL helper for review and early integration

## What I changed from the shared drafts

1. **Renamed the working-memory object to `LiveProfileProjection`.**
   This makes its status explicit: useful, live, and provisional — not archival truth.

2. **Expanded the narrative states a bit.**
   Added:
   - `RELATIONSHIP_MAPPING`
   - `CHRONOLOGY_CLARIFICATION`
   - `GROUNDING`
   - `SESSION_CLOSE`

   These help Lori do better with uncertainty, overload, and family-tree discovery.

3. **Used a directive stack instead of only raw phase text.**
   This makes it easier to debug the middleware and assign precedence:
   - distress / fatigue overrides
   - phase directive
   - historical anchor
   - style rule

4. **Kept Lane A and Lane B sharply separated.**
   Lane A supports UI and skip-logic only.
   Lane B produces provenance-heavy review items only.

5. **Added a decisions ledger in the review queue manager.**
   This strengthens the audit trail and fits the archive/history doctrine better.

## Important integration note

These files are intentionally written as a review bundle, not as a claim that they are already wired to your current FastAPI routes.

The clean integration order is:

1. wire `narrative_engine.py` into the chat route
2. call `extract_live.py` asynchronously every 2-3 turns
3. run `extract_session.py` on session close or manual processing
4. surface `review_queue.py` through a Review tab or admin panel

## What is still intentionally missing

- transcript persistence layer
- entity resolution across sessions
- contradiction detection
- timeline merge policy
- memoir generation from reviewed facts
- frontend WebSocket/UI wiring

That is deliberate. This bundle is the smallest coherent implementation slice that still preserves the Lorevox doctrine:

**Archive is immutable. History is reviewed. Memoir is drafted.**
