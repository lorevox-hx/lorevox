# Lorevox Family Tree Architecture Brief

## Date: 2026-03-29

---

## 1. Overview

The Lorevox Family Tree (FT) is a draft-layer graph editor inside the Bio Builder popover. It stores person nodes and relationship edges per narrator, persisted to localStorage, with a strict draft-vs-truth boundary — nothing is promoted to structured history without explicit user action.

This architecture brief covers the visible 4-generation scaffold, the underlying graph model, questionnaire seeding rules, and promotion boundaries.

---

## 2. Data Model

### Node Schema (Dual-Format)

The FT supports two node schemas due to the evolution from external seeding (v1) to questionnaire seeding (v2+):

| Field | v1 (External Seed) | v2+ (Questionnaire Seed) |
|-------|-------------------|------------------------|
| Identity | `name`, `displayName` | `firstName`, `middleName`, `lastName`, `preferredName` |
| Role | `type` (narrator, parent, sibling, spouse, child, in-law, associate) | `role` (narrator, parent, sibling, spouse, child, grandparent, grandchild, guardian, chosen_family, other) |
| Metadata | `gender` | `birthDate`, `deathDate`, `deceased`, `deathContext`, `uncertainty`, `notes`, `source` |

Both schemas are supported throughout the rendering pipeline. The `_ftNodeDisplayName()` function resolves display names from either format. The scaffold view uses `_scaffoldEffectiveRole()` to normalize `role` and `type` into a single effective role.

### Edge Schema

```
{
  id: "fte_{uid}",
  from: "{nodeId}",        // source node
  to: "{nodeId}",          // target node
  relationshipType: "biological|adoptive|step|marriage|partnership|former_marriage|guardian|chosen_family|half|foster|other",
  label: "Father|Mother|Sister|...",
  notes: ""
}
```

### Storage

- Key: `lorevox_ft_draft_{person_id}`
- Format: `{ v: 1, d: { nodes: [], edges: [] } }`
- Also accepted: `{ v: 1, data: { nodes: [], edges: [] } }` (CS-4 compatibility fix)
- Scope: Per-narrator, per-browser. Survives refresh, narrator switching, and cold restart.

### Roles (FT_ROLES)

`narrator, parent, sibling, spouse, child, grandparent, grandchild, guardian, chosen_family, other`

### Relationship Types (FT_REL_TYPES)

`biological, adoptive, step, marriage, partnership, former_marriage, guardian, chosen_family, half, foster, other`

---

## 3. View Modes

The FT tab supports three view modes, cycled via a toggle button:

### Cards (Default)
- Nodes grouped by role (PARENT, SIBLING, SPOUSE, CHILD, CHOSEN FAMILY, OTHER)
- Each card shows: name, badges (deceased, uncertainty, source), birth/death dates, notes, connected edges with dismiss buttons
- Collapsible role groups

### Graph
- SVG-based force-directed layout
- Nodes as circles, edges as lines with labels
- Color-coded by role
- Max 50 nodes for performance

### Scaffold (New — v7)
- **4-generation ancestor tree** layout: Great-Grandparents (8 slots) → Grandparents (4 slots) → Parents (2 slots) → Narrator (1 slot)
- Generation color coding: Indigo (narrator), Purple (parents), Pink (grandparents), Amber (great-grandparents)
- Empty slots rendered as dashed placeholders with "Add Ancestor" prompt
- Populated slots are clickable (opens edit form)
- Non-ancestor nodes (siblings, spouses, children, chosen family, associates) displayed below the tree in grouped rows
- Scaffold tree-building algorithm:
  1. Find narrator node (by role or type)
  2. Find parent nodes via edges, falling back to role-matching
  3. Find grandparent nodes via edges from parents, falling back to role-matching
  4. Great-grandparent slots are placeholders (no data yet)

---

## 4. Questionnaire Seeding Rules

### `_ftSeedFromQuestionnaire()`

Seeds FT draft from Bio Builder questionnaire answers:

