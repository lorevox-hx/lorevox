# Walt Disney (WD) System Trace — Bug Log

**Date:** 2026-03-30
**Test Document:** WD_SYSTEM_TRACE_TEST_RESULTS.md

---

## WD-1: Questionnaire Data Loss on Narrator Switch

| Field | Value |
|-------|-------|
| **ID** | WD-1 |
| **Severity** | Medium |
| **Type** | Known Limitation (architectural gap) |
| **Status** | Open |
| **Component** | bio-builder.js → `_resetNarratorScopedState()` |
| **Trigger** | Switch narrator via card switcher, then switch back |
| **Expected** | All 9 questionnaire sections preserved per-narrator across switch |
| **Actual** | Only Personal Information re-hydrated; 8 other sections reset to Empty/Not started |
| **Root Cause** | Line 242: `bb.questionnaire = {}` clears all data. `_hydrateQuestionnaireFromProfile()` only restores `personal` from server profile. No save step before clear. |
| **Fix Path** | Add `_persistQuestionnaire(pid)` and `_restoreQuestionnaire(pid)` using localStorage keyed by `lorevox_questionnaire_{pid}`, following the existing FT/LT draft pattern (lines 270-290). Call persist before reset, restore after hydration. |
| **Workaround** | Complete and submit all questionnaire sections before switching narrators. |
| **Regression** | No — pre-existing gap, not caused by Phase 1/Phase 2 changes. |

---

## WD-2: Questionnaire Data Loss on Page Refresh

| Field | Value |
|-------|-------|
| **ID** | WD-2 |
| **Severity** | Medium |
| **Type** | Known Limitation (same root cause as WD-1) |
| **Status** | Open |
| **Component** | bio-builder.js — session-scoped state |
| **Trigger** | Browser refresh (F5) or tab close/reopen |
| **Expected** | Questionnaire data survives page lifecycle |
| **Actual** | All sections except Personal Information lost |
| **Root Cause** | `state.bioBuilder.questionnaire` is JavaScript memory only. No localStorage write occurs for questionnaire data. On page load, `_hydrateQuestionnaireFromProfile()` only restores `personal` from the server-loaded profile. |
| **Fix Path** | Same as WD-1 — localStorage persistence with save-on-change and restore-on-load. |
| **Regression** | No — pre-existing gap. |

---

## WD-3: Form Field Key Mismatch

| Field | Value |
|-------|-------|
| **ID** | WD-3 |
| **Severity** | Low (cosmetic) |
| **Type** | Bug |
| **Status** | Open |
| **Component** | bio-builder.js — questionnaire form save vs state injection |
| **Trigger** | State injection uses keys like `educationCareer`, `hobbiesInterests`; form save creates `education`, `hobbies` |
| **Expected** | Consistent key names between all code paths |
| **Actual** | 11 total keys in questionnaire state instead of 9; UI shows "Not started" for sections whose data is stored under the non-matching key |
| **Root Cause** | Two codepaths write to the same `questionnaire` object using different key naming conventions. |
| **Fix Path** | Normalize all key names. Either update the form save to use compound names or update the state injection to use short names. |
| **Regression** | No — cosmetic inconsistency, all data preserved. |
