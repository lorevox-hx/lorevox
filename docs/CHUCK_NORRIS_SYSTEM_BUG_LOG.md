# Chuck Norris — System Bug Log

## Bugs Found During Chuck Norris System Test

| ID | Severity | Area | Repro | Expected | Actual | Suspected Cause | Fix |
|---|---|---|---|---|---|---|---|
| CN-1 | High | Narrator Switching / Profile Load | Switch Chuck → MT → Janice → Chuck rapidly via dropdown | `state.profile` should contain Chuck Norris data (Carlos Ray Norris, 1940-03-10, Ryan OK) | `state.profile` contains Mark Twain data (Samuel Langhorne Clemens, 1835-11-30, Florida MO) while `state.person_id` is Chuck's UUID | Race condition in dropdown change handler — `loadPerson()` not reliably called or completes with stale data during rapid switches | Add guard in `loadPerson()`: after fetch completes, verify `state.person_id` still matches `pid` before assigning profile. If mismatch, re-fetch for current `state.person_id`. |
| CN-2 | Low | Quick Capture / Placeholder | Open BB Quick Capture tab for Chuck Norris | Placeholder should reference Chuck or be generic | Placeholder says "e.g. Janice was born in Spokane, WA in 1939" — references a different narrator | Placeholder text is hardcoded or cached from a previous narrator and not updated on narrator switch | Update Quick Capture placeholder dynamically using `state.profile.basics.preferred` and `state.profile.basics.pob` |
| CN-3 | Medium | Bio Builder / Popover Render Guard | Click Bio Builder button to open BB for any narrator | BB should render with "Capturing biography" and show narrator data | BB shows "Choose a narrator to begin" (blank state) until `open` attribute is manually set on `#bioBuilderPopover` | Same as BUG-1 from prior test — Popover API uses `:popover-open` pseudo-class, not HTML `open` attribute. The render guard at bio-builder.js line 1244 checks `host.hasAttribute("open")` | Change guard to: `if (!host \|\| (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;` |
| CN-4 | Medium | Life Map / Popover Render Guard | Click Life Map button | Life Map should render scaffold immediately | Life Map panel opens but MindElixir is blank until `open` attribute is set on `#lifeMapPopover` | Same popover API mismatch as CN-3. life-map.js line 621 checks `popover.hasAttribute("open")` | Same fix pattern — check both `open` attribute and `:popover-open` pseudo-class |
| CN-5 | Low | Zodiac Auto-Derive | Load Chuck with DOB 1940-03-10 | Zodiac should auto-derive to Pisces | Zodiac field shows "— select —" (empty) | Zodiac auto-derive only triggers on manual DOB input via the questionnaire form, not on reverse hydration from profile | Fire `autoDerive: "zodiacFromDob"` during `_hydrateQuestionnaireFromProfile()` when DOB is set |

## Bugs NOT Found (Regression Checks)

| Area | Check | Result |
|------|-------|--------|
| Narrator duplication | Chuck Norris created twice | No duplication |
| Identity collapse | Legal name overwriting public name | Names remain distinct |
| Movie title misbucketing | Film titles appearing as people or family members | No misbucketing |
| Candidate explosion | Movie/TV density causing duplicate flood | No explosion |
| Family Tree fabrication | Movie characters appearing as relatives | No fabrication |
| Life Threads spam | Film titles overwhelming thread space | No spam |
| Life Map clutter | Movie-dense timeline breaking scaffold | No clutter |
| Narrator bleed (MT) | Chuck data appearing in Mark Twain surfaces | No bleed |
| Narrator bleed (Janice) | Chuck data appearing in Janice surfaces | No bleed |
| Narrator bleed (Chuck←MT) | Mark Twain data in Chuck's BB/QC/Source/FT/LT | No bleed (except CN-1 profile race) |
| Render performance | Slowdown with 11 QC items, source card, dense career data | No slowdown |
| Display overflow | Long film/TV title text causing layout break | No overflow |

## Known Limitations (Not Bugs)

1. **BB questionnaire is session-scoped** — questionnaire data (except FT/LT) does not persist across hard reloads. This is by design but means questionnaire fills for Chuck are lost on page refresh.
2. **Candidate extraction requires pipeline** — seeding Source Inbox text creates a source card but automatic extraction into candidate buckets requires the Lori pipeline to process. Manual candidate creation works.
3. **API lacks DELETE endpoint** — stale test narrators in the DB are hidden by `lorevox_draft_pids` filter but not removed.
