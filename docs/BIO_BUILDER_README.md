# bio-builder.js — Bio Builder Intake and Staging Layer

**Module:** `ui/js/bio-builder.js`
**Exposes:** `window.LorevoxBioBuilder`
**Version:** Lorevox 8.0 — Phase D
**Lines:** ~3,835
**Load order:** After `app.js` / `state.js`
**Dependencies:** None (no CDN, no external libraries)

---

## Architecture Overview

Bio Builder sits between raw source intake and the structured history layer. Its job is to organize and stage candidate biographical information — it never promotes data to reviewed facts on its own.

```
Archive / Source Intake
  ↓
Bio Builder  ← THIS MODULE
  organizes and stages candidate biographical information
  ↓
Structured History
  reviewed facts, people, relationships, periods, events
  ↓
Derived Views (Life Map, Timeline, Peek at Memoir)
```

### Truth Rules

Bio Builder writes ONLY to `state.bioBuilder`. It never writes to `state.archive`, `state.facts`, or `state.timeline`. Candidate items are not reviewed facts — promotion to structured history requires explicit user action (Phase E, not yet implemented).

---

## State Model

All Bio Builder state lives under `state.bioBuilder`, scoped per narrator by `personId`. The state shape:

```
state.bioBuilder = {
  personId:      string | null,
  quickItems:    [{id, text, type, ts}],          // type: "fact" | "note"
  questionnaire: {sectionId: data},                // keyed by section ID
  sourceCards:   [{                                 // Phase D
    id, filename, fileSize, sourceType, ts, status,
    extractedText, pastedText, detectedItems,
    addedCandidateIds
  }],
  candidates: {
    people:        [],
    relationships: [],
    events:        [],
    memories:      [],
    places:        [],
    documents:     []
  },
  familyTreeDraftsByPerson:  {pid: {nodes, edges, meta}},
  lifeThreadsDraftsByPerson: {pid: {nodes, edges, meta}}
}
```

Source card `status` values: `"extracting"`, `"extracted"`, `"manual-only"`, `"pasted"`, `"failed"`.

---

## Persistence Layer

Three data stores use localStorage for per-narrator draft persistence. All use schema version stamps (`{ v: 1, d: <data> }`) for forward compatibility.

| Data Type | localStorage Key Pattern | Introduced |
|-----------|-------------------------|------------|
| Family Tree drafts | `lorevox_ft_draft_{person_id}` | v4 |
| Life Threads drafts | `lorevox_lt_draft_{person_id}` | v4 |
| Questionnaire sections | `lorevox_qq_draft_{person_id}` | v8-fix |
| Draft index (all pids) | `lorevox_draft_pids` | v4 |

### Persistence Flow

The persist-before-clear, load-after-reset pattern ensures no data loss on narrator switch:

1. `_resetNarratorScopedState(newId)` — persists outgoing narrator's questionnaire, clears in-memory state, loads incoming narrator's drafts from localStorage.
2. `_personChanged(newId)` — same persist-before-clear pattern, then hydrates questionnaire from server profile if empty.
3. `_saveSection()` — calls `_persistDrafts(pid)` immediately for instant persistence on every save.

### Critical Guards

The questionnaire uses a single shared `bb.questionnaire` object (unlike FT/LT which use per-person containers). Two guards prevent cross-narrator data corruption:

- **Persist guard:** `_persistDrafts(pid)` only writes questionnaire data when `pid === bb.personId`, preventing FT/LT persist calls from writing the wrong narrator's questionnaire to an arbitrary key.
- **Load ordering:** `_loadDrafts(pid)` loads questionnaire data BEFORE the Family Tree early-return guard (which skips FT/LT loading when data is already in memory), ensuring questionnaire always loads regardless of FT state.

---

## Questionnaire Sections

Nine structured sections, defined in the `SECTIONS` array. Each section specifies an `id`, `label`, `icon`, `hint`, field definitions, and optionally `repeatable: true` for multi-entry sections.

