# Lorevox Family Tree — Bug Log

## Date: 2026-03-29

---

## Bugs Fixed in This Session

### V2-F01: Duplicate Narrator Node on Seed (FIXED)

| Field | Value |
|-------|-------|
| Bug ID | V2-F01 |
| Status | FIXED |
| Fix | Extended narrator detection in `_ftSeedFromQuestionnaire()` to check display name match against questionnaire fullName and preferredName, in addition to role check |
| Root Cause | Externally-seeded nodes use `type` field (not `role`), so `n.role === "narrator"` returned false for all existing nodes |
| Location | `bio-builder.js`, `_ftSeedFromQuestionnaire()` |

### V2-F02: Native confirm() Dialog (FIXED)

| Field | Value |
|-------|-------|
| Bug ID | V2-F02 |
| Status | FIXED |
| Fix | Created `_showInlineConfirm()` function that renders a modal overlay with Cancel/Delete buttons inside the Bio Builder popover |
| Root Cause | `window.confirm()` blocks the entire browser thread and cannot be interacted with by automation tools |
| Location | `bio-builder.js`, new `_showInlineConfirm()`, updated `_ftDeleteNode()` and `_ltDeleteNode()` |

### V2-F04: Orphan Edge Accumulation (FIXED)

| Field | Value |
|-------|-------|
| Bug ID | V2-F04 |
| Status | FIXED |
| Fix | Auto-clean orphan edges after seeding (`_ftCleanOrphanEdges(pid)` called post-seed). Node deletion already filters edges inline. |
| Root Cause | Externally-seeded edges had undefined from/to fields; seeded edges referenced node IDs that didn't always exist |
| Location | `bio-builder.js`, post-seed cleanup in `_ftSeedFromQuestionnaire()` |

### Typo: "MEMORYS" → "MEMORIES" (FIXED)

| Field | Value |
|-------|-------|
| Bug ID | V2-Typo |
| Status | FIXED |
| Fix | Special-cased "memory" pluralization: `type === "memory" ? "memories" : type + 's'` |
| Root Cause | Generic pluralization `type + 's'` produces "memorys" for the "memory" node type |
| Location | `bio-builder.js`, Life Threads tab renderer, group label line |

---

## New Issues Found During Implementation

### FT-I01: Externally-Seeded Edges Have Null from/to

| Field | Value |
|-------|-------|
| Bug ID | FT-I01 |
| Severity | Low |
| Area | Family Tree → Edge Data |
| Description | Of 11 edges in Mark Twain's FT draft, 10 have `from: undefined` and `to: undefined`. Only 1 edge (the questionnaire-seeded wife connection) has valid from/to values. |
| Impact | Scaffold can only trace 1 relationship path. All other edges are orphans by the null-reference definition. |
| Root Cause | External seeding (v1) created edges without proper node ID references |
| Recommendation | When migrating v1 data, run a one-time edge repair that matches edge metadata (labels like "wife", "mother") to existing node IDs |

### FT-I02: Dual-Schema Node Format

| Field | Value |
|-------|-------|
| Bug ID | FT-I02 |
| Severity | Low |
| Area | Family Tree → Data Model |
| Description | Externally-seeded nodes use `type`/`name`/`displayName` while questionnaire-seeded nodes use `role`/`firstName`/`lastName`. The scaffold now handles both, but this creates maintenance burden. |
| Impact | Every new FT feature must check both schemas |
| Recommendation | Add a one-time migration function that normalizes v1 nodes to v2 format on load |

### FT-I03: Scaffold Great-Grandparent Slots Not Connected

| Field | Value |
|-------|-------|
| Bug ID | FT-I03 |
| Severity | Info |
| Area | Family Tree → Scaffold View |
| Description | Great-grandparent slots in the scaffold are always empty placeholders because no data path exists to populate them yet (no great-grandparent role in questionnaire, no edges from grandparents). |
| Impact | Cosmetic — the 8 empty slots provide future expansion points |
| Recommendation | Phase 2: Add great-grandparent fields to questionnaire, or allow users to click empty scaffold slots to create ancestor nodes |

---

## Previously Fixed (Verified Still Working)

| Bug ID | Title | Status |
|--------|-------|--------|
| CS-1 | Bio Builder popover render guard | VERIFIED |
| CS-2 | Life Map popover render guard | VERIFIED |
| CS-3 | Profile loading race condition | VERIFIED |
| CS-4 | FT/LT draft loading compatibility | VERIFIED |
| CS-5 | Quick Capture placeholder dynamic | VERIFIED |
| CS-6 | Zodiac auto-derive on hydration | VERIFIED |
