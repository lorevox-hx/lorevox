**Date:** 2026-03-28
**Build:** Bio Builder v6

### Pilot Scenario 1: Era-Aware Interview Prompts
**Setup:** Profile with 15 FT nodes (2 parents, 3 siblings, 2 grandparents, 1 spouse, 2 children, 5 other) + 8 LT nodes
**Action:** Switch between early_childhood and midlife eras
**Expected:** Interview hints prioritize parents/grandparents in early_childhood, spouse/children in midlife
**Result:** PASS — _buildDraftContextHint(era) correctly returns era-ranked items. Parents score 1.0 in early_childhood; spouse scores 0.9 in midlife.

### Pilot Scenario 2: Fuzzy Duplicate Detection in Review Queue
**Setup:** FT draft with "John Smith" (parent) and review candidate "Dr. John Smith Jr."
**Action:** Open candidate detail view
**Expected:** Cross-reference badge shows "Exact match in Family Tree — parent — John Smith"
**Result:** PASS — Title stripping normalizes both names to "john smith", score=1.0, tier=exact.

### Pilot Scenario 3: Graph Mode on Medium Profile
**Setup:** FT with 20 nodes across all role types + 15 edges
**Action:** Toggle to Graph mode
**Expected:** SVG renders with narrator centered, role clusters visible, edge labels readable
**Result:** PASS — SVG renders correctly. Role cluster labels visible. Nodes positioned by _FT_ROLE_POSITIONS map. Deceased nodes rendered at 50% opacity.

### Pilot Scenario 4: Life Map Era-Specific Draft Counts
**Setup:** Profile with FT/LT data, 6 life periods defined
**Action:** Render life map
**Expected:** Each period shows era-relevant draft counts, not global totals
**Result:** PASS — early_childhood period shows "4 family" (parents+grandparents), midlife shows "3 family" (spouse+children). "(era)" suffix visible on each.

### Pilot Scenario 5: Era-Scoped Memoir Context
**Setup:** Profile with 10 FT people, 5 LT themes
**Action:** Call buildDraftMemoirContext("early_childhood")
**Expected:** Returns only era-relevant people/themes with isEraScoped=true
**Result:** PASS — Returns 4 people (parents, grandparents, guardian), 2 themes matching early_childhood keywords. isEraScoped=true, era="early_childhood".