| # | Section ID | Label | Repeatable | Fields |
|---|-----------|-------|------------|--------|
| 1 | `personal` | Personal Information | No | fullName, preferredName, birthOrder, dateOfBirth, timeOfBirth, placeOfBirth, zodiacSign |
| 2 | `parents` | Parents | Yes | relation, firstName, middleName, lastName, maidenName, birthDate, birthPlace, occupation, notableLifeEvents, notes |
| 3 | `grandparents` | Grandparents | Yes | firstName, lastName, ancestry, culturalBackground, memorableStories |
| 4 | `siblings` | Siblings | Yes | relation, firstName, middleName, lastName, birthOrder, uniqueCharacteristics, sharedExperiences, memories, notes |
| 5 | `earlyMemories` | Early Memories | No | firstMemory, favoriteToy, significantEvent |
| 6 | `education` | Education & Career | No | schooling, higherEducation, earlyCareer, careerProgression, communityInvolvement, mentorship |
| 7 | `laterYears` | Later Years | No | retirement, lifeLessons, adviceForFutureGenerations |
| 8 | `hobbies` | Hobbies & Interests | No | hobbies, worldEvents, personalChallenges, travel |
| 9 | `additionalNotes` | Additional Notes | No | unfinishedDreams, messagesForFutureGenerations |

### Hydration

When a narrator is loaded, `_hydrateQuestionnaireFromProfile(bb)` performs one-way hydration from `state.profile.basics` and `state.profile.kinship` into the questionnaire — but only for sections that are currently empty. It never overwrites existing Bio Builder questionnaire data. This ensures that switching to a narrator with a server-side profile pre-populates the Personal, Parents, and Siblings sections.

---

## Input Normalization Helpers

Bio Builder includes inline normalization that fires on input blur events. Each normalizer is attached via `inputHelper` declarations in the field definitions.

| Helper | Function | Example Inputs → Output |
|--------|----------|------------------------|
| `normalizeDob` | `normalizeDobInput(raw)` | `12241962` → `1962-12-24`, `Dec 24 1962` → `1962-12-24` |
| `normalizeTime` | `normalizeTimeOfBirthInput(raw)` | `1250p` → `12:50 PM`, `14:30` → `2:30 PM` |
| `normalizePlace` | `normalizePlaceInput(raw)` | `Williston ND` → `Williston, North Dakota` |

The place normalizer uses a built-in US state abbreviation-to-full-name map (`US_STATES`) and a reverse lookup (`_US_STATE_NAMES`) to handle `"City ST"`, `"City, ST"`, and `"City Statename"` formats.

### Zodiac Auto-Derivation

`deriveZodiacFromDob(isoDate)` computes zodiac sign from a `YYYY-MM-DD` string. When the DOB field is normalized on blur and a zodiac select exists in the same form, the zodiac field is auto-filled (only if currently empty — manual override is preserved).

### Canonical Basics Builder

`buildCanonicalBasicsFromBioBuilder()` constructs a profile-compatible `basics` object from the current questionnaire state. It applies normalization and name splitting but does NOT auto-write — the caller decides when and how to merge it into `state.profile.basics`.

---

## Phase D — Text Extraction and Detection Engine

Phase D adds document ingestion with pattern-based detection of biographical entities.

### File Intake Flow

1. User drops or selects files in the Source Inbox tab.
2. For text-extractable files (`.txt`, `.md`, `.csv`, `.htm`, `.html`, `.log`, or any `text/*` MIME), `FileReader.readAsText()` extracts content automatically.
3. For non-text files (PDF, images, binary), the user is presented a paste area to manually input the document's text.
4. Extracted or pasted text is stored on the source card and run through the detection engine.

### Detection Engine — `_parseTextItems(text)`

Returns `{ people, dates, places, memories }` — each an array of detected items with the shape:

```
{
  id:       string,      // unique ID
  text:     string,      // the matched value
  context:  string,      // surrounding sentence (≤200 chars)
  relation: string,      // (people only) "mother", "father", etc.
  added:    boolean      // set true when user adds as candidate
}
```

#### People Detection (`_detectPeople`)

Three patterns, applied in order with deduplication:

1. **Relationship-anchored:** Scans for relationship keywords (mother, father, sister, brother, grandmother, etc. — 40+ terms in `REL_KEYWORDS`), then searches for a proper noun (2–3 Title Case words) in the surrounding clause. Primary search direction is AFTER the keyword; BEFORE is a fallback for constructions like "Margaret, his mother."
2. **Named/called/known as:** Captures proper nouns following "named X", "called X", "known as X."
3. **Title + surname:** Matches `Mr./Mrs./Miss/Ms./Dr.` followed by a surname.

Name validation (`_looksLikeName`) filters out false positives by checking against a 100+ word exclusion set (`_NOT_NAMES` — articles, pronouns, calendar words, common sentence-starters) and geographic suffixes (`_GEO_SUFFIXES` — Street, Avenue, Lake, Mountain, etc.). Names must be at least 2 words and start with an uppercase ASCII letter.

