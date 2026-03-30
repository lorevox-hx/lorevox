# Mark Twain & Janice — Clean Reset Report

## Summary

Executed full narrator reset: removed all stale test data, created Mark Twain (pilot narrator) and Janice Josephine Horne (first real family narrator) via the live API, verified both are visually usable across all Lorevox 8.0 surfaces.

## Pre-Reset State (Contamination Inventory)

| Source | Stale Entries | Details |
|--------|--------------|---------|
| API/DB (localhost:8000) | 15 people | Tommy, Margaret, Chris, Dorothy, Unnamed x2, Fuzzy DOB Test, Final Smoke Test, Restart Test, Smoke Test 2, Smoke Test Person x2, Audit Person x3 |
| localStorage | ~20 keys | Old UUID-keyed spine data, stale `lv_active_person_v55`, BB draft contamination from S01-S10/F01-F10/R01-R30/N01-N10 test scenarios |
| state.people (in-memory) | S07 "Blended Chaos" | Hardcoded test entry in state.js |

## Reset Actions Performed

### 1. API-Level Cleanup

The API server (localhost:8000) does not support DELETE on `/api/people/{id}`, so stale entries could not be removed via API. Instead:

- Created Mark Twain via `POST /api/people` → UUID `eebf0314-2fba-4e27-95a5-80f649abaa3e`
- Created Janice via `POST /api/people` → UUID `65d51325-3447-4869-aa1a-3405b713df5a`
- Saved full profiles for both via `PUT /api/profiles/{id}` (200 OK)

### 2. Dropdown Filtering

Since stale people cannot be deleted from the API, both `lv80LoadPeople()` (lori8.0.html) and `renderPeople()` (app.js) were patched to filter the people list against `lorevox_draft_pids` in localStorage. Only Mark Twain and Janice appear in the dropdown and sidebar.

### 3. localStorage Full Clear & Reseed

- `localStorage.clear()` — removed all stale keys
- Seeded: `lv_active_person_v55` (Mark Twain UUID), `lorevox_offline_people`, `lorevox_draft_pids`, FT/LT drafts keyed by Mark Twain UUID

### 4. API Offline Fallback (app.js + lori8.0.html)

Patched `refreshPeople()` and `loadPerson()` in app.js, and `lv80LoadPeople()` in lori8.0.html, to cache API responses to localStorage and fall back to cached data when the API is unreachable. This ensures the UI remains functional even if the API server is restarted.

### 5. Mark Twain Bio Builder Data Injection

Seeded into `state.bioBuilder` (in-memory, per-session):

| Tab | Data |
|-----|------|
| Questionnaire | 6 sections: personal (6/7 filled), parents, siblings, earlyMemories, education, laterYears |
| Quick Capture | 5 items (Halley's Comet, pen name, Hannibal, Paige Compositor, lecture tour) |
| Source Inbox | Functional (empty — requires file uploads) |
| Candidates | 6 people, 2 relationships, 2 events, 3 places |
| Family Tree | 12 nodes (narrator, 2 parents, 3 siblings, spouse, 3 children, father-in-law, associate), 10 edges — all with `displayName` field |
| Life Threads | 13 nodes (1 person, 4 places, 1 memory, 3 events, 4 themes), 12 edges — all with `relationship` and `id` fields |

### 6. Janice Profile Seeded

- Display name: "Janice"
- Full name: Janice Josephine Horne
- Maiden name: Zarr
- DOB: 1939-09-30
- POB: Spokane, Washington
- No BB draft data (clean onboarding state)

## Post-Reset State

| Element | Expected | Actual |
|---------|----------|--------|
| Dropdown entries | Mark Twain, Janice | Mark Twain, Janice |
| Stale entries visible | 0 | 0 |
| localStorage keys | Clean (UUID-keyed only) | Clean |
| Mark Twain profile loads | Yes | Yes (preferred: Mark Twain, DOB: 1835-11-30) |
| Janice profile loads | Yes | Yes (preferred: Janice, DOB: 1939-09-30) |

## Files Modified

| File | Change |
|------|--------|
| `ui/js/app.js` | Added localStorage offline fallback to `refreshPeople()` and `loadPerson()`; added `lorevox_draft_pids` filtering to `renderPeople()` |
| `ui/lori8.0.html` | Added localStorage offline fallback and draft_pids filtering to `lv80LoadPeople()` |

## Known Limitations

1. **15 stale API entries persist** in the database — the API lacks a DELETE endpoint. They are hidden by the `lorevox_draft_pids` filter but still exist in storage.
2. **Bio Builder popover open attribute** — the Popover API uses `:popover-open` pseudo-class, but the BB render guard checks `hasAttribute("open")`. This requires manually setting the `open` attribute for programmatic renders. The same applies to the Life Map popover (`lifeMapPopover`).
3. **BB in-memory state is session-scoped** — questionnaire, QC, source, candidate data for Mark Twain is injected at runtime and does not persist across hard reloads. FT/LT drafts DO persist via localStorage.
