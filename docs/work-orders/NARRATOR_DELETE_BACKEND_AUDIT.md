# Narrator Delete — Backend Audit

Phase 2 Pre-Implementation Audit · Lorevox v8.0 · 2026-03-29

---

## 1. Current People Router Status

**File:** `server/code/api/routers/people.py`

Before Phase 2, the people router had exactly four endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/people` | Create a new person |
| GET | `/api/people` | List people (no soft-delete filtering) |
| GET | `/api/people/{person_id}` | Get a specific person |
| PATCH | `/api/people/{person_id}` | Update a person |

There was no DELETE endpoint. The frontend `lvxDeleteNarratorConfirmed()` called `DELETE /api/people/{pid}` which returned 405 Method Not Allowed. The frontend catch block swallowed the error silently.

## 2. Current db.py People Functions

| Function | Behavior |
|----------|----------|
| `create_person()` | INSERT into `people`, auto-generates UUID, calls `ensure_profile()` |
| `get_person()` | SELECT by id — returns all columns but did NOT include soft-delete fields |
| `list_people()` | SELECT all people ordered by `updated_at` DESC — no soft-delete filter |
| `update_person()` | COALESCE-based UPDATE — no awareness of deleted state |

There was no `delete_person()`, `soft_delete_person()`, `restore_person()`, or `hard_delete_person()` function.

## 3. Schema — People Table (Pre-Phase 2)

```sql
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT '',
  date_of_birth TEXT DEFAULT '',
  place_of_birth TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

No soft-delete columns existed. No audit log table existed.

## 4. Foreign Key Cascade Behavior

The following tables reference `people(id)` with the documented ON DELETE behavior:

| Table | FK Column | ON DELETE | Impact |
|-------|-----------|-----------|--------|
| `profiles` | person_id | CASCADE | Profile row deleted with person |
| `timeline_events` | person_id | CASCADE | All timeline events deleted |
| `interview_sessions` | person_id | CASCADE | All interview sessions deleted |
| `interview_answers` | person_id | CASCADE | All interview answers deleted |
| `facts` | person_id | CASCADE | All facts deleted |
| `life_phases` | person_id | CASCADE | All life phases deleted |
| `media` | person_id | SET NULL | Media rows preserved, person_id nulled |
| `media_attachments` | person_id | SET NULL | Attachment rows preserved, person_id nulled |

This is a **mixed cascade model**:
- 6 tables use CASCADE (data destroyed with person)
- 2 tables use SET NULL (data preserved as orphaned media)

## 5. Policy Decisions for Media + Attachments

**Decision: Preserve media on hard delete.** The existing ON DELETE SET NULL behavior is intentional and correct for a family archive:

- Photos/media may have been uploaded independently of any narrator
- Media may be shared across narrators in the future
- Orphaned media (person_id = NULL) can be re-associated or cleaned up later
- This is safer than cascade-deleting irreplaceable family photos

**Hard delete therefore:**
- Destroys: profiles, timeline_events, interview_sessions, interview_answers, facts, life_phases
- Preserves: media rows (person_id set to NULL), media_attachments (person_id set to NULL)

## 6. Schema Changes Added (Phase 2)

### New columns on `people` table:

```sql
ALTER TABLE people ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN deleted_at TEXT DEFAULT NULL;
ALTER TABLE people ADD COLUMN deleted_by TEXT DEFAULT NULL;
ALTER TABLE people ADD COLUMN delete_reason TEXT DEFAULT '';
ALTER TABLE people ADD COLUMN undo_expires_at TEXT DEFAULT NULL;
```

Added via idempotent migration in `init_db()` (checks `PRAGMA table_info` before ALTER).

### New index:

```sql
CREATE INDEX IF NOT EXISTS idx_people_active ON people(is_deleted, updated_at);
```

### New audit log table:

```sql
CREATE TABLE IF NOT EXISTS narrator_delete_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,           -- soft_delete | restore | hard_delete
  person_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  requested_by TEXT DEFAULT NULL,
  dependency_counts_json TEXT NOT NULL DEFAULT '{}',
  result TEXT NOT NULL DEFAULT 'success',  -- success | rollback | failure
  error_detail TEXT DEFAULT NULL,
  ts TEXT NOT NULL
);
```

## 7. Compatibility Notes

- All migrations are idempotent (safe to re-run `init_db()` multiple times)
- Existing people rows remain active (`is_deleted = 0` is the default)
- `list_people()` now accepts `include_deleted` parameter (default `False`) — backwards-compatible
- The `get_person()` function still returns soft-deleted people (needed for restore/inventory)
- Frontend gracefully handles backend unavailability (inventory returns null → counts panel hidden)

## 8. Pre-existing Issue: Null Byte Corruption

`db.py` contained 1,955 null bytes scattered throughout the file (similar to the `state.js` issue found in Phase 1). Fixed with `perl -i -pe 's/\x00//g'` before making any code changes. Also fixed `api.js` which had the same issue.