Max results: 20.

#### Date Detection (`_detectDates`)

Four patterns, with smart deduplication that suppresses standalone years when they're already part of a full date:

1. **Full dates:** "January 15, 1942" / "15th January 1942"
2. **Numeric dates:** `MM/DD/YYYY` or `DD/MM/YYYY`
3. **Standalone years:** 4-digit years 1800–2029 (suppressed if already in a full date)
4. **Decade references:** "the 1950s" / "the '60s"

Max results: 24.

#### Place Detection (`_detectPlaces`)

Uses movement/origin verb anchors (`MOVEMENT_VERBS` — "born in", "grew up in", "moved to", "emigrated from", etc. — 24 phrases) followed by 1–4 Title Case words. Post-filters strip trailing stopwords and validate against the `_NOT_NAMES` exclusion set.

Max results: 16.

#### Memory Detection (`_detectMemories`)

Scans sentences for reminiscence language triggers (`MEMORY_TRIGGERS` — "I remember", "I recall", "when I was", "my earliest", "fondly remember", etc. — 28 phrases). Matching sentences longer than 20 characters are captured with a 180-char preview.

Max results: 16.

### Provenance Model

Every candidate tracks its origin via `sourceCardId` and `sourceFilename`. The source card maintains an `addedCandidateIds` array to prevent duplicate additions. Candidates added from the questionnaire use source strings like `"questionnaire:parents"`, `"questionnaire:siblings"`, etc.

---

## Candidate Extraction from Questionnaire

When a questionnaire section is saved, `_extractQuestionnaireCandidates(sectionId)` generates typed candidates:

| Section | Candidate Types Generated |
|---------|--------------------------|
| `parents` | Person + Relationship (narrator → parent) |
| `grandparents` | Person |
| `siblings` | Person |
| `earlyMemories` | Memory (one per filled field) |

Each extraction checks for existing duplicates using source-scoped deduplication (`_candidateExists`, `_relCandidateExists`, `_memCandidateExists`).

---

## Family Tree Drafts

A full graph editor with nodes (people) and edges (relationships), stored per-narrator in `bb.familyTreeDraftsByPerson[pid]`.

### Node Schema

```
{
  id, type: "person", role, firstName, middleName, lastName,
  displayName, preferredName, deceased, birthDate, deathDate,
  deathContext, notes, uncertainty, source
}
```

Roles: `narrator`, `parent`, `grandparent`, `sibling`, `spouse`, `child`, `guardian`, `chosen_family`, `other`.

### Edge Schema

```
{
  id, from, to, relationshipType, label, notes
}
```

Relationship types: `biological`, `step`, `adoptive`, `half`, `foster`, `marriage`, `former_marriage`, `chosen_family`, `guardian`, `other`.

### Seeding

Two seeding functions populate the family tree from existing data:

- `_ftSeedFromQuestionnaire()` — creates nodes and edges from Parents, Siblings, and Grandparents questionnaire sections, with the narrator as root. Includes deduplication and auto-infers relationship types from relation labels.
- `_ftSeedFromCandidates()` — creates nodes from the `candidates.people` array, inferring roles and relationship types from candidate relation fields.

### Quality Tools

- `_ftFindDuplicates()` — exact-match duplicate detection by display name.
- `_ftFindFuzzyDuplicates(pid)` — token-based fuzzy name matching with confidence tiers (exact ≥1.0, likely ≥0.8, possible ≥0.5).
- `_ftFindUnconnected()` — nodes with zero edges.
- `_ftFindWeakNodes()` — nodes missing first name, last name, or birth date.
- `_ftFindUnsourced()` — nodes with source = "manual" and empty notes.
- `_ftCleanOrphanEdges()` — removes edges referencing deleted nodes.

### Fuzzy Name Matching

`_fuzzyNameScore(a, b)` produces a 0.0–1.0 similarity score using:

- Name normalization (lowercase, strip titles/suffixes/punctuation, collapse whitespace)
- Weighted composite: first name match (0.30), last name match (0.35), token overlap (0.25), initial matching bonus (0.10)

`_fuzzyDuplicateTier(score)` maps scores to tiers: `"exact"` (≥1.0), `"likely"` (≥0.8), `"possible"` (≥0.5), `"distinct"` (<0.5).

---

## Life Threads Drafts

