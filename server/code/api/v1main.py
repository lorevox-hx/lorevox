from __future__ import annotations

"""FastAPI app entrypoint — LoreVox v4.2 (JSON-Hybrid)

Run:
  uvicorn code.api.main:app --host 0.0.0.0 --port 8000

Notes
- The DB is created via server/scripts/init_db.py
- Interview flow: /api/interview/start + /api/interview/answer
- Profiles ingest your basic-info.html JSON 1:1
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import interview, sessions, people, profiles, timeline, media

app = FastAPI(title="LoreVox API", version="4.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(people.router)
app.include_router(profiles.router)
app.include_router(timeline.router)
app.include_router(media.router)

# Interview and session endpoints
app.include_router(interview.router)
app.include_router(sessions.router)

@app.get("/api/health")
def health():
    return {"ok": True, "version": "4.2"}
