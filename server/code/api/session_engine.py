from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .session_vitals import SessionVitals


TIMELINE_ORDER = [
    "early_childhood",
    "school_years",
    "adolescence",
    "early_adulthood",
    "midlife",
    "later_life",
]


@dataclass
class PromptDecision:
    prompt: str
    current_pass: str
    current_era: Optional[str]
    current_mode: str
    reasons: List[str]


class SessionEngine:
    """
    Lori 7.1 runtime orchestrator.

    Responsibilities:
    - choose pass progression
    - choose current era
    - choose prompt mode
    - surface the next interview prompt
    """

    def initialize_from_seed(self, vitals: SessionVitals, timeline_spine: Optional[Dict]) -> None:
        if timeline_spine and timeline_spine.get("periods"):
            vitals.current_pass = "pass2a"
            vitals.current_era = timeline_spine["periods"][0]["label"]
            vitals.current_mode = "open"
        else:
            vitals.current_pass = "pass1"
            vitals.current_era = None
            vitals.current_mode = "open"

    def choose_mode(self, vitals: SessionVitals, cognitive_mode: Optional[str] = None) -> str:
        if vitals.last_affect_state in ("distress_hint", "dissociation_hint"):
            return "grounding"
        if cognitive_mode:
            return cognitive_mode
        if vitals.last_affect_state == "fatigue_hint":
            return "light"
        return "open"

    def next_prompt(
        self,
        vitals: SessionVitals,
        profile: Dict,
        timeline_spine: Optional[Dict] = None,
        cognitive_mode: Optional[str] = None,
    ) -> PromptDecision:
        name = (
            profile.get("preferred")
            or profile.get("fullname")
            or profile.get("name")
            or "this person"
        )

        vitals.current_mode = self.choose_mode(vitals, cognitive_mode)
        reasons: List[str] = []

        if vitals.current_pass == "pass1":
            reasons.append("timeline_seed_not_ready")
            return PromptDecision(
                prompt="When were you born? And where were you born?",
                current_pass=vitals.current_pass,
                current_era=vitals.current_era,
                current_mode=vitals.current_mode,
                reasons=reasons,
            )

        if not vitals.current_era:
            vitals.current_era = TIMELINE_ORDER[0]

        if vitals.current_pass == "pass2a":
            reasons.append("timeline_spine_walk")
            return PromptDecision(
                prompt=self._timeline_prompt(vitals.current_era, vitals.current_mode),
                current_pass=vitals.current_pass,
                current_era=vitals.current_era,
                current_mode=vitals.current_mode,
                reasons=reasons,
            )

        reasons.append("narrative_depth_pass")
        return PromptDecision(
            prompt=self._depth_prompt(vitals.current_era, vitals.current_mode, name),
            current_pass=vitals.current_pass,
            current_era=vitals.current_era,
            current_mode=vitals.current_mode,
            reasons=reasons,
        )

    def advance_era(self, vitals: SessionVitals) -> None:
        if not vitals.current_era:
            vitals.current_era = TIMELINE_ORDER[0]
            return
        try:
            idx = TIMELINE_ORDER.index(vitals.current_era)
        except ValueError:
            vitals.current_era = TIMELINE_ORDER[0]
            return
        if idx < len(TIMELINE_ORDER) - 1:
            vitals.current_era = TIMELINE_ORDER[idx + 1]

    def start_depth_pass(self, vitals: SessionVitals, era: Optional[str] = None) -> None:
        vitals.current_pass = "pass2b"
        if era:
            vitals.current_era = era

    def _timeline_prompt(self, era: str, mode: str) -> str:
        prompts = {
            "early_childhood": "Let's begin near the beginning. What do you know about the place where you were born, and where you lived when you were very young?",
            "school_years": "Thinking about your school years, what town, school, or neighborhood feels most connected to that time?",
            "adolescence": "As you got older, what changed most in your life during those years—school, friends, family, work, or where you lived?",
            "early_adulthood": "What do you think of as the beginning of your adult life? Where were you living then?",
            "midlife": "What responsibilities, jobs, or family roles shaped your middle adult years the most?",
            "later_life": "What major transitions stand out most from your later adult years?",
        }
        base = prompts.get(era, "Let's continue building the life timeline.")
        if mode == "recognition":
            return base + " You can answer with whichever option feels closest, even if you're not sure."
        if mode == "light":
            return base + " We can keep this simple."
        if mode == "grounding":
            return "We can go gently. What place from that part of life feels safest or easiest to begin with?"
        return base

    def _depth_prompt(self, era: str, mode: str, name: str) -> str:
        prompts = {
            "early_childhood": "When you picture your earliest home, what room, smell, or sound comes back first?",
            "school_years": "What is one vivid memory from your school years that still feels close to you now?",
            "adolescence": "When you think about your teenage years, what place, person, or feeling stands out most clearly?",
            "early_adulthood": "What moment made early adult life start to feel real to you?",
            "midlife": "What scene best captures what those middle years felt like day to day?",
            "later_life": "Looking back on later life, what moments feel the most meaningful now?",
        }
        base = prompts.get(era, f"Let's deepen the story around {name}'s life.")
        if mode == "recognition":
            return base + " If it helps, you can start with a place, a person, or a routine."
        if mode == "light":
            return base + " We can keep to one small memory."
        if mode == "grounding":
            return "We can stay with this lightly, or move somewhere gentler for now."
        return base
