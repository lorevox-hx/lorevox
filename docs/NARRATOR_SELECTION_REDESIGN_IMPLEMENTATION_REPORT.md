# Narrator Selection Redesign — Implementation Report

Work Order 2 · Lorevox v8.0 · 2026-03-29

---

## Overview

Work Order 2 redesigns the narrator selection system in Lorevox 8.0, replacing the plain `<select>` dropdown with a card-based narrator switcher panel, and fixing the critical narrator bleed bug where switching narrators with Bio Builder closed left stale questionnaire data from the previous narrator.

## Files Modified

### 1. `ui/js/state.js`

Added two new state objects between `chat` and `interview`:

- **`state.narratorUi`** — Tracks switcher panel open/close state, pending switch target, active label, people cache, and grouped narrator lists (real/test/archived).
- **`state.narratorDelete`** — Tracks delete workflow: target ID/label, confirmation text, step counter, backup data, and undo expiry timestamp.

Also fixed pre-existing null byte corruption at end of file (Bug NS-1).

### 2. `ui/js/bio-builder.js`

Added two new functions after the `_bb()` helper:

- **`_resetNarratorScopedState(newId)`** — Hard-resets all Bio Builder session-scoped state: personId, quickItems, questionnaire, sourceCards, candidates. Preserves per-person FT/LT draft maps.
- **`_onNarratorSwitch(newId)`** — Calls reset then re-hydrates questionnaire from the new profile. This runs even when the Bio Builder popover is closed, fixing the bleed bug.

Exposed `_onNarratorSwitch` as `NS.onNarratorSwitch` in the public API.

### 3. `ui/js/app.js`

Added five new functions:

- **`lvxSwitchNarratorSafe(pid)`** — Central narrator switch handler. Calls Bio Builder's `onNarratorSwitch` (pre-reset), clears chat DOM, clears memoir, calls `loadPerson()`, then calls `onNarratorSwitch` again (post-hydrate), refreshes Bio Builder and Life Map.
- **`lvxBuildNarratorBackup(person)`** — Creates a serializable backup of a person record for the delete undo flow. Stores person data, profile snapshot, and timestamp.
- **`lvxStageDeleteNarrator(pid)`** — Stages the delete workflow: looks up person in cache, builds backup, populates `state.narratorDelete`, opens the delete dialog.
- **`lvxDeleteNarratorConfirmed()`** — Executes delete: validates "DELETE" confirmation text, saves backup to localStorage with 10-minute TTL, calls `DELETE /api/people/{id}`, clears active pointer if needed, refreshes people list, shows undo toast.
- **`lvxUndoDeleteNarrator()`** — Restores from backup: reads from localStorage, re-creates person via POST, refreshes people list, switches to the restored narrator.

Also fixed the `onDobChange()` null guard bug (NS-4).

### 4. `ui/lori8.0.html`

**Header markup changes:**
- Replaced the plain `<select id="personSelect">` with a clickable narrator card (`#lv80ActiveNarratorCard`) showing avatar initials, narrator name, sub-text (full name · DOB · POB), and a caret indicator.
- Original `<select>` hidden as fallback with `display:none`.

**New popover elements:**
- `#lv80NarratorSwitcher` (`popover="auto"`) — Grid panel showing all narrators as cards with Open/Delete buttons, TEST/REAL badges, and active-narrator highlighting.
- `#lv80DeleteNarratorDialog` (`popover="manual"`) — Multi-step typed confirmation dialog for narrator deletion.
- `#lv80UndoDeleteToast` — Fixed-position toast with "Narrator deleted. [Undo]" button, auto-dismisses after 10 minutes.

**CSS additions (~60 lines):**
- `.lv80-active-narrator` — Header card styling with hover/click states
- `.lv80-narrator-switcher` — Popover panel with grid layout
- `.lv80-narrator-card` — Individual card in switcher with avatar, badges, buttons
- `.lv80-delete-dialog` — Confirmation dialog styling
- `.lv80-undo-toast` — Fixed-position toast styling
- Badge styles for TEST (amber), REAL (green), ARCHIVED (gray)

