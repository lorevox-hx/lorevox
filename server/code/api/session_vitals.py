from __future__ import annotations

from dataclasses import dataclass, field
from time import time
from typing import List, Optional


@dataclass
class SessionVitals:
    """
    Runtime-only state for Lori 7.1 interview pacing.

    This object should not be treated as archival truth. It exists to help Lori
    choose prompt style, pacing, and session-close behavior safely.
    """
    session_id: str
    started_at: float = field(default_factory=time)
    last_turn_at: float = field(default_factory=time)

    # interview routing
    current_pass: str = "pass1"   # pass1 | pass2a | pass2b
    current_era: Optional[str] = None
    current_mode: str = "open"    # open | recognition | gentle | grounding | light

    # runtime behavior
    turn_count: int = 0
    recent_response_lengths: List[int] = field(default_factory=list)
    last_affect_state: str = "neutral"
    affect_confidence: float = 0.0

    # optional soft signals
    repeated_uncertainty: int = 0
    pause_hint_seconds: float = 0.0

    def register_user_turn(self, text: str) -> None:
        self.turn_count += 1
        self.last_turn_at = time()
        self.recent_response_lengths.append(len((text or "").split()))
        self.recent_response_lengths = self.recent_response_lengths[-5:]

    def set_affect(self, state: str, confidence: float = 0.0) -> None:
        self.last_affect_state = state or "neutral"
        self.affect_confidence = float(confidence or 0.0)

    @property
    def avg_recent_words(self) -> int:
        if not self.recent_response_lengths:
            return 0
        return round(sum(self.recent_response_lengths) / len(self.recent_response_lengths))

    def estimate_fatigue(self) -> int:
        """
        Coarse 0-100 fatigue score from session length, short answers, and affect.
        This is intentionally simple and safe for first integration.
        """
        score = 0

        if self.turn_count > 12:
            score += min((self.turn_count - 12) * 5, 30)

        if self.avg_recent_words and self.avg_recent_words < 8:
            score += 25

        if self.last_affect_state == "fatigue_hint":
            score += 30
        elif self.last_affect_state == "distress_hint":
            score += 20
        elif self.last_affect_state == "confusion_hint":
            score += 15

        if self.repeated_uncertainty >= 2:
            score += 10

        return min(score, 100)

    def recommend_close(self) -> bool:
        return self.estimate_fatigue() >= 70
