# Mind Elixir Life Map — Formal Test Plan

Branch: `feature/mind-elixir-life-map`
Date: 2026-03-26
Status: ACTIVE PROTOTYPE

---

## 1. Scope

This test plan covers the Life Map prototype introduced in `feature/mind-elixir-life-map`. It tests the correctness, reliability, and safety of:

- `ui/js/life-map.js` — the data transform and navigation layer
- `ui/vendor/mind-elixir/mind-elixir.js` — the API-compatible SVG stub renderer
- `ui/vendor/mind-elixir/mind-elixir.css` — stub styles
- Patches to `ui/lori7.4c.html`, `ui/js/tabs.js`, `ui/js/app.js`

Out of scope: `lori8.0.html` (different UI model), server-side APIs, TTS, camera/affect pipeline.

---

## 2. Assumptions

1. The primary test shell is `ui/lori7.4c.html` (the tab-based shell).
2. The backend server (`lorevox-serve.py`) need not be running for structural and code-path tests.
3. Interactive browser tests are NOT executed in this environment — they are specified but marked NOT EXECUTED.
4. The stub renderer (`mind-elixir.js`) is the active implementation; the real Mind Elixir UMD build is not available offline.
5. `state`, `setEra()`, `setPass()`, `getCurrentEra()`, `getBirthYear()`, `renderRoadmap()`, `renderInterview()`, `updateContextTriggers()`, `renderTimeline()`, and `update71RuntimeUI()` are provided by existing Lorevox scripts loaded before `life-map.js`.

---

## 3. Environment

| Item | Value |
|---|---|
| Shell file | `ui/lori7.4c.html` |
| Branch | `feature/mind-elixir-life-map` |
| Test execution context | Repo file inspection + grep-based static analysis |
| Browser tests | NOT EXECUTED (environment constraint) |
| Node.js | Available for script validation |

---

## 4. Test Categories

| # | Category | Focus |
|---|---|---|
| 1 | Load / initialization | Script load order, global registration, DOM-ready guard |
| 2 | Empty states | No person, person with no seed |
| 3 | Person selection / profile seed states | Spine exists, spine absent, first era set |
| 4 | Spine rendering | Period nodes, root node, birth seed node |
| 5 | Memory child rendering | Year-matched memories, missing year, wrong schema |
| 6 | Era navigation click behavior | setEra chain, chronological vs thematic mode |
| 7 | Sync with roadmap / interview / timeline | Refresh chain correctness |
| 8 | No-truth-mutation guard | No writes to facts / archive / spine |
| 9 | Offline / local-only compliance | No CDN, no external fetch |
| 10 | Regression — existing tabs | Profile, Interview, Timeline, Memoir, Review still work |
| 11 | Branch integrity | Only intended files changed |
| 12 | Pane-visibility guard | Off-screen builds suppressed |

---

## 5. Test Cases

### Category 1 — Load / Initialization

**TC-1.1** Script include order is correct
_Expected_: `mind-elixir.js` and `life-map.js` load after `app.js` and `cognitive-auto.js`, before `lori73-shell.js` inline block.
_Pass_: Both `<script>` tags present after `cognitive-auto.js` line; `MindElixir` is available when `life-map.js` executes.

**TC-1.2** `window.LorevoxLifeMap` is registered
_Expected_: After script execution, `window.LorevoxLifeMap` has properties: `render`, `refresh`, `destroy`, `buildLifeMapFromLorevoxState`.
_Pass_: All four properties present and are functions.

**TC-1.3** Double-registration guard works
_Expected_: Running `life-map.js` twice does not throw or overwrite.
_Pass_: The IIFE `if (typeof window.LorevoxLifeMap !== "undefined") return;` exits early on second load.

**TC-1.4** DOM-ready guard works on cold load
_Expected_: `_syncHostVisibility()` runs after DOMContentLoaded if scripts load in `<head>`.
_Pass_: `document.readyState` check in life-map.js correctly defers or runs immediately.

---

### Category 2 — Empty States