**JS helper functions added:**
- `lv80NarratorInitials(person)` — Extracts 1-2 letter initials from display_name
- `lv80NarratorKind(person)` — Determines TEST/REAL/ARCHIVED badge from role field
- `lv80UpdateActiveNarratorCard()` — Updates header card from `state.profile.basics`
- `lv80RenderNarratorCards()` — Renders all narrator cards in switcher grid from `state.narratorUi.peopleCache`
- `lv80ToggleNarratorSwitcher()` — Opens/closes the switcher popover
- `lv80ConfirmNarratorSwitch(pid)` — Handles Open button click, routes through `lvxSwitchNarratorSafe()`
- `lv80OpenDeleteDialog(pid)` / `lv80CloseDeleteDialog()` — Manage delete confirmation dialog
- `lv80ShowUndoDelete()` — Shows undo toast after deletion

**Modified existing functions:**
- `lv80LoadPeople()` — Added `state.narratorUi.peopleCache` caching, added `lv80RenderNarratorCards()` and `lv80UpdateActiveNarratorCard()` calls.
- `lv80SwitchPerson()` — Now routes through `lvxSwitchNarratorSafe()` instead of calling `loadPerson()` directly.
- `lv80NewPerson()` — Added `lv80UpdateActiveNarratorCard()` call after creation.
- Init poll callback — Added `lv80UpdateActiveNarratorCard()` call after profile loads.

---

## Architecture Decisions

### Why `_onNarratorSwitch` is called twice in `lvxSwitchNarratorSafe`

The first call (before `loadPerson`) resets stale state so no old data can leak during the async profile fetch. The second call (after `loadPerson`) re-hydrates from the newly loaded profile. This two-phase approach ensures zero bleed even if `loadPerson` takes several seconds.

### Why `popover="manual"` for the delete dialog

The delete dialog uses `popover="manual"` instead of `popover="auto"` to prevent it from being dismissed by clicking outside. The user must explicitly Cancel or confirm. This prevents accidental dismissal during a destructive operation.

### Backup storage for undo

The undo backup is stored in `localStorage` with a 10-minute TTL key (`lorevox_deleted_narrator_backup_expires`). This survives page refreshes within the undo window but is automatically invalid after 10 minutes.

---

## Backend Status

The frontend delete flow calls `DELETE /api/people/{id}`, but the backend people router (`server/code/api/routers/people.py`) does not implement a DELETE handler. The call returns 405 and is silently caught. A backend companion work order is needed to implement:

1. `delete_person(person_id)` in `db.py` — SQL DELETE with cascade
2. `@router.delete("/{person_id}")` in `people.py` — API endpoint
3. The SQLite FK constraints are already configured for cascade (6 tables) and SET NULL (2 tables)

**FK Cascade Map (already in schema):**

| Table | ON DELETE |
|-------|----------|
| profiles | CASCADE |
| timeline_events | CASCADE |
| interview_sessions | CASCADE |
| interview_answers | CASCADE |
| facts | CASCADE |
| life_phases | CASCADE |
| media | SET NULL |
| media_attachments | SET NULL |

---

## Bugs Found and Fixed

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| NS-1 | Critical | Null byte corruption in state.js | Fixed |
| NS-2 | High | `ui` ReferenceError in bio-builder.js | Fixed |
| NS-3 | Medium | Card shows "Loading..." on page load | Fixed |
| NS-4 | Medium | `onDobChange` null element access | Fixed |
| NS-5 | Medium | Backend DELETE endpoint missing | Open |
| NS-6 | Low | Browser cache serving stale JS | Workaround |

---

## Test Summary

34/34 checks passed across Part A (narrator switch safety) and Part B (card UI and delete flow). See `NARRATOR_SELECTION_REDESIGN_TEST_RESULTS.md` for full matrix.
