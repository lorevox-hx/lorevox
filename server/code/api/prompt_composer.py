"""Lorevox prompt composer.

This module centralizes how the *system prompt* is built so that BOTH:
- SSE chat (/api/chat/stream), and
- WebSocket chat (code/api/routers/chat_ws.py)
use the same behavioral tuning.

Design goals:
- UI stays "dumb": it can send a minimal system prompt and/or profile snapshot.
- Backend stays "smart": it always injects pinned RAG docs and stable role rules.
- Back-compat: works even when the UI does not provide profile/session context.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional, Tuple

from . import db

logger = logging.getLogger(__name__)


DEFAULT_CORE = (
    "You are Lorevox (\"Lori\"), a professional oral historian and memoir biographer. "
    "Your job is to help the speaker document their life story and family history through warm, specific questions. "
    "You are NOT a corporate recruiter, and you are not conducting a job interview. "
    "When the user is in a structured questionnaire, stay on the questionnaire and gently redirect off-topic replies back to the current question." 
)


_PROFILE_RE = re.compile(r"PROFILE_JSON\s*:\s*(\{.*\})\s*$", re.DOTALL)


def extract_profile_json_from_ui_system(ui_system: Optional[str]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Extract a trailing PROFILE_JSON:{...} blob (if present).

    Returns (profile_obj, base_system_without_profile_json).
    """
    if not ui_system:
        return None, None

    s = ui_system.strip()
    m = _PROFILE_RE.search(s)
    if not m:
        return None, s

    raw = m.group(1).strip()
    base = (s[: m.start()]).rstrip()  # remove the PROFILE_JSON line

    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            return obj, base
        logger.warning("prompt_composer: PROFILE_JSON parsed but is not a dict (type=%s) — ignoring", type(obj).__name__)
    except Exception as exc:
        logger.warning("prompt_composer: failed to parse PROFILE_JSON blob: %s — profile context dropped", exc)

    # If parse fails, keep original as base (no profile context injected)
    return None, s


def _safe_json(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return "{}"


def compose_system_prompt(
    conv_id: str,
    ui_system: Optional[str] = None,
    user_text: Optional[str] = None,
) -> str:
    """Compose the unified system prompt.

    conv_id: chat conversation id (used for session payload lookup).
    ui_system: system prompt sent by the UI (optional). If it includes PROFILE_JSON: {...}, we will strip and re-inject it in a structured way.
    user_text: latest user text (optional). Reserved for future dynamic RAG injection.
    """

    conv_id = (conv_id or "default").strip() or "default"

    # Ensure session exists (safe no-op if already present)
    try:
        db.ensure_session(conv_id)
    except Exception:
        # Don't let prompt composition fail the request.
        pass

    profile_obj, ui_base = extract_profile_json_from_ui_system(ui_system)

    # Session payload (if the UI uses /api/session/put)
    payload = {}
    try:
        payload = db.get_session_payload(conv_id) or {}
    except Exception:
        payload = {}

    # Pinned RAG docs
    pinned_parts = []
    try:
        manifesto = db.rag_get_doc_text("sys_oral_history_manifesto")
        if manifesto and manifesto.strip():
            pinned_parts.append("[ORAL_HISTORY_GUIDELINES]\n" + manifesto.strip())
    except Exception:
        pass

    try:
        golden = db.rag_get_doc_text("sys_golden_mock_standard")
        if golden and golden.strip():
            pinned_parts.append("[GOLDEN_MOCK]\n" + golden.strip())
    except Exception:
        pass

    pinned = "\n\n".join(pinned_parts).strip()

    # Prefer UI base prompt when present, but always anchor with DEFAULT_CORE.
    base = (ui_base or "").strip()
    if base:
        # If UI already contains a role declaration, we still prepend our stable core.
        system_head = DEFAULT_CORE + "\n\n" + base
    else:
        system_head = DEFAULT_CORE

    # Build a compact context JSON block.
    context: Dict[str, Any] = {}
    if payload:
        # Only include payload keys (no need to duplicate conv metadata)
        for k, v in payload.items():
            if k in ("conv_id", "title", "updated_at"):
                continue
            context[k] = v

    # Include PROFILE_JSON from UI if present.
    if profile_obj is not None:
        context.setdefault("ui_profile", profile_obj)

    # Optional: include user_text for future dynamic prompt policies.
    if user_text:
        context.setdefault("last_user_text", user_text[:800])

    ctx_block = ""
    if context:
        ctx_block = "PROFILE_JSON: " + _safe_json(context)

    parts = [system_head]
    if ctx_block:
        parts.append(ctx_block)
    if pinned:
        parts.append(pinned)

    return "\n\n".join([p for p in parts if p.strip()]).strip()
