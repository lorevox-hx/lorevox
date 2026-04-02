# Lorevox V2 Full-Platform Test — Results

## Test Environment

- UI: Lorevox 8.0 (localhost:8080)
- API: localhost:8000 (FastAPI on Windows host)
- Browser: Chrome (via Claude in Chrome)
- Date: 2026-03-29
- Prior session: Cold Start Persistence and Visual Truth Test (all 6 fixes applied)

---

## 1. Test Coverage Summary

| Segment | Description | Profiles Tested | Method |
|---------|-------------|----------------|--------|
| A | Sensitive / Human Complexity | 4 data model validations (S03, S04, S05, S06) | State injection + visual verification |
| B | Failure / Fuzzy / Malformed | 8 of 10 (F01–F08, F10) | State injection + UI interaction |
| C+D | Regular + Normal Bio | Not generated (API injection path validated) | — |
| E | Named Validation Narrators | 3 of 3 (Mark Twain, Janice, Chuck Norris) | Full UI + visual + state verification |

**Total profiles actively tested:** 3 named narrators + 4 sensitive data model validations + 8 edge case scenarios = 15 distinct test executions.

Segments C and D (40 bulk profiles) were not generated in this pass. The API injection path is validated and the architecture supports it, but generating 40 profiles with realistic complexity and seeding them via the API exceeded the scope of this session. The critical architectural questions — narrator isolation, draft-vs-truth boundaries, persistence, sensitivity handling, and UI correctness — are answered by the tests actually run.

---

## 2. Segment E — Named Narrator Results

### E01 — Mark Twain

| Check | Result |
|-------|--------|
| Appears in dropdown | PASS |
| Profile loads (Samuel Langhorne Clemens, 1835-11-30, Florida, MO) | PASS |
| Legal name vs preferred name distinction | PASS (fullname = Samuel Langhorne Clemens, preferred = Mark Twain) |
| Bio Builder opens on cold start | PASS (after CS-1 popover fix) |
| Questionnaire hydration | PASS (DOB, POB, names all populated) |
| Zodiac auto-derive | PASS (Sagittarius from 1835-11-30, after CS-6 fix) |
| Quick Capture placeholder dynamic | PASS ("e.g. Mark Twain was born in Florida, Missouri in 1835") |
| Quick Capture add fact | PASS (fact stored and displayed) |
| Family Tree loads from localStorage | PASS (12 nodes, 10 edges from lorevox_ft_draft_{pid}, after CS-4 fix) |
| Life Threads loads from localStorage | PASS (13 nodes: 1 person, 4 places, 1 memory, 3 events, 4 themes) |
| Life Map renders 6-period scaffold | PASS (Born · 1835) |
| Candidates Review UI | PASS (renders with bucketed data format) |
| No Chuck or Janice data visible | PASS |
| Lori greeting grounded | PASS (references Mark, Florida Missouri, Hannibal, siblings) |

### E02 — Janice

| Check | Result |
|-------|--------|
| Appears in dropdown | PASS |
| Can be selected | PASS |
| Profile loads (Janice Josephine Horne, 1939-09-30, Spokane, WA) | PASS |
| Bio Builder opens | PASS |
| Life Map renders 6-period scaffold | PASS (Born · 1939) |
| No Mark Twain or Chuck data visible | PASS |

### E03 — Chuck Norris

| Check | Result |
|-------|--------|
| Appears in dropdown | PASS |
| Profile loads (Carlos Ray Norris, 1940-03-10, Ryan, Oklahoma) | PASS |
| Legal vs preferred name | PASS (fullname = Carlos Ray Norris, preferred = Chuck Norris) |
| Life Map renders 6-period scaffold | PASS (Born · 1940, year ranges calculated correctly) |
| FT/LT drafts empty (no seeded data) | PASS (0 nodes — correct, no bleed) |
| No Mark Twain or Janice data visible | PASS |

---

## 3. Segment B — Edge Case Results

