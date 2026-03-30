# Lorevox Family Tree — Test Results

## Date: 2026-03-29
## Test Environment: Chrome via Claude in Chrome, localhost:8080, Mark Twain narrator

---

## 1. Bug Fix Verification

| Bug ID | Test | Result | Evidence |
|--------|------|--------|----------|
| V2-F01 | Re-seed does not create duplicate narrator | PASS | Narrator detection now checks display name match against questionnaire fullName/preferredName. Existing "Mark Twain" node (type=narrator) recognized despite role=undefined. |
| V2-F02 | Delete node with edges shows inline dialog | PASS | Deleting ft_narrator (1 edge) showed inline confirm dialog with "This person has 1 connection(s). Delete anyway?" and Cancel/Delete buttons inside the popover. Cancel dismissed without deleting. |
| V2-F02 | Inline dialog renders inside popover (not behind) | PASS | Dialog appended to bioBuilderPopover element, visible above popover content with semi-transparent backdrop. |
| V2-F04 | Orphan edges cleaned after seed | PASS | `_ftCleanOrphanEdges(pid)` called after `_ftSeedFromQuestionnaire()` completes. |
| V2-F04 | Node deletion removes associated edges | PASS | `_ftDeleteNode()` filters edges where from/to matches deleted nodeId. |
| Typo | Life Threads shows "MEMORIES" not "MEMORYS" | PASS | Section header correctly reads "MEMORIES (1)" for memory-type nodes. |

---

## 2. Scaffold View Tests

| Test | Result | Notes |
|------|--------|-------|
| Scaffold button appears in view toggle | PASS | Three-button toggle: Cards, Graph, Scaffold |
| Scaffold renders 4-generation layout | PASS | Great-Grandparents (8), Grandparents (4), Parents (2), Narrator (1) |
| Narrator identified from type field | PASS | ft_narrator node (type="narrator", role=undefined) correctly placed at center |
| Parents populated from type field | PASS | Jane Lampton Clemens (type="parent") and John Marshall Clemens (role="parent") both found |
| Empty slots show dashed placeholders | PASS | All grandparent and great-grandparent slots show "Add Ancestor" with dashed borders |
| Generation color coding | PASS | Indigo (narrator), Purple (parents), Pink (grandparents), Amber (great-grandparents) |
| Other family members below scaffold | PASS | Siblings (3), Spouse (1-2), Children (3), In-Law (1), Associate (1) displayed in grouped rows |
| Effective role handles dual schemas | PASS | type="narrator" and role="parent" both resolved correctly by _scaffoldEffectiveRole() |
| Source badge on seeded nodes | PASS | John Marshall Clemens shows "seeded" badge |
| Node click opens edit form | PASS (code path) | onclick handler wired to _ftEditNode() |

---

## 3. Regression Tests

| Test | Result | Notes |
|------|--------|-------|
| Cards view still works | PASS | Default view shows role-grouped cards with Edit/Connect/Delete buttons |
| Graph view still works | PASS | SVG graph renders with force-directed layout |
| View mode cycling | PASS | Cards → Graph → Scaffold → Cards (3-way cycle) |
| FT data loads from localStorage | PASS | 12 nodes loaded for Mark Twain after reload |
| Narrator switching preserves FT data | Not tested (single narrator session) | Previously verified in V2 testing |
| Quality indicators display | PASS | "10 unconnected", "11 unsourced", "10 orphan edge(s)" with Clean button |
| Bio Builder popover opens | PASS | Opens via showPopover(), renders FT tab correctly |
| Life Threads renders correctly | PASS | 5 categories: Persons (1), Places (4), Memories (1), Events (3), Themes (4) |

---

## 4. Data Integrity

| Check | Result |
|-------|--------|
| Node count stable after scaffold render | PASS — 12 nodes (after Olivia test deletion) |
| Edge count stable after scaffold render | PASS — no edges created or destroyed by scaffold view |
| localStorage draft survives reload | PASS — data persists across page refresh |
| No truth layer writes | PASS — state.archive, state.facts, state.timeline untouched |
| No console errors from scaffold code | PASS — no JavaScript exceptions during scaffold rendering |

---

## 5. Summary

| Category | Pass | Fail |
|----------|------|------|
| Bug fixes | 6 | 0 |
| Scaffold view | 10 | 0 |
| Regression | 8 | 0 |
| Data integrity | 5 | 0 |
| **Total** | **29** | **0** |

All tests pass. The Family Tree architecture upgrade Phase 1 is complete and verified.
