from fastapi import APIRouter
router = APIRouter(prefix="/api", tags=["ping"])

@router.get("/ping")
def ping():
    return {"ok": True}
