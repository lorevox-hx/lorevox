# LOREVOX_7_PLANNING_SYNTHESIS

**Date:** 2026-03-13  
**Status:** Planning / research synthesis for Lorevox 7  
**Purpose:** Consolidate current v7 direction, prior redesign work, memoir UI research, and archive doctrine into one repo-ready planning document.

---

## 1. Executive Summary

Lorevox 7 should not be built as a better interview form or a prettier chat app. It should be built as a **conversation-first, archive-first memory studio**.

The central product idea is now clear:

> **Lori is the app. Everything else is what she builds.**

That means the visible experience should feel like a calm, respectful conversation with Lori, while the hidden system continuously turns that conversation into a durable personal archive: people, relationships, events, timeline structure, memoir drafts, and obituary-ready narrative material.

The transition from v6.x to v7 is not mainly a visual redesign. It is a shift in product architecture:

- from **form-driven interview** to **guided life review**
- from **chat as one panel** to **Lori as the persistent primary presence**
- from **raw conversation logs** to **structured extract-review-build pipelines**
- from **memoir drafting as a later add-on** to **memoir / obituary / timeline / family tree as live outputs of the same archive**
- from **local-first as a convenience** to **offline-first as a product promise**

Lorevox 7 should preserve the strongest parts of the existing doctrine:

- Archive → History → Memoir must remain distinct
- human edits remain sacred
- approximate dates remain approximate
- AI suggestions must not silently become facts
- the person and family remain the authors and curators of meaning

---

## 2. Core Product Statement

**Lorevox 7 is a local-first memory archive studio where Lori interviews gently, extracts structured history in the background, and helps shape that history into memoir, family tree, timeline, and obituary outputs without taking authorship away from the person or family.**

This is the product sentence that should guide planning, implementation, UI review, prompt design, and future repo decisions.

---

## 3. What Lorevox 7 Is Really Optimizing For

Lorevox 7 is not optimizing for task completion speed. It is optimizing for:

1. **Emotional safety** during life review
2. **Narrative quality** rather than fact-only collection
3. **Low cognitive load** for older adults and families
4. **Archival trustworthiness** and provenance
5. **Human editorial control** over every meaningful output
6. **Long-term durability** of the memory archive

The system should feel less like software that asks questions and more like a calm witness that helps a life become shape, record, and story.

---

## 4. Foundational Doctrine That Must Survive the Move to v7

These principles should remain non-negotiable.

### 4.1 Archive, History, Memoir are different layers

Lorevox is not a chatbot that accumulates fuzzy memory summaries. It is a historical archive system.

- **Archive** = transcripts, audio, photos, scans, documents, source material
- **History** = extracted claims, reviewed facts, relationships, events, timeline structure
- **Memoir** = generated narrative drafts shaped from history

These layers must never be collapsed into one another.

### 4.2 The human remains the authority

The person’s own words, documents, corrections, and judgments outrank AI summaries.

### 4.3 Human edits are sacred

If the user edits a memoir paragraph, obituary passage, family note, or event wording, that edit must be protected from silent overwrite.

### 4.4 Approximate memory must stay approximate

Lorevox must not fabricate precision. “Around 1975” stays approximate. “Before Amelia was born” remains relational if that is what the source supports.

### 4.5 Suggestions enter review before they become truth

AI extraction may propose claims, links, interpretations, or narrative assembly. It should not promote those automatically to accepted fact.

### 4.6 Technical scaffolding stays hidden

The user should not feel like they are using a database front end, a websocket app, or a prompt lab. They should feel like Lori is helping them remember.

---

## 5. Synthesis of the Current Direction

The move-to-v7 plan, the v6.4 redesign thinking, and the memoir research now converge on the same direction:

### Keep

- Lori as the persistent visible anchor
- conversational ingestion as the primary mode
- structured extraction behind the scenes
- timeline, family tree, and memoir as live views
- offline-first installation and local privacy
- affect-aware tone modulation and safety softening

