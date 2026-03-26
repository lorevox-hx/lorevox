# MEMOIR_PANEL_V2_MEANING_ENGINE_PLAN.md

## Core Shift

The memoir panel is no longer a fact display surface.

It becomes a **Meaning Assembly Engine**.

Where Lori is not just collecting facts, but detecting:
- emotional weight
- narrative tension
- identity formation
- transformation

Current architecture:
```
extraction → display → edit
```

New architecture:
```
meaning detection → narrative structuring → ethical rendering
```

This document defines the upgrade. It builds on `MEMOIR_PANEL_NEVER_EMPTY_PLAN_80.md` and is grounded in the memoir theory framework (stakes, vulnerability, cortisol/oxytocin triggers, dual-persona voice, narrative arc) and the validated Lori 8.0 runtime contract.

---

## 1. Meaning Layer — Architecture

### 1.1 New extraction unit structure

Each extracted unit currently stores text and a quality confidence score. The new structure adds meaning tagging and narrative role classification:

```json
{
  "text": "...",
  "type": "fact | memory | relationship | transition",
  "meaning_tags": [
    "stakes",
    "vulnerability",
    "turning_point",
    "identity",
    "loss",
    "belonging"
  ],
  "narrative_role": "setup | inciting | escalation | climax | resolution | reflection"
}
```

The meaning layer sits between raw extraction and display. It is probabilistic — not every unit will have tags, and tags may be wrong. They are scaffolding hints, not hard labels.

Dual persona fields (see §1.4) are added optionally:

```json
{
  "experience": "...raw memory, in-the-moment...",
  "reflection": "...what it means now, seen from distance..."
}
```

---

### 1.2 Neurobiological Triggers — First-Class Extraction Targets

These are not theory. They become system features: signal types that the extractor tries to detect and tag.

#### A. Cortisol Triggers — Stakes

Detect: conflict, danger, pressure, urgency, desire vs. obstacle.

Examples:
- "we almost lost the house"
- "I had to leave or things were going to get worse"
- "there was no choice"
- "things got bad fast"

Tag: `meaning_tags: ["stakes"]`

#### B. Oxytocin Triggers — Vulnerability

Detect: emotional exposure, family dynamics, intimacy or rupture, loneliness, attachment, loss of connection.

Examples:
- divorce, estrangement, being the only child
- "she never came back"
- "I didn't know how to tell him"
- caregiving, abandonment, death of a parent

Tag: `meaning_tags: ["vulnerability", "relationship"]`

#### Tagging heuristics

These are probabilistic signals passed to the extraction prompt. The LLM should attempt to assign tags when they are clearly present, leave them empty when absent, and never invent them. Over-tagging is worse than under-tagging.

---

### 1.3 Narrative Role Mapping

Every meaningful event should be attempted to be mapped to a narrative role. This is not strict — it is probabilistic scaffolding that drives grouping and draft shaping.

| Role | Meaning |
|---|---|
| `setup` | Baseline life — who the narrator was before the story started |
| `inciting` | The first disruption — what changed the trajectory |
| `escalation` | Struggle — the pressure building |
| `climax` | Irreversible change — the moment that can't be undone |
| `resolution` | New state — what came after |
| `reflection` | Meaning-making — what it means now, looking back |

Mapping is invisible to the user. It drives draft structuring (§2.1) and thread grouping (§1.5).

---

### 1.4 Dual Persona Capture — Critical

This is one of the most architecturally important upgrades.

Every significant memory has two voices:

**"You Then" — Experiential**
- sensory, emotional, in-the-moment
- raw, unprocessed, present-tense in memory
- "I remember how cold the kitchen was"
- "I didn't understand what was happening"

**"You Now" — Reflective**
- interpretive, meaning-making, distant
- "I know now that she was scared too"
- "Looking back, that was when I started to change"

The system should capture both when they appear in the same turn or adjacent turns. Threads can carry both fields. Draft rendering can pair them.

```json
{
  "text": "I remember how cold the kitchen was the morning he left",
  "type": "memory",
  "meaning_tags": ["loss", "identity"],
  "narrative_role": "climax",
  "experience": "I remember how cold the kitchen was the morning he left",
  "reflection": null
}
```

When the narrator adds reflection later ("I know now that it was the last time we were all together"), the reflection field updates.

**Why this matters:** without dual persona, a memoir is a timeline. With it, it becomes a story that knows what it means.

---

### 1.5 Meaning-Based Thread Grouping

Replace the purely structural category list with a hybrid structure.

**Structural Sections** (unchanged):
- Family & Relationships
- Places & Home
- Work & Daily Life
- Education

