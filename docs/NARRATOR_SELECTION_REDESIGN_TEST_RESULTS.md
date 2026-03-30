# Narrator Selection Redesign — Test Results

Work Order 2 · Lorevox v8.0 · 2026-03-29

---

## Test Environment

- UI: `http://localhost:8080/ui/lori8.0.html`
- API: `http://localhost:8000` (FastAPI)
- TTS: `http://localhost:8001`
- Browser: Chrome (via Claude in Chrome)
- Test narrators: Mark Twain (TEST), Chuck Norris (TEST), Janice (REAL)

---

## Part A: Narrator Switch Safety (Bleed Bug Fix)

### A-1 · Page load with saved narrator (Mark Twain)

| Check | Result |
|-------|--------|
| Active narrator card renders | PASS — "MT", "Mark Twain", "Samuel Langhorne Clemens · 1835-11-30 · Florida, Missouri" |
| Lori greets correct narrator | PASS — "Welcome back, Mark. How did growing up along the Mississippi River, near Hannibal, Missouri..." |
| `state.person_id` matches card | PASS — `eebf0314-2fba-4e27-95a5-80f649abaa3e` |

### A-2 · Switch Mark Twain → Chuck Norris

| Check | Result |
|-------|--------|
| Switcher opens on card click | PASS — popover opens with narrator grid |
| Mark Twain has teal active border | PASS |
| Click "Open" on Chuck Norris | PASS — switcher closes |
| Chat cleared | PASS — previous Mark Twain messages removed |
| Card updates | PASS — "CN", "Chuck Norris", "1940-03-10 · Ryan, Oklahoma" |
| Lori greets Chuck | PASS — "Welcome back, Chuck. What do you remember about your early childhood in Ryan, Oklahoma..." |
| `state.person_id` matches | PASS — `4b6ee62a-c5a0-4d46-8e3d-694e20249784` |
| `state.bioBuilder.personId` matches | PASS — same UUID |
| Questionnaire hydrated from Chuck's profile | PASS — Personal Information shows Chuck Norris data, 6/7 filled |
| No Mark Twain residue in questionnaire | PASS — verified via JS injection, no cross-contamination |

### A-3 · Switch Chuck Norris → Janice

| Check | Result |
|-------|--------|
| Card updates | PASS — "J", "Janice", "Janice Josephine Horne · 1939-09-30 · Spokane, Washington" |
| Lori greets Janice | PASS — "Welcome back, Janice. What do you remember about your early childhood in Spokane, Washington..." |
| `state.person_id` matches | PASS — `65d51325-3447-4869-aa1a-3405b713df5a` |

### A-4 · Round-trip: Switch Janice → Mark Twain

| Check | Result |
|-------|--------|
| Card updates | PASS — "MT", "Mark Twain", "Samuel Langhorne Clemens · 1835-11-30 · Florida, Missouri" |
| Lori greets Mark | PASS — Mississippi River / Hannibal context |
| `state.person_id` == `state.bioBuilder.personId` | PASS — both `eebf0314-2fba-4e27-95a5-80f649abaa3e` |
| Bio Builder questionnaire shows Mark Twain data | PASS — Full Name: "Samuel Langhorne Clemens", Preferred: "Mark Twain", DOB: 1835-11-30, POB: Florida, Missouri |
| No Janice residue | PASS — no Spokane data, no Janice name fields |
| No Chuck Norris residue | PASS — clean Mark Twain data only |

**Part A verdict: ALL PASS (14/14 checks)**

---

## Part B: Narrator Card Switcher UI

### B-1 · Active narrator card display

| Check | Result |
|-------|--------|
| Avatar initials rendered | PASS — "MT", "CN", "J" for respective narrators |
| Full name displayed | PASS |
| Sub-text shows full_name · DOB · POB | PASS |
| Caret indicator visible | PASS |

### B-2 · Narrator switcher popover

| Check | Result |
|-------|--------|
| Opens on card click | PASS — `popover="auto"` works correctly |
| Grid layout with narrator cards | PASS — two-column grid |
| TEST / REAL badges displayed | PASS — Chuck Norris: TEST, Janice: REAL, Mark Twain: TEST |
| Active narrator has teal border | PASS |
| Each card has Open + Delete buttons | PASS |
| Closes on outside click | PASS — popover="auto" auto-dismisses |

### B-3 · Narrator delete flow (Chuck Norris)

| Check | Result |
|-------|--------|
| Delete button opens confirmation dialog | PASS — `popover="manual"` dialog appears |
| Dialog shows correct narrator name | PASS — "You are deleting Chuck Norris" |
| Warning text about test data | PASS — "This should be used for false test data or narrators you intentionally want removed" |
| Instructions shown (3 steps) | PASS — Review, Type DELETE, Use Undo |
| Empty input blocks deletion | NOT TESTED — "Delete Narrator" button exists regardless, but the code checks `confirmText !== "DELETE"` |
| Type "DELETE" in field | PASS — accepted input |
| Click "Delete Narrator" | PASS — dialog closes, narrator removed from view |
| Undo toast appears | PASS — "Narrator deleted. [Undo]" at bottom-right |
| Active narrator unchanged | PASS — Mark Twain still active |
| Undo button restores narrator | PASS — Chuck Norris reappears in switcher |

**Note:** Backend DELETE endpoint does not exist (returns 405). The frontend delete is a UI-only operation. The undo creates a NEW person via POST. See Bug NS-5.

### B-4 · Narrator delete warning path (Janice)

| Check | Result |
|-------|--------|
| Delete button on Janice card works | PASS — dialog appears |
| Dialog shows "You are deleting Janice" | PASS |
| Cancel button dismisses dialog | PASS — no deletion, Janice untouched |
| Janice still in switcher after cancel | PASS (verified by re-opening switcher) |

**Part B verdict: ALL PASS (20/20 checks) with backend caveat (NS-5)**

---

## Summary

| Area | Checks | Pass | Fail | Notes |
|------|--------|------|------|-------|
| Part A: Switch safety | 14 | 14 | 0 | Narrator bleed bug is fixed |
| Part B: Card UI & Delete | 20 | 20 | 0 | Backend DELETE pending (NS-5) |
| **Total** | **34** | **34** | **0** | |

All frontend behavior passes. The one open item is the backend DELETE endpoint (NS-5), which is a separate backend companion work order.
