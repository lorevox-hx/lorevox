"""Lifecycle hooks for the Lorevox agent loop."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .policies import (
    build_write_plan_from_message,
    classify_message,
    should_run_rag,
    should_soften_tone,
)
from .skills import (
    skill_get_affect_context,
    skill_get_safety_context,
    skill_query_memory,
    skill_rag_search,
)


def before_llm(
    *,
    person_id: str,
    session_id: str,
    message: str,
    mode: str,
    section_id: Optional[str],
    recent_turns: List[Dict[str, Any]],
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """Gather compact context before the model runs."""
    message_meta = classify_message(message)

    recalled = skill_query_memory(
        person_id=person_id,
        query=message,
        section_id=section_id,
        limit=5,
    )
    affect_context = skill_get_affect_context(session_id=session_id)
    safety_context = skill_get_safety_context(session_id=session_id)

    retrieval = None
    if should_run_rag(message=message, message_meta=message_meta, recalled=recalled):
        retrieval = skill_rag_search(
            person_id=person_id,
            query=message,
            section_id=section_id,
            limit=5,
        )

    soften = should_soften_tone(
        affect_context=affect_context,
        safety_context=safety_context,
    )

    system_notes = [
        "Lorevox is archive-first: do not invent facts.",
        "Treat claims as claims until reviewed.",
    ]
    if soften:
        system_notes.append("Use gentler pacing and shorter follow-up phrasing.")

    return {
        "mode": mode,
        "section_id": section_id,
        "message_meta": message_meta,
        "recent_turns": recent_turns[-6:],
        "recalled_memories": recalled.get("items", []),
        "retrieval_snippets": (retrieval or {}).get("items", []),
        "affect_context": affect_context,
        "safety_context": safety_context,
        "system_notes": system_notes,
        "write_plan": build_write_plan_from_message(message=message, message_meta=message_meta),
        "metadata": metadata,
    }


def after_llm(
    *,
    person_id: str,
    session_id: str,
    message: str,
    llm_output: Dict[str, Any],
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """Normalize LLM outputs and prepare tool calls/write hints."""
    tool_calls = list(llm_output.get("tool_calls", []))
    intent = llm_output.get("intent")

    # Early deterministic expansion for v1.
    if not tool_calls and intent == "retrieve_then_answer":
        tool_calls.append(
            {
                "name": "rag_search",
                "args": {
                    "person_id": person_id,
                    "query": message,
                    "section_id": context.get("section_id"),
                    "limit": 5,
                },
            }
        )

    return {
        "tool_calls": tool_calls,
        "context": context,
        "write_plan": context.get("write_plan", []),
        "session_id": session_id,
    }


def after_tool(
    *,
    person_id: str,
    session_id: str,
    message: str,
    llm_output: Dict[str, Any],
    tool_results: List[Dict[str, Any]],
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """Integrate tool results and prepare richer post-turn context."""
    tool_summaries = [r.get("summary", "") for r in tool_results if r.get("summary")]
    assistant_text = llm_output.get("assistant_text", "")

    # In v1, we do not force a second model pass. We simply surface tool evidence
    # into context for reflection and future follow-ups.
    updated_context = dict(context)
    updated_context["tool_summaries"] = tool_summaries
    updated_context["tool_results"] = tool_results

    write_plan = list(context.get("write_plan", []))
    if tool_summaries:
        write_plan.append(
            {
                "kind": "session_note",
                "reason": "tool_result_summary",
                "text": " | ".join(tool_summaries)[:400],
            }
        )

    return {
        "assistant_text": assistant_text,
        "context": updated_context,
        "write_plan": write_plan,
        "person_id": person_id,
        "session_id": session_id,
        "message": message,
    }