A parallel graph structure for thematic life threads (recurring themes, interests, turning points), stored in `bb.lifeThreadsDraftsByPerson[pid]`. Uses the same node/edge add/edit/delete/persist pattern as Family Tree.

### Seeding

- `_ltSeedFromCandidates()` — creates theme nodes from candidate memories and events.
- `_ltSeedThemes()` — pre-populates common life thread themes.

---

## UI Rendering

Bio Builder renders inside a `popover="auto"` element (`#bioBuilderPopover`). All rendering is imperative DOM manipulation (no framework) via `innerHTML` assignment.

### Tab Structure

Six tabs, tracked by `_activeTab`:

| Tab ID | Label | Description |
|--------|-------|-------------|
| `capture` | Quick Capture | Free-form fact/note entry |
| `questionnaire` | Questionnaire | Structured 9-section intake |
| `sources` | Source Inbox | File upload + source card review (Phase D) |
| `candidates` | Candidates | Extracted people, places, dates, memories with provenance |
| `familyTree` | Family Tree | Graph editor with nodes + edges |
| `lifeThreads` | Life Threads | Thematic thread graph editor |

### View Modes

Family Tree and Life Threads each support three view modes: `"cards"` (default — card list), `"graph"` (visual graph), `"scaffold"` (structural view). Toggled via `_toggleFTViewMode()` / `_toggleLTViewMode()`.

### Inline Confirmations

Destructive actions (node deletion with connected edges) use `_showInlineConfirm(message, onConfirm)` instead of native `confirm()` dialogs. The confirmation overlay renders inside the popover (top layer) for proper z-index stacking.

---

## Public API (`window.LorevoxBioBuilder`)

### Core

| Method | Description |
|--------|-------------|
| `render()` | Full re-render of the Bio Builder popover |
| `refresh()` | Alias / lightweight re-render |
| `onNarratorSwitch(newId)` | Called from app.js when narrator changes |
| `SECTIONS` | The section definitions array |

### Tab Navigation

| Method | Description |
|--------|-------------|
| `_switchTab(tabId)` | Switch active tab |

### Quick Capture

| Method | Description |
|--------|-------------|
| `_addFact()` | Add a quick fact from the capture input |
| `_addNote()` | Add a note from the capture textarea |

### Questionnaire

| Method | Description |
|--------|-------------|
| `_openSection(sectionId)` | Open a questionnaire section for editing |
| `_closeSection()` | Return to section list |
| `_addRepeatEntry(sectionId)` | Add another entry to a repeatable section |
| `_saveSection(sectionId)` | Save section data + persist to localStorage |

### Source Inbox (Phase D)

| Method | Description |
|--------|-------------|
| `_handleFiles(files)` | Process dropped/selected files into source cards |
| `_reviewSource(cardId)` | Open a source card review panel |
| `_closeSourceReview()` | Close the review panel |
| `_savePastedText(cardId)` | Save manually pasted text and run detection |
| `_addItemAsCandidate(cardId, type, itemId)` | Add a single detected item as a candidate |
| `_addAllOfType(cardId, type)` | Add all detected items of a type |
| `_addAllFromCard(cardId)` | Add all detected items from a card |

### Normalization

| Method | Description |
|--------|-------------|
| `normalizeDobInput(raw)` | Smart date-of-birth parser → `YYYY-MM-DD` |
| `normalizeTimeOfBirthInput(raw)` | Time parser → `HH:MM AM/PM` |
| `normalizePlaceInput(raw)` | US place normalizer → `"City, State"` |
| `deriveZodiacFromDob(isoDate)` | Zodiac sign from ISO date |
| `buildCanonicalBasicsFromBioBuilder()` | Build profile basics from questionnaire |
| `_onNormalizeBlur(inputEl, kind)` | Inline blur handler for form fields |

### Candidate Helpers

| Method | Description |
|--------|-------------|
| `_getCandidateTitle(candidate)` | Display title for a candidate |
| `_getCandidateText(candidate)` | Full text representation |
| `_getCandidateSnippet(candidate)` | Short preview snippet |

### Family Tree

