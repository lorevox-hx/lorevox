# Mind Elixir Life Map — Prototype Documentation

Branch: `feature/mind-elixir-life-map`

---

## What this is

A visual, navigation-first Life Map tab for Lorevox, built on top of Mind Elixir (or the API-compatible stub bundled in this branch). It renders the life-period spine as an interactive radial tree and wires node clicks into the existing era-navigation runtime.

This is a **prototype**. See the Decision Criteria section before merging.

---

## What is authoritative

The following are the single sources of truth and must never be mutated by the Life Map:

| Source | What it holds |
|---|---|
| `state.timeline.spine.periods` | Life periods (authoritative) |
| Archive layer | Immutable captured facts |
| Facts layer | Reviewed / approved facts |
| Timeline layer | Derived from facts + spine |

The Life Map reads all of these; it writes to none of them.

---

## What is display-only

Everything rendered in the Life Map pane (`pane-lifemap`) is derived and transient:

- The root node (`person`) is built from `state.profile.basics.preferred` / `.fullname`
- Life-period nodes are built from `state.timeline.spine.periods`
- Memory child nodes are built from `state.timeline.memories` where `_yearFromMemory(m)` falls inside the period's `start_year`/`end_year` range
- The birth seed node is built from `state.profile.basics.pob` and `getBirthYear()`
- Active-era highlight is derived from `getCurrentEra()` / `state.session.currentEra`

None of these reads or renders touch the archive or history layers.

---

## How node click routing works

Clicking a **life-period node** (`data.kind === "era"`) triggers this chain, in order:

```
setEra(node.data.era)
  → if interviewMode === "chronological": setPass("pass2a")
  → update71RuntimeUI()
  → renderRoadmap()
  → renderInterview()
  → updateContextTriggers()
  → renderTimeline()
  → LorevoxLifeMap.render(true)   ← re-paints the active highlight
```

Clicking a **memory child node** (`data.kind === "memory"`) routes to the parent era (same chain, minus `renderTimeline`) and updates `#lifeMapSelectionMeta` with the memory title, year, and description snippet.

Clicking the **root (person) node** or the **birth seed node** has no navigation side-effect (display only).

No action writes to facts, timeline records, or the archive.

---

## Vendored library

| File | Purpose |
|---|---|
| `ui/vendor/mind-elixir/mind-elixir.js` | API-compatible SVG tree renderer (stub) |
| `ui/vendor/mind-elixir/mind-elixir.css` | Stub styles |

### Replacing with the real Mind Elixir library

If you want the full Mind Elixir editing experience:

```bash
npm install mind-elixir
cp node_modules/mind-elixir/dist/mind-elixir.umd.js ui/vendor/mind-elixir/mind-elixir.js
cp node_modules/mind-elixir/dist/mind-elixir.css    ui/vendor/mind-elixir/mind-elixir.css
```

The real library exposes the same `MindElixir` global constructor, `map.init()`, and `map.bus.addListener("selectNode", cb)` API, so `life-map.js` needs no changes.

> **No CDN.** The library must always be served locally.

---

## Files changed in this branch

| File | Change type | Summary |
|---|---|---|
| `ui/vendor/mind-elixir/mind-elixir.js` | New | API-compatible SVG tree renderer stub |
| `ui/vendor/mind-elixir/mind-elixir.css` | New | Stub CSS for the renderer |
| `ui/js/life-map.js` | New | `window.LorevoxLifeMap` — data transform + render + nav wiring |
| `ui/lori7.4c.html` | Modified | CSS include, Life Map tab button, pane-lifemap, vendor JS includes |
| `ui/js/tabs.js` | Modified | `showTab('lifemap')` → `LorevoxLifeMap.render(true)` |
| `ui/js/app.js` | Modified | `loadPerson()` and `saveProfile()` call `LorevoxLifeMap.refresh()` |
| `docs/MIND_ELIXIR_PROTOTYPE.md` | New | This file |

---

## Integration points (existing Lorevox functions reused)

`life-map.js` calls these existing functions by name, with `typeof fn === "function"` guards on every call:

- `setEra(label)` — moves Lori into the named life period
- `setPass(passId)` — sets interview pass (called with `"pass2a"` in chronological mode)
- `update71RuntimeUI()` — repaints runtime pills and badges
- `renderRoadmap()` — refreshes the sidebar roadmap list
- `renderInterview()` — refreshes the interview question panel
- `updateContextTriggers()` — refreshes contextual prompt suggestions
- `renderTimeline()` — refreshes the timeline pane
- `getCurrentEra()` — reads the active era label
- `getBirthYear()` — reads the person's birth year
- `prettyEra(label)` — prettifies an era key (optional, falls back to inline formatter)

No new global functions are added to the Lorevox namespace. `window.LorevoxLifeMap` is the only addition.

---

## Limitations of the prototype

1. **Stub renderer, not full Mind Elixir.** The bundled `mind-elixir.js` is an SVG radial tree, not the full Mind Elixir editor. It supports click-to-navigate but not drag, collapse, or context menus. Replace with the real UMD build to get those features.

2. **No real-time spine sync.** The map rebuilds on `refresh()` calls and on `showTab('lifemap')`. It does not watch for spine changes continuously. If a timeline is generated while the map tab is open, click "Refresh Map" or switch away and back.

3. **Memory nodes are year-matched only.** A memory is assigned to a life period if `_yearFromMemory(memory)` falls inside the period's year range. Memories without a year field are silently excluded.

4. **Display only — no editing.** Node text, positions, and structure cannot be edited through the map. All edits go through the Profile and Interview tabs as usual.

5. **Shell scope: `lori7.4c.html` only.** The `lori8.0.html` shell uses a different UI model (no tab-pane system) and is not patched in this branch.

6. **No keyboard navigation.** The stub renderer does not implement arrow-key or focus-ring navigation. Accessibility improvement is deferred.

---

## Decision criteria

### Adopt if

- Life periods render clearly and help users understand the scope of the story
- Clicking nodes to navigate to an era feels intuitive
- Lori responds correctly to the era change (roadmap, interview, timeline update)
- No regressions in existing tabs (Profile, Interview, Memory Triggers, Timeline, Memoir, Summary, Private)

### Hybrid if

- The map is useful as a secondary overview but duplicates the roadmap too closely
- Recommend: keep map, wire expand/collapse per era, remove from primary nav

### Reject if

- Navigation is confusing or slower than the roadmap sidebar
- State synchronisation becomes fragile
- The map creates user confusion about what is editable vs. what is immutable

---

## Next steps if adopted

1. Replace stub with real Mind Elixir UMD build
2. Add collapse/expand per branch (one era at a time)
3. Add person/relationship nodes as a second branch type
4. Add place nodes linked to periods
5. Explore making the map the primary navigation surface (replacing the sidebar roadmap list)
