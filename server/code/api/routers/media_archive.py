"""WO-MEDIA-ARCHIVE-01 — /api/media-archive router.

Document Archive lane that runs parallel to /api/photos. Stores PDFs,
scanned documents, handwritten notes, genealogy outlines, letters,
certificates, clippings — anything that's source material rather than
a memory-prompt photo.

Locked product rule:
    Preserve first. Tag second. Transcribe / OCR third.
    Extract candidates only after that. NEVER auto-promote to truth.

This router intentionally does NOT call into Bio Builder. Items get
flagged candidate_ready=true by the operator, and a future
WO-MEDIA-ARCHIVE-CANDIDATES-01 lane will harvest them on demand.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .. import flags
from ...services.media_archive import repository as archive_repo
from ...services.media_archive import storage as archive_storage
from ...services.media_archive import thumbnail as archive_thumb
from ...services.media_archive import text_probe as archive_probe
from ...services.media_archive.types import (
    DOCUMENT_TYPES,
    DATE_PRECISIONS,
    LINK_TYPES,
)


log = logging.getLogger("lorevox.media_archive")


# Mirror P2.2 from photos: log loudly at startup if Pillow / pdf2image
# are missing, so the operator sees the trap in api.log instead of
# silently-failing thumbnails.
def _startup_dep_check() -> None:
    try:
        from PIL import Image  # type: ignore  # noqa: F401
        try:
            from PIL import __version__ as v  # type: ignore
        except Exception:
            v = "unknown"
        log.info("[media_archive][startup] Pillow available: version=%s", v)
    except ImportError:
        log.error(
            "[media_archive][startup] PILLOW NOT INSTALLED. Image thumbnails "
            "will silently produce no output. Fix: .venv-gpu/bin/pip install Pillow. "
            "See docs/PILLOW-VENV-INSTALL.md."
        )
    try:
        import pdf2image  # type: ignore  # noqa: F401
        log.info("[media_archive][startup] pdf2image available; PDF thumbnails enabled")
    except ImportError:
        log.info(
            "[media_archive][startup] pdf2image NOT INSTALLED; PDF thumbnails will "
            "fall back to generic icon. Optional: pip install pdf2image, sudo apt install poppler-utils."
        )
    try:
        import pypdf  # type: ignore  # noqa: F401
        log.info("[media_archive][startup] pypdf available; PDF page-count detection enabled")
    except ImportError:
        try:
            import PyPDF2  # type: ignore  # noqa: F401
            log.info("[media_archive][startup] PyPDF2 available; PDF page-count detection enabled (legacy lib)")
        except ImportError:
            log.info(
                "[media_archive][startup] neither pypdf nor PyPDF2 installed; PDF page count "
                "will be NULL on upload. Optional: pip install pypdf."
            )


_startup_dep_check()


router = APIRouter(prefix="/api/media-archive", tags=["media_archive"])


# ---------------------------------------------------------------------------
# Flag gate
# ---------------------------------------------------------------------------
def _require_enabled() -> None:
    """Raise 404 when LOREVOX_MEDIA_ARCHIVE_ENABLED is off."""
    if not flags.media_archive_enabled():
        raise HTTPException(status_code=404, detail="media archive surface disabled")


# ---------------------------------------------------------------------------
# Helpers — input validation, URL synthesis, file serving
# ---------------------------------------------------------------------------
def _validate_enum(name: str, value: Optional[str], allowed) -> None:
    if value is None:
        return
    if value not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{name}='{value}' not in {list(allowed)}",
        )


def _truthy_form(raw: Optional[str], default: bool = False) -> bool:
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on", "t", "y")


def _parse_json_list(raw: Optional[str], field_name: str) -> List[Dict[str, Any]]:
    if raw is None or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail=f"invalid json for {field_name}")
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON array")
    return [item for item in data if isinstance(item, dict)]


def _attach_archive_urls(item: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Synthesize media_url + thumbnail_url at response time, mirroring
    the photos router pattern. Without this, both URLs would be NULL
    in the response (they are stored as NULL in the DB; URLs are derived).
    """
    if not item:
        return item
    iid = item.get("id")
    if iid:
        if not item.get("media_url"):
            item["media_url"] = f"/api/media-archive/{iid}/file"
        if not item.get("thumbnail_url"):
            item["thumbnail_url"] = f"/api/media-archive/{iid}/thumb"
    return item


