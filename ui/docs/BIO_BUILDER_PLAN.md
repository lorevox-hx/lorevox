# Bio Builder — Implementation Plan

Branch: `feature/bio-builder-foundation`
Date: 2026-03-27

---

## Scope

This plan covers the foundation implementation of Bio Builder — a staging/intake layer for Lorevox 8.0. The goal is to make the Bio Builder concept real enough to:

- See the correct architectural direction
- Interact with a first working shell
- Understand how Janice-style intake fits
- Understand how files and forms will feed Life Map and memoir later

This is not a complete system build. It is a strong foundation.

---

## First Milestone

**A functional Bio Builder popover in lori8.0.html that:**
1. Opens consistently with Life Map and Peek at Memoir
2. Is never empty — always shows actionable content
3. Has a working quick-capture area (typed facts, pasted text)
4. Has a questionnaire launcher that opens Janice-style sections
5. Has a source inbox area clearly defining upload support
6. Has a candidate card list (initially populated from questionnaire answers)
7. Correctly scopes all state to `state.bioBuilder` — never writes to facts/spine/archive
8. Does not break Life Map or Peek at Memoir

---

## Phases

### Phase A — Architecture ✅ Done
`docs/BIO_BUILDER_ARCHITECTURE.md` created.
Data model defined. Relationships to all existing layers documented.

### Phase B — Shell
**Files changed:**
- `lori8.0.html` — add `#lv80BioBuilderBtn` to header; add `#bioBuilderPopover` DOM

**Deliverables:**
- Bio Builder button before Peek at Memoir button in header
- Popover with `.parchment-scroll` consistent with Life Map and Peek at Memoir
- Internal tab-style navigation: Quick Capture | Questionnaire | Source Inbox | Candidates
- CSS following the lori8.0 popover CSS pattern (`:popover-open` for display, UA stylesheet hides when closed)

### Phase C — Never-Empty Intake
**Files changed:**
- `js/bio-builder.js` — state module + intake surface logic
- `lori8.0.html` — popover content

**Deliverables:**
- Quick Capture section: one-line fact input, multi-line note box, "paste text" area
- Questionnaire Launcher: section grid showing Janice-style sections with completion status
- Empty state: when no narrator selected, show "Create narrator / Paste text / Upload a file / Start questionnaire"
- `state.bioBuilder` initialized for each narrator

### Phase D — Source Inbox
**Files changed:**
- `js/bio-builder.js` — source inbox state + Source Card rendering
- `lori8.0.html` — file drop zone in popover

**Deliverables:**
- File drop zone (PDF, text, image, other)
- Each upload creates a Source Card immediately (filename, type, status, timestamp)
- Source Cards list in Source Inbox section
- "Send to Bio Builder" / "Review Later" actions on each card
- Cards stored in `state.bioBuilder.sourceCards`

### Phase E — Candidate Cards
**Files changed:**
- `js/bio-builder.js` — candidate extraction + candidate card rendering

**Deliverables:**
- Candidate buckets: people, relationships, events, memories, places, documents
- Questionnaire answers automatically produce candidate cards in the correct buckets
- Candidate Card UI: shows raw data, source (questionnaire section / uploaded file), "Promote" / "Dismiss" actions
- Promotion does NOT happen automatically — requires explicit user action
- Promoted candidates write to `state.facts` (scoped to future integration)

### Phase F — Downstream Wiring
**Files changed:**
- `js/app.js` — consume promoted Bio Builder candidates in profile/timeline update flow
- `js/life-map.js` — acknowledge Bio Builder candidate data (display count as future work)

**Deliverables:**
- Promoted person candidates feed into profile basics / family graph
- Promoted event candidates feed into timeline
- Life Map refresh triggered after promotion

---

## Current Foundation (Phase B + C)

The Phase B+C implementation in this branch provides:

| Component | Status |
|---|---|
| Bio Builder button in header | Implemented |
| Bio Builder popover (`.parchment-scroll` pattern) | Implemented |
| Section navigation (Quick Capture / Questionnaire / Source Inbox / Candidates) | Implemented |
| Quick fact input + note box | Implemented |
| Questionnaire section launcher (5 sections, Janice-modeled) | Implemented — shell renders, basic data capture works |
| Source inbox UI with drop zone placeholder | Implemented — UI scaffold, local state only |
| Candidate cards list | Implemented — populated from questionnaire answers |
| `state.bioBuilder` local state model | Implemented |
| Never-empty empty state | Implemented |
| No writes to facts/spine/archive | Verified |
| No breakage to Life Map / Peek at Memoir | Verified |

---

## Risks

| Risk | Mitigation |
|---|---|
| Candidate promotion silently mutating facts | Promotion requires explicit user action; Bio Builder writes only to `state.bioBuilder` in this foundation |
| Source Inbox file processing requires backend | Phase D source cards are UI-only in foundation; backend extraction is wired in Phase D+ |
| Questionnaire DOM becoming truth source | Questionnaire answers are read from `state.bioBuilder.questionnaire` on save, not from DOM on read |
| CDN dependency introduced | Zero CDN dependencies added; all Bio Builder code is self-contained |
| Breaking existing popover behavior | Life Map and Peek at Memoir use independent popover IDs; Bio Builder adds a third, non-conflicting popover |

---

## Dependencies

| Dependency | Status |
|---|---|
| `lori8.0.html` popover pattern (`.parchment-scroll`, `popover="auto"`) | Available |
| `state.js` — `state.bioBuilder` object must be added | Added in `bio-builder.js` init |
| `app.js` — `loadPerson()` must call `window.LorevoxBioBuilder?.refresh()` | Wired in Phase C |
| Life Map and Peek at Memoir must remain unaffected | Verified |

---

## Recommended Next Steps After This Foundation

1. **Source Inbox backend integration**: Connect the file drop zone to the actual upload endpoint; parse PDFs and images for candidate extraction.
2. **Questionnaire completion tracking**: Persist questionnaire answers across sessions; show per-section fill progress.
3. **Candidate promotion flow**: Build the review UI — "Promote to profile / family graph / timeline" with a clear diff view of what will change.
4. **Downstream Life Map refresh**: After promotion, auto-call `LorevoxLifeMap.refresh()` so the map reflects the newly promoted timeline items.
5. **Popout panel system**: Source Card detail panel, person candidate detail panel — consistent with Life Map meta bar and Peek at Memoir chapter scroll.
6. **Offline-first persistence**: Persist `state.bioBuilder` to localStorage alongside the rest of state, so intake survives session reloads.