**TC-2.1** No person selected → empty message shown
_Expected_: `lifeMapHost` has class `hidden`, `lifeMapEmpty` does not. Message: "Select a person to view their Life Map."
_Pass_: `_syncHostVisibility()` with `state.person_id = null` produces correct state.

**TC-2.2** Person selected, no spine → "add DOB" message
_Expected_: `state.person_id` set, `state.timeline.spine.periods = []`. `lifeMapHost` hidden, message: "Add DOB and birthplace…"
_Pass_: `_getPeriods()` returns `[]`, ready = false, correct message shown.

**TC-2.3** Tab switch to Life Map with no person → no error
_Expected_: `showTab('lifemap')` → `render(true)` → returns cleanly with empty message visible.
_Pass_: No uncaught exceptions, correct empty state shown.

**TC-2.4** `MindElixir` not loaded → shows amber warning
_Expected_: If vendor JS is missing/broken, `_libraryReady()` shows an amber warning in `lifeMapEmpty`.
_Pass_: Warning message present, no exception thrown.

---

### Category 3 — Person Selection / Profile Seed States

**TC-3.1** `loadPerson()` with cached spine triggers refresh
_Expected_: `window.LorevoxLifeMap?.refresh()` called at end of `loadPerson()`.
_Pass_: Line present in `app.js` after `memoirSourceName` update.

**TC-3.2** `loadPerson()` while Life Map tab NOT active → no off-screen build
_Expected_: `refresh()` is called, but pane-visibility guard in `render()` returns early and sets `_lastSig = null`.
_Pass_: Guard code present in `life-map.js`; `_lastSig` reset to `null`.

**TC-3.3** `loadPerson()` while Life Map tab IS active → rebuilds correctly
_Expected_: Pane is visible, guard does not block, map rebuilds with correct dimensions.
_Pass_: Guard only triggers when `pane-lifemap` has class `hidden`.

**TC-3.4** `saveProfile()` with DOB + birthplace → triggers refresh
_Expected_: `window.LorevoxLifeMap?.refresh()` called after `updateArchiveReadiness()` in `saveProfile()`.
_Pass_: Line present in `app.js`.

**TC-3.5** First era auto-set on cached spine load
_Expected_: `loadPerson()` calls `setEra(_cachedSpine.periods[0].label)` when `state.session.currentEra` is null.
_Pass_: Existing app.js logic untouched; map refresh follows this with active era set.

---

### Category 4 — Spine Rendering

**TC-4.1** Root node uses preferred name
_Expected_: `buildLifeMapFromLorevoxState()` uses `state.profile.basics.preferred` or `state.profile.basics.fullname`.
_Pass_: `_personName()` checks preferred then fullname then "Life Story".

**TC-4.2** Root node falls back to "Life Story" with no profile
_Expected_: When `state.profile.basics` is empty or undefined, root node topic = "Life Story".
_Pass_: `_personName()` returns "Life Story" as final fallback.

**TC-4.3** Life period nodes use correct label + year range
_Expected_: Node topic = `"Early Childhood · 1945–1955"` for a period with those values.
_Pass_: `_prettyEra(period.label) + " · " + subtitle` construction in `buildLifeMapFromLorevoxState()`.

**TC-4.4** Open-ended period shows "+" suffix
_Expected_: A period with `end_year = null` shows `"Later Life · 2010+"`.
_Pass_: `end != null ? ("–" + end) : "+"` logic.

**TC-4.5** Periods with no label are filtered out
_Expected_: `_getPeriods()` returns only periods where `period.label` is a non-empty string.
_Pass_: Filter added to `_getPeriods()` in life-map.js.

**TC-4.6** Birth seed node appears when DOB or birthplace is set
_Expected_: `Born · 1945` node appears as first child of root.
_Pass_: `if (birthYear || birthPlace)` guard in `buildLifeMapFromLorevoxState()`.

**TC-4.7** No birth seed node when DOB and birthplace are both absent
_Expected_: `rootChildren` contains only period nodes.
_Pass_: Guard ensures no seed node added.

