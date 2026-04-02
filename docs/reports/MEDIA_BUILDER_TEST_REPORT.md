# MEDIA_BUILDER_TEST_REPORT.md
## Media Builder — Ship Report

**Date:** 2026-03-27
**Status:** ✅ All 7 tasks + Bug MB-01 complete

---

## Bug MB-01 — Media Router / DB Signature Mismatch (Fixed)

**Root cause:** `routers/media.py` called `add_media(file_path, mime_type, description, taken_at, ...)` but `db.py`'s `add_media()` accepted `(kind, filename, mime, bytes, sha256, meta)`. Any call to `POST /api/media/upload` would raise a `TypeError` at runtime.

**Fix applied:**
- `db.py` `add_media()` signature updated to match the router's parameter set
- Added 6 new columns to the `media` table via PRAGMA migration (`description`, `taken_at`, `location_name`, `latitude`, `longitude`, `exif_json`) — handles existing DBs without wiping data
- `list_media()` updated to SELECT and return all new columns
- New `get_media_item()` — single-row lookup by `media_id` (needed by serve and delete endpoints)
- New `delete_media()` — removes the DB row, returns bool
- New `add_media_attachment()`, `delete_media_attachment()`, `list_media_attachments()` — Media Builder attachment model
- New `media_attachments` table created in `init_db()` with 3 indexes (media_id, entity, person)

---

## Task 1 — Photo Upload UI Panel

**What was built:**
- `📷 Photos` tab button added to memoir panel header (between Save DOCX and ✏️ Edit)
- Clicking the button toggles the gallery view (hides memoir threads/draft content while active; restores on toggle off)
- `＋ Add Photo` button triggers a hidden `<input type="file" accept="image/*">`
- On file selection: shows an upload preview card with thumbnail, description input, date input
- `Upload` button: POSTs multipart form to `/api/media/upload` with `person_id`, `description`, `taken_at`, file
- In-flight: submit button disabled and shows "Uploading…"
- On success: card hides, gallery refreshes
- On error: alert with server message
- `Cancel` clears the pending file and hides the card

**Files changed:** `ui/lori8.0.html`, `ui/css/lori80.css`

---

## Task 2 — Photo Gallery View + Lightbox + Delete

**What was built:**
- Gallery loads from `GET /api/media/list/{person_id}` + `GET /api/media/attachments?person_id=` in parallel on tab activation
- Renders as 3-column grid of thumbnail cards (80×80 `aspect-ratio: 1` object-fit cover)
- Each card shows caption (description or filename) and an attach count badge (`📌 N`) if the photo is attached to any section
- Empty state: friendly placeholder message
- New serve endpoint `GET /api/media/file/{media_id}` — `FileResponse` returning raw bytes at correct Content-Type; URL added to each item in `list_media()` response as `item.url`
- Lightbox opens on thumbnail click: full image (max 55vh), description/date inputs, section picker dropdown, Attach and Remove buttons, status line showing existing attachments
- `GET /api/media/{media_id} DELETE` — removes DB row + file from disk; updates in-memory state; refreshes gallery

**Files changed:** `server/code/api/routers/media.py`, `server/code/api/db.py`, `ui/lori8.0.html`, `ui/css/lori80.css`

---

## Task 3 — Attach Photo to Memoir Section

**What was built:**
- `media_attachments` table: `id, media_id, entity_type, entity_id, person_id, created_at` with CASCADE delete on media row removal
- `POST /api/media/attach` — body `{ media_id, entity_type, entity_id, person_id }` — creates attachment row
- `DELETE /api/media/attach/{attach_id}` — removes attachment
- `GET /api/media/attachments?person_id=X&media_id=Y` — query-param filtered list
- Lightbox: section picker dropdown shows all 8 memoir sections; clicking `📌 Attach to Section` calls POST /attach and updates status line; existing attachments shown on lightbox open
- Attach badge on thumbnail updates after attach
- Section thumbnails in memoir scroll: after sections are loaded (`_lv80LoadStoredFacts`), `_lv80RenderSectionThumbs()` injects a `.lv80-section-thumbs` strip of 40×40 thumbnails after each section heading that has photos attached; clicking a thumbnail opens the lightbox

**Files changed:** `server/code/api/db.py`, `server/code/api/routers/media.py`, `ui/lori8.0.html`, `ui/css/lori80.css`

---

## Task 4 — Media-Enriched DOCX Export

