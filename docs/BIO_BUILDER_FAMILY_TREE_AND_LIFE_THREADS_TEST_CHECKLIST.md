# Bio Builder v3 — Family Tree & Life Threads Manual Test Checklist

**Date:** 2026-03-28
**Files:** `bio-builder.js`, `lori8.0.html`, `app.js`

Use this checklist for each persona or regression run. Check off each item as you go.

---

## A. Tab Navigation

- [ ] Open Bio Builder popover
- [ ] Verify 6 tabs visible: Quick Capture, Questionnaire, Source Inbox, Candidates, Family Tree, Life Threads
- [ ] Click Family Tree tab → verify it becomes active (highlighted)
- [ ] Click Life Threads tab → verify it becomes active
- [ ] Switch back to Quick Capture → verify previous tabs still work
- [ ] Verify tab content area (`#bbTabContent`) updates on each switch

## B. Family Tree — Empty State

- [ ] Select a narrator with no Family Tree data
- [ ] Click Family Tree tab
- [ ] Verify empty state message: "Build the family structure here..."
- [ ] Verify "Seed from Questionnaire" and "Seed from Candidates" buttons visible in empty state
- [ ] Verify "Add Person" button visible in empty state

## C. Family Tree — Manual Node CRUD

- [ ] Click "Add Person" → verify a new node card appears
- [ ] New node should default to role "other" with empty name fields
- [ ] Click "Edit" on the new node → verify edit form renders with:
  - Role dropdown (narrator, parent, sibling, spouse, child, grandparent, grandchild, guardian, chosen_family, other)
  - First name, middle name, last name, display name, preferred name
  - Birth date, death date
  - Deceased toggle
  - Death context textarea (visible when deceased is checked)
  - Uncertainty dropdown (Unknown, Approximate, Partially known, etc.)
  - Notes textarea
- [ ] Fill in fields and click Save → verify card updates with entered data
- [ ] Mark node as deceased → verify red border accent and deceased badge
- [ ] Set uncertainty → verify uncertainty badge appears
- [ ] Click "Delete" on a node → verify node removed
- [ ] Verify deleting a node also removes any edges referencing it

## D. Family Tree — Edge CRUD

- [ ] Add two nodes (e.g., narrator + parent)
- [ ] Click "Add Connection" on one node → verify edge form appears
- [ ] Select target node and relationship type from dropdowns
- [ ] Save edge → verify edge line appears on both connected cards
- [ ] Delete edge → verify edge removed from display

## E. Family Tree — Seeding from Questionnaire

- [ ] Fill in questionnaire: personal section (name, DOB) + parents + siblings
- [ ] Switch to Family Tree tab
- [ ] Click "Seed from Questionnaire"
- [ ] Verify narrator root node created with name from questionnaire
- [ ] Verify parent nodes created with names and relation data
- [ ] Verify sibling nodes created
- [ ] Verify grandparent nodes created (if questionnaire has them)
- [ ] Click "Seed from Questionnaire" again → verify no duplicates created

## F. Family Tree — Seeding from Candidates

- [ ] Ensure some people candidates exist (via Source Inbox extraction or manual)
- [ ] Switch to Family Tree tab
- [ ] Click "Seed from Candidates"
- [ ] Verify new nodes created for each candidate person
- [ ] Verify no duplicates (existing display names not re-added)

## G. Life Threads — Empty State

- [ ] Select a narrator with no Life Threads data
- [ ] Click Life Threads tab
- [ ] Verify empty state message: "Use Life Threads to connect memories..."
- [ ] Verify toolbar buttons visible: "Seed from Candidates", "Seed Themes"
- [ ] Verify "Add" buttons for each type: Person, Place, Memory, Event, Theme

## H. Life Threads — Manual Node CRUD

