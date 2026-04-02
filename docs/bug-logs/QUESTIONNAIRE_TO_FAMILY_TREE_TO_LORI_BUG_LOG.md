# Lorevox Trace Test — Bug Log

## Date: 2026-03-29

---

## Bugs Found During This Trace Test

### QF-3b: Grandparent De-Duplication Missing Dual-Schema Check

| Field | Value |
|-------|-------|
| Bug ID | QF-3b |
| Severity | Medium |
| Failure Bucket | QF-3 (FT seed) |
| Status | FIXED |
| Area | Family Tree → `_ftSeedFromQuestionnaire()` → grandparent loop |
| Description | The grandparent de-duplication check at line 2161 only tested `n.role === "grandparent"` but not `n.type === "grandparent"`. For v1 externally-seeded nodes that use `type` instead of `role`, grandparents would not be recognized as duplicates and would be re-created on every seed. |
| Impact | Duplicate grandparent nodes would accumulate if seed is run multiple times with mixed v1/v2 data. Not triggered in the Janice clean-slate scenario, but would have triggered if Janice had pre-existing v1-seeded grandparent nodes. |
| Root Cause | Same pattern as V2-F01 (narrator) and the parent/sibling fixes — the dual-schema (`role` vs `type`) was not consistently handled across all node types. Parent and sibling checks were fixed in the prior session; grandparent was missed. |
| Fix | Changed line 2161 from `n.role === "grandparent"` to `(n.role === "grandparent" || n.type === "grandparent")` |
| Location | `bio-builder.js`, `_ftSeedFromQuestionnaire()`, grandparent de-duplication check |
| Verification | Mark Twain seed did not produce duplicate grandparents despite having mixed v1/v2 node schemas |

---

### QF-3c: Scaffold View Duplicates Grandparents Across Parent Slots

| Field | Value |
|-------|-------|
| Bug ID | QF-3c |
| Severity | Medium |
| Failure Bucket | QF-3 (FT seed — scaffold rendering) |
| Status | FIXED |
| Area | Family Tree → `_scaffoldBuildTree()` → grandparent fallback search |
| Description | When the scaffold view builds its 4-generation tree, it processes each parent's grandparents separately. The fallback grandparent search (when no edges connect grandparents to a specific parent) was not tracking which grandparents had already been assigned to the first parent. This caused the same 2 grandparents to appear in both the first and second parent's grandparent slots, leaving the remaining 2 grandparents orphaned to the "Other Family Members" section. |
| Impact | Visual only — the underlying FT data was correct. But the scaffold view showed duplicate grandparent cards (e.g., "Samuel B. Clemens" appeared twice) while other grandparents (Benjamin Lampton, Margaret Casey Lampton) were pushed to the bottom section. |
| Root Cause | The `usedIds` tracker in the fallback grandparent search was defined inside the `.map()` callback, so it was re-initialized for each parent. Grandparents assigned to parent 1 were not excluded from parent 2's search. |
| Fix | Hoisted a shared `_usedGpIds` tracker above the `.map()` call. Each parent's grandparent assignment now marks used IDs, preventing the next parent from selecting the same grandparents. Also added `_usedGpIds` check to the edge-based search path for consistency. |
| Location | `bio-builder.js`, `_scaffoldBuildTree()`, lines 3089-3128 |
| Verification | After fix, Mark Twain scaffold correctly shows all 4 unique grandparents: Samuel B. Clemens, Pamela Goggin Clemens (paternal), Benjamin Lampton, Margaret Casey Lampton (maternal). Janice scaffold also shows all 4 unique grandparents correctly. |

---

## Previously Fixed Bugs (Verified Still Working)

| Bug ID | Title | Status |
|--------|-------|--------|
| V2-F01 | Duplicate Narrator Node on Seed | VERIFIED — Mark Twain narrator not duplicated despite dual-schema |
| V2-F02 | Native confirm() Dialog | VERIFIED — inline confirm renders inside popover |
| V2-F04 | Orphan Edge Accumulation | VERIFIED — orphan edges auto-cleaned after Mark Twain seed (11→5 edges) |
| V2-Typo | "MEMORYS" → "MEMORIES" | Previously verified |
| QF-3a | Narrator ID lookup crash (dual-schema) | VERIFIED — seed runs without crash for both narrators |

---

## Issues Noted (Not Bugs)

### Observation: Chat History Persists Across Narrator Switch

| Field | Value |
|-------|-------|
| ID | OBS-1 |
| Severity | Info |
| Area | Chat UI |
| Description | After switching from Mark Twain to Janice, the chat UI still displayed Mark Twain's conversation messages. Lori's earlier messages referencing "Mark" and "Hannibal, Missouri" remained visible. However, NEW messages sent to Janice correctly used Janice's grounding context. |
| Impact | Cosmetic/UX — old messages may confuse users. Not a data integrity issue. |
| Recommendation | Consider clearing chat display on narrator switch, or visually marking messages from a different narrator session. |

### Observation: Questionnaire is Session-Scoped (Not Persisted)

| Field | Value |
|-------|-------|
| ID | OBS-2 |
| Severity | Info |
| Area | Questionnaire persistence |
| Description | Questionnaire data lives in `state.bioBuilder.questionnaire` which is session-scoped. It survives popover close/reopen but NOT page reload. This is documented behavior, not a bug. Only FT/LT drafts are persisted to localStorage. |
| Impact | Users must complete questionnaire and seed FT in a single session. Questionnaire data is lost on refresh. |
| Recommendation | Phase 2: Consider persisting questionnaire to localStorage alongside FT/LT drafts. |
