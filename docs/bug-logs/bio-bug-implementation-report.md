# Lorevox 8.0 — Bio Bug Implementation Report

**Date:** 2026-04-02
**Plan:** `research-based-bio-bug-action-plan.md`

---

## A. What Changed

### Phase 1 — Questionnaire SSOT Repair
Created `_restoreQuestionnaire(pid)` as the single canonical restore path. All questionnaire entry points now go through this helper. `_loadDrafts()` delegates to it. `_saveSection()` writes in-memory state first, then persists, then rerenders.

### Phase 2 — Commit-Before-Mutate Repeatable Sections
Rebuilt `_addRepeatEntry()` into a 6-step deterministic flow: restore → commit DOM → persist → append → persist → rerender. Added `event.stopPropagation()` and `event.preventDefault()` on the "Add another" button to prevent popover dismissal. Added guard for undefined repeatable arrays.

### Phase 2.5 — Drift Guardrails
Added `_qqDebugSnapshot()` helper that logs in-memory vs persisted section counts after every critical action. Automatic mismatch warnings in dev mode. Snapshots fire on: tab render, section save, add-repeat, narrator switch, person change, and restore.

### Phase 3 — Human-Authority Hydration Safety
Fixed full-name hydration to prefer `basics.fullname` (display name), then composed first+middle+last, then preferred name as last resort. Made hydration idempotent via `_lastHydratedPid` tracking — repeated panel opens no longer re-run hydration. Existing `parentsEmpty`/`siblingsEmpty` guards already protect manual kinship data.

### Phase 4 — Peek at Memoir Reliability
Added debug logging on click and toggle events (popover state, content length, hidden attributes). Added auto-fix: if content exists but `memoirScrollContent.hidden === true`, unhide it and hide the intro on click.

### Phase 5 — Narrator Delete Cleanup
Added `lorevox_ft_draft_`, `lorevox_lt_draft_`, and `lorevox_sources_draft_` to the delete cleanup. Also calls `bbCore._clearDrafts(pid)` to clean the draft index. Added post-delete verification that scans for orphaned keys and logs warnings.

### Phase 6A — Chat Observability
Added per-turn lifecycle logs in `streamSse()`: user_send, first_token (with TTFT ms), final_token (with total ms and response length), extraction_start, extraction_finish/extraction_failed, and ws_error. All logs use a turn ID for grep-friendly filtering.

### Phase 6B — Chat/Extraction Hardening
Extraction failure in `streamSse()` is now explicitly non-fatal with a try/catch that logs and continues. The existing `.catch()` in `_extractAndProjectMultiField` and try/catch in `_runDeferredInterviewExtraction` already provide defense-in-depth. Conversation remains alive regardless of extraction outcome.

---

## B. File-by-File Changes

### `ui/js/bio-builder-core.js`
- **Added** `_restoreQuestionnaire(pid)` — canonical restore helper (Phase 1.1)
- **Added** `_qqDebugSnapshot(action, pid, bb)` — drift detection logger (Phase 2.5)
- **Added** `_qqDebugEnabled` — auto-detects dev mode (localhost or ?debug)
- **Modified** `_loadDrafts()` — delegates QQ loading to `_restoreQuestionnaire()` instead of inline parse
- **Modified** `_onNarratorSwitch()` — added debug snapshot after switch
- **Modified** `_personChanged()` — added debug snapshot after person change
- **Modified** exports — added `_restoreQuestionnaire`, `_qqDebugSnapshot`

### `ui/js/bio-builder-questionnaire.js`
- **Added** aliases for `_restoreQuestionnaire` and `_qqDebugSnapshot` from core
- **Modified** `_sectionFillCount()` — restores canonical state if empty before counting (Phase 1.2)
- **Modified** `_renderQuestionnaireTab()` — restores canonical state on tab render (Phase 1.2)
- **Modified** `_renderSectionDetail()` — restores canonical state before rendering detail (Phase 1.2)
- **Modified** `_saveSection()` — persist immediately after in-memory write, before candidate extraction; added debug snapshot (Phase 1.3)
- **Rebuilt** `_addRepeatEntry()` — full commit-before-mutate sequence with DOM commit, double persist, array guard, debug snapshot (Phase 2)
- **Modified** "Add another" button HTML — added `event.stopPropagation();event.preventDefault()` (Phase 2.1)
- **Modified** `_hydrateQuestionnaireFromProfile()` — fixed fullName to use display name first; added `_lastHydratedPid` idempotency guard; added hydration tracking (Phase 3)

### `ui/js/app.js`
- **Modified** `lvxDeleteNarratorConfirmed()` — added `lorevox_ft_draft_`, `lorevox_lt_draft_`, `lorevox_sources_draft_` cleanup; added `bbCore._clearDrafts()` call; added orphan key verification (Phase 5)
- **Modified** `streamSse()` — added per-turn timing logs with turn ID (user_send, first_token, final_token, extraction_start/finish/failed, ws_error) (Phase 6A); wrapped extraction in explicit non-fatal try/catch (Phase 6B)

### `ui/lori8.0.html`
- **Modified** Peek at Memoir click handler — added debug logging (popover state, content length, hidden attrs); added auto-fix for hidden content (Phase 4)
- **Modified** Peek at Memoir toggle handler — added debug logging on state change (Phase 4)

---

## C. Important Code Snippets

