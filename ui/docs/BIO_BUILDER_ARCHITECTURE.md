# Bio Builder — Architecture

Branch: `feature/bio-builder-foundation`
Date: 2026-03-27

---

## What Bio Builder Is

Bio Builder is a **staging and intake layer** — a persistent, never-empty workspace where biographical material is captured, organized, and prepared for promotion into Lorevox's structured data model.

It is not a truth layer. It is not an editing surface. It is the bridge between raw biographical input (typed notes, pasted text, uploaded files, questionnaire answers) and the reviewed, authoritative structures that feed the Life Map, Timeline, and memoir preview.

The mental model:

> Lori = conversation and guidance
> **Bio Builder = intake and structuring**
> Life Map = visual navigation
> Peek at Memoir = narrative preview

---

## Where Bio Builder Sits

Lorevox's layered architecture:

```
Archive / Source Intake
  raw uploads, pasted text, typed notes, questionnaire responses
        ↓
Bio Builder  ←── YOU ARE HERE
  organizes and stages candidate biographical information
        ↓
Structured History
  reviewed facts, people, relationships, periods, events
        ↓
Derived Views
  Life Map, Timeline, Peek at Memoir, interview prompts
```

This is a refinement of the existing doctrine:

```
Archive → History → Memoir
```

Bio Builder belongs between Archive intake and Structured History — it is the **working intake layer**.

---

## Authoritative vs Non-Authoritative Data

| Layer | Authority | Writable? |
|---|---|---|
| `state.archive` | Source of truth for raw uploaded content | Append-only |
| `state.facts` | Reviewed, confirmed biographical facts | Via review flow only |
| `state.timeline.spine` | Authoritative life period structure | Via Lori interview only |
| `state.timeline.memories` | Memory anchors (semi-authoritative) | Via Lori interview only |
| `state.session` | Transient session state (era, pass, etc.) | Yes (session-scoped) |
| **`state.bioBuilder`** | **Candidate staging area — non-authoritative** | **Yes — intake writes here** |

Bio Builder writes only to `state.bioBuilder`. It never writes to `state.archive`, `state.facts`, `state.timeline.spine`, or `state.timeline.memories` directly. Promotion from candidate to fact requires explicit user review.

---

## Relationship to Archive / History / Memoir

**Archive**: Bio Builder's Source Inbox surfaces uploaded items from the archive. Raw uploads become Source Cards — visible, reviewable, not yet structured. Bio Builder is the *surface* for working with archive content, not a replacement for it.

**History**: Bio Builder produces candidate items (person cards, event cards, relationship cards, memory cards, place cards, document facts). These candidates are staged, not promoted. Promotion to structured history requires user confirmation — Bio Builder never silently mutates facts.

**Memoir**: Bio Builder does not produce memoir text directly. Memoir threads are assembled from structured history. Bio Builder feeds the history layer, which feeds memoir indirectly.

---

## Relationship to Life Map

Life Map is a **derived, read-only navigation layer** built from `state.timeline.spine.periods` and `state.timeline.memories`. It does not consume Bio Builder candidate data directly.

Indirect flow:

```
Bio Builder candidate card
  → user reviews and promotes
  → structured history / state.facts
  → Lori interview processes into timeline spine
  → Life Map renders from spine
```

Bio Builder candidates must never be injected directly into the SVG map as if they were confirmed periods. The Life Map reflects what the interview has confirmed, not what Bio Builder has staged.

---

## Relationship to Peek at Memoir

Peek at Memoir is a **preview and assembly surface** that renders memoir chapters from confirmed facts. Bio Builder does not write to memoir content. The relationship is indirect:

```
Bio Builder intake → structured facts → memoir threads → Peek at Memoir
```

Bio Builder should not be confused with a memoir editor. It is upstream intake.

---

## Relationship to Questionnaire Intake

The Janice Personal Information model defines the canonical intake structure:

- Identity: full name, preferred name, birth order, DOB, time of birth, place of birth
- Parents: first name, middle, last, birth date, birth place, occupation, notable life events (rich narrative)
- Grandparents: ancestry, cultural background, memorable stories
- Siblings: birth order, unique characteristics, shared experiences, memories
- Spouse / Children: names, dates, narrative
- Early Memories: first memory, favorite toy, significant event
- Education and Career: schooling, higher education, early career, career progression
- Later Years: retirement, life lessons, advice for future generations
- Hobbies and Interests
- Health and Wellness
- Technology and Beliefs
- Additional Notes: unfinished dreams, messages for future generations

The Bio Builder questionnaire maps directly to this model. Questionnaire answers create **candidate items** — they do not automatically update structured facts.

A completed "Parents" section creates:
- Person candidate: mother
- Person candidate: father
- Relationship candidates: parent → child
- Memory anchors: narrative excerpts
- Possible timeline items: birth dates, occupation periods

These candidates await review before promotion.

---

## Relationship to Uploaded Documents and Images

Uploaded documents (PDF, image, text, scanned questionnaire, family notes, letters, obituary drafts, genealogy sheets) enter the Source Inbox. Each upload immediately creates a **Source Card** with:

- filename
- source type
- upload timestamp
- extracted text status (pending / complete / failed)
- candidate people / dates / places extracted (if available)
- action: "Send to Bio Builder" / "Review Later"

Files are never silently absorbed into structured facts. They wait as Source Cards until the user routes them into the questionnaire or candidate review flow.

---

## Popout Model and Workspace Model

Bio Builder follows the lori8.0 popover pattern established by Peek at Memoir and Life Map:

- Opens as `popover="auto"` — dismissed by clicking outside
- Triggered by a header button (`#lv80BioBuilderBtn`)
- Uses the `.parchment-scroll` design language
- Consistent sizing with other popovers: `min(92vw, 920px)` × `min(88vh, 680px)`
- Internal navigation between sections (Quick Capture / Questionnaire / Source Inbox / Candidate Cards)
- Can be opened without a narrator selected — always shows useful actions

Internal popout panels (Phase E+):
- Questionnaire section detail
- Source card review
- Candidate card promotion flow
- Person detail

---

## What "Never Empty" Means Operationally

Bio Builder must always present actionable content, regardless of state.

| Condition | What Bio Builder Shows |
|---|---|
| No narrator selected | "Start a narrator" + "Paste text" + "Upload a file" |
| Narrator selected, no intake yet | Quick capture + questionnaire launcher + source drop zone |
| Narrator with questionnaire in progress | "Continue questionnaire — N sections incomplete" |
| Narrator with pending source cards | Source inbox with items awaiting review |
| Narrator with candidate cards | "Review N candidates" |
| Fully reviewed state | "Add more" prompts + questionnaire blanks |

The never-empty principle means the user should never open Bio Builder and see a blank screen with no call to action.

---

## What Bio Builder Is Not

- Not a chat interface (that is Lori)
- Not a memoir editor (that is the full memoir edit flow)
- Not an authoritative fact store (that is `state.facts` / structured history)
- Not a Life Map replacement (Life Map derives from confirmed timeline, not intake)
- Not an archive viewer (the archive stores raw bytes; Bio Builder *surfaces* them as Source Cards)

---

## Implementation Phases

| Phase | Description |
|---|---|
| A | Architecture and data model (this document) |
| B | Shell — Bio Builder button + popover in lori8.0.html |
| C | Never-empty intake — quick capture, questionnaire launcher, file drop zone |
| D | Source inbox — uploaded items as visible Source Cards |
| E | Candidate cards — text/questionnaire/file extraction into reviewable cards |
| F | Downstream wiring — Life Map + Timeline + memoir can consume Bio Builder candidate data after promotion |
