# Family Tree & Life Threads — v4 Test Checklist

**Date:** 2026-03-28
**Build:** Bio Builder v4

---

## Pass 1 — Persistence

- [x] `_persistDrafts(pid)` writes FT draft to localStorage
- [x] `_persistDrafts(pid)` writes LT draft to localStorage
- [x] Schema version (v=1) is present in stored JSON
- [x] Draft index (`lorevox_draft_pids`) updates on persist
- [x] `_loadDrafts(pid)` restores FT from localStorage
- [x] `_loadDrafts(pid)` restores LT from localStorage
- [x] `_loadDrafts(pid)` does NOT overwrite existing in-memory data
- [x] `_clearDrafts(pid)` removes FT and LT from localStorage
- [x] `_clearDrafts(pid)` removes pid from draft index
- [x] All 14 mutation points call `_persistDrafts`
- [x] `_personChanged(newId)` calls `_loadDrafts(newId)`
- [x] Draft survives narrator cycling within same session
- [x] Silent degradation when localStorage is unavailable

## Pass 2 — Better Seeding

- [x] `_ftSeedFromCandidates` infers role from relation string (parent, sibling, spouse, child, grandparent, guardian, chosen_family)
- [x] `_ftSeedFromCandidates` infers relationship type (biological, step, adoptive, half, foster, chosen_family, former_marriage, marriage)
- [x] `_ftSeedFromCandidates` ensures narrator root node exists
- [x] `_ftSeedFromCandidates` creates edges from narrator to seeded persons
- [x] `_ftSeedFromCandidates` processes relationship-type candidates
- [x] `_ltSeedThemes` covers education section
- [x] `_ltSeedThemes` covers laterYears section
- [x] `_ltSeedThemes` covers hobbies section
- [x] `_ltSeedThemes` covers additionalNotes section
- [x] Seeded nodes include source attribution

## Pass 3 — UX Hardening

- [x] `_ftFindDuplicates` detects same-name nodes
- [x] `_ftFindUnconnected` detects edgeless non-narrator nodes
- [x] `_ftFindWeakNodes` detects Unknown/Unnamed/uncertain nodes
- [x] `_ftFindUnsourced` detects nodes without source
- [x] `_ftCleanOrphanEdges` removes edges to non-existent nodes
- [x] Collapse/expand toggles group visibility
- [x] Collapsed groups show count badge
- [x] Delete confirmation dialog shows edge count
- [x] Source badges display on node cards
- [x] Utilities bar renders issue badges
- [x] v4 CSS classes present in lori8.0.html
