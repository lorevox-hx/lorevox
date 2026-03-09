from __future__ import annotations

"""Media Router — LoreVox v4.2

Stores uploaded files + metadata.

MVP behavior
- Accepts multipart file uploads.
- Saves the file under DATA_DIR/media/<person_id>/<uuid>.<ext>
- Records a row in the media table.

EXIF extraction can be done client-side (your upload page already does) and
posted as exif_json, or added server-side later.
"""

import json
import mimetypes
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from ..db import add_media, list_media, get_person
from pathlib import Path
import os

DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()

router = APIRouter(prefix="/api/media", tags=["media"])


def _safe_ext(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext and len(ext) <= 10:
        return ext
    return ""


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

    media_root = Path(DATA_DIR) / "media" / person_id
    media_root.mkdir(parents=True, exist_ok=True)

    ext = _safe_ext(file.filename or "")
    # Create a deterministic-ish filename using the row id after insert; we insert first with placeholder,
    # then update path. Simpler: write with a temp uuid and store that path.
    import uuid

    fname = f"{uuid.uuid4().hex}{ext}"
    out_path = media_root / fname

    # Save stream
    with out_path.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    mime = file.content_type or mimetypes.guess_type(str(out_path))[0] or "application/octet-stream"

    exif_obj = None
    if exif_json:
        try:
            exif_obj = json.loads(exif_json)
        except Exception:
            exif_obj = {"raw": exif_json}

    media_id = add_media(
        person_id=person_id,
        file_path=str(out_path),
        mime_type=mime,
        description=description,
        taken_at=taken_at,
        location_name=location_name,
        latitude=latitude,
        longitude=longitude,
        exif=exif_obj,
    )

    return {"ok": True, "media_id": media_id, "file_path": str(out_path)}


@router.get("/list/{person_id}")
def get_media(person_id: str):
    if not get_person(person_id):
        raise HTTPException(status_code=404, detail="person not found")
    return {"ok": True, "items": list_media(person_id)}
