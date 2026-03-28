# Life Map — Peek at Memoir Behavior Contract

Branch: `feature/mind-elixir-life-map`
Last updated: 2026-03-26

---

## Origin of the Interaction Pattern

The Life Map interaction model **did not come from an external repository.**
It comes from Lorevox itself.

Specifically: the memoir chapter list already behaves as a "peek at memoir" navigation surface.
Each chapter row calls `jumpToSection(i)`, defined in `ui/js/app.js`:

```js
function jumpToSection(i) {
  sectionIndex = i;
  sectionVisited[i] = true;
  renderRoadmap();
  updateContextTriggers();
  showTab("interview");
}
```

This function:
1. Sets the current interview section
2. Marks it visited (state change)
3. Refreshes the roadmap and context triggers
4. **Jumps the user directly to the Interview tab**

The Life Map mirrors this pattern exactly, but substitutes section-based navigation
with era-based navigation.

> **Peek at Memoir = section-based navigation into interview flow**
> **Life Map = era-based navigation into interview flow**

---

## Broader Architecture Context

Lorevox's architecture was informed by repo analysis of:
- Google Always-On Memory Agent
- OpenWebUI
- paperless-ngx
- paperless-gpt

For this feature, the direct UX reference is Lorevox itself, not those repos.

---

## Memoir Chapter Preview — Pattern Summary

| Element | Memoir Chapter List |
|---|---|
| Surface | `memoirChapterList` — rendered by `renderMemoirChapters()` |
| Entry | Chapter row (`chapter-row` div) |
| Status labels | "Ready for draft" / "In progress" / "Not started" |
| Click action | `jumpToSection(i)` |
| Navigation | Sets `sectionIndex`, marks visited, calls `renderRoadmap()` + `updateContextTriggers()`, then `showTab("interview")` |
| Authority | The chapter list is NOT the source of truth — it is a preview of `state` |
| Truth model | Archive → History → Memoir (the list renders from state, never writes to archive) |

---

## Life Map — Equivalent Behavior

| Element | Life Map |
|---|---|
| Surface | `#lifeMapPopover` (lori8.0 popover) or `#pane-lifemap` (lori7.4c tab pane) |
| Entry | Life-period node (first-level SVG node) |
| Status labels | Indigo highlight (active era) / Teal tint + memory count (has content) / Dim (not started) |
| Click action | `_onNodeSelect(rawNode)` |
| Navigation | Calls `setEra()`, `setPass("pass2a")` if chronological, `update71RuntimeUI()`, `renderRoadmap()`, `renderInterview()`, `updateContextTriggers()`, `renderTimeline()`, then `_jumpToInterview()` |
| Authority | The map is NOT the source of truth — it renders from `state.timeline.spine.periods` |
| Truth model | Archive → History → Memoir (the map never writes to archive, facts, or spine) |

---

## What Auto-Jumps

### Life-period node click
The user is immediately jumped to the interview context.
- **lori8.0**: `lifeMapPopover.hidePopover()` — popover dismisses, user lands in the chat window (which is the interview in 8.0)
- **lori7.4c**: `showTab("interview")` — direct tab switch, identical to `jumpToSection()`

The life-period navigation chain runs first, so when the user arrives in the interview:
- The era is already set
- The roadmap reflects the chosen period
- Context triggers are updated
- The timeline is refreshed

### Memory node click
Memory nodes are navigation cues into their parent era, not truth assertions.
- The parent era is identified and set via `_navigateToEra(data.era)`
- The meta bar shows memory title + year + description snippet
- After 220ms (so user can see the selection), `_jumpToInterview()` is called
- The user lands in the interview context with the era set to the memory's period

---

## What Stays Visual Only

| Element | Behavior |
|---|---|
| Root node (person) | Display only — no click action |
| Birth seed node | Display only — shows birth year and place |
| Memory node (before 220ms timeout) | Meta bar updates; map stays open briefly |
| Node style tiers | Visual status feedback (indigo / teal / dim) — no navigation |

---

## Node Status Tiers (mirrors chapter-status badges)

| Memoir chapter status | Life Map era node |
|---|---|
| "Ready for draft" | Active era — indigo highlight + stronger border |
| "In progress" | Has memories — teal-tinted + memory count in topic |
| "Not started" | No memories — dim background + muted text |

---

## Empty States (mirrors memoir preview clarity)

Each empty state tells the user exactly what is missing and what to do next:

| Condition | Title | Hint |
|---|---|---|
| No person selected | "No narrator selected." | "Choose a person from the selector above…" |
| Person exists, no spine | "The life map is building." | "Share a name, date of birth, and birthplace with Lori…" |
| Spine exists, zero periods | "No life periods yet." | "Continue the interview — Lori will plot life periods here…" |

---

## Truth-Boundary Guardrails

The Life Map is a view + navigation layer only. It preserves the Lorevox truth architecture:

```
Archive → History → Memoir
```

Specifically:
- **No archive mutation**: `_navigateToEra()` calls only session-state setters (`setEra`, `setPass`) and UI refresh functions. No archive writes.
- **No facts mutation**: Memory nodes display `state.timeline.memories` for navigation only. Clicking a memory node does not modify the facts store.
- **No timeline spine writes**: `buildLifeMapFromLorevoxState()` reads `state.timeline.spine.periods` read-only. Nothing in life-map.js writes to the spine.
- **No parallel state machine**: The map has no independent state object. All state comes from the global `state` object via existing accessors.
- **Memory nodes are cues, not assertions**: Memory nodes are explicitly not displayed as verified facts. The meta bar text does not use "fact," "confirmed," or "verified" language.

---

## Function-Level Mapping: jumpToSection vs. Life Map

```
jumpToSection(i)                    _onNodeSelect (era node)
────────────────────────────────    ─────────────────────────────────────
sectionIndex = i                    setEra(period.label)
sectionVisited[i] = true            update71RuntimeUI()
renderRoadmap()                     renderRoadmap()
updateContextTriggers()             updateContextTriggers()
showTab("interview")                _jumpToInterview()
                                      → popover.hidePopover()  [lori8.0]
                                      → showTab("interview")   [lori7.4c]
                                    + renderInterview()
                                    + renderTimeline()
                                    + setPass("pass2a") if chronological
```

Life Map's navigation chain is a superset of `jumpToSection` — it calls additional
refresh functions appropriate to era-level navigation.
