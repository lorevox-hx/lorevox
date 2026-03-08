# Lorevox Ingestion

This document defines how **Lorevox** ingests source material into the archive.

Lorevox must handle many source types:

- interview audio
- video
- typed notes
- scanned PDFs
- handwritten notes
- digital photos
- born-digital documents
- letters, records, and family-history materials

The ingestion system exists to ensure that all incoming material is:

1. preserved in original form
2. classified correctly
3. processed with the right extraction pipeline
4. stored with provenance
5. reviewed before historical facts are promoted

Lorevox is **person-first** and **timeline-first**, not document-first.
The archive is organized around people and sessions, while documents and media are attached as source materials.

---

# Core Principles

## 1. Original source is immutable
The original uploaded file is never modified or overwritten.

## 2. Derived text is not truth
OCR, transcription, captioning, and AI extraction produce **candidate text** and **candidate facts**, not verified truth.

## 3. Every ingested item gets a sidecar record
Each asset receives a machine-readable metadata file describing:

- source type
- processing status
- review status
- provenance
- linked people
- linked sessions
- linked events

## 4. Ingestion pipeline depends on source type
Lorevox should not process all files the same way.

Different pipelines are required for:

- typed OCR
- handwriting review
- photo metadata extraction
- audio transcription
- video transcription
- born-digital document parsing

## 5. Review is mandatory for uncertain extraction
Especially for:

- handwriting
- low-quality scans
- mixed-layout documents
- old photocopies
- ambiguous names/dates
- family-history notes with corrections or margin notes

---

# Ingestion Flow

The general ingestion flow is:

```text
inbox
  ↓
fingerprint + classify
  ↓
copy original to immutable store
  ↓
run pipeline by source_type
  ↓
create sidecar metadata
  ↓
generate derived outputs
  ↓
assign review state
  ↓
link to people / sessions / events
  ↓
promote approved outputs to archive indices
```

---

# Ingestion Lanes

Lorevox currently defines these primary ingestion lanes:

## 1. typed_ocr

For:
- scanned typed notes
- old typewritten family history
- printed letters
- clean PDFs
- forms
- newspaper clippings
- legible machine-printed records

Processing:
- OCR or PDF text extraction
- page image generation if needed
- text cleanup
- candidate metadata extraction
- candidate entity extraction

## 2. handwriting_review

For:
- handwritten notes
- cursive letters
- photo backs with writing
- margin notes
- partially handwritten forms
- notebooks
- index cards

Processing:
- preserve image/PDF
- attempt handwriting extraction if available
- segment page/regions if needed
- create low-confidence text candidate
- force review queue

## 3. photo_metadata

For:
- digital photos
- scanned photos
- screenshots
- images shared from phone/computer
- photos with embedded EXIF/XMP/QuickTime metadata

Processing:
- extract metadata
- create thumbnail/preview
- detect timestamp and GPS if present
- detect file creation context
- allow optional captioning / face tagging / person linking

## 4. audio_transcript

For:
- interview recordings
- voice memos
- oral history clips

Processing:
- audio normalization if needed
- speech-to-text
- diarization if available
- transcript.jsonl generation
- transcript.txt generation
- candidate topic/entity extraction

## 5. video_transcript

For:
- interview videos
- family-history video clips
- smartphone video

Processing:
- extract media metadata
- extract audio track
- speech-to-text
- optional frame sampling
- optional OCR from visible text frames (names on screen, captions, title cards)
- candidate topic/entity extraction

## 6. born_digital_doc

For:
- DOCX
- TXT
- Markdown
- HTML
- email exports (.eml, .mbox)
- JSON or structured files
- digitally created PDFs

Processing:
- text extraction
- metadata extraction
- normalization into document text layer
- candidate tagging

**Email exports require separate header extraction.**
Email headers (`From`, `To`, `Date`, `Subject`, `Cc`) are structured metadata — not body text —
and are often the most reliable date and correspondent source in old family correspondence.
They must be extracted into their own fields, not collapsed into the body text layer.

Example email asset schema:

