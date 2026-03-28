from __future__ import annotations

"""Media Router — LoreVox 8.0

Bug MB-01 fix: router now matches db.py add_media() signature.

Endpoints:
  POST   /api/media/upload                — multipart upload
  GET    /api/media/list/{person_id}      — list photos for a narrator
  GET    /api/media/file/{media_id}       — serve the raw image bytes
  DELETE /api/media/{media_id}            — delete photo + file from disk
  POST   /api/media/attach                — attach photo to memoir section or fact
  DELETE /api/media/attach/{attach_id}    — remove an attachment
  GET    /api/media/attachments           — list attachments (?person_id= or ?media_id=)
"""

import hashlib
import json
import mimetypes
import os
import uuid
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..db import (
    add_media, list_media, get_media_item, delete_media,
    add_media_attachment, delete_media_attachment, list_media_attachments,
    get_person,
)

DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()

router = APIRouter(prefix="/api/media", tags=["media"])

# Allowed image MIME types
_ALLOWED_MIME_PREFIXES = ("image/jpeg", "image/png", "image/webp", "image/heic",
                          "image/heif", "image/gif", "image/bmp", "image/tiff")


def _safe_ext(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return ext if (ext and len(ext) <= 10) else ""


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_media(
    person_id: str = Form(...),
    description: str = Form(""),
    taken_at: Optional[str] = Form(None),
    location_name: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    exif_json: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")

    mime = file.content_type or ""
    if not any(mime.startswith(p) for p in _ALLOWED_MIME_PREFIXES):
        # Fallback: guess from filename
        guessed = mimetypes.guess_type(file.filename or "")[0] or ""
        if not any(guessed.startswith(p) for p in _ALLOWED_MIME_PREFIXES):
            raise HTTPException(status_code=415, detail=f"Unsupported media type: {mime or guessed or 'unknown'}")
        mime = guessed

    media_root = DATA_DIR / "media" / person_id
    media_root.mkdir(parents=True, exist_ok=True)

    fname = f"{uuid.uuid4().hex}{_safe_ext(file.filename or '')}"
    out_path = media_root / fname

    # Stream to disk
    size = 0
    with out_path.open("wb") as fout:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            fout.write(chunk)
            size += len(chunk)

    sha = _sha256_file(out_path)

    exif_obj: Optional[dict] = None
    if exif_json:
        try:
            exif_obj = json.loads(exif_json)
        except Exception:
            exif_obj = {"raw": exif_json}

    row = add_media(
        person_id=person_id,
        filename=str(out_path),   # store full absolute path for serve endpoint
        mime=mime,
        bytes=size,
        sha256=sha,
        kind="image",
        description=description,
        taken_at=taken_at,
        location_name=location_name,
        latitude=latitude,
        longitude=longitude,
        exif=exif_obj,
    )

    return {"ok": True, "media_id": row["id"], "filename": fname, "bytes": size}


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/list/{person_id}")
def get_media_list(person_id: str, limit: int = 200, offset: int = 0):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")
    items = list_media(person_id=person_id, limit=limit, offset=offset)
    # Attach a browser-accessible URL to each item
    for item in items:
        item["url"] = f"/api/media/file/{item['id']}"
    return {"ok": True, "items": items}


# ── Serve file ────────────────────────────────────────────────────────────────

@router.get("/file/{media_id}")
def serve_media_file(media_id: str):
    item = get_media_item(media_id)
    if not item:
        raise HTTPException(status_code=404, detail="media not found")
    file_path = Path(item["filename"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="file not found on disk")
    return FileResponse(
        path=str(file_path),
        media_type=item["mime"],
        filename=file_path.name,
    )


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{media_id}")
def remove_media(media_id: str):
    item = get_media_item(media_id)
    if not item:
        raise HTTPException(status_code=404, detail="media not found")
    # Delete file from disk (best-effort)
    try:
        Path(item["filename"]).unlink(missing_ok=True)
    except Exception:
        pass
    deleted = delete_media(media_id)
    return {"ok": deleted}


# ── Attachments ───────────────────────────────────────────────────────────────

class AttachRequest(BaseModel):
    media_id: str
    entity_type: str = Field(default="memoir_section",
                              description="'memoir_section' or 'fact'")
    entity_id: str = Field(description="section key (e.g. 'turning_points') or fact id")
    person_id: Optional[str] = None


@router.post("/attach")
def attach_media(req: AttachRequest):
    item = get_media_item(req.media_id)
    if not item:
        raise HTTPException(status_code=404, detail="media not found")
    row = add_media_attachment(
        media_id=req.media_id,
        entity_type=req.entity_type,
        entity_id=req.entity_id,
        person_id=req.person_id,
    )
    return {"ok": True, "attachment": row}


@router.delete("/attach/{attach_id}")
def remove_attachment(attach_id: str):
    deleted = delete_media_attachment(attach_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="attachment not found")
    return {"ok": True}


@router.get("/attachments")
def get_attachments(
    person_id: Optional[str] = Query(default=None),
    media_id: Optional[str] = Query(default=None),
):
    rows = list_media_attachments(person_id=person_id, media_id=media_id)
    return {"ok": True, "items": rows}
