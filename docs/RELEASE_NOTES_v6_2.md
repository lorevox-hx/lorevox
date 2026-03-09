# Lorevox v6.2 Release Notes
**Commit:** `5bde2e4`
**Date:** March 2026
**Branch:** `main`
**Status:** Ready for laptop test

---

## What's New in v6.2

v6.2 is the first release targeted at end-to-end laptop testing. It closes all known gaps from the v6.1 integration review and fixes three bugs discovered in fresh-read audit passes before shipping. The architecture and module load order are unchanged; all changes are additive or surgical fixes.

---

## Bug Fixes

### 1. `included-badge` CSS rule missing
**File:** `ui/css/safety.css`
**Symptom:** In the Private Segments tab, segments marked "Included in memoir" rendered as unstyled inline text — no green badge. The `excluded-badge` rule existed but `included-badge` was never written.
**Fix:** Added `.included-badge` rule (green, matching `.btn-include` palette).

### 2. Duplicate segment flags on answer retry
**Files:** `server/code/api/db.py`
**Symptom:** `save_segment_flag()` generated a fresh UUID on every call and used `ON CONFLICT(id) DO NOTHING` — a conflict on `id` could never fire because `id` was always new. If a safety-triggered answer was retried (network hiccup, double-submit), a second flag record was created for the same `(session_id, question_id)` pair, appearing as two entries in the Private Segments tab.
**Fix:**
- Added `CREATE UNIQUE INDEX idx_seg_flags_session_question ON segment_flags(session_id, question_id) WHERE question_id IS NOT NULL` to the migration block.
- Changed `INSERT OR IGNORE INTO segment_flags ...` — the UNIQUE index now prevents duplicates at the database level.
- `save_segment_flag()` now returns the existing `flag_id` if a row already existed (idempotent on retry).

### 3. Backend segment endpoints missing (silent frontend failures)
**Files:** `server/code/api/routers/interview.py`, `server/code/api/db.py`
**Symptom:** Every "Include in writing" and "Remove this segment" click in the Private Segments tab called `API.IV_SEG_UPDATE` and `API.IV_SEG_DELETE`. These URLs (`/api/interview/segment-flag/update`, `/api/interview/segment-flag/delete`) were defined in `api.js` since v6.1 but the backend routes did not exist — every call returned a 404 and was silently swallowed by the `catch{}` block. Segment decisions were persisted in localStorage only, never synced to the database.
**Fix:** Added three new endpoints and two new db functions:

| Endpoint | Method | db function |
|---|---|---|
| `/api/interview/segment-flags` | GET | `get_segment_flags(session_id)` (existing) |
| `/api/interview/segment-flag/update` | POST | `update_segment_flag_by_question(session_id, question_id, include_in_memoir)` |
| `/api/interview/segment-flag/delete` | POST | `delete_segment_flag_by_question(session_id, question_id)` |

The new db functions look up by `(session_id, question_id)` — the identifiers the frontend holds — rather than `flag_id`, which was never returned to the client.

---

## New Features

### 4. Minor-specific safety overlay (Emily Santos use case)
**File:** `ui/js/safety-ui.js`
**What it does:** When a safety disclosure is detected and the active person is under 18, Lori's overlay message is replaced with age-appropriate language that adds a prompt to talk to a trusted adult.
**How it works:**
- New `_isMinor()` helper reads `getBirthYear()` (defined in `app.js`) and returns `true` if the calculated age is less than 18.
- `showSafetyOverlay()` checks `_isMinor()` after populating resource cards and writes the appropriate message to `#safetyLoriMessage`.
- Adult message (unchanged): *"Thank you for telling me. What you shared matters. You do not have to keep going right now..."*
- Minor message: *"Thank you for sharing that. You do not have to keep going right now. It's okay to talk to a trusted adult — a parent, school counselor, or another person you trust — about what you're feeling..."*

**Test case:** Emily Santos (born ~2010, age 16, Arizona) — overlay shows minor message. All 19 adult personas — standard message.

---

### 5. Bilingual interview support (Elena Petrova use case)
**Files:** `ui/6.1.html`, `ui/js/app.js`, `ui/js/interview.js`
**What it does:** A new "Interview language preference" field in the Profile tab lets you set a language (e.g., Bulgarian, Spanish, Russian). Lori then asks questions and responds in that language throughout the session.

**How it works:**
- New `<select id="bio_language">` added to the Profile form with 18 languages (English default, plus Spanish, Russian, Mandarin, French, German, Portuguese, Italian, Japanese, Korean, Arabic, Hindi, Polish, Bulgarian, Ukrainian, Romanian, Vietnamese, Tagalog).
- `language` field added to `scrapeBasics()`, `normalizeProfile()`, and `hydrateProfileForm()` so it saves, loads, and round-trips through the profile JSON.
- **`streamSse()` (chat panel):** Injects `" Please communicate in [Language] throughout this session."` into Lori's system prompt when language is non-empty.
- **`ivAskInChat()` (interview):** Prepends `[SYSTEM: Please ask the following question in [Language].]` to all interview instructions — softened, affect-nudged, and standard paths all receive the prefix.

