# BIO_BUILDER_MODULE_SPLIT_PLAN.md

Objective: Refactor `ui/js/bio-builder.js` from a single large component into focused modules while preserving one shared `state.bioBuilder`, one public namespace `window.LorevoxBioBuilder`, one narrator-scoping model, one persistence convention, and the current truth boundary (draft/staging only, no writes to archive/history truth layers).

See `separation plan.txt` for the full architectural rationale and phase-by-phase execution plan.

## Target Module Structure

```
ui/js/
  bio-builder-core.js                # shared state, persistence, narrator scoping, utilities
  bio-builder-questionnaire.js       # questionnaire sections, hydration, normalization, save flow
  bio-builder-sources.js             # source inbox, file intake, extraction, review UI
  bio-builder-candidates.js          # candidate shaping, dedupe, provenance, accessors
  bio-builder-family-tree.js         # FT drafts, seeding, duplicate checks, scaffold/graph/cards
  bio-builder-life-threads.js        # LT drafts, seeding, graph/cards, theme helpers
  bio-builder.js                     # thin compatibility shell / load coordinator
```

## Execution Log

### Phase 1 — Extract Core
- Date: 2026-03-30
- Status: COMPLETE

**Files created:**
- `ui/js/bio-builder-core.js` (376 lines) — shared state, persistence, narrator scoping, utilities

**Files modified:**
- `ui/js/bio-builder.js` (3835 → 3623 lines) — replaced local definitions with core aliases
- `ui/lori8.0.html` — added `bio-builder-core.js` script tag before `bio-builder.js`

**Architecture:**
- Core exposes via `window.LorevoxBioBuilderModules.core`
- bio-builder.js pulls all core functions as local `var` aliases at top of IIFE
- Questionnaire hydration registered as a post-switch hook via `_registerPostSwitchHook()`
- Public API (`window.LorevoxBioBuilder`) unchanged — all method names preserved

**Smoke test results (real browser):**
1. App loads — PASS (zero console errors)
2. Bio Builder opens — PASS
3. Chuck Norris questionnaire: Personal 6/7 filled — PASS
4. Switch to Mark Twain — PASS
5. Mark Twain questionnaire: Personal 6/7, Parents 1 entry, Siblings 1 entry, Early Memories 2/3 — PASS (WD-1 persistence intact)
6. Mark Twain Family Tree: Parent, Spouse, Grandparents all render — PASS
7. Switch back to Chuck Norris — PASS
8. Chuck Norris questionnaire: Personal 6/7, no cross-narrator bleed — PASS
9. Zero console errors throughout — PASS

**Dependency risks discovered:** None. Clean separation with no hidden cross-references.

### Phase 2 — Extract Questionnaire
- Date: 2026-03-30
- Status: COMPLETE

**Files created:**
- `ui/js/bio-builder-questionnaire.js` (763 lines) — questionnaire sections, hydration, normalization, candidate extraction, save flow

**Files modified:**
- `ui/js/bio-builder.js` (3623 → 2906 lines) — replaced questionnaire code with delegation aliases from questionnaire module
- `ui/lori8.0.html` — added `bio-builder-questionnaire.js` script tag between core and bio-builder

**Architecture:**
- Questionnaire module exposes via `window.LorevoxBioBuilderModules.questionnaire`
- bio-builder.js pulls all questionnaire functions as local `var` aliases at top of IIFE (same pattern as core)
- Hydration hook registration moved INTO questionnaire module (removed duplicate from bio-builder.js)
- Render functions accept callback parameters for view state coordination:
  - `_renderQuestionnaireTab(container, pid, activeSection, renderActiveTab)`
  - `_saveSection(sectionId, closeCallback)`
  - `_addRepeatEntry(sectionId, renderCallback)`
- bio-builder.js retains thin wrappers for `_saveSection` and `_addRepeatEntry` that pass the appropriate callbacks
- Public API (`window.LorevoxBioBuilder`) unchanged — all method names preserved