1. **Narrator node**: Created only if no existing node has `role === "narrator"` AND no node's display name matches the narrator's full or preferred name (v7 de-duplication fix)
2. **Parent nodes**: Created from `questionnaire.parents[]`. De-duplicated by matching display name + role. Relationship type inferred from relation field (step, adoptive, biological).
3. **Sibling nodes**: Created from `questionnaire.siblings[]`. De-duplicated similarly. Relationship type: step, half, or biological.
4. **Grandparent nodes**: Created from `questionnaire.grandparents[]`. Connected to narrator with biological edge.
5. **Post-seed cleanup**: Orphan edges auto-cleaned after seeding (v7 fix).

### `_ftSeedFromCandidates()`

Seeds FT from Bio Builder candidate items (Phase D extracted data):
- Role inferred from candidate relation field via regex matching
- Relationship type inferred similarly
- De-duplicated by display name match

### Seeding Safety

- Seed operations are near-idempotent: repeated calls do not create duplicate nodes for names that already exist
- Seed never writes to truth layers (archive, facts, timeline, memoir)
- All seeded nodes get `source: "questionnaire"` or `source: "candidates"` badge

---

## 5. Promotion Boundaries

### Draft Layer (Bio Builder)
- FT nodes and edges live in `state.bioBuilder.familyTreeDraftsByPerson[pid]`
- All edits are local drafts — no API calls, no truth layer writes
- Persisted to localStorage only

### Truth Layer (Structured History)
- Promotion requires explicit user action through the Candidates Review UI (Phase E)
- The Candidates tab explicitly states: "Nothing is promoted automatically — every decision is yours"
- Promotion goes through `bio-promotion-adapters.js` (Phase F) which normalizes draft data into structured format

### Boundary Enforcement
- `bio-builder.js` writes ONLY to `state.bioBuilder`
- Never writes to `state.archive`, `state.facts`, `state.timeline`, or `state.memoir`
- Draft data is invisible to derived views (Life Map, Timeline, Peek at Memoir) until promoted

---

## 6. Quality Indicators

The FT draft quality utilities bar shows:

| Indicator | Description |
|-----------|-------------|
| Unconnected | Nodes with 0 edges |
| Weak/unlabeled | Edges missing relationship type or label |
| Unsourced | Nodes without a `source` field |
| Orphan edges | Edges referencing node IDs that don't exist |

Orphan edges can be cleaned via the "Clean" button, and are now auto-cleaned on node deletion (v7 fix).

---

## 7. Sensitive Family Complexity

The FT data model supports:

| Situation | Model Support |
|-----------|--------------|
| Unknown parents | `uncertainty: "unknown"` badge, placeholder name |
| Infant loss | `deceased: true`, `deathContext` in italics |
| Chosen family | `chosen_family` role with equal visual legitimacy |
| Estrangement | `uncertainty: "sensitive"` badge, "Do not prompt" notes |
| Same-sex partners | Gender-neutral relationship model |
| Blended families | `step`, `adoptive`, `foster`, `guardian` relationship types |
| Fuzzy dates | String dates accepted ("circa 1940", "after 1950") |

---

## 8. Narrator Isolation

- FT drafts keyed by `person_id` — switching narrators loads a completely separate draft
- `_loadGeneration` counter prevents stale async data from appearing
- No cross-narrator contamination observed across all V2 test scenarios

---

## 9. Implementation Summary

### Files Modified
- `ui/js/bio-builder.js` — All FT logic, scaffold renderer, bug fixes

### v7 Changes (This Session)
1. **V2-F01 fix**: De-duplicate narrator node on seed by checking display name match
2. **V2-F02 fix**: Replace native `confirm()` with inline confirmation dialog (inside popover)
3. **V2-F04 fix**: Auto-clean orphan edges after seeding and on node deletion
4. **Typo fix**: "MEMORYS" → "MEMORIES" in Life Threads section headers
5. **Scaffold view**: New 4-generation ancestor tree layout with generation color coding
6. **Dual-schema support**: Scaffold handles both v1 (type/name) and v2 (role/firstName) node formats
