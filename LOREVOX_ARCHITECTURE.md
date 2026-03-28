# Lorevox — Architecture & Roadmap

Synthesized from persona sessions, repo analysis (Google Always-On Memory Agent,
OpenWebUI, paperless-ngx, paperless-gpt), and design discussions.

---

## Core Philosophy

Lorevox is not an AI chatbot with memory. It is a **personal historical archive system**
that happens to use AI for interviews, extraction, and memoir generation.

The distinction matters because it determines where truth lives:

```
AI chatbot:   conversation → embeddings → vector search → answer
Lorevox:      person → sessions → facts → events → calendar → memoir
```

The three layers that must never be collapsed into each other:

```
ARCHIVE  →  HISTORY  →  MEMOIR
```

| Layer | What it is | Can it be changed? |
|-------|-----------|-------------------|
| Archive | Original source material — transcripts, audio, scans, photos | Never. Immutable. |
| History | Structured interpretation — facts, entities, events, calendar | Yes, with audit trail |
| Memoir | Readable narrative generated from history | Yes, it's a draft |

The Google "Always-On Memory Agent" fails for archival purposes because it allows the
consolidation agent to rewrite its own memory summaries over time. Lorevox avoids this
by keeping the archive immutable and running all AI activity in the History layer,
where every change is traceable and reversible.

---

## The Memory Safety Rules

These rules prevent the archive from becoming unreliable over time:

1. **Never overwrite a source transcript or original document.**
2. **Every fact must link to a specific source session and transcript span.**
3. **No compound timeline event may be created from multiple facts unless the source
   explicitly links them.** Two events sharing the same year are not the same event.
4. **Distinguish claims from facts.** A claim is what someone said. A fact is a claim
   that has been reviewed and accepted.
5. **Approximate dates must stay approximate.** Never invent precision. "Around 1975"
   is a valid date. "1975-06-01" invented from it is a fabrication.
6. **AI suggestions enter the Review Queue. They do not become facts automatically.**
7. **Memory consolidation may suggest links but may not silently rewrite verified facts.**
8. **Every narrative paragraph must be traceable to timeline events and source facts.**

---

## Folder Structure

```
DATA_DIR/
  inbox/                        ← intake staging area (not yet processed)
    audio/
    scans/
    handwriting/
    photos/
    docs/
    imports/

  memory/
    archive/
      people/
        <person_id>/
          profile/
            person.json           ← name, DOB, pronouns, gender, languages, etc.
            aliases.json          ← nicknames, maiden names, legal name changes
          sessions/
            <session_id>/
              meta.json           ← date, interviewer, device, model version
              transcript.jsonl    ← speaker turns with timestamps
              transcript.txt      ← plain text version
              source/
                audio_original.*  ← raw mic recording (never deleted)
                images/           ← any images shared during session
                docs/             ← docs referenced during session
          documents/              ← scanned letters, typed notes, PDFs
            <doc_id>/
              original.*          ← immutable original file
              meta.json           ← source type, OCR status, document date, tags
              ocr_text.txt        ← extracted text (if any)
              ocr_confidence.json ← per-region confidence scores
          photos/                 ← digital photos
            <photo_id>/
              original.*          ← original file, never modified
              meta.json           ← EXIF/XMP metadata, GPS, detected people
              caption.txt         ← handwritten or typed caption if present
          extracted/
            claims.jsonl          ← raw extracted claims before review
            facts.jsonl           ← reviewed/accepted facts
            entities.jsonl        ← people, places, orgs, events
            relationships.jsonl   ← entity-to-entity links
          review/
            queue.jsonl           ← pending AI suggestions
            decisions.jsonl       ← human approve/edit/reject log
            conflicts.jsonl       ← flagged contradictions between sessions
          timeline/
            events.jsonl          ← verified timeline events
            life_phases.jsonl     ← era blocks (childhood, career, etc.)
            event_fact_links.jsonl
          calendar/
            derived/              ← generated from timeline, not editable directly
              year_index.json
              decade_index.json
              eras.json
          narrative/
            chapter_01.md
            chapter_02.md
            chapter_drafts/
```

---

## Data Models

### Fact Record

Each fact is one atomic claim. Never compound two facts into one.

