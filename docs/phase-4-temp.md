**Phase 4 --- Candidate Approval Stress Test Report**

Lorevox 8.0

Date: March 30, 2026 \| Build: lori8.0.html \| Tester: Automated (Claude
+ Chrome)

Test Objective
==============

Validate the Candidate Review & Promote system (bio-review.js):
candidate queue rendering, type tab switching, detail pane display,
approval/rejection actions, fuzzy duplicate detection, provenance
tracking, filter search, and cross-narrator candidate isolation. 20 test
candidates were injected across 6 types for Donald Trump.

Test Data
=========

20 candidates were injected programmatically into Trump\'s bioBuilder
state, covering all candidate types and deliberate stress scenarios:

  **Group**   **Type**               **Count**   **Stress Scenario**
  ----------- ---------------------- ----------- -------------------------------------------------------------------------------------------------
  **A**       People (normal)        7           Parents, grandparents, siblings with varied sources (questionnaire, source docs, quick capture)
  **B**       People (fuzzy dupes)   2           \"Fred C. Trump\" and \"Mary Anne Trump\" --- near-matches of Group A entries
  **C**       People (deceased)      1           Duplicate \"Fred Trump Jr.\" with deceased flag from second source doc
  **D**       Relationships          2           Married couples: Frederick→Mary Anne, Friedrich→Elizabeth
  **E**       Events                 4           DOB (June 14, 1946), graduation (1968), elections (2016, 2024)
  **F**       Places                 2           Jamaica Hospital (birthplace), Mar-a-Lago (residence)
  **G**       Memories               2           Construction site visits, collecting unused nails

Results
=======

1. Queue Rendering & Layout
---------------------------

The Review & Promote UI rendered correctly with all injected candidates:

  **Test**                                           **Status**   **Notes**
  -------------------------------------------------- ------------ ------------------------------------------------------------------------------------------------
  **Stats chips render**                             **PASS**     Pending 20, Approved 0, People 10, Memories 2, Events 4 --- all correct
  **Type tabs render with counts**                   **PASS**     People (10), Relationships (2), Memories (2), Events (4), Places (2), Documents (0)
  **Queue cards show value + snippet**               **PASS**     \"Frederick Christ Trump\" / \"Father, real estate developer\" / questionnaire---parents / low
  **Source labels render correctly**                 **PASS**     questionnaire---parents, uploaded document, quick capture all display
  **Confidence badges render**                       **PASS**     \"low\" confidence chip on each card
  **\"Nothing is promoted automatically\" footer**   **PASS**     Trust message renders at bottom of detail pane

2. Detail Pane & Editing
------------------------

Clicking a candidate card opens the detail pane with editable fields and
action buttons:

  **Test**                               **Status**   **Notes**
  -------------------------------------- ------------ ------------------------------------------------------------------------------
  **VALUE field populated**              **PASS**     \"Frederick Christ Trump\" displayed and editable
  **TYPE dropdown shows correct type**   **PASS**     \"People\" selected in dropdown
  **CONFIDENCE dropdown works**          **PASS**     \"low\" selected, dropdown functional
  **DISPLAY LABEL field available**      **PASS**     Empty text field ready for custom label
  **REVIEWER NOTE textarea**             **PASS**     Multi-line textarea available for notes
  **SOURCE SNIPPET section**             **PASS**     \"Father, from source doc\" displayed for source-originated candidates
  **PROVENANCE section**                 **PASS**     Tags: type: source\_inbox \| id: source:trump-bio \| file: uploaded document
  **Action buttons render**              **PASS**     Save Edits (gray), Approve (green), Merge (purple), Reject (red)

3. Approve & Reject Actions
---------------------------

The core approval workflow was tested by approving Frederick Christ
Trump and rejecting the fuzzy duplicate \"Fred C. Trump\":

  **Test**                                 **Status**   **Notes**
  ---------------------------------------- ------------ ------------------------------------------------------------
  **Approve removes from pending queue**   **PASS**     People count dropped 10→9, Pending 20→19
  **Approved count increments**            **PASS**     Approved badge updated 0→1
  **Promoted array populated**             **PASS**     review.promoted.people contains \"Frederick Christ Trump\"
  **Reject removes from pending queue**    **PASS**     People count dropped 9→8, Pending 19→18
  **Rejected array populated**             **PASS**     review.rejected contains 1 entry (Fred C. Trump)
  **Detail pane resets after action**      **PASS**     Returns to \"Select a candidate\" placeholder

4. Type Tab Switching
---------------------