```json
{
  "asset_id": "doc_0088",
  "asset_type": "document",
  "source_type": "born_digital_doc",
  "document_kind": "email",
  "email_headers": {
    "from": "Janice Horne <janice.horne@example.com>",
    "to": ["Chris Horne <dev@lorevox.com>"],
    "cc": [],
    "subject": "Dad's papers from the storage unit",
    "date": "2019-11-04T09:22:00-07:00",
    "message_id": "<abc123@mail.example.com>"
  },
  "email_body": {
    "text_path": "derived/extracted.txt",
    "has_attachments": true,
    "attachments": [
      {
        "filename": "dad_discharge_1953.pdf",
        "mime_type": "application/pdf",
        "size": 204800,
        "ingested_as": "doc_0089"
      }
    ]
  },
  "candidate_correspondents": [
    {"name": "Janice Horne", "person_id": "janice_horne", "role": "sender"},
    {"name": "Chris Horne", "person_id": "chris_horne", "role": "recipient"}
  ],
  "timeline": {
    "candidate_anchor": true,
    "candidate_date": "2019-11-04",
    "date_source": "email_header_date"
  }
}
```

Email attachments should be ingested as separate assets in their appropriate lane
(e.g., a PDF attachment goes through `typed_ocr`, not `born_digital_doc`) and linked
back to the parent email via `related_asset_ids` in `links.json`.

---

# Folder Structure

Lorevox uses an inbox for raw intake and a person-first archive for durable storage.

## Top-level structure

```
DATA_DIR/
  inbox/
    typed_ocr/
    handwriting_review/
    photo_metadata/
    audio_transcript/
    video_transcript/
    born_digital_doc/
    rejected/
    quarantine/

  ingest/
    jobs/
    logs/
    staging/
    cache/
    fingerprints/

  memory/
    archive/
      people/
        <person_id>/
          profile/
            person.json
            aliases.json

          sessions/
            <session_id>/
              meta.json
              transcript.jsonl
              transcript.txt
              source/
                audio_original.ext
                video_original.ext
                images/
                docs/

          documents/
            <doc_id>/
              original/
                source.ext
              derived/
                extracted.txt
                ocr.json
                preview.jpg
                pages/
              meta.json
              links.json

          photos/
            <asset_id>/
              original/
                image.ext
              derived/
                exif.json
                preview.jpg
                caption.txt
                faces.json
              meta.json
              links.json

          media/
            <asset_id>/
              original/
                source.ext
              derived/
                transcript.txt
                transcript.jsonl
                waveform.json
                preview.jpg
                keyframes/
              meta.json
              links.json

          extracted/
            claims.jsonl
            entities.jsonl
            relationships.jsonl
            candidate_events.jsonl

          review/
            queue.jsonl
            approvals.jsonl
            rejections.jsonl
            edits.jsonl
            conflict_flags.jsonl

          timeline/
            events.jsonl
            event_links.jsonl

          calendar/
            projections.json
            life_phases.json

          narrative/
            chapter_01.md
            chapter_02.md
```

---

# Ingestion Job Model

Every ingestion action should create a job record.

## Job states

```
queued
processing
completed
failed
needs_review
rejected
```

## Example job record

```json
{
  "job_id": "job_20260308_0001",
  "created_at": "2026-03-08T09:15:00-07:00",
  "source_path": "DATA_DIR/inbox/typed_ocr/family_notes_box1_001.pdf",
  "source_type": "typed_ocr",
  "pipeline": "ocr_pdf_v1",
  "status": "completed",
  "person_ids": ["janice_horne", "kent_horne"],
  "session_id": null,
  "outputs": [
    "memory/archive/people/janice_horne/documents/doc_0001/derived/extracted.txt",
    "memory/archive/people/janice_horne/documents/doc_0001/meta.json"
  ],
  "review_state": "review_required"
}
```

---

# Asset Identity and Fingerprinting

Every ingested item should receive a stable asset ID and a content fingerprint.

## Goals
- prevent duplicate imports
- preserve provenance
- allow re-processing without replacing original
- detect same file in multiple lanes

## Suggested identifiers
- `doc_####` for documents
- `img_####` for photos
- `med_####` for audio/video media
- `job_########` for ingest jobs

## Fingerprint fields
- sha256
- file size
- original filename
- import timestamp
- mime type

## Example

```json
{
  "asset_id": "doc_0001",
  "sha256": "abc123...",
  "file_size": 483221,
  "mime_type": "application/pdf",
  "original_filename": "family_notes_box1_001.pdf",
  "imported_at": "2026-03-08T09:15:00-07:00"
}
```

---

# Sidecar Metadata Schema

Each ingested asset gets a `meta.json`.
This is the canonical metadata record for the source item.

## Common fields