### Change / strengthen

- replace “chat app with features” framing with **memory studio** framing
- replace loose free chat with **guided narrative scaffolding under the hood**
- add a stronger **review / provenance layer** between extraction and polished output
- distinguish **memoir mode** from **obituary mode** as separate writing systems
- design explicitly around **fatigue, silence, and re-entry**, not just question flow
- keep forms available only as support tools, not as the main experience

---

## 6. The Proper Lorevox 7 Experience Model

The correct mental model is:

> **A memory conversation in the foreground, with a living archive quietly assembling in the background.**

This should influence every design choice.

### The user should feel

- welcomed, not processed
- guided, not interrogated
- supported, not rushed
- respected, not optimized
- able to pause, drift, return, and revise

### The UI should communicate

- Lori is present
- the story is building
- nothing is “wrong” if incomplete
- memory can be partial
- the archive is trustworthy
- the family can later refine what was captured

---

## 7. Recommended Information Architecture for v7

Lorevox 7 should be organized into four visible layers and one invisible layer.

### 7.1 Visible Layer A — Lori

Persistent conversational presence.

Responsibilities:

- greet
- listen
- ask gentle follow-ups
- detect topic shifts
- suggest breaks
- help resume naturally
- guide family tree and memoir work when appropriate

Design requirements:

- always visible on desktop
- collapsible but never absent
- docked drawer behavior on small screens
- strong voice / mic affordances
- active listening feedback without feeling clinical

### 7.2 Visible Layer B — Living Archive Tabs

These are not “screens the user fills out.” They are views of what Lori has learned.

Recommended tabs:

- **Profile**
- **Family**
- **Timeline**
- **Memoir**
- **Obituary**
- **Review**

Notes:

- **Profile** should show what is known, what is tentative, and what Lori may ask later
- **Family** should present relationship structure without genealogy jargon
- **Timeline** should show life events as verified or pending pieces of life history
- **Memoir** should become a collaborative writing surface
- **Obituary** should be a separate output mode with its own tone and structure
- **Review** should surface uncertainty, provenance, and approval decisions

### 7.3 Visible Layer C — Contextual Helpers

These appear only when useful.

Examples:

- historical event triggers
- family prompts
- memory anchors
- “Lori can ask about this later” hints
- provenance badges
- soft warnings before regeneration may overwrite hand edits

### 7.4 Visible Layer D — Deep Editing Surfaces

These should open only when invited.

Examples:

- person detail panel
- event detail side sheet
- relationship editor
- memoir paragraph provenance panel
- obituary tone editor
- fact conflict reviewer

### 7.5 Invisible Layer — Archive / History Pipeline

This is the real engine.

Responsibilities:

- capture raw session material
- extract claims
- queue review items
- promote accepted facts
- build timeline events
- store relationship graphs
- generate narrative drafts
- preserve provenance and traceability
- feed UI state without exposing system complexity

---

## 8. The Interview System Must Evolve

Lorevox 7 should not rely on unstructured conversation alone, and it should not return to rigid multi-section interviewing.

The correct model is:

> **natural conversation on the surface, structured memoir interviewing underneath**

### 8.1 New interview spine: guided life review

Lori should be powered by a hidden interview engine that understands:

- life chapters
- scene capture
- turning points
- family structure
- place-based memory
- historical anchors
- legacy themes
- emotional pacing

### 8.2 Recommended interview phases

#### Phase A — Orientation

Establish time, place, people, and cultural context.

Capture gently:

- name / preferred name
- date of birth or approximate birth period
- birthplace / where they grew up
- household / parents / caretakers
- languages / places / cultural frame

#### Phase B — Life chapters

Help the person identify major eras.

Examples:

- early home life
- school years
- first work / independence
- love / marriage / partnerships
- parenting / caregiving
- loss / illness / disruption
- later years / reflection / legacy

These should be hidden planning structures, not visible sections or progress bars.

#### Phase C — Scene capture

Within each era, Lori should seek vivid moments.