def _serve_file_response(path_str: Optional[str], detail: str = "file not found") -> FileResponse:
    if not path_str:
        raise HTTPException(status_code=404, detail=detail)
    p = Path(path_str)
    if not p.is_file():
        raise HTTPException(status_code=404, detail=detail)
    return FileResponse(str(p))


def _thumbnail_path_for_item(item: Dict[str, Any]) -> Optional[str]:
    """Compute where the thumbnail SHOULD live for this item, given
    its storage_path. We don't store thumbnail_path in the DB (matches
    photo_intake convention; could add it later if needed).
    """
    storage = item.get("storage_path")
    if not storage:
        return None
    return str(Path(storage).parent / "thumb.jpg")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@router.get("/health")
def media_archive_health() -> Dict[str, Any]:
    """Health probe — intentionally NOT gated. Returns enabled status
    so the UI can decide whether to render the launcher card."""
    enabled = flags.media_archive_enabled()
    storage_root = ""
    try:
        if enabled:
            storage_root = str(archive_storage.archive_root())
    except Exception:
        pass
    return {"ok": True, "enabled": enabled, "storage_root": storage_root}


# ---------------------------------------------------------------------------
# POST /api/media-archive  (multipart upload)
# ---------------------------------------------------------------------------
@router.post("")
async def upload_archive_item(
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form(...),
    person_id: Optional[str] = Form(None),
    family_line: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    date_value: Optional[str] = Form(None),
    date_precision: Optional[str] = Form(None),
    location_label: Optional[str] = Form(None),
    location_source: Optional[str] = Form(None),
    timeline_year: Optional[int] = Form(None),
    life_map_era: Optional[str] = Form(None),
    life_map_section: Optional[str] = Form(None),
    archive_only: Optional[str] = Form(None),
    candidate_ready: Optional[str] = Form(None),
    people: Optional[str] = Form(None),
    family_lines: Optional[str] = Form(None),
    operator_notes: Optional[str] = Form(None),
    manual_transcription: Optional[str] = Form(None),
    summary: Optional[str] = Form(None),
    uploaded_by_user_id: Optional[str] = Form(None),
) -> JSONResponse:
    _require_enabled()

    _validate_enum("document_type", document_type, DOCUMENT_TYPES)
    _validate_enum("date_precision", date_precision, DATE_PRECISIONS)

    # MIME validation. Photo Intake rejects PDFs; this surface accepts
    # them. See spec §1: "non-photo file accepted by Media Archive
    # (and rejected by Photo Intake)" is a locked acceptance test.
    mime = (file.content_type or "").lower()
    if not archive_storage.mime_allowed(mime, file.filename or ""):
        raise HTTPException(
            status_code=415,
            detail=f"unsupported media type: {mime} (filename: {file.filename})",
        )

    # Stream upload to a temp file so storage.store_archive_file can
    # use shutil.move to land it in the archive layout.
    tmp_fd, tmp_path = tempfile.mkstemp(prefix="archive_upload_", suffix=".bin")
    try:
        with os.fdopen(tmp_fd, "wb") as out:
            while True:
                chunk = await file.read(65536)
                if not chunk:
                    break
                out.write(chunk)

        item_id = uuid.uuid4().hex

        # Probe file BEFORE moving it (probe_document needs the path; storage
        # moves the file to its final location). We can re-probe after the
        # move if needed but doing it here keeps storage as a thin file-mover.
        probe = archive_probe.probe_document(tmp_path, mime_type=mime)

        # Move to final location.
        stored = archive_storage.store_archive_file(
            item_id=item_id,
            source_path=tmp_path,
            original_filename=file.filename or "upload.bin",
            mime_type=mime,
            person_id=person_id,
            family_line=family_line,
        )
    finally:
        try:
            if Path(tmp_path).exists():
                Path(tmp_path).unlink()
        except OSError:
            pass

    # Best-effort thumbnail. Failure leaves thumbnail_url synth still
    # working (it'll 404 from the GET /thumb endpoint, falling back to
    # the file-icon UI affordance).
    try:
        thumb_path = str(Path(stored["storage_path"]).parent / "thumb.jpg")
        archive_thumb.create_thumbnail(
            source_path=stored["storage_path"],
            target_path=thumb_path,
            longest_edge=400,
            mime_type=mime,
        )
    except Exception as exc:
        log.warning("[media_archive][upload] thumbnail step failed: %s", exc)

    archive_only_flag = _truthy_form(archive_only, default=True)
    candidate_ready_flag = _truthy_form(candidate_ready, default=False)

    people_rows = _parse_json_list(people, "people")
    family_lines_rows = _parse_json_list(family_lines, "family_lines")

    # Create the row. text_status / page_count come from the probe if
    # detectable; otherwise the migration defaults apply.
    row = archive_repo.create_archive_item(
        item_id=item_id,
        title=title,
        document_type=document_type,
        storage_path=stored["storage_path"],
        original_filename=file.filename or "upload.bin",
        mime_type=mime,
        person_id=person_id,
        family_line=family_line,
        description=description,
        file_ext=stored.get("file_ext"),
        file_size_bytes=stored.get("file_size_bytes"),
        page_count=probe.get("page_count"),
        text_status=probe.get("text_status") or "not_started",
        manual_transcription=manual_transcription,
        operator_notes=operator_notes,
        summary=summary,
        date_value=date_value,
        date_precision=(date_precision or "unknown"),
        location_label=location_label,
        location_source=(location_source or "unknown"),
        timeline_year=timeline_year,
        life_map_era=life_map_era,
        life_map_section=life_map_section,
        archive_only=archive_only_flag,
        candidate_ready=candidate_ready_flag,
        uploaded_by_user_id=uploaded_by_user_id,
    )

    # Replace-all on join tables (people / family_lines)
    if people_rows:
        archive_repo.replace_people(item_id, people_rows)
    if family_lines_rows:
        archive_repo.replace_family_lines(item_id, family_lines_rows)

    # Re-fetch with relations, then mirror to meta.json on disk.
    full = archive_repo.get_archive_item(item_id) or row
    archive_storage.write_meta_json(
        item_id=item_id,
        meta=full,
        person_id=person_id,
        family_line=family_line,
    )

    log.info(
        "[media_archive][upload] item_id=%s type=%s person=%s family=%s pages=%s text=%s",
        item_id, document_type,
        person_id or "-",
        family_line or "-",
        full.get("page_count"),
        full.get("text_status"),
    )

    return JSONResponse(
        status_code=201,
        content={"ok": True, "item": _attach_archive_urls(full)},
    )