```json
{
  "asset_id": "doc_0001",
  "asset_type": "document",
  "source_type": "typed_ocr",
  "document_kind": "family_history_notes",
  "title": "Family history notes, box 1, item 1",
  "description": "Scanned typed family history notes.",
  "person_ids": ["janice_horne", "kent_horne"],
  "session_id": null,
  "event_ids": [],
  "tags": ["family history", "typed notes"],
  "status": "active",
  "review_state": "review_required",
  "processing_state": "completed",
  "confidence": 0.82,
  "language": "en",
  "created_at": "2026-03-08T09:15:00-07:00",
  "updated_at": "2026-03-08T09:18:40-07:00",
  "source_file": {
    "original_filename": "family_notes_box1_001.pdf",
    "stored_path": "memory/archive/people/janice_horne/documents/doc_0001/original/source.pdf",
    "sha256": "abc123...",
    "mime_type": "application/pdf",
    "file_size": 483221
  },
  "provenance": {
    "import_method": "manual_upload",
    "imported_by": "user",
    "capture_device": null,
    "capture_date": null
  },
  "processing": {
    "pipeline": "ocr_pdf_v1",
    "engine": "ocr_engine_name",
    "engine_version": "1.0.0"
  }
}
```

---

# Links Sidecar Schema

Each asset may also have a `links.json` that records its archive relationships.

## Purpose
- attach source to people
- attach source to sessions
- attach source to events
- attach source to claims/facts

## Example

```json
{
  "asset_id": "doc_0001",
  "person_ids": ["janice_horne", "kent_horne"],
  "session_ids": [],
  "event_ids": [],
  "claim_ids": [],
  "fact_ids": [],
  "chapter_ids": [],
  "related_asset_ids": []
}
```

---

# Source-Type Specific Schemas

## Typed OCR document

```json
{
  "asset_id": "doc_0001",
  "asset_type": "document",
  "source_type": "typed_ocr",
  "document_kind": "family_history_notes",
  "page_count": 6,
  "ocr": {
    "status": "completed",
    "review_required": true,
    "avg_confidence": 0.86,
    "has_embedded_text": false,
    "text_path": "derived/extracted.txt",
    "ocr_json_path": "derived/ocr.json"
  },
  "layout": {
    "multi_column": false,
    "contains_tables": false,
    "contains_handwriting": false
  }
}
```

## Handwriting review document

```json
{
  "asset_id": "doc_0042",
  "asset_type": "document",
  "source_type": "handwriting_review",
  "document_kind": "handwritten_notes",
  "page_count": 3,
  "ocr": {
    "status": "attempted",
    "review_required": true,
    "avg_confidence": 0.34,
    "text_path": "derived/extracted.txt",
    "ocr_json_path": "derived/ocr.json"
  },
  "handwriting": {
    "present": true,
    "style": "cursive",
    "legibility": "low",
    "mixed_print_and_script": true
  }
}
```

## Photo metadata asset

```json
{
  "asset_id": "img_0010",
  "asset_type": "photo",
  "source_type": "photo_metadata",
  "document_kind": "family_photo",
  "photo": {
    "datetime_original": "2025-07-14T13:22:10+02:00",
    "file_created_at": "2025-07-14T13:22:11+02:00",
    "gps": {
      "lat": 43.295,
      "lon": -0.368
    },
    "location_label": "Pau, France",
    "camera_make": "Apple",
    "camera_model": "iPhone 15 Pro",
    "orientation": 1
  },
  "timeline": {
    "candidate_anchor": true,
    "candidate_date": "2025-07-14",
    "candidate_location": "Pau, France",
    "date_source": "exif_datetime_original"
  },
  "user_stated_date": {
    "value": null,
    "confidence": null,
    "note": null
  }
}
```

## Video transcript asset

