from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NarrativePhase(str, Enum):
    """High-level hidden interview phases aligned to Lorevox 7 planning."""

    ORIENTATION = "orientation"
    LIFE_CHAPTERS = "life_chapters"
    SCENE_CAPTURE = "scene_capture"
    THEMATIC_DEEPENING = "thematic_deepening"
    LEGACY_MODE = "legacy_mode"
    RELATIONSHIP_MAPPING = "relationship_mapping"
    CHRONOLOGY_CLARIFICATION = "chronology_clarification"
    GROUNDING = "grounding"
    FATIGUE_PAUSE = "fatigue_pause"
    GENTLE_REENTRY = "gentle_reentry"
    SESSION_CLOSE = "session_close"


class SessionVitals(BaseModel):
    """Tracks conversational and affective health during the current session."""

    session_id: str
    turn_count: int = 0
    recent_response_lengths: List[int] = Field(default_factory=list)
    recent_question_types: List[str] = Field(default_factory=list)
    last_affect_state: str = "steady"
    last_safe_topic: Optional[str] = None
    last_completed_phase: Optional[NarrativePhase] = None
    scene_depth_score: int = 0
    turns_since_new_fact: int = 0
    turns_since_new_person: int = 0

    @property
    def avg_words(self) -> int:
        if not self.recent_response_lengths:
            return 50
        sample = self.recent_response_lengths[-3:]
        return sum(sample) // len(sample)


class LiveProfileProjection(BaseModel):
    """Provisional working memory used for skip-logic and UI convenience only.

    This is not archival truth. It is a shadow built from provisional extraction.
    """

    person_id: Optional[str] = None
    name: str = ""
    dob: Optional[str] = None
    birthplace: str = ""
    known_family: Dict[str, str] = Field(default_factory=dict)
    known_eras: List[str] = Field(default_factory=list)
    scene_backlog: List[str] = Field(default_factory=list)
    last_major_topic: Optional[str] = None
    last_session_summary: Optional[str] = None


class PromptDirective(BaseModel):
    priority: int
    kind: str
    content: str


class PromptBundle(BaseModel):
    persona: str
    directives: List[PromptDirective] = Field(default_factory=list)
    hidden_context: Dict[str, Any] = Field(default_factory=dict)
    known_facts: Dict[str, Any] = Field(default_factory=dict)

    def render(self) -> str:
        ordered = sorted(self.directives, key=lambda d: d.priority)
        parts = [self.persona]
        if self.known_facts:
            facts = " | ".join(f"{k}: {v}" for k, v in self.known_facts.items() if v)
            if facts:
                parts.append(f"[ARCHIVE KNOWLEDGE: {facts}]")
        for directive in ordered:
            parts.append(f"[{directive.kind.upper()}: {directive.content}]")
        return "\n".join(parts)


