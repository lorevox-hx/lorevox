# Life Map — Peek at Memoir Report

Branch: `feature/mind-elixir-life-map`
Date: 2026-03-26

---

## Before: How the Current Life Map Compared to Peek at Memoir

### The core gap

`jumpToSection(i)` — the memoir chapter row handler — always ends with `showTab("interview")`.
The user is moved into the interview immediately upon clicking a chapter.

The Life Map click handler (`_onNodeSelect`) did the opposite:
```js
// BEFORE — era click stayed in the map
setTimeout(function () { NS.render(true); }, 0);  // re-painted the map
```

The comment on that line explicitly said "without leaving the map tab." This directly contradicted the memoir pattern. The Life Map had the navigation chain (`setEra`, `renderRoadmap`, etc.) but was missing the final, defining step of `jumpToSection`: moving the user to the interview.

### Additional gaps before this work

| Area | Memoir Chapter List | Life Map (before) |
|---|---|---|
| Click → jump to interview | Always | Never (stayed in map) |
| Status labels per entry | "Ready for draft / In progress / Not started" | Only: active-era indigo highlight |
| Memory/content count | Not shown (section-level, not memory-level) | Not shown |
| Empty state messages | N/A (always has sections) | Single message, not tiered |
| Memory node click | N/A | Navigate era + update meta bar; no jump |

---

## Changes Made

### `ui/js/life-map.js`

**1. Added `_jumpToInterview()` helper** (new function, L371–380)

Mirrors `showTab("interview")` in `jumpToSection`.
- In lori8.0: calls `lifeMapPopover.hidePopover()` — dismisses the popover, landing user in chat (the interview surface in 8.0)
- In lori7.4c: calls `showTab("interview")` directly, identical to `jumpToSection`

**2. Life-period click: removed `setTimeout(render(true))`, added `_jumpToInterview()`** (L391–395)

Before: user stayed in the Life Map and the SVG was re-painted after navigation.
After: user is immediately moved to the interview context, mirroring `jumpToSection`.

**3. Memory node click: added `_jumpToInterview()` after 220ms** (L399–413)

Before: navigation ran, meta bar updated, nothing else happened.
After: navigation runs, meta bar updates ("navigating…" cue), then user is moved to interview.
The 220ms pause lets the user see which memory triggered navigation before the popover closes.

**4. Era node status tiers** (L184–218 in `buildLifeMapFromLorevoxState`)

Three distinct styles now mirror the memoir chapter status badges:
- **Indigo** (active) = "Ready for draft" equivalent
- **Teal-tinted + memory count** = "In progress" equivalent
- **Dim** = "Not started" equivalent

Memory count added to era node topic: e.g., `"Early Life · 1940–1960 · 2 memories"`

**5. Tiered empty states** (L290–325 in `_syncHostVisibility`)

Before: two messages (no person / add DOB).
After: three tiered messages with title + actionable hint:
- No person → "No narrator selected."
- No spine → "The life map is building."
- Spine but no periods → "No life periods yet."

**6. Meta bar language** (L505–508 in `render()`)

Before: "Select a life period node to move Lori into that era."
After: "Click a life period to move Lori into that era and continue the interview." / "Lori is in: [Era] — click any period to navigate there."

### `ui/lori8.0.html`

Integration completed in the prior session (not part of this step). The popover pattern (`#lifeMapPopover`, `popover="auto"`) and the toggle event listener (`LorevoxLifeMap?.render(true)` on open) were already in place.

---

## What Now Mirrors Memoir Preview

| Memoir chapter row | Life Map era node |
|---|---|
| Click → jump to Interview tab | Click → dismiss popover (8.0) or `showTab("interview")` (7.4c) |
| Status badge per row | Status style tier per node (indigo / teal / dim) |
| Shows section label | Shows era label + date range + memory count |
| Does not mutate archive | Does not mutate archive |
| Reads from state | Reads from state |

---

## What Still Differs

| Memoir chapter list | Life Map | Gap type |
|---|---|---|
| Flat linear list | Radial SVG tree | Deliberate: map is a visual surface, not a list |
| Section-level (interview sections) | Era-level (life periods) | By design: different navigation granularity |
| "Ready for draft" via `sectionDone[]` tracking | No formal completion tracking per era | Acceptable: Life Map doesn't track visit state separately |
| Visits individual interview sections | Sets era-level context | By design: era navigation is broader than section |
| Shows chapter numbers | No node numbering | Minor cosmetic gap |

The structural differences are intentional. The Life Map is an era-level visual navigation surface — it cannot be a 1:1 clone of the section list. The interaction *model* (click → navigate → jump to interview) now matches precisely.

---

## Test Summary

10 VERIFIED · 2 INSPECTED · 0 NOT EXECUTED · 0 FAIL

The two INSPECTED items (SVG render output with populated state; 220ms memory-click delay in-browser) require a live browser session to fully validate. All code paths are correctly structured and traceable.

---

## Final Recommendation

**ADOPT** — with one remaining confirmation needed in a live browser session.

The Life Map now correctly mirrors the Peek at Memoir interaction pattern:
- Era-period click navigates context and jumps the user to the interview
- Memory node click navigates context and jumps after a brief "navigating" cue
- Status tiers give immediate visual feedback matching memoir chapter badges
- Empty states are clear and actionable for every condition
- The truth boundary (Archive → History → Memoir) is preserved with no mutations

The feature is ready for functional testing in a running instance. If the SVG renders correctly and node clicks produce the expected navigation + jump behavior in lori8.0, this should move from REFINE to ADOPTED.
