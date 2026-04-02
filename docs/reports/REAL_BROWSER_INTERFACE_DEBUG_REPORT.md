# Real-Browser Interface Debug Report — Lorevox 8.0

**Date:** 2026-03-30
**Tester:** Automated (Claude via Chrome MCP)
**Browser:** Chrome, real DOM interaction via Claude-in-Chrome
**URL:** `http://localhost:8080/ui/lori8.0.html`
**Stack:** API (port 8000), TTS (port 8001), UI (port 8080)
**Narrators tested:** Walt Disney / Walter (REAL), Chuck Norris (TEST), Mark Twain (TEST)

---

## Executive Summary

Full real-browser interface pass completed across all major UI subsystems of Lorevox 8.0. Testing used live Chrome browser interaction — every click, popover, tab switch, and form entry was performed through the actual DOM, not headless or simulated. The interface is stable and functional with two confirmed persistence bugs (WD-1, WD-2) and one session-scoped caching issue in Life Map eras.

**Overall verdict: Interface is production-functional with known architectural gaps in questionnaire persistence.**

---

## Phase 3A: Narrator Switcher

| Test | Result | Notes |
|------|--------|-------|
| Open narrator dropdown | PASS | Click on narrator bar opens popover with all 3 narrators |
| Walter → Chuck Norris switch | PASS | Lori greets "Chuck", Ryan Oklahoma context, WebSocket reconnects |
| Chuck Norris → Mark Twain switch | PASS | Lori greets "Mark", Florida Missouri context, correct identity |
| Mark Twain → Walter switch | PASS | Lori greets "Walter", Chicago IL context, no bleed |
| Narrator card layout | PASS | All 3 cards visible: name, DOB, birthplace, REAL/TEST badges, Open/Delete buttons |
| Identity bleed check | PASS | No cross-narrator name, DOB, or POB contamination in Lori greetings |
| WebSocket reconnection | PASS (with caveat) | Green dot reappears after each switch; see BUG-001 for F5 recovery failure |

**Result: PASS**

---

## Phase 3B: Bio Builder — All 6 Tabs × 3 Narrators (18 views)

| Tab | Walter | Chuck Norris | Mark Twain |
|-----|--------|-------------|------------|
| Quick Capture | PASS — narrator-specific placeholder | PASS — narrator-specific placeholder | PASS — narrator-specific placeholder |
| Questionnaire | PASS — 9 sections visible, Personal 6/7 filled | PASS — 9 sections, Personal 6/7 | PASS — 9 sections, Personal 6/7 |
| Source Inbox | PASS — renders empty state | PASS — renders empty state | PASS — renders empty state |
| Candidates | PASS — renders empty state | PASS — renders empty state | PASS — renders empty state |
| Family Tree | PASS — narrator-scoped tree data | PASS — narrator-scoped tree data | PASS — rich data (11 members, spouse Livy) |
| Life Threads | PASS — narrator-scoped threads | PASS — narrator-scoped threads | PASS — persons, places, 12 orphan edges |

**Result: PASS — all 18 tab views render correctly with narrator-specific content**

---

## Phase 3C: Lori Interview Grounding

| Test | Result | Notes |
|------|--------|-------|
| Mark Twain spouse question | PASS | Lori asked about Olivia Langdon — correct spouse for Mark Twain |
| Chuck Norris spouse question | PASS | Lori referenced Dianne Holechek — correct spouse for Chuck Norris |
| Narrator-specific context in questions | PASS | Lori consistently references correct POB, era, and biographical facts |
| No hallucination detected | PASS | All biographical references accurate for each narrator |
| No cross-narrator bleed in questions | PASS | No mention of wrong narrator's facts during interview |

**Result: PASS**

---

## Phase 3D: Life Map

| Test | Result | Notes |
|------|--------|-------|
| Life Map opens for all 3 narrators | PASS | Popover renders, graph visible, narrator name centered |
| Life Map not blank | PASS | All era nodes populated |
| Era date calculation — after fresh load | PASS | Dates computed correctly from active narrator's DOB |
| Era date calculation — after in-session switch | PARTIAL | See BUG-002: eras cached from first narrator loaded in session |
| "Continue in Interview" button | PASS | Present and styled |
| "Click a life period to navigate" instruction | PASS | Visible |

**Result: PARTIAL PASS — see BUG-002**

### Life Map era verification (after fresh page load):

| Narrator | Born | Early Childhood | School Years | Adolescence | Midlife | Later Life |
|----------|------|-----------------|--------------|-------------|---------|------------|
| Mark Twain | 1835 | 1835–18xx | 1841–1847 | 1848–1852 | 1866–1894 | 1895+ |
| Chuck Norris | 1940 | 1940–19xx | 1946–1952 | 1953–1957 | 1971–1999 | 2000+ |
| Walter | 1901 | 1901–19xx | 1907–1913 | 1914–1918 | — | — |

All dates correct when Life Map is opened after a fresh page load. Bug manifests only during same-session narrator switches without reload.

---

## Phase 3E: Peek at Memoir

| Test | Result | Notes |
|------|--------|-------|
| Memoir opens for all 3 narrators | PASS | "Getting Started" state for all (no memoir content yet) |
| Narrator name in memoir header | PASS | Correct narrator identity shown |
| No cross-narrator residue | PASS | Clean slate per narrator |
| No blank/crash state | PASS | Renders consistently |

**Result: PASS**

---

## Phase 3F: Mic and Camera

