# Bio Builder v3 — Family Tree & Life Threads Implementation Report

**Date:** 2026-03-28
**Scope:** `bio-builder.js`, `lori8.0.html`, `app.js` (minimal)
**Build:** v3 Family Tree & Life Threads tabs

---

## Summary

Two new tabs added to the Bio Builder popover: **Family Tree** and **Life Threads**. Both operate as draft/staging surfaces only — they write to per-person draft stores under `state.bioBuilder` and never promote data to truth layers (`state.facts`, `state.archive`, `state.timeline`).

---

## Architecture

### Draft-Only Principle

Both tabs store data in scoped containers keyed by `state.person_id`:

- `state.bioBuilder.familyTreeDraftsByPerson[pid]` — `{ nodes: [], edges: [], meta: {} }`
- `state.bioBuilder.lifeThreadsDraftsByPerson[pid]` — `{ nodes: [], edges: [], meta: {} }`

These containers are lazily created on first access via `_ftDraft(pid)` and `_ltDraft(pid)`. They persist across tab switches but are scoped per narrator, preventing cross-narrator contamination.

### No Auto-Seed

Neither tab auto-seeds on open. Seeding is always manual via toolbar buttons: "Seed from Questionnaire", "Seed from Candidates", "Seed Themes". This gives the user full control over what enters the draft workspace.

### Safe Candidate Accessors

Three new accessor functions handle both Phase D nested (`c.data.*`) and Phase E top-level normalized shapes:

- `_getCandidateTitle(c)` — checks `c.value`, `c.label`, `c.name`, `c.title`, then `c.data.*` equivalents
- `_getCandidateText(c)` — checks `c.text`, `c.snippet`, `c.preview`, then `c.data.*` equivalents
- `_getCandidateSnippet(c)` — truncates text to 120 characters

---

## Family Tree Tab

### Node Model

Each node has: `id` (prefixed `ftn_`), `type` (always `"person"`), `role`, `firstName`, `middleName`, `lastName`, `displayName`, `preferredName`, `deceased` (boolean), `birthDate`, `deathDate`, `deathContext`, `notes`, `uncertainty`, `source`.

Roles: narrator, parent, sibling, spouse, child, grandparent, grandchild, guardian, chosen_family, other.

### Edge Model

Each edge has: `id` (prefixed `fte_`), `from`, `to`, `relationshipType`, `label`, `notes`.

Relationship types: biological, adoptive, step, marriage, partnership, former_marriage, guardian, chosen_family, half, foster, other.

### CRUD Operations

- `_ftAddNode(role)` — creates a new node with the given role and default empty fields
- `_ftDeleteNode(nodeId)` — removes the node and all edges referencing it
- `_ftEditNode(nodeId)` — renders a full inline edit form with all fields including uncertainty dropdown and death context
- `_ftSaveNode(nodeId)` — reads values from the edit form and updates the node
- `_ftAddEdge(fromId)` — creates an edge from the given node, prompting for target and type
- `_ftSaveEdge(edgeId)` — persists edge edits
- `_ftDeleteEdge(edgeId)` — removes the edge

### Seeding

- `_ftSeedFromQuestionnaire()` — pulls parents, siblings, and grandparents from questionnaire data; creates narrator root node if missing
- `_ftSeedFromCandidates()` — pulls from `candidates.people`; deduplicates by display name

### Uncertainty Tracking

Edit form includes an uncertainty dropdown with options: Unknown, Approximate, Partially known, Not applicable, Can't remember, Fill in later, Family story / unverified. This supports biographical work where facts are often uncertain.

### Rendering

Nodes grouped by role with section headers. Each card shows name, badges (deceased, uncertainty), death context, notes, edges, and action buttons. Deceased cards get a left red border accent.

---

## Life Threads Tab

### Node Model

Each node has: `id` (prefixed `ltn_`), `type`, `label`, `text`, `notes`, `source`, `sourceRef`.

Types: person, place, memory, event, theme.

