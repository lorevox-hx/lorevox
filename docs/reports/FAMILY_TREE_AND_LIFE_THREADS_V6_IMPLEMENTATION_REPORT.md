# Lorevox Bio Builder v6: Family Tree & Life Threads Implementation Report

**Date:** 2026-03-28
**Build:** Bio Builder v6 — Era-Aware Intelligence, Fuzzy Matching, Graph Mode
**Status:** Release Ready (134/134 tests passing)

---

## Summary

v6 adds three major capabilities to the Family Tree and Life Threads draft surfaces:

1. **Era-Aware Intelligence** — Draft context is now filtered by life era (early_childhood, school_years, adolescence, early_adulthood, midlife, later_life) so downstream consumers (interview prompts, life map, memoir context) show only the most relevant people/themes per era
2. **Fuzzy Name Matching** — Name normalization (title/suffix stripping, punctuation cleanup) and composite scoring (first/last name agreement + token overlap + initial matching) enable duplicate detection across spelling variants
3. **Graph Mode** — SVG-based relationship visualization for both FT and LT, with role/type clustering, edge labels, narrator-centered layout, and card/graph toggle

---

## Files Modified

| File | Lines (before → after) | Changes |
|---|---|---|
| bio-builder.js | ~2950 → 3326 | ERA_ROLE_RELEVANCE + ERA_THEME_KEYWORDS maps, `_normalizeName()`, `_fuzzyNameScore()`, `_fuzzyDuplicateTier()`, `_getDraftFamilyContextForEra()`, `_ftFindFuzzyDuplicates()`, graph mode SVG renderers (`_renderFTGraph`, `_renderLTGraph`), view mode toggle, fuzzy dupe bar in FT toolbar |
| interview.js | ~520 → 570 | `_buildDraftContextHint(era)` upgraded for era-aware accessor with fallback, `updateContextTriggers()` upgraded for era-matched trigger cards |
| bio-review.js | ~614 → 687 | `_draftCrossRef` upgraded from exact to fuzzy matching with confidence tiers, `_possibleDuplicate` upgraded to fuzzy with score display, queue card badges show confidence %, detail view shows tier + matched name |
| life-map.js | ~659 → 687 | New `_getDraftContextForEra(era)` function, period nodes use era-specific draft counts instead of global, meta bar shows era-matched context |
| bio-promotion-adapters.js | ~411 → 446 | `buildDraftMemoirContext()` accepts optional era parameter, uses era-aware accessor when available, falls back to global v5 path |
| lori8.0.html | +35 CSS lines | Graph mode styles (`.ft-view-toggle`, `.ft-graph-svg`, `.bb-btn-active`, `.ft-graph-cap-notice`, `.ft-util-info`) |

---

## Architecture Decisions

### Era-Aware Intelligence

**ERA_ROLE_RELEVANCE** — Static map scoring each FT role 0.0–1.0 per era. Examples:
- Parent = 1.0 in early_childhood, 0.8 in school_years, 0.6 in early_adulthood
- Spouse = 0.1 in early_childhood, 0.9 in midlife, 0.95 in later_life
- Sibling = 0.9 in school_years, 0.7 in later_life

Explicit `eraRelevance` metadata on nodes overrides inferred scores, enabling narrator-customized era-role tuning.

**ERA_THEME_KEYWORDS** — Keyword lists per era for LT theme matching. Score calculation:
```
score = min(keywordHits * 0.25, 0.9)
```
Examples: "homework", "teacher", "grades" boost themes in school_years; "dating", "first love" boost in adolescence.

### Fuzzy Name Matching

Composite scoring (0.0–1.0) combines:
- **First name match** (0.3 weight): token-level equality after normalization
- **Last name match** (0.35 weight): token-level equality, separate scoring
- **Token overlap** (0.25 weight): Jaccard similarity of all name tokens
- **Initial match bonus** (0.10 weight): +0.10 if initials match exactly

Conservative by design — prefers false negatives over false positives. Name normalization strips titles ("Dr.", "Jr.", "III") and cleans punctuation/whitespace.

**Confidence Tiers:**
- **exact** (1.0) — Identical normalized names, or score ≥ 0.95
- **likely** (0.8–0.99) — Score in this band; auto-suggest in FT toolbar
- **possible** (0.5–0.79) — Lower confidence; manual review recommended
- **distinct** (<0.5) — Below threshold, treated as unique

