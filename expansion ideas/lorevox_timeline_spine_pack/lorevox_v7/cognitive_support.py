from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CognitiveSignals:
    recall_difficulty: bool = False
    time_disorientation: bool = False
    processing_slowdown: bool = False
    repeated_uncertainty: bool = False


class CognitiveSupport:
    def recommend_mode(self, affect_state: str, signals: CognitiveSignals) -> str:
        if affect_state == "confusion_hint" or signals.time_disorientation or signals.recall_difficulty:
            return "recognition_mode"
        if affect_state == "fatigue_hint" or signals.processing_slowdown:
            return "light_mode"
        return "open_mode"

    def adapt_prompt(self, base_prompt: str, mode: str) -> str:
        if mode == "recognition_mode":
            return base_prompt + " You can answer with whichever option feels closer, even if you're not sure."
        if mode == "light_mode":
            return base_prompt + " We can keep this simple."
        return base_prompt
