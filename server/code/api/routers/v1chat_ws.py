from __future__ import annotations

import asyncio
import json
from threading import Thread
from typing import AsyncIterator, Dict, Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from transformers import TextIteratorStreamer

# v4.2 core
from ..api import _load_model, _build_prompt, _StoppingCriteria  # type: ignore
from ..db import persist_turn_transaction  # type: ignore


# ✅ FIX #1: prefix so websocket is /api/chat/ws
router = APIRouter(prefix="/api/chat", tags=["agent-runtime"])


# ✅ FIX #2: load model once at module import (single VRAM resident)
MODEL, TOK = _load_model()
MODEL_ID = getattr(MODEL, "name_or_path", "unknown-model")


async def _ws_send(ws: WebSocket, obj: Dict[str, Any]) -> None:
    """Best-effort JSON send (avoid killing the loop on transient send errors)."""
    try:
        await ws.send_text(json.dumps(obj, ensure_ascii=False))
    except Exception:
        # if client vanished, upstream loop will hit WebSocketDisconnect soon
        pass


async def _stream_generate(
    conv_id: str,
    user_message: str,
    params: Dict[str, Any],
    stop_event: asyncio.Event,
) -> AsyncIterator[str]:
    """
    Async token generator:
      - builds prompt
      - runs model.generate() in a background thread
      - yields tokens from TextIteratorStreamer
      - ✅ FIX #3: uses _StoppingCriteria wired to stop_event for true cancel
    """
    prompt = _build_prompt(conv_id, user_message)
    inputs = TOK(prompt, return_tensors="pt").to(MODEL.device)

    streamer = TextIteratorStreamer(TOK, skip_prompt=True, skip_special_tokens=True)

    # If your _StoppingCriteria signature differs, adapt this one line.
    stopping_criteria = [_StoppingCriteria(stop_event)]  # type: ignore

    generation_kwargs = dict(
        **inputs,
        streamer=streamer,
        max_new_tokens=int(params.get("max_new_tokens", 2048)),
        temperature=float(params.get("temperature", 0.7)),
        top_p=float(params.get("top_p", 0.9)),
        do_sample=True,
        pad_token_id=TOK.eos_token_id,
        stopping_criteria=stopping_criteria,
    )

    thread = Thread(target=MODEL.generate, kwargs=generation_kwargs, daemon=True)
    thread.start()

    for token in streamer:
        # streamer yields text chunks; stopping_criteria should end generate shortly after cancel
        yield token
        await asyncio.sleep(0)


@router.websocket("/ws")
async def agent_websocket_endpoint(ws: WebSocket):
    """
    ws://localhost:8000/api/chat/ws
    Protocol:
      start_turn, token, status, done, error, cancel_turn, ping/pong
    """
    await ws.accept()

    current_task: Optional[asyncio.Task] = None
    current_turn_id: Optional[str] = None
    stop_event = asyncio.Event()

    try:
        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")

            if msg_type == "start_turn":
                # One active turn at a time
                if current_task and not current_task.done():
                    stop_event.set()
                    current_task.cancel()
                    stop_event = asyncio.Event()

                conv_id = msg.get("session_id", "default")
                user_message = msg.get("message", "")
                params = msg.get("params") or {}

                current_turn_id = params.get(
                    "turn_id",
                    f"turn-{int(asyncio.get_running_loop().time() * 1000)}",
                )

                await _ws_send(ws, {"type": "status", "turn_id": current_turn_id, "state": "thinking"})

                async def _run_turn(tid: str):
                    full_text_parts: list[str] = []
                    try:
                        await _ws_send(ws, {"type": "status", "turn_id": tid, "state": "working"})

                        async for chunk in _stream_generate(conv_id, user_message, params, stop_event):
                            full_text_parts.append(chunk)
                            await _ws_send(ws, {"type": "token", "turn_id": tid, "delta": chunk})

                        final_text = "".join(full_text_parts)

                        # Persist after streaming completes (your requirement)
                        persist_turn_transaction(
                            conv_id=conv_id,
                            user_message=user_message,
                            assistant_message=final_text,
                            model_name=MODEL_ID,
                        )

                        await _ws_send(ws, {"type": "done", "turn_id": tid, "final_text": final_text})

                    except asyncio.CancelledError:
                        await _ws_send(ws, {"type": "status", "turn_id": tid, "state": "cancelled"})
                    except Exception as e:
                        await _ws_send(ws, {"type": "error", "turn_id": tid, "message": str(e)})

                current_task = asyncio.create_task(_run_turn(current_turn_id))

            elif msg_type == "cancel_turn":
                turn_id = msg.get("turn_id") or current_turn_id
                stop_event.set()
                if current_task and not current_task.done():
                    current_task.cancel()
                current_task = None
                await _ws_send(ws, {"type": "status", "turn_id": turn_id, "state": "cancelled"})
                stop_event = asyncio.Event()

            elif msg_type == "ping":
                await _ws_send(ws, {"type": "pong"})

            else:
                await _ws_send(ws, {"type": "error", "message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        stop_event.set()
        if current_task and not current_task.done():
            current_task.cancel()
    finally:
        try:
            await ws.close()
        except Exception:
            pass