Useful scene types:

- high point
- low point
- turning point
- ordinary routine that reveals character
- person who changed everything
- place they still remember clearly
- moment they were proud
- moment they failed or changed

#### Phase D — Thematic deepening

Once enough material exists, Lori should recognize themes.

Examples:

- belonging
- duty
- migration
- resilience
- humor
- class mobility
- faith
- grief
- estrangement
- caretaking
- reinvention

#### Phase E — Legacy mode

Only after trust and material exist.

Examples:

- what mattered most
- what they want remembered
- lessons learned
- what should never be included
- what kind of obituary voice feels true
- how they want family to understand their life

---

## 9. Preventing User Fatigue Must Be a Product Principle

Interview fatigue is not a small UX issue. It is one of the major failure modes for memoir systems.

Lorevox 7 should be intentionally designed to reduce cognitive and emotional overload.

### 9.1 Session design rules

- sessions should start small
- completion should feel possible quickly
- stopping early should feel valid
- Lori should end well before exhaustion when signs of fatigue appear
- the closing moment should feel complete, not abruptly cut off

### 9.2 Think-time UX

Lorevox should respect silence.

That means:

- brief pauses should not be treated as failure
- reflective states should shorten Lori’s next question, not lengthen it
- silence can be held without pressure
- Lori should be allowed to say less when the moment calls for it

### 9.3 Intelligent skip logic

If the system already knows something confidently, it should not ask for it again except for review or clarification.

### 9.4 Gentle re-entry

A future session should not resume with procedural language like “Section 3, question 8.”

Better:

- “Last time you mentioned your mother’s kitchen. Want to pick up there?”
- “We talked about moving to New Mexico. Should we stay there or go elsewhere today?”

### 9.5 Empty states should teach and invite

Empty profile, family, timeline, memoir, or obituary views should never feel broken.

Every empty state should:

- explain what this surface becomes
- remind the user that Lori will help fill it in
- give a simple next action
- reduce fear of incompleteness

---

## 10. Memoir and Obituary Are Separate Systems

Lorevox should explicitly support both, but not treat them as the same writing task.

### 10.1 Memoir mode

Goal:

- lived texture
- growth and change
- contradiction and complexity
- meaning discovered through memory

Characteristics:

- chapter-based
- scene-rich
- theme-aware
- comfortable with vulnerability
- assembled from reviewed history, not raw chat summary alone

Stylistic guidance:

- stay close to facts
- avoid over-polishing away the person
- let events carry meaning
- use adjectives and adverbs sparingly

### 10.2 Obituary mode

Goal:

- vivid compressed portrait of a life
- personality, not just achievements
- tone matched to the family and person

Characteristics:

- shorter and more selective
- more immediately biographical
- must include practical / family details when desired
- must be culturally flexible

Recommended obituary variants:

- classic / formal obituary
- warm family-centered obituary
- personality-forward obituary
- brief death notice
- feature-style obituary / life portrait

### 10.3 Why this matters

If Lorevox uses one generic narrative engine for both, both outputs will be weaker.

Memoir wants depth and progression. Obituary wants essence and compression.

---

## 11. Family Tree Should Be a Relational Memory Surface, Not Just a Genealogy Tree

Lorevox’s family view should help people talk about families as lived systems, not just legal pedigrees.

### 11.1 Product stance

The family tree is not only for names and dates. It is also for:

- closeness
- estrangement
- caregiving importance
- blended families
- adopted / chosen family
- multiple marriages or partnerships
- long partnerships preceding legal marriage

### 11.2 UI guidance

Support multiple visual views over time:

- **lineage view** — traditional tree when helpful
- **blended family view** — better for complex households
- **relationship map view** — for narrative relevance rather than strict hierarchy

### 11.3 Interaction patterns

- expand / collapse branches
- zoom and pan
- hover details
- click to open person card
- “Tell Lori about this person” entry points from any node

### 11.4 Data model requirements

Relationships should eventually support:

