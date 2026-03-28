# Lorevox Media Builder — Work Order
## Step 4

**Date:** 2026-03-27
**Status:** Ready to begin
**Prerequisite:** Step 3 (Runtime Stabilization) — complete

---

## Framing

The media infrastructure was partially built in v4.2: the SQLite `media` table exists, `db.py` has `add_media()` / `list_media()`, and the `media` router is registered in `main.py`. But:

- The router and `db.py` have a **signature mismatch** (Bug MB-01 — first thing to fix)
- There is **zero UI** for photo upload, gallery, or attachment in `lori8.0.html`
- Photos are **not connected** to memoir sections, facts, or the DOCX export
- The media serve path (browser-accessible URL for saved images) is **not implemented**

Media Builder closes all of these gaps. The output is a system where the narrator can attach photos to their story and the memoir export includes them.

---

## Scope

Photo upload → storage → gallery → attachment to memoir moments → enriched DOCX export.

No video, no audio attachments in this pass. Photos (JPEG, PNG, WebP, HEIC) only.

No cloud storage. All files stay local under `DATA_DIR/media/<person_id>/`.

---

## Bug MB-01 — Media router / db.py signature mismatch

**Problem:** `routers/media.py` calls `add_media()` with parameters that do not match the `db.py` function signature. The router passes `file_path, mime_type, description, taken_at, location_name, latitude, longitude, exif` but `db.py`'s `add_media()` accepts `person_id, kind, filename, mime, bytes, sha256, meta`. Any call to `POST /api/media/upload` would raise a `TypeError` at runtime.

**Fix:**
- Rewrite `db.py` `add_media()` to accept the full parameter set the router expects:
  `person_id, filename, mime, bytes, sha256, description, taken_at, location_name, latitude, longitude, exif_meta`
- Update `list_media()` return value to include all columns
- Add `description`, `taken_at`, `location_name`, `latitude`, `longitude`, `exif_json` columns to the `media` table via PRAGMA migration (same pattern as Bug MAT-01 in the facts table)
- Update the router to use the corrected signature
- Add a new `GET /api/media/file/{media_id}` endpoint that serves the actual file bytes (Content-Type from `mime`) so the browser can display images

**Files:** `server/code/api/db.py`, `server/code/api/routers/media.py`

---

## Task 1 — Photo Upload UI Panel

**What exists:** None. `lori8.0.html` has no photo upload affordance.

**Deliverables:**

- Add a `📷 Photos` tab to the memoir panel header (between the existing controls and the DOCX/TXT save buttons)
- When active, the panel body shows the **Photo Gallery** view (Task 2)
- Add a `＋ Add Photo` button inside the gallery panel
- Clicking `＋ Add Photo` opens a `<input type="file" accept="image/*">` file picker
- On file select:
  - Read EXIF client-side using the existing `exifr` or a minimal EXIF parser — extract `DateTimeOriginal`, `GPSLatitude`, `GPSLongitude` if present
  - Show a small upload preview card with the image thumbnail, filename, detected date (if any), and a `Description` text input
  - `Upload` button POSTs to `POST /api/media/upload` (multipart) with `person_id`, `description`, `taken_at` (from EXIF or manual), `exif_json`, and the file
  - On success: add the new photo to the gallery and close the preview card
  - On error: show inline error message
- Upload state: disable the `Upload` button while in-flight; show a spinner

**CSS:** Add to `lori80.css` — gallery grid, upload card, thumbnail sizing. Consistent with existing memoir panel palette (`#0f1117` background, indigo accent).

**Files:** `ui/lori8.0.html`, `ui/css/lori80.css`

---

## Task 2 — Photo Gallery View

**What exists:** `GET /api/media/list/{person_id}` is implemented. The browser cannot view the images yet because there is no serve endpoint.

**Deliverables:**

- After Bug MB-01 fix, the serve endpoint `GET /api/media/file/{media_id}` exists
- Gallery renders as a 3-column responsive grid of thumbnails (80×80px)
- Each thumbnail shows:
  - The photo
  - Description (truncated to 1 line) or filename if no description
  - Date taken (if known), otherwise upload date
