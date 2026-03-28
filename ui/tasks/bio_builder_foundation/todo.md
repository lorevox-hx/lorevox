# Bio Builder Foundation — Todo

Date: 2026-03-27

---

## Docs

- [x] `docs/BIO_BUILDER_ARCHITECTURE.md` — written
- [x] `docs/BIO_BUILDER_PLAN.md` — written
- [x] `tasks/bio_builder_foundation/research.md` — written
- [x] `tasks/bio_builder_foundation/plan.md` — written
- [x] `tasks/bio_builder_foundation/todo.md` — this file
- [ ] `tasks/bio_builder_foundation/review.md` — after implementation

## Implementation

- [x] `js/bio-builder.js` — state model + intake surface
- [x] `lori8.0.html` — Bio Builder CSS
- [x] `lori8.0.html` — Bio Builder button in header
- [x] `lori8.0.html` — Bio Builder popover DOM
- [x] `lori8.0.html` — `lv80Init()` toggle listener
- [x] Life Map + Peek at Memoir unaffected — verified

## Checklist (quality bar)

- [x] Bio Builder popover opens and closes correctly (Popover API)
- [x] Bio Builder is never empty (empty state shows actionable options)
- [x] Quick capture: fact input + paste area functional
- [x] Questionnaire: sections visible; Personal Information section captures data
- [x] Source inbox: UI scaffold present; file input wired to state (local only)
- [x] Candidate cards: questionnaire answers produce candidate entries
- [x] No CDN dependencies added
- [x] No writes to `state.archive`, `state.facts`, `state.timeline`
- [x] `state.bioBuilder` initialized correctly per narrator
- [ ] Backend source extraction (Phase D — future)
- [ ] Candidate promotion to reviewed facts (Phase E — future)
- [ ] Life Map consumption of promoted candidates (Phase F — future)
