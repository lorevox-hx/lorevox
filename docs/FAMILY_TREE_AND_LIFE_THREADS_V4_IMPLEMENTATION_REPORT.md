# Family Tree & Life Threads — v4 Usability Implementation Report

**Date:** 2026-03-28
**Build:** Bio Builder v4

## Summary

v4 adds three categories of usability improvements to the v3 Family Tree & Life Threads implementation:

1. **Pass 1 — Persistence** — Draft data now survives browser reload via localStorage
2. **Pass 2 — Better Seeding** — Expanded questionnaire section coverage and role/relation inference
3. **Pass 3 — UX Hardening** — Collapse/expand, draft quality utilities, delete confirmation, source badges

## Pass 1 — Persistence

### Design
- Per-person localStorage keys: `lorevox_ft_draft_{pid}` and `lorevox_lt_draft_{pid}`
- Schema versioning (v=1) for future migration
- Draft index: `lorevox_draft_pids` tracks all persons with saved drafts
- Lazy loading: existing in-memory data is never overwritten
- Silent degradation: localStorage errors are caught and ignored

### Functions Added
- `_persistDrafts(pid)` — Serializes FT+LT draft to localStorage
- `_loadDrafts(pid)` — Restores draft from localStorage (skips if in-memory data exists)
- `_clearDrafts(pid)` — Removes localStorage entries for a person
- `_getDraftIndex()` — Returns array of all person IDs with saved drafts

### Mutation Points Wired (14 total)
All FT and LT mutation functions now call `_persistDrafts(pid)` after modification:
- FT: `_ftDeleteNode`, `_ftSaveNode`, `_ftSaveEdge`, `_ftDeleteEdge`, `_ftSeedFromQuestionnaire`, `_ftSeedFromCandidates`
- LT: `_ltDeleteNode`, `_ltSaveNode`, `_ltSaveEdge`, `_ltDeleteEdge`, `_ltSeedFromCandidates`, `_ltSeedThemes`

### `_personChanged` Integration
The `_personChanged(newId)` callback now calls `_loadDrafts(newId)` on narrator switch, ensuring persisted drafts are restored when the user returns to a previously-visited narrator.

## Pass 2 — Better Seeding

### `_ftSeedFromCandidates` Rewrite
- Role inference via regex: mother/father → parent, sister/brother → sibling, husband/wife → spouse, etc.
- Relationship type inference: step → step, adopted → adoptive, half → half, foster → foster, etc.
- Processes both regular candidates and relationship-type candidates
- Ensures narrator root node exists before seeding edges
- Creates edges from narrator to each seeded person

### `_ltSeedThemes` Expansion
Previously only covered `earlyMemories` and `laterYears` sections. Now covers:
- `education` — school, college, degree themes
- `laterYears` — life transition themes
- `hobbies` — interest and passion themes
- `additionalNotes` — additional context themes

Each section produces themed nodes (type: "theme"), place nodes (type: "place"), and event nodes (type: "event") as appropriate.

## Pass 3 — UX Hardening

### Collapse/Expand
- `_toggleGroupCollapse(tabType, role)` — Toggles visibility of a role group
- `_isGroupCollapsed(tabType, role)` — Checks collapse state
- Collapse state is per-session (not persisted across reload)
- Arrow indicator rotates to show collapsed/expanded state
- Group count badge shows node count even when collapsed

### Draft Quality Utilities
- `_ftFindDuplicates(pid)` — Finds nodes with identical display names
- `_ftFindUnconnected(pid)` — Finds non-narrator nodes with no edges
- `_ftFindWeakNodes(pid)` — Finds nodes labeled "Unknown", "Unnamed", or with uncertainty flags
- `_ftFindUnsourced(pid)` — Finds nodes with no source attribution
- `_ftCleanOrphanEdges(pid)` — Removes edges pointing to non-existent nodes
- Utilities bar rendered above cards with issue count badges
- Warning badges (amber) for issues, info badges (indigo) for stats

### Delete Confirmation
- Both `_ftDeleteNode` and `_ltDeleteNode` now show `confirm()` dialog
- Dialog includes edge count that will also be deleted

### Source Badges
- Nodes display provenance badges (e.g., "questionnaire", "candidate", "manual")
- Small teal badge next to node name in card header

### CSS Added to lori8.0.html
New CSS classes for all v4 UI elements:
- `.ft-utilities-bar`, `.lt-utilities-bar` — Utilities container
- `.ft-util-badge`, `.lt-util-badge` — Info badges
- `.ft-util-warn`, `.lt-util-warn` — Warning badges
- `.ft-collapse-arrow`, `.lt-collapse-arrow` — Collapse indicators
- `.ft-group-count`, `.lt-group-count` — Group size counters
- `.ft-source-badge`, `.lt-source-badge` — Source provenance
- `.ft-group-collapsed .ft-cards`, `.lt-group-collapsed .lt-cards` — Hidden groups
- `.bb-btn-xs` — Extra small action buttons

## Files Modified

| File | Changes |
|---|---|
| `ui/js/bio-builder.js` | Persistence, seeding rewrite, utilities, collapse/expand, delete confirm, source badges, draft context accessor |
| `ui/lori8.0.html` | v4 CSS classes for all new UI elements |

## Known Limitations

| ID | Description |
|---|---|
| FT-LIMIT-001 | localStorage has ~5MB limit per origin; very large drafts could exceed this |
| FT-LIMIT-002 | Collapse state is session-only |
| FT-LIMIT-003 | Duplicate detection is name-based only (no fuzzy matching) |
