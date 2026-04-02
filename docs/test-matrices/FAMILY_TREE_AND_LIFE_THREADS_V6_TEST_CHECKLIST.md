**Date:** 2026-03-28
**Build:** Bio Builder v6

### Automated Tests (31 v6 + 103 baseline = 134 total)

v6 Stress Tests:
- [x] normalizeName handles null/undefined
- [x] normalizeName strips titles
- [x] fuzzyNameScore: identical names = 1.0
- [x] fuzzyNameScore: case insensitive
- [x] fuzzyNameScore: title-stripped match
- [x] fuzzyNameScore: last name match only = moderate
- [x] fuzzyNameScore: completely different = low
- [x] fuzzyNameScore: partial match returns moderate score
- [x] fuzzyNameScore: empty strings = 0
- [x] fuzzyDuplicateTier: correct tiers
- [x] _getDraftFamilyContextForEra returns null without person
- [x] _getDraftFamilyContextForEra returns global fallback without era
- [x] _getDraftFamilyContextForEra returns era-scoped results
- [x] _getDraftFamilyContextForEra: spouse low in early_childhood
- [x] _getDraftFamilyContextForEra: spouse high in midlife
- [x] _getDraftFamilyContextForEra: never returns empty when data exists
- [x] FT graph handles 80+ nodes without error
- [x] FT fuzzy duplicates finder on 50-node profile
- [x] Era-aware on heavy profile (100 FT nodes) completes
- [x] fuzzyNameScore: unicode names
- [x] fuzzyNameScore: very long names
- [x] fuzzyNameScore: single character names
- [x] Era-aware with unknown era returns gracefully
- [x] Era-aware with empty FT draft
- [x] Review _fuzzyScore delegates to BB
- [x] Review _fuzzyTier returns correct tiers
- [x] Review _draftCrossRef fuzzy: exact name matches
- [x] Review _draftCrossRef: no match for unrelated name
- [x] buildDraftMemoirContext with no era returns global
- [x] buildDraftMemoirContext with era uses era-aware accessor
- [x] buildDraftMemoirContext respects 'Do Not Prompt'

v4/v5 Baseline Regression: 103/103 pass (see v4/v5 test results for details)

### Manual Test Scenarios
- [x] Graph mode toggle: clicking Cards/Graph switches view without error
- [x] FT graph: narrator centered, roles clustered, edges visible
- [x] LT graph: types clustered, edges dashed, labels visible
- [x] Era-matched interview hints: early_childhood shows parents, not spouses
- [x] Life map per-period draft counts differ by era
- [x] Bio review: fuzzy cross-reference shows confidence % in badges
- [x] Bio review: detail view shows matched name with tier label
- [x] Memoir context: era-scoped returns isEraScoped=true flag
- [x] Large profile: 80+ nodes renders graph with cap notice
- [x] Do Not Prompt: DNP nodes excluded from all v6 outputs
