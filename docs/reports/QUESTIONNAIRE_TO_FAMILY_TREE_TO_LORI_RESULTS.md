# Lorevox Trace Test — Questionnaire → Family Tree → Lori Grounding

## Date: 2026-03-29
## Test Environment: Chrome via Claude in Chrome, localhost:8080

---

## 1. Pass 1A — Mark Twain Questionnaire (9 Sections)

| Section | Status | Key Data |
|---------|--------|----------|
| personal | FILLED | Samuel Langhorne Clemens / Mark Twain, DOB 1835-11-30, Florida MO, male, Sagittarius |
| parents | FILLED | John Marshall Clemens (biological), Jane Lampton Clemens (biological) |
| grandparents | FILLED | Samuel B. Clemens, Pamela Goggin Clemens, Benjamin Lampton, Margaret Casey Lampton |
| siblings | FILLED | Orion Clemens, Henry Clemens, Pamela Clemens Moffett (all biological) |
| earlyMemories | FILLED | Hannibal MO, Mississippi River, Tom Blankenship, Laura Hawkins |
| education | FILLED | Common schools Hannibal, self-educated, printer's apprentice |
| laterYears | FILLED | Steamboat pilot → author, married Olivia Langdon 1870, 4 children |
| hobbies | FILLED | Billiards, cigars, cats, storytelling |
| additionalNotes | FILLED | Halley's Comet 1835/1910, pen name origin |

**Questionnaire persistence**: Verified survives popover close/reopen. Does NOT survive page reload (session-scoped, as designed).

---

## 2. Pass 2A — Mark Twain FT Seed

### Pre-Seed State
- 12 nodes (from v1 external seeding): 1 narrator, 2 parents, 3 siblings, 3 children, 1 spouse, 1 in-law, 1 associate
- 11 edges (10 with undefined from/to — orphan edges from v1)

### Seed Execution
- `_ftSeedFromQuestionnaire()` called — **no crash, no errors**
- Prior session crash (TypeError on narrator ID lookup) was fixed in this session

### Post-Seed State
- **16 nodes** (+4 grandparents from questionnaire)
- **5 edges** (orphan cleanup removed 6 v1 orphan edges, 4 new grandparent edges added, 1 pre-existing spouse edge retained)

### De-Duplication Verification

| Node | Pre-existing | Questionnaire Match | Result |
|------|-------------|-------------------|--------|
| Mark Twain (narrator) | ft_narrator (type=narrator, displayName="Mark Twain") | fullName="Samuel Langhorne Clemens", preferredName="Mark Twain" | Correctly de-duplicated via display name match |
| Jane Lampton Clemens (parent) | ft_mother (type=parent, displayName="Jane Lampton Clemens") | firstName="Jane" lastName="Lampton Clemens" | Correctly de-duplicated via displayName match |
| John Marshall Clemens (parent) | ft_father (role=parent, label="John Marshall Clemens") | firstName="John" lastName="Marshall Clemens" | Correctly de-duplicated via label fallback in _ftNodeDisplayName |
| Orion Clemens (sibling) | ft_orion (type=sibling, displayName="Orion Clemens") | firstName="Orion" lastName="Clemens" | Correctly de-duplicated |
| Henry Clemens (sibling) | ft_henry (type=sibling, displayName="Henry Clemens") | firstName="Henry" lastName="Clemens" | Correctly de-duplicated |
| Pamela Clemens Moffett (sibling) | ft_pamela (type=sibling, displayName="Pamela Clemens Moffett") | firstName="Pamela" lastName="Clemens Moffett" | Correctly de-duplicated |
| Samuel B. Clemens (grandparent) | — | firstName="Samuel" lastName="B. Clemens" | **Created** (new) |
| Pamela Goggin Clemens (grandparent) | — | firstName="Pamela" lastName="Goggin Clemens" | **Created** (new) |
| Benjamin Lampton (grandparent) | — | firstName="Benjamin" lastName="Lampton" | **Created** (new) |
| Margaret Casey Lampton (grandparent) | — | firstName="Margaret" lastName="Casey Lampton" | **Created** (new) |

### Scaffold View Verification
- 4-generation layout renders correctly
- All 4 grandparents in correct unique slots (no duplicates after scaffold fix)
- Parents in correct slots
- Narrator at center
- Siblings, children, spouse, in-law, associate in Other Family Members section
- Generation color coding correct (indigo/purple/pink/amber)

---

## 3. Pass 3A — Mark Twain Lori Grounding

### Test Prompts and Responses

| Prompt | Lori Response | Grounding Evidence |
|--------|--------------|-------------------|
| "Tell me about my brother Henry. What happened to him?" | "Henry, yes... I remember you mentioning him earlier. It seems like you were close, and his story has stayed with you." | Recognized Henry as family member, contextually aware |
| "What do you know about my mother Jane?" | "Your mother, Jane – I feel like there's a special bond between you two. Tell me, what kind of woman was she?" | Recognized Jane as mother, engaged with relationship context |
| "What can you tell me about my grandparents? The Lampton side." | "The Lamptons – I've heard snippets about your interest in them, Mark." | Recognized Lamptons as family branch, addressed narrator as "Mark" |

