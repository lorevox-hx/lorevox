# Mel Blanc Conversational Projection Report

## Build Summary

- **Feature implemented:** Conversational Template → Narrator JSON → Bio Builder Integration (Work Order 3)
- **Files created:**
  - `ui/js/projection-map.js` — 25 direct field mappings + 3 repeatable section templates (parents, grandparents, siblings), question selection, completeness scoring
  - `ui/js/projection-sync.js` — Sync layer with 3 write modes, locking model, localStorage persistence, narrator-switch lifecycle, audit trail
  - `ui/templates/mel-blanc.json` — Full Mel Blanc narrator template for test validation
  - `ui/templates/test-scripts/mel-blanc-conversation-script.md` — Conversation test script with ordered answers and expected projections
- **Files modified:**
  - `ui/js/state.js` — Added `state.interviewProjection` object + `window.__proj` debug helper
  - `ui/js/interview.js` — Added `_getNextProjectionQuestion()`, `_getNextRepeatableQuestion()`, `_projectAnswerToField()`, `_ivResetProjectionForNarrator()`; wired into `build71InterviewPrompt()` and `processInterviewAnswer()`
  - `ui/js/bio-builder-questionnaire.js` — Added human edit marking in `_saveSection()` via `LorevoxProjectionSync.markHumanEdit()`
  - `ui/js/app.js` — Added projection reset call in `lvxSwitchNarratorSafe()`
  - `ui/lori8.0.html` — Added projection-map.js and projection-sync.js to script load order
- **Projection state shape:** `{ personId, fields: { [path]: { value, source, turnId, confidence, locked, ts, history[] } }, pendingSuggestions[], syncLog[] }`
- **Template mapping:** 25 non-repeatable fields across 7 sections + 3 repeatable section templates with per-field conversational prompts, priority (1–5), era tags, write modes
- **Sync layer:** 3 write modes enforced: `prefill_if_blank`, `candidate_only`, `suggest_only`
- **Human lock rules:** `markHumanEdit()` sets `locked: true, source: "human_edit"`. AI writes blocked on locked fields. Prior values preserved in capped history array.

## Runtime Validation

- **UI started:** PASS — Lorevox 8.0 running on port 8080
- **API started:** PASS — API on port 8000, connection green dot active
- **New scripts loaded:** PASS — Console confirms: `[Lorevox] Projection map loaded — 25 direct fields, 3 repeatable sections.` and `[Lorevox] Projection sync layer loaded.` Zero load errors.
- **Mel Blanc template created:** PASS — Full narrator JSON with all 9 questionnaire sections
- **Mel Blanc live browser test completed:** PASS — Full round of tests executed in real browser

## Projection System Behavior

| Test | Result | Notes |
|------|--------|-------|
| Projection filled fields | **PASS** | 10 fields projected across personal, earlyMemories, education, parents, siblings |
| Projection restored on reload | **PASS** | All 10 fields, 2 locked, 2 pending suggestions survived F5 reload |
| Projection switched per narrator | **PASS** | Mel Blanc → Mark Twain → Mel Blanc round-trip. Zero cross-narrator bleed. Mark Twain had 0 fields. Mel Blanc restored all 10. |
| Projection influenced next question | **PASS** | `getUnansweredForEra()` correctly returns era-relevant gaps sorted by priority. Identity fields correctly excluded when already known. |
| Projection → BB sync accuracy | **PASS** | `prefill_if_blank` wrote to BB when field was empty, blocked when filled. `candidate_only` created candidate entries. `suggest_only` queued suggestions. |

## Conversation Flow

| Test | Result | Notes |
|------|--------|-------|
| Lori followed template areas | **PASS** | Question selection produces era-relevant questions in priority order. Identity skip works when profile has DOB+POB. |
| Questionnaire filled live | **PASS** | `prefill_if_blank` wrote "Melvin Jerome Blank" to empty BB fullName field. Suggest_only fields queued properly. |
| Projection updated live | **PASS** | `projectValue()` correctly stores value, source, turnId, confidence, ts. History preserved on updates. |
| Duplicate/redundant questioning avoided | **PASS** | With BB hydrated from template, `getUnansweredForEra()` returned only 1 gap (timeOfBirth) for early_childhood. All other fields correctly detected as filled. |
| Partial answer improved later | **PASS** | "Started in radio." (conf 0.5) → full radio career description (conf 0.9) accepted. Downgrade to conf 0.3 blocked. Prior value in history. |
| Human edit lock respected | **PASS** | `markHumanEdit()` set locked=true, source="human_edit". Subsequent AI projectValue with conf 0.99 was blocked. Value unchanged. |
| Candidates generated correctly | **PASS** | `candidate_only` mode created 2 people candidates: `proj_parents_2` (Uncle Morris) and `proj_siblings_1` (Henry, Brother, with uniqueCharacteristics). Data accumulated per-entry. |
| No direct structuredBio bypass | **PASS** | `state.bioBuilder.structuredBio` is null. Zero writes from projection to structuredBio. |
| Reload persistence | **PASS** | localStorage key `lorevox_proj_draft_<pid>` survives reload. `resetForNarrator()` restores all fields, locked state, and pending suggestions. |
| Narrator switch persistence | **PASS** | Mel Blanc → Mark Twain: Mel Blanc data persisted to LS, Mark Twain projection empty. Mark Twain → Mel Blanc: all 10 fields restored with correct locked/pending state. |

