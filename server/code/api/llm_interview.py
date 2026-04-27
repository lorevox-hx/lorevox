"""Lorevox interview LLM helpers.

Synchronous helpers for:
- end-of-section summaries (mini memoir drafts)
- follow-up questions after the base plan is complete
- a final memoir draft at the end

This reuses the same local model pipeline as /api/chat by calling the internal
chat() function in code.api.api.

If Lorevox is started in TTS-only mode (USE_TTS=1), importing the LLM stack
raises; these helpers then return safe fallbacks (None / empty lists).
"""

from __future__ import annotations

import json
import os
import re
from typing import List, Optional

# WO-10M: Summary / memoir token cap is launcher-tunable via env var.
# Used by draft_section_summary() and draft_final_memoir(). Extraction has
# its own env var (MAX_NEW_TOKENS_EXTRACT) handled in routers/extract.py.
_WO10M_SUMMARY_CAP = int(os.getenv("MAX_NEW_TOKENS_SUMMARY", "1024"))


def _try_call_llm(system_prompt: str, user_prompt: str, *, max_new: int, temp: float, top_p: float, conv_id: Optional[str] = None) -> Optional[str]:
    """Return model text, or None if the LLM stack is unavailable.

    FIX-3: Accept optional conv_id to isolate extraction calls from shared
    session context. When conv_id is None, falls back to 'default' (legacy).
    Extraction callers should pass a unique ephemeral conv_id to prevent
    cross-narrator context contamination.
    """
    import logging
    logger = logging.getLogger("lorevox.llm")
    # P1: Global temperature safety gate — clamp to minimum safe value.
    # This is the single choke point for ALL LLM calls via this wrapper.
    # chat()/chat_stream()/chat_ws all have their own guards too, but this
    # catches any caller that might pass temp=0 before it reaches generate().
    if temp <= 0:
        logger.warning("[llm] temp=%s clamped to 0.01 (greedy-safe minimum)", temp)
        temp = 0.01
    try:
        # Local import so the server can still boot in USE_TTS=1 mode.
        from .api import chat, _ChatReq  # type: ignore

        req = _ChatReq(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temp=temp,
            top_p=top_p,
            max_new=max_new,
            conv_id=conv_id,
        )
        out = chat(req)
        txt = (out.get("text") or "").strip()
        if not txt:
            logger.warning("[llm] LLM returned empty text for extraction request")
        return txt or None
    except ImportError as e:
        logger.warning("[llm] LLM stack not available (import failed): %s", e)
        return None
    except Exception as e:
        logger.error("[llm] LLM call failed: %s: %s", type(e).__name__, e)
        return None


def draft_section_summary(
    *,
    section_title: str,
    instruction: str,
    transcript: str,
    person_name: str = "the speaker",
    pronouns: str = "",
    max_new: Optional[int] = None,
) -> Optional[str]:
    # WO-10M: Honor MAX_NEW_TOKENS_SUMMARY when caller doesn't override.
    if max_new is None:
        max_new = _WO10M_SUMMARY_CAP
    """Draft a short end-of-section narrative summary."""
    transcript = (transcript or "").strip()
    if not transcript:
        return None

    pronoun_note = f" Use {pronouns} pronouns for this person." if pronouns else ""
    system = (
        "You are Lori, a warm, neutral, professional oral historian. "
        "You help turn interview answers into accurate memoir drafts. "
        f"Rules: do not invent facts; do not correct the speaker; keep the tone respectful and clear.{pronoun_note}"
    )

    user = (
        f"Section title: {section_title}\n"
        f"Instruction: {instruction}\n\n"
        f"Transcript (Q&A):\n{transcript}\n\n"
        "Write a cohesive, first-person narrative summary (1–3 short paragraphs) "
        f"as if {person_name} is speaking. "
        "Preserve the speaker's phrasing when possible. "
        "If details are missing, stay general rather than guessing."
    )

    return _try_call_llm(system, user, max_new=max_new, temp=0.45, top_p=0.9)


def propose_followup_questions(
    *,
    transcript: str,
    n: int = 5,
    max_new: int = 280,
) -> List[str]:
    """Ask the LLM for follow-up questions. Returns a list (possibly empty)."""
    transcript = (transcript or "").strip()
    if not transcript:
        return []

    system = (
        "You are Lori, a warm, neutral, professional oral historian. "
        "You generate helpful follow-up interview questions. "
        "Rules: one question at a time; neutral; do not assume facts; focus on clarifying dates, names, places, and vivid details."
    )

    user = (
        f"Based on the transcript below, propose {n} follow-up questions to deepen the story.\n"
        "Return ONLY a JSON array of strings (no markdown, no commentary).\n\n"
        f"Transcript:\n{transcript}"
    )

    txt = _try_call_llm(system, user, max_new=max_new, temp=0.65, top_p=0.95)
    if not txt:
        return []

    # Try strict JSON first.
    try:
        arr = json.loads(txt)
        if isinstance(arr, list):
            out = [str(x).strip() for x in arr]
            out = [q for q in out if q]
            return out[:n]
    except Exception:
        pass

    # Fallback: parse lines.
    lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
    qs: List[str] = []
    for ln in lines:
        ln = re.sub(r"^[\-\*\d\.)\s]+", "", ln).strip()
        if not ln:
            continue
        qs.append(ln)

    # De-dup preserve order.
    seen = set()
    uniq: List[str] = []
    for q in qs:
        k = q.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(q)
    return uniq[:n]


def draft_final_memoir(
    *,
    transcript: str,
    person_name: str,
    pronouns: str = "",
    max_new: Optional[int] = None,
) -> Optional[str]:
    """Draft a short memoir from the full transcript."""
    # WO-10M: Honor MAX_NEW_TOKENS_SUMMARY when caller doesn't override.
    if max_new is None:
        max_new = _WO10M_SUMMARY_CAP
    transcript = (transcript or "").strip()
    if not transcript:
        return None

    pronoun_note = f" Use {pronouns} pronouns for this person." if pronouns else ""
    system = (
        "You are Lori, a warm, neutral, professional oral historian and memoir biographer. "
        "You write accurate memoir drafts from interviews. "
        f"Rules: do not invent facts; do not correct the speaker; keep it readable; use first person as the speaker.{pronoun_note}"
    )

    user = (
        f"Write a memoir-style draft in first person for {person_name}.\n"
        "Length: ~500–900 words.\n"
        "Structure: 5–9 short paragraphs, chronological where possible.\n"
        "Only use details explicitly present in the transcript; if something is missing, do not guess.\n\n"
        f"Transcript:\n{transcript}"
    )

    return _try_call_llm(system, user, max_new=max_new, temp=0.55, top_p=0.95)
