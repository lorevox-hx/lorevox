# File-by-File Patch Plan
### Current shell → Lorevox 7.1 behavior

## Scope

This patch set targets the four highest-value files first:

1. `state.js`
2. `interview.js`
3. `timeline-ui.js`
4. `app.js`

The intent is to make the current shell obey the 7.1 architecture before any full visual redesign.

---

## 1. `state.js`

### Why patch it
The current state model knows about:
- person
- profile
- interview
- chat

It does **not** yet know enough about:
- timeline spine
- current pass
- current era
- runtime mode
- timeline seed readiness

### Add
- `state.timeline`
- `state.session`
- `state.runtime`
- helper functions for current pass / era / mode
- local-storage persistence for timeline spine

### Outcome
The UI gains a single state source for:
- Pass 1
- Pass 2A
- Pass 2B
- timeline periods
- recognition / grounding mode
- timeline seed readiness

---

## 2. `interview.js`

### Why patch it
This is the file where the old section-first interview logic lives.

### Change
- reframe `Interview Roadmap` as `Life Periods` when timeline spine exists
- add pass + era + mode rendering in Interview header
- map:
  - `chronological` → Pass 2A
  - `thematic` → Pass 2B
- update prompt generation to use timeline periods first
- update memory triggers to become era support rather than random event cards

### Outcome
The Interview tab becomes the visible pass engine.

---

## 3. `timeline-ui.js`

### Why patch it
The current timeline is milestone + world-event oriented.
7.1 needs the timeline to visibly prove that the DOB / birthplace seed worked.

### Change
- show timeline seed
- show life periods
- show saved memories
- keep world context secondary
- display sparse / gap messaging when only the spine exists

### Outcome
Timeline becomes the visible output of Pass 2A.

---

## 4. `app.js`

### Why patch it
This is where profile load/save and shell init already happen.

### Change
- initialize timeline spine when DOB + birthplace are saved
- persist the spine
- hydrate pass / era labels on load
- update readiness UI to mention timeline seed
- rename sidebar section label from `Interview Roadmap` to `Life Periods`

### Outcome
Profile save becomes the entry point for 7.1 behavior.

---

## Recommended merge order

1. Merge `state.js`
2. Merge `app.js`
3. Merge `timeline-ui.js`
4. Merge `interview.js`

This order keeps the shell stable while state primitives appear first.

---

## Notes

- These review files intentionally preserve the current shell rather than redesigning it.
- They assume the existing HTML IDs remain unchanged.
- They are designed to be merged into the current JS stack with minimal HTML surgery in the first sprint.
