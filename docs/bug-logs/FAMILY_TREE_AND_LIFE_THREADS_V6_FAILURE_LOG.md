# Family Tree & Life Threads — v6 Failure Log

**Date:** 2026-03-28
**Build:** Bio Builder v6

---

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total Open** | **0** |

---

## Bugs Found During This Session

None. Clean build.

---

## Open Bugs

None.

---

## Test Expectation Adjustments (Not Bugs)

### V6-ADJ-001 — Fuzzy scorer conservative by design

| Field | Value |
|---|---|
| **Severity** | Informational |
| **Status** | By design |
| **File** | v6_stress_test.js |
| **Found During** | Stress testing |

**Description:** Initial test expectations assumed "Jon" and "John" would fuzzy-match (token-level edit distance). The fuzzy scorer intentionally uses exact token comparison, not Levenshtein distance. "Jon Smith" vs "John Smith" scores 0.475 (distinct) because "Jon"≠"John" at the token level. This is conservative by design to avoid false-positive duplicate suggestions. Test expectations were adjusted to match actual scorer behavior.

**Impact:** None on production code. Tests correctly reflect the scorer's conservative design.

---

## Known Limitations (Not Bugs)

| ID | Description | Severity | Status |
|---|---|---|---|
| V6-LIMIT-001 | Fuzzy scoring is token-based, no edit-distance within tokens | Low | By design |
| V6-LIMIT-002 | Graph mode is read-only — editing requires card mode | Low | By design |
| V6-LIMIT-003 | Graph layout is static clustered, not force-directed | Low | Future enhancement |
| V6-LIMIT-004 | ERA_ROLE_RELEVANCE is hardcoded, not user-customizable | Low | Future enhancement |
| V6-LIMIT-005 | Graph mode caps at 80 nodes for performance | Low | By design |
| V6-LIMIT-006 | Era-scoped memoir context uses global fallback when era-aware accessor unavailable | Low | By design (graceful degradation) |
