from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from lorevox_v7.extract_live import LiveExtractionPatch, LiveProfileProjection
from lorevox_v7.narrative_engine import SessionVitals


@dataclass
class SessionState:
    session_id: str
    person_id: Optional[str] = None
    vitals: SessionVitals = field(default_factory=lambda: SessionVitals(session_id=""))
    projection: LiveProfileProjection = field(default_factory=LiveProfileProjection)
    transcript: List[dict] = field(default_factory=list)
    projection_revision: int = 0
    last_phase: Optional[str] = None
    connected: bool = True
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_activity_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def touch(self) -> None:
        self.last_activity_at = datetime.now(timezone.utc).isoformat()


class SessionStore:
    """In-memory session coordinator for the review bundle.

    This is deliberately thin and replaceable. It centralizes state mutation so
    chat_router stays orchestration-focused.
    """

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}
        self._lock = asyncio.Lock()

    async def get_or_create_session(self, session_id: str, person_id: Optional[str] = None) -> SessionState:
        async with self._lock:
            state = self._sessions.get(session_id)
            if state is None:
                vitals = SessionVitals(session_id=session_id)
                projection = LiveProfileProjection(person_id=person_id)
                state = SessionState(
                    session_id=session_id,
                    person_id=person_id,
                    vitals=vitals,
                    projection=projection,
                )
                self._sessions[session_id] = state
            elif person_id and not state.person_id:
                state.person_id = person_id
                state.projection.person_id = person_id
            state.connected = True
            state.touch()
            return state

    async def append_turn(self, session_id: str, role: str, content: str, **extra: object) -> dict:
        async with self._lock:
            state = self._sessions[session_id]
            turn = {"role": role, "content": content, **extra}
            state.transcript.append(turn)
            state.touch()
            return dict(turn)

    async def get_recent_turns(self, session_id: str, limit: int = 6) -> List[dict]:
        async with self._lock:
            state = self._sessions[session_id]
            return [dict(t) for t in state.transcript[-limit:]]

    async def mark_phase(self, session_id: str, phase: str) -> None:
        async with self._lock:
            state = self._sessions[session_id]
            state.last_phase = phase
            state.vitals.last_completed_phase = phase  # type: ignore[assignment]
            state.touch()

    async def update_affect(self, session_id: str, affect_state: str) -> Optional[SessionVitals]:
        async with self._lock:
            state = self._sessions.get(session_id)
            if state is None:
                return None
            state.vitals.last_affect_state = affect_state
            state.touch()
            return state.vitals

    async def snapshot(self, session_id: str) -> SessionState:
        async with self._lock:
            state = self._sessions[session_id]
            clone = SessionState(
                session_id=state.session_id,
                person_id=state.person_id,
                vitals=SessionVitals(**state.vitals.model_dump()),
                projection=LiveProfileProjection(**state.projection.model_dump()),
                transcript=[dict(t) for t in state.transcript],
                projection_revision=state.projection_revision,
                last_phase=state.last_phase,
                connected=state.connected,
                created_at=state.created_at,
                last_activity_at=state.last_activity_at,
            )
            return clone

    async def apply_projection_patch(
        self,
        session_id: str,
        patch: LiveExtractionPatch,
        base_revision: Optional[int] = None,
    ) -> Optional[LiveProfileProjection]:
        async with self._lock:
            state = self._sessions.get(session_id)
            if state is None:
                return None
            if base_revision is not None and base_revision != state.projection_revision:
                # Late patch; still merge because patches are additive, but revision advances.
                pass
            state.projection.apply_patch(patch)
            state.projection_revision += 1
            state.touch()
            return LiveProfileProjection(**state.projection.model_dump())

    async def mark_disconnected(self, session_id: str) -> Optional[SessionState]:
        async with self._lock:
            state = self._sessions.get(session_id)
            if state is None:
                return None
            state.connected = False
            state.touch()
            return state

    async def get_state(self, session_id: str) -> Optional[SessionState]:
        async with self._lock:
            state = self._sessions.get(session_id)
            if state is None:
                return None
            return state