**TC-4.8** Active era period node has highlighted style
_Expected_: The period matching `getCurrentEra()` gets `background: "rgba(99,102,241,.22)"`.
_Pass_: `isActive` check in period node construction.

---

### Category 5 — Memory Child Rendering

**TC-5.1** Memory with `year` field matched to correct period
_Expected_: Memory with `year: 1952` inside `early_childhood (1945–1960)` becomes a child node.
_Pass_: `_memoryBelongsToPeriod` uses inclusive start/end year range.

**TC-5.2** Memory with `start_year` field also matched
_Expected_: Memory with `start_year: 1952` (no `year`) is handled by `_yearFromMemory()`.
_Pass_: `m.start_year` is the second fallback in `_yearFromMemory()`.

**TC-5.3** Memory with ISO date string matched
_Expected_: Memory with `date: "1952-06-15"` extracts year 1952 via regex.
_Pass_: `String(raw).match(/\b(18|19|20)\d{2}\b/)` in `_yearFromMemory()`.

**TC-5.4** Memory with no year field is excluded
_Expected_: Memory with no year-like field is not shown in any period.
_Pass_: `_memoryBelongsToPeriod()` returns `false` when `_yearFromMemory()` returns `null`.

**TC-5.5** Memory with year outside all period ranges is excluded
_Expected_: Memory with year 2150 does not appear as a child of any period.
_Pass_: Year range check in `_memoryBelongsToPeriod()`.

**TC-5.6** Memory topic truncated to 48 chars from description
_Expected_: Memory with no title but a 100-char description shows first 48 chars.
_Pass_: `String(m.description).slice(0, 48)` in `_memoryTitle()`.

**TC-5.7** Memory node data does not include server-side facts
_Expected_: Memory node `data` contains only `kind, era, year, title, description` from local memory items.
_Pass_: `_buildMemoryChildren()` reads only from `state.timeline.memories`, not archive/facts layers.

---

### Category 6 — Era Navigation Click Behavior

**TC-6.1** Clicking an era node calls `setEra()`
_Expected_: `_onNodeSelect` with `data.kind === "era"` calls `setEra(data.era)`.
_Pass_: `_navigateToEra()` helper calls `setEra(era)` with `typeof setEra === "function"` guard.

**TC-6.2** Clicking an era node calls `setPass("pass2a")` in chronological mode
_Expected_: `setPass("pass2a")` called when `interviewMode === "chronological"`.
_Pass_: Guard in `_navigateToEra()`.

**TC-6.3** Clicking an era node does NOT call `setPass()` in thematic mode
_Expected_: `interviewMode === "thematic"` prevents `setPass()` call.
_Pass_: Condition `interviewMode === "chronological"` in `_navigateToEra()`.

**TC-6.4** Full UI refresh chain fires on era click
_Expected_: `update71RuntimeUI`, `renderRoadmap`, `renderInterview`, `updateContextTriggers`, `renderTimeline` all called.
_Pass_: All five calls present in `_onNodeSelect` era branch after `_navigateToEra()`.

**TC-6.5** Map re-renders with active era highlight after era click
_Expected_: `setTimeout(() => NS.render(true), 0)` fires after era navigation.
_Pass_: Line present in era click handler.

**TC-6.6** Clicking root / seed node has no navigation side-effect
_Expected_: `data.kind === "person"` or `"seed"` — neither matches `"era"` or `"memory"` branch; nothing fires.
_Pass_: `_onNodeSelect()` only acts on `kind === "era"` and `kind === "memory"`.

**TC-6.7** Clicking a memory node calls `setEra()` for the parent era
_Expected_: `data.kind === "memory"` branch calls `_navigateToEra(data.era)`.
_Pass_: Memory click branch present in `_onNodeSelect()`.

**TC-6.8** Clicking a memory node updates the selection meta bar
_Expected_: `#lifeMapSelectionMeta` shows memory title + year + description snippet.
_Pass_: Meta bar update in memory click branch.