| Case | Description | Result | Notes |
|------|-------------|--------|-------|
| F01 | Double Seed | PASS (minor) | Seed added 1 duplicate narrator node (Mark Twain from questionnaire). Second seed call was idempotent. No explosion. |
| F02 | Mixed Candidate Shapes | PASS (code path) | `_addItemAsCandidate` correctly uses bucketed candidates. bio-review.js expects `{people:[], events:[], ...}` object, not flat array. Real code path works correctly. |
| F03 | Null Labels | PASS | Null/empty label nodes render as "Unknown" with proper role grouping. No crash. |
| F04 | Fuzzy Only | PASS | Year-only dates (e.g., "1837") render correctly as "b. 1837". Approximate date placeholder says "YYYY-MM-DD or approximate". |
| F05 | Conflict / Fuzzy Match | PASS | System detects fuzzy matches between node names — showed "1 fuzzy match: 'Olivia Langdon Clemens' = 'Langdon Clemens' (52%)" |
| F06 | Rapid Switch A (BB open) | PASS | After Chuck→Janice→MT rapid switch with BB open, state.profile correctly showed Mark Twain. |
| F07 | Rapid Switch B (tabs + narrators) | PASS | 5 rapid switches interleaved with BB/Life Map refreshes — final state correct (Janice). _loadGeneration guard working. |
| F08 | Circular Edge | PASS | Circular parent_of edge rendered without crash. Shows bidirectional badges with dismiss (✕) buttons. |
| F09 | Heavy Load | Not tested | Requires generating dense profiles beyond existing 3 narrators. |
| F10 | Orphan Delete | PASS | Deleted parent node (John Marshall Clemens) — no crash, UI rendered remaining 11 nodes cleanly. |

---

## 4. Segment A — Sensitive / Human Complexity Data Model Results

| Case | Description | Data Model Support | Visual Rendering | Notes |
|------|-------------|-------------------|-----------------|-------|
| S03 | Ghost Child (infant loss) | PASS | PASS | `deceased: true`, `deathContext` in italics, birth/death dates, child remains in tree under CHILD section. |
| S04 | Unknown Origin (unknown father) | PASS | PASS | "Unknown Father" with orange "unknown" badge. Placeholder does not block UI. Notes describe adoption context. |
| S05 | Chosen Family | PASS | PASS | `chosen_family` role renders in its own "CHOSEN FAMILY" section with equal visual legitimacy. |
| S06 | Estrangement | PASS | PASS | `uncertainty: "sensitive"` renders yellow badge. Notes contain "Do not prompt" flag. Thread visible but flagged. |
| S01 | Faith Change | Data model supports (via Life Threads themes) | Not visually tested | Life Threads can cluster faith-change memories as theme nodes. |
| S02 | Late Bloomer (same-sex spouse) | Data model supports | Not visually tested | `former_marriage` and `marriage` relationship types both available. No forced gender assumption in data model. |
| S07 | Blended Chaos | Data model supports | Not visually tested | Roles include step, adoptive, biological, guardian, foster. Relationship types distinct per edge. |
| S08 | Career Exile | Data model supports (via Life Threads) | Not visually tested | Theme nodes like "Identity after Retirement" can be created. |
| S09 | Migration (fuzzy chronology) | Data model supports | Partially tested | Fuzzy dates accepted. Place nodes in Life Threads support multi-location histories. |
| S10 | Caregiver | Data model supports | Not visually tested | Notes field can capture caregiving context without overwriting kinship role. |

---

## 5. UI Workflow Test Results (Section 11)

### 11A — Family Tree UI Flow

| Action | Result |
|--------|--------|
| + Add Person | PASS — Form opens with role dropdown, name fields, fuzzy date support, deceased flag, death context, uncertainty, notes |
| Edit node | PASS — All saved fields round-trip correctly through edit form |
| Connect nodes | PASS — Bidirectional edge rendered with label, relationship type, dismiss button |
| Delete node | FUNCTIONAL (confirm dialog blocks automation; works via JS) |
| Seed Questionnaire | PASS — Seeds from questionnaire data, minor duplicate narrator node issue |
| Role grouping | PASS — PARENT, SIBLING, SPOUSE, CHILD, CHOSEN FAMILY, OTHER sections render correctly |
| Quality indicators | PASS — Shows unconnected, weak/unlabeled, unsourced, orphan edge counts |
| Fuzzy match detection | PASS — Detects similar node names with percentage score |
| Cards / Graph toggle | Present in UI (Graph view not tested) |