```json
{
  "fact_id": "f_000123",
  "person_id": "sandra_kim",
  "session_id": "session_03",
  "source_span": {
    "turn_index": 42,
    "char_start": 120,
    "char_end": 198
  },
  "fact_type": "employment_change",
  "statement": "Sandra left corporate marketing to open a restaurant with James.",
  "date_text": "around 2005",
  "date_normalized": "2005",
  "date_precision": "approx_year",
  "confidence": 0.88,
  "status": "reviewed",
  "inferred": false,
  "created_by": "extraction_agent",
  "reviewed_by": "human",
  "reviewed_at": "2026-03-08T14:22:00Z"
}
```

### Claim Record (pre-review)

```json
{
  "claim_id": "c_000456",
  "person_id": "tom_brennan",
  "session_id": "session_01",
  "source_span": {"turn_index": 17, "char_start": 44, "char_end": 112},
  "statement": "Tom's father James died in 2019.",
  "confidence": 0.94,
  "status": "pending_review",
  "inferred": false
}
```

### Soft Relationship Between Facts (never auto-merge)

```json
{
  "link_id": "l_0001",
  "from_fact": "f_000101",
  "to_fact": "f_000102",
  "relationship": "same_year",
  "confidence": 0.41,
  "inferred": true,
  "needs_review": true,
  "note": "Both events dated 1989 — possible connection not confirmed by source"
}
```

### Timeline Event

```json
{
  "event_id": "ev_0003",
  "person_id": "trish_obrien_walsh",
  "title": "Partnership with Carol Walsh begins",
  "event_type": "relationship_start",
  "start_date": "2003",
  "end_date": null,
  "date_precision": "year",
  "display_date": "2003",
  "is_approximate": false,
  "confidence": 0.97,
  "status": "reviewed",
  "source_fact_ids": ["f_000318"],
  "tags": ["relationships", "LGBTQ+"]
}
```

```json
{
  "event_id": "ev_0004",
  "person_id": "trish_obrien_walsh",
  "title": "Legal marriage to Carol Walsh",
  "event_type": "marriage",
  "start_date": "2015-08",
  "end_date": null,
  "date_precision": "month",
  "display_date": "August 2015",
  "together_since": "2003",
  "legal_marriage_date": "2015-08",
  "note": "Partnership pre-dates legal marriage by 12 years (pre-Obergefell)",
  "source_fact_ids": ["f_000319", "f_000320"]
}
```

Note: `together_since` and `legal_marriage_date` are stored separately. This is required
to correctly represent same-sex couples who were partnered before marriage equality.

### Date Precision Values

```
exact_day        → 1991-04-13
month            → August 2015
year             → 1989
approx_year      → around 1975
decade           → early 1980s
season           → summer 1978
school_year      → fall 1981 – spring 1982
range            → 1991–2008
relative         → "before Amelia was born"
unknown_ordered  → before event X, after event Y
unknown          → no date information
```

Never invent precision. Always store what the source actually supports.

---

## Intake Pipeline

Four separate intake lanes reflecting the real nature of family history material:

### Lane 1 — Audio/Video Interviews
```
mic recording → STT (faster-whisper) → transcript.jsonl
                                      → transcript.txt
                                      → audio_original preserved
```

### Lane 2 — Typed / Printed Documents (OCR)
Good candidates: typed letters, printed notes, legal documents, old certificates.

```
scan/PDF → OCRmyPDF + Tesseract → ocr_text.txt
                                → ocr_confidence.json
                                → status: "review_required" until human confirms
```

**Warning:** OCR on faded or mixed documents produces errors. All OCR output enters
the Review Queue as claims, not as facts. A human must confirm before any extracted
date or name becomes a timeline fact.

### Lane 3 — Handwritten Notes (HTR)
Handwriting recognition is unreliable with standard OCR engines. These require
a separate treatment.

```
photo/scan → AI handwriting attempt (best-effort)
           → status: "handwriting_review" (mandatory human review)
           → original image preserved in full
           → AI output stored as candidate, never as fact
```

Use an LLM vision model (or dedicated HTR service) for the attempt, but always flag
handwritten content as requiring human verification before it enters the fact layer.

### Lane 4 — Digital Photos (Metadata)
Modern digital photos are rich in structured data that can become timeline anchors.

```
photo → ExifTool extraction:
          DateTimeOriginal       → candidate event date
          GPS lat/lon            → candidate location
          Make/Model             → useful for dating old prints
          XMP/IPTC tags          → any existing labels
       → AI: detected people    → candidate person_ids
       → AI: scene description  → candidate caption
       → status: "candidate_anchor" (pending timeline placement)
```

