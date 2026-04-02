# Life Map Scaffold Upgrade Report

## Summary

Life Map now guarantees a visible 6-period life arc for every selected narrator, eliminating the blank-map state that previously appeared when no timeline spine data existed yet.

## Previous Behavior

When a narrator was selected but `state.timeline.spine.periods` was empty or missing, Life Map showed one of two empty-state messages ("The life map is building…" or "No life periods yet…") with no navigable structure. Users saw a blank panel that made the system feel broken, offered no visual guidance about life-story organization, and provided no entry points for era-based navigation.

## New Behavior

Three rendering cases now apply:

**Case A — Rich timeline exists.** Real spine periods render exactly as before, enriched with memories, draft context counts, and era-aware annotations. No change to this path.

**Case B — Narrator selected, no spine periods.** Life Map renders 6 default scaffold periods: Early Childhood, School Years, Adolescence, Early Adulthood, Midlife, and Later Life. If DOB is available, approximate year ranges are computed (e.g., 1835–1840 for Mark Twain's Early Childhood). If DOB is absent, periods display with the subtitle "awaiting story" instead of dates. Scaffold periods have dashed borders and dimmer styling to distinguish them from confirmed timeline data.

**Case C — No narrator selected.** Empty state still shows the "No narrator selected" prompt. This is the only remaining blank-map scenario.

## Why 6 Periods Instead of 36 Roadmap Sections

The full interview roadmap (36–37 sections) serves a different purpose — it structures detailed questioning. Life Map is a high-level narrative spine designed for at-a-glance orientation. The 6-period model was chosen because it:

- Matches how people naturally think about a life arc (childhood → school → adolescence → young adulthood → middle age → later years)
- Stays visually clean and uncluttered
- Provides a stable backbone that Bio Builder, Interview, Family Tree, and Life Threads can enrich over time
- Feels memoir-like rather than survey-like
- Keeps the distinction clear: Life Map = narrative spine, Interview Roadmap = questioning structure

## Implementation Details

### File: `ui/js/life-map.js` (687 → 729 lines)

**New constants:**
- `_DEFAULT_ERA_DEFS` — 6-element array defining label, title, and DOB offsets for each life period
- `_buildDefaultLifePeriods()` — Returns scaffold periods with `isScaffold: true` flag, optionally computing year ranges from DOB

**Modified functions:**
- `_getPeriods()` — Now tries real spine periods first; if narrator is selected but periods are empty/missing/invalid, falls back to `_buildDefaultLifePeriods()`
- `_syncHostVisibility()` — Simplified since scaffold eliminates the "narrator selected but no periods" state; only shows empty message when no narrator is selected
- Period node builder in `buildLifeMapFromLorevoxState()` — Detects scaffold periods and applies dashed-border styling, "awaiting story" subtitle, and scaffold tags

**New NS exposures:**
- `LorevoxLifeMap._buildDefaultLifePeriods` — For testing
- `LorevoxLifeMap._DEFAULT_ERA_DEFS` — For testing

### No changes to other files

The scaffold is fully contained within `life-map.js`. No modifications were needed to `bio-builder.js`, `bio-review.js`, `bio-promotion-adapters.js`, `interview.js`, or `lori8.0.html`. MindElixir applies scaffold styling via inline `style` properties on each node — no additional CSS was required.

## Safety Invariants Preserved

- **No truth-layer writes.** Scaffold periods are computed on the fly during rendering; they are never persisted to `state.timeline.spine` or any other truth layer.
- **No narrator bleed.** Scaffold is built from the currently selected narrator's DOB (if available) and discarded on re-render.
- **No dependency on Family Tree or Life Threads.** Scaffold renders independently of draft data. Draft enrichment is additive when available but never required.
- **Era-click graceful degradation.** Clicking a scaffold period calls `setEra()` with the period's label. Downstream functions handle unknown eras defensively (try/catch wrapping was already in place).
- **Automatic transition.** When real spine data arrives, `_getPeriods()` returns it instead of the scaffold. No manual switch needed.

## Mark Twain Validation

After Bio Builder pipeline work, Mark Twain's Life Map now shows:

1. Birth seed node (Born · 1835)
2. Early Childhood · 1835–1840
3. School Years · 1841–1847
4. Adolescence · 1848–1852
5. Early Adulthood · 1853–1865
6. Midlife · 1866–1894
7. Later Life · 1895+

All 6 periods are clickable, visually distinct (dashed borders), and ready to accept enrichment from questionnaire data, quick capture, source inbox, candidates, family tree, and life threads.
