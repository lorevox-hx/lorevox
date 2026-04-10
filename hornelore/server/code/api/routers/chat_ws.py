from __future__ import annotations

import asyncio
import gc
import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)
_LV_DEBUG = os.getenv("LV_DEV_MODE", "0") in ("1", "true", "True")

# ── WO-10M: Token cap + VRAM guard configuration ───────────────────────────
# Pulled from env so the launcher can tune without code edits. The chat cap
# is the default floor when the UI does not pass an explicit max_new_tokens
# in params. WO-10M post-fix: default 256 (was 512) to start conservative
# under full Hornelore + Whisper co-residency; raise only after stability
# is proven green.
_WO10M_CHAT_CAP = int(os.getenv("MAX_NEW_TOKENS_CHAT", os.getenv("MAX_NEW_TOKENS", "256")))
_WO10M_CHAT_CAP_HARD = int(os.getenv("MAX_NEW_TOKENS_CHAT_HARD", "1024"))  # absolute ceiling
_WO10M_GUARD_ENABLED = os.getenv("VRAM_GUARD_ENABLED", "1") in ("1", "true", "True")
_WO10M_GUARD_BASE_MB = float(os.getenv("VRAM_GUARD_BASE_MB", "600"))
_WO10M_GUARD_PER_TOKEN_MB = float(os.getenv("VRAM_GUARD_PER_TOKEN_MB", "0.14"))

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
      # WO-10M: Flag-outside-except OOM recovery pattern.
      # The exception object holds references to the stack frame where the
      # allocator failed, which in turn holds references to the tensors that
      # blew up. If we try to run recovery logic (empty_cache, mem_get_info,
      # new allocations) INSIDE the except block, those tensors are still
      # rooted and the allocator can't reclaim them. We set a flag, exit the
      # except scope cleanly, and run recovery after the exception object is
      # garbage-collected.
      oom_triggered = False
      generic_exc: Optional[BaseException] = None
      generic_msg: str = ""

      try:
        await _generate_and_stream_inner(ws, ev, conv_id, user_text, params)
        return
      except torch.cuda.OutOfMemoryError as oom_err:
        oom_triggered = True
        logger.error("[chat_ws][WO-10M] CUDA OOM caught (torch.cuda.OutOfMemoryError): %s", str(oom_err)[:200])
      except RuntimeError as rt_err:
        err_str = str(rt_err)
        if "out of memory" in err_str.lower() or "CUDA out of memory" in err_str:
            oom_triggered = True
            logger.error("[chat_ws][WO-10M] CUDA OOM caught (RuntimeError): %s", err_str[:200])
        else:
            generic_exc = rt_err
            generic_msg = err_str
            logger.error("[chat_ws] RuntimeError: %s", rt_err, exc_info=True)
      except Exception as exc:
        generic_exc = exc
        generic_msg = str(exc)
        logger.error("[chat_ws] generate_and_stream failed: %s", exc, exc_info=True)

      # ── Recovery phase: exception scope is now closed, references are
      #    dropped, allocator can reclaim memory safely. ────────────────────
      if oom_triggered:
        # Break any lingering reference cycles from the failed turn.
        try:
            gc.collect()
        except Exception:
            pass
        # Attempt cache release. Wrapped defensively because mem_get_info
        # and empty_cache can themselves raise if the allocator is wedged.
        vram_after_mb = -1.0
        try:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                vram_after_mb = torch.cuda.mem_get_info()[0] / 1024**2
        except Exception as cleanup_err:
            logger.warning("[chat_ws][WO-10M] post-OOM cleanup failed: %s", cleanup_err)
        logger.info("[chat_ws][WO-10M] post-OOM recovery complete, free VRAM=%.0f MB", vram_after_mb)
        await _ws_send(ws, {
            "type": "error",
            "code": "CUDA_OOM",
            "message": "GPU ran out of memory mid-generation. VRAM has been freed — please try again.",
            "vram_free_mb": round(vram_after_mb) if vram_after_mb >= 0 else None,
        })
        await _ws_send(ws, {"type": "done", "final_text": "", "oom": True})
        return

      if generic_exc is not None:
        await _ws_send(ws, {"type": "error", "message": f"Chat backend error: {generic_msg[:300]}"})
        await _ws_send(ws, {"type": "done", "final_text": ""})
        return

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

        # ── WO-10M: Cap enforcement + pre-generation VRAM guard ────────────
        # Resolve the effective max_new, capped hard at the launcher ceiling
        # so a misbehaving UI can't request 7168 and blow through our budget.
        _ui_max_new = int(params.get("max_new_tokens", params.get("max_new", _WO10M_CHAT_CAP)))
        max_new = max(1, min(_ui_max_new, _WO10M_CHAT_CAP_HARD))
        if max_new != _ui_max_new:
            logger.info("[chat_ws][WO-10M] capping max_new %d → %d (hard ceiling %d)",
                        _ui_max_new, max_new, _WO10M_CHAT_CAP_HARD)

        # Diagnostic: prompt size + current VRAM
        _prompt_tokens = len(tok.encode(prompt))
        try:
            _vram_free = torch.cuda.mem_get_info()[0] / 1024**2 if torch.cuda.is_available() else -1
            _vram_total = torch.cuda.mem_get_info()[1] / 1024**2 if torch.cuda.is_available() else -1
        except Exception as _mem_err:
            logger.warning("[chat_ws][WO-10M] mem_get_info failed pre-guard: %s", _mem_err)
            _vram_free, _vram_total = -1.0, -1.0

        # WO-10M: Pre-generation VRAM guard.
        # Conservative planning formula:
        #   required_mb = base + (prompt_tokens + max_new) * per_token_mb
        # base covers the MLP down_proj transient spike (~600 MB on Llama-3.1-8B
        # 4-bit). per_token_mb of 0.14 covers KV cache (~128 KB/token for GQA)
        # plus per-token activation overhead. If free VRAM is below this
        # threshold we refuse the turn cleanly instead of calling generate()
        # and crashing mid-forward-pass.
        _planned_seq = min(_prompt_tokens, MAX_CONTEXT_WINDOW) + max_new
        _required_mb = _WO10M_GUARD_BASE_MB + _planned_seq * _WO10M_GUARD_PER_TOKEN_MB
        _guard_blocked = False
        _guard_decision = "disabled"
        if _WO10M_GUARD_ENABLED and _vram_free >= 0:
            if _vram_free < _required_mb:
                # One retry after empty_cache — fragmentation may be the culprit.
                try:
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    _vram_free = torch.cuda.mem_get_info()[0] / 1024**2
                except Exception:
                    pass
                if _vram_free < _required_mb:
                    _guard_blocked = True
                    _guard_decision = "blocked"
                else:
                    _guard_decision = "pass_after_flush"
            else:
                _guard_decision = "pass"

        logger.info(
            "[chat_ws][WO-10M] prompt_tokens=%d max_new=%d required=%.0f MB "
            "free=%.0f/%.0f MB guard=%s",
            _prompt_tokens, max_new, _required_mb, _vram_free, _vram_total, _guard_decision,
        )

        if _guard_blocked:
            logger.warning(
                "[chat_ws][WO-10M] BLOCKING turn: required=%.0f MB > free=%.0f MB "
                "(prompt=%d, max_new=%d). Not calling model.generate().",
                _required_mb, _vram_free, _prompt_tokens, max_new,
            )
            await _ws_send(ws, {
                "type": "error",
                "code": "VRAM_PRESSURE",
                "message": "Not enough GPU memory for this turn — please try a shorter message or try again shortly.",
                "vram_free_mb": round(_vram_free),
                "required_mb": round(_required_mb),
                "prompt_tokens": _prompt_tokens,
            })
            await _ws_send(ws, {"type": "done", "final_text": "", "blocked": "vram_pressure"})
            return

        # Prep generation — clear cache first for max headroom
        if torch.cuda.is_available():
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        # WO-1 VRAM guard: truncate input to MAX_CONTEXT_WINDOW to prevent KV cache OOM
        if inputs["input_ids"].shape[-1] > MAX_CONTEXT_WINDOW:
            logger.warning("[VRAM-GUARD] WS truncating input from %d to %d tokens",
                           inputs["input_ids"].shape[-1], MAX_CONTEXT_WINDOW)
            inputs = {k: v[:, -MAX_CONTEXT_WINDOW:] for k, v in inputs.items()}
        streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)

        ev.clear()
        stop = StoppingCriteriaList([StopOnEvent(ev)])

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

        # Phase G: fail-closed — only persist if generation completed cleanly
        if ev.is_set():
            logger.warning("[chat-ws] Turn cancelled/disconnected — skipping persistence (fail-closed)")
            await _ws_send(ws, {"type": "done", "final_text": final_text, "cancelled": True})
            return

        try:
            persist_turn_transaction(
                conv_id=conv_id,
                user_message=user_text,
                assistant_message=final_text,
                model_name="local-llm-ws",
                meta={"ws": True, "cancelled": ev.is_set()},
            )
        except Exception as persist_err:
            logger.error("[chat-ws] Phase G: persist_turn_transaction failed — %s", persist_err)
            await _ws_send(ws, {"type": "error", "message": "Turn persist failed — no state written"})

        # Memory Archive — log assistant reply + rebuild transcript
        if person_id:
            try:
                archive_append_event(
                    person_id=person_id,
                    session_id=conv_id,
                    role="assistant",
                    content=final_text,
                    meta={"ws": True, "cancelled": ev.is_set()},
                )
                archive_rebuild_txt(person_id=person_id, session_id=conv_id)
            except Exception as arch_err:
                logger.error("[chat-ws] Phase G: archive write failed — %s", arch_err)

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
        # Phase G: fail-closed — cancel in-flight generation, do not replay stale state
        ev.set()
        if current_task and not current_task.done():
            current_task.cancel()
        logger.info("[chat-ws] Phase G: WebSocket disconnected — cancelled in-flight, no stale replay")
        return
