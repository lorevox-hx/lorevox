from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)
_LV_DEBUG = os.getenv("LV_DEV_MODE", "0") in ("1", "true", "True")

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from transformers import TextIteratorStreamer, StoppingCriteriaList

from ..db import export_turns, persist_turn_transaction
from ..api import _load_model, _apply_chat_template, StopOnEvent, _normalize_role
from ..prompt_composer import compose_system_prompt
from ..archive import (
    ensure_session as archive_ensure_session,
    append_event as archive_append_event,
    rebuild_txt as archive_rebuild_txt,
)

router = APIRouter(prefix="/api/chat", tags=["chat-ws"])


async def _ws_send(ws: WebSocket, obj: Dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(obj, ensure_ascii=False))
    except Exception:
        pass


@router.websocket("/ws")
async def ws_chat(ws: WebSocket):
    await ws.accept()
    await _ws_send(ws, {"type": "status", "state": "connected"})

    ev = threading.Event()
    current_task: Optional[asyncio.Task] = None

    async def generate_and_stream(conv_id: str, user_text: str, params: Dict[str, Any]) -> None:
        # Extract person_id from params (sent by UI)
        person_id: Optional[str] = params.get("person_id") or None

        # Memory Archive — ensure session exists and log user message
        if person_id:
            archive_ensure_session(
                person_id=person_id,
                session_id=conv_id,
                mode="chat_ws",
                title="Chat (WS)",
                extra_meta={"ws": True},
            )
            archive_append_event(
                person_id=person_id,
                session_id=conv_id,
                role="user",
                content=user_text,
                meta={"ws": True},
            )

        # Load once per process (api.py caches globals)
        model, tok = _load_model()

        # Build prompt from DB history + user turn (with unified system prompt)
        history = export_turns(conv_id)
        # v7.1: extract runtime context forwarded from UI on every start_turn
        runtime71: Dict[str, Any] = params.get("runtime71") or {}
        system_prompt = compose_system_prompt(conv_id, ui_system=None, user_text=user_text, runtime71=runtime71)

        # ── Debug logging ───────────────────────────────────────────────
        # Always log a compact runtime summary at INFO level.
        rt_summary = (
            f"pass={runtime71.get('current_pass','?')} "
            f"era={runtime71.get('current_era','?')} "
            f"mode={runtime71.get('current_mode','?')} "
            f"affect={runtime71.get('affect_state','?')} "
            f"fatigue={runtime71.get('fatigue_score','?')} "
            f"cog={runtime71.get('cognitive_mode','?')}"
        ) if runtime71 else "(no runtime71)"
        logger.info("[chat_ws] turn: conv=%s | %s", conv_id, rt_summary)

        # When LV_DEV_MODE=1, also log the full system prompt so you can
        # see exactly what the model receives.
        if _LV_DEBUG:
            sep = "─" * 60
            logger.info(
                "[chat_ws] SYSTEM PROMPT ↓\n%s\n%s\n%s",
                sep, system_prompt, sep
            )
        # ────────────────────────────────────────────────────────────────

        msgs: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        msgs.extend(
            [
                {"role": _normalize_role(m["role"]), "content": m["content"]}
                for m in history
                if _normalize_role(m.get("role", "")) != "system"
            ]
        )
        msgs.append({"role": "user", "content": user_text})
        prompt = _apply_chat_template(msgs)

        # Prep generation
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)

        ev.clear()
        stop = StoppingCriteriaList([StopOnEvent(ev)])

        max_new = int(params.get("max_new_tokens", params.get("max_new", 512)))
        temperature = float(params.get("temperature", params.get("temp", 0.8)))
        top_p = float(params.get("top_p", 0.95))

        await _ws_send(ws, {"type": "status", "state": "generating"})

        th = threading.Thread(
            target=model.generate,
            kwargs=dict(
                **inputs,
                streamer=streamer,
                max_new_tokens=max_new,
                temperature=temperature,
                top_p=top_p,
                do_sample=True,
                repetition_penalty=1.1,
                stopping_criteria=stop,
                pad_token_id=tok.eos_token_id,
                eos_token_id=tok.eos_token_id,
            ),
            daemon=True,
        )
        th.start()

        reply_parts: List[str] = []

        def _next_chunk():
            try:
                return next(streamer)
            except StopIteration:
                return None

        while True:
            if ev.is_set():
                break

            chunk = await asyncio.to_thread(_next_chunk)
            if chunk is None:
                break
            if not chunk:
                continue

            reply_parts.append(chunk)
            await _ws_send(ws, {"type": "token", "delta": chunk})

        final_text = "".join(reply_parts).strip()

        persist_turn_transaction(
            conv_id=conv_id,
            user_message=user_text,
            assistant_message=final_text,
            model_name="local-llm-ws",
            meta={"ws": True, "cancelled": ev.is_set()},
        )

        # Memory Archive — log assistant reply + rebuild transcript
        if person_id:
            archive_append_event(
                person_id=person_id,
                session_id=conv_id,
                role="assistant",
                content=final_text,
                meta={"ws": True, "cancelled": ev.is_set()},
            )
            archive_rebuild_txt(person_id=person_id, session_id=conv_id)

        await _ws_send(ws, {"type": "done", "final_text": final_text})

    try:
        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")

            if msg_type == "start_turn":
                conv_id = msg.get("session_id") or msg.get("conv_id") or "default"
                user_text = msg.get("message") or ""
                params = msg.get("params") or {}

                # cancel any in-flight turn on this socket
                ev.set()
                if current_task and not current_task.done():
                    current_task.cancel()

                ev.clear()
                current_task = asyncio.create_task(generate_and_stream(conv_id, user_text, params))

            elif msg_type == "cancel_turn":
                ev.set()
                await _ws_send(ws, {"type": "status", "state": "cancelled"})

            elif msg_type == "ping":
                await _ws_send(ws, {"type": "pong"})

            else:
                await _ws_send(ws, {"type": "error", "message": f"unknown type: {msg_type}"})

    except WebSocketDisconnect:
        ev.set()
        if current_task and not current_task.done():
            current_task.cancel()
        return
