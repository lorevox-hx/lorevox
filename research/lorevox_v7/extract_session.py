from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class SourceSpan(BaseModel):
    turn_index: int = Field(description="Index of the USER turn in the transcript")
    exact_quote: str = Field(description="Short exact quote supporting this item")


class AtomicClaim(BaseModel):
    subject: str
    predicate: str
    object: str
    temporal_context: Optional[str] = None
    source: SourceSpan


class EntityProposal(BaseModel):
    name: str
    entity_type: str = Field(description="PERSON, PLACE, or ORGANIZATION")
    description: str
    source: SourceSpan


class RelationshipProposal(BaseModel):
    source_entity: str
    target_entity: str
    relationship_type: str
    source: SourceSpan


class EventProposal(BaseModel):
    title: str
    description: str
    date_string: str
    is_approximate: bool
    source: SourceSpan


class SessionExtractionResult(BaseModel):
    claims: List[AtomicClaim] = Field(default_factory=list)
    entities: List[EntityProposal] = Field(default_factory=list)
    relationships: List[RelationshipProposal] = Field(default_factory=list)
    events: List[EventProposal] = Field(default_factory=list)


class SessionExtractor:
    """Lane B extractor: slower, provenance-heavy, review-queue only."""

    def __init__(self, llm_client, file_io_service):
        self.llm_client = llm_client
        self.file_io = file_io_service

    @staticmethod
    def _utcnow() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _format_transcript_with_indices(self, turns: List[dict]) -> str:
        lines: List[str] = []
        for idx, turn in enumerate(turns):
            role = str(turn.get("role", "unknown")).upper()
            content = turn.get("content", "")
            prefix = f"[Turn {idx}] {role}:" if role == "USER" else f"{role}:"
            lines.append(f"{prefix} {content}")
        return "\n".join(lines)

    def _build_extraction_prompt(self, transcript: str) -> str:
        schema = SessionExtractionResult.model_json_schema()
        return (
            "You are an archival extraction engine for Lorevox. Read the interview transcript and extract structured proposals. "
            "Rules: (1) Break complex statements into atomic claims. (2) Every item must cite an exact quote and correct turn index. "
            "(3) Do not invent dates or precision. If timing is fuzzy, keep it fuzzy and mark approximation in the event proposal. "
            "(4) Extract only what the user's words support.\n\n"
            f"Return JSON matching this schema exactly:\n{json.dumps(schema, ensure_ascii=False)}\n\n"
            f"TRANSCRIPT:\n{transcript}"
        )

    async def run_session_extraction(self, session_id: str, transcript_turns: List[dict]) -> bool:
        transcript = self._format_transcript_with_indices(transcript_turns)
        prompt = self._build_extraction_prompt(transcript)
        try:
            raw_response = await self.llm_client.ainvoke(
                prompt=prompt,
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            parsed = json.loads(raw_response)
            result = SessionExtractionResult(**parsed)
            review_items = self._package_for_review(session_id, result)
            if review_items:
                await self.file_io.append_to_jsonl("review_queue.jsonl", review_items)
                print(f"[SessionExtractor] queued {len(review_items)} review item(s) for {session_id}")
            return True
        except Exception as exc:  # pragma: no cover - extraction failure should not corrupt archive
            print(f"[SessionExtractor] ERROR: archival extraction failed: {exc}")
            return False

    def _package_for_review(self, session_id: str, result: SessionExtractionResult) -> List[dict]:
        timestamp = self._utcnow()
        queue: List[dict] = []
        for item_type, items in (
            ("claim", result.claims),
            ("entity", result.entities),
            ("relationship", result.relationships),
            ("event", result.events),
        ):
            for item in items:
                queue.append(
                    {
                        "item_id": str(uuid.uuid4()),
                        "item_type": item_type,
                        "session_id": session_id,
                        "status": "pending",
                        "timestamp": timestamp,
                        "data": item.model_dump(),
                    }
                )
        return queue
