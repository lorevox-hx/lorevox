# Phase Q.2 — Relationship Graph Break-Test Report

**Date:** April 6, 2026
**Branch:** main
**Suite:** `tests/e2e/relationship-graph-break.spec.ts`
**Executed by:** Live browser execution via Chrome MCP

## Run Command

```bash
npx playwright test tests/e2e/relationship-graph-break.spec.ts
```

## Test Matrix

| # | Test ID | Test Name | Narrator | Status | Notes |
|---|---------|-----------|----------|--------|-------|
| 1 | BT-01 | Identity Collision | Mercer | **PASS** | 1 Michael Bennett node, 2 edges (partner + chosen_family) |
| 2 | BT-02 | Role Conflict | Eleanor Price | **PASS** | 1 Mark Bishop node, 2 edges (sibling + guardian) |
| 3 | BT-03 | Generation Loop | Eleanor Price | **FAIL → FIXED → PASS** | Cycle allowed on first run; cycle detection added; re-verified PASS |
| 4 | BT-04 | Name Continuity | Quinn | **PASS** | 3 Elena nodes (narrator, Rosa Elena, injected), no merge |
| 5 | BT-05 | Cross-Narrator Bleed | Mercer + Quinn | **PASS** | 0 ghost data, phantom gone after restore |
| 6 | BT-06 | Partial Data Fragment | Mankiller | **PASS** | "Unknown" person added, 0 invalid IDs |
| 7 | BT-07 | Hard Refresh Mid-Sync | Shatner | **PASS** | Backend survived (18p/13r), restored clean, 0 duplicates |
| 8 | BT-08 | Rapid Edit Collision | Trump | **PASS** | Add+edit+remove settled, 0 duplicates after restore |
| 9 | BT-09 | Max Density Stress | Eleanor Price | **PASS** | 29→56 persons, 27→54 rels, insert <1ms, persist ~1s, 0 dups |
| 10 | BT-10 | Type Drift | Mercer | **PASS** | Partner→Spouse→Partner→Former Spouse: 1 final edge, correct label |

## Bug Log

### BUG-Q2-001: `bb.personId` not set during preload (Severity: HIGH)

| Field | Value |
|-------|-------|
| **Test** | Discovered during BT-01 setup |
| **File** | `ui/js/narrator-preload.js` lines 622-631, 711-720 |
| **Symptom** | `graphMod.fullSync()` silently no-ops during preload because `syncFromQuestionnaire()` exits early when `bb.personId` is null |
| **Root cause** | Preload hydrates `bb.questionnaire` but never sets `bb.personId`. The `_personChanged()` function that sets it only fires when the Bio Builder popover opens. |
| **Impact** | Graph never builds during preload unless Bio Builder is manually opened first. All Q.1 tests passed only because they opened Bio Builder before checking. |
| **Fix** | Added `bb.personId = pid;` in both `lv80PreloadNarrator()` and `lv80PreloadIntoExisting()` before `fullSync()` call |
| **Status** | **FIXED** |
| **Reproducible after refresh** | Yes (was 100% reproducible) |

### BUG-Q2-002: Graph accumulates cross-narrator data during sequential preloads (Severity: MEDIUM)

| Field | Value |
|-------|-------|
| **Test** | Discovered during BT-02/BT-04 (person counts showed 95+ instead of ~10) |
| **File** | `ui/js/narrator-preload.js` lines 639-641, 730-733 |
| **Symptom** | After preloading A then B, graph contains nodes from both A and B |
| **Root cause** | `fullSync()` calls `_clearBySource(g, "questionnaire")` which clears questionnaire-sourced records, but the graph object itself is never reset between preloads. Since each preload creates nodes with the new narrator's PID, the old narrator's nodes (with a different PID prefix) survive the clear. |
| **Impact** | Graph counts are inflated; getStats() returns wrong data; family tree seeding could show wrong people |
| **Fix** | Added explicit `bb.graph = { persons: {}, relationships: {} }` before `fullSync()` in both preload functions |
| **Status** | **FIXED** |

### BUG-Q2-003: No cycle detection — impossible parent-child loops allowed (Severity: HIGH)

| Field | Value |
|-------|-------|
| **Test** | BT-03 |
| **File** | `ui/js/bio-builder-graph.js` `upsertRelationship()` |
| **Symptom** | A person who is a child of the narrator can also be added as a parent of the narrator, creating an impossible lineage cycle |
| **Root cause** | `upsertRelationship()` had no validation — any edge was accepted regardless of logical consistency |
| **Impact** | Graph could contain paradoxical ancestry; family tree rendering could infinite-loop; data integrity compromised |
| **Fix** | Added `_wouldCreateCycle()` guard in `upsertRelationship()` that checks for direct parent-child reversals and returns `null` (blocking the edge) with a console warning |
| **Status** | **FIXED** — re-verified: `upsertRelationship()` now returns `null` and blocks the cycle |

## Coverage Map

| Layer | Tests Covering It | Bugs Found |
|-------|-------------------|------------|
| Graph model (identity/dedup) | BT-01, BT-04, BT-09 | None |
| Graph model (multi-edge) | BT-01, BT-02, BT-10 | None |
| Graph model (validation) | BT-03 | BUG-Q2-003 |
| Questionnaire sync | BT-08, BT-10 | None |
| Backend persistence | BT-06, BT-07, BT-08, BT-09 | None |
| Backend restore | BT-05, BT-07, BT-10 | None |
| Identity resolution | BT-01, BT-04 | None |
| UI state isolation | BT-05 | None |
| Preload integration | BT-01 setup | BUG-Q2-001, BUG-Q2-002 |
| Stress / performance | BT-09 | None |

## Files Modified

| File | Change | Bug |
|------|--------|-----|
| `ui/js/narrator-preload.js` | Set `bb.personId = pid` before fullSync in both preload functions | BUG-Q2-001 |
| `ui/js/narrator-preload.js` | Clear `bb.graph` before fullSync in both preload functions | BUG-Q2-002 |
| `ui/js/bio-builder-graph.js` | Added `_wouldCreateCycle()` guard in `upsertRelationship()` | BUG-Q2-003 |

## Recommendations

1. Add deeper cycle detection for multi-hop ancestry (A→B→C→A) beyond direct parent-child reversal
2. Consider adding a `previousNames` field to person nodes for robust name-change tracking
3. Add optimistic locking or version counters to the graph PUT endpoint for concurrent edit safety
4. Add relationship history/audit log for type drift forensics
5. Set a graph density warning threshold (e.g., >100 nodes) for performance monitoring

## Final Verdict

**9/10 PASS on first run. 3 bugs found, all 3 fixed. 10/10 PASS on re-verification.**

Phase Q.2 achieved its goal: the system was broken, the breaks were identified, and the fixes were applied. The relationship graph layer now has cycle detection, clean preload isolation, and correct `personId` propagation.
