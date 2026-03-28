# Bio Builder Phase E — Review & Promote
## Implementation Report

---

## Overview

Phase E adds the human validation layer between Phase D's raw candidate generation
and Phase F's downstream system integration.  Every item produced by source extraction,
questionnaire completion, or quick capture must pass through an explicit human approval
step before it can enter any structured Lorevox store.

**Core principle:** nothing becomes truth without human approval.

---

## Files Changed or Created

| File | Action | Purpose |
|------|--------|---------|
| `ui/css/bio-review.css` | **Created** | Full design-token CSS for the Review & Promote UI |
| `ui/js/bio-review.js` | **Created** | `LorevoxCandidateReview` — queue, detail panel, approve/edit/reject/merge |
| `ui/js/bio-promotion-adapters.js` | **Created** | `LorevoxPromotionAdapters` — Phase E → F bridge, feed builders |
| `ui/js/bio-builder.js` | **Patched** | Added `value` + `snippet` to `_detectedItemToCandidate`; replaced static Candidates tab with Phase E mount |
| `ui/lori8.0.html` | **Patched** | Added `css/bio-review.css` link; added `bio-review.js` and `bio-promotion-adapters.js` script tags |

---

## What Was Built

### `bio-review.js` — `window.LorevoxCandidateReview`

The full review UI lives in this module.  It renders into `#candidateReviewRoot`,
which Bio Builder creates dynamically when the user switches to the Candidates tab.

**Layout:**
- Left panel: candidate queue with type tabs (People / Relationships / Memories / Events / Places / Documents), live filter input, candidate cards showing value + snippet + source
- Right panel: detail view for the selected candidate — editable value, type, confidence, label, reviewer note — plus source snippet block, provenance block, and (when applicable) a possible-duplicate notice
- Footer: Save Edits / ✓ Approve / ⇄ Merge / ✕ Reject action buttons

**Phase D data model compatibility:**
Phase D candidates store their meaningful value in a nested `data` object (`data.name` for persons, `data.text` for events / places / memories).  Phase E introduces top-level `value` and `snippet` fields.  `bio-review.js` exposes three compat shims:

```js
_title(c)       // checks c.value → c.label → c.name → c.data.name → c.data.text
_snippet(c)     // checks c.snippet → c.data.context → c.data.text
_sourceLabel(c) // checks c.sourceFilename → parses c.source prefix string
```

This means every Phase D candidate that already exists in `state.bioBuilder.candidates`
renders correctly in the Phase E queue with no data migration.

**Approve flow:**
1. User selects a candidate card in the queue
2. Detail panel loads with editable fields pre-populated
3. User optionally edits value / type / confidence / note
4. User clicks ✓ Approve
5. `saveEdits()` writes field values back to the candidate object
6. `_promote()` creates a promoted record in `state.bioBuilder.review.promoted[type]`
7. `_removeFromPending()` removes the candidate from `state.bioBuilder.candidates`
8. UI re-renders; queue count decrements; approved count increments

**Reject flow:** marks candidate `status: "rejected"`, logs to `review.rejected`, removes from queue.

**Merge flow:** lightweight — attaches a merge note to the candidate, then calls the approve flow. Full merge UI is Phase F territory.

**Type reassignment:** user can change a candidate's type in the detail panel; on Save Edits the candidate is moved to the correct bucket and the active tab switches accordingly.

**Duplicate detection:** before rendering the detail panel, checks whether a promoted item with the same value already exists in `review.promoted[type]`.  If so, a notice is shown.  No auto-deduplication — the user decides.

### `bio-promotion-adapters.js` — `window.LorevoxPromotionAdapters`

This is the Phase E → F bridge.  It reads from `state.bioBuilder.review.promoted`
(the human-approved bucket) and writes to `state.structuredBio` (the clean intermediate
store Phase F will consume).

**Type adapters:**

| Input type | Adapter | structuredBio target | Dedup by |
|-----------|---------|---------------------|----------|
| people | `_adaptPerson` | `structuredBio.people` | value (case-insensitive) |
| relationships | `_adaptRelationship` | `structuredBio.relationships` | (no dedup — every relationship is unique) |
| memories | `_adaptMemory` | `structuredBio.memories` | (no dedup) |
| events | `_adaptEvent` | `structuredBio.events` | (no dedup) |
| places | `_adaptPlace` | `structuredBio.places` | value (case-insensitive) |
| documents | `_adaptDocument` | `structuredBio.documents` | (no dedup) |

Every structured item retains a `provenance` array containing source type, source ID, filename, snippet, confidence, and approvedAt timestamp.  The Phase D nested `data` object is also preserved in the promoted record so adapters can extract extra fields (birthDate, relation, context, etc.).

**Idempotency guard:** every promoted item gets `_phaseFPromoted: true` after the adapter runs.  Calling `promoteApprovedBucket()` a second time returns an empty array.

**Phase F feed builders:**

```js
buildLifeMapFeed()       → { people, memories, events, places }
buildTimelineFeed()      → sorted array of events + memories by year
buildMemoirPreviewFeed() → { memories, events } as scene/theme stubs
syncPhaseFFeedsToState() → persists all three feeds to state.phaseFFeeds
```

These are pure derived views.  They do not mutate Life Map, Timeline, or Memoir state.
Phase F will call these builders and decide how to wire the results into each view.

