# Family Tree & Life Threads — v5 Integration Report

**Date:** 2026-03-28
**Build:** Bio Builder v5 Integration

## Summary

v5 integrates the Family Tree (FT) and Life Threads (LT) draft surfaces into four downstream Lorevox systems: Interview prompts, Candidate Review, Life Map, and Memoir. All integrations are read-only — they query `LorevoxBioBuilder._getDraftFamilyContext()` and never write to truth layers.

## Integration Architecture

### Central Accessor
All integrations use a single entry point:
```javascript
LorevoxBioBuilder._getDraftFamilyContext(pid)
// Returns: { familyTree: { nodes, edges }, lifeThreads: { nodes, edges } }
```

This function:
- Accepts optional pid (defaults to current narrator)
- Returns null if no draft exists
- Returns a snapshot (not a live reference)
- Never exposes private notes or "Do Not Prompt" flagged data downstream

### Safety Invariants
1. **Read-only**: No integration writes to `state.bioBuilder`, `state.archive`, `state.facts`, or `state.timeline`
2. **Draft-flagged**: All outputs include `isDraft: true` or similar markers
3. **Do Not Prompt**: Nodes with "Do Not Prompt" in their notes are excluded from all downstream surfaces
4. **Narrator excluded**: The narrator root node is filtered from people lists
5. **No truth leakage**: Draft context is clearly labeled as unapproved staging data

## Pass 4 — Interview Prompt Integration

### File: `ui/js/interview.js`

#### `build71InterviewPrompt()` Enhancement
The pass-aware prompt builder now appends a draft context hint via `_buildDraftContextHint(era)`. This gives Lori awareness of:
- Family members (up to 3, with roles) from the FT draft
- Life themes (up to 3) from the LT draft

Example enriched prompt:
> "Let's begin near the beginning..." (Family context: parent Margaret, sibling Tom, spouse James.) (Life themes: Family Bonds, Career Change.)

#### `updateContextTriggers()` Enhancement
The era-anchored context trigger cards now include a "From Bio Builder draft" section showing:
- Family members as "Ask about [role]: [name]" trigger cards
- Life themes as "Explore theme: [name]" trigger cards
- Limited to 4 items maximum to avoid overwhelming the UI
- Styled with teal border-left to distinguish from era prompts

### Safety
- "Do Not Prompt" nodes are excluded via regex check on `node.notes`
- Only labels and roles are surfaced — no private notes, no edge details

## Pass 5 — Review Integration

### File: `ui/js/bio-review.js`

#### `_draftCrossRef(candidate)` — New Function
Checks whether a candidate's value already exists in the FT or LT draft:
```javascript
// Returns: { inFT: bool, inLT: bool, ftNode: obj|null, ltNode: obj|null }
```

#### Queue Card Badges
Each candidate card in the review queue now shows small "FT" and/or "LT" badges if the candidate's value matches an existing draft node. Badges use:
- Teal background for FT matches
- Purple background for LT matches

#### Detail View Cross-Reference Block
When a candidate matches FT/LT draft data, a new "Bio Builder Cross-Reference" block appears in the detail pane showing:
- "Already in Family Tree (role)" chip
- "Already in Life Threads (type)" chip
- Explanatory text: "This candidate is already represented in the draft surfaces above."

### Safety
- Cross-reference is display-only — no automatic actions
- Matching is case-insensitive exact match on display names
- No private notes from FT/LT are exposed in the review UI

## Pass 6 — Memoir and Life Map Integration

### File: `ui/js/life-map.js`

#### `_getDraftContext()` — New Helper
Internal function that reads the Bio Builder draft via the central accessor and returns a flat structure:
```javascript
{ ftNodes: [], ltNodes: [], ftEdges: [], ltEdges: [] }
```

#### Period Node Enrichment
Each life period node in the Mind Elixir map now includes a draft context suffix showing:
- FT people count (non-narrator)
- LT theme count

Example: "Early Childhood · 1955–1965 · 2 memories · 3 family, 2 themes"

#### Meta Bar Enrichment
The selection meta bar at the bottom of the Life Map popover now includes:
- Total family member count from FT draft
- Total life theme count from LT draft

Example: "Lori is in: Early Childhood · 2 memories anchored · Draft: 3 family members, 2 life themes"

### File: `ui/js/bio-promotion-adapters.js`

#### `buildDraftMemoirContext()` — New Function
Produces a clean, flat summary of draft FT/LT context suitable for memoir narrative enrichment:
```javascript
{
  people:  [{ label, role, source: "family_tree_draft" }],
  themes:  [{ label, source: "life_threads_draft" }],
  places:  [{ label, source: "life_threads_draft" }],
  isDraft: true,
  note:    "Draft context from Bio Builder — not yet approved or promoted."
}
```

Safety:
- "Do Not Prompt" nodes are excluded
- Narrator is excluded
- `isDraft: true` flag prevents consumers from treating this as verified data
- No edge details or private notes are included

## Files Modified

| File | Changes |
|---|---|
| `ui/js/interview.js` | `_buildDraftContextHint()`, enriched `build71InterviewPrompt()`, enriched `updateContextTriggers()` |
| `ui/js/bio-review.js` | `_draftCrossRef()`, FT/LT badges on queue cards, cross-ref block in detail view |
| `ui/js/life-map.js` | `_getDraftContext()`, draft counts in period nodes, draft summary in meta bar |
| `ui/js/bio-promotion-adapters.js` | `buildDraftMemoirContext()` for memoir enrichment |

## Integration Dependency Graph

```
LorevoxBioBuilder._getDraftFamilyContext()
    |
    +-- interview.js (build71InterviewPrompt, updateContextTriggers)
    +-- bio-review.js (_draftCrossRef)
    +-- life-map.js (_getDraftContext → period enrichment)
    +-- bio-promotion-adapters.js (buildDraftMemoirContext)
```

All integrations are one-way reads. No downstream module writes back to the Bio Builder draft surfaces.