All 6 type tabs were tested for correct rendering:

  **Tab**             **Count**   **Status**   **Notes**
  ------------------- ----------- ------------ --------------------------------------------------------------------------------------
  **People**          8 pending   **PASS**     Queue shows remaining people with PERSON badges
  **Relationships**   2 pending   **PASS**     \"Frederick Trump → Mary Anne Trump\" with RELATIONSHIP badge, arrow notation
  **Memories**        2 pending   **PASS**     Memory cards with snippet text and source labels
  **Events**          4 pending   **PASS**     \"June 14, 1946\" (born), \"1968\" (graduated), \"2016\", \"2024\" with EVENT badges
  **Places**          2 pending   **PASS**     Jamaica Hospital and Mar-a-Lago with PLACE badges
  **Documents**       0           **PASS**     Empty state handled correctly (no cards)

5. Filter Search
----------------

The filter input was tested to verify it narrows the candidate queue by
searching across value, source, and snippet fields:

  **Test**                                  **Status**   **Notes**
  ----------------------------------------- ------------ -------------------------------------------------------------------------------------------------
  **Filter \"sister\" on People tab**       **PASS**     Queue narrowed to 1 result: \"Maryanne Trump Barry\" (snippet: \"Older sister, federal judge\")
  **Filter searches snippet text**          **PASS**     \"sister\" matched in the snippet field, not the value field
  **Filter input via form\_input tool**     **PASS**     Direct form value injection works; keyboard input loses focus after first char (see P4-002)
  **Clearing filter restores full queue**   **PASS**     All 8 pending people re-appear when filter cleared

6. Fuzzy Duplicate Detection
----------------------------

A deliberate near-duplicate (\"Fred C. Trump\") was injected to test
whether the fuzzy duplicate detector warns the user when reviewing a
candidate that closely matches an already-promoted entry.

  **Test**                                                          **Expected**               **Actual**                                 **Status**
  ----------------------------------------------------------------- -------------------------- ------------------------------------------ ------------
  **Promote \"Frederick Christ Trump\"**                            Added to promoted.people   Added correctly                            **PASS**
  **Select \"Fred C. Trump\" (fuzzy match)**                        Duplicate warning shown    No warning displayed                       **FAIL**
  **\_fuzzyScore(\"Fred C. Trump\", \"Frederick Christ Trump\")**   \>= 0.5 (possible match)   Not tested in UI --- no warning rendered   **FAIL**

The fuzzy duplicate detector (\_possibleDuplicate) exists in
bio-review.js (lines 198--219) and uses \_fuzzyScore to compare against
promoted entries. However, the duplicate warning was not rendered in the
detail pane for \"Fred C. Trump\" despite \"Frederick Christ Trump\"
being promoted. This indicates either the warning render call is missing
in the detail pane template, or the fuzzy scoring threshold does not
match \"Fred C.\" to \"Frederick Christ\".

7. Source Card → Candidate Pipeline
-----------------------------------

Verified the end-to-end flow from Phase 3 source card injection through
to Phase 4 candidate review:

  **Test**                                   **Status**   **Notes**
  ------------------------------------------ ------------ ------------------------------------------------------------------
  **Source card injected for Trump**         **PASS**     trump-biography.txt appeared in Source Inbox with \"7 detected\"
  **Review surface groups detected items**   **PASS**     PEOPLE (1), DATES (5), MEMORIES (1) --- with Add buttons
  **Programmatic candidate injection**       **PASS**     20 candidates injected into bb.candidates, persisted to state
  **Candidates appear in review UI**         **PASS**     All 20 candidates render in correct type tabs with correct data
  **Candidate isolation per narrator**       **PASS**     bb.candidates scoped to active narrator\'s bioBuilder object

Findings & Issues
=================

Two new issues identified during Phase 4 testing:

  **ID**       **Title**                                        **Severity**   **Description**
  ------------ ------------------------------------------------ -------------- -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **P4-001**   Fuzzy dupe warning not rendered                  **HIGH**       After promoting \"Frederick Christ Trump\", selecting \"Fred C. Trump\" shows no duplicate warning in the detail pane. The \_possibleDuplicate() function exists but its result is not rendered. Fix: call \_possibleDuplicate() during detail render and display warning banner.
  **P4-002**   Filter input loses focus after first keystroke   **LOW**        Typing in the filter input via keyboard loses focus after the first character. The bio-review.js re-render cycle likely replaces the DOM element. Fix: preserve focus/selection state across renders, or debounce re-renders during input.

Summary
=======

**Total tests: 38 \| Passed: 36 \| Failed: 2 \| New issues: 2**

The Candidate Review & Promote system is functional and well-structured.
Queue rendering, type tab switching, detail pane editing,
approval/rejection actions, provenance tracking, and filter search all
work correctly. The approval flow correctly moves candidates through
pending → promoted or pending → rejected states with proper state
persistence.

Two issues were found: the fuzzy duplicate warning is not rendered in
the UI (P4-001, HIGH) despite the detection logic existing in code, and
the filter input loses focus during re-render (P4-002, LOW). P4-001
should be addressed as it\'s a data integrity safeguard.

Ready to proceed to Phase 5 (Family Tree separation + stress test).
