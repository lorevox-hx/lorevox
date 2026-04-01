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

from ..db import export_turns, persist_turn_transaction, clear_turns
import torch
from ..api import _load_model, _apply_chat_template, StopOnEvent, _normalize_role, MAX_CONTEXT_WINDOW
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
    # WO-2: track active person_id for identity-session handshake
    active_person_id: Optional[str] = None

    async def generate_and_stream(conv_id: str, user_text: str, params: Dict[str, Any]) -> None:
      try:
        await _generate_and_stream_inner(ws, ev, conv_id, user_text, params)
      except (torch.cuda.OutOfMemoryError, RuntimeError) as oom_err:
        err_str = str(oom_err)
        is_oom = "out of memory" in err_str.lower() or "CUDA" in err_str
        if is_oom:
            logger.error("[chat_ws] CUDA OOM: %s", err_str[:200])
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            await _ws_send(ws, {"type": "error", "message": "CUDA_OOM: GPU out of memory. VRAM freed — try again."})
        else:
            logger.error("[chat_ws] RuntimeError: %s", oom_err, exc_info=True)
            await _ws_send(ws, {"type": "error", "message": f"Chat backend error: {oom_err}"})
        await _ws_send(ws, {"type": "done", "final_text": ""})
      except Exception as exc:
        logger.error("[chat_ws] generate_and_stream failed: %s", exc, exc_info=True)
        await _ws_send(ws, {"type": "error", "message": f"Chat backend error: {exc}"})
        await _ws_send(ws, {"type": "done", "final_text": ""})

    async def _generate_and_stream_inner(ws: WebSocket, ev: threading.Event, conv_id: str, user_text: str, params: Dict[str, Any]) -> None:
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

        # ── Diagnostic logging ──
        _prompt_tokens = len(tok.encode(prompt))
        _vram_free = torch.cuda.mem_get_info()[0] / 1024**2 if torch.cuda.is_available() else -1
        _vram_total = torch.cuda.mem_get_info()[1] / 1024**2 if torch.cuda.is_available() else -1
        logger.info("[chat_ws] prompt_tokens=%d VRAM=%.0f/%.0f MB free max_new=%s",
                    _prompt_tokens, _vram_free, _vram_total, params.get("max_new_tokens", 512))

        # Prep generation — clear cache first for max headroom
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        # WO-1 VRAM guard: truncate input to MAX_CONTEXT_WINDOW to prevent KV cache OOM
        if inputs["input_ids"].shape[-1] > MAX_CONTEXT_WINDOW:
            logger.warning("[VRAM-GUARD] WS truncating input from %d to %d tokens",
                           inputs["input_ids"].shape[-1], MAX_CONTEXT_WINDOW)
            inputs = {k: v[:, -MAX_CONTEXT_WINDOW:] for k, v in inputs.items()}
        streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)

        ev.clear()
        stop = StoppingCriteriaList([StopOnEvent(ev)])

        max_new = int(params.get("max_new_tokens", params.get("max_new", 512)))
        temperature = float(params.get("temperature", params.get("temp", 0.8)))
        top_p = float(params.get("top_p", 0.95))

        # WO-S1: Centralized generation parameter guard — temp≤0 → greedy
        _do_sample = temperature > 0
        if not _do_sample:
            temperature = 1.0  # dummy; ignored when do_sample=False

        await _ws_send(ws, {"type": "status", "state": "generating"})

        th = threading.Thread(
            target=model.generate,
            kwargs=dict(
                **inputs,
                streamer=streamer,
                max_new_tokens=max_new,
                temperature=temperature,
                top_p=top_p,
                do_sample=_do_sample,
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

            if msg_type == "sync_session":
                # WO-2: Identity-session handshake
                incoming_pid = str(msg.get("person_id") or "")
                if incoming_pid and incoming_pid != active_person_id:
                    # Person changed — flush conversation history
                    if active_person_id:
                        old_conv = msg.get("old_conv_id") or f"person_{active_person_id}"
                        cleared = clear_turns(old_conv)
                        logger.info("[WO-2] Session switch: %s → %s, flushed %d turns from %s",
                                    active_person_id, incoming_pid, cleared, old_conv)
                    active_person_id = incoming_pid
                else:
                    active_person_id = incoming_pid or active_person_id
                await _ws_send(ws, {"type": "session_verified", "person_id": active_person_id})

            elif msg_type == "start_turn":
                conv_id = msg.get("session_id") or msg.get("conv_id") or "default"
                user_text = msg.get("message") or ""
                params = msg.get("params") or {}

                # WO-2: check person_id in params matches active session
                turn_pid = str(params.get("person_id") or "")
                if turn_pid and active_person_id and turn_pid != active_person_id:
                    cleared = clear_turns(conv_id)
                    logger.info("[WO-2] Turn person_id mismatch: active=%s, turn=%s, flushed %d turns",
                                active_person_id, turn_pid, cleared)
                    active_person_id = turn_pid

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
