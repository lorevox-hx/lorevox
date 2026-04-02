# Narrator Selection Redesign — Bug Log

Work Order 2 · Lorevox v8.0 · 2026-03-29

---

## NS-1 · Pre-existing null byte corruption in state.js

**Severity:** Critical (blocked all JS execution)
**File:** `ui/js/state.js`
**Symptom:** `SyntaxError: Invalid or unexpected token` at state.js line 221. The `state` variable was never initialized, breaking the entire application.
**Root cause:** A massive block of `\x00` null bytes appended after the final line of state.js, likely from a prior file write that didn't truncate properly.
**Fix:** `perl -i -pe 's/\x00//g' ui/js/state.js`
**Status:** Fixed

---

## NS-2 · ReferenceError: `ui` is not defined in `_onNarratorSwitch`

**Severity:** High (blocked narrator switching)
**File:** `ui/js/bio-builder.js`, line ~260
**Symptom:** `ReferenceError: ui is not defined` thrown when switching narrators, preventing the switch from completing.
**Root cause:** The work order patch included `if (ui && ui.activeSectionId) ui.activeSectionId = null;` and a similar `ui.activeTab` check. However, `ui` is not a declared variable in the bio-builder IIFE scope. In JavaScript, using an undeclared variable with `&&` does NOT prevent the ReferenceError — `typeof ui !== "undefined"` would be needed, but simpler to remove.
**Fix:** Removed both `ui` reference lines from `_onNarratorSwitch()`.
**Status:** Fixed

---

## NS-3 · Narrator card shows "Loading..." on page load

**Severity:** Medium (cosmetic, resolves after a few seconds)
**File:** `ui/lori8.0.html`
**Symptom:** Active narrator card displayed "Loading..." or "Choose a narrator" at page load, even for returning users with a saved active person.
**Root cause:** `lv80UpdateActiveNarratorCard()` was called from `lv80LoadPeople()` which runs during `refreshPeople()` in `window.onload`. But `loadPerson(saved)` runs fire-and-forget from `window.onload`, and `state.profile.basics` isn't populated yet when the card tries to render.
**Fix:** Added `lv80UpdateActiveNarratorCard()` call inside the existing init poll callback that waits for `state.profile.basics.name` and `state.profile.basics.dob` to become non-null.
**Status:** Fixed

---

## NS-4 · TypeError in `onDobChange` — null element access

**Severity:** Medium (pre-existing, broke narrator switch chain)
**File:** `ui/js/app.js`, `onDobChange()` function
**Symptom:** `TypeError: Cannot set properties of null (setting 'textContent')` thrown during `loadPerson()`. This caused the `await loadPerson()` promise in `lvxSwitchNarratorSafe` to reject, preventing post-switch updates (card update, Bio Builder refresh) from running.
**Root cause:** `onDobChange()` references `genBadge` and `ageDisplay` DOM elements via `getElementById()`, but these elements do not exist in the lori8.0.html layout (they were in an older layout). The function proceeded to call `.classList` on null.
**Fix:** Added null guards: `if(gb) gb.classList.add(...)`, `if(ad) ad.classList.add(...)`, etc.
**Status:** Fixed

---

## NS-5 · Backend DELETE endpoint does not exist

**Severity:** Medium (frontend delete is a no-op on the server)
**File:** `server/code/api/routers/people.py`
**Symptom:** The frontend `lvxDeleteNarratorConfirmed()` calls `fetch(API.PERSON(pid), { method: "DELETE" })`. The backend returns 405 Method Not Allowed. The frontend catch block swallows the error. The narrator appears deleted in the UI switcher because the dialog closes, but `refreshPeople()` re-fetches the full list from the API — the person is still there.
**Root cause:** The people router only implements POST, GET, PATCH. No DELETE handler exists.
**Impact:** The undo button calls POST to re-create the person, which can create duplicates since the original was never deleted.
**Status:** Open — requires backend companion work order implementation

---

## NS-6 · Browser cache serving stale JS files

**Severity:** Low (development-only issue)
**Symptom:** After editing bio-builder.js and app.js, Ctrl+Shift+R on the main page did not bust the cache. Old code continued executing.
**Fix:** Navigate directly to the JS file URL (e.g., `http://localhost:8080/ui/js/bio-builder.js`), hard-refresh there, then return to the main page.
**Status:** Workaround applied (no production impact — production should use cache-busting query strings)