```json
{
  "asset_id": "med_0012",
  "asset_type": "media",
  "source_type": "video_transcript",
  "document_kind": "interview_video",
  "media": {
    "duration_seconds": 2847,
    "width": 1920,
    "height": 1080,
    "frame_rate": 29.97,
    "audio_channels": 2,
    "sample_rate": 48000,
    "codec_video": "h264",
    "codec_audio": "aac"
  },
  "quicktime_metadata": {
    "creation_date": "2026-01-15T14:32:00-07:00",
    "location": {
      "lat": 35.687,
      "lon": -105.937
    },
    "location_label": "Santa Fe, New Mexico",
    "make": "Apple",
    "model": "iPhone 15 Pro"
  },
  "transcription": {
    "status": "completed",
    "review_required": false,
    "language": "en",
    "diarization": true,
    "engine": "faster-whisper",
    "model": "large-v3",
    "transcript_txt_path": "derived/transcript.txt",
    "transcript_jsonl_path": "derived/transcript.jsonl"
  },
  "frame_analysis": {
    "status": "completed",
    "sampled_frames": 48,
    "sample_interval_seconds": 60,
    "ocr_applied": true,
    "ocr_targets": ["title_cards", "name_lower_thirds", "on_screen_captions", "visible_documents"],
    "keyframes_path": "derived/keyframes/",
    "text_found": [
      {
        "frame_index": 3,
        "timecode": "00:03:12",
        "text": "Kent Horne — Santa Fe, 2026",
        "confidence": 0.91,
        "region": "lower_third"
      }
    ]
  },
  "timeline": {
    "candidate_anchor": true,
    "candidate_date": "2026-01-15",
    "candidate_location": "Santa Fe, New Mexico",
    "date_source": "quicktime_creation_date"
  }
}
```

**Note on video frame OCR:** Title cards, name lower-thirds (the text overlays that identify
speakers), date/location captions, and any visible documents or certificates in frame can all
be extracted as text. These often contain names and dates that are more reliable than speech
alone — a title card saying "Kent Horne, 1962–2026" is a high-confidence biographical fact.
Frame samples should be stored in `keyframes/` and their OCR output linked back to the video
asset, not silently merged into the transcript.

---

## Audio transcript asset

```json
{
  "asset_id": "med_0007",
  "asset_type": "media",
  "source_type": "audio_transcript",
  "document_kind": "interview_audio",
  "media": {
    "duration_seconds": 3724,
    "audio_channels": 1,
    "sample_rate": 44100
  },
  "transcription": {
    "status": "completed",
    "review_required": false,
    "language": "en",
    "diarization": true,
    "engine": "faster-whisper",
    "model": "large-v3",
    "transcript_txt_path": "derived/transcript.txt",
    "transcript_jsonl_path": "derived/transcript.jsonl"
  }
}
```

---

# Derived Output Files

Derived outputs must never replace originals.

## Document-derived outputs

```
derived/
  extracted.txt
  ocr.json
  preview.jpg
  pages/
    page_0001.jpg
    page_0002.jpg
```

## Photo-derived outputs

```
derived/
  exif.json
  preview.jpg
  caption.txt
  faces.json
```

## Media-derived outputs

```
derived/
  transcript.txt
  transcript.jsonl
  waveform.json
  keyframes/
    frame_0001.jpg
    frame_0002.jpg
```

---

# Review States

Every ingested asset should have a `review_state`.

## Allowed review states

**`unreviewed`**
Imported but not yet examined by a human.

**`review_required`**
Needs human review before extracted content can be trusted.

**`in_review`**
Currently being reviewed or edited.

**`approved_source_only`**
Original source approved for archive, but extracted text/facts not yet approved.

**`approved_text`**
Derived text has been reviewed and accepted.

**`approved_metadata`**
Metadata (dates, persons, tags) has been reviewed and accepted.

**`approved_for_extraction`**
Source is approved for claim/fact extraction.

**`partially_approved`**
Some parts approved, others still uncertain.

**`rejected_extraction`**
Extraction output is not trustworthy. Source is preserved but not promoted.

**`rejected_asset`**
Asset should not be used in Lorevox history flow.

## Recommended defaults by lane

| Lane | Default review_state |
|------|---------------------|
| typed_ocr | review_required |
| handwriting_review | review_required |
| photo_metadata | unreviewed |
| audio_transcript | approved_source_only |
| video_transcript | approved_source_only |
| born_digital_doc | review_required |

---

# Processing States

Assets also track `processing_state` (system workflow, not human trust).

```
queued
classified
copied
processed
failed
partial
archived
```

---

# Review Outcomes

Review should create explicit decision records, not silent edits.

## Review decision types

- approve
- approve_with_edit
- reject
- split_asset
- merge_duplicate
- relink_person
- relink_session
- relink_event
- mark_uncertain
- promote_to_claims
- hold_for_later

## Example review record