### `bio-builder.js` patches

**`_detectedItemToCandidate`:**
Added `value: item.text` and `snippet: item.context || ""` as top-level fields so source-extracted candidates are immediately Phase E–compatible without relying on compat shims.

**`_renderCandidatesTab`:**
Replaced the static read-only candidate list with a Phase E mount:
```js
container.innerHTML = '<div id="candidateReviewRoot" style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;"></div>';
window.LorevoxCandidateReview.render("candidateReviewRoot");
```
The old static list showed "Promote in Phase E" labels and provided no actions.  Now the Candidates tab is the full Review & Promote surface.

---

## Test Results

**Test runner:** Node.js (no DOM) — pure logic tests only.
All 34 assertions passed.

| Group | Tests | VERIFIED | NOT EXECUTED |
|-------|-------|----------|-------------|
| 1. Phase D compat shims | 7 | 7 | 0 |
| 2. Approve flow | 9 | 9 | 0 |
| 3. Reject flow | 2 | 2 | 0 |
| 4. Duplicate guard | 4 | 4 | 0 |
| 5. Place + event adapters | 2 | 2 | 0 |
| 6. Phase F feed builders | 7 | 7 | 0 |
| 7. Truth isolation | 3 | 3 | 0 |
| **Total** | **34** | **34** | **0** |

### Key assertions verified

- `_title()` reads `candidate.value` (Phase E) and falls back to `candidate.data.name` / `candidate.data.text` (Phase D) — VERIFIED
- `_snippet()` reads `candidate.snippet` and falls back to `candidate.data.context` — VERIFIED
- `_sourceLabel()` reads `sourceFilename` and falls back to parsing the Phase D `source` prefix string — VERIFIED
- `_promote()` writes to `review.promoted[type]` only — VERIFIED
- `_promote()` sets `candidate.status = "approved"` — VERIFIED
- Promoted item carries `value`, `sourceFilename`, `verified: true`, and retains `data` object — VERIFIED
- `_removeFromPending()` removes candidate from `candidates[type]` — VERIFIED
- `promoteApprovedBucket()` creates structured item in `structuredBio` — VERIFIED
- Second call to `promoteApprovedBucket()` returns `[]` (idempotent) — VERIFIED
- Duplicate value: merge-skip, `structuredBio.people` count unchanged — VERIFIED
- `buildLifeMapFeed()` returns `{ people, memories, events, places }` all as arrays — VERIFIED
- `buildTimelineFeed()` returns sorted rows — VERIFIED
- `buildMemoirPreviewFeed()` returns `{ memories, events }` — VERIFIED
- `syncPhaseFFeedsToState()` sets `state.phaseFFeeds.lastSyncedAt` — VERIFIED
- `state.archive`, `state.facts`, `state.timeline` — not created or mutated — VERIFIED

### Not tested (requires browser DOM)

- Visual rendering of queue cards and detail panel
- Event binding (tab clicks, filter input, action buttons)
- DOM mutations from `_render()` / `_bindEvents()`
- popover open / close interaction with `_switchTab()`

These require a browser and are INSPECTED by visual review of the HTML/CSS.

---

## Architecture summary

```
state.bioBuilder.candidates         ← Phase D writes here
       ↓  (user clicks Candidates tab)
LorevoxCandidateReview              ← Phase E UI (bio-review.js)
       ↓  (user clicks ✓ Approve)
state.bioBuilder.review.promoted    ← safe approved bucket
       ↓  (explicit call to promoteApprovedBucket / promoteAllApproved)
LorevoxPromotionAdapters            ← bio-promotion-adapters.js
       ↓
state.structuredBio                 ← normalised, deduped, provenance-preserved
       ↓  (Phase F)
buildLifeMapFeed / buildTimelineFeed / buildMemoirPreviewFeed
       ↓
state.phaseFFeeds                   ← derived views for Life Map, Timeline, Memoir
```

**Nothing in this chain writes to:**
`state.archive`, `state.facts`, `state.timeline.spine`, or any reviewed-fact store.

---

## Constraints verified

| Constraint | Status |
|-----------|--------|
| Writes only to `state.bioBuilder` (candidates, review) + `state.structuredBio` + `state.phaseFFeeds` | ✅ |
| No CDN dependencies | ✅ |
| No DOM-as-truth | ✅ |
| No auto-promotion — every approval is explicit | ✅ |
| No timeline writes | ✅ |
| Phase D candidates display correctly without data migration | ✅ |
| Provenance retained on all promoted items | ✅ |
| Idempotent adapter runs | ✅ |
| Duplicate guard on people and places | ✅ |

---

## Readiness for Phase F

Phase F needs to:

1. Call `LorevoxPromotionAdapters.promoteAllApproved()` (or per-bucket) after any approval session
2. Call `LorevoxPromotionAdapters.syncPhaseFFeedsToState()` to update derived feeds
3. Read `state.phaseFFeeds.lifeMap` for Life Map wiring
4. Read `state.phaseFFeeds.timeline` for Timeline wiring
5. Read `state.phaseFFeeds.memoirPreview` for Peek at Memoir wiring

All three feed structures are clean, flat, and do not require Phase D's nested data format.

An optional "Promote to Life Map / Timeline / Memoir" button can be added to the Bio Builder popover to trigger the adapter + sync in one click — this is the natural Phase F entry point.
