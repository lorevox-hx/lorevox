# Lorevox Trace Test — Fix Report

## Date: 2026-03-29
## File Modified: `ui/js/bio-builder.js`

---

## Fix 1: QF-3b — Grandparent De-Duplication Dual-Schema

### Problem
The grandparent de-duplication check in `_ftSeedFromQuestionnaire()` only checked `n.role === "grandparent"` but not `n.type === "grandparent"`. Externally-seeded v1 nodes store their classification in `type` rather than `role`, so they would not be recognized as existing grandparents during de-duplication.

### Code Change

**Location**: `bio-builder.js`, `_ftSeedFromQuestionnaire()`, line 2161

**Before**:
```javascript
var exists = draft.nodes.some(function (n) {
  return _ftNodeDisplayName(n) === name && n.role === "grandparent";
});
```

**After**:
```javascript
var exists = draft.nodes.some(function (n) {
  return _ftNodeDisplayName(n) === name && (n.role === "grandparent" || n.type === "grandparent");
});
```

### Rationale
This is the same dual-schema pattern that was already fixed for narrator (V2-F01), parent, and sibling de-duplication. The grandparent check was the last remaining instance that only checked `n.role`.

### Verification
Mark Twain's FT seed correctly de-duplicated all existing nodes without creating duplicates, even with mixed v1/v2 schemas.

---

## Fix 2: QF-3c — Scaffold Grandparent Slot Deduplication

### Problem
The `_scaffoldBuildTree()` function processed each parent's grandparents independently. When using the fallback grandparent search (no edges connecting grandparents to specific parents), both parents selected from the same pool of unassigned grandparents without tracking which ones had already been placed. This caused the first two grandparents to appear in both parent branches, while the remaining two were pushed to the "Other Family Members" section.

### Code Change

**Location**: `bio-builder.js`, `_scaffoldBuildTree()`, lines 3089-3128

**Before** (inside `.map()` callback):
```javascript
tree.children = parentNodes.slice(0, 2).map(function (pn) {
  // ...
  // Fallback: find grandparent-role nodes not yet placed
  if (gpNodes.length === 0) {
    var usedIds = {};  // <-- re-created per parent!
    parentNodes.forEach(function (p) { if (p) usedIds[p.id] = true; });
    usedIds[narrator.id] = true;
    draft.nodes.forEach(function (n) {
      if (!usedIds[n.id] && _scaffoldEffectiveRole(n) === "grandparent" && gpNodes.length < 2) {
        gpNodes.push(n);
      }
    });
  }
  // ...
});
```

**After** (shared tracker above `.map()`):
```javascript
// v7 fix: track grandparent IDs already assigned to prevent duplicate placement
var _usedGpIds = {};
parentNodes.forEach(function (p) { if (p) _usedGpIds[p.id] = true; });
_usedGpIds[narrator.id] = true;

tree.children = parentNodes.slice(0, 2).map(function (pn) {
  // ...
  // Edge-based search also checks _usedGpIds
  if (gpId && gpId !== narrator.id && !_usedGpIds[gpId]) {
    // ...
  }

  // Fallback: uses shared _usedGpIds
  if (gpNodes.length === 0) {
    draft.nodes.forEach(function (n) {
      if (!_usedGpIds[n.id] && _scaffoldEffectiveRole(n) === "grandparent" && gpNodes.length < 2) {
        gpNodes.push(n);
      }
    });
  }

  // Mark these grandparents as used so the next parent gets different ones
  gpNodes.forEach(function (gn) { if (gn) _usedGpIds[gn.id] = true; });
  // ...
});
```

### Rationale
The `_usedGpIds` object is now shared across all parent iterations. After processing the first parent, its grandparents are marked as used. The second parent's fallback search then skips those grandparents and selects the remaining unused ones. The edge-based search path also checks `_usedGpIds` for consistency.

### Verification

**Mark Twain scaffold** (4 grandparents from questionnaire + 2 parents from v1):
- Paternal slots: Samuel B. Clemens, Pamela Goggin Clemens
- Maternal slots: Benjamin Lampton, Margaret Casey Lampton
- No duplicates. All 4 unique grandparents correctly placed.

**Janice scaffold** (4 grandparents from clean questionnaire):
- Paternal slots: Harold Thompson, Edith Thompson
- Maternal slots: Frank Kowalski, Rose Kowalski
- No duplicates. All 4 unique grandparents correctly placed.

---

## Summary of All Changes in This Session

| Fix ID | Line(s) | Change Description |
|--------|---------|-------------------|
| QF-3b | 2161 | Added `\|\| n.type === "grandparent"` to grandparent de-duplication check |
| QF-3c | 3089-3128 | Hoisted `_usedGpIds` tracker above `.map()`, added grandparent marking after each parent |

### Files Modified
- `ui/js/bio-builder.js` — 2 fixes, ~15 lines changed

### No Other Files Were Modified
All changes are contained within `bio-builder.js`. No API changes, no CSS changes, no HTML changes.
