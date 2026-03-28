"""
Lorevox Affect Service — v6.1 Track B
=======================================
Rolling affect state management for the interview engine.

Design rules:
- Browser sends derived affect_state events (NOT raw emotions, NOT landmarks)
- Backend stores only AffectEvent records (affect_state, confidence, duration_ms)
- Rolling window smoother prevents every event from hitting the LLM
- Fallback path: works perfectly with no camera / no affect events
- Never exposes raw emotion labels to the interviewer or user
"""
from __future__ import annotations

import time
from collections import deque
from typing import Optional

from pydantic import BaseModel


# ─── Pydantic Models ─────────────────────────────────────────────────────────

VALID_AFFECT_STATES = {
    "steady",
    "engaged",
    "reflective",
    "moved",
    "distressed",
    "overwhelmed",
}


class AffectEvent(BaseModel):
    session_id: str
    timestamp: float
    section_id: Optional[str] = None
    affect_state: str           # must be one of VALID_AFFECT_STATES
    confidence: float           # 0.0 – 1.0
    duration_ms: int            # how long the state was sustained before sending
    source: str = "camera"      # "camera" | "manual" | "test"


class AffectContext(BaseModel):
    """
    Structured affect context passed to the interviewer LLM each turn.
    Uses safe, non-diagnostic language.
    """
    state: str = "steady"
    intensity: float = 0.0
    trend: str = "stable"       # "rising" | "falling" | "stable"
    camera_active: bool = False


class RecentAffectEvent(BaseModel):
    type: str                   # "affect_sustain" | "affect_spike" | "affect_drop"
    state: str
    intensity: float
    duration: float             # seconds


# ─── Rolling State Manager ────────────────────────────────────────────────────

class AffectStateManager:
    """
    Maintains a rolling window of affect events per session.

    Design:
    - Keeps last N seconds of events in a deque
    - Computes dominant state via weighted recency
    - Emits meaningful state changes only (debounced)
    - Works with empty state (camera off path)
    """

    WINDOW_SECONDS = 6.0       # rolling window for dominant state
    DEBOUNCE_SECONDS = 2.0     # minimum time between state-change emits
    MIN_CONFIDENCE = 0.65      # discard low-confidence events
    MIN_DURATION_MS = 1500     # discard very brief flickers

    def __init__(self):
        # session_id -> deque of (timestamp, affect_state, confidence)
        self._windows: dict[str, deque] = {}
        # session_id -> last emitted context
        self._last_context: dict[str, AffectContext] = {}
        # session_id -> timestamp of last emit
        self._last_emit_time: dict[str, float] = {}
        # session_id -> list of recent events for LLM context (last 5)
        self._recent_events: dict[str, deque] = {}

    # ── Ingest ───────────────────────────────────────────────────────────────

    def ingest(self, event: AffectEvent) -> bool:
        """
        Accept an incoming affect event.
        Returns True if a meaningful state change was detected.

        Time source: always uses server-received time (time.time()) for the rolling
        window — never the client-supplied event.timestamp. This prevents clock skew,
        delayed delivery, and test-event timestamp inconsistencies from corrupting
        the window logic. The client timestamp is preserved in AffectEvent for DB
        audit purposes only; it plays no role in rolling-state computation.
        """
        sid = event.session_id

        # Validate affect state
        if event.affect_state not in VALID_AFFECT_STATES:
            return False

        # Discard low confidence and very brief events
        if event.confidence < self.MIN_CONFIDENCE:
            return False
        if event.duration_ms < self.MIN_DURATION_MS:
            return False

        # Server-receipt time — authoritative for all window operations
        received_at = time.time()

        # Initialise session window
        if sid not in self._windows:
            self._windows[sid] = deque()
            self._recent_events[sid] = deque(maxlen=5)

        # Add to rolling window using server time
        self._windows[sid].append((received_at, event.affect_state, event.confidence))

        # Prune old events outside the window (server-time based)
        cutoff = received_at - self.WINDOW_SECONDS
        while self._windows[sid] and self._windows[sid][0][0] < cutoff:
            self._windows[sid].popleft()

        # Classify event type for LLM context
        event_type = self._classify_event_type(sid, event)
        self._recent_events[sid].append(RecentAffectEvent(
            type=event_type,
            state=event.affect_state,
            intensity=event.confidence,
            duration=round(event.duration_ms / 1000, 1),
        ))

        return True

    def _classify_event_type(self, session_id: str, event: AffectEvent) -> str:
        prev = self._last_context.get(session_id)
        if prev is None:
            return "affect_sustain"
        prev_intensity = prev.intensity
        delta = event.confidence - prev_intensity
        if delta > 0.15:
            return "affect_spike"
        if delta < -0.15:
            return "affect_drop"
        return "affect_sustain"

    # ── Compute Context ──────────────────────────────────────────────────────

    def get_context(self, session_id: str) -> AffectContext:
        """
        Return the current rolling affect context for a session.
        Safe fallback: returns steady/0.0 if no events or camera off.
        """
        window = self._windows.get(session_id)
        if not window:
            return AffectContext(camera_active=False)

        # Weighted dominant state (recency bias: more recent = more weight)
        scores: dict[str, float] = {}
        now = time.time()
        for i, (ts, state, conf) in enumerate(window):
            recency_weight = (i + 1) / len(window)  # 0..1, newer = higher
            scores[state] = scores.get(state, 0.0) + conf * recency_weight

        dominant = max(scores, key=lambda s: scores[s])
        intensity = round(min(scores[dominant], 1.0), 3)

        # Trend: compare dominant intensity to previous context
        prev = self._last_context.get(session_id)
        trend = "stable"
        if prev and prev.state == dominant:
            delta = intensity - prev.intensity
            if delta > 0.10:
                trend = "rising"
            elif delta < -0.10:
                trend = "falling"

        ctx = AffectContext(
            state=dominant,
            intensity=intensity,
            trend=trend,
            camera_active=True,
        )

        self._last_context[session_id] = ctx
        self._last_emit_time[session_id] = now
        return ctx

    def get_recent_events(self, session_id: str) -> list[RecentAffectEvent]:
        """Return the last up to 5 affect events for LLM context."""
        q = self._recent_events.get(session_id)
        if not q:
            return []
        return list(q)

    def clear_session(self, session_id: str) -> None:
        """Remove all in-memory state for a session (e.g. on session close)."""
        self._windows.pop(session_id, None)
        self._last_context.pop(session_id, None)
        self._last_emit_time.pop(session_id, None)
        self._recent_events.pop(session_id, None)


