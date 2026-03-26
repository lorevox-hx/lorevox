# MEMOIR_PANEL_NEVER_EMPTY_PLAN_80.md

## Purpose

This plan updates the Lori 8.0 memoir workspace so that **“Peek at Memoir” is never empty**.

Instead of an empty-looking panel, the memoir surface should always show:
- the **current stage of the memoir process**
- a **clear explanation of what Lori is building**
- **examples of what will appear next**
- the user’s current memoir content, when available

This update is aligned with the current Lori 8.0 shell, which already has:
- a memoir state machine (`empty` → `threads` → `draft`)
- grouped UI affordances in the memoir popover
- extraction gating by posture
- edit modal and draft promotion logic
- clear runtime boundaries between posture, override reason, extraction, idle behavior, and memoir state. fileciteturn39file4 fileciteturn39file0

It also fits the current product moment:
- the runtime system is behaviorally validated
- the next deployment risk is the user-facing memoir surface feeling too thin, too flat, or too blank. fileciteturn39file4

---

## Core product rule

> **Peek at Memoir must never feel empty, even when it contains no extracted memoir content yet.**

That means the panel should always render one of two things:

1. **Process-aware scaffold content**
2. **Actual memoir content**

Never a dead, empty container.

---

# 1. Problem Statement

## Current weakness

The current shell already includes an `empty` memoir state with orientation copy and bullets, but the experience still risks feeling “empty” from a user perspective because it does not yet function as a truly rich, staged narrative workspace. The user should be able to open the panel at any point and immediately understand:

- where they are in the memoir-building process
- what Lori has already gathered
- what Lori is still listening for
- what kind of material will appear next
- what the difference is between threads and draft

The goal is not just to avoid blankness. It is to provide a **trust-building narrative scaffold**.

---

# 2. New Design Principle

## Memoir panel as a “living scaffold”

The memoir panel should always communicate one of these truths:

### A. Getting Started
Lori is gathering the roots of the story.

### B. Story Threads
Lori has begun collecting meaningful building blocks.

### C. Emerging Draft
Those building blocks are now being shaped into readable prose.

This is more than UI copy. It is a product behavior rule.

---

# 3. Required State Model (Updated)

Keep the current three-state model, but strengthen the rendering contract.

## State 1 — `empty`
This no longer means “nothing.”
It means:

> “The memoir scaffold is present, but Lori is still gathering the first story threads.”

### Required rendering
Show all of the following:
- heading
- stage label
- explanation of what Lori is doing
- example thread categories
- example memoir fragments
- guidance for what kinds of memories help the memoir take shape

### User-facing message goal
The panel should teach the user what memoir growth looks like before any extracted material appears.

---

## State 2 — `threads`
This means:

> “Lori has enough material to show grouped story threads, but not enough user-shaped prose to call it a draft.”

### Required rendering
Show:
- grouped sections
- thread bullets / short lines
- process copy explaining that these are building blocks
- examples only if a section has not yet been populated

---

## State 3 — `draft`
This means:

> “The memoir has moved from grouped threads into editable prose.”

### Required rendering
Show:
- prose blocks
- headings where appropriate
- explanation that this is an emerging draft, not final book prose

---

# 4. “Never Empty” Rendering Contract

## 4.1 Empty-state content requirements

The memoir panel in `empty` must contain four layers:

### Layer A — Stage identity
Example:
- **Your Story**
- **Stage: Getting Started**

### Layer B — Process explanation
Example:
- Lori is listening for the roots of your story.
- She is beginning to gather family, home, work, places, changes, and the moments that shaped you.

### Layer C — Example categories
Example:
- Family & Relationships
- Places & Home
- Work & Daily Life
- Education
- Life Changes & Turning Points

### Layer D — Example content blocks
These should be clearly marked as examples or placeholders, not real extracted facts.