- relation type
- source session
- confidence / review status
- birth / death year if known
- notes
- chosen / foster / step / adoptive distinctions
- together since vs legally married since where applicable
- narrative significance annotations

---

## 12. Provenance Must Become Visible in v7

Lorevox already has the right doctrine for trust. v7 should make that doctrine visible in the interface.

Full standards-based content credentials can come later. The immediate goal is provenance UX.

### 12.1 Minimum provenance states

Every meaningful output block should eventually be markable as:

- **Captured from interview**
- **Imported from source material**
- **Built from structured facts**
- **Drafted by Lori**
- **Edited by hand**
- **Reviewed / approved**
- **Conflicted / needs review**

### 12.2 Recommended progressive disclosure

#### Level 1 — subtle visible signal

A small badge or icon on card / paragraph / event / person record.

#### Level 2 — short hover or tap explanation

Examples:

- “Captured from interview on Mar 12”
- “Drafted by Lori from 3 reviewed facts”
- “Edited by Chris”

#### Level 3 — provenance panel

Show:

- source session
- linked facts or events
- last editor
- draft / review history
- overwrite warning if regeneration is about to replace human edits

### 12.3 Sacred edit guard

Any hand-edited material should trigger a warning before regeneration or replacement.

---

## 13. Review Must Become a First-Class Layer

This is one of the most important structural additions.

Lorevox should not move directly from extraction into polished outputs without a visible trust layer.

### 13.1 What Review is for

- uncertain dates
- contradictory claims
- inferred links
- duplicate people
- relationship ambiguity
- sensitive segment handling
- approval of AI suggestions
- choosing between alternate formulations

### 13.2 Review is not admin clutter

Review should feel like careful curation, not like a bug queue.

### 13.3 Review outputs

- accepted fact
- rejected suggestion
- edited and approved fact
- merge people records
- keep both conflicting claims with note
- mark private / archive only / exclude from memoir / exclude from obituary

---

## 14. Recommended UX Patterns to Carry Forward or Add

### 14.1 Keep

- floating Lori presence
- calm archival aesthetic
- local-first privacy posture
- hidden system complexity
- affect-aware tone changes
- strong empty state design
- literary treatment for narrative surfaces

### 14.2 Add

- session re-entry cues
- waveform / listening reassurance during voice capture
- chapter cards that grow from real conversation
- inline ghost text only in writing surfaces, never during primary interview
- `@` context mention system for memoir drafting later
- drag-and-drop chapter and memory cluster ordering in a later phase
- provenance microbadges across content surfaces

### 14.3 Keep forms, but demote them

Structured forms should still exist as:

- fallback for users who need structure
- caregiver / family entry helpers
- hard-fact insertion tools
- recovery paths when conversation stalls

But they should not define the main Lorevox experience.

---

## 15. Technical Planning Implications

The planning direction has several concrete technical consequences.

### 15.1 Profile JSON should not become the only truth store

Live profile JSON is useful for fast UI updates, but it should not replace the archive / claims / facts / events model.

Recommended stance:

- use profile JSON for convenience and display
- preserve archive material immutably
- store extracted claims separately
- review claims into facts
- derive timeline events from reviewed facts
- generate memoir / obituary from reviewed history, not raw merged chat alone

### 15.2 Extraction pipeline should mature beyond “merge facts into profile”

Near term:

- conversational extraction after turns
- populate visible tabs fast

Longer term:

- claim records
- review queue
- accepted fact records
- event builders
- relationship entity storage
- provenance-linked narrative generation

### 15.3 Memoir generation should be event / fact aware

Memoir paragraphs should eventually be traceable to reviewed facts and timeline events.

### 15.4 Family tree mode needs dedicated extraction

Do not rely only on general profile extraction. Relatives and relationship building need a specialized extraction path.

### 15.5 Affect should modulate pace, not theatrics

The emotion stack is most valuable when it adjusts timing, gentleness, and topic pressure, rather than trying to look emotionally magical.

