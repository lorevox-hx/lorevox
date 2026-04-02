# Cold Start Persistence and Visual Truth Test — Bug Log

## Bugs Found During Cold Start Test

| ID | Severity | Area | Repro | Expected | Actual | Suspected Cause | Fix | Status |
|---|---|---|---|---|---|---|---|---|
| CS-1 | Critical | Bio Builder / Popover Render Guard | Open Bio Builder on cold start (no console injection) | BB should render "Capturing biography" with narrator data | BB shows "Choose a narrator to begin" (blank state) | `bio-builder.js` lines 1244, 3193: render guard checks `host.hasAttribute("open")` but Popover API uses `:popover-open` pseudo-class, not HTML `open` attribute | Changed guard to: `if (!host \|\| (!host.hasAttribute("open") && !host.matches(":popover-open")))` | FIXED |
| CS-2 | Critical | Life Map / Popover Render Guard | Open Life Map on cold start (no console injection) | Life Map should render 6-period MindElixir scaffold | Life Map panel opens but MindElixir area is completely blank | `life-map.js` line 621: same Popover API mismatch as CS-1 | Changed guard to check both `open` attribute and `:popover-open` pseudo-class | FIXED |
| CS-3 | High | Profile Loading / Race Condition | Switch narrators rapidly: Chuck → MT → Janice → Chuck | `state.profile` should match current dropdown selection | `state.profile` can retain data from an intermediate narrator | `loadPerson()` has no guard against superseded async fetches completing out of order | Added `_loadGeneration` counter; abort assignment if generation has advanced | FIXED |
| CS-4 | Medium | FT/LT Draft Loading | Switch to Mark Twain (who has FT/LT drafts in localStorage) | FT/LT drafts should load into `state.bioBuilder.familyTreeDraftsByPerson` | `state.bioBuilder` shows 0 nodes despite localStorage containing 12 FT nodes + 13 LT nodes | `_personChanged()` may not be loading from localStorage, or the `{v:1, data:{nodes,edges}}` wrapper is not being unwrapped | NOT FIXED — requires deeper investigation of `_personChanged()` load path |
| CS-5 | Low | Quick Capture / Placeholder | Open BB Quick Capture for Chuck Norris or Mark Twain | Placeholder should reference current narrator | Placeholder says "e.g. Janice was born in Spokane, WA in 1939" | Placeholder text hardcoded or cached from first narrator loaded, not updated dynamically | NOT FIXED — cosmetic, requires update to Quick Capture render |
| CS-6 | Low | Zodiac / Hydration | Load narrator with known DOB (e.g., Chuck Norris, 1940-03-10) | Zodiac field should auto-derive to Pisces | Zodiac field shows "— select —" (empty) | `autoDerive: "zodiacFromDob"` only fires on manual input, not during reverse hydration | NOT FIXED — requires change to `_hydrateQuestionnaireFromProfile()` |

## Bugs NOT Found (Regression Checks)

| Area | Check | Result |
|------|-------|--------|
| Stale narrator resurrection | Deleted/stale narrators reappearing after cold start | No resurrection |
| Narrator data corruption | Profile data changed or corrupted after restart | No corruption |
| Dropdown mismatch | Dropdown and actual persisted narrators disagree | No mismatch |
| Cross-narrator bleed | Chuck data in Mark Twain or Janice views | No bleed |
| localStorage contamination | Stale keys causing wrong behavior | No contamination |
| API offline fallback | Profile loads from localStorage when API slow | Working |
| Active narrator persistence | Last selected narrator restored after restart | Working |
| Lori greeting accuracy | Greeting references wrong narrator after cold start | Accurate for current narrator |
