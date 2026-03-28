# Life Map — UX Decision Record

Branch: `feature/mind-elixir-life-map`
Date: 2026-03-26

---

## Source UX Pattern

The Life Map UX comes directly from Lorevox's own memoir preview behavior.
It does NOT derive from any external repository.

In Lorevox (`app.js`, `renderMemoirChapters`):
```js
function jumpToSection(i) {
  sectionIndex = i;
  sectionVisited[i] = true;
  renderRoadmap();
  updateContextTriggers();
  showTab("interview");
}
```

Every memoir chapter row calls `jumpToSection(i)` on click.
The user is immediately placed in the Interview tab at that section.
The preview is a navigation surface — not an editing surface.

---

## Why Life Map Mirrors This

The Life Map is the visual, era-based equivalent of the memoir chapter list.

| Memoir chapter list | Life Map |
|---|---|
| Linear list of interview sections | Radial SVG map of life periods |
| Click row → jump to Interview | Click node → jump to Interview |
| Shows section status (ready / in-progress / empty) | Shows era status (active / has-content / empty) |
| Does not write to archive | Does not write to archive |
| Reads from state | Reads from state |

Both surfaces are **preview-and-navigate**, not **edit-and-save**.

---

## Decision 1: Life-Period Node Click

**Chosen behavior: Immediate jump to Interview.**

Rationale:
- This is the direct mirror of `jumpToSection()`, which always ends with `showTab("interview")`
- There is no UX value in staying in the map after clicking an era — the era context is now set, the interview is where the work happens
- In lori8.0, "jump to Interview" = dismiss the popover → user lands in chat (the interview surface)
- In lori7.4c, "jump to Interview" = `showTab("interview")` → direct tab switch

Implementation:
```js
// _onNodeSelect, era branch
_jumpToInterview();            // ① dismiss/switch first (always succeeds)
setEra(data.era);              // ② state update
setPass("pass2a");             // ③ if chronological
update71RuntimeUI(); etc.      // ④ UI refresh (try-catch per call)
```

`_jumpToInterview()` is called **before** the navigation refresh chain.
This guarantees the popover closes even if any refresh function throws
(e.g., in lori8.0 where some UI elements like `#roadmapList` do not exist).

---

## Decision 2: Memory Node Click

**Chosen behavior: Brief meta-display (220ms), then jump to Interview.**

Rationale:
- Memory nodes are secondary anchors within an era — they don't need their own full-screen display
- Showing the memory title + year in the meta bar for 220ms before jumping gives the user confirmation of what they selected
- Jumping afterward puts them in the interview context with the correct era set
- 220ms is short enough to feel responsive, long enough to be readable

Memory nodes are **not** treated as verified facts. The meta bar shows the memory title + year from `state.timeline.memories` — these are navigation cues, not truth assertions.

Visual marking:
- Memory node topics use `◦ Title · Year` format — the hollow bullet `◦` signals "anchor/cue", not "record/fact"
- Memory node borders use dashed stroke: `1px dashed rgba(52,211,153,.25)` — visually distinguishes them from era nodes which use solid borders

---

## Decision 3: Persistent "Continue in Interview" Button

**Decision: Add a persistent `→ Continue in Interview` button at the popover footer.**

Rationale:
- Not all users will know to click a specific SVG node to navigate
- A persistent button provides a clear, always-visible next-step affordance
- The button label updates to reflect the current era: `→ Continue in Early Life`
- This mirrors the "Go to interview" idiom without requiring node interaction
- `jumpToCurrentEra()` exposed on `window.LorevoxLifeMap` for use by the button

This gives two routes to Interview:
1. Click an era/memory node (specific navigation)
2. Click "Continue in Interview" button (current era navigation)

Both routes call `_jumpToInterview()`. Both routes update era context first.

---

## Truth-Boundary Notes

The Life Map preserves `Archive → History → Memoir`:

- `setEra()` writes only to `state.session.currentEra` (session state, not archive)
- `setPass()` writes only to `state.session.currentPass` (session state, not archive)
- No writes to `state.archive`, `state.facts`, `state.timeline.spine`, or `state.timeline.memories`
- Memory nodes display from `state.timeline.memories` read-only
- Period nodes are built from `state.timeline.spine.periods` read-only
- The map never implies that what it shows is the same as what is archived

---

## Active-State Synchronization

The map reflects current era correctly across all normal usage patterns:

| Scenario | Mechanism |
|---|---|
| Popover opens | `toggle` listener → `render(true)` → rebuilds with current `state.session.currentEra` |
| Era changes via era-node click | `_jumpToInterview()` dismisses popover; next open rebuilds fresh |
| Era changes externally, user returns to Life Map | `render(true)` on next open → `_signature()` includes era → full rebuild |
| `loadPerson()` completes | `LorevoxLifeMap.refresh()` called from app.js |
| `saveProfile()` completes | `LorevoxLifeMap.refresh()` called from app.js |
| Map open while era changes (edge case) | Not possible in lori8.0 — popover covers UI; in lori7.4c user would be on different tab |

The `_signature()` function includes `era: _currentEra()`. Any era change causes a signature mismatch, which forces a full rebuild on next `render()` call.

---

## Future Work (Not in Scope of This Branch)

1. **Era-visited tracking**: `sectionVisited[]` exists for interview sections. No equivalent for eras. Adding it would require state schema changes and persistence — deferred.
2. **Scroll-to-active-node**: In a large map, automatically scroll/pan to the active era node on open. Requires extending the stub renderer.
3. **Real Mind Elixir library**: Replace stub renderer if npm access is restored.
4. **Memory-source distinction**: Show whether a memory came from Archive, History, or a manual entry. Requires fact-source tagging in the data model.