### 15.6 Offline-first remains essential

Lorevox 7 should keep pushing toward:

- no runtime CDN dependencies
- vendored model assets
- local fonts / local bundles
- local model loading
- stable first-run caching and no repeated downloads
- no telemetry and no cloud dependency

---

## 16. Recommended Lorevox 7 Build Phases

### Phase 1 — Shell and simplification

Goal: make Lori clearly primary.

Deliverables:

- floating Lori shell
- simplified layout
- tabs reframed as live archive views
- cleaner empty states
- reduced visible interview machinery

### Phase 2 — Guided narrative engine

Goal: improve interview quality and memoir capture.

Deliverables:

- hidden chapter-aware interviewing
- scene capture prompts
- historical anchors
- fatigue-aware pacing
- re-entry logic
- family-tree conversational mode

### Phase 3 — Review and provenance foundation

Goal: make the archive trustworthy.

Deliverables:

- claim vs fact distinction in implementation
- visible review queue concepts
- provenance states in UI
- sacred edit protections
- conflict surfacing

### Phase 4 — Writing studio

Goal: turn archive into authored output.

Deliverables:

- memoir drafting surface
- obituary drafting surface
- tone and structure controls
- paragraph provenance panels
- inline revision helpers

### Phase 5 — Advanced visual studio

Goal: make curation tactile and spatial.

Deliverables:

- improved family map views
- chapter / memory cluster rearrangement
- drag-and-drop narrative assembly
- deeper timeline interactions
- media-aware scrapbook style surfaces

---

## 17. Strongest Planning Recommendations

These are the most important conclusions from this synthesis.

### 17.1 Make guided life chapters and scene capture the hidden interview engine

This will improve output quality more than almost any purely visual change.

### 17.2 Add Review as a first-class visible product layer

Without Review, Lorevox risks becoming impressive but less trustworthy.

### 17.3 Restore Obituary as a first-class output surface

Memoir and obituary solve different family needs and should not be collapsed.

### 17.4 Turn provenance into a user-facing trust feature

Even before standards-based credentials, Lorevox should show where content came from.

### 17.5 Design for fatigue, silence, and incomplete memory

Lorevox will be better than competitors if it is gentler, slower, and more emotionally intelligent.

### 17.6 Protect the archive doctrine from convenience shortcuts

Do not let fast profile merging flatten the long-term truth model.

---

## 18. What Should Be True of Lorevox 7 When This Phase Is Successful

When Lorevox 7 is working correctly, a user should be able to sit down and feel:

- Lori is here with me
- I do not need to manage the system
- I can just talk
- my story is becoming shape without being forced
- my family can see what is being built
- the system does not pretend certainty where there is none
- edits and corrections are respected
- nothing important is being silently rewritten
- the memoir is mine, not the machine’s

And the repo / architecture should reflect:

- one dominant conversational path
- a growing archive model behind it
- clear separation between source, interpretation, and narrative
- infrastructure for review and provenance
- offline-first implementation discipline
- room to grow into a true memory studio without betraying the doctrine

---

## 19. Final Position

Lorevox 7 should be understood as a **conversation-first, archive-first memory studio**.

Lori’s job is not merely to chat. Her job is to gently guide life review, capture scene-rich memory, build a traceable historical record, and help shape that record into memoir, family tree, timeline, and obituary outputs without erasing human authorship.

That is the clearest synthesis of the current v7 direction, the redesign work, the memoir UI research, and the archive architecture.

---

## 20. Suggested Follow-On Docs

After this synthesis, the next high-value repo-ready planning documents would be:

1. `LOREVOX_7_INFORMATION_ARCHITECTURE.md`
2. `LOREVOX_7_INTERVIEW_ENGINE.md`
3. `LOREVOX_7_REVIEW_AND_PROVENANCE.md`
4. `LOREVOX_7_MEMOIR_AND_OBITUARY_MODES.md`
5. `LOREVOX_7_BUILD_PHASES_CHECKLIST.md`

