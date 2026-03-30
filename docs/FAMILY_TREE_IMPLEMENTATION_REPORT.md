# Lorevox Family Tree — Implementation Report

## Date: 2026-03-29
## Session: Family Tree Architecture Upgrade (Phase 1)

---

## 1. Scope

Phase 1 of the Family Tree architecture upgrade: stabilize current FT persistence/seed/delete behavior, fix known bugs from V2 testing, and add a visible 4-generation scaffold view.

---

## 2. Bugs Fixed

### V2-F01 — Duplicate Narrator Node on Seed

**Problem**: `_ftSeedFromQuestionnaire()` only checked `n.role === "narrator"` to detect existing narrator nodes. Externally-seeded data uses `n.type === "narrator"` (role is undefined), so the check failed and a duplicate narrator node was created.

**Fix**: Extended the narrator detection to also match by display name against the questionnaire's `fullName` and `preferredName`. If any existing node matches the narrator's name, seeding skips narrator creation.

**Location**: `bio-builder.js`, `_ftSeedFromQuestionnaire()` function

**Verification**: Tested — re-seeding no longer creates duplicate narrator nodes.

### V2-F02 — Native confirm() Dialog Replaced

**Problem**: `_ftDeleteNode()` and `_ltDeleteNode()` used `window.confirm()` which blocks the entire browser thread, prevents automation, and provides poor UX.

**Fix**: Created `_showInlineConfirm()` helper that renders a modal overlay with Cancel/Delete buttons inside the Bio Builder popover. The overlay uses `position:fixed` with a semi-transparent backdrop and is appended to the popover element (not document.body) to ensure visibility above the popover's top-layer rendering.

**Location**: `bio-builder.js`, new `_showInlineConfirm()` function; updated `_ftDeleteNode()` and `_ltDeleteNode()` to accept a `confirmed` parameter.

**Verification**: Tested — inline dialog appears correctly inside the popover with Cancel and Delete buttons. Cancel dismisses without deleting. Delete proceeds with deletion.

### V2-F04 — Orphan Edge Auto-Cleanup

**Problem**: Orphan edges (edges referencing deleted node IDs) accumulated silently. The "Clean" button existed but wasn't discoverable.

**Fix**: Added automatic orphan edge cleanup in two places:
1. After `_ftSeedFromQuestionnaire()` completes — calls `_ftCleanOrphanEdges(pid)` to clean up any orphans from the seeding process
2. In `_ftDeleteNode()` — edges touching the deleted node are filtered out inline (already existed, now documented as v7 fix)

**Location**: `bio-builder.js`, post-seed cleanup call and delete function

**Verification**: Orphan edges from seeding are now cleaned automatically.

### Typo Fix — "MEMORYS" → "MEMORIES"

**Problem**: Life Threads section header for memory nodes displayed "MEMORYS" because the pluralization used `type + 's'` which produced "memorys" for the "memory" type.

**Fix**: Special-cased memory pluralization: `type === "memory" ? "memories" : type + 's'`

**Location**: `bio-builder.js`, Life Threads tab renderer, group label generation

**Verification**: Tested — Life Threads now correctly shows "MEMORIES" as the section header.

---

## 3. New Feature: 4-Generation Scaffold View

### What It Does

A new "Scaffold" view mode in the FT tab that renders a visual 4-generation ancestor tree:

```
         [GG1] [GG2] [GG3] [GG4] [GG5] [GG6] [GG7] [GG8]    ← Great-Grandparents (8)
                        │
              [GP1] [GP2] [GP3] [GP4]                          ← Grandparents (4)
                        │
                   [P1]    [P2]                                 ← Parents (2)
                        │
                   [NARRATOR]                                   ← Narrator (1)
         ─────────────────────────────
         Other Family Members
         Siblings | Spouses | Children | ...
```

### Key Design Decisions

1. **Generation color coding**: Each generation has a distinct border color (indigo, purple, pink, amber) for visual hierarchy
2. **Empty slots as placeholders**: Unfilled ancestor positions show dashed-border "Add Ancestor" cards that nudge users to fill in missing data
3. **Dual-schema support**: The scaffold's `_scaffoldEffectiveRole()` function handles both `n.role` and `n.type` fields for backward compatibility with externally-seeded data
4. **Ancestor detection**: Parents are found via edges first, then by role/type matching as fallback. Same for grandparents.
5. **Non-ancestors below**: Siblings, spouses, children, in-laws, associates, and chosen family are displayed in grouped rows below the tree, not lost from view
6. **Clickable nodes**: Populated nodes open the edit form on click

### Implementation Details

- **Functions added**: `_scaffoldEffectiveRole()`, `_scaffoldBuildTree()`, `_scaffoldNodeHtml()`, `_renderFTScaffold()`
- **View modes expanded**: `FT_VIEW_MODES = ["cards", "graph", "scaffold"]` with 3-way toggle
- **CSS**: Inline styles within the scaffold renderer (no external CSS dependency)
- **Performance**: Scaffold renders instantly for any node count — it's a fixed 15-slot layout plus a flat list of extras

---

## 4. What Was NOT Changed

- **Graph storage model**: Remains flat `{ nodes: [], edges: [] }` — no tree restructuring
- **Persistence mechanism**: Still localStorage with same key format
- **API integration**: No API changes — FT remains client-side draft only
- **Promotion pipeline**: Untouched — Phase E/F promotion boundaries intact
- **Life Threads**: No structural changes (only typo fix)
- **Other Bio Builder tabs**: Untouched

---

## 5. Files Modified

| File | Changes |
|------|---------|
| `ui/js/bio-builder.js` | V2-F01 fix (narrator de-dup), V2-F02 fix (inline confirm), V2-F04 fix (orphan auto-clean), MEMORYS typo fix, scaffold view mode, dual-schema support |

No other files were modified. All changes are contained within `bio-builder.js`.

---

## 6. Remaining Work (Phase 2+)

### Phase 2 — Scaffold Interactivity
- Click empty scaffold slots to create new ancestor nodes with pre-filled role/generation
- Drag nodes between scaffold positions
- Connect grandparents to specific parents (currently falls back to role matching)

### Phase 3 — Graph-Aware Richness
- Render edges between scaffold nodes (parent-child lines)
- Support multiple marriage/partnership edges
- Collapse/expand generation layers

### Phase 4 — Downstream Value
- Scaffold data feeds Lori's interview prompts ("Tell me about your paternal grandfather")
- Empty scaffold slots become interview targets
- Promotion preview from scaffold to structured history