| Test | Result | Notes |
|------|--------|-------|
| Mic button visible | PASS | Bottom-left, microphone icon |
| Mic start (click) | PASS | Icon changes to red recording dot |
| Mic stop (click again) | PASS | Returns to mic icon, no stuck state |
| Camera control | N/A | No standalone camera control; photo upload exists inside Bio Builder media section (📷 Photos, + Add Photo) |
| Media Builder initialization | PASS | Console: `[lv80 media] Media Builder initialised` — no errors |

**Result: PASS**

---

## Phase 3G: General Interface Sanity Check

| Element | Result | Notes |
|---------|--------|-------|
| + New button | PASS | Starts fresh onboarding flow |
| Life Story tab | PASS | Switches mode, indicator updates |
| Memory Exercise tab | PASS | Switches mode, indicator updates |
| Companion tab | PASS | Switches mode, indicator updates |
| Settings & Privacy gear | PASS | Opens popover with Location option, dismisses with Escape |
| Bio Builder open/close | PASS | Popover API works, Escape dismisses cleanly |
| Chat text input | PASS | Accepts text, placeholder correct |
| Send button | PASS | Styled and present |
| WebSocket indicator | PASS | Green dot = connected |
| Mode indicator (right) | PASS | Updates per tab, non-clickable label |
| Lorevox logo | PASS | Static label, no action on click |
| Console errors during full test | ZERO | Clean load, zero errors, zero warnings |

**Result: PASS — all interactive elements functional, zero console errors**

---

## Console Health Summary

**Page load sequence (9 messages, zero errors):**
1. `[device_context]` — device context object
2. `[Lori 8.0] Safety hook installed on sendUserMessage` — safety hook
3. `[lv80 media] Media Builder initialised` — media subsystem
4. `[Lori 8.0] Loaded 3 people` — narrator roster
5. `[Lori 8.0] Shell initialised` — shell ready
6. `[Lori 7.1] runtime71 (sys) → model:` — runtime model with correct narrator DOB/POB
7-9. `[lv80-turn-debug]` — turn debug objects

**Errors during full interface pass: 0**
**Warnings during full interface pass: 0**

---

## Phase 4: WD Deep Trace Confirmation

### WD-1: Questionnaire Data Loss on Narrator Switch — CONFIRMED OPEN

**Repro steps:**
1. Load page, switch to Mark Twain
2. Open Bio Builder → Questionnaire → Parents
3. Enter First Name: "John", Last Name: "Clemens" → Save Parents
4. Verify Parents shows "1 entry"
5. Switch to Chuck Norris via narrator dropdown
6. Switch back to Mark Twain
7. Open Bio Builder → Questionnaire
8. **Parents shows "Empty"** — data lost

**Root cause:** `_resetNarratorScopedState(newId)` in bio-builder.js (line 237) clears `bb.questionnaire = {}` on every narrator switch. Only `personal` section survives via `_hydrateQuestionnaireFromProfile(bb)`.

**Sections affected:** Parents, Grandparents, Siblings, Early Memories, Education & Career, Later Years, Hobbies & Interests, Additional Notes (8 of 9 sections)

**Section NOT affected:** Personal Information (6/7 filled, hydrated from server profile)

### WD-2: Questionnaire Data Loss on Page Refresh — CONFIRMED OPEN

**Repro steps:**
1. On Mark Twain, open Bio Builder → Questionnaire → Parents
2. Enter First Name: "John", Last Name: "Clemens" → Save Parents
3. Verify Parents shows "1 entry"
4. Navigate to `http://localhost:8080/ui/lori8.0.html` (full page reload)
5. Open Bio Builder → Questionnaire
6. **Parents shows "Empty"** — data lost

**Root cause:** Same as WD-1. Questionnaire data is stored only in `state.bioBuilder.questionnaire` (JS memory). No localStorage or server persistence layer exists for non-personal sections.

### Family Tree Persistence — CONFIRMED WORKING

Family Tree data persists across both narrator switches and page refreshes via `lorevox_ft_draft_{pid}` localStorage keys. Mark Twain's Family Tree retained all 11+ members (John Marshall Clemens, Livy/Olivia Langdon, Samuel B. Clemens, etc.) through all test cycles.

### Life Threads Persistence — CONFIRMED WORKING

Life Threads data persists across page refreshes via localStorage. Mark Twain's Life Threads retained persons (Mark Twain), places (Hannibal MO, Hartford CT, Elmira NY), and 12 orphan edges through refresh.

### Life Map Era Calculation — CORRECTED ASSESSMENT

Previously reported as a persistent bug. Updated finding: **eras calculate correctly on fresh page load** using active narrator's DOB. The bug manifests only during in-session narrator switches where eras are cached from the first narrator loaded. Self-heals on page reload. Severity downgraded from Medium to Low.

### Memoir State — CONFIRMED CLEAN

All 3 narrators show "Getting Started" state with no cross-narrator contamination.

---

## Summary Table

| Phase | Area | Result | Bugs Found |
|-------|------|--------|------------|
| 3A | Narrator Switcher | PASS | BUG-001 (WebSocket F5 recovery) |
| 3B | Bio Builder (18 views) | PASS | None |
| 3C | Lori Interview Grounding | PASS | None |
| 3D | Life Map | PARTIAL PASS | BUG-002 (era caching on switch) |
| 3E | Peek at Memoir | PASS | None |
| 3F | Mic / Camera | PASS | None |
| 3G | General Sanity | PASS | None |
| 4 | WD Deep Trace | CONFIRMED | WD-1, WD-2 still open |