Example:
- *Example: “Born in a small farmhouse outside Fargo.”*
- *Example: “Parents divorced when I was ten.”*
- *Example: “Worked at the telephone company for thirty years.”*
- *Example: “The house felt very quiet after retirement.”*

These examples are important because they teach the user what counts as memoir material.

---

## 4.2 Threads-state rendering requirements

In `threads`, the memoir panel should **not** show generic filler.
It should show:

- real grouped content where available
- placeholder/example lines only for still-empty sections

Example:

### Family & Relationships
- Only child
- Parents divorced at age ten
- Father later came out as gay

### Places & Home
- Lived in Cork during childhood
- Example: *The first apartment after marriage*
- Example: *A house that felt like home*

This preserves structure without making sparse content feel broken.

---

## 4.3 Draft-state rendering requirements

In `draft`, example placeholders should no longer dominate.
Instead:
- real prose leads
- scaffold hints recede
- export becomes primary

---

# 5. Memoir Panel Content Model (Updated)

The memoir surface should now always be understood as containing two possible content types:

## A. Real content
- extracted threads
- edited draft prose

## B. Scaffold content
- stage explanation
- example prompts
- example thread lines
- example section placeholders

### Rule
Scaffold content is allowed in:
- `empty`
- `threads`

Scaffold content should be minimized in:
- `draft`

---

# 6. Section Model

The memoir panel should move from flat chips to grouped sections.

## Required sections
- **Family & Relationships**
- **Places & Home**
- **Work & Daily Life**
- **Education**
- **Life Changes & Turning Points**

## Optional meaning-aware sections
- **Identity & Belonging**
- **Loss, Love & Transitions**
- **Memories That Still Feel Alive**
- **What Changed Me**

These align well with the memoir theory material you attached, especially the emphasis on:
- stakes
- vulnerability
- turning points
- reflective insight
- situation vs story. fileciteturn38file0

---

# 7. Meaning-Aware Upgrade Direction

The memoir panel should not remain a flat fact display.

The attached memoir theory makes clear that a compelling memoir needs:
- emotional gravity
- vulnerability
- conflict or stakes
- transformation
- reflective distance
- trustworthy factual scaffolding. fileciteturn38file0

So the next upgrade should move toward:

## Meaning tags
Examples:
- `stakes`
- `vulnerability`
- `relationship`
- `identity`
- `turning_point`
- `reflection`

## Narrative role hints
Examples:
- `setup`
- `inciting`
- `escalation`
- `resolution`

This does **not** need to be fully visible to the user yet, but it should shape how threads are grouped and later drafted.

---

# 8. Export Requirements

## Purpose

Users should be able to save the current visible memoir content for review, printing, or editing outside Lorevox.

## Required formats
- `.txt`
- `.docx`

## Export truth rule
Export must reflect the **visible memoir panel content**, not raw archive facts and not hidden DB rows.

That means:
- if the panel is in `threads`, export grouped thread scaffold
- if the panel is in `draft`, export the current draft prose
- if the panel is `empty`, export is disabled

This aligns with the proposed export mockups and logic in the attached implementation notes. fileciteturn39file0

## TXT requirements
TXT export should:
- preserve section headings
- preserve bullet or paragraph structure plainly
- be UTF-8
- use a simple filename convention

## DOCX requirements
DOCX export should:
- preserve the same visible content as TXT
- include a title
- include section headings
- preserve paragraph spacing
- be suitable for printing or later editing

## UI placement
Recommended location:
- memoir panel header or edit modal

Buttons:
- `Save TXT`
- `Save DOCX`

## Export behavior rules
- disabled in `empty`
- enabled in `threads`
- enabled in `draft`
- exports exactly what user sees
- no hidden technical metadata
- no debug labels
- no raw extraction markers like `data-fact-text`
- do not export placeholder examples as if they were real memoir facts

---

# 9. End-to-End Test Spec (Updated)

