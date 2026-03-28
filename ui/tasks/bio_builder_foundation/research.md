# Bio Builder Foundation — Research

Date: 2026-03-27

---

## What was inspected

### lori8.0.html (current shell)
- Uses `popover="auto"` pattern for Peek at Memoir (`#memoirScrollPopover`) and Life Map (`#lifeMapPopover`)
- Header (`#lv80Header`) has two `<div>` children: left (brand + person select + new button) and right (Peek button + settings button)
- Life Map button sits before Peek at Memoir button
- Popovers use `.parchment-scroll` class and `scroll-header` inner structure
- Key CSS pattern: `display: flex` only on `:popover-open` pseudo-class; base rule has no display property so the UA stylesheet (`[popover]:not(:popover-open){display:none}`) controls closed state correctly
- `lv80Init()` wires toggle listeners for Life Map popover

### app.js (v6.1)
- `loadPerson()` calls `window.LorevoxLifeMap?.refresh()`
- `saveProfile()` calls `window.LorevoxLifeMap?.refresh()`
- Both patterns are the hook points for Bio Builder refresh as well
- `state` object lives in `state.js`; Bio Builder state should follow the same pattern

### life-map.js
- IIFE pattern; exposes `window.LorevoxLifeMap`
- `refresh()` and `render(true)` are the public surface
- No CDN dependencies — self-contained

### Personal Information (Janice model)
Questionnaire sections required:
1. Personal Information (identity: name, DOB, birthplace, etc.)
2. Parents (table: first name, middle, last, birth date, birth place, occupation, notable life events)
3. Grandparents (ancestry, cultural background, memorable stories)
4. Siblings (birth order, unique characteristics, shared experiences, memories)
5. Spouse / Children / Marriage Details / Family Traditions
6. Early Memories (first memory, favorite toy, significant event)
7. Education and Career (schooling, higher ed, early career, community, mentorship)
8. Later Years (retirement, life lessons, advice)
9. Hobbies and Interests / World Events / Personal Challenges / Travel
10. Health and Wellness
11. Technology and Beliefs
12. Additional Notes (unfinished dreams, messages for future generations)

### Core idea doc
Key design rules confirmed:
- Bio Builder must never be empty
- Must accept messy input
- Files become usable quickly (Source Cards appear immediately on upload)
- Questionnaire answers seed candidate items
- Life Map consumes Bio Builder outputs only after promotion
- Popouts consistent with existing family of surfaces
- Offline-first preserved; no new CDN dependencies

---

## Key implementation decisions

**State location**: `state.bioBuilder` on the global `state` object (initialized by `bio-builder.js`; does not require `state.js` changes in this foundation — init code runs first and sets it if absent).

**Section navigation**: Tabs inside the popover (Quick Capture / Questionnaire / Source Inbox / Candidates). No external tab library — pure CSS + data attributes.

**Questionnaire sections rendered on demand**: Only the active section is expanded; others show title + fill progress. This prevents the questionnaire from becoming a scroll wall.

**Candidate extraction**: In this foundation, candidates are extracted from questionnaire answers locally (no backend NLP). Person candidates come from parents/siblings/grandparents sections. Event candidates come from dates in education and early memories. Memory candidates come from the Early Memories section.

**Source Inbox**: UI scaffold only in this foundation. File input wires to local state (filename, size, timestamp). Backend extraction (PDF text, OCR) is a Phase D+ concern.

**No truth mutations**: Verified by design — all writes go to `state.bioBuilder`. Promotion to `state.facts` is explicitly a future Phase E concern.
