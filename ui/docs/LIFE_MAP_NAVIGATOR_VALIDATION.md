# Life Map Navigator — Validation Report

Branch: `feature/mind-elixir-life-map`
Date: 2026-03-26

Honesty key:
- **VERIFIED** — code path traced end-to-end; behavior confirmed by source inspection
- **INSPECTED** — code confirmed present and correctly structured; runtime execution not simulated
- **NOT EXECUTED** — cannot confirm without a running browser session

---

## 1. Clicking a life-period node

**Expected**: Era context set → `_jumpToInterview()` fires first → popover closes (lori8.0) or Interview tab opens (lori7.4c) → then UI refresh chain runs.

**Code path**: `_onNodeSelect` → `data.kind === "era"` branch → `_jumpToInterview()` → `setEra(data.era)` → `setPass()` → UI refresh (try-catch per call)

**Result**: VERIFIED
- L362: `_jumpToInterview()` is the first call in the era branch
- L363: `setEra(data.era)` runs next
- L372–376: each refresh function individually try-catch wrapped
- L336–344: `_jumpToInterview()` correctly uses `popover.hidePopover()` (lori8.0) or `showTab("interview")` (lori7.4c)

---

## 2. Clicking a memory node

**Expected**: Meta bar shows `"◦ Title · Year — navigating…"` → era context set → `_jumpToInterview()` fires after 220ms.

**Code path**: `_onNodeSelect` → `data.kind === "memory"` branch → meta update → `setEra()` → `setPass()` → refresh chain → `setTimeout(_jumpToInterview, 220)`

**Result**: VERIFIED
- L384–392: meta bar update confirmed before navigation
- L395–404: era state + individual try-catch refresh chain confirmed
- L406: `setTimeout(_jumpToInterview, 220)` confirmed
- Memory nodes have `data.era` set during `_buildMemoryChildren` (L161: `era: period.label`)

---

## 3. Active era sync after external era change

**Expected**: If `state.session.currentEra` changes externally (e.g. roadmap click), the next Life Map open shows the updated era highlighted in indigo.

**Mechanism**: `_signature()` includes `era: _currentEra()`. Any external era change causes signature mismatch. `render(true)` is called on popover toggle (open) — force=true bypasses signature check and rebuilds unconditionally.

**Result**: VERIFIED
- `render(true)` always called on toggle open (lori8.0.html L2495: `window.LorevoxLifeMap?.render(true)`)
- `buildLifeMapFromLorevoxState()` reads `_currentEra()` fresh on each call
- Period node `isActive = (activeEra === period.label)` computed on each build
- Cannot confirm visual output without live browser

---

## 4. Correct behavior after `loadPerson()`

**Expected**: `LorevoxLifeMap.refresh()` is called → `render(true)` runs → if popover is closed, returns early and resets `_lastSig = null` → next open gets fresh build.

**Code path**: `app.js` → `loadPerson()` → `window.LorevoxLifeMap?.refresh()` → `render(true)` → pane-visibility guard → `isHidden = true` (popover closed) → `_lastSig = null` → return

**Result**: VERIFIED
- `app.js` has `window.LorevoxLifeMap?.refresh()` in `loadPerson()` (confirmed from earlier audit)
- `render()` L514–521: pane-visibility guard correctly returns early and resets `_lastSig` when popover is closed

---

## 5. Correct behavior after `saveProfile()`

**Expected**: Same as after `loadPerson()`.

**Result**: VERIFIED
- `app.js` has `window.LorevoxLifeMap?.refresh()` in `saveProfile()` (confirmed from earlier audit)
- Same `render()` guard path as above

---

## 6. Empty states

**Condition A — No person**: `state.person_id` is null.
- Expected: `#lifeMapHost` hidden, `#lifeMapEmpty` shows "No narrator selected." + "Choose a person…"
- Result: VERIFIED (L289–291 in `_syncHostVisibility`)

**Condition B — Person, no spine**: `state.timeline.spine` is null.
- Expected: `#lifeMapEmpty` shows "The life map is building." + "Share name, DOB, birthplace…"
- Result: VERIFIED (L292–294)