| Method | Description |
|--------|-------------|
| `_ftAddNode(role)` | Add a new family tree node |
| `_ftDeleteNode(nodeId)` | Delete a node (with inline confirmation if connected) |
| `_ftEditNode(nodeId)` | Open node edit form |
| `_ftSaveNode(nodeId)` | Save edited node |
| `_ftAddEdge(fromId)` | Open edge creation form |
| `_ftSaveEdge(fromId)` | Save a new edge |
| `_ftDeleteEdge(edgeId)` | Delete an edge |
| `_ftSeedFromQuestionnaire()` | Populate tree from questionnaire data |
| `_ftSeedFromCandidates()` | Populate tree from candidate people |
| `_ftFindDuplicates()` | Exact-match duplicate check |
| `_ftFindFuzzyDuplicates(pid)` | Fuzzy name duplicate check |
| `_ftFindUnconnected()` | Nodes with no edges |
| `_ftFindWeakNodes()` | Nodes missing key fields |
| `_ftFindUnsourced()` | Manual nodes with no notes |
| `_ftCleanOrphanEdges()` | Remove edges to deleted nodes |
| `_toggleGroupCollapse(groupId)` | Toggle node group collapse in cards view |
| `_toggleFTViewMode()` | Cycle cards → graph → scaffold |

### Life Threads

| Method | Description |
|--------|-------------|
| `_ltAddNode()` | Add a life thread node |
| `_ltDeleteNode(nodeId)` | Delete a node |
| `_ltEditNode(nodeId)` | Open node edit form |
| `_ltSaveNode(nodeId)` | Save edited node |
| `_ltAddEdge(fromId)` | Open edge creation form |
| `_ltSaveEdge(fromId)` | Save a new edge |
| `_ltDeleteEdge(edgeId)` | Delete an edge |
| `_ltSeedFromCandidates()` | Populate threads from candidate data |
| `_ltSeedThemes()` | Pre-populate common life themes |
| `_toggleLTViewMode()` | Cycle cards → graph → scaffold |

### Persistence

| Method | Description |
|--------|-------------|
| `_persistDrafts(pid)` | Save FT + LT + QQ to localStorage for a narrator |
| `_loadDrafts(pid)` | Restore FT + LT + QQ from localStorage |
| `_clearDrafts(pid)` | Remove all localStorage keys for a narrator |
| `_getDraftIndex()` | Get array of all pids with saved drafts |

### Context Helpers (for external consumers)

| Method | Description |
|--------|-------------|
| `_getDraftFamilyContext(pid)` | Returns family tree summary for AI context |
| `_getDraftFamilyContextForEra(pid, era)` | Family context filtered by life era |

### Internal Utilities (exposed for testing)

| Method | Description |
|--------|-------------|
| `_normalizeName(name)` | Lowercase + strip titles/punctuation |
| `_fuzzyNameScore(a, b)` | Token-based name similarity (0.0–1.0) |
| `_fuzzyDuplicateTier(score)` | Map score to confidence tier string |
| `_parseTextItems(text)` | Run full detection engine on text |

---

## Integration Points

### Inbound (called by app.js)

- `LorevoxBioBuilder.render()` — when the Bio Builder popover opens
- `LorevoxBioBuilder.onNarratorSwitch(newId)` — when narrator changes via `lvxSwitchNarratorSafe()`

### Outbound (reads from)

- `state.person_id` — current narrator UUID
- `state.profile.basics` — narrator profile for questionnaire hydration
- `state.profile.kinship.parents` / `kinship.siblings` — kinship data for hydration

### Never Writes To

- `state.archive`
- `state.facts`
- `state.timeline`

---

## Known Issues

| Bug ID | Description | Status |
|--------|-------------|--------|
| WD-1 | Questionnaire data lost on narrator switch | FIXED (v8-fix) |
| WD-2 | Questionnaire data lost on page refresh | FIXED (v8-fix) |
| WD-3 | Form field key mismatches (cosmetic) | Open — Low |
| BUG-002 | Life Map era dates not recalculated on switch | Open — Low (not in this module) |

---

## Version History

| Version | Phase | Key Changes |
|---------|-------|-------------|
| v1–v3 | B | Initial Bio Builder: questionnaire, quick capture, candidates |
| v4 | C | localStorage persistence for FT/LT drafts, draft index |
| v5 | C | Source Inbox (basic), candidate extraction from questionnaire |
| v6 | C | Fuzzy name matching, profile → questionnaire hydration, graph view modes |
| v7 | C | Inline confirmations, orphan edge cleanup, scaffold view, seeding improvements |
| v8-fix | D | Questionnaire localStorage persistence (WD-1/WD-2 fix), cross-narrator write guard, FileReader extraction, detection engine, provenance model, source card review surface |
