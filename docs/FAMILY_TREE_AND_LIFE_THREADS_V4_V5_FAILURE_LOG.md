# Family Tree & Life Threads — v4/v5 Failure Log

**Date:** 2026-03-28
**Build:** Bio Builder v4 + v5

---

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 0 (1 fixed pre-test) |
| Low | 0 |
| **Total Open** | **0** |

---

## Bugs Fixed During This Session

### IV-BUG-001 — Null Bytes at End of interview.js

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Status** | Fixed |
| **File** | `ui/js/interview.js` line 520 |
| **Found During** | Syntax validation before regression run |

**Repro Steps:**
1. Run `node -c interview.js` or `new Function(code)` syntax check
2. Error: `SyntaxError: Invalid or unexpected token`

**Root Cause:** 437 null bytes (`\x00`) appended to end of interview.js. This is the same class of issue as APP-BUG-001 (2,145 null bytes in app.js) found during the v3 session. The root cause appears to be a file system or editor issue that intermittently appends null bytes during write operations.

**Fix:** Stripped with `content.replace(/\x00+/g, '')` and verified the resulting file passes syntax check.

**Impact:** Would have prevented interview.js from executing entirely, breaking interview prompts, roadmap rendering, and context triggers. Fixed before any user-facing testing.

---

## Open Bugs

None.

---

## Known Limitations (Not Bugs)

| ID | Description | Severity | Status |
|---|---|---|---|
| FT-LIMIT-001 | Draft data is session-only without v4 persistence enabled (localStorage may have ~5MB limit) | Low | By design |
| FT-LIMIT-002 | No visual graph rendering (cards only, not tree layout) | Low | Future enhancement |
| FT-LIMIT-003 | Edge creation uses inline form, not drag-connect | Low | Future enhancement |
| FT-LIMIT-004 | Collapse state is per-session (not persisted across reload) | Low | By design for v4 |
| FT-LIMIT-005 | Duplicate detection is exact name match only (no fuzzy) | Low | Future enhancement |
| LT-LIMIT-001 | No auto-connection between seeded nodes | Low | By design |
| V5-LIMIT-001 | Draft context enrichment is global (not era-specific) — all FT people show for all eras | Low | Future enhancement |
| V5-LIMIT-002 | Cross-reference matching is case-insensitive exact match only | Low | Future enhancement |