### Edge Model

Each edge has: `id` (prefixed `lte_`), `from`, `to`, `relationship`, `notes`.

Relationship types: family_of, happened_in, remembered_with, connected_to, influenced_by, theme_of, other.

### CRUD Operations

- `_ltAddNode(type)` — creates a new node of the given type
- `_ltDeleteNode(nodeId)` — removes the node and all edges referencing it
- `_ltEditNode(nodeId)` — renders inline edit form with type, label, text, notes, source fields
- `_ltSaveNode(nodeId)` — reads and persists edits
- `_ltAddEdge(fromId)` — creates an edge from the given node
- `_ltSaveEdge(edgeId)` — persists edge edits
- `_ltDeleteEdge(edgeId)` — removes the edge

### Seeding

- `_ltSeedFromCandidates()` — pulls people, places, memories, and events from candidates; creates narrator anchor node if missing
- `_ltSeedThemes()` — pulls from `earlyMemories` and `laterYears` questionnaire sections (first memory, favorite childhood object, significant events, hobbies)

### Rendering

Nodes grouped by type with icons and color-coded left borders (teal for person, indigo for place, amber for memory, pink for event, purple for theme). Each card shows label, text preview, notes, edges, and action buttons.

---

## Files Changed

### bio-builder.js (2562 lines)

- **Tab routing**: `_renderTabs()` updated to include `bbTabFamilyTree` and `bbTabLifeThreads`; `_renderActiveTab()` routes `familyTree` and `lifeThreads` to their renderers
- **Safe candidate accessors**: `_getCandidateTitle`, `_getCandidateText`, `_getCandidateSnippet`
- **Family Tree**: ~280 lines — state model, CRUD, seeding, renderer
- **Life Threads**: ~210 lines — state model, CRUD, seeding, renderer
- **NS exposure**: All new functions exposed on `window.LorevoxBioBuilder`
- **`_personChanged`**: Now initializes `familyTreeDraftsByPerson` and `lifeThreadsDraftsByPerson` containers

### lori8.0.html (4040 lines)

- **Tab buttons**: Added `bbTabFamilyTree` and `bbTabLifeThreads` to the tab strip
- **CSS**: ~100 lines of `ft-*` and `lt-*` classes for card layout, badges, edges, toolbars

### app.js (2209 lines)

- **No additional v3-specific changes needed.** The file already contains broader v8.0 Bio Builder/profile-sync additions from the prior track. The existing `window.LorevoxBioBuilder?.refresh()` call in `loadPerson()` (line ~351) already handles narrator-switch refresh for the new draft stores.

---

## Design Decisions

1. **Per-person keying** — Draft stores are keyed by `state.person_id`, not by a session or tab concept. This means switching narrators preserves each person's tree/threads independently.

2. **Lazy initialization** — `_ftDraft()` and `_ltDraft()` create the container on first access. No migration needed for existing profiles.

3. **Manual seeding only** — Avoids surprising the user with auto-populated data. The user explicitly chooses when to pull from questionnaire or candidates.

4. **No truth-layer writes** — Neither tab writes to `state.facts`, `state.archive`, or `state.timeline`. This is a staging surface only.

5. **Uncertainty as first-class field** — Biographical data is frequently uncertain. The uncertainty dropdown acknowledges this rather than forcing false precision.

6. **Death context separate from notes** — For deceased family members, the death context field captures how/when they died separately from general notes about the person.

---

## Known Limitations

| ID | Description | Severity | Status |
|---|---|---|---|
| FT-001 | No visual graph rendering (nodes listed as cards, not drawn as a tree) | Low | By design for v3 — visual graph is a future enhancement |
| FT-002 | Edge creation uses prompt-style inline form, not drag-connect | Low | By design for v3 |
| LT-001 | Theme seeding limited to earlyMemories and laterYears sections | Low | Can expand to other questionnaire sections as they're built |
| LT-002 | No auto-connection between seeded nodes | Low | By design — connections are manual |