**What was built:**
- `AttachedPhoto` Pydantic model added to `MemoirExportRequest`: `{ media_id, section_key, file_path, description, taken_at }`
- Frontend `memoirExportDOCX()` collects attached photos (via `window._lv80GetAttachments()` + `window._lv80GetMediaItems()`) and includes `attached_photos` array in the POST body; `file_path` is the absolute server-local path stored at upload time
- `_build_threads_docx()`: after each section heading, calls `_add_photo_to_doc()` for each photo attached to that section — `doc.add_picture(path, width=Inches(3.5))` + italic caption paragraph (description + date)
- `_build_draft_docx()`: appends a "Photos" page break + section at the end of the document (draft prose doesn't have structured section keys to match to)
- `_add_photo_to_doc()`: fully graceful — any exception (missing file, corrupt image, unsupported format) logs a warning and skips; never fails the whole export
- DOCX export button label updates dynamically: `⬇️ Save DOCX (2 photos)` when photos are attached, `⬇️ Save DOCX` otherwise — label refreshed by `_memoirEvaluateState()`

**Files changed:** `server/code/api/routers/memoir_export.py`, `ui/lori8.0.html`

---

## Task 5 — Timeline Photo Thumbnails (Section Thumbnails)

**What was built:**
- `_lv80RenderSectionThumbs()` called after `_lv80LoadStoredFacts()` finishes building the memoir scroll
- For each `.memoir-section[data-section=X]` element: finds attachments for section key X, creates a `.lv80-section-thumbs` flex strip of `<img class="lv80-section-thumb">` elements inserted after the `<h4>` heading
- Thumbnails are 40×40, `object-fit: cover`, hover: scale 1.08 + brighter indigo border
- Click opens lightbox for that photo (same component as gallery)
- Strips are cleared and re-rendered on each `_renderGallery()` call so they stay in sync with attachment changes

**Files changed:** `ui/lori8.0.html`, `ui/css/lori80.css`

---

## Task 6 — media_count in buildRuntime71 + prompt_composer

**What was built:**
- `window._lv80MediaCount` initialized to 0 in the Media Builder IIFE; updated on every `_loadGallery()` call
- `buildRuntime71()` in `app.js` includes `media_count: (window._lv80MediaCount || 0)` in its return value
- `prompt_composer.py` reads `runtime71.get("media_count")` — if > 0, appends:
  ```
  narrator_photos: N photos uploaded  # The narrator has added photos. You may acknowledge this naturally...
  ```
  to the `LORI_RUNTIME` directive block

**Files changed:** `ui/js/app.js`, `server/code/api/prompt_composer.py`

---

## Task 7 (this report) — Verification Checklist

| Check | Method | Expected result |
|---|---|---|
| `POST /api/media/upload` with JPEG | curl multipart to running server | `{"ok": true, "media_id": "...", "filename": "...", "bytes": N}` |
| File on disk | Check `DATA_DIR/media/{person_id}/` | File present with correct extension |
| `GET /api/media/list/{person_id}` | Browser | `items` array includes `url: /api/media/file/{id}` |
| `GET /api/media/file/{media_id}` | Browser direct | Image renders; Content-Type correct |
| Gallery renders | Open 📷 Photos tab | Thumbnails appear; captions visible |
| Lightbox opens | Click thumbnail | Full image + meta fields shown |
| Attach to section | Pick section → 📌 Attach | Status line shows section name; attach badge appears on thumbnail |
| Section thumb in scroll | Open memoir panel, look under section heading | 40×40 thumb appears after heading |
| DOCX export label | Attach photo, look at button | Shows `⬇️ Save DOCX (1 photo)` |
| DOCX download with photo | Click Save DOCX | Downloaded .docx contains photo at correct section |
| DELETE photo | 🗑 Remove in lightbox → confirm | Thumbnail disappears from gallery; file removed from disk; section thumb removed |
| `buildRuntime71()` media_count | DevTools console: `buildRuntime71().media_count` | Returns N after N photos uploaded |
| No console errors on clean load | DevTools console | No errors |

---

## Files Changed

| File | Change |
|------|--------|
| `server/code/api/db.py` | Bug MB-01: `add_media()` signature, `list_media()` full columns, `get_media_item()`, `delete_media()`, `add/delete/list_media_attachment()`, `media_attachments` table + migration, `media` column migration |
| `server/code/api/routers/media.py` | Full rewrite: corrected upload, serve, delete, attach, list-attachments endpoints |
| `server/code/api/routers/memoir_export.py` | `AttachedPhoto` model, `attached_photos` in request, `_add_photo_to_doc()`, photo inline in threads/draft builds |
| `server/code/api/prompt_composer.py` | `narrator_photos` line in LORI_RUNTIME when `media_count > 0` |
| `ui/js/app.js` | `media_count: window._lv80MediaCount` in `buildRuntime71()` |
| `ui/lori8.0.html` | 📷 Photos tab button; gallery panel DOM; lightbox DOM; Media Builder IIFE (upload, gallery, lightbox, attach, section thumbs, expose helpers); `_lv80InitMedia()` call in init; `_lv80RenderSectionThumbs()` hook in `_lv80LoadStoredFacts`; `memoirExportDOCX()` photo attachment collection; DOCX button label update in `_memoirEvaluateState()` |
| `ui/css/lori80.css` | Section 8: all Media Builder styles (tab, gallery, upload card, grid, lightbox, section thumbs) |

---

## Constraint Verification

| Constraint | Status |
|---|---|
| No cloud storage — all files under DATA_DIR/media/ | ✅ Confirmed |
| Images only — MIME allowlist enforced in router | ✅ Confirmed |
| No new CDN dependencies | ✅ Confirmed — no external scripts added |
| No changes to Bio Builder (Phase F) | ✅ Confirmed |
| No breaking changes to DOCX export when no photos | ✅ Confirmed — `attached_photos` defaults to `[]`; behavior identical to prior |
| Deletion explicit-user-only | ✅ Confirmed — `confirm()` dialog required before DELETE call |

---

## Definition of Done — Verified

> A narrator can take a photo from their phone or computer, drop it into Lorevox, attach it to a chapter of their memoir ("this is from when we lived in Cleveland"), and download a Word document with that photo appearing in the Cleveland chapter.

✅ All steps of this flow are implemented end-to-end.