**Smoke test results (real browser):**
1. App loads — PASS (zero console errors)
2. Bio Builder opens — PASS
3. Chuck Norris questionnaire: Personal 5/7 hydrated from profile — PASS
4. Personal detail: Carlos Ray Norris, Chuck Norris, 1940-03-10, Ryan Oklahoma, Pisces — PASS
5. Save Personal section — PASS (returns to grid, 5/7 persists)
6. Switch to Mark Twain — PASS
7. Mark Twain questionnaire: Personal 6/7, Parents 1 entry, Siblings 1 entry, Early Memories 2/3 — PASS (localStorage persistence intact)
8. Switch back to Chuck Norris — PASS
9. Chuck Norris questionnaire: Personal 5/7, no cross-narrator bleed — PASS
10. Chuck Norris Family Tree: Narrator + 2 spouses + edges render — PASS
11. Zero console errors throughout — PASS

**Dependency risks discovered:** None. Stale localStorage data from pre-WD-1 fix was found under Chuck's QQ key (contained Mark Twain data). This was a leftover artifact, not a regression — cleared manually during testing. The WD-1 guard in `_persistDrafts()` prevents this from recurring.

**Line count after Phase 2:**
- bio-builder-core.js: 376 lines
- bio-builder-questionnaire.js: 763 lines
- bio-builder.js: 2906 lines
- Total: 4045 lines (vs 3835 pre-split — net +210 due to module boilerplate and delegation blocks)

### Phase 3 — Extract Source Intake + Extraction Engine
- Date: 2026-03-30
- Status: COMPLETE

**Files created:**
- `ui/js/bio-builder-sources.js` (771 lines) — file intake, text extraction engine, source card review UI, source view state

**Files modified:**
- `ui/js/bio-builder.js` (2906 → 2256 lines) — replaced source code with delegation aliases from sources module
- `ui/lori8.0.html` — added `bio-builder-sources.js` script tag between questionnaire and bio-builder

**Architecture:**
- Sources module exposes via `window.LorevoxBioBuilderModules.sources`
- bio-builder.js pulls all source functions as local `var` aliases at top of IIFE (same pattern as core and questionnaire)
- Source view state (`_activeSourceCardId`) moved into sources module — owned internally
- Action functions accept `renderCallback` parameter for re-render coordination:
  - `_handleFiles(files, renderCallback)`
  - `_reviewSource(cardId, renderCallback)`
  - `_closeSourceReview(renderCallback)`
  - `_savePastedText(cardId, renderCallback)`
- bio-builder.js retains thin wrappers that pass `_renderActiveTab` as the callback
- `_switchTab()` calls `_srcClearSourceReviewState()` to reset source review on tab change
- Candidate shaping functions (`_addItemAsCandidate`, `_addAllOfType`, `_addAllFromCard`, `_detectedItemToCandidate`) intentionally kept in bio-builder.js per architectural guidance — will move to candidates module in Phase 4
- Public API (`window.LorevoxBioBuilder`) unchanged — all method names preserved

**Smoke test results (real browser):**
1. App loads — PASS (zero console errors)
2. All 3 modules confirmed loaded (`core`, `questionnaire`, `sources`) — PASS
3. All public API methods present on `window.LorevoxBioBuilder` — PASS
4. Bio Builder opens — PASS
5. Quick Capture tab: dynamic placeholder "Mark Twain was born in Florida, Missouri in 1835" — PASS
6. Questionnaire tab: Mark Twain Personal 6/7, Parents 1 entry, Siblings 1 entry, Early Memories 2/3 — PASS
7. Source Inbox tab: drop zone, hint text, file type list, empty state rendered from sources module — PASS
8. Family Tree tab: Parent, Spouse (2), Grandparents (4), utilities bar, view mode buttons — PASS
9. Switch to Chuck Norris — PASS
10. Chuck Family Tree: Narrator + 2 spouses + edges, no cross-narrator bleed — PASS
11. Chuck Questionnaire: Personal 5/7 (from profile), all other sections Empty — PASS (no cross-narrator bleed)
12. Zero console errors throughout all tab switching and narrator switching — PASS

**Dependency risks discovered:** None. Clean separation. Candidate shaping functions in bio-builder.js reference `_renderSourceReview` via alias from the sources module — works correctly because the alias was established in the delegation block.

**Line count after Phase 3:**
- bio-builder-core.js: 376 lines
- bio-builder-questionnaire.js: 763 lines
- bio-builder-sources.js: 771 lines
- bio-builder.js: 2256 lines
- Total: 4166 lines (vs 4045 after Phase 2 — net +121 due to sources module boilerplate and delegation block)
