from fastapi import APIRouter
router = APIRouter(prefix="/api", tags=["ping"])

@router.get("/ping")
def ping():
    return {"ok": True}

# WO-10K: Add /api/health so both API and TTS have consistent health endpoints.
# Bug Panel and diagnostics can use the same path for both services.
@router.get("/health")
def health():
    return {"ok": True, "service": "api"}
