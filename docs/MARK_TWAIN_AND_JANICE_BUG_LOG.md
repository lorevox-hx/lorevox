# Mark Twain & Janice — Bug Log

## Bugs Found & Fixed During This Work Order

### BUG-1: Bio Builder Popover Render Guard vs Popover API

**Severity:** Medium
**Status:** WORKAROUND (not a code fix)

**Description:** `bio-builder.js` line 1244 checks `host.hasAttribute("open")` to decide whether to render. However, the Popover API uses the `:popover-open` CSS pseudo-class and does NOT set an HTML `open` attribute. This means programmatic calls to `LorevoxBioBuilder.render()` silently return without rendering unless `setAttribute("open", "")` is called first.

**Root Cause:** The render guard was written for a `<details>`/`<dialog>` pattern that uses the `open` attribute, but the lori8.0 UI uses the newer Popover API (`popover` attribute + `showPopover()`).

**Workaround:** Manually call `document.getElementById("bioBuilderPopover").setAttribute("open", "")` before calling `render()`.

**Recommended Fix:** Change the guard to also check `:popover-open`:
```javascript
if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;
```

**Affected file:** `ui/js/bio-builder.js` line 1244

---

### BUG-2: Life Map Popover Same Issue

**Severity:** Medium
**Status:** WORKAROUND (not a code fix)

**Description:** `life-map.js` line 621 checks `popover && !popover.hasAttribute("open")` on the `#lifeMapPopover` element. Same Popover API mismatch as BUG-1.

**Workaround:** Manually call `document.getElementById("lifeMapPopover").setAttribute("open", "")` before calling `LorevoxLifeMap.refresh()`.

**Recommended Fix:** Same pattern — check both `open` attribute and `:popover-open` pseudo-class.

**Affected file:** `ui/js/life-map.js` line 621

---

### BUG-3: API Lacks DELETE Endpoint for People

**Severity:** Low (operational)
**Status:** KNOWN LIMITATION

**Description:** `DELETE /api/people/{id}` returns 405 Method Not Allowed. There is no way to remove stale test narrators from the database via the API.

**Workaround:** Implemented `lorevox_draft_pids` localStorage filter in both `renderPeople()` (app.js) and `lv80LoadPeople()` (lori8.0.html) to hide stale entries from the dropdown.

**Recommended Fix:** Add a DELETE endpoint to the FastAPI people router.

---

### BUG-4: Family Tree Card Titles Show "Unknown" Without displayName

**Severity:** Medium
**Status:** FIXED (data-level)

**Description:** The FT card renderer at bio-builder.js line 1890-1895 uses `node.displayName` for the card title. If only `node.name` is present, the card shows "Unknown". This is a data contract issue — the FT node schema expects `displayName` but external seed data may only provide `name`.

**Fix Applied:** All seeded FT nodes include both `name` and `displayName` fields.

**Recommended Fix:** Add fallback in the renderer: `node.displayName || node.name || "Unknown"`.

**Affected file:** `ui/js/bio-builder.js` lines 1890-1895

---

### BUG-5: Life Threads Edge Renderer Crashes on Missing `relationship` Field

**Severity:** High
**Status:** FIXED (data-level)

**Description:** The LT edge renderer at bio-builder.js line 2711 calls `e.relationship.replace(/_/g, ' ')`. If edges use `e.type` or `e.label` instead of `e.relationship`, this crashes silently and the entire LT tab fails to render.

**Fix Applied:** All seeded LT edges include `relationship` and `id` fields.

**Recommended Fix:** Add defensive access: `(e.relationship || e.type || e.label || "connected_to").replace(/_/g, ' ')`.

**Affected file:** `ui/js/bio-builder.js` line 2711

---

### BUG-6: BB Questionnaire Field Name Mismatch

**Severity:** Low
**Status:** KNOWN LIMITATION

**Description:** The questionnaire sections expect specific field IDs (e.g., `fatherName`, `motherName`) but the section-filled counter only recognizes exact matches. Seeded data with slightly different field names (e.g., from API profile format) may not be counted, causing sections to show "Empty" even when data exists in `state.bioBuilder.questionnaireDraftsByPerson`.

**Impact:** Parents section shows "Empty" for Mark Twain even though parent data is present in the profile. Personal Information correctly shows "6/7 filled".

**Workaround:** None needed — users will fill sections interactively through the UI.

---

## Bugs NOT Found (Regression Checks)

| Area | Check | Result |
|------|-------|--------|
| Narrator bleed | Mark Twain data appearing in Janice | No bleed |
| Narrator bleed | Janice data appearing in Mark Twain | No bleed |
| Life Map scaffold | Renders for both narrators | Working |
| Life Map DOB calculation | Correct year ranges for both 1835 and 1939 | Working |
| localStorage persistence | FT/LT drafts survive page navigation | Working |
| Dropdown filtering | Only Mark Twain and Janice visible | Working |
| API offline fallback | Profile loads from cache when API slow | Working |

## Is Lorevox Ready for Kent?

**Conditionally YES.** The core visual pipeline works: dropdown selection, profile loading, Bio Builder (all 6 tabs), Life Map scaffold, and Peek at Memoir all render correctly for both Mark Twain and Janice. Lori addresses narrators by name and references their profile data.

**Conditions for production readiness:**

1. **API server must be running** — the offline fallback handles brief outages but the primary data path is API-driven
2. **BUG-1 and BUG-2** (popover open attribute) should be fixed in bio-builder.js and life-map.js for reliable programmatic rendering
3. **BUG-5** (LT edge crash) should be fixed with defensive access to prevent silent failures when edge data varies
4. **15 stale test narrators** in the database should be cleaned up when a DELETE endpoint is available
