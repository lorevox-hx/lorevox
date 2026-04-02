# Family Tree & Life Threads — Failure Log (v4 60-Profile Run)

**Date:** 2026-03-28
**Build:** Bio Builder v3

---

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 (2 fixed pre-test) |
| High | 0 (1 fixed during test) |
| Medium | 0 |
| Low | 0 |
| **Total Open** | **0** |

---

## Bugs Fixed During This Session

### FT-BUG-001 — `_ftNodeDisplayName` Missing `label` Fallback

| Field | Value |
|---|---|
| **Severity** | High |
| **Status** | Fixed |
| **File** | `ui/js/bio-builder.js` line 1639 |
| **Found During** | Visual verification of S07 (The Blended Chaos) |

**Repro Steps:**
1. Inject test packet with 60 profiles (nodes use `label` field, not `firstName`/`lastName`)
2. Switch to Family Tree tab for S07
3. Observe all node cards display "Unknown" instead of their actual labels

**Expected:** Node cards show "Bio Child 1", "Stepchild 1", "Adopted Child", etc.

**Actual:** All nodes show "Unknown" because `_ftNodeDisplayName` fallback chain was: `displayName → preferredName → firstName+middleName+lastName → uncertainty → "Unknown"` — missing `label` entirely.

**Fix:**
```javascript
// BEFORE:
function _ftNodeDisplayName(node) {
    if (node.displayName) return node.displayName;
    if (node.preferredName) return node.preferredName;
    var parts = [node.firstName, node.middleName, node.lastName].filter(Boolean);
    return parts.length ? parts.join(" ") : (node.uncertainty || "Unknown");
}

// AFTER:
function _ftNodeDisplayName(node) {
    if (node.displayName) return node.displayName;
    if (node.preferredName) return node.preferredName;
    var parts = [node.firstName, node.middleName, node.lastName].filter(Boolean);
    if (parts.length) return parts.join(" ");
    if (node.label) return node.label;
    return node.uncertainty || "Unknown";
}
```

**Impact:** Affects all Family Tree nodes created via seeding or test injection that use the `label` field rather than structured name fields. The Life Threads renderer was unaffected because it uses `n.label || "Untitled"` directly.

---

### APP-BUG-001 — Null Bytes at End of app.js

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Status** | Fixed |
| **File** | `ui/js/app.js` line 2210 |
| **Found During** | Initial page load — UI completely non-functional |

**Repro Steps:**
1. Load `lori8.0.html`
2. Page appears to load but narrator dropdown shows "Loading...", no chat functionality

**Root Cause:** 2,145 null bytes (`\x00`) appended to end of app.js, causing `SyntaxError: Invalid or unexpected token` which prevented the entire file from executing.

**Fix:** Stripped trailing null bytes: `content.replace(/\x00+$/, '')`

**Impact:** Total UI failure — no narrator loading, no chat, no Bio Builder.

---

### API-BUG-001 — Unguarded `RGBColor` in memoir_export.py

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Status** | Fixed |
| **File** | `server/code/api/routers/memoir_export.py` lines 82–84 |
| **Found During** | API startup failure |

**Repro Steps:**
1. Start API server without `python-docx` installed
2. API crashes with `NameError: name 'RGBColor' is not defined`

**Root Cause:** Module-level constants `_DARK_BROWN = RGBColor(0x3B, 0x2A, 0x1A)` etc. ran unconditionally, but `RGBColor` was only available when `python-docx` was installed (guarded by `_DOCX_AVAILABLE` flag at import time, but not at the constant definition).

**Fix:**
```python
if _DOCX_AVAILABLE:
    _DARK_BROWN = RGBColor(0x3B, 0x2A, 0x1A)
    _WARM_GREY  = RGBColor(0x5A, 0x55, 0x50)
    _GOLD       = RGBColor(0xAA, 0x88, 0x44)
else:
    _DARK_BROWN = _WARM_GREY = _GOLD = None
```

**Impact:** API server would not start at all, blocking all backend functionality.

---

## Open Bugs

None.

---

## Known Limitations (Not Bugs)

| ID | Description | Severity | Status |
|---|---|---|---|
| FT-LIMIT-001 | Draft data is session-only (no persistence across page reload) | Low | By design for v3 |
| FT-LIMIT-002 | No visual graph rendering (cards only, not tree layout) | Low | Future enhancement |
| FT-LIMIT-003 | Edge creation uses inline form, not drag-connect | Low | Future enhancement |
| LT-LIMIT-001 | Theme seeding limited to earlyMemories and laterYears questionnaire sections | Low | Expandable |
| LT-LIMIT-002 | No auto-connection between seeded nodes | Low | By design |