### Canonical restore helper (bio-builder-core.js)
```javascript
function _restoreQuestionnaire(pid) {
  var bb = _bb(); if (!bb) return {};
  if (!pid) { bb.questionnaire = {}; return bb.questionnaire; }
  try {
    var raw = localStorage.getItem(_LS_QQ_PREFIX + pid);
    if (raw) {
      var parsed = JSON.parse(raw);
      var d = parsed && (parsed.d || parsed.data);
      if (d && typeof d === "object") {
        bb.questionnaire = d;
        _qqDebugSnapshot("restore", pid, bb);
        return bb.questionnaire;
      }
    }
  } catch (e) {
    console.warn("[bb-core] _restoreQuestionnaire parse error for pid=" + pid, e);
  }
  if (!bb.questionnaire || Object.keys(bb.questionnaire).length === 0) {
    bb.questionnaire = {};
  }
  return bb.questionnaire;
}
```

### Commit-before-mutate _addRepeatEntry (bio-builder-questionnaire.js)
```javascript
function _addRepeatEntry(sectionId, renderCallback) {
  var bb = _bb(); if (!bb) return;
  var pid = _currentPersonId();
  var section = SECTIONS.find(function (s) { return s.id === sectionId; });
  // Step 1: restore canonical state
  if (pid) _restoreQuestionnaire(pid);
  // Step 2-3: guard array, commit DOM edits, persist
  if (!Array.isArray(bb.questionnaire[sectionId])) {
    bb.questionnaire[sectionId] = bb.questionnaire[sectionId] ? [bb.questionnaire[sectionId]] : [{}];
  }
  if (section) {
    var entries = bb.questionnaire[sectionId];
    entries.forEach(function (_, idx) {
      section.fields.forEach(function (f) {
        var el = _el("bbQ_" + idx + "_" + f.id);
        if (el) { if (!entries[idx]) entries[idx] = {}; entries[idx][f.id] = el.value || ""; }
      });
    });
  }
  if (pid) _persistDrafts(pid);
  // Step 4-5: append empty entry, persist again
  bb.questionnaire[sectionId].push({});
  if (pid) _persistDrafts(pid);
  // Step 6: rerender
  if (renderCallback) renderCallback();
}
```

### Narrator delete cleanup (app.js)
```javascript
localStorage.removeItem("lorevox_ft_draft_" + pid);
localStorage.removeItem("lorevox_lt_draft_" + pid);
localStorage.removeItem("lorevox_sources_draft_" + pid);
// ...
var bbCore = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
if (bbCore && bbCore._clearDrafts) bbCore._clearDrafts(pid);
```

### Chat observability (app.js streamSse)
```javascript
var _turnId = Date.now().toString(36);
var _t0 = performance.now();
console.log("[chat-turn:" + _turnId + "] user_send", { textLen: text.length });
// ... on first token:
console.log("[chat-turn:" + _turnId + "] first_token", { ms: Math.round(_tFirstToken - _t0) });
// ... after stream:
console.log("[chat-turn:" + _turnId + "] final_token", { ms: Math.round(_tLastToken - _t0) });
// ... extraction wrapped non-fatal:
try { await _runDeferredInterviewExtraction(); }
catch(e) { console.warn("[chat-turn:" + _turnId + "] extraction_failed (non-fatal)"); }
```

---

## D. Tests Run

1. **Syntax validation** — `node -c` on all 5 modified files: bio-builder-core.js, bio-builder-questionnaire.js, projection-sync.js, interview.js, app.js — all pass
2. Code review of all changes for:
   - No new global variables leaked
   - No cross-narrator state leakage
   - No removal of existing functionality
   - Preservation of human-authority lock semantics in projection-sync.js (unchanged)
   - Preservation of existing popover API mechanics

---

## E. Test Results

| Test | Result | Notes |
|------|--------|-------|
| bio-builder-core.js syntax | PASS | `node -c` clean |
| bio-builder-questionnaire.js syntax | PASS | `node -c` clean |
| projection-sync.js syntax | PASS | `node -c` clean (no changes to this file) |
| interview.js syntax | PASS | `node -c` clean (no changes to this file) |
| app.js syntax | PASS | `node -c` clean |
| lori8.0.html inline script context | PASS | Changes are within existing `<script>` block |

**UI tests require Lorevox running.** The implementation is ready for the manual verification sequence from Section 8 of the action plan.

---

## F. Remaining Risks

1. **Peek at Memoir root cause unclear** — The auto-fix (unhiding content if it exists but is hidden) addresses the observed symptom. The deeper question is why `memoirScrollContent.hidden` is still `true` when content has been written. This may be a race condition in the memoir assembly pipeline that sets content but never flips the hidden attribute. The debug logging will reveal the exact sequence on next reproduction.

2. **Chat drop root cause not yet determined** — Phase 6A adds the observability needed to diagnose whether the drop happens before response, during extraction, or on socket reuse. The actual root cause (Bug 6) will become diagnosable on the next reproduction with these logs active.

3. **Hydration idempotency on narrator reload** — `_lastHydratedPid` is a closure variable that resets on page reload. This means a hard refresh will re-run hydration once. This is intentional — hydration should run once per session per narrator, but a page reload is a clean session.

4. **No automated test suite** — All changes are verified by syntax check and code review. Full verification requires the manual test sequence with Lorevox running (Steps 1-18 in the action plan). This is a pre-existing limitation of the project.

5. **Debug logging volume** — The Phase 2.5 debug snapshots and Phase 6A timing logs are gated to dev mode (localhost/127.0.0.1 or `?debug` query param) for the questionnaire. Chat timing logs always emit but are concise and grep-friendly.
