# Bio Builder Foundation — Work Plan

Date: 2026-03-27

---

## Goal

Implement the Phase B + C foundation of Bio Builder:
- Architecture docs
- Bio Builder button + popover shell in lori8.0.html
- Never-empty intake surface (quick capture + questionnaire launcher + source inbox scaffold + candidate cards)
- `js/bio-builder.js` — state model + rendering logic

---

## Execution order

1. Write `docs/BIO_BUILDER_ARCHITECTURE.md`
2. Write `docs/BIO_BUILDER_PLAN.md`
3. Write `tasks/bio_builder_foundation/` work packet (this file + research + todo + review)
4. Write `js/bio-builder.js`
5. Patch `lori8.0.html` — add button + popover DOM + CSS
6. Wire `lv80Init()` — Bio Builder toggle listener + `app.js` refresh hook
7. Validate Life Map and Peek at Memoir unaffected

---

## File manifest

| File | Action | Scope |
|---|---|---|
| `docs/BIO_BUILDER_ARCHITECTURE.md` | Create | Architecture reference |
| `docs/BIO_BUILDER_PLAN.md` | Create | Implementation roadmap |
| `tasks/bio_builder_foundation/research.md` | Create | Research notes |
| `tasks/bio_builder_foundation/plan.md` | Create | This file |
| `tasks/bio_builder_foundation/todo.md` | Create | Task checklist |
| `tasks/bio_builder_foundation/review.md` | Create | Post-implementation review |
| `js/bio-builder.js` | Create | Core module |
| `lori8.0.html` | Patch | Button + popover + CSS + init |

---

## Constraints

- No new CDN dependencies
- No writes to `state.archive`, `state.facts`, `state.timeline`
- No DOM as source of truth
- Popover CSS must follow `:popover-open` pattern (not unconditional `display:flex`)
- Life Map and Peek at Memoir must not be broken