Example photo meta record:
```json
{
  "asset_id": "img_0042",
  "person_ids": ["chris_horne"],
  "source_type": "digital_photo",
  "original_file": "photos/img_0042/original.jpg",
  "exif_datetime_original": "2025-07-14T13:22:10",
  "exif_make": "Apple",
  "exif_model": "iPhone 15 Pro",
  "gps": {"lat": 43.295, "lon": -0.368},
  "location_label": "Pau, France",
  "timeline_status": "candidate_anchor",
  "tags": ["France trip", "Bastille Day 2025"],
  "reviewed": false
}
```

GPS coordinates from ExifTool can be reverse-geocoded to city/country labels and
placed on the life calendar as verified anchor points — one of the highest-confidence
date sources in a family archive.

---

## Database Tables

```sql
-- Core entities
people              (person_id, full_name, preferred_name, pronouns, gender_identity,
                     dob, dob_precision, pob, languages, immigration_status, created_at)
person_aliases      (alias_id, person_id, alias, alias_type, valid_from, valid_to)

-- Sessions
sessions            (session_id, person_id, session_date, interviewer, location,
                     recording_device, transcription_model, status)
transcript_turns    (turn_id, session_id, speaker, turn_index, text, start_ms, end_ms)

-- Memory layers
claims              (claim_id, person_id, session_id, turn_index, char_start, char_end,
                     statement, confidence, status, created_at)
facts               (fact_id, person_id, fact_type, statement, date_text, date_normalized,
                     date_precision, confidence, status, inferred, reviewed_by, reviewed_at)
fact_sources        (source_id, fact_id, session_id, turn_index, char_start, char_end)
fact_links          (link_id, from_fact_id, to_fact_id, relationship, confidence,
                     inferred, needs_review, note)

-- Entities and relationships
entities            (entity_id, person_id, entity_type, canonical_name, first_mentioned)
entity_aliases      (alias_id, entity_id, alias)
relationships       (rel_id, from_entity_id, to_entity_id, relationship_type,
                     start_date, end_date, confidence, source_fact_ids)

-- Relationships (human)
person_relationships (rel_id, person_a_id, person_b_id, relationship_type,
                      together_since, legal_date, end_date, end_reason,
                      note, source_fact_ids)
                      -- relationship_type: married, partnered, civil_union,
                      --   domestic_partnership, commitment_ceremony, divorced, widowed

-- Timeline and calendar
events              (event_id, person_id, title, event_type, start_date, end_date,
                     date_precision, display_date, is_approximate, confidence,
                     status, notes, tags, created_at, updated_at)
event_fact_links    (link_id, event_id, fact_id, role)
event_entities      (link_id, event_id, entity_id, role)
life_phases         (phase_id, person_id, label, start_date, end_date,
                     date_precision, description)

-- Documents and photos
documents           (doc_id, person_id, source_type, document_kind, original_file,
                     ocr_text, ocr_status, ocr_engine, document_date,
                     date_precision, tags, reviewed, created_at)
document_fact_links (link_id, doc_id, fact_id)
photos              (photo_id, person_id, original_file, exif_datetime, gps_lat,
                     gps_lon, location_label, timeline_status, tags, reviewed)

-- Review system
review_queue        (item_id, item_type, item_id_ref, suggestion, confidence,
                     source, created_at, status)
review_decisions    (decision_id, item_id, action, edited_value, decided_by,
                     decided_at, note)
audit_log           (log_id, table_name, record_id, field_name, old_value, new_value,
                     changed_by, changed_at, change_source)

-- Narrative
chapter_drafts      (draft_id, person_id, chapter_num, title, body_md,
                     life_phase_id, status, created_at, updated_at)
chapter_sources     (link_id, draft_id, event_id, fact_id, note)
```

---

## Processing Pipeline (AI Agents)