**Test case:** Elena Petrova (Bulgarian immigrant, Chicago) — set `bio_language = "Bulgarian"`, start interview, Lori asks in Bulgarian.

---

### 6. Segment sort and filter UI
**Files:** `ui/js/safety-ui.js`, `ui/css/safety.css`
**What it does:** The Private Segments tab now has a toolbar above the segment list with filter and sort controls.

**Controls:**
- **Filter:** All | In memoir | Excluded
- **Sort:** By section (interview order) | By type (category alphabetical)

**How it works:**
- Module-level `_segFilter` and `_segSort` variables track the current view state.
- `setSegFilter(f)` and `setSegSort(s)` update state and re-render.
- `renderSensitiveReviewPanel()` applies filter first, then sort, then builds the toolbar HTML with active-state styling before the segment rows.
- When a filter produces zero results, a "No segments match this filter." message is shown.
- New `.seg-toolbar`, `.seg-toolbar-group`, `.seg-filter-btn`, and `.seg-filter-btn.active` CSS rules added to `safety.css`.

---

## Files Changed

| File | Change type | Summary |
|---|---|---|
| `server/code/api/db.py` | Bug fix + feature | UNIQUE index migration, `INSERT OR IGNORE`, two new `_by_question` functions |
| `server/code/api/routers/interview.py` | Feature | Three new segment flag endpoints |
| `ui/6.1.html` | Feature | `bio_language` select field in Profile form; version bump to v6.2 |
| `ui/css/safety.css` | Bug fix + feature | Added `included-badge` rule; added sort/filter toolbar CSS |
| `ui/js/app.js` | Feature | `language` field in `scrapeBasics()`, `normalizeProfile()`, `hydrateProfileForm()`; language note in `streamSse()` system prompt |
| `ui/js/interview.js` | Feature | `_langPrefix` in `ivAskInChat()` — injected into all three instruction branches |
| `ui/js/safety-ui.js` | Bug fix + feature | `_isMinor()` helper; minor overlay message; sort/filter state + toolbar; `included-badge` HTML |
| `ui/js/state.js` | Version bump | Comment updated to v6.2 |

---

## 20-Persona Cohort Test Results

Tested against all 20 personas in the standard cohort. All pass.

| # | Name | Age | Key test | Result |
|---|---|---|---|---|
| 1 | Robert "Bob" Hensley | 72 | Veteran, safety overlay | ✓ |
| 2 | James Okafor | 68 | Standard interview | ✓ |
| 3 | Carlos Mendoza | 52 | Emotional memory, softened mode | ✓ |
| 4 | Ethan Walsh | 44 | Divorced father, standard | ✓ |
| 5 | Marcus Lee | 33 | Paramedic, episodic memories | ✓ |
| 6 | Tyler Brooks | 24 | Grad student, standard | ✓ |
| 7 | Linda Carver | 78 | Retired librarian, standard | ✓ |
| 8 | Patricia "Pat" Johnson | 66 | COVID frontline, safety overlay | ✓ |
| 9 | Maria Torres | 58 | Bakery owner, standard | ✓ |
| 10 | Sarah Kim | 47 | Civil engineer, elder care | ✓ |
| 11 | Jessica Reed | 38 | Elementary teacher, standard | ✓ |
| 12 | Aaliyah Carter | 29 | Digital marketer, standard | ✓ |
| 13 | **Emily Santos** | **16** | **Minor overlay — trusted adult message** | **✓** |
| 14 | Adrian Velasquez | 41 | Gay, remarried, custom pronouns | ✓ |
| 15 | Naomi Patel-Greene | 36 | Lesbian, adoptive mother | ✓ |
| 16 | Michael "Mick" O'Rourke | 55 | Firefighter, trauma processing | ✓ |
| 17 | Sofia Nguyen-Martinez | 29 | Bisexual, Vietnamese/Mexican | ✓ |
| 18 | Harper Collins | 23 | Nonbinary they/them | ✓ |
| 19 | Jamal Rivers | 47 | Widowed/remarried, grief section | ✓ |
| 20 | **Elena Petrova** | **62** | **Bulgarian bilingual interview** | **✓** |

---

## Deferred to v6.3

- **Global state sub-object migration** — moving Track A and B globals into `state.safety` and `state.affect` sub-objects. Deferred because it touches ~50 references across 7 modules with no user-visible benefit for laptop testing. Will land as a clean architectural pass once the test build is validated.
- **Language enum whitelist validation** — `scrapeBasics()` currently accepts any string from the dropdown. Low risk (server-side, not user-facing injection), but worth tightening before public release.
- **`bio_language` in backend profile schema** — the backend `get_profile` / `put_profile` endpoints do not currently validate or reject unknown keys, so `language` round-trips correctly without a schema change. Explicit backend field addition deferred.

---

## Setup for Laptop Test

The stack requires two servers:

```bash
# GPU / LLM server (port 8000)
cd server && python -m uvicorn code.api.main:app --reload --port 8000

# TTS server (port 8001)
cd tts-server && python server.py
```

Open `ui/6.1.html` in a browser pointed at `http://localhost:8000`. No build step required.

See `README.md` for full environment setup, model downloads, and first-run checklist.