- [ ] Click "Add" for each node type (person, place, memory, event, theme)
- [ ] Verify each creates a card with correct type badge
- [ ] Click "Edit" → verify form with: type dropdown, label, text, notes, source
- [ ] Fill in fields and save → verify card updates
- [ ] Verify type-based color coding:
  - Person: teal left border
  - Place: indigo left border
  - Memory: amber left border
  - Event: pink left border
  - Theme: purple left border
- [ ] Delete a node → verify removal + associated edges cleaned up

## I. Life Threads — Edge CRUD

- [ ] Add two nodes (e.g., person + place)
- [ ] Click "Add Connection" on one node
- [ ] Select target and relationship type (family_of, happened_in, remembered_with, connected_to, influenced_by, theme_of, other)
- [ ] Save → verify edge appears on both cards
- [ ] Delete → verify removal

## J. Life Threads — Seeding from Candidates

- [ ] Ensure candidates exist across multiple types
- [ ] Click "Seed from Candidates"
- [ ] Verify narrator anchor node created
- [ ] Verify people, places, memories, events pulled from candidates
- [ ] Re-seed → verify no duplicates

## K. Life Threads — Seed Themes

- [ ] Fill earlyMemories section in questionnaire (firstMemory, favoriteToy, significantEvent)
- [ ] Fill laterYears section if available (hobbies, etc.)
- [ ] Click "Seed Themes"
- [ ] Verify theme nodes created with labels like "First Memory", "Favorite Childhood Object"
- [ ] Re-seed → verify no duplicates

## L. Narrator Switch Isolation

- [ ] Select Narrator A → add Family Tree nodes and Life Threads nodes
- [ ] Switch to Narrator B → verify Family Tree and Life Threads are empty (or have B's data)
- [ ] Add data for Narrator B
- [ ] Switch back to Narrator A → verify A's data preserved, B's data not present
- [ ] Verify no cross-contamination in either direction

## M. Save / Reload Persistence

- [ ] Add nodes and edges to both tabs
- [ ] Close Bio Builder popover
- [ ] Reopen Bio Builder popover
- [ ] Verify Family Tree and Life Threads data still present
- [ ] Switch narrators and back → verify data persists

## N. Draft Safety

- [ ] Add nodes and edges to Family Tree and Life Threads
- [ ] Check console: `state.bioBuilder.familyTreeDraftsByPerson` should contain data
- [ ] Check console: `state.bioBuilder.lifeThreadsDraftsByPerson` should contain data
- [ ] Verify `state.facts` not modified
- [ ] Verify `state.archive` not modified
- [ ] Verify `state.timeline` not modified

## O. Backward Compatibility

- [ ] Load a person with an old profile (no v3 data)
- [ ] Open Family Tree tab → verify empty state, no errors
- [ ] Open Life Threads tab → verify empty state, no errors
- [ ] Check console for errors → verify none
- [ ] Existing Quick Capture, Questionnaire, Source Inbox, Candidates tabs still work

---

## Quick Persona Smoke Test (Family Tree)

For each of the 9 personas, verify Family Tree seeding produces correct structure:

| # | Name | Expected Root | Expected Parents | Expected Siblings | Special |
|---|---|---|---|---|---|
| 1 | Tom | Tom (narrator) | Parents from questionnaire | Siblings from questionnaire | Former spouse + current spouse nodes |
| 2 | Maggie | Maggie (narrator) | Parents | Siblings | Spouse node + deceased flag |
| 3 | Daniel | Daniel (narrator) | Parents | Siblings | Partner node (gender-neutral) |
| 4 | Sharon | Sharon (narrator) | Parents | Siblings | Spouse + step-child nodes |
| 5 | Avery | Avery (narrator) | Parents | Siblings | Chosen family node |
| 6 | Becca | Becca (narrator) | Parents | Siblings | Former spouse + current partner |
| 7 | Mike | Mike (narrator) | Parents | Siblings | Deceased spouse + nephew |
| 8 | Jordan | Jordan (narrator) | Parents | Siblings | Deceased spouse |
| 9 | Frank | Frank (narrator) | Parents | Siblings | Sarcasm in notes preserved as-is |
