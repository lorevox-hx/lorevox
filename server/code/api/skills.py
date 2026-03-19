"""Agent-facing skill wrappers for Lorevox.

This version is wired to real Lorevox surfaces where they already exist:
- timeline list/add
- affect context
- safety segment flags (used to derive safety context)

It keeps memory/RAG/TTS/Whisper adapters pluggable so the agent loop can start
using real data now without forcing a big-bang backend rewrite.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LOREVOX_API_ORIGIN = os.getenv("LOREVOX_API_ORIGIN", "http://localhost:8000").rstrip("/")
LOREVOX_TTS_ORIGIN = os.getenv("LOREVOX_TTS_ORIGIN", "http://localhost:8001").rstrip("/")
HTTP_TIMEOUT = float(os.getenv("LOREVOX_HTTP_TIMEOUT", "8.0"))

API = {
    "TIMELINE_LIST": f"{LOREVOX_API_ORIGIN}/api/timeline/list",
    "TIMELINE_ADD": f"{LOREVOX_API_ORIGIN}/api/timeline/add",
    "AFFECT_CONTEXT": f"{LOREVOX_API_ORIGIN}/api/interview/affect-context",
    "SEGMENT_FLAGS": f"{LOREVOX_API_ORIGIN}/api/interview/segment-flags",
    "TTS_VOICES": f"{LOREVOX_TTS_ORIGIN}/api/tts/voices",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ok(name: str, data: Any, summary: str, **extra: Any) -> Dict[str, Any]:
    out = {"ok": True, "name": name, "data": data, "summary": summary}
    out.update(extra)
    return out


def _err(name: str, summary: str, **extra: Any) -> Dict[str, Any]:
    return {"ok": False, "name": name, "data": extra or {}, "summary": summary}


def _get_json(url: str, *, params: Optional[Dict[str, Any]] = None) -> Any:
    res = requests.get(url, params=params or {}, timeout=HTTP_TIMEOUT)
    res.raise_for_status()
    return res.json()


def _post_json(url: str, payload: Dict[str, Any]) -> Any:
    res = requests.post(url, json=payload, timeout=HTTP_TIMEOUT)
    res.raise_for_status()
    return res.json()


def _first_present(d: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _safe_items(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("items", "results", "events", "rows", "data"):
            val = payload.get(key)
            if isinstance(val, list):
                return [x for x in val if isinstance(x, dict)]
    return []


# ---------------------------------------------------------------------------
# Optional direct adapters
# ---------------------------------------------------------------------------

def _try_direct_memory_query(person_id: str, query: str, section_id: str | None, limit: int) -> List[Dict[str, Any]]:
    """
    Try a direct in-process Lorevox memory/RAG adapter if one exists.
    Keep this intentionally forgiving so the agent loop can land before the
    storage module stabilizes.
    """
    try:
        # Replace this with your real retrieval function if different.
        from code.api.api import rag_search
        result = rag_search(person_id=person_id, query=query, k=limit)
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return _safe_items(result)
    except Exception:
        pass
    return []


def _try_direct_memory_write(
    person_id: str,
    text: str,
    kind: str,
    importance: float,
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    # Conservative for now: candidate-only until you wire real review/history write path.
    return {
        "person_id": person_id,
        "text": text,
        "kind": kind,
        "importance": importance,
        "tags": tags or [],
        "status": "candidate_only",
    }


# ---------------------------------------------------------------------------
# Core execution
# ---------------------------------------------------------------------------

def execute_tool_calls(
    *,
    person_id: str,
    session_id: str,
    tool_calls: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for call in tool_calls:
        name = call.get("name")
        args = dict(call.get("args", {}))
        args.setdefault("person_id", person_id)
        args.setdefault("session_id", session_id)
        args.setdefault("context", context)

        fn = _SKILL_REGISTRY.get(name)
        if not fn:
            results.append(_err(name or "unknown", f"Unknown skill: {name}"))
            continue

        try:
            data = fn(**args)
            if isinstance(data, dict) and {"ok", "name", "data", "summary"}.issubset(data.keys()):
                results.append(data)
            else:
                results.append(_ok(name, data, f"Skill {name} executed."))
        except Exception as exc:
            results.append(_err(name or "unknown", f"Skill {name} failed.", error=str(exc)))
    return results


# ---------------------------------------------------------------------------
# Memory / retrieval
# ---------------------------------------------------------------------------

def skill_query_memory(
    *,
    person_id: str,
    query: str,
    section_id: str | None = None,
    limit: int = 5,
    **_: Any,
) -> Dict[str, Any]:
    items = _try_direct_memory_query(person_id=person_id, query=query, section_id=section_id, limit=limit)
    return _ok(
        "query_memory",
        {"person_id": person_id, "query": query, "section_id": section_id, "limit": limit},
        "Queried Lorevox memory/retrieval layer.",
        items=items,
    )


def skill_rag_search(
    *,
    person_id: str,
    query: str,
    section_id: str | None = None,
    limit: int = 5,
    **_: Any,
) -> Dict[str, Any]:
    items = _try_direct_memory_query(person_id=person_id, query=query, section_id=section_id, limit=limit)
    return _ok(
        "rag_search",
        {"person_id": person_id, "query": query, "section_id": section_id, "limit": limit},
        "Ran Lorevox retrieval search.",
        items=items,
    )


def skill_write_memory(
    *,
    person_id: str,
    text: str,
    kind: str = "session",
    importance: float = 0.5,
    tags: Optional[List[str]] = None,
    **_: Any,
) -> Dict[str, Any]:
    data = _try_direct_memory_write(
        person_id=person_id,
        text=text,
        kind=kind,
        importance=importance,
        tags=tags,
    )
    return _ok("write_memory", data, f"Prepared {kind} memory write.")


# ---------------------------------------------------------------------------
# Timeline: real Lorevox endpoints
# ---------------------------------------------------------------------------

def skill_get_timeline_context(
    *,
    person_id: str,
    limit: int = 12,
    **_: Any,
) -> Dict[str, Any]:
    payload = _get_json(API["TIMELINE_LIST"], params={"person_id": person_id})
    items = _safe_items(payload)[:limit]

    compact = []
    for row in items:
        compact.append(
            {
                "event_id": _first_present(row, "event_id", "id"),
                "title": _first_present(row, "title", "label", "name"),
                "display_date": _first_present(row, "display_date", "date_text", "date"),
                "event_type": _first_present(row, "event_type", "type"),
                "confidence": _first_present(row, "confidence"),
            }
        )

    return _ok(
        "get_timeline_context",
        {"person_id": person_id, "limit": limit},
        f"Loaded {len(compact)} timeline item(s).",
        items=compact,
    )


def skill_write_timeline_suggestion(
    *,
    person_id: str,
    title: str,
    date_text: str | None = None,
    confidence: float = 0.5,
    notes: str | None = None,
    **_: Any,
) -> Dict[str, Any]:
    payload = {
        "person_id": person_id,
        "title": title,
        "display_date": date_text or "",
        "confidence": confidence,
        "notes": notes or "agent_loop_candidate",
    }
    result = _post_json(API["TIMELINE_ADD"], payload)
    return _ok(
        "write_timeline_suggestion",
        result,
        "Wrote timeline suggestion through Lorevox timeline endpoint.",
    )


# ---------------------------------------------------------------------------
# Safety / affect: real Lorevox endpoints + derived context
# ---------------------------------------------------------------------------

def skill_get_affect_context(
    *,
    session_id: str,
    **_: Any,
) -> Dict[str, Any]:
    payload = _get_json(API["AFFECT_CONTEXT"], params={"session_id": session_id})

    data = {
        "session_id": session_id,
        "recent_state": _first_present(payload, "recent_state", "affect_state", "state"),
        "confidence": _first_present(payload, "confidence", "affect_confidence"),
        "soft_signal": bool(_first_present(payload, "soft_signal", default=False)),
        "raw": payload,
    }
    return _ok("get_affect_context", data, "Loaded affect context.", **data)


def skill_get_safety_context(
    *,
    session_id: str,
    **_: Any,
) -> Dict[str, Any]:
    payload = _get_json(API["SEGMENT_FLAGS"], params={"session_id": session_id})
    items = _safe_items(payload)

    categories = []
    excluded_from_memoir = 0
    for row in items:
        cat = row.get("category")
        if cat:
            categories.append(cat)
        if row.get("includedInMemoir") is False:
            excluded_from_memoir += 1

    recent_categories = sorted(set(categories))
    softened_mode = any(
        c in {
            "suicidal_ideation",
            "distress",
            "distress_call",
            "sexual_abuse",
            "child_abuse",
            "domestic_abuse",
            "physical_abuse",
            "caregiver_abuse",
            "cognitive_distress",
        }
        for c in recent_categories
    )

    data = {
        "session_id": session_id,
        "softened_mode": softened_mode,
        "recent_categories": recent_categories,
        "private_segment_count": len(items),
        "excluded_from_memoir_count": excluded_from_memoir,
        "raw": items[:10],
    }
    return _ok("get_safety_context", data, "Derived safety context from segment flags.", **data)


# ---------------------------------------------------------------------------
# Review / claim candidates
# ---------------------------------------------------------------------------

def skill_write_claim_candidate(
    *,
    person_id: str,
    statement: str,
    fact_type: str | None = None,
    date_text: str | None = None,
    **_: Any,
) -> Dict[str, Any]:
    data = {
        "person_id": person_id,
        "statement": statement,
        "fact_type": fact_type,
        "date_text": date_text,
        "status": "candidate_only",
    }
    return _ok("write_claim_candidate", data, "Prepared claim candidate.")


def skill_write_review_item(
    *,
    person_id: str,
    suggestion: str,
    item_type: str = "memory_suggestion",
    confidence: float = 0.5,
    **_: Any,
) -> Dict[str, Any]:
    data = {
        "person_id": person_id,
        "suggestion": suggestion,
        "item_type": item_type,
        "confidence": confidence,
        "status": "candidate_only",
    }
    return _ok("write_review_item", data, "Prepared review item.")


# ---------------------------------------------------------------------------
# Media wrappers
# ---------------------------------------------------------------------------

def skill_tts(*, text: str, voice: str | None = None, **_: Any) -> Dict[str, Any]:
    return _ok("tts", {"text": text, "voice": voice}, "Prepared TTS request.")


def skill_whisper(*, audio_path: str, **_: Any) -> Dict[str, Any]:
    return _ok("whisper", {"audio_path": audio_path}, "Prepared whisper transcription request.")


_SKILL_REGISTRY = {
    "query_memory": skill_query_memory,
    "write_memory": skill_write_memory,
    "rag_search": skill_rag_search,
    "get_timeline_context": skill_get_timeline_context,
    "write_claim_candidate": skill_write_claim_candidate,
    "write_review_item": skill_write_review_item,
    "write_timeline_suggestion": skill_write_timeline_suggestion,
    "get_affect_context": skill_get_affect_context,
    "get_safety_context": skill_get_safety_context,
    "tts": skill_tts,
    "whisper": skill_whisper,
}