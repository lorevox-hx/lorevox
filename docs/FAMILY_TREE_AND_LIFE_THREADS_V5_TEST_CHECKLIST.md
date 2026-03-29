# Family Tree & Life Threads — v5 Test Checklist

**Date:** 2026-03-28
**Build:** Bio Builder v5 Integration

---

## Pass 4 — Interview Prompt Integration

- [x] `_getDraftFamilyContext(pid)` returns correct FT/LT snapshot
- [x] `_getDraftFamilyContext()` uses current narrator when pid omitted
- [x] `_getDraftFamilyContext()` returns null when no draft exists
- [x] `_buildDraftContextHint(era)` produces family context hints
- [x] `_buildDraftContextHint(era)` produces life theme hints
- [x] "Do Not Prompt" nodes excluded from context hints
- [x] Narrator excluded from context hints
- [x] `build71InterviewPrompt()` appends draft context hint
- [x] `updateContextTriggers()` renders draft context trigger cards
- [x] Draft trigger cards styled with teal border-left
- [x] Maximum 4 draft trigger cards shown
- [x] No private notes exposed in triggers

## Pass 5 — Review Integration

- [x] `_draftCrossRef(candidate)` returns { inFT, inLT, ftNode, ltNode }
- [x] Cross-ref matches on case-insensitive exact display name
- [x] FT match returns ftNode with role
- [x] LT match returns ltNode with type
- [x] Non-matching candidates return { inFT: false, inLT: false }
- [x] Queue cards show FT/LT badges for matched candidates
- [x] Detail view shows "Bio Builder Cross-Reference" block
- [x] Cross-ref is display-only (no automatic actions)

## Pass 6 — Memoir and Life Map Integration

- [x] `_getDraftContext()` in life-map.js reads draft via central accessor
- [x] Period nodes include draft context suffix (family count, theme count)
- [x] Meta bar includes draft summary
- [x] `buildDraftMemoirContext()` returns people, themes, places
- [x] `buildDraftMemoirContext()` flags output as isDraft: true
- [x] "Do Not Prompt" nodes excluded from memoir context
- [x] Narrator excluded from memoir context
- [x] No edge details or private notes in memoir context

## Cross-Cutting

- [x] All integrations use `_getDraftFamilyContext()` as single entry point
- [x] No integration writes to truth layers (archive, facts, timeline)
- [x] Narrator isolation maintained across all integrations
- [x] All JS files pass syntax check (no null bytes)
- [x] All v4 CSS classes present in lori8.0.html
