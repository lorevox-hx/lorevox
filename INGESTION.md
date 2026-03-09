# Lorevox — Ingestion Pipeline Specification

---

## Philosophy and Memory Safety

Lorevox is built around three layers:

- **Archive** — immutable source material, exactly as received, never edited
- **History** — reviewed, human-approved facts and events extracted from the archive
- **Memoir** — AI-generated narrative built from History, always traceable back to Archive

Every ingestion decision must preserve this separation. No extracted text ever becomes a fact automatically. No AI suggestion bypasses human review. No source file is ever modified.

### Memory Safety Rules

1. **Raw in, clean out.** Source files enter the Archive exactly as received — no renaming, no reformatting, no modification of any kind.
2. **No silent promotion.** A claim (extracted text, AI interpretation) only becomes a fact when a human explicitly approves it.
3. **Approximate dates stay approximate.** If a source says "sometime in the late sixties," the record stores `approx_year: 1965–1969`. We never invent precision.
4. **Provenance is permanent.** Every fact in History links to the source claim, which links to the source asset, which links to the original file.
5. **Conflicts surface, never merge.** When two sources say different things, both are preserved and flagged for human resolution — never auto-merged.
6. **Extraction is optional.** An asset can remain permanently in the Archive as an approved source without any facts ever being extracted from it.
7. **AI suggestions are proposals.** LLM-extracted entities and relationships go into the Review Queue as claims, not into the History layer directly.
8. **The queue is honest.** If something is uncertain or unreviewed, it shows as uncertain or unreviewed — never silently discarded, never silently promoted.

---

## Ingestion Goals

The ingestion pipeline converts raw incoming material into Archive-layer assets with accurate metadata, clean provenance records, and a populated Review Queue. It does not touch the History layer. It does not create facts.

**What ingestion produces:**

- A fingerprinted, immutable source file in the correct archive folder
- A `meta.json` sidecar with all available metadata
- A `links.json` sidecar recording relationships to people, sessions, and other assets
- For text-bearing assets: a text extraction in the correct lane with review state set
- For AI-extracted entities: claims in the Review Queue, not facts

---

## Intake Lanes

Six processing lanes handle all asset types. Lane assignment happens at ingest time and is permanent.

| Lane | Asset types | Processing |
|------|------------|------------|
| `audio_transcript` | Voice recordings, interviews, phone calls | Faster-Whisper STT → transcript → STT review queue |
| `video_transcript` | Videos, home movies, recorded calls | Audio track → STT + keyframe OCR → transcript + frame analysis |
| `typed_ocr` | Scanned typed documents, letters, forms | Tesseract OCR → text extraction → auto-reviewable |
| `handwriting_review` | Handwritten letters, diaries, notes | HTR (Tesseract/Kraken) → mandatory human review |
| `photo_metadata` | Photographs (digital or scanned prints) | ExifTool extraction → metadata review; no OCR unless explicitly tagged |
| `born_digital_doc` | PDFs, Word docs, emails, web exports | Native text extraction → entity detection → Review Queue |

---

## Folder Structure

```
DATA_DIR/
├── inbox/                          # Staging only — nothing lives here permanently
│   └── [uploaded files land here, processed within minutes]
│
└── memory/
    └── archive/
        └── people/
            └── <person_id>/        # e.g., person_001
                ├── assets/
                │   ├── documents/  # typed_ocr, born_digital_doc
                │   ├── audio/      # audio_transcript
                │   ├── video/      # video_transcript
                │   ├── photos/     # photo_metadata
                │   └── handwriting/ # handwriting_review
                │
                ├── derived/        # Generated files — do not edit directly
                │   ├── transcripts/
                │   ├── keyframes/  # Extracted video frames for OCR review
                │   └── calendar/   # Generated timeline views
                │
                └── review/
                    └── queue/      # Pending claims awaiting human decision
```

**Notes:**
- `inbox/` is a transit zone. Files should clear it within a processing session.
- `derived/` is write-once from the pipeline. Human edits go into the History layer, not here.
- `calendar/` and keyframes are generated — editing the source asset regenerates them.

---

## Asset Identity and Fingerprinting

Every asset gets a stable identity at ingest time.

