"""
STT router — local Whisper transcription.
POST /api/stt/transcribe   (multipart: file=<audio blob>, lang=en, initial_prompt="")
GET  /api/stt/status       (engine health)

Tries faster-whisper first, falls back to openai-whisper.
Model size and device controlled by env vars:

  STT_MODEL          default "medium"    (e.g. "large-v3" for best accuracy)
  STT_GPU            default "0"         set "1" to run on CUDA (matches .env pattern)
  STT_DEVICE         optional override   "cuda" or "cpu" (takes priority over STT_GPU)
  STT_COMPUTE        default auto        "float16" on CUDA, "int8" on CPU
"""
from __future__ import annotations

import os
import pathlib
import shutil
import tempfile

import torch
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

router = APIRouter(prefix="/api/stt", tags=["stt"])

_engine = None
_engine_kind: str | None = None


def _resolve_device() -> str:
    """Resolve STT device from env vars.
    Priority: STT_DEVICE > STT_GPU > cpu fallback.
    """
    explicit = os.getenv("STT_DEVICE", "").strip().lower()
    if explicit in ("cuda", "cpu"):
        device = explicit
    else:
        gpu_flag = os.getenv("STT_GPU", "0").strip().lower() in ("1", "true", "yes", "y")
        device = "cuda" if gpu_flag else "cpu"

    # Safety: downgrade to CPU if CUDA requested but unavailable
    if device == "cuda" and not torch.cuda.is_available():
        print("[STT] CUDA requested but unavailable — falling back to CPU")
        device = "cpu"

    return device


def _load_engine():
    global _engine, _engine_kind
    if _engine is not None:
        return _engine_kind, _engine

    model_size = os.getenv("STT_MODEL", "medium").strip() or "medium"
    device = _resolve_device()
    compute = os.getenv("STT_COMPUTE", "float16" if device == "cuda" else "int8").strip()

    # Try faster-whisper first (CUDA fp16, ~5-10× faster than openai-whisper)
    try:
        from faster_whisper import WhisperModel  # type: ignore

        _engine = WhisperModel(model_size, device=device, compute_type=compute)
        _engine_kind = "faster_whisper"
        print(f"[STT] faster-whisper: {model_size} on {device} ({compute})")
        return _engine_kind, _engine
    except ImportError:
        pass
    except Exception as e:
        print(f"[STT] faster-whisper failed ({e}), trying openai-whisper …")

    # Fall back to openai-whisper (CPU-friendly)
    try:
        import whisper  # type: ignore

        _engine = whisper.load_model(model_size)
        _engine_kind = "whisper"
        print(f"[STT] openai-whisper: {model_size}")
        return _engine_kind, _engine
    except ImportError:
        pass
    except Exception as e:
        print(f"[STT] openai-whisper failed: {e}")

    raise RuntimeError(
        "No STT engine available. "
        "Install faster-whisper (pip install faster-whisper) "
        "or openai-whisper (pip install openai-whisper)."
    )


@router.get("/status")
def stt_status():
    """Health-check: returns engine name, device, and model."""
    try:
        kind, _ = _load_engine()
        return {
            "ok": True,
            "engine": kind,
            "device": _resolve_device(),
            "model": os.getenv("STT_MODEL", "medium"),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/transcribe")
async def stt_transcribe(
    file: UploadFile = File(...),
    lang: str = Form("en"),
    initial_prompt: str = Form(""),
):
    """
    Accept a browser audio blob (webm, ogg, mp4, wav) and return transcribed text.
    Optional form fields:
      lang            language code (default "en")
      initial_prompt  hint to help Whisper with proper nouns / names
    """
    try:
        kind, engine = _load_engine()
    except Exception as e:
        raise HTTPException(501, f"STT engine not available: {e}")

    tmpdir = pathlib.Path(tempfile.mkdtemp(prefix="stt_"))
    try:
        suffix = pathlib.Path(file.filename or "audio.webm").suffix or ".webm"
        audio_path = tmpdir / f"upload{suffix}"
        content = await file.read()
        audio_path.write_bytes(content)

        if kind == "faster_whisper":
            segments, _info = engine.transcribe(
                str(audio_path),
                language=lang or "en",
                initial_prompt=initial_prompt or None,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
            )
            text = " ".join(s.text.strip() for s in segments).strip()
        else:
            # openai-whisper
            result = engine.transcribe(
                str(audio_path),
                language=lang or "en",
                initial_prompt=initial_prompt or None,
                fp16=False,
            )
            text = (result.get("text") or "").strip()

        return {"ok": True, "text": text}

    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
