from __future__ import annotations
import os
import re
import json
import time
import pathlib
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TextIteratorStreamer,
    BitsAndBytesConfig,
    StoppingCriteria,
    StoppingCriteriaList,
)
from peft import PeftModel
from .db import (
    init_db,
    add_turn,
    upsert_session,
    get_session,
)
from .prompt_composer import compose_system_prompt, extract_profile_json_from_ui_system
# bus for legacy TTS delta bridging (optional)
from .routers import stream_bus

# -----------------------------------------------------------------------------
# Safety guard: this is the *LLM router*. It must NEVER be imported in TTS mode.
# -----------------------------------------------------------------------------
_USE_TTS = os.getenv("USE_TTS", "0").strip().lower() in ("1", "true", "yes", "y")
if _USE_TTS:
    raise RuntimeError("code/api/api.py loaded while USE_TTS=1. LLM router is disabled in TTS mode.")

router = APIRouter(prefix="/api", tags=["pro-llm"])

# ---------------- Config ----------------
DATA_DIR = pathlib.Path(os.getenv("DATA_DIR", "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# --- PATCHED CONFIG FOR LOCAL LOADING ---
MODEL_PATH = (os.getenv("MODEL_PATH", "") or "").strip()
HF_HOME = (os.getenv("HF_HOME", "") or "").strip()
# ----------------------------------------

BASE_MODEL_ID = os.getenv("BASE_MODEL_ID", os.getenv("MODEL_ID", "meta-llama/Meta-Llama-3.1-8B-Instruct"))
MODEL_ID = os.getenv("MODEL_ID", BASE_MODEL_ID)
LORA_ADAPTER_ID = (os.getenv("LORA_ADAPTER_ID", "") or "").strip()
LOAD_IN_4BIT = (os.getenv("LOAD_IN_4BIT", "1").strip().lower() in ("1", "true", "yes", "y"))
ATTN_IMPL = (os.getenv("ATTN_IMPL", "flash_attention_2") or "flash_attention_2").strip()
TORCH_DTYPE = (os.getenv("TORCH_DTYPE", "bfloat16") or "bfloat16").strip().lower()
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "3072"))
MAX_CONTEXT_WINDOW = int(os.getenv("MAX_CONTEXT_WINDOW", "8192"))

# session transcript folder exports (optional, still handy)
MEMO_DIR = DATA_DIR / "memory" / "agents"
SESSION_FS_DIR = MEMO_DIR / "sessions"
MEMO_DIR.mkdir(parents=True, exist_ok=True)
SESSION_FS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------- Globals ----------------
_model = None
_tokenizer = None
_model_lock = threading.Lock()

def _device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"

# ---------------- Helpers ----------------
_safe = re.compile(r"[^A-Za-z0-9._ -]+")
def _slug(s: str) -> str:
    return _safe.sub("_", (s or "")).strip("_ ").replace(" ", "_") or "session"
def _lf(s: str) -> str:
    return s.replace("\r\n", "\n").replace("\r", "\n")

def _save_chat_memory_fs(conv_id: str, messages: List[Dict[str, Any]]) -> Dict[str, str]:
    subfolder = "interviews" if conv_id.lower().startswith("legacy") else "bot_tests"
    target_dir = MEMO_DIR / subfolder
    target_dir.mkdir(parents=True, exist_ok=True)
    base = _slug(conv_id)
    ts = datetime.utcnow().isoformat()
    json_path = target_dir / f"{base}.json"
    txt_path  = target_dir / f"{base}.txt"
    jsonl_path = target_dir / f"{base}.jsonl"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({"conv_id": conv_id, "updated_at": ts, "messages": messages}, f, ensure_ascii=False, indent=2)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(f"--- Export: {conv_id} ---\nExport Date: {ts}\n\n")
        for m in messages:
            role = (m.get("role") or "").upper()
            content = m.get("content") or ""
            f.write(f"{role}: {content}\n\n")
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for m in messages:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    return {"dir": str(target_dir), "json": str(json_path), "txt": str(txt_path), "jsonl": str(jsonl_path)}