```
Intake (audio/scan/photo/doc)
    ↓
Transcription / OCR / Metadata Extraction
    ↓
Claim Extraction Agent
  → extracts atomic claims with source spans
  → assigns confidence scores
  → flags uncertain dates
    ↓
Review Queue
  → human approves, edits, or rejects
  → approved claims become facts
    ↓
Entity Resolution Agent
  → links "Bill" to "William Arsene LaPlante"
  → merges entity aliases
  → proposes (not applies) relationship links
    ↓
Timeline Builder
  → creates events from single facts or explicitly linked fact groups
  → never auto-merges facts sharing only a year
  → preserves date uncertainty
    ↓
Calendar Projection
  → derived view from timeline events
  → not editable directly
    ↓
Memory Consolidation (safe version)
  → reads all facts for a person
  → suggests: possible connections, gaps, contradictions
  → output goes to Review Queue, not directly to facts
  → runs nightly or on demand
    ↓
Narrative Generation Agent
  → generates chapter drafts from verified events and facts
  → every paragraph cites source events
  → draft stored in chapter_drafts, not auto-published
```

The key difference from Google's Always-On Memory Agent: **consolidation output goes to
the Review Queue, not directly into the fact store.** The agent suggests; the human decides.

---

## UI Layout

Three-panel workspace inspired by OpenWebUI + paperless-ngx, oriented around the person.

```
┌─────────────────────────────────────────────────────────────────┐
│  LOREVOX                          [Person: Sandra Kim ▾]        │
├───────────┬────────────────────────────┬────────────────────────┤
│           │                            │                        │
│  SIDEBAR  │   CENTER PANEL             │   TIMELINE / CALENDAR  │
│           │                            │                        │
│  People   │   [Interview / Transcript  │   Timeline             │
│  Sessions │    Document viewer         │   1948 — Parents born  │
│  Archive  │    Photo viewer            │   1976 — Sandra born   │
│  Timeline │    Chapter editor]         │   1994 — UC Berkeley   │
│  Calendar │                            │   ~2005 — Restaurant   │
│  Chapters │                            │   2015 — Board role    │
│  Review ⚠ │                            │                        │
│  Inbox    │                            │   Calendar View        │
│  Settings │                            │   [Month / Year / Era] │
│           │                            │                        │
└───────────┴────────────────────────────┴────────────────────────┘
```

### Sidebar tabs
- **People** — all subjects in the archive
- **Sessions** — interview sessions per person
- **Archive** — documents, photos, scans per person
- **Timeline** — chronological events
- **Calendar** — visual life calendar (year / decade / era views)
- **Chapters** — memoir draft workspace
- **Review ⚠** — pending AI suggestions needing human decision
- **Inbox** — unprocessed intake files (audio, scans, photos)
- **Settings**

### Center panel modes
- **Interview mode** — live chat with transcript, detected entities shown below
- **Transcript mode** — read session with facts highlighted inline
- **Document mode** — PDF/scan viewer + OCR text side by side
- **Photo mode** — image + extracted EXIF metadata + suggested timeline placement
- **Chapter mode** — memoir draft editor with source citations in margin

### Right panel (Timeline / Calendar)
Always visible. Shows temporal context for whatever is open in the center panel.
When a new claim is detected, suggests timeline placement:

```
Possible event detected
"Sandra left corporate to open restaurant"
Suggested: ~2005
Confidence: Medium
[ Add to timeline ]  [ Review first ]  [ Dismiss ]
```

### Review Queue
Every AI suggestion appears here before becoming a fact:

```
⚠ 3 items pending review

[ ] Extracted fact: "Marcus served two tours in Iraq"
    Source: session_02, turn 44
    Confidence: 0.91
    [Approve]  [Edit]  [Reject]

[ ] Suggested entity merge: "Bill" = "William LaPlante"?
    Evidence: same session, similar context
    Confidence: 0.52
    [Approve merge]  [Keep separate]  [Ask subject]

[ ] Date conflict: "moved 1989" vs "moved 1991"
    Session 1 says 1989, Session 3 says 1991
    [Mark 1989 correct]  [Mark 1991 correct]  [Flag as uncertain]
```

---

## Feature Map

### Build Now (foundation — must be stable before anything else)

| Feature | Inspired by | Why |
|---------|-------------|-----|
| Person-first archive folder structure | Lorevox core | Foundation |
| Immutable session transcripts | Archival best practice | Source of truth |
| Atomic fact extraction | Google memory agent (improved) | Backbone of history layer |
| Claim → Review → Fact workflow | paperless-gpt | Prevents AI hallucination |
| Timeline events with date precision | Lorevox core | Accurate biography |
| Life calendar as timeline projection | Lorevox design | Temporal scaffolding |
| Interview agent (current) | Lorevox core | Primary input |
| Audio intake + STT | Lorevox core | Already built |
| Age-aware interview routing | Persona simulations | Interview quality |
| Identity / religion / immigration sections | Identity document | Inclusivity |

