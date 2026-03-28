# Life Map — Next Improvement Log

Branch: `feature/mind-elixir-life-map`
Date: 2026-03-26

---

## What This Improvement Did

Turned the Life Map from a prototype that "works" into a Lorevox-native working-context navigator.
The primary reference is `jumpToSection()` in memoir preview — click → jump into interview work.

---

## Changes Made

### 1. Memory Node Anchor Labeling (`life-map.js`)

**Before**: `"Memory Title (1965)"` — indistinguishable in format from a verified fact label.

**After**: `"◦ Memory Title · 1965"`

The hollow bullet `◦` marks these nodes as "anchor / navigation cue", not a "record."
The `·` separator is consistent with era node style (`"Early Life · 1940–1960"`).
The border changed from solid (`1px solid`) to dashed (`1px dashed`) — visually distinct from era nodes.

**Why it matters**: Memory nodes in `state.timeline.memories` may include speculative or partial items. Displaying them in the same format as a confirmed fact is misleading. The `◦` + dashed border gives a clear visual signal: "this is an anchor, not an authority."

### 2. Meta Bar — Active Era Context (`life-map.js`)

**Before**: `"Lori is in: Early Life — click any period to navigate there."`

**After**: `"Lori is in: Early Life · 3 memories anchored — click a period to navigate, or use the button below."`

Meta bar now shows:
- Which era Lori is currently working in
- How many memories are anchored in that era
- A clear reference to the persistent action button

When no era is active: `"Click a life period to move Lori into that era and continue the interview."`

### 3. Persistent "Continue in Interview" Button (`lori8.0.html`, `life-map.js`)

Added `#lifeMapActionBar` + `#lifeMapGoBtn` to the Life Map popover.

The button is always visible at the bottom of the popover.
Its label is set dynamically by `render()`:
- With active era: `"→ Continue in Early Life"`
- Without active era: `"→ Continue in Interview"`

Clicking calls `window.LorevoxLifeMap.jumpToCurrentEra()`.

This provides two ways to jump to interview:
1. Click a life-period node (specific era navigation — closes immediately)
2. Click the "Continue" button (current era, always available)

### 4. `jumpToCurrentEra()` Public Method (`life-map.js`)

New method on `window.LorevoxLifeMap`:
- Reads `state.session.currentEra` via `_currentEra()`
- If an era is active: refreshes context with the same chain as era-node click
- Calls `_jumpToInterview()` to dismiss popover / switch to Interview tab
- Safe to call even when no era is active (skips era refresh, still jumps)

This is registered as `NS.jumpToCurrentEra = jumpToCurrentEra` and exposed on `window.LorevoxLifeMap`.

### 5. Click-Path Hardening (`life-map.js`)

Both era-click and memory-click paths now:
- Use individual `try/catch` blocks per UI refresh call
- This prevents a single missing DOM element (e.g., `#roadmapList` absent in lori8.0) from aborting the chain
- State setters (`setEra`, `setPass`) run before DOM refresh calls and are not wrapped, so era state is always updated even if UI refresh throws

---

## UX Decisions

**Life-period node click**: Immediate jump to Interview.
→ See `docs/LIFE_MAP_UX_DECISION.md` for full rationale.

**Memory node click**: 220ms meta-display then jump to Interview.
→ Memory title + year appears in meta bar → `_jumpToInterview()` fires after 220ms.

**Persistent button**: "→ Continue in [Era]" — always visible, mirrors the `jumpToSection` idiom without requiring node click.

---

## What Remains Future Work

| Item | Why deferred |
|---|---|
| Era-visited state (`sectionVisited` equivalent) | Requires state schema change + persistence |
| Scroll/pan to active node on map open | Requires stub renderer extension |
| Real Mind Elixir library | npm blocked; stub is API-compatible replacement |
| Memory source distinction (Archive vs. History) | Requires fact-source tagging in data model |
| Map animation (fade/slide in on open) | CSS-only enhancement; low priority |

---

## Files Changed

| File | Change |
|---|---|
| `ui/js/life-map.js` | Memory node topic + style; meta bar; `jumpToCurrentEra()`; click hardening |
| `ui/lori8.0.html` | `#lifeMapActionBar`, `#lifeMapGoBtn` DOM + CSS |
| `ui/docs/LIFE_MAP_UX_DECISION.md` | New — full decision record |
| `ui/docs/LIFE_MAP_NEXT_IMPROVEMENT.md` | This file |
