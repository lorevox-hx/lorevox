# Bio Builder — Mark Twain Pipeline Fix Plan

**Date:** 2026-03-28
**Based on:** Mark Twain Full Pipeline Test Results

---

## Fix 1: Reverse Hydration (COMPLETED)

### Problem
Bio Builder questionnaire behaved as an isolated draft store. Opening Bio Builder for an existing person showed blank fields despite profile data existing in `state.profile.basics`.

### Root Cause
- `applyBioBuilderPersonalToProfile()` pushed BB → profile (forward path existed)
- No reverse path existed to hydrate `bb.questionnaire.personal` from `state.profile.basics`
- `_personChanged(newId)` reset `bb.questionnaire = {}` on narrator switch with no recovery

### Fix Implemented
Added `_hydrateQuestionnaireFromProfile(bb)` in `bio-builder.js`:
- Called at the end of `_personChanged()` after reset and draft loading
- Populates `bb.questionnaire.personal` from `state.profile.basics` when empty
- Populates `bb.questionnaire.parents` from `state.profile.kinship.parents` when empty
- Populates `bb.questionnaire.siblings` from `state.profile.kinship.siblings` when empty
- One-way safety: never overwrites existing BB questionnaire data with profile data
- Preserves narrator isolation and truth-layer separation

### Lines Changed
- bio-builder.js: +91 lines (function + helper + call site in `_personChanged`)

---

## Fix 2: Questionnaire Persistence (RECOMMENDED — Future)

### Problem
Questionnaire sections beyond personal/parents/siblings do not survive narrator switch because they have no external persistence or profile model backing.

### Recommended Fix
Extend the v4 localStorage persistence pattern (already used for FT/LT drafts) to questionnaire data:
- Add `_LS_Q_PREFIX = "lorevox_q_draft_"`
- In `_persistDrafts(pid)`, also serialize `bb.questionnaire` to localStorage
- In `_loadDrafts(pid)`, also restore `bb.questionnaire` from localStorage (only if current questionnaire is empty)
- This would make all 9 questionnaire sections persist across narrator switch and browser reload

### Priority: Medium
This is the natural extension of the existing persistence architecture and would close MT-BUG-003.

---

## Fix 3: People Detection Enhancement (RECOMMENDED — Future)

### Problem
`_parseTextItems` people detection relies on possessive pronoun + relationship keyword + proper noun patterns. Sentences like "His brother Orion was important" may not reliably extract "Orion" in all syntactic positions.

### Recommended Fix
Add an additional detection pattern:
```
/(?:his|her|my|their)\s+(?:brother|sister|mother|father|wife|husband|son|daughter)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
```
This would catch pronoun-possessive + relation + capitalized name sequences more reliably.

### Priority: Low
The current conservative detection is by design to avoid false positives. This enhancement would improve recall without significantly impacting precision.

---

## Summary

| Fix | Status | Priority | Impact |
|---|---|---|---|
| Reverse hydration | Completed | Critical | Questionnaire now hydrates from profile on open |
| Questionnaire localStorage persistence | Recommended | Medium | All sections survive switch/reload |
| People detection enhancement | Recommended | Low | Better extraction from source text |
