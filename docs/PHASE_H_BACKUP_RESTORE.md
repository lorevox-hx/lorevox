# Phase H — Data Safety, Backup, Restore, Export, and Safe Edit Workflow

## Overview

Phase H provides safety infrastructure for Lorevox 8.0 family data. It protects real parent data from accidental overwrites, bad edits, and restructuring mistakes.

## Folder Conventions

```
lorevox_data/
  db/                    ← Live SQLite database
    lorevox.sqlite3
  media/                 ← Live media files (per-narrator subdirs)
    {person_id}/
  backups/               ← Full data snapshots (dated)
    2026-04-04_1815_before-kent-edit/
    2026-04-04_2100_post-session/
    _pre_restore_20260404_181500/   ← Auto-created safety copies
  exports/               ← Per-person read-only exports
    people/
      2026-04-04_Janice_Josephine_Horne/
      2026-04-04_Kent_James_Horne/
  templates/              ← Narrator JSON templates (canonical, editable)
  voices/                ← TTS voice data
  cache_audio/           ← Cached TTS audio
  memory/                ← Agent working memory
  projects/              ← Project files
  interview/             ← Interview artifacts
  logs/                  ← Data-level logs
```

**Rules:**
- Live DB is always in `db/`
- Backups are always in `backups/` — never mixed with live data
- Exports are always in `exports/people/` — never mixed with backups
- Templates live in `lorevox_data/templates/` (canonical), with `ui/templates/` as repo fallback
- Each folder is self-contained and clearly named

---

## Scripts

All scripts live in `scripts/` and source `common.sh` for shared config.

### 1. Full Backup — `backup_lorevox_data.sh`

Creates a dated snapshot of the entire live data root.

```bash
# Auto-dated snapshot
bash scripts/backup_lorevox_data.sh

# With label
bash scripts/backup_lorevox_data.sh "before-kent-edit"

# Before a parent interview session
bash scripts/backup_lorevox_data.sh "pre-interview-janice"
```

**What it does:**
1. WAL-checkpoints the SQLite database for consistency
2. Copies everything in `lorevox_data/` except `backups/` and `exports/`
3. Writes a `_snapshot_manifest.json` with timestamp, label, and source path
4. Reports size and location

### 2. Restore — `restore_lorevox_data.sh`

Restores a snapshot back into the live data area.

```bash
# List available snapshots
bash scripts/restore_lorevox_data.sh

# Restore a specific snapshot
bash scripts/restore_lorevox_data.sh "2026-04-04_1815_before-kent-edit"
```

**What it does:**
1. **Refuses to run if Lorevox services are still running** (safety requirement)
2. Moves current live data to a safety copy (`_pre_restore_YYYYMMDD_HHMMSS`)
3. Copies the chosen snapshot into the live location
4. Preserves `backups/` and `exports/` directories

**Restore procedure:**
```bash
bash scripts/stop_all.sh                        # 1. Stop everything
bash scripts/restore_lorevox_data.sh             # 2. List snapshots
bash scripts/restore_lorevox_data.sh "name"      # 3. Restore chosen snapshot
bash scripts/start_all.sh                        # 4. Restart
```

### 3. Per-Person Export — `export_person.sh`

Exports one narrator's canonical state to readable JSON files.

```bash
# List narrators
bash scripts/export_person.sh

# Export by ID
bash scripts/export_person.sh "11d1d2d3-46c4-4a52-ba0a-be81df8cc336"

# Export with label
bash scripts/export_person.sh "11d1d2d3-46c4-4a52-ba0a-be81df8cc336" "pre-cleanup"
```

**Exported files:**
- `person.json` — identity (name, DOB, POB)
- `profile.json` — profile JSON
- `questionnaire.json` — canonical questionnaire
- `projection.json` — canonical projection
- `facts.json` — extracted facts
- `timeline_events.json` — life events
- `life_phases.json` — life phase groupings
- `interview_sessions.json` — session metadata
- `interview_answers.json` — answers
- `media.json` — media metadata
- `media_attachments.json` — attachment links
- `identity_change_log.json` — identity change proposals
- `section_summaries.json` — section summaries
- `media/` — copies of actual media files (if any)
- `_export_manifest.json` — export metadata and row counts

**Export is read-only.** It never mutates live data.

### 4. Duplicate Narrator — `duplicate_person.sh`

Creates a sandbox copy of one narrator with a new ID.

```bash
# List narrators
bash scripts/duplicate_person.sh

# Duplicate with default suffix "(Test Copy)"
bash scripts/duplicate_person.sh "6c248666-32f6-4987-8bc3-e66e92e3773d"

# Duplicate with custom suffix
bash scripts/duplicate_person.sh "6c248666-32f6-4987-8bc3-e66e92e3773d" "Pre-Edit Backup"
```

**What gets copied:**
- Person record (new UUID, renamed)
- Profile, questionnaire, projection
- Facts, timeline events, life phases

**What does NOT get copied** (session-specific):
- Interview sessions and answers
- Media files and attachments
- Affect events and segment flags
- Identity change log and audit records

**The copy is fully independent.** Edits to it do not affect the original.

---

## Safe Edit Workflow

Use this procedure before any risky structural change (kinship cleanup, import, restructuring, batch edits).

### Before the risky change:

```bash
# 1. Snapshot the whole data root
bash scripts/backup_lorevox_data.sh "before-kent-kinship-cleanup"

# 2. (Optional) Duplicate the narrator for safe experimentation
bash scripts/duplicate_person.sh "6c248666-..." "Kinship Test"

# 3. Export the narrator's current state for comparison
bash scripts/export_person.sh "6c248666-..." "before-edit"
```

### After the risky change:

```bash
# 4. Export again for comparison
bash scripts/export_person.sh "6c248666-..." "after-edit"

# 5. Compare the two exports
diff -r exports/people/before-edit/ exports/people/after-edit/
```

### If something went wrong:

```bash
# 6. Stop Lorevox and restore the snapshot
bash scripts/stop_all.sh
bash scripts/restore_lorevox_data.sh "before-kent-kinship-cleanup"
bash scripts/start_all.sh
```

---

## Behavior Rules

1. **Backup whole data root** — the primary safety copy is the whole `lorevox_data` folder, not just one table
2. **Stop services for restore** — restore only happens with Lorevox stopped
3. **Export is read-only** — per-person export never mutates live data
4. **Duplicate creates a clearly separate narrator** — no in-place clone or hidden overwrite
5. **Snapshots are dated and human-readable** — folder names are understandable without opening them
6. **Keep live, backup, export, and template locations separate** — never mix working DB files with backup/export bundles

---

## Quick Reference

| Task | Command |
|------|---------|
| Snapshot before session | `bash scripts/backup_lorevox_data.sh "pre-session"` |
| Snapshot after session | `bash scripts/backup_lorevox_data.sh "post-session"` |
| List snapshots | `bash scripts/restore_lorevox_data.sh` |
| Restore | Stop → `bash scripts/restore_lorevox_data.sh "name"` → Start |
| Export one person | `bash scripts/export_person.sh <id>` |
| Duplicate for testing | `bash scripts/duplicate_person.sh <id>` |
| Compare exports | `diff -r exports/people/before/ exports/people/after/` |