```json
{
  "review_id": "rev_0009",
  "asset_id": "doc_0001",
  "reviewed_at": "2026-03-08T10:22:00-07:00",
  "reviewed_by": "user",
  "decision": "approve_with_edit",
  "notes": "Corrected OCR reading of 'LaPlante'. Kept date uncertain.",
  "changes": [
    {
      "field": "title",
      "old": "Family history nofes",
      "new": "Family history notes"
    }
  ],
  "resulting_review_state": "approved_text"
}
```

---

# Promotion Rules

An asset moves through trust levels. Higher levels unlock downstream processing.

| Level | Name | Unlocks |
|-------|------|---------|
| 1 | Archived source | File preserved and linked to person |
| 2 | Approved text | Derived text usable for search and summarization |
| 3 | Approved metadata | Dates, persons, tags confirmed |
| 4 | Extraction-ready | Claim/entity/event generation allowed |
| 5 | Historical promotion | Approved claims can enter timeline review |

---

# OCR and Text Rules

## Typed OCR
Use OCR output as candidate text. Allowed uses after review:
- search
- summarization
- entity extraction
- claim extraction

## Handwriting
Handwriting extraction defaults to low trust.

Rules:
- never auto-promote handwriting OCR directly to facts
- keep original image visible beside extracted text during review
- require explicit review before claim extraction
- preserve uncertain words and unreadable segments with markup

Example uncertain text markup:
```
"We moved to [Santa Fe?] around [1974?] after the winter."
```

---

# Photo Metadata Rules

Photos can provide valuable timeline anchors, but metadata is not always reliable.

## Accept metadata as candidate evidence, not absolute truth

A photo timestamp may reflect:
- real capture time ← preferred
- copied file time
- edited image export time
- wrong camera clock

## Track date sources separately

There are up to four independent date signals for a photo — never collapse them into one.

```json
{
  "datetime_original": "2025-07-14T13:22:10",
  "file_created_at": "2025-07-14T13:22:11",
  "imported_at": "2026-03-08T09:00:00",
  "user_stated_date": {
    "value": null,
    "confidence": null,
    "note": null
  },
  "candidate_event_date": "2025-07-14",
  "date_source": "exif_datetime_original"
}
```

**`user_stated_date`** is populated when a person looks at an old photo and says something like
"I think this was Christmas 1971" or "that must be before we moved." This is a distinct evidence
source from EXIF and carries its own confidence level — typically lower than a camera timestamp
but higher than an AI guess. Store the verbatim note alongside the parsed date so the reasoning
is preserved.

Example of a user-stated date on an old scanned print (no EXIF):

```json
{
  "datetime_original": null,
  "file_created_at": "2026-02-14T10:33:00",
  "imported_at": "2026-02-14T10:33:05",
  "user_stated_date": {
    "value": "1971-12",
    "confidence": 0.55,
    "note": "Chris said: 'I think this was Christmas 1971, based on the tree in the background'"
  },
  "candidate_event_date": "1971-12",
  "date_source": "user_stated"
}
```

## GPS rules
- GPS is useful but optional
- Missing GPS does not weaken a photo as a source
- GPS should be stored separately from narrative assumptions
- Reverse-geocode GPS to city/country label when available

---

# Session Linking

Some ingested items belong to an interview session; others are stand-alone.

**Session-linked examples:**
- interview audio
- documents discussed during an interview
- photos attached to a recorded session

**Stand-alone examples:**
- scanned box of old family notes
- old typed memoir drafts
- digital family photo upload

Assets can be linked to a person before being linked to a session.
Person linkage is required; session linkage is optional.

---

# Person Linking

Lorevox is person-first. Every asset should try to link to one or more people.

## Linking states

| State | Meaning |
|-------|---------|
| identified | Person confirmed by user |
| candidate | AI or user suggests this person, not confirmed |
| unknown | No person identified |
| multiple_possible | Could be any of several people |

## Example — typed note about two people

```json
{
  "person_links": [
    {"person_id": "janice_horne", "status": "identified"},
    {"person_id": "kent_horne", "status": "identified"}
  ]
}
```

## Example — unlabeled old photo

```json
{
  "person_links": [
    {"person_id": "janice_horne", "status": "candidate"},
    {"person_id": "kent_horne", "status": "candidate"}
  ]
}
```

---

# Claim Extraction Gate

Lorevox should not extract claims from every asset automatically.

## Minimum conditions for claim extraction
- original file archived
- sidecar metadata created
- review state is at least `approved_text` or `approved_source_only`
- person link exists (or is intentionally `unknown`)
- extraction pipeline available for source type

