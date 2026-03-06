from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..db import (
    new_conv_id,
    ensure_session,
    upsert_session,
    get_session_payload,
    list_sessions,
    export_turns,
    delete_session,
)

router = APIRouter(tags=["sessions"])


class PutSessionRequest(BaseModel):
    conv_id: str
    title: str = ""
    payload: Dict[str, Any] = {}


@router.get("/api/sessions/list")
def api_sessions_list(limit: int = 50):
    items = list_sessions(limit=limit)
    # Return BOTH keys so old/new UIs don’t break
    return {"items": items, "sessions": items}


@router.post("/api/session/new")
def api_session_new(title: str = ""):
    conv_id = new_conv_id()
    ensure_session(conv_id, title=title or "")
    payload = get_session_payload(conv_id) or {"conv_id": conv_id, "title": title or "", "updated_at": "", "payload": {}}
    return {"conv_id": conv_id, "session_id": conv_id, "title": payload.get("title", ""), "payload": payload}


@router.post("/api/session/put")
def api_session_put(req: PutSessionRequest):
    if not req.conv_id:
        raise HTTPException(status_code=400, detail="conv_id required")
    upsert_session(req.conv_id, req.title or "", req.payload or {})
    return {"ok": True, "conv_id": req.conv_id}


@router.get("/api/session/get")
def api_session_get(conv_id: str = Query(...)):
    # UI sometimes calls conv_id=undefined during boot
    if not conv_id or conv_id == "undefined":
        return {"conv_id": "", "title": "", "updated_at": "", "payload": {}}
    s = get_session_payload(conv_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"conv_id": conv_id, "title": s.get("title", ""), "updated_at": s.get("updated_at", ""), "payload": s}


@router.get("/api/session/turns")
def api_session_turns(conv_id: str = Query(...)):
    if not conv_id or conv_id == "undefined":
        return {"conv_id": conv_id, "items": [], "turns": []}
    items = export_turns(conv_id)
    # Return BOTH keys so old/new UIs don’t break
    return {"conv_id": conv_id, "items": items, "turns": items}


@router.delete("/api/session/delete")
def api_session_delete(conv_id: str = Query(...)):
    if not conv_id:
        raise HTTPException(status_code=400, detail="conv_id required")
    delete_session(conv_id)
    return {"ok": True}