**TC-6.9** Missing runtime functions do not throw
_Expected_: If `setEra`, `renderRoadmap`, etc. are undefined, `typeof fn === "function"` guard prevents TypeError.
_Pass_: All calls in `_navigateToEra()` and `_onNodeSelect()` are guarded.

---

### Category 7 — Sync with Roadmap / Interview / Timeline

**TC-7.1** `renderTimeline()` called after era click
_Expected_: Timeline pane reflects the newly-set era after era node click.
_Pass_: `renderTimeline()` called in era click handler in `_onNodeSelect`.

**TC-7.2** `renderTimeline()` NOT called after memory click
_Expected_: Memory click calls `_navigateToEra()` which does NOT include `renderTimeline()`.
_Pass_: `renderTimeline` call is only in the era click branch of `_onNodeSelect`.

**TC-7.3** Map refreshes on era change from roadmap sidebar
_Expected_: If user clicks a life period in the sidebar (existing flow), map reflects new active era on next tab-open.
_Pass_: Tab-open calls `render(true)` which rebuilds with current `_currentEra()`.
_Note_: Map does not auto-update when user is not on the Life Map tab — this is documented behaviour.

---

### Category 8 — No-Truth-Mutation Guard

**TC-8.1** `life-map.js` does not assign to `state.timeline.spine`
_Expected_: No `state.timeline.spine =` or `state.timeline.spine.periods =` assignments.
_Pass_: Grep confirms zero such assignments.

**TC-8.2** `life-map.js` does not assign to `state.profile`
_Expected_: No `state.profile =` or `state.profile.basics =` assignments.
_Pass_: Grep confirms zero such assignments.

**TC-8.3** `life-map.js` does not write to facts/archive
_Expected_: No calls to fact-writing or archive-writing functions.
_Pass_: No calls to `saveFact`, `addToArchive`, `pushFact`, `saveMemory`, `TL_ADD` or similar.

**TC-8.4** `mind-elixir.js` does not touch Lorevox state
_Expected_: Stub renderer has no reference to `state`, `setEra`, or any Lorevox global.
_Pass_: Grep confirms no such references.

**TC-8.5** Memory node display does not imply fact status
_Expected_: Memory nodes use a teal/green border, not the indigo/blue used for verified facts. No "verified" label.
_Pass_: Memory node style uses `rgba(52,211,153,...)` (teal), distinct from era blue and root blue.

---

### Category 9 — Offline / Local-Only Compliance

**TC-9.1** No CDN script includes in patched HTML
_Expected_: No new `cdn.`, `jsdelivr`, `unpkg`, or `cdnjs` references added.
_Pass_: Grep confirms no CDN URLs in new/changed files.

**TC-9.2** No `fetch()` or XHR in `life-map.js`
_Expected_: Life Map never makes network requests.
_Pass_: Grep confirms no `fetch(`, `XMLHttpRequest`, or `import()` in life-map.js.

**TC-9.3** No network calls in `mind-elixir.js`
_Expected_: Stub renderer is purely DOM-manipulation.
_Pass_: Grep confirms no `fetch`, `XMLHttpRequest`, or dynamic `import` in vendor file.

**TC-9.4** Vendor files served locally
_Expected_: HTML includes `vendor/mind-elixir/mind-elixir.js` and `vendor/mind-elixir/mind-elixir.css` as relative paths.
_Pass_: Both `<link>` and `<script>` tags use relative paths.

---

### Category 10 — Regression: Existing Tabs

**TC-10.1** Profile tab logic unchanged
_Expected_: `pane-profile`, `tab-profile`, `showTab('profile')` work as before. No profile-specific code modified.
_Pass_: Only `loadPerson()` and `saveProfile()` in `app.js` touched, both additions are append-only.

**TC-10.2** Interview tab logic unchanged
_Expected_: `renderInterview()`, interview roadmap, section navigation unchanged.
_Pass_: `interview.js` not modified.