class NarrativeTracker:
    """Decides Lori's next hidden mode using v7 narrative doctrine."""

    @staticmethod
    def calculate_fatigue(vitals: SessionVitals) -> int:
        score = 0
        if vitals.turn_count > 10:
            score += (vitals.turn_count - 10) * 8
        if vitals.turn_count > 3 and vitals.avg_words < 10:
            score += 35
        if vitals.last_affect_state in {"distressed", "overwhelmed"}:
            score += 45
        elif vitals.last_affect_state == "steady" and vitals.turn_count > 12:
            score += 20
        return min(score, 100)

    @staticmethod
    def calculate_distress(vitals: SessionVitals) -> int:
        if vitals.last_affect_state == "overwhelmed":
            return 90
        if vitals.last_affect_state == "distressed":
            return 75
        if vitals.last_affect_state == "moved":
            return 35
        return 10

    @staticmethod
    def calculate_momentum(vitals: SessionVitals) -> int:
        score = 60
        if vitals.avg_words < 8:
            score -= 25
        if vitals.turns_since_new_fact > 3:
            score -= 15
        if vitals.scene_depth_score > 60:
            score += 15
        return max(0, min(score, 100))

    @classmethod
    def evaluate_next_phase(
        cls,
        projection: LiveProfileProjection,
        vitals: SessionVitals,
        user_message: str,
        detected_person: Optional[str] = None,
        current_year_context: Optional[int] = None,
    ) -> NarrativePhase:
        fatigue = cls.calculate_fatigue(vitals)
        distress = cls.calculate_distress(vitals)
        momentum = cls.calculate_momentum(vitals)

        if fatigue >= 80:
            return NarrativePhase.FATIGUE_PAUSE
        if distress >= 80:
            return NarrativePhase.GROUNDING
        if vitals.turn_count == 0 and (projection.last_major_topic or projection.known_eras):
            return NarrativePhase.GENTLE_REENTRY
        if detected_person and detected_person not in projection.known_family:
            return NarrativePhase.RELATIONSHIP_MAPPING
        if not projection.name or not projection.dob or not projection.birthplace:
            return NarrativePhase.ORIENTATION

        lowered = user_message.lower()
        scene_triggers = ["remember when", "suddenly", "finally", "felt like", "the day that", "i can still see", "i can still smell"]
        chronology_triggers = ["before that", "after that", "around then", "i'm not sure what year", "sometime before"]
        legacy_triggers = ["what i want remembered", "legacy", "lesson", "what mattered most"]
        theme_triggers = ["always", "never", "kept happening", "pattern", "resilience", "faith", "belonging"]

        if any(t in lowered for t in scene_triggers):
            return NarrativePhase.SCENE_CAPTURE
        if any(t in lowered for t in chronology_triggers):
            return NarrativePhase.CHRONOLOGY_CLARIFICATION
        if any(t in lowered for t in legacy_triggers):
            return NarrativePhase.LEGACY_MODE
        if any(t in lowered for t in theme_triggers):
            return NarrativePhase.THEMATIC_DEEPENING
        if fatigue >= 65 and momentum < 35:
            return NarrativePhase.SESSION_CLOSE
        return NarrativePhase.LIFE_CHAPTERS


class HistoricalAnchorResolver:
    def __init__(self, world_events_db: List[dict]):
        self.world_events_db = world_events_db

    def build_anchor(self, dob: Optional[str], current_year_context: Optional[int]) -> Optional[str]:
        if not dob or not current_year_context:
            return None
        try:
            birth_year = int(str(dob).split("-")[0])
        except (ValueError, TypeError):
            return None
        age_at_time = current_year_context - birth_year
        matches = [e for e in self.world_events_db if int(e.get("year", -1)) == int(current_year_context)]
        if not matches:
            return None
        event = matches[0].get("event", "")
        if not event:
            return None
        return (
            f"The user would have been about {age_at_time} years old in {current_year_context}. "
            f"Relevant world context: {event}. Use this only if it fits naturally."
        )


