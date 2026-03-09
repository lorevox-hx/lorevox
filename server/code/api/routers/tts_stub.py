from fastapi import APIRouter, HTTPException
router = APIRouter(prefix="/api/tts", tags=["tts-stub"])

@router.get("/voices")
def voices():
    return {"ok": True, "voices": [{"key":"lori","display_name":"p335 (TTS service on :8001)"}]}

@router.post("/speak_stream")
def speak_stream():
    raise HTTPException(501, "TTS runs on port 8001 (USE_TTS=1).")
