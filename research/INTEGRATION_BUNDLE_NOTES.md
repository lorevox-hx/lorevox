# Lorevox v7 Integration Bundle Notes

This bundle adds the first live integration slice for Lorevox 7. It is designed for review and wiring, not as a final production drop-in.

## Included files

- `lorevox_v7/chat_router.py`
- `lorevox_v7/session_store.py`
- `lorevox_v7/websocket_events.py`
- `lorevox_v7/affect_ingest.py`
- `lorevox_v7/transcript_store.py`

The earlier review files are also included so the bundle can be reviewed as one coherent package.

## What this slice proves

This integration bundle demonstrates the intended Lorevox 7 request flow:

1. Accept a websocket message for a session.
2. Update `SessionVitals` and append the turn to the transcript.
3. Evaluate the hidden narrative phase.
4. Build Lori's system prompt from the directive stack.
5. Stream Lori's response token-by-token.
6. Persist the assistant turn.
7. Fire Lane A provisional extraction every 3 user turns.
8. Merge the provisional patch back into `LiveProfileProjection`.
9. Push projection updates to the UI.
10. Trigger Lane B archival extraction when the websocket disconnects.

## Intentional review-bundle simplifications

- `SessionStore` is in-memory. This is deliberate so the orchestration can be inspected clearly.
- The LLM client is expected to provide `astream(...)` and `ainvoke(...)`.
- `chat_router.py` contains simple year and proper-name detection. These are placeholders for better NLP later.
- The affect ingestion route currently returns a fatigue event payload. In a fuller stack, that event would also be pushed into any live websocket subscribers.
- Transcript persistence is JSONL and local-first for clarity and safety.

## My implementation input

I kept your architecture but tightened several contracts:

- Moved session coordination behind `SessionStore` so the websocket loop stays orchestration-focused.
- Added `ProjectionPatchEvent`, `PhaseChangedEvent`, and `FatigueStatusEvent` so the frontend can become a true Lorevox 7 studio rather than just a token stream.
- Snapshot-and-merge flow for Lane A so background extraction does not mutate the active projection object directly.
- Added `TranscriptStore` so session durability exists before deeper entity and event pipelines.
- Kept Lane B optional in the router dependencies so the chat loop can be tested independently before full archival extraction is wired.

## Recommended next implementation step

Wire these files into the real FastAPI app with a concrete local LLM adapter, then test:

- normal life-chapter flow
- scene-capture turns
- affect updates that cause grounding or fatigue pause
- background projection patching
- session-close archival extraction trigger