class PromptComposer:
    """Compiles a directive stack for Lori's next turn."""

    persona = (
        "You are Lori, a warm, patient oral historian and memoir biographer for Lorevox. "
        "Guide recollection gently. Never sound like a form, intake worker, or clinical questionnaire. "
        "Keep replies concise, natural, and emotionally respectful."
    )

    def __init__(self, world_events_db: Optional[List[dict]] = None):
        self.anchor_resolver = HistoricalAnchorResolver(world_events_db or [])

    def _known_facts(self, projection: LiveProfileProjection) -> Dict[str, Any]:
        facts: Dict[str, Any] = {}
        if projection.name:
            facts["name"] = projection.name
        if projection.dob:
            facts["dob"] = projection.dob
        if projection.birthplace:
            facts["birthplace"] = projection.birthplace
        if projection.known_family:
            facts["family"] = ", ".join(f"{n} ({r})" for n, r in projection.known_family.items())
        if projection.known_eras:
            facts["eras"] = ", ".join(projection.known_eras)
        return facts

    def build_bundle(
        self,
        phase: NarrativePhase,
        projection: LiveProfileProjection,
        vitals: SessionVitals,
        user_message: str,
        current_year_context: Optional[int] = None,
        detected_person: Optional[str] = None,
    ) -> PromptBundle:
        bundle = PromptBundle(
            persona=self.persona,
            known_facts=self._known_facts(projection),
            hidden_context={
                "phase": phase.value,
                "fatigue": NarrativeTracker.calculate_fatigue(vitals),
                "distress": NarrativeTracker.calculate_distress(vitals),
                "momentum": NarrativeTracker.calculate_momentum(vitals),
            },
        )

        # highest-priority overrides first
        if phase == NarrativePhase.FATIGUE_PAUSE:
            bundle.directives.append(PromptDirective(
                priority=10,
                kind="urgent",
                content=(
                    "The user appears fatigued or emotionally saturated. Do not ask another exploratory question. "
                    "Validate what they shared, briefly summarize today's progress, and gently offer to pause for today."
                ),
            ))
            return bundle

        if phase == NarrativePhase.GROUNDING:
            bundle.directives.append(PromptDirective(
                priority=10,
                kind="grounding",
                content=(
                    "Slow down. Use one gentle grounding move. Offer a safer or lighter present-time anchor, or invite a pause. "
                    "Do not push deeper into a painful memory unless the user clearly chooses it."
                ),
            ))
            return bundle

        if phase == NarrativePhase.SESSION_CLOSE:
            bundle.directives.append(PromptDirective(
                priority=15,
                kind="session_close",
                content=(
                    "Bring this session to a warm stopping point. Reflect what was covered and ask whether they would like to stop here today."
                ),
            ))
            return bundle

        if phase == NarrativePhase.GENTLE_REENTRY:
            topic = projection.last_major_topic or (projection.scene_backlog[0] if projection.scene_backlog else "the last part of their story")
            bundle.directives.append(PromptDirective(
                priority=20,
                kind="reentry",
                content=(
                    f"Welcome them back warmly. Acknowledge the last major topic ({topic}) and ask whether they want to return there or explore something else today."
                ),
            ))

        if phase == NarrativePhase.ORIENTATION:
            bundle.directives.append(PromptDirective(
                priority=30,
                kind="orientation",
                content=(
                    "Locate them gently in time and place. Ask one open question about where their story began, where they grew up, "
                    "or what kind of family household they came from."
                ),
            ))
        elif phase == NarrativePhase.LIFE_CHAPTERS:
            bundle.directives.append(PromptDirective(
                priority=30,
                kind="life_chapters",
                content=(
                    "Map the boundaries of this era. Ask about who they were with, what everyday life felt like, or what defined that period."
                ),
            ))
        elif phase == NarrativePhase.SCENE_CAPTURE:
            bundle.directives.append(PromptDirective(
                priority=30,
                kind="scene_capture",
                content=(
                    "They mentioned a specific moment. Do not ask 'what happened next'. Ask a single question that puts you in the room: "
                    "one sensory detail, one object, or one immediate feeling."
                ),
            ))
        elif phase == NarrativePhase.RELATIONSHIP_MAPPING:
            person = detected_person or "this person"
            bundle.directives.append(PromptDirective(
                priority=30,
                kind="relationship_mapping",
                content=(
                    f"The user introduced {person}. Learn their relation and emotional significance without sounding like an interrogator."
                ),
            ))
        elif phase == NarrativePhase.CHRONOLOGY_CLARIFICATION:
            bundle.directives.append(PromptDirective(
                priority=30,
                kind="chronology",
                content=(
                    "Clarify sequence without demanding exact dates. Ask whether this was before or after another known event, or which era it belongs to."
                ),
            ))
        elif phase == NarrativePhase.THEMATIC_DEEPENING:
            bundle.directives.append(PromptDirective(
                priority=30,
                kind="theme",
                content=(
                    "Connect the current story to a wider pattern such as duty, resilience, belonging, humor, faith, or identity. Keep it gentle and grounded."
                ),
            ))
        elif phase == NarrativePhase.LEGACY_MODE:
            bundle.directives.append(PromptDirective(
                priority=30,
                kind="legacy",
                content=(
                    "Invite reflection on what mattered most, what they want remembered, what they learned, or what kind of voice fits their future obituary or memoir."
                ),
            ))

        anchor = self.anchor_resolver.build_anchor(projection.dob, current_year_context)
        if anchor:
            bundle.directives.append(PromptDirective(priority=40, kind="historical_anchor", content=anchor))

        bundle.directives.append(PromptDirective(
            priority=90,
            kind="style",
            content="Keep the reply to 1-3 sentences. Ask at most one exploratory question.",
        ))
        return bundle