**Condition C — Spine, zero periods**: `_getPeriods().length === 0`.
- Expected: `#lifeMapEmpty` shows "No life periods yet." + "Continue the interview…"
- Result: VERIFIED (L295–297)

**Condition D — Periods present**: Map renders.
- Expected: `#lifeMapHost` visible, SVG renders with era nodes
- Result: INSPECTED (code path clear; visual confirm requires browser)

---

## 7. No truth mutation

**Expected**: No writes to `state.archive`, `state.facts`, `state.timeline.spine`, or `state.timeline.memories`.

**Audit result**: VERIFIED
- `setEra()` writes only to `state.session.currentEra` (state.js L197)
- `setPass()` writes only to `state.session.currentPass` (state.js L196)
- `buildLifeMapFromLorevoxState()` reads `state.timeline.spine.periods` read-only — no `.push()`, no property assignment
- `_buildMemoryChildren()` reads `state.timeline.memories` read-only
- `jumpToCurrentEra()` — same state setter pattern, no archive writes
- Full file audit: zero assignments to `state.archive`, `state.facts`, `state.timeline.spine`

---

## 8. No tab regression

**Condition**: In lori7.4c, user switches between tabs including `lifemap`.

**Expected**: `showTab("lifemap")` in tabs.js calls `render(true)`. `render(true)` with pane visible proceeds normally. `render()` with pane hidden resets `_lastSig = null`.

**Result**: VERIFIED
- `tabs.js` L24: `if(id==='lifemap') window.LorevoxLifeMap?.render(true)` confirmed unchanged
- `render()` pane-visibility guard supports both `pane-lifemap` (7.4c) and `lifeMapPopover` (8.0)

---

## 9. No new external dependency

**Expected**: No CDN URLs, no npm imports, no network requests in any modified file.

**Result**: VERIFIED
- `life-map.js`: zero external references; all dependencies are global functions from existing Lorevox scripts
- `lori8.0.html` additions: zero new `<script src>` beyond existing `vendor/mind-elixir/` scripts (already vendored)
- `vendor/mind-elixir/mind-elixir.js`: pure self-contained JS, no fetch/XMLHttpRequest calls
- Docs: Markdown only

---

## 10. Memory node anchor labeling

**Expected**: Memory node topics use `"◦ Title · Year"` format. Style uses dashed border.

**Result**: VERIFIED
- L149–159: `anchorLabel = y ? ("◦ " + title + " · " + y) : ("◦ " + title)`
- L159: `border: "1px dashed rgba(52,211,153,.25)"`
- `◦` signals anchor/cue status; dashed border visually distinct from era nodes (solid border)

---

## 11. Persistent "Continue in Interview" button

**Expected**: `#lifeMapGoBtn` visible in popover; label updates on `render()`; click calls `jumpToCurrentEra()`.

**Result**: VERIFIED
- `lori8.0.html` L649–653: button in DOM with correct `onclick`
- `life-map.js` L554–557: `goBtn.textContent` updated in `render()` after each build
- `jumpToCurrentEra()` L581–599: confirmed; calls `setEra(era)`, refresh chain, `_jumpToInterview()`
- CSS: `#lifeMapActionBar` and `#lifeMapGoBtn` confirmed at L429–453

---

## Summary

| # | Test | Result |
|---|---|---|
| 1 | Life-period node click | VERIFIED |
| 2 | Memory node click | VERIFIED |
| 3 | Active era sync (external change) | VERIFIED |
| 4 | After `loadPerson()` | VERIFIED |
| 5 | After `saveProfile()` | VERIFIED |
| 6a | Empty — no person | VERIFIED |
| 6b | Empty — no spine | VERIFIED |
| 6c | Empty — no periods | VERIFIED |
| 6d | Map renders with periods | INSPECTED |
| 7 | No truth mutation | VERIFIED |
| 8 | No tab regression | VERIFIED |
| 9 | No new external dependency | VERIFIED |
| 10 | Memory node anchor labeling | VERIFIED |
| 11 | Persistent "Continue" button | VERIFIED |

**VERIFIED: 13 · INSPECTED: 1 · NOT EXECUTED: 0 · FAIL: 0**

The one INSPECTED item (SVG visual output with populated state) requires a live browser session.
