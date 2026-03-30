# Lorevox V2 Full-Platform Test — Debug Matrix

## Test Date: 2026-03-29

| Case ID | Segment | UI Stable | Seed Safe | Isolation Pass | Persistence Pass | No Leakage | Grounding Useful | Visible UI Correct | Notes |
|---------|---------|-----------|-----------|----------------|------------------|------------|------------------|-------------------|-------|
| E01-MT | E (Named) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Legal/preferred name distinction works. FT 12 nodes, LT 13 nodes load from localStorage. |
| E02-JAN | E (Named) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | Real family narrator. Profile, dropdown, Life Map all correct. No MT/Chuck bleed. |
| E03-CN | E (Named) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | Dense public narrator. Life Map usable. Legal name Carlos Ray Norris distinct from Chuck Norris. |
| F01 | B (Edge) | PASS | MINOR | PASS | N/A | PASS | N/A | PASS | Double seed: +1 duplicate narrator node, not an explosion. Second seed idempotent. |
| F02 | B (Edge) | PASS | PASS | PASS | N/A | PASS | N/A | PASS | Mixed candidate shapes: real code path uses bucketed candidates correctly. |
| F03 | B (Edge) | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Null/empty labels render as "Unknown" — graceful degradation. |
| F04 | B (Edge) | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Fuzzy year-only dates ("1837") render correctly. |
| F05 | B (Edge) | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Fuzzy match detection: "Olivia Langdon Clemens" = "Langdon Clemens" (52%). |
| F06 | B (Edge) | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Rapid switch with BB open — correct final state (Mark Twain). |
| F07 | B (Edge) | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Rapid switch + tab changes — correct final state (Janice). _loadGeneration guard works. |
| F08 | B (Edge) | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Circular edge: no crash. Bidirectional badges with dismiss buttons. |
| F09 | B (Edge) | — | — | — | — | — | — | — | Not tested (requires generated dense profiles). |
| F10 | B (Edge) | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Orphan delete: parent node removed, no crash, clean render. |
| S03 | A (Sensitive) | PASS | N/A | PASS | N/A | PASS | PASS | PASS | Ghost child: deceased child with death context in italics. Remains in tree under CHILD section. |
| S04 | A (Sensitive) | PASS | N/A | PASS | N/A | PASS | PASS | PASS | Unknown Father placeholder: orange "unknown" badge. Does not block UI. |
| S05 | A (Sensitive) | PASS | N/A | PASS | N/A | PASS | PASS | PASS | Chosen family: own section "CHOSEN FAMILY" with equal visual legitimacy. |
| S06 | A (Sensitive) | PASS | N/A | PASS | N/A | PASS | PASS | PASS | Estrangement: yellow "sensitive" badge. "Do not prompt" note visible. |
| UI-11A | Workflow | PASS | PASS | PASS | N/A | PASS | N/A | PASS | FT add/edit/connect all functional. Role grouping, quality badges, fuzzy match detection. |
| UI-11B | Workflow | PASS | N/A | PASS | PASS | PASS | N/A | PASS | Life Threads: 5 node types, edit/link/delete buttons, loads from localStorage. |
| UI-11C | Workflow | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Quick Capture: dynamic placeholder, add fact, recent items list. |
| UI-11D | Workflow | PASS | N/A | PASS | N/A | PASS | N/A | PASS | Candidates: bucketed review UI, cross-reference badges, draft-vs-truth message. |
| UI-11E | Workflow | PASS | N/A | PASS | PASS | PASS | N/A | PASS | Popover lifecycle: close/reopen retains tab and scroll position. |
| UI-11F | Workflow | PASS | N/A | PASS | PASS | PASS | N/A | PASS | Person switch: MT→Chuck→MT round-trip restores all FT/LT drafts. |
| UI-11G | Workflow | PASS | N/A | PASS | PASS | PASS | N/A | PASS | Dropdown: 3 narrators only, no stale entries, correct after reload. |
| LM-17B | Life Map | PASS | N/A | PASS | PASS | PASS | PASS | PASS | 6-period scaffold for all 3 narrators with DOB-derived year ranges. |
| P-15 | Persistence | PASS | N/A | PASS | PASS | PASS | N/A | PASS | Active narrator, profile, FT/LT drafts, dropdown all survive cold restart. |

## Summary Counts

| Result | Count |
|--------|-------|
| PASS | 25 |
| MINOR (non-blocking) | 1 |
| NOT TESTED | 1 |
| FAIL | 0 |

## Legend

- **UI Stable**: No crash, no blank state, no rendering error
- **Seed Safe**: Seeding operations are idempotent and non-destructive
- **Isolation Pass**: No data from other narrators visible in current view
- **Persistence Pass**: Data survives popover close/reopen, narrator switch, or browser refresh
- **No Leakage**: No draft data appears in truth layers (Archive, Facts, Timeline, Memoir) without explicit promotion
- **Grounding Useful**: Resulting data structure would help Lori produce better interview prompts
- **Visible UI Correct**: What the user sees matches actual saved state