**TC-10.3** Timeline tab logic unchanged
_Expected_: `showTab('timeline')` still calls `renderTimeline()`.
_Pass_: `tabs.js` only adds one line; existing `timeline` case unchanged.

**TC-10.4** Memoir tab logic unchanged
_Expected_: `showTab('memoir')` still calls `renderMemoirChapters()`.
_Pass_: Memoir case untouched in `tabs.js`.

**TC-10.5** Obituary tab logic unchanged
_Expected_: `showTab('obituary')` still calls `_buildObituaryImpl()` or `updateObitIdentityCard()`.
_Pass_: Obituary case untouched in `tabs.js`.

**TC-10.6** Review tab logic unchanged
_Expected_: `showTab('review')` still calls `renderSensitiveReviewPanel()`.
_Pass_: Review case untouched in `tabs.js`.

**TC-10.7** All eight tab buttons and panes present
_Expected_: `tab-profile`, `tab-interview`, `tab-events`, `tab-timeline`, `tab-lifemap`, `tab-memoir`, `tab-obituary`, `tab-review` all present in HTML. All eight corresponding panes present.
_Pass_: Grep of `lori7.4c.html`.

---

### Category 11 — Branch Integrity

**TC-11.1** Branch name is correct
_Expected_: `git branch` shows `* feature/mind-elixir-life-map`.

**TC-11.2** Only expected files added (new)
_Expected_: New files: `ui/vendor/mind-elixir/mind-elixir.js`, `ui/vendor/mind-elixir/mind-elixir.css`, `ui/js/life-map.js`, `docs/MIND_ELIXIR_PROTOTYPE.md`, `docs/MIND_ELIXIR_TEST_PLAN.md`, `docs/MIND_ELIXIR_TEST_REPORT.md`.

**TC-11.3** Only expected files modified
_Expected_: Modified: `ui/lori7.4c.html`, `ui/js/tabs.js`, `ui/js/app.js`. No other files intentionally modified.

---

### Category 12 — Pane-Visibility Guard

**TC-12.1** `render()` skips mount when `pane-lifemap` is hidden
_Expected_: When `pane-lifemap` has class `hidden`, `render()` returns early without calling `_mountMap()`. `_lastSig` is set to `null`.
_Pass_: Guard code present in `render()`.

**TC-12.2** `_lastSig = null` forces fresh rebuild on next tab-open
_Expected_: After the early return, `_lastSig = null` ensures the next `render(true)` call always proceeds past the signature check.
_Pass_: `null` assignment present in guard.

**TC-12.3** Pane visible → guard does not block
_Expected_: When `pane-lifemap` does NOT have class `hidden`, guard does not trigger.
_Pass_: Guard condition is `pane.classList.contains("hidden")`.

---

## 6. Pass / Fail Criteria

- **PASS**: Test case is verified by code inspection, grep, or structural check, with zero contradicting evidence.
- **FAIL**: Evidence found that contradicts the expected result.
- **INSPECTED**: Logic traced through code paths; no browser execution available.
- **NOT EXECUTED**: Requires live browser interaction.

Overall result: **PASS** if all VERIFIED/INSPECTED cases pass and no FAIL cases found.

---

## 7. Risks and Limitations

1. **No live browser execution** — interactive tests (click, render quality, responsive layout) cannot be validated in this environment.
2. **Stub renderer approximation** — the SVG stub does not pixel-match the real Mind Elixir output. Layout quality depends on the actual browser viewport at runtime.
3. **Memory schema diversity** — `_yearFromMemory()` handles 5 field patterns; a backend with a schema not in that set will silently exclude memories.
4. **`getCurrentEra()` and `getBirthYear()` availability** — these functions are defined in the v7.1 inline patch layer of `lori7.4c.html`. They are not available in other shells (e.g. `lori7.3.html`) unless the same patch is applied.
5. **`state` global timing** — if `life-map.js` is somehow invoked before `state.js` loads, all accessors return safe defaults. This is prevented by load order but cannot be dynamically verified here.