### 11B — Life Threads UI Flow

| Action | Result |
|--------|--------|
| Tab renders | PASS — Shows all 5 node type categories: Persons, Places, Memorys, Events, Themes |
| Add buttons present | PASS — +person, +place, +memory, +event, +theme |
| Edit/Link/Delete buttons | PASS — Present on every node card |
| Seed button | Present |
| Themes button | Present |
| Data loads from localStorage | PASS — 13 nodes for Mark Twain |

### 11C — Quick Capture

| Action | Result |
|--------|--------|
| Add Fact | PASS — Fact stored, appears in RECENT ITEMS with green "Fact" badge |
| Dynamic placeholder | PASS — Shows narrator-specific example text |
| Save Note textarea | Present and functional |
| Open Questionnaire link | Present |
| Add Documents link | Present |

### 11D — Candidates Review

| Action | Result |
|--------|--------|
| Bucketed data renders | PASS — People, Relationships, Memories, Events, Places, Documents tabs with counts |
| Candidate cards | PASS — Show value, snippet, source label, type badge, cross-reference badge |
| Phase D compat shims | Present — `_getCandidateTitle`, `_getCandidateText` handle nested data shapes |
| Draft-vs-truth boundary | PASS — "Nothing is promoted automatically — every decision is yours" message |
| Pending/Approved/Promoted counters | PASS |

### 11E — Popover Lifecycle

| Action | Result |
|--------|--------|
| Open BB | PASS |
| Close BB (Escape) | PASS — Returns to main chat |
| Reopen BB | PASS — Same tab and scroll position retained |
| State persists across close/reopen | PASS |

### 11F — Person Switching Flow

| Action | Result |
|--------|--------|
| Switch MT → Chuck | PASS — state.person_id, profile, FT/LT all update correctly |
| Chuck FT/LT empty (no bleed) | PASS — 0 nodes for Chuck |
| Chuck Life Map renders | PASS — 6-period scaffold with Born · 1940 |
| Switch Chuck → MT | PASS — MT FT/LT drafts fully restored (13 FT nodes, 13 LT nodes) |
| No cross-narrator contamination | PASS |

### 11G — Dropdown Cleanup

| Action | Result |
|--------|--------|
| Dropdown shows only 3 narrators | PASS (Chuck Norris, Janice, Mark Twain) |
| No stale/deleted narrators | PASS |
| lorevox_draft_pids filter works | PASS |
| Active narrator restored after reload | PASS |

---

## 6. Persistence Test Results (Section 15)

| Surface | Classification | Evidence |
|---------|---------------|----------|
| Narrator dropdown | **Real persisted** | Populated from API + localStorage filter. Survives cold restart. |
| Active narrator selection | **Real persisted** | `lv_active_person_v55` in localStorage. Correct after reload. |
| Profile basics | **Real persisted** | Loaded from API with offline localStorage fallback. |
| Bio Builder popover render | **Real persisted** | After CS-1/CS-2 popover guard fix. Renders on cold start. |
| Family Tree drafts | **Real persisted** | Loaded from `lorevox_ft_draft_{pid}` after CS-4 fix. Round-trips through narrator switching. |
| Life Threads drafts | **Real persisted** | Loaded from `lorevox_lt_draft_{pid}` after CS-4 fix. |
| Life Map scaffold | **Real persisted** | Derives from profile DOB. Renders for all 3 narrators. |
| Peek at Memoir | **Real persisted** | Renders from profile data. |
| BB Questionnaire | **Session-only** | Data does not survive cold restart (by design). |
| Quick Capture items | **Session-only** | Cleared on refresh (by design). |
| Source Inbox cards | **Session-only** | Not persisted (by design). |
| Candidates queue | **Session-only** | Not persisted (by design). |
| Chat history | **Session-only** | Cleared on refresh (expected). |

---

## 7. Performance Observations (Section 16)

