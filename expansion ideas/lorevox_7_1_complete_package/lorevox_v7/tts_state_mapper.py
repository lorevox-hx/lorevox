from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class TTSProfile:
    speech_rate: float
    pitch: float
    energy: float
    onset_delay_ms: int
    clause_break_ms: int
    notes: str = ""


class TTSStateMapper:
    def __init__(self) -> None:
        self._profiles: Dict[str, TTSProfile] = {
            "neutral": TTSProfile(1.0, 1.0, 1.0, 150, 250, "Warm, attentive, natural baseline."),
            "engaged": TTSProfile(1.0, 1.0, 1.02, 120, 220, "Slightly brighter, but still calm and steady."),
            "fatigue_hint": TTSProfile(0.90, 0.96, 0.90, 500, 350, "Softer, slower, less demanding to process."),
            "confusion_hint": TTSProfile(0.95, 1.0, 1.0, 300, 750, "Clear chunking, crisp articulation, neutral pitch."),
            "distress_hint": TTSProfile(0.80, 0.88, 0.78, 2000, 900, "Very soft, slow, grounded, with space before reply."),
            "dissociation_hint": TTSProfile(0.85, 0.92, 0.85, 900, 1500, "Deliberate, tethering pace. Lower, steadier sound."),
        }

    def get_profile(self, affect_state: str) -> TTSProfile:
        return self._profiles.get(affect_state, self._profiles["neutral"])

    def to_synth_kwargs(self, affect_state: str):
        profile = self.get_profile(affect_state)
        return {
            "speech_rate": profile.speech_rate,
            "pitch": profile.pitch,
            "energy": profile.energy,
            "onset_delay_ms": profile.onset_delay_ms,
            "clause_break_ms": profile.clause_break_ms,
        }
