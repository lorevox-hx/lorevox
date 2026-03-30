# Narrator Delete Cascade — Bug Log

Phase 2 · Lorevox v8.0 · 2026-03-29

---

## NDC-1 · Null byte corruption in db.py

**Severity:** Critical (would cause SyntaxError on import)
**File:** `server/code/api/db.py`
**Symptom:** File contained 1,955 null bytes (`\x00`) scattered throughout. This caused `grep` and other tools to treat the file as binary, and would cause Python import errors if the null bytes appeared within active code regions.
**Root cause:** Same file corruption pattern as `state.js` (NS-1) and `api.js` — likely from a prior write operation that didn't truncate properly.
**Fix:** `perl -i -pe 's/\x00//g' server/code/api/db.py`
**Status:** Fixed

---

## NDC-2 · Null byte corruption in api.js

**Severity:** Low (file still parsed correctly because null bytes were after content)
**File:** `ui/js/api.js`
**Symptom:** Binary file matches from grep. Null bytes present but not in code-critical positions.
**Fix:** `perl -i -pe 's/\x00//g' ui/js/api.js`
**Status:** Fixed

---

## NDC-3 · Phase 1 undo creates duplicate narrators

**Severity:** High (data corruption)
**File:** `ui/js/app.js` (Phase 1 `lvxUndoDeleteNarrator`)
**Symptom:** The Phase 1 undo function called `POST /api/people` to re-create the narrator. Since the backend DELETE never actually executed (405), this created a second narrator with the same name/DOB/POB but a different UUID.
**Root cause:** Phase 1 used a local-only fake delete. The original narrator was never removed from the database. The undo POST created a duplicate.
**Fix:** Phase 2 replaces the POST-based undo with `POST /api/people/{pid}/restore`, which clears the soft-delete markers on the original record. No new rows are created.
**Status:** Fixed (requires API server restart for backend restore to work)

---

## NDC-4 · API server does not auto-reload

**Severity:** Low (development workflow issue)
**File:** `launchers/run_gpu_8000.sh`
**Symptom:** After modifying `db.py` and `people.py`, the running API server continues serving old code. New endpoints return 404.
**Root cause:** The uvicorn launch command does not include `--reload` flag: `python -m uvicorn code.api.main:app --host "$HOST" --port "$PORT"`
**Workaround:** User must restart manually via `reload_api.bat` (visible Windows Terminal tab) or `bash scripts/restart_api.sh`
**Status:** Documented (not a code fix — development environment choice)

---

## NDC-5 · `lvxStageDeleteNarrator` was synchronous (Phase 1)

**Severity:** Medium (inventory not available in delete dialog)
**File:** `ui/js/app.js`
**Symptom:** The delete dialog opened without dependency counts because the staging function didn't fetch inventory from the backend.
**Root cause:** Phase 1 `lvxStageDeleteNarrator()` was synchronous. There was no backend inventory endpoint and no async fetch.
**Fix:** Phase 2 makes the function `async` and adds `await lvxGetDeleteInventory(pid)` before opening the dialog.
**Status:** Fixed

---

## No additional bugs found during Phase 2 implementation.

The Python code passed `ast.parse()` validation. The frontend code loaded without console errors. All graceful degradation paths work correctly when the backend is unavailable.