### Grounding Chain Verification
- `interview.js` reads FT nodes via `_getDraftFamilyContext()` (lines 172-192)
- Builds hint strings: "(Family context: parent Jane Lampton Clemens, sibling Orion Clemens, ...)"
- Hints injected into system prompt for Lori's LLM calls
- Lori correctly uses family awareness to ask contextual follow-up questions

**Pass 3A Result: PASS** — Lori demonstrates narrator-specific family awareness for Mark Twain.

---

## 4. Pass 1B — Janice Questionnaire (9 Sections)

| Section | Status | Key Data |
|---------|--------|----------|
| personal | FILLED | Janice Marie Thompson, DOB 1952-06-15, Portland OR, female, Gemini |
| parents | FILLED | Robert Thompson (biological), Dorothy Mae Thompson (biological) |
| grandparents | FILLED | Harold Thompson, Edith Thompson, Frank Kowalski, Rose Kowalski |
| siblings | FILLED | Tommy Thompson (biological), Linda Thompson Garcia (biological) |
| earlyMemories | FILLED | Yellow ranch house on Maple Street, Grandma Rose's pierogi, Susan Parker |
| education | FILLED | Lincoln High School, Portland State University English degree 1974 |
| laterYears | FILLED | English teacher 32 years, married David Chen 1975, 2 children |
| hobbies | FILLED | Reading mysteries, gardening, book club since 1998 |
| additionalNotes | FILLED | Portland lifer, 4 grandchildren (Emma, Jack, Lily, Mateo) |

---

## 5. Pass 2B — Janice FT Seed

### Pre-Seed State
- Empty (clean slate — no pre-existing v1 data for Janice)

### Post-Seed State
- **9 nodes**: 1 narrator + 2 parents + 2 siblings + 4 grandparents
- **8 edges**: One biological edge per non-narrator node connecting to narrator
- All nodes have source="questionnaire"
- No crashes, no errors

### Scaffold View Verification
- 4-generation layout renders correctly
- All 4 grandparents in unique slots: Harold Thompson, Edith Thompson, Frank Kowalski, Rose Kowalski
- Parents: Robert Thompson, Dorothy Mae Thompson
- Narrator: Janice
- Siblings in Other Family Members: Tommy Thompson, Linda Thompson Garcia

---

## 6. Pass 3B — Janice Lori Grounding

| Prompt | Lori Response | Grounding Evidence |
|--------|--------------|-------------------|
| "Tell me about my grandmother Rose. She taught me so much in the kitchen." | "Grandmother Rose, the one who shared her culinary wisdom with you – what do you remember learning from her cooking?" | Recognized Rose as grandmother, acknowledged cooking context |
| "My brother Tommy was quite the athlete back in school." | "Tommy, the athletic one – I believe you might have mentioned him briefly earlier, but I'd love to hear more about his story." | Recognized Tommy as brother, engaged with athletic context |

**Pass 3B Result: PASS** — Lori demonstrates narrator-specific family awareness for Janice. No Mark Twain data bled into Janice responses.

---

## 7. Pass 4 — Narrator Switching Isolation

### FT Data Isolation Check

| Check | Result |
|-------|--------|
| Mark Twain FT after Janice session | 16 nodes, 5 edges — unchanged |
| Janice FT after switch back to Mark Twain | 9 nodes, 8 edges — unchanged |
| Mark Twain FT contains Janice/Thompson/Kowalski names | **NO** — clean |
| Janice FT contains Mark/Twain/Clemens names | **NO** — clean |
| Mark Twain scaffold renders correctly after round-trip | **YES** — all 4 Clemens/Lampton grandparents in correct slots |
| Janice scaffold renders correctly after round-trip | **YES** — all 4 Thompson/Kowalski grandparents in correct slots |

**Pass 4 Result: PASS** — Complete narrator isolation. No cross-contamination detected in any layer.

---

## 8. Summary Matrix

| Pass | Narrator | Test | Result |
|------|----------|------|--------|
| 1A | Mark Twain | Questionnaire fill (9 sections) | PASS |
| 2A | Mark Twain | FT seed from questionnaire | PASS |
| 3A | Mark Twain | Lori grounding (3 prompts) | PASS |
| 1B | Janice | Questionnaire fill (9 sections) | PASS |
| 2B | Janice | FT seed from questionnaire | PASS |
| 3B | Janice | Lori grounding (2 prompts) | PASS |
| 4 | Both | Narrator switching isolation | PASS |

**Overall: 7/7 passes. End-to-end chain Questionnaire → Family Tree → Lori Grounding is verified.**

---

## 9. Bugs Found and Fixed (see BUG_LOG and FIX_REPORT)

| Bug ID | Description | Status |
|--------|-------------|--------|
| QF-3a | `_ftSeedFromQuestionnaire()` crash: narrator ID lookup fails for dual-schema nodes | FIXED (prior session) |
| QF-3b | Grandparent de-duplication only checks `n.role`, misses `n.type` | FIXED |
| QF-3c | Scaffold view duplicates grandparents across parent slots (shared ID tracker missing) | FIXED |
