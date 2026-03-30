# Narrator Delete Cascade — Implementation Report

Phase 2 · Lorevox v8.0 · 2026-03-29

---

## Overview

Phase 2 implements production-grade backend narrator deletion with dependency inventory, soft delete, restore, transactional hard delete, and audit logging. It also updates the frontend to use backend-authoritative delete/restore instead of the Phase 1 local-only fake approach.

## Files Modified

### 1. `server/code/api/db.py`

**Schema additions in `init_db()`:**
- Added 5 soft-delete columns to `people` table (idempotent migration via PRAGMA table_info check)
- Added `idx_people_active` index on `(is_deleted, updated_at)` for fast active-narrator queries
- Added `narrator_delete_audit` table (append-only audit log)

**Updated existing functions:**
- `list_people()` — Added `include_deleted` parameter (default `False`). When `False`, adds `WHERE is_deleted = 0` filter. When `True`, includes all people with soft-delete metadata columns.

**New functions:**

| Function | Purpose |
|----------|---------|
| `person_delete_inventory(person_id)` | Counts rows in all 8 dependent tables for a person. Returns counts dict, display_name, is_deleted status. |
| `_log_delete_audit(con, action, ...)` | Internal helper — appends audit row within caller's transaction. |
| `soft_delete_person(person_id, undo_minutes, ...)` | Sets `is_deleted=1`, `deleted_at`, `undo_expires_at`. Hides from active lists. Does NOT destroy data. |
| `restore_person(person_id, ...)` | Clears all soft-delete markers if within undo window. Validates `undo_expires_at` before allowing restore. |
| `hard_delete_person(person_id, ...)` | Transactional permanent delete. FK CASCADE handles dependent rows. Rollback on any error. |
| `list_delete_audit(limit)` | Returns recent audit log entries for diagnostics. |

**Fixed:** Null byte corruption (1,955 `\x00` bytes) — cleaned before making changes.

### 2. `server/code/api/routers/people.py`

**New endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/people/{person_id}/delete-inventory` | Returns dependency counts before deletion |
| DELETE | `/api/people/{person_id}?mode=soft` | Soft delete (default) — reversible within undo window |
| DELETE | `/api/people/{person_id}?mode=hard` | Hard delete — transactional, permanent, all-or-nothing |
| POST | `/api/people/{person_id}/restore` | Restore soft-deleted person within undo window |

**Updated endpoints:**
- `GET /api/people` — Now accepts `include_deleted` query parameter (default `false`)

**Error handling:**
- 404 for unknown person_id
- 409 for already-deleted (soft delete) or not-deleted (restore)
- 410 for expired undo window (restore)
- 500 for hard-delete rollback (with error detail)

### 3. `ui/js/api.js`

Added two new API endpoint constants:
- `API.PERSON_INVENTORY(id)` → `GET /api/people/{id}/delete-inventory`
- `API.PERSON_RESTORE(id)` → `POST /api/people/{id}/restore`

**Fixed:** Null byte corruption — cleaned before making changes.

### 4. `ui/js/app.js`

**Replaced:**
- `lvxStageDeleteNarrator()` — Now `async`, fetches dependency inventory from backend before opening dialog
- `lvxDeleteNarratorConfirmed()` — Now calls `DELETE /api/people/{pid}?mode=soft` instead of bare DELETE
- `lvxUndoDeleteNarrator()` — Now calls `POST /api/people/{pid}/restore` instead of creating a duplicate via POST

**Added:**
- `lvxGetDeleteInventory(pid)` — Fetches dependency inventory from backend, returns null on failure

**Removed:**
- localStorage-based backup/restore (replaced by backend soft delete + restore)
- POST-based fake undo that created duplicate narrators

### 5. `ui/lori8.0.html`

**Updated delete dialog:**
- Added `#lv80DeleteInventoryCounts` panel inside the delete dialog
- Panel shows dependency counts (e.g., "Profile records: 1", "Interview sessions: 14") when inventory is available
- Panel hidden when inventory is unavailable (graceful degradation)

**Updated `lv80OpenDeleteDialog()`:**
- Now renders inventory counts from `state.narratorDelete.inventory` into the counts panel
- Human-readable labels for each table (e.g., "Media files (will be unlinked)" for SET NULL tables)

---

## Architecture Decisions

### Soft delete as default

The frontend `Delete Narrator` button always performs soft delete. Hard delete is only available via direct API call (e.g., admin tooling). This ensures the undo window is always available for accidental deletions.

### Backend-authoritative undo

Phase 1 used localStorage backup + POST re-creation for undo, which created duplicate narrators. Phase 2 uses `POST /api/people/{pid}/restore` which simply clears the soft-delete markers on the original record. No duplicates possible.

### Transactional hard delete

`hard_delete_person()` relies on SQLite FK CASCADE for dependent row cleanup, wrapped in a transaction. If any error occurs during the DELETE, the entire operation is rolled back and the narrator remains intact. The rollback is logged in the audit table.

### Audit logging inside transactions

`_log_delete_audit()` runs within the caller's transaction for soft_delete and hard_delete success cases. For hard_delete rollback cases, a separate commit is used to ensure the failure is still logged even though the delete was rolled back.

---

## API Server Restart Required

The backend changes require an API server restart to take effect. The server at `localhost:8000` does not use `--reload` mode. The user can restart via:

- Windows: double-click `reload_api.bat`
- WSL: `bash scripts/restart_api.sh`

The frontend gracefully handles the case where the backend hasn't been restarted yet (inventory returns null, soft delete returns error — both handled silently).

---

## Frontend/Backend Contract

| Frontend Action | Backend Call | Fallback (backend unavailable) |
|----------------|-------------|-------------------------------|
| Open delete dialog | `GET /api/people/{id}/delete-inventory` | Dialog opens without counts panel |
| Confirm delete | `DELETE /api/people/{id}?mode=soft` | Warning logged, person may not be hidden |
| Undo delete | `POST /api/people/{id}/restore` | Alert shown with error detail |
| List narrators | `GET /api/people?limit=200` | Soft-deleted excluded by default |

---

## Test Summary

Frontend code verified in browser:
- New API constants loaded (`API.PERSON_INVENTORY`, `API.PERSON_RESTORE`)
- Async `lvxStageDeleteNarrator` works correctly
- Delete dialog opens with graceful degradation (no counts panel when backend unavailable)
- No console errors

Backend code verified via Python AST parse (both `db.py` and `people.py` — no syntax errors).

Full integration testing requires API server restart (see test results document for details).
