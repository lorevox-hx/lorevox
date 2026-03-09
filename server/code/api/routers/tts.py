from __future__ import annotations
import os, json, base64
from io import BytesIO
from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/tts", tags=["tts"])

_DEFAULT_VOICES = [{"key": "lori", "display_name": "p335", "has_wav": False}]

def _speaker_for(key: str) -> str:
    key = (key or "lori").strip().lower()
    if key == "lori":
        return os.getenv("TTS_SPEAKER_LORI", "p335")
    return os.getenv("TTS_SPEAKER_LORI", "p335")

def _load_tts():
    from TTS.api import TTS  # type: ignore
    model_name = os.getenv("TTS_MODEL", "tts_models/en/vctk/vits")
    gpu = os.getenv("TTS_GPU", "0").strip().lower() in ("1","true","yes","y")
    return TTS(model_name=model_name, progress_bar=False, gpu=gpu)

_TTS = None

def warm():
    global _TTS
    if _TTS is None:
        _TTS = _load_tts()
        print("[TTS] warmed")

@router.get("/voices")
def voices():
    return {"ok": True, "voices": _DEFAULT_VOICES}

@router.post("/speak_stream")
def speak_stream(payload: Dict[str, Any]):
    global _TTS
    text = (payload.get("text") or "").strip()
    voice_key = (payload.get("voice") or "lori").strip()
    if not text:
        raise HTTPException(400, "text is required")

    if _TTS is None:
        try:
            _TTS = _load_tts()
        except Exception as e:
            raise HTTPException(501, f"Failed to load TTS: {e}")

    speaker = _speaker_for(voice_key)

    bio = BytesIO()
    try:
        import numpy as np  # type: ignore
        import soundfile as sf  # type: ignore
        wav = _TTS.tts(text=text, speaker=speaker)
        sf.write(bio, np.array(wav), samplerate=22050, format="WAV")
        wav_bytes = bio.getvalue()
    except Exception as e:
        raise HTTPException(500, f"TTS synthesis failed: {e}")

    b64 = base64.b64encode(wav_bytes).decode("ascii")

    def gen():
        yield json.dumps({"wav_b64": b64}) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")