```
sha256: <hash of file bytes at ingestion>        # Deduplication key
asset_id: doc_0042                               # Stable short ID (doc_, img_, med_)
ingested_at: 2024-11-15T14:22:00Z               # Ingestion timestamp (UTC)
ingested_by: system | <user_id>                  # Who or what ran the ingest
```

**Deduplication:** If SHA256 matches an existing asset, the ingest is rejected with a duplicate notice. The user can choose to link to the existing asset instead.

**Asset ID series:**
- `doc_####` — documents (typed, handwritten, born-digital)
- `img_####` — images and photographs
- `med_####` — audio and video

---

## Sidecar Files

Every asset has two sidecar files stored alongside it.

### `meta.json`

Canonical metadata for the asset. Schema varies by lane — see `schemas/ingestion_sidecar_examples.json` for complete examples per asset type.

All `meta.json` files share a common header:

```json
{
  "schema_version": "1.0",
  "asset_id": "img_0031",
  "sha256": "a1b2c3...",
  "lane": "photo_metadata",
  "original_filename": "christmas_1971.jpg",
  "ingested_at": "2024-11-15T14:22:00Z",
  "ingested_by": "system",
  "review_state": "unreviewed",
  "processing_state": "pending"
}
```

### `links.json`

Records all known relationships for this asset at ingest time. Updated as review decisions are made.

```json
{
  "asset_id": "img_0031",
  "person_links": [
    {
      "person_id": "person_001",
      "confidence": "definite",
      "link_status": "confirmed",
      "source": "user_stated"
    }
  ],
  "session_links": [
    {
      "session_id": "session_004",
      "role": "reference_material"
    }
  ],
  "related_assets": [
    {
      "asset_id": "doc_0015",
      "relationship": "correspondence_thread"
    }
  ]
}
```

---

## Review States

Every asset has a `review_state` that reflects its position in the human review workflow.

| State | Meaning |
|-------|---------|
| `unreviewed` | Asset received; no human has looked at it |
| `review_required` | Pipeline flagged this for mandatory review (e.g., handwriting, uncertain OCR) |
| `in_review` | A reviewer has opened this asset |
| `approved_source_only` | Human confirmed this is a genuine source; no text extraction requested |
| `approved_text` | Extracted text reviewed and accepted |
| `approved_metadata` | Metadata (dates, people, places) reviewed and accepted |
| `approved_for_extraction` | Text and metadata approved; AI claim extraction is authorized |
| `partially_approved` | Some sections approved, others pending or rejected |
| `rejected_extraction` | Text or metadata rejected; asset stays in archive but extraction blocked |
| `rejected_asset` | Asset rejected entirely (duplicate, irrelevant, or corrupt) |

---

## Processing States

Separate from review state — tracks pipeline execution, not human decisions.

| State | Meaning |
|-------|---------|
| `pending` | Queued, not yet started |
| `processing` | Currently running |
| `ocr_complete` | Text extraction done, awaiting review |
| `stt_complete` | Speech-to-text done, awaiting review |
| `metadata_extracted` | Exif/header metadata extracted |
| `claims_queued` | AI entity extraction complete; claims in Review Queue |
| `complete` | All pipeline steps done |
| `failed` | Pipeline error; details in processing log |
| `quarantined` | File flagged as potentially corrupt, malicious, or unreadable |

---

## Promotion Levels

Text and metadata move through five promotion levels. Moving up requires an explicit human decision.

```
Level 1 — Archived Source
  File stored, fingerprinted, sidecar written. No human review yet.

Level 2 — Approved Text
  Human has reviewed the raw extraction and confirmed it is accurate.

Level 3 — Approved Metadata
  Human has reviewed and confirmed dates, people, places, and context.

Level 4 — Extraction Ready
  Human has authorized AI entity and claim extraction from this asset.

Level 5 — Historical Promotion
  One or more specific claims from this asset have been approved as facts
  and added to the History layer.
```

Promotion is per-asset and per-claim. An asset at Level 4 may have only three of its ten extracted claims promoted to Level 5.

---

## Lane-Specific Rules

### Audio Transcript

- STT engine: Faster-Whisper (CUDA fp16, large-v3 model)
- `initial_prompt` seeded with all known names from the person's people registry to improve proper noun accuracy
- After transcription: all detected proper nouns highlighted for inline review before saving
- Speaker diarization stored as `speaker_A`, `speaker_B` etc. — human assigns names during review
- Transcript stored in `derived/transcripts/` with segment timestamps
- Original audio file is never modified

