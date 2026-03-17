from __future__ import annotations

from dataclasses import dataclass, field
from time import time
from typing import Dict, Iterable, List, Optional
from collections import deque


NORMALIZED_STATES = {
    "neutral",
    "engaged",
    "fatigue_hint",
    "confusion_hint",
    "distress_hint",
    "dissociation_hint",
}


@dataclass
class AffectObservation:
    raw_state: str
    confidence: float
    source: str = "vision"
    timestamp: float = field(default_factory=time)

    def normalized_state(self) -> str:
        state = (self.raw_state or "").strip().lower()
        mapping = {
            "neutral": "neutral",
            "engaged": "engaged",
            "high_cognitive_load": "confusion_hint",
            "confusion": "confusion_hint",
            "distress_or_tears": "distress_hint",
            "distress": "distress_hint",
            "staring_blankly": "dissociation_hint",
            "dissociation": "dissociation_hint",
            "slumping_eyes_closing": "fatigue_hint",
            "fatigue": "fatigue_hint",
        }
        return mapping.get(state, "neutral")


@dataclass
class SmoothedAffectState:
    state: str = "neutral"
    confidence: float = 0.0
    promoted_at: Optional[float] = None
    reason_codes: List[str] = field(default_factory=list)


class AffectEngine:
    def __init__(
        self,
        window_size: int = 5,
        fatigue_threshold: float = 0.65,
        confusion_threshold: float = 0.70,
        distress_threshold: float = 0.80,
        dissociation_threshold: float = 0.75,
        promotion_count: int = 3,
        distress_promotion_count: int = 2,
        cooldown_seconds: float = 8.0,
    ) -> None:
        self.window = deque(maxlen=window_size)
        self.current = SmoothedAffectState()
        self.fatigue_threshold = fatigue_threshold
        self.confusion_threshold = confusion_threshold
        self.distress_threshold = distress_threshold
        self.dissociation_threshold = dissociation_threshold
        self.promotion_count = promotion_count
        self.distress_promotion_count = distress_promotion_count
        self.cooldown_seconds = cooldown_seconds
        self._last_change_at = 0.0

    def add_observation(self, observation: AffectObservation) -> SmoothedAffectState:
        self.window.append(observation)
        self.current = self._recompute()
        return self.current

    def runtime_context(self) -> Dict[str, object]:
        return {
            "affect_state": self.current.state,
            "affect_confidence": round(self.current.confidence, 3),
            "affect_reason_codes": list(self.current.reason_codes),
        }

    def prompt_directives(self) -> List[str]:
        state = self.current.state
        if state == "fatigue_hint":
            return [
                "Keep the next response short and easy to process.",
                "Reduce cognitive load and avoid stacked questions.",
                "Prepare for a gentle close if fatigue persists.",
            ]
        if state == "confusion_hint":
            return [
                "Ask one simpler question.",
                "Use shorter clauses and clear chunking.",
                "Clarify gently without sounding corrective.",
            ]
        if state == "distress_hint":
            return [
                "Validate without probing.",
                "Offer pause, redirection, or a safer topic.",
                "Do not deepen a painful scene unless the narrator clearly chooses to continue.",
            ]
        if state == "dissociation_hint":
            return [
                "Use grounding language.",
                "Return to concrete, safe, present-oriented prompts.",
                "Prefer gentle tethering over interpretation.",
            ]
        return []

    def _recompute(self) -> SmoothedAffectState:
        observations = list(self.window)
        if not observations:
            return SmoothedAffectState()
        now = time()
        promoted_state = self.current.state
        promoted_conf = self.current.confidence
        reasons: List[str] = []

        candidates = {
            "distress_hint": self._candidate_score(observations, "distress_hint", self.distress_threshold),
            "dissociation_hint": self._candidate_score(observations, "dissociation_hint", self.dissociation_threshold),
            "confusion_hint": self._candidate_score(observations, "confusion_hint", self.confusion_threshold),
            "fatigue_hint": self._candidate_score(observations, "fatigue_hint", self.fatigue_threshold),
            "engaged": self._candidate_score(observations, "engaged", 0.60),
        }

        if candidates["distress_hint"]["count"] >= self.distress_promotion_count:
            promoted_state = "distress_hint"
            promoted_conf = candidates["distress_hint"]["mean_confidence"]
            reasons.extend(candidates["distress_hint"]["reason_codes"])
        elif candidates["dissociation_hint"]["count"] >= self.promotion_count:
            promoted_state = "dissociation_hint"
            promoted_conf = candidates["dissociation_hint"]["mean_confidence"]
            reasons.extend(candidates["dissociation_hint"]["reason_codes"])
        elif candidates["confusion_hint"]["count"] >= self.promotion_count:
            promoted_state = "confusion_hint"
            promoted_conf = candidates["confusion_hint"]["mean_confidence"]
            reasons.extend(candidates["confusion_hint"]["reason_codes"])
        elif candidates["fatigue_hint"]["count"] >= self.promotion_count:
            promoted_state = "fatigue_hint"
            promoted_conf = candidates["fatigue_hint"]["mean_confidence"]
            reasons.extend(candidates["fatigue_hint"]["reason_codes"])
        elif candidates["engaged"]["count"] >= self.promotion_count:
            promoted_state = "engaged"
            promoted_conf = candidates["engaged"]["mean_confidence"]
            reasons.extend(candidates["engaged"]["reason_codes"])
        else:
            promoted_state = "neutral"
            promoted_conf = self._mean_confidence(observations, {"neutral", "engaged"})
            reasons.append("window_decayed_to_neutral")

        if promoted_state != self.current.state:
            if (now - self._last_change_at) < self.cooldown_seconds:
                return SmoothedAffectState(
                    state=self.current.state,
                    confidence=self.current.confidence,
                    promoted_at=self.current.promoted_at,
                    reason_codes=self.current.reason_codes + ["cooldown_hold"],
                )
            self._last_change_at = now
            return SmoothedAffectState(
                state=promoted_state,
                confidence=round(promoted_conf, 3),
                promoted_at=now,
                reason_codes=reasons,
            )

        return SmoothedAffectState(
            state=promoted_state,
            confidence=round(promoted_conf, 3),
            promoted_at=self.current.promoted_at,
            reason_codes=reasons,
        )

    def _candidate_score(self, observations: Iterable[AffectObservation], target_state: str, threshold: float):
        matched = [obs for obs in observations if obs.normalized_state() == target_state and obs.confidence >= threshold]
        return {
            "count": len(matched),
            "mean_confidence": self._mean_confidence(matched, None),
            "reason_codes": [f"{target_state}:{len(matched)}_hits_over_{threshold}"],
        }

    @staticmethod
    def _mean_confidence(observations: Iterable[AffectObservation], allowed_states):
        scores = []
        for obs in observations:
            if allowed_states is None or obs.normalized_state() in allowed_states:
                scores.append(obs.confidence)
        return (sum(scores) / len(scores)) if scores else 0.0