# STT is handled by routers/stt.py (POST /api/stt/transcribe).
# That router supports STT_GPU, STT_MODEL, STT_DEVICE, lang, and initial_prompt.

# ---------------- PATCHED Model load ----------------
def _load_model():
    global _model, _tokenizer

    # Fast path: model already loaded — no lock needed
    if _model is not None and _tokenizer is not None:
        return _model, _tokenizer

    # Serialize all load attempts so only one thread loads the model
    with _model_lock:
        # Re-check after acquiring lock — another thread may have finished loading
        if _model is not None and _tokenizer is not None:
            return _model, _tokenizer

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA not visible. Confirm `nvidia-smi` inside WSL.")

        # Prefer local folder forever
        model_src = MODEL_PATH if MODEL_PATH else (MODEL_ID or BASE_MODEL_ID).strip()

        # If MODEL_PATH is set, NEVER try network.
        local_only = bool(MODEL_PATH) or (os.getenv("TRANSFORMERS_OFFLINE", "0") in ("1", "true", "True")) or (os.getenv("HF_HUB_OFFLINE", "0") in ("1", "true", "True"))

        # Keep cache under your permanent HF_HOME if provided
        cache_dir = HF_HOME if HF_HOME else None

        compute_dtype = torch.float16 if TORCH_DTYPE == "float16" else torch.bfloat16
        quant_config = None
        if LOAD_IN_4BIT:
            quant_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=compute_dtype,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )

        print(f"[LLM] Loading {model_src} local_only={local_only} 4bit={LOAD_IN_4BIT} attn={ATTN_IMPL} dtype={TORCH_DTYPE}")

        _model = AutoModelForCausalLM.from_pretrained(
            model_src,
            device_map="auto",
            quantization_config=quant_config,
            attn_implementation=ATTN_IMPL,
            trust_remote_code=True,
            local_files_only=local_only,
            cache_dir=cache_dir,
        )

        _tokenizer = AutoTokenizer.from_pretrained(
            model_src,
            trust_remote_code=True,
            local_files_only=local_only,
            cache_dir=cache_dir,
        )

        if getattr(_tokenizer, "pad_token_id", None) is None:
            _tokenizer.pad_token_id = _tokenizer.eos_token_id

        if LORA_ADAPTER_ID:
            print(f"[LLM] Applying LoRA adapter: {LORA_ADAPTER_ID}")
            _model = PeftModel.from_pretrained(_model, LORA_ADAPTER_ID)

        # Free CUDA allocator fragmentation after heavy model load
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            free_mb = torch.cuda.mem_get_info()[0] / 1024**2
            total_mb = torch.cuda.mem_get_info()[1] / 1024**2
            print(f"[LLM] VRAM after load: {free_mb:.0f} MB free / {total_mb:.0f} MB total")

        init_db()
        return _model, _tokenizer

# ---------------- Schemas ----------------
class ChatTurn(BaseModel):
    role: str
    content: str
class _ChatReq(BaseModel):
    model_config = ConfigDict(extra="allow")
    messages: List[ChatTurn]
    temp: float = 0.8
    top_p: float = 0.95
    max_new: int = 512
    stream_id: Optional[str] = None
    conv_id: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    state: Optional[Dict[str, Any]] = None
    anchor_id: Optional[str] = None
    section: Optional[str] = None

# ---------------- Stop criteria ----------------
class StopOnEvent(StoppingCriteria):
    def __init__(self, ev: threading.Event):
        super().__init__()
        self.ev = ev
    def __call__(self, input_ids, scores, **kwargs) -> bool:
        return self.ev.is_set()

# ---------------- Prompt / normalization ----------------
def _normalize_role(r: str) -> str:
    r = (r or "").strip().lower()
    if r in ("system", "user", "assistant"):
        return r
    return "user"