**Meaning Sections** (new):
- **Turning Points** — moments where things changed irreversibly
- **Hard Moments** — loss, difficulty, pressure, grief
- **Identity & Belonging** — who I was, who I became, where I fit
- **Change & Transition** — moves, departures, new starts

Threads are grouped by whichever section they best fit. A thread can appear in both a structural and a meaning section (e.g., a job loss appears in Work & Daily Life AND in Turning Points). Duplication at the display layer is acceptable — the underlying unit is stored once.

This is where the memoir theory comes alive in the UI. The user sees not just *what happened* but *what kind of thing it was*.

---

### 1.6 Memoir Panel as Narrative Scaffold

Threads state should now feel like: **"This is the beginning of a story."**

Not: "Here are some facts."

The panel copy, section labels, and placeholder examples should all reflect narrative awareness. Example:

> **Turning Points**
> *Nothing here yet — these are the moments that changed everything. They often start with: "I had to decide…" or "That was when everything changed."*

This fulfills the never-empty requirement (from `MEMOIR_PANEL_NEVER_EMPTY_PLAN_80.md`) at a higher level: the panel is not just informative, it is narratively alive even before content exists.

---

## 2. Draft Engine — Architecture Upgrade

### 2.1 Narrative Assembly Pass

Before a draft is produced, introduce an assembly pass:

```
threads → narrative assembly → draft
```

Assembly rules:
1. Group by meaning + approximate chronology
2. Prioritize: stakes, vulnerability, turning points
3. Connect events structurally: setup → disruption → change → aftermath
4. Pair experience + reflection where both exist

This pass does not generate prose. It sequences and connects. The LLM then drafts from the assembled structure, not from a flat list of threads.

---

### 2.2 Five-Part Memoir Template

This becomes the default structuring lens for the assembly pass and draft:

| Part | Memoir function |
|---|---|
| **1. World As It Was** | Establish the baseline — setting, family, identity before the main arc |
| **2. Inciting Incident** | The disruption — what changed the trajectory |
| **3. Rising Stakes** | The struggle — what was at risk, what had to be decided |
| **4. Climax** | The irreversible moment — what happened that couldn't be undone |
| **5. Resolution** | New state — what came after, who the narrator became |

This template is invisible to the user. It is the internal shape the assembly pass tries to fill. Not every memoir will have all five parts fully populated — that is fine. The assembly pass fills what it can and leaves the rest as threads.

---

### 2.3 Ethical Boundary — The Unspoken Pact

The system must maintain strict separation between layers. This is not just architecture — it is the trust contract with the narrator.

| Layer | Editable by user | Mutable by system |
|---|---|---|
| Archive (raw extraction) | No | No |
| Extracted threads | Review only | Append-only |
| Memoir draft | Yes — fully | Replaced on re-draft |

The archive is sacred. The draft is the user's. The threads are the bridge.

This aligns with the core memoir theory insight: the system must separate *emotional truth* (what the narrator felt and what it meant) from *factual trust* (what actually happened, as best as can be known). Neither should contaminate the other.

---

## 3. Export — Upgraded Requirements

### 3.1 Export must preserve narrative structure

TXT and DOCX exports should reflect the meaning-aware structure, not a flat dump of facts.

- Section headers (structural + meaning sections where populated)
- Grouped threads or draft prose (matching panel state)
- Optional narrative arc markers (hidden metadata in DOCX, future feature)

### 3.2 Export Mode Types

**A. Threads Export**
- Grouped by section
- Labeled with section headings
- Scaffold view — shows the building blocks

**B. Draft Export**
- Full prose
- Readable narrative
- Section headings as H1/H2

### 3.3 DOCX Formatting

DOCX should include:
- Title: `Memoir Draft — [Narrator Name]`
- Section headings (H1 structural, H2 meaning)
- Paragraph spacing
- Future: italic reflection lines (paired with experience lines)

### 3.4 Export truth rule (unchanged from V1)

Export must reflect exactly what the user sees. No hidden DB rows, no placeholder examples, no raw extraction markers. If the panel shows scaffold content, that content is not exported.

---

## 4. Test Spec — Meaning-Aware Memoir Test

**Test name:** `LOREVOX_MEANING_AWARE_MEMOIR_TEST`

### 4.1 Goal

Verify the system captures:
- facts (baseline)
- meaning tags (new)
- narrative roles (new)
- emotional weight (new)
- dual persona where present (new)

### 4.2 Required Conversation Elements

The test conversation must include all of the following:

**Structural (from V1):**
- Date/place of birth
- Childhood home or setting
- Work or career
- At least one move or transition

**Meaning (new, required):**
- One vulnerability moment: divorce, loss, estrangement, caregiving, or abandonment
- One stakes moment: conflict, risk, difficult decision, or pressure
- One turning point: a moment that changed things irreversibly
- One reflection: narrator looking back, assigning meaning

