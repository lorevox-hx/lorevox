# Life Map — Behavior Tests

Branch: `feature/mind-elixir-life-map`
Test date: 2026-03-26

Honesty key:
- **VERIFIED** — code path traced end-to-end; behavior confirmed by source inspection
- **INSPECTED** — code confirmed present and correctly structured; runtime execution not simulated
- **NOT EXECUTED** — cannot confirm without a running browser session

---

## Test 1 — No person selected

**Condition**: `state.person_id` is null or undefined.

**Expected**:
- `#lifeMapHost` has class `hidden`
- `#lifeMapEmpty` does not have class `hidden`
- Empty state shows title "No narrator selected." and hint "Choose a person from the selector above…"

**Code path**: `_syncHostVisibility()` → `!pid` branch → `empty.innerHTML = …` with `msg = "No narrator selected."`

**Result**: VERIFIED
- `_syncHostVisibility` L290–325: `var pid = (typeof state !== "undefined" && state.person_id) || null`; first branch `if (!pid)` sets `msg = "No narrator selected."` and `hint = "Choose a person from the selector above…"`
- `host.classList.toggle("hidden", !ready)` and `empty.classList.toggle("hidden", ready)` execute correctly when `ready = false`

---

## Test 2 — Person without timeline spine

**Condition**: `state.person_id` is set, `state.timeline.spine` is null/undefined.

**Expected**:
- `#lifeMapHost` hidden
- `#lifeMapEmpty` visible with title "The life map is building." and hint mentioning name/DOB/birthplace

**Code path**: `_syncHostVisibility()` → `pid` truthy, `spine` falsy → `msg = "The life map is building."`

**Result**: VERIFIED
- L298: `var spine = (typeof state !== "undefined" && state.timeline && state.timeline.spine) || null`
- L299: `var periods = _getPeriods()` — returns `[]` when no spine
- L300: `ready = !!(pid && periods.length > 0)` → `false`
- L304–306: `else if (!spine)` branch sets correct messages

---

## Test 3 — Person with spine and periods

**Condition**: `state.person_id` set, `state.timeline.spine.periods` has ≥1 entries with valid `label` fields.

**Expected**:
- `#lifeMapHost` visible (no `hidden` class)
- `#lifeMapEmpty` hidden
- SVG map renders with root node (person name) + life-period nodes
- Active era node has indigo highlight style

**Code path**: `_syncHostVisibility()` → `ready = true`; `render()` → `_mountMap(data)`

**Result**: INSPECTED
- `_getPeriods()` filters by `typeof p.label === "string" && p.label.trim() !== ""`
- `buildLifeMapFromLorevoxState()` maps periods to nodes with correct styles
- Active era detection: `isActive = (activeEra === period.label)` using `_currentEra()`
- Active era style: `{ background: "rgba(99,102,241,.22)", border: "1px solid rgba(99,102,241,.55)" }`
- Cannot confirm SVG render output without live browser execution

---

## Test 4 — Life-period node click (lori8.0 path)

**Condition**: `#lifeMapPopover` is open (`hasAttribute("open")`), user clicks a life-period node.

**Expected sequence**:
1. `_navigateToEra(era)` called: `setEra` → `setPass` (if chronological) → `update71RuntimeUI` → `renderRoadmap` → `renderInterview` → `updateContextTriggers`
2. `renderTimeline()` called
3. `_jumpToInterview()` called → `lifeMapPopover.hidePopover()` called → popover dismissed
4. User lands in chat window (interview surface in lori8.0)
5. No `setTimeout(render(true))` — map is NOT redrawn (user has left the map)

**Code path**: `_onNodeSelect` → `data.kind === "era"` branch → `_navigateToEra` → `renderTimeline` → `_jumpToInterview` → `popover.hidePopover()`