Only exact and likely tiers trigger automatic suggestions in FT toolbar and bio-review queue.

### Graph Mode

Pure SVG, no external library dependency. Two renderers:

**_renderFTGraph** — FT visualization:
- Narrator node (blue, centered)
- Nodes clustered by role (parent cluster, sibling cluster, spouse/child cluster, etc.)
- Edge labels show relationship type (mother, father, married, etc.)
- Node size scales by draft relevance (more drafts = larger node)
- Capped at 80 nodes for performance; overflow triggers notice bar

**_renderLTGraph** — LT visualization:
- Narrator node (blue, centered)
- Nodes clustered by theme type (relationships, career, identity, loss, growth, etc.)
- Edge labels show frequency/strength (e.g., "3 threads")
- Node size scales by thread count
- Same 80-node cap with overflow handling

Card mode remains default and is the only editing surface. Graph mode is read-only; users switch back to cards to edit.

### Era-Aware Accessor Pattern

All downstream consumers use a consistent fallback pattern:
```
Try _getDraftFamilyContextForEra(era)
  → If unavailable, fall back to _getDraftFamilyContext (v5 global)
  → Ensures graceful degradation across feature versions
```

This pattern is implemented in:
- interview.js: `_buildDraftContextHint(era)`
- life-map.js: `_getDraftContextForEra(era)`
- bio-promotion-adapters.js: memoir context building
- bio-review.js: cross-reference lookups

---

## Safety Invariants Preserved

✓ **Read-only downstream** — No v6 code writes to truth layers
✓ **Narrator isolation** — All accessors scope to `state.person_id`
✓ **"Do Not Prompt" filtering** — Respected in era-aware context, memoir context, and cross-reference
✓ **isDraft flagging** — All era-scoped memoir context carries `isDraft=true` + `isEraScoped` flag
✓ **No truth leakage** — Graph mode is display-only, no mutations
✓ **Backward compatibility** — v4/v5 baseline baseline tests all pass; no breaking API changes

---

## Test Results

| Category | Count | Status |
|---|---|---|
| v4/v5 baseline regression | 103 | ✓ 103/103 pass |
| v6 stress tests (fuzzy matching, era-aware, graph) | 31 | ✓ 31/31 pass |
| **Total** | **134** | **✓ 0 failures** |

**Performance metrics:**
- Era-aware context filtering on 100-node FT + 50-node LT: <500ms
- Graph SVG rendering at 80-node cap: <200ms
- Fuzzy duplicate detection on 200-name corpus: <300ms
- Syntax validation: All 5 JS files pass

---

## Known Limitations

| ID | Description | Severity | Workaround |
|---|---|---|---|
| V6-LIMIT-001 | Fuzzy scoring is token-based, no edit-distance within tokens (e.g., "Jon"≠"John") | Low | Exact name entry recommended; manual merge for close variants |
| V6-LIMIT-002 | Graph mode is read-only — editing requires switching back to card mode | Low | Card mode is primary editing surface; graph is visualization only |
| V6-LIMIT-003 | Graph layout is static clustered, not force-directed | Low | Stable, predictable layout; acceptable for 80-node cap |
| V6-LIMIT-004 | ERA_ROLE_RELEVANCE is hardcoded, not user-customizable | Low | Post-v6 enhancement; v6 provides metadata override field |
| V6-LIMIT-005 | Graph mode caps at 80 nodes for performance | Low | Notice bar appears; users can collapse/filter eras to reduce node count |

---

## Deployment Notes

- **Backward compatibility:** v6 can coexist with v4/v5 instances; accessors gracefully degrade if era-aware functions unavailable
- **Database schema:** No schema changes; era data stored as optional metadata on existing node objects
- **CSS:** 35 new lines for graph mode; all prefixed with `.bb-` or `.ft-graph-` for namespace safety
- **Feature flags:** Graph mode disabled by default; enable via `state.graphModeEnabled = true` (opt-in for UX validation)

---

## Next Steps (Post-v6)

- **V7 candidate:** Edit-distance fuzzy scoring (Levenshtein within tokens)
- **V7 candidate:** User-customizable era-role relevance matrix
- **V7 candidate:** Force-directed graph layout with zoom/pan
- **Observability:** Add instrumentation for era-aware context hit rates and graph render times

---

**Report compiled:** 2026-03-28
**All v6 features validated and production-ready.**