### Video Transcript

- Audio track processed identically to `audio_transcript` lane
- Keyframe sampling at regular intervals (default: 1 per 30 seconds) stored in `derived/keyframes/`
- OCR targets in keyframes: title cards, name lower-thirds, on-screen captions, date stamps
- Frame OCR text stored separately from audio transcript — not merged
- QuickTime/MP4 container metadata extracted (creation date, camera model, GPS if present)

### Typed OCR

- Tesseract with language detection
- Confidence score per word stored; words below threshold flagged for review
- Multi-page documents produce one transcript with page break markers
- Auto-reviewable (does not require mandatory human review before claim extraction can be authorized)

### Handwriting Review

- HTR (Tesseract or Kraken depending on script)
- **Always `review_required`** — handwriting extraction never auto-promoted
- Uncertain words marked as `[word?]` in the transcript
- Review UI shows original image beside extracted text, side by side
- Reviewer can correct inline; corrections stored as a separate edit layer, not overwriting the HTR output

### Photo Metadata

- ExifTool extracts: camera make/model, capture datetime, GPS coordinates, lens info, XMP tags, embedded caption
- GPS reverse-geocoded to human-readable location label (stored alongside raw coordinates)
- `user_stated_date`: separate from EXIF — stores what the subject said about when the photo was taken
  ```json
  "user_stated_date": {
    "value": "Christmas 1971",
    "confidence": "approximate",
    "note": "Subject said 'I think this was Christmas 1971'"
  }
  ```
- No OCR applied to photos unless asset is explicitly tagged `contains_embedded_text`
- People in photos identified via `person_links` in `links.json`, not embedded in `meta.json`

### Born-Digital Documents

- Native text extraction (no OCR needed for machine-created PDFs and Word docs)
- Emails treated as a sub-type: email headers (`From`, `To`, `Date`, `Subject`, `Cc`) extracted as structured metadata separate from body text
  ```json
  "email_headers": {
    "from": "margaret.brennan@example.com",
    "to": ["tom.brennan@example.com"],
    "date": "1998-12-24T19:43:00-05:00",
    "subject": "Christmas plans"
  }
  ```
- Email attachments ingested as separate assets in the appropriate lane — not embedded in the email asset record
- Candidate correspondents from email headers added to `links.json` with `link_status: candidate` pending human confirmation

---

## Date Precision

Dates are never invented. Store what is known.

| Precision value | Example stored |
|----------------|----------------|
| `exact_day` | `1971-12-25` |
| `month` | `1971-12` |
| `year` | `1971` |
| `approx_year` | `~1971` |
| `decade` | `1970s` |
| `season` | `summer 1971` |
| `range` | `1969–1973` |
| `relative` | `two years after they married` |
| `unknown_ordered` | known to be after event X, before event Y |
| `unknown` | no date information available |

---

## Person and Session Linking

Assets are linked to people and interview sessions at ingest time when the link is unambiguous, and during review for everything else.

**Person link confidence values:**
- `definite` — user explicitly identified this person
- `probable` — name or face match with high confidence
- `possible` — weak signal, requires confirmation
- `unknown` — no identification yet

**Person link status values:**
- `confirmed` — human reviewed and accepted
- `candidate` — pipeline suggestion, pending review
- `rejected` — human reviewed and rejected the link

---

## Claim Extraction Gate

AI entity and claim extraction only runs when a human has explicitly set `review_state: approved_for_extraction`. This is never set automatically.

**What extraction produces:**
- Named entities (people, places, organizations, dates)
- Candidate facts (statements of what happened, when, to whom)
- Candidate relationships (person A married person B, person A worked at X)

All outputs go into the Review Queue as claims with:
- `confidence` score
- `source_asset_id` and `source_text_span`
- `claim_type`
- `review_state: pending`

None of this touches the History layer until a human approves individual claims.

---

## Quarantine and Rejection

**Quarantine** (`processing_state: quarantined`):
- File is unreadable, corrupt, or zero bytes
- File type does not match declared extension
- File contains executable content or unexpected embedded scripts
- Held for human inspection before any further processing

