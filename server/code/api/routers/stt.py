"""
STT router — local Whisper transcription.
POST /api/stt/transcribe   (multipart: file=<audio blob>)
GET  /api/stt/status       (engine health)

Tries faster-whisper first, falls back to openai-whisper.
Model size and device controlled by env vars:
  STT_MODEL   default "medium"
  STT_DEVICE  default "cuda"   (faster-whisper) / ignored for openai-whisper
  STT_COMPUTE default "float16" (faster-whisper compute_type)
"""
from __future__ import annotations

import os
import pathlib
import shutil
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/api/stt", tags=["stt"])

_engine = None
_engine_kind: str | None = None


def _load_engine():
    global _engine, _engine_kind
    if _engine is not None:
        return _engine_kind, _engine

    model_size = os.getenv("STT_MODEL", "medium")
    device = os.getenv("STT_DEVICE", "cuda")
    compute = os.getenv("STT_COMPUTE", "float16")

    # Try faster-whisper first (lower VRAM, faster on CUDA)
    try:
        from faster_whisper import WhisperModel  # type: ignore

        _engine = WhisperModel(model_size, device=device, compute_type=compute)
        _engine_kind = "faster_whisper"
        print(f"[STT] faster-whisper loaded: {model_size} on {device} ({compute})")
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
        print(f"[STT] openai-whisper loaded: {model_size}")
        return _engine_kind, _engine
    except ImportError:
        pass
    except Exception as e:
        print(f"[STT] openai-whisper failed: {e}")

    raise RuntimeError(
        "No STT engine available. "
        "Install faster-whisper (pip install faster-whisper) "
        "or openai-whisper (pip install openai-whisper ffmpeg-python)."
    )


@router.get("/status")
def stt_status():
    """Health-check: returns engine name or error."""
    try:
        kind, _ = _load_engine()
        return {"ok": True, "engine": kind}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/transcribe")
async def stt_transcribe(file: UploadFile = File(...)):
    """
    Accepts a browser audio blob (webm, ogg, mp4, wav) and returns transcribed text.
    The client should send multipart/form-data with field name 'file'.
    """
    try:
        kind, engine = _load_engine()
    except Exception as e:
        raise HTTPException(501, f"STT engine not available: {e}")

    tmpdir = pathlib.Path(tempfile.mkdtemp(prefix="stt_"))
    try:
        # Preserve original extension so ffmpeg/soundfile can detect format
        raw_name = file.filename or "audio.webm"
        suffix = pathlib.Path(raw_name).suffix or ".webm"
        audio_path = tmpdir / f"upload{suffix}"
        content = await file.read()
        audio_path.write_bytes(content)

        if kind == "faster_whisper":
            segments, _info = engine.transcribe(
                str(audio_path),
                language="en",
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
            )
            text = " ".join(s.text.strip() for s in segments).strip()
        else:
            # openai-whisper
            result = engine.transcribe(str(audio_path), language="en", fp16=False)
            text = (result.get("text") or "").strip()

        return {"ok": True, "text": text}

    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