**Result**: VERIFIED
- L391–395: `if (data.kind === "era" && data.era)` branch confirmed; no `setTimeout(render(true))` present
- L371–379: `_jumpToInterview()` checks `popover.hasAttribute("open")` and calls `hidePopover()` first
- L345–357: `_navigateToEra` wraps all runtime functions in `typeof fn === "function"` guards

---

## Test 5 — Life-period node click (lori7.4c path)

**Condition**: `#lifeMapPopover` does not exist in DOM (lori7.4c shell), user clicks a life-period node.

**Expected sequence**:
1. Full `_navigateToEra` chain runs
2. `_jumpToInterview()` called → no popover found → `showTab("interview")` called
3. User lands on Interview tab

**Code path**: `_jumpToInterview` → `popover` is null → falls through to `if (typeof showTab === "function") showTab("interview")`

**Result**: VERIFIED
- L373: `var popover = _el("lifeMapPopover")` → null in lori7.4c
- L374: `if (popover && ...)` → skipped
- L379: `if (typeof showTab === "function") showTab("interview")` → executes

---

## Test 6 — Memory node click

**Condition**: User clicks a memory-child node (teal-tinted node).

**Expected sequence**:
1. `data.kind === "memory"` branch enters
2. `_navigateToEra(data.era)` called with the memory's parent era
3. Meta bar updates with title · year · description snippet + "— navigating…"
4. 220ms timeout fires → `_jumpToInterview()` called
5. User arrives at interview context with era set to the memory's period
6. Meta bar shows navigation info (NOT a claim of verified fact)

**Code path**: `_onNodeSelect` → `data.kind === "memory"` branch → `_navigateToEra` → meta update → `setTimeout(_jumpToInterview, 220)`

**Result**: INSPECTED
- L399–413: memory branch confirmed; 220ms delay confirmed
- Meta text confirmed to NOT contain "verified," "confirmed," or "fact" language
- `data.era` is set during `_buildMemoryChildren` at L163: `era: period.label`
- `_navigateToEra` call confirmed at L402

---

## Test 7 — Active era highlighting

**Condition**: `state.session.currentEra` is set to a valid period label.

**Expected**:
- The matching era node has indigo style: `rgba(99,102,241,.22)` background + `rgba(99,102,241,.55)` border
- Other era nodes have either teal-tinted (if have memories) or dim (if empty) styles
- Meta bar shows "Lori is in: [Era Name] — click any period to navigate there."

**Code path**: `buildLifeMapFromLorevoxState` → per-period `isActive` flag → style selection; `render()` → meta bar update

**Result**: VERIFIED
- L184: `var isActive = (activeEra === period.label)` using `_currentEra()`
- L196: `style = isActive ? { indigo styles } : hasMemories ? { teal styles } : { dim styles }`
- L505–508: meta bar text confirmed for active era and no-era states
- Three style tiers confirmed distinct

---

## Test 8 — No truth mutation

**Condition**: User clicks a life-period node or memory node.

**Expected**: No writes to `state.archive`, `state.facts`, `state.timeline.spine`, or `state.timeline.memories`.

**Result**: VERIFIED
- `_navigateToEra` calls only: `setEra` (sets `state.session.currentEra`), `setPass` (sets `state.session.currentPass`), and UI render functions
- `setEra` source (state.js L197): `function setEra(e) { if (state.session) state.session.currentEra = e; }` — writes only to `state.session`, not archive/facts/spine
- `buildLifeMapFromLorevoxState` reads `state.timeline.spine.periods` read-only; no `.push()`, `.splice()`, or property assignment
- `_buildMemoryChildren` reads `state.timeline.memories` read-only
- No assignment to `state.archive`, `state.facts`, or `state.timeline.spine` anywhere in life-map.js — confirmed by full file audit

---

## Test 9 — Tab continuity / regression (lori7.4c)

**Condition**: User is in lori7.4c. Life Map tab is active. Switching to another tab and back triggers correct behavior.