- Clicking a thumbnail opens a **lightbox overlay** with:
  - Full-size photo (max 80% viewport)
  - Description (editable in place)
  - Date taken (editable)
  - `🗑 Remove` button (calls `DELETE /api/media/{media_id}` — see Task 2a)
  - `Attach to Memoir Section` dropdown (see Task 3)
  - `✕` close button
- Gallery loads on tab activation: `GET /api/media/list/{state.person_id}`
- If no person loaded, gallery shows "No narrator loaded" placeholder

**Task 2a — DELETE endpoint (new):**
- `DELETE /api/media/{media_id}` — removes DB row and deletes file from disk
- Confirmation required in UI before calling (cannot be undone)

**Files:** `ui/lori8.0.html`, `ui/css/lori80.css`, `server/code/api/routers/media.py`, `server/code/api/db.py`

---

## Task 3 — Attach Photo to Memoir Section

**What exists:** The memoir panel has 8 sections (`_LV80_MEMOIR_SECTIONS`). Facts are tagged with meaning and narrative data. But there is no data model connecting a photo to a section or fact.

**Deliverables:**

**Backend:**
- Add `media_attachments` table (migration):
  ```sql
  CREATE TABLE IF NOT EXISTS media_attachments (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,   -- 'memoir_section' | 'fact'
    entity_id TEXT NOT NULL,     -- section key or fact id
    person_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
  );
  ```
- `POST /api/media/attach` — body: `{ media_id, entity_type, entity_id, person_id }`
- `DELETE /api/media/attach/{attachment_id}`
- `GET /api/media/attachments?person_id=X` — returns all attachments for a person

**Frontend:**
- "Attach to Memoir Section" dropdown in the lightbox: lists the 8 section names
- On selection: calls `POST /api/media/attach`
- Attached badge shows on the thumbnail (`📌 1`) to indicate the photo is placed
- In the memoir scroll panel, attached photos appear as small inline thumbnails after the section heading (below the section title `<h3>`, above the first fact mark)
- A photo can be attached to multiple sections; an attachment can be removed from the lightbox

**Files:** `server/code/api/db.py`, `server/code/api/routers/media.py`, `server/code/api/main.py`, `ui/lori8.0.html`, `ui/css/lori80.css`

---

## Task 4 — Media-Enriched DOCX Export

**What exists:** `POST /api/memoir/export-docx` produces a DOCX from memoir text. Photos are not included.

**Deliverables:**

- Extend `MemoirExportRequest` Pydantic model with `attached_photos: List[AttachedPhoto]` where `AttachedPhoto = { media_id, section_key, file_path, description, taken_at }`
- Frontend: before calling `memoirExportDOCX()`, fetch `GET /api/media/attachments?person_id=X` and include photo metadata in the request body (file paths are backend-local so the server reads them directly)
- In `memoir_export.py` `_build_threads_docx()` and `_build_draft_docx()`: after each section heading, if any photos are attached to that section, insert them as `doc.add_picture(file_path, width=Inches(3.5))` with a caption paragraph below (description + date)
- If `python-docx` image insertion fails (corrupt file, unsupported format): skip the photo and log a warning — never fail the whole export
- DOCX export button label updates to `⬇️ Save DOCX (with photos)` when at least one photo is attached, `⬇️ Save DOCX` otherwise

**Files:** `server/code/api/routers/memoir_export.py`, `ui/lori8.0.html`

---

## Task 5 — Timeline Photo Integration

**What exists:** The memoir scroll shows facts organized by section. The timeline in `lori8.0.html` shows facts on a vertical timeline. Photos are not visible on either.

**Deliverables:**

- When rendering a timeline entry (fact mark), check if any photos are attached to the section that fact belongs to
- Show at most 1 thumbnail (40×40px) beside the timeline entry if a photo exists for that section
- Clicking the thumbnail opens the lightbox (same component as Task 2)
- This is display-only — photo attachment is managed through the gallery, not the timeline

**Files:** `ui/lori8.0.html`, `ui/css/lori80.css`

---

## Task 6 — Media State in buildRuntime71()

