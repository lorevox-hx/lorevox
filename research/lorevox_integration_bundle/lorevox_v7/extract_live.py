from __future__ import annotations

import json
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class CandidatePerson(BaseModel):
    name: str = Field(description="Proper name of the person mentioned")
    relation_to_subject: str = Field(description="Inferred relation, tentative if needed")
    context_cue: str = Field(description="Why this person matters in the recent turns")
    certainty: str = Field(default="low", description="low, medium, or high")


class LiveExtractionPatch(BaseModel):
    """Strict provisional JSON patch for live async extraction."""

    new_basic_facts: Dict[str, str] = Field(default_factory=dict)
    new_people_mentioned: List[CandidatePerson] = Field(default_factory=list)
    new_eras_mentioned: List[str] = Field(default_factory=list)
    scene_markers: List[str] = Field(default_factory=list)
    last_major_topic: Optional[str] = None
    last_session_summary: Optional[str] = None


class LiveProfileProjection(BaseModel):
    """Working memory for UI and skip-logic only. Not archival truth."""

    person_id: Optional[str] = None
    name: str = ""
    dob: Optional[str] = None
    birthplace: str = ""
    known_family: Dict[str, str] = Field(default_factory=dict)
    known_eras: List[str] = Field(default_factory=list)
    scene_backlog: List[str] = Field(default_factory=list)
    last_major_topic: Optional[str] = None
    last_session_summary: Optional[str] = None

    def apply_patch(self, patch: LiveExtractionPatch) -> None:
        if not self.dob and "birth_year" in patch.new_basic_facts:
            self.dob = str(patch.new_basic_facts["birth_year"])
        if not self.birthplace and "hometown" in patch.new_basic_facts:
            self.birthplace = patch.new_basic_facts["hometown"]
        if not self.name and "name" in patch.new_basic_facts:
            self.name = patch.new_basic_facts["name"]

        for person in patch.new_people_mentioned:
            if person.name and person.name not in self.known_family:
                self.known_family[person.name] = person.relation_to_subject

        for era in patch.new_eras_mentioned:
            if era not in self.known_eras:
                self.known_eras.append(era)

        for scene in patch.scene_markers:
            if scene not in self.scene_backlog:
                self.scene_backlog.append(scene)

        if patch.last_major_topic:
            self.last_major_topic = patch.last_major_topic
        if patch.last_session_summary:
            self.last_session_summary = patch.last_session_summary


class LiveExtractor:
    """Lane A extractor: quick, asynchronous, provisional, non-blocking."""

    def __init__(self, llm_client):
        self.llm_client = llm_client

    def _build_extraction_prompt(self, recent_transcript: str) -> str:
        schema = LiveExtractionPatch.model_json_schema()
        return (
            "You are a provisional extraction pipeline for an oral-history studio. "
            "Extract only NEW information from the recent turns. Do not infer beyond what the user actually said. "
            "This output is provisional working memory for UI convenience and skip-logic, not archival truth. "
            "If nothing new appears, return empty arrays/objects.\n\n"
            f"Return JSON matching this schema exactly:\n{json.dumps(schema, ensure_ascii=False)}\n\n"
            f"RECENT TRANSCRIPT:\n{recent_transcript}"
        )

    async def run_provisional_extraction(
        self,
        recent_turns: List[dict],
        current_projection: LiveProfileProjection,
    ) -> LiveProfileProjection:
        transcript_block = "\n".join(
            f"{msg.get('role', 'unknown').upper()}: {msg.get('content', '')}" for msg in recent_turns
        )
        prompt = self._build_extraction_prompt(transcript_block)
        try:
            raw_response = await self.llm_client.ainvoke(
                prompt=prompt,
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            parsed_json = json.loads(raw_response)
            patch = LiveExtractionPatch(**parsed_json)
            current_projection.apply_patch(patch)
            return current_projection
        except Exception as exc:  # pragma: no cover - failure is intentionally non-fatal
            print(f"[LiveExtractor] non-fatal provisional extraction failure: {exc}")
            return current_projection