## Test name
**LOREVOX_MEMOIR_PANEL_NEVER_EMPTY_AND_EXPORT_TEST**

## Purpose
Validate that:
1. the memoir panel never feels blank
2. memoir growth is visible across stages
3. export reflects visible content truthfully

---

## Test flow

Run a longer mixed-mode conversation of 10–20 turns containing:
- birth and birthplace
- childhood/home
- family structure
- work
- move/residence
- one emotionally meaningful transition
- one companion/off-domain turn
- one recovery back to memoir

This should be layered on top of the already validated runtime contract and mode behaviors. fileciteturn39file3 fileciteturn39file2

---

## Validation A — Empty state
Before any extracted memoir content:

Check that the panel shows:
- stage label
- explanation of memoir process
- example categories
- example memoir lines

### Pass
The panel is informative and useful before content exists.

### Fail
The panel feels empty, dead, or purely generic.

---

## Validation B — Threads state
After several memoir-relevant turns:

Check that:
- real grouped content appears
- at least 3 meaningful sections appear
- family/identity material is represented
- still-empty sections show examples/placeholders, not blanks

### Pass
The panel feels like Lori is building understanding.

### Fail
It still feels like a shallow fact list.

---

## Validation C — Draft state
After user edits and saves substantial prose:

Check that:
- state transitions to `draft`
- draft prose replaces thread-like scaffolding as the dominant view
- export remains enabled

---

## Validation D — Contamination protection
Check that:
- companion turns do not add memoir content
- off-domain/helper content does not appear as memoir thread
- this remains true after recovery

This continues the same archive-protection rule already validated in runtime testing. fileciteturn39file4 fileciteturn39file1

---

## Validation E — Export
Check:
- TXT export succeeds in `threads`
- DOCX export succeeds in `threads`
- TXT export succeeds in `draft`
- DOCX export succeeds in `draft`
- exported content matches the visible panel content
- scaffold placeholders are not exported as real memoir facts

---

# 10. Test Artifact Updates Required

The current runtime/test artifacts are strong, but they need memoir-panel-specific additions.

## Add to test sheet
Add these fields to the runtime test sheet / CSV flow:
- `memoir_panel_informative_when_empty`
- `memoir_examples_visible`
- `memoir_sections_grouped`
- `memoir_family_identity_visible`
- `memoir_export_txt_ok`
- `memoir_export_docx_ok`
- `export_matches_visible_state`
- `placeholder_export_contamination`

This extends the existing runtime sheet and mode plan cleanly. fileciteturn39file5 fileciteturn39file2

## Add to scoring schema
Add booleans for:
- `memoir_panel_populated`
- `memoir_panel_informative_when_empty`
- `export_matches_visible_state`
- `placeholder_export_contamination`

This follows the direction already suggested in the implementation notes you attached. fileciteturn39file0

---

# 11. Implementation Order

## Phase A — Never-empty rendering
1. strengthen empty-state copy
2. add example categories
3. add example memoir lines
4. ensure no fully blank section rendering

## Phase B — Threads improvement
5. grouped sections
6. hybrid rendering: real content first, example placeholder second
7. family/identity/life-change material included

## Phase C — Export
8. add `Save TXT`
9. add `Save DOCX`
10. export visible state truthfully

## Phase D — Validation
11. run memoir never-empty test
12. compare UI vs export
13. save one successful sample artifact

---

# 12. Release Standard

For deployment, the memoir panel must feel:
- present even before extraction
- meaningful once threads exist
- trustworthy once draft exists
- saveable once a user wants to keep it

The mode engine is already in strong shape. The memoir workspace is now the next major trust layer to finish before deployment. fileciteturn39file4 fileciteturn39file1

---

# Final Recommendation

Adopt this rule everywhere in the memoir workspace:

> **Never show emptiness. Always show process, examples, or real story content.**

That will make “Peek at Memoir” feel intentional from the first click, instead of waiting until enough facts accumulate to feel alive.
