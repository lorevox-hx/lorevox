from fastapi import APIRouter
from pydantic import BaseModel
import sqlite3
import os
from pathlib import Path
from typing import Optional, Any, Dict
import json

router = APIRouter(prefix="/api/session", tags=["session-legacy"])

def _db_path() -> str:
    data_dir = Path(os.getenv("DATA_DIR", "data")).expanduser()
    db_name = os.getenv("DB_NAME", "lorevox.sqlite3")
    return str(data_dir / "db" / db_name)

class SessionPut(BaseModel):
    # UI often uses conv_id; your DB uses id
    conv_id: Optional[str] = None
    id: Optional[str] = None
    title: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    state: Optional[Dict[str, Any]] = None

@router.post("/put")
def put_session(payload: SessionPut):
    sid = payload.id or payload.conv_id
    if not sid:
        return {"ok": False, "error": "Missing id/conv_id"}

    dbp = _db_path()
    conn = sqlite3.connect(dbp)
    try:
        conn.execute(
            """
            INSERT INTO sessions(id, title, meta_json, state_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title=COALESCE(excluded.title, sessions.title),
              meta_json=COALESCE(excluded.meta_json, sessions.meta_json),
              state_json=COALESCE(excluded.state_json, sessions.state_json),
              updated_at=CURRENT_TIMESTAMP
            """,
            (
                sid,
                payload.title,
                json.dumps(payload.meta) if payload.meta is not None else None,
                json.dumps(payload.state) if payload.state is not None else None,
            ),
        )
        conn.commit()
        return {"ok": True, "id": sid}
    finally:
        conn.close()