def _apply_chat_template(messages: List[Dict[str, str]]) -> str:
    model, tok = _load_model()
    if hasattr(tok, "apply_chat_template"):
        return tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    def fmt(m):
        return f"{m['role'].upper()}:\n{m['content'].strip()}\n"
    return "\n".join(fmt(m) for m in messages) + "\nASSISTANT:\n"

# ---------------- REST chat ----------------
@router.post("/chat")
def chat(req: _ChatReq) -> Dict[str, Any]:
    start = time.time()
    model, tok = _load_model()
    # Unified system prompt (pinned RAG + stable role rules)
    ui_system = next((m.content for m in (req.messages or []) if _normalize_role(m.role) == 'system'), None)
    profile_obj, ui_base = extract_profile_json_from_ui_system(ui_system)

    # Phase G: Defer profile persist until AFTER successful generation (fail-closed).
    # Captured here but written only after generation completes without error.
    _deferred_profile = profile_obj if (req.conv_id and profile_obj is not None) else None

    user_text = ''
    for mm in reversed(req.messages or []):
        if _normalize_role(mm.role) == 'user':
            user_text = mm.content
            break

    conv_for_prompt = (req.conv_id or 'default').strip() or 'default'
    base_system = (ui_base or ui_system or 'You are Lorevox, a warm oral historian and memoir biographer.').strip()
    unified_system = compose_system_prompt(conv_for_prompt, ui_system=base_system, user_text=user_text)

    msgs = [{'role': 'system', 'content': unified_system}] + [
        {'role': _normalize_role(m.role), 'content': m.content}
        for m in (req.messages or [])
        if _normalize_role(m.role) != 'system'
    ]
    prompt = _apply_chat_template(msgs)
    inputs = tok(prompt, return_tensors="pt").to(model.device)
    # WO-1 VRAM guard: truncate input to MAX_CONTEXT_WINDOW to prevent KV cache OOM
    if inputs["input_ids"].shape[-1] > MAX_CONTEXT_WINDOW:
        print(f"[VRAM-GUARD] Truncating input from {inputs['input_ids'].shape[-1]} to {MAX_CONTEXT_WINDOW} tokens")
        inputs = {k: v[:, -MAX_CONTEXT_WINDOW:] for k, v in inputs.items()}
    # WO-S1: Centralized generation parameter guard — temp≤0 → greedy
    _temp = float(req.temp)
    _do_sample = _temp > 0
    if not _do_sample:
        _temp = 1.0  # dummy; ignored when do_sample=False
    # WO-LLM-FIX: Use GenerationConfig to avoid model.generation_config merge
    # issues in transformers 4.40+ where the model's default temperature=0.0
    # can override the passed keyword argument.
    from transformers import GenerationConfig
    gen_config = GenerationConfig(
        max_new_tokens=int(req.max_new),
        temperature=_temp,
        top_p=float(req.top_p),
        do_sample=_do_sample,
        repetition_penalty=1.1,
        pad_token_id=tok.eos_token_id,
        eos_token_id=tok.eos_token_id,
    )
    out = model.generate(
        **inputs,
        generation_config=gen_config,
    )
    text = tok.decode(out[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True).strip()
    # Phase G: Only persist profile + turns AFTER generation succeeds (fail-closed)
    if req.conv_id:
        if _deferred_profile is not None:
            try:
                sess = get_session(req.conv_id) or {'title': '', 'payload': {}}
                title = (sess.get('title') or '').strip()
                payload = dict(sess.get('payload') or {})
                payload['ui_profile'] = _deferred_profile
                if isinstance(_deferred_profile, dict) and _deferred_profile.get('person_id'):
                    payload['active_person_id'] = _deferred_profile.get('person_id')
                upsert_session(req.conv_id, title, payload)
            except Exception as e:
                print(f"[Phase G] Profile persist failed (non-fatal): {e}")
        add_turn(req.conv_id, "user", msgs[-1]["content"], datetime.utcnow().isoformat(), req.anchor_id or "", {"section": req.section or ""})
        add_turn(req.conv_id, "assistant", text, datetime.utcnow().isoformat(), req.anchor_id or "", {"section": req.section or ""})
    return {"ok": True, "text": text, "latency": round(time.time() - start, 2)}

# ---------------- Lightweight warmup ----------------
@router.post("/warmup")
def warmup_endpoint():
    """Minimal GPU warmup — generates a few tokens with a tiny prompt.

    Skips compose_system_prompt, RAG, profile lookup, and DB writes.
    Used by scripts/warm_llm.py to confirm the model can actually generate.
    """
    import gc
    start = time.time()
    model, tok = _load_model()

    # Tiny prompt — just enough to exercise the GPU
    msgs = [
        {"role": "system", "content": "Reply with one word."},
        {"role": "user", "content": "hi"},
    ]
    prompt = _apply_chat_template(msgs)
    prompt_tokens = len(tok.encode(prompt))

    vram_free = torch.cuda.mem_get_info()[0] / 1024**2 if torch.cuda.is_available() else -1
    vram_total = torch.cuda.mem_get_info()[1] / 1024**2 if torch.cuda.is_available() else -1
    print(f"[LLM] warmup: prompt_tokens={prompt_tokens} VRAM={vram_free:.0f}/{vram_total:.0f} MB free")

    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(
                **inputs,
                max_new_tokens=8,
                temperature=0.7,
                do_sample=True,
                pad_token_id=tok.eos_token_id,
            )
        text = tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        del inputs, out
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        latency = round(time.time() - start, 2)
        print(f"[LLM] warmup OK: {text!r} ({latency}s)")
        return {"ok": True, "text": text, "latency": latency, "prompt_tokens": prompt_tokens,
                "vram_free_mb": round(vram_free), "vram_total_mb": round(vram_total)}
    except (torch.cuda.OutOfMemoryError, RuntimeError) as e:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()
        err = str(e)[:300]
        print(f"[LLM] warmup CUDA OOM: {err}")
        vram_now = torch.cuda.mem_get_info()[0] / 1024**2 if torch.cuda.is_available() else -1
        raise HTTPException(507, detail={
            "error": "CUDA_OOM",
            "message": "GPU out of memory during warmup",
            "vram_free_mb": round(vram_now),
            "vram_total_mb": round(vram_total),
        })

# ---------------- Streaming ----------------
@router.post("/chat/stream")
def chat_stream(req: _ChatReq):
    start = time.time()
    model, tok = _load_model()
    conv_id = (req.conv_id or "").strip()
    anchor_id = (req.anchor_id or "").strip()
    section = (req.section or "").strip()
    stream_id = (req.stream_id or "").strip()
    # Unified system prompt (pinned RAG + stable role rules)
    ui_system = next((m.content for m in (req.messages or []) if _normalize_role(m.role) == 'system'), None)
    profile_obj, ui_base = extract_profile_json_from_ui_system(ui_system)

    # Phase G: Defer profile persist until AFTER streaming completes (fail-closed).
    _deferred_stream_profile = profile_obj if (req.conv_id and profile_obj is not None) else None

    user_text = ''
    for mm in reversed(req.messages or []):
        if _normalize_role(mm.role) == 'user':
            user_text = mm.content
            break

    conv_for_prompt = (req.conv_id or 'default').strip() or 'default'
    base_system = (ui_base or ui_system or 'You are Lorevox, a warm oral historian and memoir biographer.').strip()
    unified_system = compose_system_prompt(conv_for_prompt, ui_system=base_system, user_text=user_text)

    msgs = [{'role': 'system', 'content': unified_system}] + [
        {'role': _normalize_role(m.role), 'content': m.content}
        for m in (req.messages or [])
        if _normalize_role(m.role) != 'system'
    ]
    prompt = _apply_chat_template(msgs)

    # ── Diagnostic logging ──
    _prompt_tokens = len(tok.encode(prompt)) if tok is not None else -1
    _vram_free = torch.cuda.mem_get_info()[0] / 1024**2 if torch.cuda.is_available() else -1
    _vram_total = torch.cuda.mem_get_info()[1] / 1024**2 if torch.cuda.is_available() else -1
    print(f"[LLM] chat_stream: conv_id={conv_id!r} prompt_tokens={_prompt_tokens} "
          f"VRAM={_vram_free:.0f}/{_vram_total:.0f} MB free max_new={req.max_new}")

    ev = threading.Event()
    stop = StoppingCriteriaList([StopOnEvent(ev)])
    def gen():
        full = ""
        try:
            # Clear cache before inference to maximise available VRAM
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            inputs = tok(prompt, return_tensors="pt").to(model.device)
            # WO-1 VRAM guard: truncate input to MAX_CONTEXT_WINDOW to prevent KV cache OOM
            if inputs["input_ids"].shape[-1] > MAX_CONTEXT_WINDOW:
                print(f"[VRAM-GUARD] Truncating stream input from {inputs['input_ids'].shape[-1]} to {MAX_CONTEXT_WINDOW} tokens")
                inputs = {k: v[:, -MAX_CONTEXT_WINDOW:] for k, v in inputs.items()}
            streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)
            # WO-S1: Centralized generation parameter guard — temp≤0 → greedy
            _temp = float(req.temp)
            _do_sample = _temp > 0
            if not _do_sample:
                _temp = 1.0  # dummy; ignored when do_sample=False
            # WO-LLM-FIX: Use GenerationConfig to avoid model.generation_config merge issues
            from transformers import GenerationConfig
            _gen_config = GenerationConfig(
                max_new_tokens=int(req.max_new),
                temperature=_temp,
                top_p=float(req.top_p),
                do_sample=_do_sample,
                repetition_penalty=1.1,
                pad_token_id=tok.eos_token_id,
                eos_token_id=tok.eos_token_id,
            )
            th = threading.Thread(
                target=model.generate,
                kwargs=dict(
                    **inputs,
                    streamer=streamer,
                    generation_config=_gen_config,
                    stopping_criteria=stop,
                ),
                daemon=True,
            )
            th.start()
            for delta in streamer:
                if not delta: continue
                full += delta
                if stream_id: stream_bus.publish(stream_id, delta)
                yield json.dumps({"delta": delta}, ensure_ascii=False) + "\n"
            if conv_id:
                # Phase G: Persist deferred profile AFTER successful streaming (fail-closed)
                if _deferred_stream_profile is not None:
                    try:
                        sess = get_session(conv_id) or {'title': '', 'payload': {}}
                        stitle = (sess.get('title') or '').strip()
                        spayload = dict(sess.get('payload') or {})
                        spayload['ui_profile'] = _deferred_stream_profile
                        if isinstance(_deferred_stream_profile, dict) and _deferred_stream_profile.get('person_id'):
                            spayload['active_person_id'] = _deferred_stream_profile.get('person_id')
                        upsert_session(conv_id, stitle, spayload)
                    except Exception as e:
                        print(f"[Phase G] Streaming profile persist failed (non-fatal): {e}")
                add_turn(conv_id, "assistant", full, datetime.utcnow().isoformat(), anchor_id, {"section": section})
                try:
                    _save_chat_memory_fs(conv_id, msgs + [{"role":"assistant","content":full}])
                except Exception: pass
        except (torch.cuda.OutOfMemoryError, RuntimeError) as oom_err:
            # CUDA OOM — free what we can and report cleanly
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            err_msg = str(oom_err)
            print(f"[LLM] CUDA OOM during generation: {err_msg[:200]}")
            yield json.dumps({"error": "CUDA_OOM", "message": "GPU out of memory. Try again — VRAM has been freed."}, ensure_ascii=False) + "\n"
        except Exception as exc:
            print(f"[LLM] Generation error: {exc}")
            yield json.dumps({"error": "generation_error", "message": str(exc)[:300]}, ensure_ascii=False) + "\n"
        finally:
            if stream_id: stream_bus.close(stream_id)
            yield json.dumps({"done": True, "latency": round(time.time() - start, 2)}, ensure_ascii=False) + "\n"
    return StreamingResponse(gen(), media_type="application/x-ndjson")