# ---------------------------------------------------------------------------
# GET /api/media-archive  (list with filters)
# ---------------------------------------------------------------------------
@router.get("")
def list_archive_items(
    person_id: Optional[str] = Query(None),
    family_line: Optional[str] = Query(None),
    document_type: Optional[str] = Query(None),
    candidate_ready: Optional[bool] = Query(None),
    include_deleted: bool = Query(False),
) -> Dict[str, Any]:
    _require_enabled()
    items = archive_repo.list_archive_items(
        person_id=person_id,
        family_line=family_line,
        document_type=document_type,
        candidate_ready=candidate_ready,
        include_deleted=include_deleted,
    )
    items = [_attach_archive_urls(it) for it in items if it]
    return {"ok": True, "items": items, "count": len(items)}


# ---------------------------------------------------------------------------
# GET /api/media-archive/{id}/file  (serve original)
# GET /api/media-archive/{id}/thumb (serve thumbnail)
# ---------------------------------------------------------------------------
@router.get("/{item_id}/file")
def serve_archive_file(item_id: str) -> FileResponse:
    _require_enabled()
    item = archive_repo.get_archive_item(item_id, deleted=True)
    if item is None:
        raise HTTPException(status_code=404, detail="archive item not found")
    return _serve_file_response(item.get("storage_path"), "archive file missing on disk")


@router.get("/{item_id}/thumb")
def serve_archive_thumb(item_id: str) -> FileResponse:
    _require_enabled()
    item = archive_repo.get_archive_item(item_id, deleted=True)
    if item is None:
        raise HTTPException(status_code=404, detail="archive item not found")
    thumb_path = _thumbnail_path_for_item(item)
    if thumb_path and Path(thumb_path).is_file():
        return FileResponse(thumb_path)
    # Fallback: serve the original (the UI handles oversized originals
    # gracefully via object-fit:contain). For PDFs without poppler this
    # will return the raw PDF — caller can render or display a generic
    # icon based on the content-type.
    return _serve_file_response(item.get("storage_path"), "thumbnail not generated")