**Rejected extraction** (`review_state: rejected_extraction`):
- Human reviewed the text/metadata and determined it is not usable (illegible, wrong person, irrelevant)
- Asset remains in Archive permanently
- No claims extracted; no promotion possible

**Rejected asset** (`review_state: rejected_asset`):
- Human determined this asset should not be in the archive at all
- Asset record and sidecars retained for audit trail
- File moved to `archive/rejected/` — never deleted

---

## Review Queue

The Review Queue is the interface between pipeline output and human judgment.

Each queue item contains:
- `queue_id` — unique identifier
- `asset_id` — source asset
- `claim_type` — what kind of claim this is
- `claim_text` — the extracted text
- `source_span` — character range in the source transcript
- `confidence` — pipeline confidence score
- `review_state` — pending / approved / rejected / deferred
- `reviewer_id` — who reviewed it (null if pending)
- `reviewed_at` — timestamp of decision

**Review decisions:**
- `approved` — claim becomes a fact candidate in History
- `rejected` — claim discarded, not extracted
- `needs_correction` — claim text edited by reviewer, then approved
- `deferred` — moved to later; stays in queue

---

## Search Indexing

Assets become searchable after `review_state` reaches `approved_text` or higher.

Indexed fields:
- Full transcript text (audio, video, typed, handwriting)
- Document body (born-digital)
- `meta.json` fields: filename, description, user_stated_date note, caption
- Person and session names from `links.json`

Not indexed until approved:
- Raw HTR output below confidence threshold
- Pending claims in the Review Queue

---

## Schema Reference

Concrete `meta.json` and `links.json` examples for all asset types are in:

```
schemas/ingestion_sidecar_examples.json
```

That file contains complete, realistic example payloads for:
- Common meta header (all lanes)
- Common links structure (all lanes)
- `typed_ocr` asset
- `handwriting_review` asset
- `photo_metadata` asset with full EXIF
- `photo_metadata` asset with no EXIF and `user_stated_date`
- `audio_transcript` asset
- `video_transcript` asset with frame analysis
- `born_digital_doc` asset
- `email` asset with structured headers
- Review state reference array
- Processing state reference array
- Person link status values
- Review decision types
- Review queue item example

---

## Implementation Phases

### Phase 1 — Foundation (Build First)

- Inbox watcher: detect new files, assign `asset_id`, compute SHA256, write skeleton `meta.json`
- Lane router: classify asset type and assign lane
- ExifTool integration: extract photo and video container metadata
- Basic Review Queue: store claims, display pending items, accept approve/reject decisions

### Phase 2 — Text Extraction

- Faster-Whisper STT pipeline for audio and video
- Tesseract OCR pipeline for typed documents
- HTR pipeline for handwriting (mandatory review gate enforced)
- Native text extraction for PDFs and Word documents
- Email header parser: structured extraction of From/To/Date/Subject/Cc

### Phase 3 — AI Extraction (Only After Phase 2 Is Stable)

- Named entity recognition on approved transcripts
- Candidate fact and relationship extraction
- Era-aware world events context injection
- LLM follow-up quality prompts seeded with known names from people registry

---

## End-to-End Example: Scanned Letter

**Source:** A scanned JPEG of a handwritten letter from 1943.

1. File dropped in `inbox/`.
2. Pipeline computes SHA256, assigns `img_0044`, writes skeleton `meta.json` with `lane: handwriting_review`, `review_state: review_required`, `processing_state: pending`.
3. HTR runs. Transcript saved to `derived/transcripts/img_0044_htr.txt` with uncertain words marked `[word?]`. Processing state → `ocr_complete`.
4. Review UI presents: original scan on left, HTR transcript on right. Reviewer corrects three words, confirms the rest.
5. Reviewer sets `review_state: approved_text`. Reviewer adds `user_stated_date: "Christmas 1943"` based on subject's recollection.
6. Reviewer links to `person_001` (the letter's author) in `links.json` with `confidence: definite`, `link_status: confirmed`.
7. Reviewer sets `review_state: approved_metadata`. Processing state → `complete`.
8. Reviewer sets `review_state: approved_for_extraction`. AI extraction runs; three claims queued.
9. Reviewer approves two claims (date, location mentioned). One claim (uncertain name) deferred.
10. Two approved claims → History layer as facts, each linking back to `img_0044`.

The original scan has never been modified. Every decision is recorded with who made it and when.