### Build Next (once core is stable)

| Feature | Inspired by | Why |
|---------|-------------|-----|
| Document inbox (scan/PDF intake) | paperless-ngx | Family docs are goldmine |
| Photo intake + EXIF extraction | ExifTool | GPS dates are high-confidence anchors |
| OCR lane for typed documents | paperless-ngx | Typed notes → searchable text |
| Handwriting lane (with mandatory review) | HTR best practice | Old family notes |
| Review queue UI | paperless-gpt | Human oversight for all AI |
| Entity graph (people, places, orgs) | All three repos | Relationship mapping |
| Narrative chapter generation | Lorevox goal | Primary deliverable |
| Export to family document (PDF/Word) | User need | What families actually want |
| Memory consolidation (safe, suggestion-only) | Google memory agent | Nightly review suggestions |
| Voice-native family entry | Interview UX | Remove form interruptions |
| Post-STT name correction | STT accuracy | Polish, Korean, Arabic names |
| Highlight / bookmark answers | Interview UX | Surface best content |

### Build Later (after archive is growing)

| Feature | Inspired by | Why |
|---------|-------------|-----|
| Visual timeline explorer | OpenWebUI tools | Navigation at scale |
| Photo timeline (images on timeline) | Paperless + timeline | Visual biography |
| Memory graph visualization | Graph databases | Entity relationship view |
| Multi-person family archive | Lorevox goal | Cross-generational linking |
| Historical context enrichment | World events | "You were 21 on 9/11" |
| AI interview planning (gap detection) | Calendar + facts | "No events 1994–2001" |
| Cross-session contradiction detection | Memory safety | Automatic conflict flagging |
| Collaborative review (family members) | OpenWebUI permissions | Multi-contributor |

### Do Not Build (patterns that undermine archive integrity)

| Pattern | Why avoid |
|---------|-----------|
| Mutable memory summaries (Google agent default) | Rewrites history silently |
| Auto-merge facts into compound events | Manufactures biography |
| Vector-only memory store | Loses provenance and structure |
| OCR output as trusted fact | OCR errors become permanent lies |
| AI-generated timeline without human review | Facts need source backing |
| Document-centric architecture | Lorevox is person-centric |

---

## What Lorevox Is (and Isn't)

```
IS:
  A person-first historical archive system
  An AI-assisted oral history interview platform
  A structured life memory engine with provenance tracking
  A memoir generation system grounded in verified facts

IS NOT:
  An AI chatbot with memory
  A generic document management system
  A vector search engine over conversation history
  A system that rewrites its own memory over time
```

The closest comparable systems are professional oral history platforms and digital
heritage archives used by universities and museums — except Lorevox runs locally,
costs nothing to operate, and is designed for individuals and families rather than
institutions.

---

## Next Milestone Targets

### Milestone 1 — Core Memory Engine
- [ ] Interview plan with age-aware routing
- [ ] Identity / faith / immigration sections
- [ ] Voice-native family entry (LLM parses spoken family info)
- [ ] Post-STT name correction UI
- [ ] Highlight/bookmark answers
- [ ] Facts table with source spans
- [ ] Review queue for AI suggestions

### Milestone 2 — Intake Pipeline
- [ ] Inbox folder watcher
- [ ] Audio intake (existing STT, formalized)
- [ ] PDF/scan OCR lane (typed documents)
- [ ] Handwriting lane (image → LLM vision → review)
- [ ] Photo EXIF extraction (ExifTool)
- [ ] Photo GPS → location label
- [ ] Document and photo browser in UI

### Milestone 3 — Timeline & Calendar
- [ ] Timeline events table with date precision
- [ ] Life phases
- [ ] Calendar projection views (year / decade / era)
- [ ] Timeline panel in UI (always-visible right panel)
- [ ] Era-aware interview gap prompting

### Milestone 4 — Narrative & Export
- [ ] Entity extraction and relationship mapping
- [ ] Chapter draft generation from verified events
- [ ] Export to PDF (family document)
- [ ] Export to Word (editable memoir)
- [ ] Source citation in all narrative output