# ---------------------------------------------------------------------------
# GET /api/media-archive/{id}  (detail)
# ---------------------------------------------------------------------------
@router.get("/{item_id}")
def get_archive_item(item_id: str) -> Dict[str, Any]:
    _require_enabled()
    item = archive_repo.get_archive_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="archive item not found")
    return _attach_archive_urls(item)


# ---------------------------------------------------------------------------
# PATCH /api/media-archive/{id}
# ---------------------------------------------------------------------------
class _ArchivePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    document_type: Optional[str] = None
    date_value: Optional[str] = None
    date_precision: Optional[str] = None
    location_label: Optional[str] = None
    location_source: Optional[str] = None
    timeline_year: Optional[int] = None
    life_map_era: Optional[str] = None
    life_map_section: Optional[str] = None
    archive_only: Optional[bool] = None
    candidate_ready: Optional[bool] = None
    needs_review: Optional[bool] = None
    manual_transcription: Optional[str] = None
    operator_notes: Optional[str] = None
    summary: Optional[str] = None
    text_status: Optional[str] = None
    transcription_status: Optional[str] = None
    extraction_status: Optional[str] = None
    # Replace-all join-table semantics (matches WO-PHOTO-PEOPLE-EDIT-01)
    people: Optional[List[Dict[str, Any]]] = None
    family_lines: Optional[List[Dict[str, Any]]] = None
    links: Optional[List[Dict[str, Any]]] = None
    last_edited_by_user_id: str = Field(..., min_length=1)


@router.patch("/{item_id}")
def patch_archive_item(item_id: str, body: _ArchivePatch) -> Dict[str, Any]:
    _require_enabled()
    payload = body.model_dump(exclude_unset=True)
    actor = payload.pop("last_edited_by_user_id", None)
    if not actor:
        raise HTTPException(status_code=400, detail="last_edited_by_user_id required")

    people_replace = payload.pop("people", None)
    family_lines_replace = payload.pop("family_lines", None)
    links_replace = payload.pop("links", None)

    _validate_enum("document_type", payload.get("document_type"), DOCUMENT_TYPES)
    _validate_enum("date_precision", payload.get("date_precision"), DATE_PRECISIONS)

    # Validate link types in the replacement list before touching the DB.
    if links_replace is not None:
        for link in links_replace:
            if not isinstance(link, dict):
                continue
            lt = link.get("link_type")
            if lt and lt not in LINK_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"invalid link_type='{lt}'; must be one of {list(LINK_TYPES)}",
                )

    # Field patch (if any)
    if payload:
        updated = archive_repo.patch_archive_item(item_id, payload)
        if updated is None:
            raise HTTPException(status_code=404, detail="archive item not found")
    else:
        updated = archive_repo.get_archive_item(item_id)
        if updated is None:
            raise HTTPException(status_code=404, detail="archive item not found")

    # Replace-all on join tables
    if people_replace is not None:
        added = archive_repo.replace_people(item_id, people_replace)
        log.info("[media_archive][patch][people] item_id=%s added=%d actor=%s",
                 item_id, added, actor)
    if family_lines_replace is not None:
        added = archive_repo.replace_family_lines(item_id, family_lines_replace)
        log.info("[media_archive][patch][family_lines] item_id=%s added=%d actor=%s",
                 item_id, added, actor)
    if links_replace is not None:
        added = archive_repo.replace_links(item_id, links_replace)
        log.info("[media_archive][patch][links] item_id=%s added=%d actor=%s",
                 item_id, added, actor)

    # Re-fetch + mirror to meta.json
    full = archive_repo.get_archive_item(item_id) or updated
    archive_storage.write_meta_json(
        item_id=item_id,
        meta=full,
        person_id=full.get("person_id"),
        family_line=full.get("family_line"),
    )
    return _attach_archive_urls(full)


# ---------------------------------------------------------------------------
# DELETE /api/media-archive/{id}  (soft-delete)
# ---------------------------------------------------------------------------
@router.delete("/{item_id}")
def delete_archive_item(
    item_id: str,
    actor_id: str = Query(..., alias="actor_id"),
) -> Dict[str, Any]:
    _require_enabled()
    ok = archive_repo.soft_delete_archive_item(item_id=item_id, actor_id=actor_id)
    if not ok:
        raise HTTPException(status_code=404, detail="archive item not found")
    current = archive_repo.get_archive_item(item_id, deleted=True)
    return {"ok": True, "item": _attach_archive_urls(current)}