# ─── Singleton instance (shared across requests) ────────────────────────────

_manager = AffectStateManager()


def get_manager() -> AffectStateManager:
    return _manager


# ─── LLM Prompt Helpers ──────────────────────────────────────────────────────

def build_affect_prompt_block(
    context: AffectContext,
    recent_events: list[RecentAffectEvent],
) -> str:
    """
    Build the affect context block to inject into the interviewer system prompt.
    Returns empty string if camera is off or state is steady/low intensity.
    """
    if not context.camera_active:
        return ""
    if context.state == "steady" and context.intensity < 0.5:
        return ""

    lines = [
        "[AFFECT CONTEXT]",
        f"Current state: {context.state}",
        f"Intensity: {context.intensity:.2f}",
        f"Trend: {context.trend}",
        "",
        "Recent affect events:",
    ]
    for ev in recent_events:
        lines.append(f"  - {ev.type}: {ev.state} (intensity {ev.intensity:.2f}, {ev.duration}s)")

    lines += [
        "",
        "Use these signals silently to guide pacing, follow-ups, and check-ins.",
        "Never mention affect detection, sensors, or system state to the user.",
    ]
    return "\n".join(lines)


# ─── Interview Adaptive Guidance ─────────────────────────────────────────────

_AFFECT_GUIDANCE: dict[str, str] = {
    "moved": (
        "The person appears moved or emotionally touched. "
        "Use a softer follow-up. Offer: 'Take your time with this one.' "
        "Avoid topic pressure."
    ),
    "reflective": (
        "The person appears reflective. "
        "Allow space. Ask a gentle, open-ended question. "
        "Do not rush to the next item."
    ),
    "distressed": (
        "The person shows signs of distress. "
        "Check in: 'We can slow down if you'd like.' "
        "Avoid probing follow-ups. Prioritise emotional safety."
    ),
    "overwhelmed": (
        "The person appears overwhelmed. "
        "Pause probing. Offer: 'We can take a break or move to something lighter.' "
        "Do not advance the interview plan until they signal readiness."
    ),
    "engaged": (
        "The person appears engaged. "
        "Encourage elaboration and invite detail. "
        "Follow narrative threads naturally."
    ),
    "steady": "",
}


def get_adaptive_guidance(context: AffectContext) -> str:
    """
    Return a short guidance note for the interviewer based on current affect state.
    Returns empty string for steady/low-intensity states.
    """
    if not context.camera_active:
        return ""
    if context.state == "steady":
        return ""
    if context.intensity < 0.5:
        return ""
    return _AFFECT_GUIDANCE.get(context.state, "")