## Claim extraction blocked when
- OCR confidence is critically low
- handwriting is unreadable and unreviewed
- duplicate asset not resolved
- person linkage is too uncertain
- file is in quarantine or rejected state

---

# Quarantine and Rejected Items

## Quarantine
Use for:
- corrupt files
- unsupported file types
- password-protected files
- files with unreadable structure

## Rejected
Use for:
- accidental uploads
- unrelated files
- confirmed duplicates the user does not want
- test files

```
DATA_DIR/inbox/quarantine/
DATA_DIR/inbox/rejected/
```

---

# Search Indexing Rules

Search should be built across multiple layers:
- source metadata
- approved extracted text
- captions
- transcripts
- tags
- person links
- event links

Search must clearly distinguish which layer produced each result:
- original source hit
- OCR text hit
- transcript hit
- AI-generated summary hit

Lorevox should never hide which layer a search result came from.

---

# Minimal Review UI Requirements

Any Lorevox review screen for ingestion should show:
- source preview (image, audio player, PDF viewer)
- original filename
- source type
- linked person(s)
- extracted text (alongside original where possible)
- confidence scores
- metadata fields
- review decision buttons

## Recommended actions
- Approve source
- Approve text
- Edit metadata
- Correct person links
- Send to extraction
- Reject
- Hold
- Mark uncertain

---

# Implementation Order

## Phase 1 — Foundation
- inbox lanes (folder structure)
- asset fingerprinting (sha256 + asset_id)
- sidecar `meta.json`
- sidecar `links.json`
- `typed_ocr` pipeline
- `audio_transcript` pipeline (already partially built)
- manual review state transitions

## Phase 2 — Expanded Intake
- `handwriting_review` lane
- `photo_metadata` extraction (ExifTool)
- GPS reverse-geocoding
- thumbnail/preview generation
- person linking UI
- session linking UI

## Phase 3 — Intelligence Layer
- automatic duplicate detection (sha256 fingerprints)
- event candidate generation from approved assets
- review queue dashboard
- bulk metadata edits
- claim extraction promotion workflow

---

# End-to-End Examples

## Typed family-history PDF

```
1. User scans typed family history notes to PDF
2. PDF goes into inbox/typed_ocr/
3. Lorevox fingerprints file (sha256)
4. Lorevox copies original → documents/doc_0001/original/source.pdf
5. OCR runs → derived/extracted.txt (avg_confidence: 0.86)
6. Lorevox creates meta.json and links.json
7. review_state = "review_required"
8. User reviews, corrects OCR errors ("LaPlante" not "LaPlants")
9. review_state = "approved_text"
10. Claim extraction is allowed
11. Claims enter review queue
12. Approved claims become facts / timeline events
```

## Handwritten note (photographed)

```
1. User photographs handwritten note on phone
2. Image goes into inbox/handwriting_review/
3. Lorevox archives original image → documents/doc_0042/original/image.jpg
4. Handwriting extraction attempted → avg_confidence: 0.34
5. Uncertain words marked: "We moved to [Santa Fe?] around [1974?]"
6. review_state = "review_required"
7. User compares original image to extracted text
8. User edits text manually: "We moved to Santa Fe around 1974"
9. review_state = "approved_text"
10. Claim extraction proceeds, date stored as approx_year: 1974
```

## Digital photo with EXIF and GPS

```
1. User shares digital family photo from phone
2. Image goes into inbox/photo_metadata/
3. Lorevox extracts EXIF: datetime_original = "2025-07-14T13:22:10+02:00"
4. GPS extracted: lat=43.295, lon=-0.368 → reverse-geocoded: "Pau, France"
5. Creates preview, exif.json, meta.json
6. candidate_anchor = true, candidate_date = "2025-07-14"
7. review_state = "unreviewed"
8. User confirms: person=chris_horne, event=France trip 2025
9. Photo becomes archive evidence anchored to timeline event ev_0042
```

---

# Summary

Lorevox ingestion is the entry point into the memory system.

Designed correctly, it can absorb:
- live interviews
- old family-history notes (typed and handwritten)
- scanned documents and letters
- PDFs
- digital photos with GPS and timestamp metadata
- legacy media

Without confusing extracted candidate text with verified historical truth.

The ingestion layer's job is not to produce facts.
Its job is to safely bring sources into the archive so that facts can be produced — carefully, with human oversight, and with full provenance at every step.