## Pros

1. **Architecture is clean.** Three-layer separation (map → sync → interview) keeps concerns isolated. Each layer is independently testable.
2. **Locking model is airtight.** Human edits are sacred — tested with conf 0.99 AI overwrite attempt, correctly blocked. History preserved on every transition.
3. **Write mode separation works.** `prefill_if_blank` only fills empties, `candidate_only` creates candidates without touching questionnaire, `suggest_only` queues for user acceptance. No mode leaks.
4. **Question selection is intelligent.** Era-aware, priority-sorted, correctly skips already-filled fields and identity when known. With a fully preloaded narrator, correctly returns minimal/no questions.
5. **Persistence is solid.** Reload and narrator round-trip both verified with exact field-count and lock-state matching.

## Cons

1. **BB questionnaire hydration timing.** `state.bioBuilder.questionnaire` is empty in-memory until Bio Builder is opened or manually force-loaded. This means `getUnansweredForEra()` may over-report gaps if BB hasn't been opened yet. The projection system sees the field as empty even though it's in localStorage. Mitigation: force-hydrate BB questionnaire from localStorage when projection initializes for a narrator.
2. **Extraction is shallow.** `_projectAnswerToField()` maps the entire answer text to the targeted field verbatim. It doesn't parse compound answers (e.g., "I was born in Missouri in 1835" → should extract place AND date). Real conversational answers will require NLP extraction or backend parsing to split into multiple projection fields. Currently: one answer → one field.
3. **Projection initialization not automatic on preload.** `resetForNarrator()` must be called manually after preload. The `lv80PreloadNarrator()` path doesn't trigger `lvxSwitchNarratorSafe()`, so projection isn't automatically initialized. Needs a hook in preload or a lazy-init pattern.

## Bugs Found

| Bug | Severity | Reproduction | Suspected Layer |
|-----|----------|-------------|-----------------|
| BB questionnaire not in memory after preload | LOW | Preload narrator → check `state.bioBuilder.questionnaire` → empty object. Data IS in localStorage under correct key. Hydrates when Bio Builder opens. | bio-builder-core.js `_loadDrafts()` only runs on narrator switch via BB path, not on preload. Known from Work Order 2. |
| Projection not auto-initialized on preload | MEDIUM | `lv80PreloadNarrator()` → check `__proj.personId` → null. Must manually call `resetForNarrator(pid)`. | narrator-preload.js doesn't call into projection lifecycle. Needs hook. |
| `personal.timeOfBirth` mapped as suggest_only but is a simple identity field | LOW | Design choice — timeOfBirth is priority 4, suggest_only. Could arguably be `prefill_if_blank` like other identity fields. Not a bug, but a design question. | projection-map.js field config. |

## Ideas / Next Improvements

1. **Add projection initialization to preload path.** After `lv80PreloadNarrator()` stores the questionnaire, call `LorevoxProjectionSync.resetForNarrator(pid)` to initialize the projection layer immediately. Also force-hydrate `bb.questionnaire` from the just-stored localStorage data.
2. **Backend NLP extraction.** Route interview answers through the backend for entity extraction before projection. A single compound answer like "My name is Sam Clemens, born November 30, 1835 in Florida, Missouri" should project to fullName + dateOfBirth + placeOfBirth simultaneously. The current one-answer-one-field model is a placeholder.
3. **Suggestion UI in Bio Builder.** Build a visual indicator in the Bio Builder questionnaire view showing pending suggestions (amber dot, "Lori suggests..." tooltip). User clicks to accept/dismiss. Currently suggestions exist in state but have no UI surface.
4. **Projection completeness badge.** Show a projection progress indicator in the interview roadmap or Bio Builder header — "72% projected via conversation" — so the user knows how much of the bio is being built conversationally.
5. **Batch projection from preload data.** When a narrator is preloaded from a template, the template data could be batch-projected with `source: "preload"` so the projection layer has full awareness of what's already known, rather than relying on BB questionnaire checks alone.

## Final Status

**READY FOR NEXT ITERATION: YES**

All critical paths pass. The projection state shape is correct, sync rules are enforced, locking model is airtight, persistence survives reload and narrator switching, no structuredBio bypass exists. The system is architecturally sound and integration-ready.

The two main gaps for production use are: (1) shallow extraction (needs backend NLP), and (2) suggestion UI surface (needs BB visual indicators). Both are expected follow-on work items, not blockers.