**Mode test (from V1):**
- One companion turn (off-domain, extraction should not fire)
- One recovery turn (memoir resumes, extraction resumes)

### 4.3 Validation Layers

**A. Extraction quality**
- Facts extracted from structural turns: ≥1 per turn
- Meaning tags assigned: ≥1 per vulnerability or stakes moment
- `vulnerability` detected: at least once
- `stakes` detected: at least once

**B. Narrative structure**
- At least one event mapped to `inciting` or `turning_point` role
- Threads grouped into at least one meaning section (Turning Points, Hard Moments, or Identity & Belonging)
- Order is not purely chronological — meaning-based grouping is visible

**C. Dual persona**
- At least one experience + reflection pair captured (if narrator provides both in the conversation)
- If narrator provides only experience: acceptable — reflection field remains null

**D. Memoir panel**
- Shows: Family/Relationships + at least one Meaning section
- Includes emotional content, not just logistics
- Placeholder examples for empty meaning sections (never blank)

**E. Contamination protection**
- Companion turn: 0 facts extracted, no meaning tags assigned
- No emotional content from companion turn appears in threads
- Recovery resumes correctly

**F. Export**
- TXT export: sections preserved, readable
- DOCX export: headings, structure, spacing correct
- Exported content matches visible panel state
- No scaffold placeholders in exported content

---

## 5. What This Changes Strategically

Right now Lori is: **a recorder of life.**

This upgrade makes Lori: **a detector of meaning.**

That is the difference between a database and a memoir system.

The mode engine (validated in Phase 1 and Phase 2) handles the behavioral contract: correct posture, correct gating, correct recovery. That layer is stable.

This plan handles the next layer: once the gate is open and the system is in life_story posture, what does it do with what it hears?

The answer: it listens for meaning, not just facts.

---

## 6. Implementation Order

### Phase A — Meaning infrastructure
1. Add `meaning_tags` and `narrative_role` fields to extraction schema
2. Update extraction prompt to attempt meaning tag assignment
3. Add cortisol/stakes and oxytocin/vulnerability as explicit detection targets in prompt
4. Log meaning tags in `window.__lv80TurnDebug` per turn

### Phase B — Dual persona
5. Add `experience` and `reflection` fields to extracted unit schema
6. Detection heuristic: if narrator uses "I know now / looking back / I understand now" → reflection candidate
7. Pair with prior experience entry where applicable

### Phase C — Panel upgrade
8. Meaning-based thread sections added to panel
9. Hybrid rendering: structural + meaning sections, real content first, placeholders for empty meaning sections
10. Narrative copy for placeholders (not generic filler — narratively aware)

### Phase D — Draft engine
11. Narrative assembly pass: threads → structure → draft
12. Five-part template as assembly lens
13. Experience + reflection pairing in draft rendering

### Phase E — Export
14. Threads export: meaning-grouped structure
15. Draft export: prose with section headings
16. DOCX formatting: title, H1/H2, spacing

### Phase F — Validation
17. Run `LOREVOX_MEANING_AWARE_MEMOIR_TEST`
18. Confirm meaning tag assignment in debug log
19. Confirm narrative grouping in panel
20. Save sample artifact to `tools/samples/`

---

## 7. Relationship to Existing Artifacts

| Artifact | Relationship |
|---|---|
| `MEMOIR_PANEL_NEVER_EMPTY_PLAN_80.md` | V1 — this plan supersedes it at the architectural level, but its rendering rules (never-empty, scaffold layers, export) are preserved and extended |
| `LOREVOX_35_PHASE2_REPORT.md` | Mode engine is confirmed stable — this plan builds on top of a validated behavioral foundation |
| `LOREVOX_35_PERSONA_MODE_SCORING_SCHEMA.json` | Needs new fields: `meaning_tags_present`, `vulnerability_detected`, `stakes_detected`, `dual_persona_captured` |
| `LOREVOX_35_PERSONA_MODE_TEST_SHEET.csv` | Needs new validation columns per §4.3 |
| `lori8.0.html` | Extraction function `_extractFacts()` is the primary upgrade target for §6 Phase A |

---

## 8. Release Standard

For deployment, the memoir panel must:

- Never feel empty (from V1 — unchanged)
- Feel narratively alive even before extraction begins
- Show the user that Lori understands *what matters*, not just *what happened*
- Protect the archive from contamination absolutely
- Export faithfully what the user sees

The goal is a system where the narrator looks at the memoir panel after ten minutes of conversation and thinks:

> *"This is my story. Not just what I said — what it meant."*

That is the standard.
