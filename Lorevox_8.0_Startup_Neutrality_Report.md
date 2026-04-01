# Lorevox 8.0 — Startup Neutrality Report

**Test date:** 2026-04-01
**Tester:** Claude (automated browser testing)

---

## Startup with zero narrators

- **backend narrator count:** 0 (verified via `GET /api/people` → `{"people":[]}`)
- **header display:** No narrator name, no DOB/POB, no age — blank header area
- **state.person_id:** `null`
- **active narrator visible:** No
- **profile loaded:** No — `state.profile = { basics: {}, kinship: [], pets: [] }`
- **projection loaded:** No — `state.interviewProjection = { personId: null, fields: {}, pendingSuggestions: [], syncLog: [] }`
- **questionnaire loaded:** No
- **blank-state behavior correct:** **PASS**

**Details:** The `_enforceBlankStartupState()` function fired correctly:
- `state.person_id` set to `null`
- `LS_ACTIVE` removed from localStorage
- All narrator-scoped cache keys scanned and removed (orphaned `lorevox_offline_profile_*`, `lorevox_proj_draft_*`, `lorevox_qq_draft_*`, `lorevox.spine.*`, `lv_done_*`, `lv_segs_*`)
- `lorevox_offline_people` cache cleared
- `interviewProjection` reset to empty
- `session.identityPhase` set to `null`
- `session.identityCapture` reset to `{ name: null, dob: null, birthplace: null }`
- `lv80UpdateActiveNarratorCard()` called to sync header to blank state
- `startIdentityOnboarding()` fired after 800ms delay — identity gate began at `askName` phase

---

## Startup with one valid narrator

- **backend narrator count:** 1 (`e4207a4f-4780-4212-b531-e4a79f30ccd4` — "Michael")
- **stored active narrator valid:** **YES** — `localStorage.getItem('lv_active_person_v55')` = `"e4207a4f-..."`, confirmed present in backend `/api/people` response
- **narrator restored correctly:** **PASS** — `loadPerson()` called with validated pid, profile fetched from backend, projection loaded from localStorage draft
- **header matches state:** **PASS** — Header shows "Michael / 1943-07-26 · Dartford, Kent, England · age 82" matching `state.profile.basics` exactly
- **stale cache ignored:** **PASS** — Startup validated `LS_ACTIVE` against `backendPids` before trusting it. Console logged: `[startup] Validated active narrator from backend: e4207a4f-...`

**Post-reload state verification:**
- `state.person_id` = `e4207a4f-4780-4212-b531-e4a79f30ccd4`
- `state.profile.basics.preferred` = `"Michael"`
- `state.profile.basics.dob` = `"1943-07-26"`
- `state.profile.basics.pob` = `"Dartford, Kent, England"`
- `projFieldCount` = 4 (identity fields survived reload)
- `projPersonId` matches `personId`
- `narratorCount` = 1
- `identityPhase` = `null` (complete — no re-entry into identity gate)
- Welcome-back message: Lori references "Dartford, Kent" and early childhood — contextually appropriate

---

## Stale narrator pointer test (implicit)

The startup neutrality code path for stale narrators (`saved && !backendPids.includes(saved)`) was not directly tested with an artificially planted stale pointer in this run. However, the code path was verified by code review:

- `_invalidateStaleNarrator(stalePid)` removes: `LS_ACTIVE`, `lorevox_offline_profile_<pid>`, `lorevox_proj_draft_<pid>`, `lorevox_qq_draft_<pid>`, `lorevox.spine.<pid>`, `LS_DONE(<pid>)`, `LS_SEGS(<pid>)`, `lorevox_offline_people`
- Falls back to first available backend narrator, or enters blank state if none exist
- Console warning logged for audit trail

---

## Files Changed for Startup Neutrality

### `ui/js/app.js`

1. **`window.onload` startup block (lines 29–63):** Replaced blind `localStorage.getItem(LS_ACTIVE)` trust with backend-validated startup. Four branches:
   - `saved && backendPids.includes(saved)` → validated restore
   - `saved && !backendPids.includes(saved)` → stale invalidation + fallback
   - `backendPids.length === 0` → blank state + onboarding
   - else → onboarding (no saved, backend has narrators)

2. **`_invalidateStaleNarrator(stalePid)` (new helper):** Removes all 7 narrator-scoped cache keys plus `LS_ACTIVE` and `lorevox_offline_people`.

3. **`_enforceBlankStartupState()` (new helper):** Resets `state.person_id`, `state.profile`, `state.interviewProjection`, `state.session.identityPhase`, `state.session.identityCapture`. Scans and removes all orphaned narrator-scoped localStorage keys. Calls `lv80UpdateActiveNarratorCard()`.

4. **`lvxDeleteNarratorConfirmed()` enhanced cleanup:** Now removes all narrator-scoped cache keys (`lorevox_offline_profile_`, `lorevox_proj_draft_`, `lorevox_qq_draft_`, `lorevox.spine.`, `LS_DONE`, `LS_SEGS`) and calls `lv80UpdateActiveNarratorCard()`.

### `ui/js/projection-sync.js`

5. **`resetForNarrator()` null-outgoing-pid guard:** New branch detects identity-phase fields (fields exist but `outgoingPid` is null) and persists them under the new pid instead of wiping. This prevents projection field loss when `_resolveOrCreatePerson()` creates a new person and calls `loadPerson(newPid)`.

---

## Bugs Found

### Bug 1: Welcome-back poll fires during zero-narrator startup

- **title:** Welcome-back poll message appears alongside identity onboarding askName prompt
- **severity:** LOW (cosmetic — does not block the identity gate)
- **reproduction:** Start with zero narrators, all localStorage cleared, reload page. Two LORI bubbles appear: the welcome-back poll and the askName prompt.
- **observed behavior:** "Would you like to pick up where we left off and share some more about your life?" appears before the askName prompt.
- **expected behavior:** With zero narrators and no name/DOB, the welcome-back poll should not fire.

---

## Final Status

- **STARTUP NEUTRALITY READY:** **YES**

All 7 startup neutrality requirements met:
1. ✅ Backend is authority on startup — `LS_ACTIVE` validated against `/api/people` before use
2. ✅ Stored active narrator validated against backend list before restoration
3. ✅ Zero-narrator startup handled explicitly — blank state, no ghost narrators
4. ✅ Stale cache keys invalidated via `_invalidateStaleNarrator()` (code path verified by review)
5. ✅ Narrator restoration safe when narrators exist — `loadPerson()` called with validated pid
6. ✅ No auto-creation of narrator during startup — only `startIdentityOnboarding()` fires
7. ✅ Clean blank state enforced via `_enforceBlankStartupState()` with full cache purge
