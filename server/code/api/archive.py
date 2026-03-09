"""
Lorevox Memory Archive
======================
Person-first, session-based transcript archive.

Layout on disk:
  DATA_DIR/memory/archive/people/<person_id>/
      index.json
      sessions/<session_id>/
          meta.json
          transcript.jsonl   ← append-only, one JSON object per line
          transcript.txt     ← human-readable, rebuilt on demand
          artifacts/
              audio/
              images/
              docs/

Rules enforced here:
  1. Original transcripts are NEVER overwritten (append-only JSONL).
  2. Every event carries a timestamp and session provenance.
  3. The index.json is updated whenever a new session starts.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Root path
# ---------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _safe_id(value: Optional[str], fallback: str) -> str:
    v = (value or "").strip()
    return v if v else fallback


# ---------------------------------------------------------------------------
# Directory helpers
# ---------------------------------------------------------------------------
def person_root(person_id: Optional[str]) -> Path:
    pid = _safe_id(person_id, "unknown_person")
    return DATA_DIR / "memory" / "archive" / "people" / pid


def session_root(person_id: Optional[str], session_id: str) -> Path:
    sid = _safe_id(session_id, "unknown_session")
    return person_root(person_id) / "sessions" / sid


# ---------------------------------------------------------------------------
# ensure_session  — call once at session start
# ---------------------------------------------------------------------------
def ensure_session(
    *,
    person_id: Optional[str],
    session_id: str,
    mode: str,
    title: str = "",
    started_at: Optional[str] = None,
    extra_meta: Optional[Dict[str, Any]] = None,
) -> Path:
    """
    Create the session directory tree and write meta.json (idempotent).
    Returns the session root path.
    """
    root = session_root(person_id, session_id)

    # Create artifact sub-dirs
    for sub in ("artifacts/audio", "artifacts/images", "artifacts/docs"):
        (root / sub).mkdir(parents=True, exist_ok=True)

    # Write meta.json only on first call
    meta_path = root / "meta.json"
    if not meta_path.exists():
        meta: Dict[str, Any] = {
            "person_id": _safe_id(person_id, "unknown_person"),
            "session_id": session_id,
            "mode": mode,
            "title": title or "",
            "started_at": started_at or _now_iso(),
            "created_at": _now_iso(),
        }
        if extra_meta:
            meta["extra"] = extra_meta
        meta_path.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # Ensure person index.json exists
    _ensure_person_index(person_id)

    # Register session in person index
    _register_session_in_index(
        person_id=person_id,
        session_id=session_id,
        title=title or "",
        mode=mode,
        started_at=started_at or _now_iso(),
    )

    return root


# ---------------------------------------------------------------------------
# append_event  — call for every user/assistant turn
# ---------------------------------------------------------------------------
def append_event(
    *,
    person_id: Optional[str],
    session_id: str,
    role: str,
    content: str,
    ts: Optional[str] = None,
    question_id: Optional[str] = None,
    section_id: Optional[str] = None,
    anchor_id: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Append a single event to transcript.jsonl (append-only — never rewrites).
    """
    root = session_root(person_id, session_id)
    root.mkdir(parents=True, exist_ok=True)

    event: Dict[str, Any] = {
        "ts": ts or _now_iso(),
        "role": (role or "").strip().lower(),
        "content": content or "",
    }
    if question_id:
        event["question_id"] = question_id
    if section_id:
        event["section_id"] = section_id
    if anchor_id:
        event["anchor_id"] = anchor_id
    if meta:
        event["meta"] = meta

    jsonl_path = root / "transcript.jsonl"
    with jsonl_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# rebuild_txt  — regenerate human-readable transcript
# ---------------------------------------------------------------------------
def rebuild_txt(*, person_id: Optional[str], session_id: str) -> None:
    """
    Rebuild transcript.txt from transcript.jsonl.
    Safe to call repeatedly — always regenerates from source.
    """
    root = session_root(person_id, session_id)
    jsonl_path = root / "transcript.jsonl"
    if not jsonl_path.exists():
        return

    out_lines: List[str] = []
    for raw in jsonl_path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            ev = json.loads(raw)
        except Exception:
            continue
        role = (ev.get("role") or "").upper()
        ts = ev.get("ts") or ""
        content = (ev.get("content") or "").strip()
        qid = ev.get("question_id", "")
        sid = ev.get("section_id", "")

        prefix = f"[{ts}] {role}"
        if sid:
            prefix += f" [{sid}]"
        if qid:
            prefix += f" (q:{qid})"
        out_lines.append(f"{prefix}:\n{content}")

    (root / "transcript.txt").write_text(
        "\n\n".join(out_lines) + "\n", encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# read_transcript  — load all events for a session
# ---------------------------------------------------------------------------
def read_transcript(
    *, person_id: Optional[str], session_id: str
) -> List[Dict[str, Any]]:
    """Return all transcript events for a session as a list of dicts."""
    root = session_root(person_id, session_id)
    jsonl_path = root / "transcript.jsonl"
    if not jsonl_path.exists():
        return []
    events: List[Dict[str, Any]] = []
    for raw in jsonl_path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            events.append(json.loads(raw))
        except Exception:
            continue
    return events


# ---------------------------------------------------------------------------
# list_sessions  — enumerate sessions for a person
# ---------------------------------------------------------------------------
def list_sessions(person_id: Optional[str]) -> List[Dict[str, Any]]:
    """Return session summaries from person index.json."""
    index_path = person_root(person_id) / "index.json"
    if not index_path.exists():
        return []
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
        return data.get("sessions", [])
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _ensure_person_index(person_id: Optional[str]) -> None:
    pid = _safe_id(person_id, "unknown_person")
    index_path = person_root(person_id) / "index.json"
    if not index_path.exists():
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text(
            json.dumps(
                {"person_id": pid, "sessions": []},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )


def _register_session_in_index(
    *,
    person_id: Optional[str],
    session_id: str,
    title: str,
    mode: str,
    started_at: str,
) -> None:
    index_path = person_root(person_id) / "index.json"
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        data = {"person_id": _safe_id(person_id, "unknown_person"), "sessions": []}

    sessions: List[Dict[str, Any]] = data.get("sessions") or []

    # Avoid duplicates
    existing_ids = {s.get("session_id") for s in sessions}
    if session_id not in existing_ids:
        sessions.append(
            {
                "session_id": session_id,
                "title": title,
                "mode": mode,
                "started_at": started_at,
            }
        )
        data["sessions"] = sessions
        index_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