**What exists:** `buildRuntime71()` sends memoir arc coverage and meaning tags to the backend. Photos are not referenced.

**Deliverables:**

- Add `media_count` to the `memoir_context` object in `buildRuntime71()`:
  ```javascript
  media_count: (window._lv80MediaCount || 0)
  ```
  where `window._lv80MediaCount` is updated whenever the gallery loads or a photo is uploaded/deleted
- In `prompt_composer.py`: if `memoir_context.media_count > 0`, add one line to the `LORI_RUNTIME` block:
  ```
  narrator_photos: N photos uploaded
  ```
- This allows Lori to acknowledge photo upload ("I can see you've added some photos — those can go right into the memoir when we're ready.")

**Files:** `ui/lori8.0.html` (buildRuntime71), `server/code/api/prompt_composer.py`

---

## Task 7 — Regression test and report

**Deliverables:**

- After all tasks complete, run a structured verification pass:
  - `POST /api/media/upload` with a JPEG → row in DB, file on disk, serve endpoint returns correct bytes
  - Gallery displays uploaded photo
  - Lightbox opens, description edits
  - Attach to section → memoir scroll shows thumbnail
  - DOCX export includes photo inline at correct section
  - DELETE removes file and DB row
  - `buildRuntime71()` emits correct `media_count`
  - No console errors on clean load
- Write `MEDIA_BUILDER_TEST_REPORT.md`

**Files:** `docs/MEDIA_BUILDER_TEST_REPORT.md` (to be created)

---

## Explicit Constraints

1. **No cloud storage.** All media files stay under `DATA_DIR/media/` on the local machine.
2. **Images only.** JPEG, PNG, WebP, HEIC. No video, no audio.
3. **No new CDN dependencies.** Any client-side EXIF parser must be vendored locally under `ui/vendor/`.
4. **No changes to Bio Builder (Phase F).** Media Builder is additive only.
5. **No breaking changes to existing DOCX export.** If `attached_photos` is absent or empty, output is identical to the current behavior.
6. **Deletion is explicit-user-only.** Photos are never auto-deleted by the system.

---

## Files This Pass Will Touch

| File | Task(s) |
|------|---------|
| `server/code/api/db.py` | MB-01, 2, 3 |
| `server/code/api/routers/media.py` | MB-01, 1, 2, 2a, 3 |
| `server/code/api/routers/memoir_export.py` | 4 |
| `server/code/api/main.py` | 3 (new attachment router, if split) |
| `ui/lori8.0.html` | 1, 2, 3, 4, 5, 6 |
| `ui/css/lori80.css` | 1, 2, 3, 5 |
| `server/code/api/prompt_composer.py` | 6 |
| `ui/vendor/exif/` (new) | 1 — EXIF parser |
| `docs/MEDIA_BUILDER_TEST_REPORT.md` (new) | 7 |

---

## Build Order

```
Bug MB-01 (signature fix + serve endpoint)
  → Task 1 (upload UI)
  → Task 2 (gallery + lightbox + delete)
  → Task 3 (attach to section — backend + UI)
  → Task 4 (DOCX enrichment)
  → Task 5 (timeline thumbnails)
  → Task 6 (runtime context)
  → Task 7 (test report)
```

MB-01 must be complete before any task that touches the media router. Tasks 3–5 depend on Task 2. Task 4 depends on Task 3. Tasks 6–7 depend on all prior tasks.

---

## Pre-existing Backend Assets (Do Not Rebuild)

| Asset | Status |
|-------|--------|
| `media` table in SQLite | ✅ Exists — needs column migration |
| `db.py` `add_media()` | ✅ Exists — needs signature update |
| `db.py` `list_media()` | ✅ Exists — needs column additions |
| `GET /api/media/list/{person_id}` | ✅ Registered and functional |
| `POST /api/media/upload` | ⚠️ Registered but throws at runtime (Bug MB-01) |
| `main.py` router registration | ✅ `media` already included |

---

## Definition of Done

> A narrator can take a photo from their phone or computer, drop it into Lorevox, attach it to a chapter of their memoir ("this is from when we lived in Cleveland"), and download a Word document with that photo appearing in the Cleveland chapter.