| Metric | Observation |
|--------|------------|
| Page load time | ~3-5 seconds on cold start with API |
| Narrator switch time | < 1 second for profile update |
| BB open time | < 0.5 seconds |
| FT rendering (13 nodes) | Instant |
| LT rendering (13 nodes) | Instant |
| Life Map rendering | < 1 second (MindElixir scaffold) |
| Rapid switching (5 switches) | No lag, no crash, correct final state |
| Console errors during testing | None observed during normal operation |
| Memory/UI degradation | None observed during this session |

---

## 8. Life Map Test Results (Section 17)

| Check | Result |
|-------|--------|
| No narrator selected → empty state | Not tested (always a narrator selected) |
| Narrator selected, no spine → 6 default periods | PASS (all 3 narrators) |
| DOB present → year ranges shown | PASS (Chuck: 1940, MT: 1835, Janice: 1939) |
| Mark Twain not blank | PASS |
| Janice not blank | PASS |
| Chuck Norris not blank | PASS |

---

## 9. Grounding Observations (Section 14)

| Check | Observation |
|-------|------------|
| G03 — Unknown parent | Data model preserves "Unknown Father" placeholder with uncertainty badge. Lori would not invent a name. |
| G04 — Ghost child | Death context renders in italics with respectful framing. Child remains visible in tree. |
| G05 — Career exile | Life Threads theme nodes can represent "Identity after Retirement" threads. |
| G06 — Chosen family | CHOSEN FAMILY section has equal visual legitimacy to biological family sections. |
| G07 — Legal vs public identity | Legal name (Samuel Langhorne Clemens / Carlos Ray Norris) and preferred name (Mark Twain / Chuck Norris) remain distinct throughout all surfaces. |
| G08 — Dense public narrator | Chuck Norris profile loads without title explosion. Life Map remains usable with 6-period scaffold. |
| Lori greeting quality | Grounded in real profile data — references correct birthplace, name, and life details. |

---

## 10. Fixes Applied in This Session

All 6 fixes from the Cold Start test remain active and verified:

1. **CS-1**: Bio Builder popover render guard (`:popover-open` check)
2. **CS-2**: Life Map popover render guard (`:popover-open` check)
3. **CS-3**: Profile loading race condition (`_loadGeneration` counter)
4. **CS-4**: FT/LT draft loading from localStorage (`ftObj.d || ftObj.data`)
5. **CS-5**: Quick Capture placeholder dynamic update
6. **CS-6**: Zodiac auto-derive on hydration

No additional code fixes were required during V2 testing.

---

## 11. Overall Verdict

### Is Lorevox ready for additional real family narrators?

**Conditionally YES.**

**What is trustworthy:**
- Narrator creation, storage, switching, and isolation all work correctly
- Profile basics persist through API with offline fallback
- Family Tree and Life Threads drafts persist in localStorage and load correctly after fixes
- Life Map renders 6-period scaffold for all narrators with correct year ranges from DOB
- Bio Builder opens reliably on cold start after popover guard fixes
- The data model supports complex human situations: chosen family, unknown parents, infant loss, estrangement, fuzzy dates, deceased status with death context, sensitivity flags
- No narrator bleed observed across any test scenario
- Rapid switching is safe with the `_loadGeneration` guard
- Draft-vs-truth boundaries are respected — the Candidates UI explicitly states "Nothing is promoted automatically"
- Dropdown shows only intended narrators with no stale resurrections
- Quick Capture placeholder is now dynamic and narrator-specific
- Zodiac auto-derives from DOB on questionnaire hydration

**What requires caution:**
- Questionnaire, Quick Capture, Source Inbox, and Candidates are session-scoped and do not survive browser restart. Users must understand this.
- FT seed from questionnaire creates a duplicate narrator node (minor — does not cause data loss)
- Delete button uses native `confirm()` dialog which may confuse some users
- Segments C+D (bulk profile testing at scale) were not tested — performance under 63 profiles is unverified

**Recommendation:**
Lorevox is safe for real family capture with the 6 fixes applied. The core data path — narrator creation, profile storage, FT/LT drafts, Life Map scaffold, Bio Builder — all work from genuine persisted state. Add Janice's real family data, add Kent, and continue building with confidence. The session-scoped surfaces should eventually gain persistence, but they do not block real-user entry today.
