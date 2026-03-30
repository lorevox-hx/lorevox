# Bio Builder — Mark Twain Pipeline Bug Log

**Date:** 2026-03-28

---

## Bugs Found and Fixed

| ID | Severity | Area | Status | File | Description | Fix |
|---|---|---|---|---|---|---|
| MT-BUG-001 | Critical | Questionnaire | Fixed | bio-builder.js | Bio Builder questionnaire does not hydrate from active profile on open. When opening Bio Builder for an existing person, all questionnaire fields appear blank even though `state.profile.basics` has the data. | Added `_hydrateQuestionnaireFromProfile(bb)` function called from `_personChanged()`. One-way: only fills empty sections, never overwrites existing BB draft data. |
| MT-BUG-002 | High | Questionnaire | Fixed | bio-builder.js | Narrator switch completely loses questionnaire state. `_personChanged(newId)` resets `bb.questionnaire = {}` with no recovery path. | Reverse hydration now repopulates personal (from `state.profile.basics`), parents (from `state.profile.kinship.parents`), and siblings (from `state.profile.kinship.siblings`) on switch-back. |

---

## Bugs Found — Not Yet Fixed

| ID | Severity | Area | Status | Description |
|---|---|---|---|---|
| MT-BUG-003 | Medium | Questionnaire | Open | Questionnaire sections beyond personal/parents/siblings (grandparents, earlyMemories, education, laterYears, hobbies, additionalNotes) do not persist across narrator switch. These need either localStorage persistence or profile model extension. |
| MT-BUG-004 | Low | Source Inbox | Open | People detection in `_parseTextItems` uses conservative relationship keyword anchors. Patterns like "His brother Orion" may not reliably detect the proper noun in all sentence structures. Consider adding pronoun-possessive + relation + capitalized-word pattern. |

---

## Cumulative Bug Count

| Severity | Found | Fixed | Open |
|---|---:|---:|---:|
| Critical | 1 | 1 | 0 |
| High | 1 | 1 | 0 |
| Medium | 1 | 0 | 1 |
| Low | 1 | 0 | 1 |
| **Total** | **4** | **2** | **2** |
