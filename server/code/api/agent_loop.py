"""Lorevox agent loop (minimal v1 scaffold).

This module adds an OpenClaw-style behavioral loop to Lorevox without changing
Lorevox's truth model.

Key principle:
- raw archive stays immutable
- history-affecting writes become candidates or review items
- memoir remains downstream of reviewed history
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .hooks import after_llm, after_tool, before_llm
from .reflection import run_reflection
from .skills import execute_tool_calls


@dataclass
class AgentTurnInput:
    person_id: str
    session_id: str
    message: str
    mode: str = "interview"
    section_id: Optional[str] = None
    recent_turns: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentTurnResult:
    assistant_text: str
    context: Dict[str, Any] = field(default_factory=dict)
    tool_results: List[Dict[str, Any]] = field(default_factory=list)
    reflection: Dict[str, Any] = field(default_factory=dict)
    write_plan: List[Dict[str, Any]] = field(default_factory=list)


class AgentLoop:
    """Single-turn orchestration for Lorevox.

    This class intentionally keeps the first implementation narrow and explicit.
    Swap in the real LLM runner and real skill implementations incrementally.
    """

    def __init__(self, llm_runner):
        self.llm_runner = llm_runner

    def process_turn(self, turn: AgentTurnInput) -> AgentTurnResult:
        context = before_llm(
            person_id=turn.person_id,
            session_id=turn.session_id,
            message=turn.message,
            mode=turn.mode,
            section_id=turn.section_id,
            recent_turns=turn.recent_turns,
            metadata=turn.metadata,
        )

        llm_output = self.llm_runner(
            person_id=turn.person_id,
            session_id=turn.session_id,
            message=turn.message,
            context=context,
        )
        llm_output = _normalize_llm_output(llm_output)

        post_llm = after_llm(
            person_id=turn.person_id,
            session_id=turn.session_id,
            message=turn.message,
            llm_output=llm_output,
            context=context,
        )

        tool_results = execute_tool_calls(
            person_id=turn.person_id,
            session_id=turn.session_id,
            tool_calls=post_llm.get("tool_calls", []),
            context=post_llm.get("context", context),
        )

        post_tool = after_tool(
            person_id=turn.person_id,
            session_id=turn.session_id,
            message=turn.message,
            llm_output=llm_output,
            tool_results=tool_results,
            context=post_llm.get("context", context),
        )

        reflection = run_reflection(
            person_id=turn.person_id,
            session_id=turn.session_id,
            message=turn.message,
            llm_output=llm_output,
            tool_results=tool_results,
            context=post_tool.get("context", post_llm.get("context", context)),
            write_plan=post_tool.get("write_plan", []),
        )

        write_plan = []
        write_plan.extend(post_llm.get("write_plan", []))
        write_plan.extend(post_tool.get("write_plan", []))
        write_plan.extend(reflection.get("write_plan", []))

        assistant_text = post_tool.get("assistant_text") or llm_output.get("assistant_text", "")

        return AgentTurnResult(
            assistant_text=assistant_text,
            context=post_tool.get("context", post_llm.get("context", context)),
            tool_results=tool_results,
            reflection=reflection,
            write_plan=write_plan,
        )


def _normalize_llm_output(raw: Any) -> Dict[str, Any]:
    """Make early LLM integration forgiving.

    Accepts either:
    - plain string
    - dict-like structured output
    """
    if isinstance(raw, str):
        return {
            "assistant_text": raw,
            "tool_calls": [],
            "intent": "follow_up_question",
            "reasoning_notes": [],
        }

    if isinstance(raw, dict):
        return {
            "assistant_text": raw.get("assistant_text", ""),
            "tool_calls": raw.get("tool_calls", []),
            "intent": raw.get("intent", "follow_up_question"),
            "reasoning_notes": raw.get("reasoning_notes", []),
        }

    return {
        "assistant_text": str(raw),
        "tool_calls": [],
        "intent": "follow_up_question",
        "reasoning_notes": [],
    }
