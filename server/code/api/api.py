from __future__ import annotations
import os
import re
import json
import time
import pathlib
import threading
import tempfile
import shutil
from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Body, UploadFile, File, Form, HTTPException, Query
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
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "2048"))

# session transcript folder exports (optional, still handy)
MEMO_DIR = DATA_DIR / "memory" / "agents"
SESSION_FS_DIR = MEMO_DIR / "sessions"
MEMO_DIR.mkdir(parents=True, exist_ok=True)
SESSION_FS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------- Globals ----------------
_model = None
_tokenizer = None

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

# ---------------- STT Engine ----------------
@lru_cache(maxsize=1)
def _load_stt_engine():
    model_name = os.getenv("STT_MODEL", "base").strip() or "base"
    try:
        from faster_whisper import WhisperModel
        device = "cuda" if (torch.cuda.is_available() and os.getenv("STT_GPU", "0") in ("1","true","True")) else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        return ("faster_whisper", WhisperModel(model_name, device=device, compute_type=compute_type))
    except Exception as e:
        print(f"[STT] Unavailable: {e}")
        return ("none", None)

@router.post("/stt/transcribe")
def stt_transcribe(file: UploadFile = File(...), lang: str = Form("en"), prompt: str = Form("")):
    kind, engine = _load_stt_engine()
    if kind == "none" or engine is None:
        raise HTTPException(501, "STT engine unavailable.")
    suffix = pathlib.Path(file.filename or "audio.webm").suffix or ".webm"
    tmpdir = pathlib.Path(tempfile.mkdtemp(prefix="stt_"))
    try:
        audio_path = tmpdir / f"audio{suffix}"
        with open(audio_path, "wb") as f:
            f.write(file.file.read())
        segments, info = engine.transcribe(str(audio_path), language=(lang or "en"), initial_prompt=(prompt or None), vad_filter=True)
        text = " ".join((seg.text or "").strip() for seg in segments).strip()
        return {"ok": True, "text": text}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

# ---------------- PATCHED Model load ----------------
def _load_model():
    global _model, _tokenizer
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

    # Persist PROFILE_JSON from UI into session payload (only when conv_id is provided)
    if req.conv_id and profile_obj is not None:
        sess = get_session(req.conv_id) or {'title': '', 'payload': {}}
        title = (sess.get('title') or '').strip()
        payload = dict(sess.get('payload') or {})
        payload['ui_profile'] = profile_obj
        if isinstance(profile_obj, dict) and profile_obj.get('person_id'):
            payload['active_person_id'] = profile_obj.get('person_id')
        upsert_session(req.conv_id, title, payload)

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
    out = model.generate(
        **inputs,
        max_new_tokens=int(req.max_new),
        temperature=float(req.temp),
        top_p=float(req.top_p),
        do_sample=True,
        repetition_penalty=1.1,
        pad_token_id=tok.eos_token_id,
        eos_token_id=tok.eos_token_id,
    )
    text = tok.decode(out[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True).strip()
    if req.conv_id:
        add_turn(req.conv_id, "user", msgs[-1]["content"], datetime.utcnow().isoformat(), req.anchor_id or "", {"section": req.section or ""})
        add_turn(req.conv_id, "assistant", text, datetime.utcnow().isoformat(), req.anchor_id or "", {"section": req.section or ""})
    return {"ok": True, "text": text, "latency": round(time.time() - start, 2)}

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

    # Persist PROFILE_JSON from UI into session payload (only when conv_id is provided)
    if req.conv_id and profile_obj is not None:
        sess = get_session(req.conv_id) or {'title': '', 'payload': {}}
        title = (sess.get('title') or '').strip()
        payload = dict(sess.get('payload') or {})
        payload['ui_profile'] = profile_obj
        if isinstance(profile_obj, dict) and profile_obj.get('person_id'):
            payload['active_person_id'] = profile_obj.get('person_id')
        upsert_session(req.conv_id, title, payload)

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
    ev = threading.Event()
    stop = StoppingCriteriaList([StopOnEvent(ev)])
    def gen():
        full = ""
        inputs = tok(prompt, return_tensors="pt").to(model.device)
        streamer = TextIteratorStreamer(tok, skip_prompt=True, skip_special_tokens=True)
        th = threading.Thread(
            target=model.generate,
            kwargs=dict(
                **inputs,
                streamer=streamer,
                max_new_tokens=int(req.max_new),
                temperature=float(req.temp),
                top_p=float(req.top_p),
                do_sample=True,
                repetition_penalty=1.1,
                stopping_criteria=stop,
                pad_token_id=tok.eos_token_id,
                eos_token_id=tok.eos_token_id,
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
            add_turn(conv_id, "assistant", full, datetime.utcnow().isoformat(), anchor_id, {"section": section})
            try:
                _save_chat_memory_fs(conv_id, msgs + [{"role":"assistant","content":full}])
            except Exception: pass
        if stream_id: stream_bus.close(stream_id)
        yield json.dumps({"done": True, "latency": round(time.time() - start, 2)}, ensure_ascii=False) + "\n"
    return StreamingResponse(gen(), media_type="application/x-ndjson")