**Expected**:
- `showTab('lifemap')` in tabs.js calls `window.LorevoxLifeMap?.render(true)`
- `render(true)` with `pane-lifemap` visible (no `hidden` class) proceeds to full rebuild
- `render()` called from `app.js` hooks (`loadPerson`, `saveProfile`) while pane is hidden: skips SVG build, resets `_lastSig = null`

**Code path**: `tabs.js` L24 → `render(true)`; `render()` pane-visibility guard at L486–493

**Result**: VERIFIED
- tabs.js L24: `if(id==='lifemap') window.LorevoxLifeMap?.render(true);` confirmed
- life-map.js L486–493: dual-shell guard confirmed for both `pane-lifemap` (7.4c) and `lifeMapPopover` (8.0)
- `_lastSig = null` reset on hidden-pane path confirmed at L492

---

## Test 9b — Popover continuity / regression (lori8.0)

**Condition**: User is in lori8.0. Life Map popover is closed. `LorevoxLifeMap.refresh()` is called by `app.js` (e.g. after `loadPerson`).

**Expected**:
- `render(true)` is called
- `lifeMapPopover` does not have `open` attribute → `isHidden = true`
- Function returns early without building SVG
- `_lastSig = null` is reset so next popover-open does a fresh build

**Code path**: `render()` → `_el("lifeMapPopover").hasAttribute("open")` → `false` → early return

**Result**: VERIFIED
- L489: `(popover && !popover.hasAttribute("open"))` correctly identifies closed state
- L490: `isHidden` set true
- L492: `_lastSig = null` reset
- L493: `return` — no SVG build attempted
- Popover `toggle` listener in lori8.0.html calls `render(true)` on open, triggering fresh build

---

## Test 10 — Period with no start/end years

**Condition**: A period in `state.timeline.spine.periods` has no `start_year` or `end_year`.

**Expected**:
- Node renders with subtitle "—+" (dash for missing start, + for open end)
- Node does not crash

**Code path**: `buildLifeMapFromLorevoxState` → `start = period.start_year != null ? period.start_year : "—"` → `end = period.end_year != null ? period.end_year : null` → `subtitle = "—+"`

**Result**: VERIFIED
- L191: null-guarded — confirmed
- Crash-free confirmed by defensive checks

---

## Test 11 — Memory node with no year

**Condition**: A memory item in `state.timeline.memories` has no year field.

**Expected**:
- `_yearFromMemory` returns null
- `_memoryBelongsToPeriod` returns false (memory not assigned to any period)
- Memory does not appear as a child node in any era

**Code path**: `_yearFromMemory` → returns null → `_memoryBelongsToPeriod` → `!y` → returns false → filtered out of `_buildMemoryChildren`

**Result**: VERIFIED
- L95–106: `_yearFromMemory` returns null if no year field and no regex match
- L131: `if (!y) return false;` confirmed

---

## Summary

| # | Test | Result |
|---|---|---|
| 1 | No person selected | VERIFIED |
| 2 | Person without timeline spine | VERIFIED |
| 3 | Person with spine and periods | INSPECTED |
| 4 | Life-period click — lori8.0 path | VERIFIED |
| 5 | Life-period click — lori7.4c path | VERIFIED |
| 6 | Memory node click | INSPECTED |
| 7 | Active era highlighting | VERIFIED |
| 8 | No truth mutation | VERIFIED |
| 9 | Tab continuity / regression (lori7.4c) | VERIFIED |
| 9b | Popover continuity / regression (lori8.0) | VERIFIED |
| 10 | Period with no start/end years | VERIFIED |
| 11 | Memory with no year field | VERIFIED |

**VERIFIED: 10 · INSPECTED: 2 · NOT EXECUTED: 0 · FAIL: 0**

The two INSPECTED results (Tests 3 and 6) require a running browser session with populated state to confirm the SVG visual output and the 220ms memory-click delay timing in context.
