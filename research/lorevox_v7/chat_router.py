from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from lorevox_v7.extract_live import LiveExtractionPatch, LiveExtractor
from lorevox_v7.extract_session import SessionExtractor
from lorevox_v7.narrative_engine import (
    LiveProfileProjection,
    NarrativePhase,
    NarrativeTracker,
    PromptBundle,
    PromptComposer,
)
from lorevox_v7.session_store import SessionState, SessionStore
from lorevox_v7.transcript_store import TranscriptStore
from lorevox_v7.websocket_events import (
    AssistantMessageCompleteEvent,
    ErrorEvent,
    FatigueStatusEvent,
    OutboundEventType,
    PhaseChangedEvent,
    ProjectionPatchEvent,
    StatusEvent,
    TokenEvent,
    to_payload,
)


class StreamingLLMClient(Protocol):
    async def astream(self, messages: List[Dict[str, str]]) -> Any:
        ...

    async def ainvoke(self, prompt: str, temperature: float = 0.0, response_format: Optional[dict] = None) -> str:
        ...


class StartTurnRequest(BaseModel):
    session_id: str
    message: str
    params: Dict[str, Any] = Field(default_factory=dict)


class ChatRouterDependencies(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    session_store: SessionStore
    transcript_store: TranscriptStore
    prompt_composer: PromptComposer
    live_extractor: LiveExtractor
    session_extractor: Optional[SessionExtractor] = None
    llm_client: Any


def build_chat_router(deps: ChatRouterDependencies) -> APIRouter:
    router = APIRouter()

    @router.websocket("/api/chat/ws")
    async def chat_websocket(websocket: WebSocket):
        await websocket.accept()
        session_id = "unknown"
        try:
            init_data = await websocket.receive_text()
            start = StartTurnRequest(**json.loads(init_data))
            session_id = start.session_id
            person_id = start.params.get("person_id")
            state = await deps.session_store.get_or_create_session(session_id, person_id=person_id)

            pending_message = start.message
            while True:
                if not pending_message:
                    payload = await websocket.receive_text()
                    incoming = StartTurnRequest(**json.loads(payload))
                    pending_message = incoming.message

                await _handle_user_turn(
                    websocket=websocket,
                    deps=deps,
                    session_id=session_id,
                    user_msg=pending_message,
                )
                pending_message = ""
        except WebSocketDisconnect:
            await _on_disconnect(session_id, deps)
        except Exception as exc:
            await websocket.send_json(to_payload(ErrorEvent(
                session_id=session_id,
                code="router_exception",
                message=str(exc),
            )))
            await _on_disconnect(session_id, deps)

    return router


async def _handle_user_turn(
    websocket: WebSocket,
    deps: ChatRouterDependencies,
    session_id: str,
    user_msg: str,
) -> None:
    state = await deps.session_store.get_or_create_session(session_id)
    await deps.session_store.append_turn(session_id, "user", user_msg)
    await deps.transcript_store.append_turn(session_id, {"role": "user", "content": user_msg})

    state = await deps.session_store.get_or_create_session(session_id)
    state.vitals.turn_count += 1
    state.vitals.recent_response_lengths.append(len(user_msg.split()))

    detected_person = _detect_person_candidate(user_msg, state.projection)
    current_year = _extract_year_context(user_msg)

    phase = NarrativeTracker.evaluate_next_phase(
        projection=state.projection,
        vitals=state.vitals,
        user_message=user_msg,
        detected_person=detected_person,
        current_year_context=current_year,
    )

    bundle = deps.prompt_composer.build_bundle(
        phase=phase,
        projection=state.projection,
        vitals=state.vitals,
        user_message=user_msg,
        current_year_context=current_year,
        detected_person=detected_person,
    )

    await deps.session_store.mark_phase(session_id, phase.value)

    await websocket.send_json(to_payload(PhaseChangedEvent(
        session_id=session_id,
        phase=phase.value,
        hidden_context=bundle.hidden_context,
    )))
    await websocket.send_json(to_payload(FatigueStatusEvent(
        session_id=session_id,
        fatigue_score=NarrativeTracker.calculate_fatigue(state.vitals),
        distress_score=NarrativeTracker.calculate_distress(state.vitals),
        momentum_score=NarrativeTracker.calculate_momentum(state.vitals),
        affect_state=state.vitals.last_affect_state,
    )))
    await websocket.send_json(to_payload(StatusEvent(
        session_id=session_id,
        state="generating",
        detail="Lori is composing a response.",
    )))

    lori_text = await _stream_lori_response(
        websocket=websocket,
        llm_client=deps.llm_client,
        bundle=bundle,
        user_msg=user_msg,
        session_id=session_id,
    )

    await deps.session_store.append_turn(session_id, "assistant", lori_text)
    await deps.transcript_store.append_turn(session_id, {"role": "assistant", "content": lori_text})

    message_id = str(uuid.uuid4())
    await websocket.send_json(to_payload(AssistantMessageCompleteEvent(
        session_id=session_id,
        message_id=message_id,
        text=lori_text,
    )))

    recent_turns = await deps.session_store.get_recent_turns(session_id, limit=6)
    state_snapshot = await deps.session_store.snapshot(session_id)
    if state_snapshot.vitals.turn_count % 3 == 0:
        asyncio.create_task(
            _run_lane_a_extraction(
                websocket=websocket,
                deps=deps,
                session_id=session_id,
                recent_turns=recent_turns,
                base_revision=state_snapshot.projection_revision,
            )
        )

    await deps.transcript_store.save_session_meta(session_id, {
        "person_id": state_snapshot.person_id,
        "turn_count": state_snapshot.vitals.turn_count,
        "last_phase": phase.value,
        "projection_revision": state_snapshot.projection_revision,
        "affect_state": state_snapshot.vitals.last_affect_state,
    })


async def _stream_lori_response(
    websocket: WebSocket,
    llm_client: StreamingLLMClient,
    bundle: PromptBundle,
    user_msg: str,
    session_id: str,
) -> str:
    final_text = ""
    messages = [
        {"role": "system", "content": bundle.render()},
        {"role": "user", "content": user_msg},
    ]
    async for chunk in llm_client.astream(messages):
        if not chunk:
            continue
        final_text += chunk
        await websocket.send_json(to_payload(TokenEvent(
            session_id=session_id,
            delta=chunk,
        )))
    return final_text


async def _run_lane_a_extraction(
    websocket: WebSocket,
    deps: ChatRouterDependencies,
    session_id: str,
    recent_turns: List[dict],
    base_revision: int,
) -> None:
    state = await deps.session_store.snapshot(session_id)
    prompt_projection = LiveProfileProjection(**state.projection.model_dump())
    updated_projection = await deps.live_extractor.run_provisional_extraction(
        recent_turns=recent_turns,
        current_projection=prompt_projection,
    )
    current = state.projection.model_dump()
    updated = updated_projection.model_dump()

    patch_dict: Dict[str, Any] = {}
    for key, value in updated.items():
        if current.get(key) != value:
            patch_dict[key] = value

    if not patch_dict:
        return

    patch = LiveExtractionPatch(
        new_basic_facts={},
        new_people_mentioned=[],
        new_eras_mentioned=[],
        scene_markers=[],
        last_major_topic=patch_dict.get("last_major_topic"),
        last_session_summary=patch_dict.get("last_session_summary"),
    )
    if "name" in patch_dict:
        patch.new_basic_facts["name"] = patch_dict["name"]
    if "dob" in patch_dict:
        patch.new_basic_facts["birth_year"] = patch_dict["dob"]
    if "birthplace" in patch_dict:
        patch.new_basic_facts["hometown"] = patch_dict["birthplace"]
    if "known_eras" in patch_dict:
        patch.new_eras_mentioned = [x for x in updated.get("known_eras", []) if x not in current.get("known_eras", [])]
    if "scene_backlog" in patch_dict:
        patch.scene_markers = [x for x in updated.get("scene_backlog", []) if x not in current.get("scene_backlog", [])]
    if "known_family" in patch_dict:
        existing = current.get("known_family", {})
        for name, relation in updated.get("known_family", {}).items():
            if name not in existing:
                patch.new_people_mentioned.append({
                    "name": name,
                    "relation_to_subject": relation,
                    "context_cue": "Discovered during live extraction",
                    "certainty": "low",
                })

    projection = await deps.session_store.apply_projection_patch(session_id, patch, base_revision=base_revision)
    state_after = await deps.session_store.get_state(session_id)
    if projection is None or state_after is None:
        return

    await websocket.send_json(to_payload(ProjectionPatchEvent(
        session_id=session_id,
        revision=state_after.projection_revision,
        patch=patch.model_dump(),
        projection=projection.model_dump(),
    )))


async def _on_disconnect(session_id: str, deps: ChatRouterDependencies) -> None:
    state = await deps.session_store.mark_disconnected(session_id)
    if state is None:
        return

    await deps.transcript_store.save_session_meta(session_id, {
        "person_id": state.person_id,
        "turn_count": state.vitals.turn_count,
        "last_phase": state.last_phase,
        "projection_revision": state.projection_revision,
        "affect_state": state.vitals.last_affect_state,
        "connected": False,
    })

    if deps.session_extractor and state.transcript:
        asyncio.create_task(
            deps.session_extractor.run_session_extraction(
                session_id=session_id,
                transcript_turns=[dict(t) for t in state.transcript],
            )
        )


def _extract_year_context(user_msg: str) -> Optional[int]:
    for token in user_msg.replace(",", " ").split():
        if token.isdigit() and len(token) == 4:
            try:
                year = int(token)
            except ValueError:
                continue
            if 1800 <= year <= 2100:
                return year
    return None


def _detect_person_candidate(user_msg: str, projection: LiveProfileProjection) -> Optional[str]:
    tokens = [t.strip(".,!?;:()[]{}\"'") for t in user_msg.split()]
    for token in tokens:
        if not token:
            continue
        if token[0].isupper() and token.lower() not in {"i", "we", "he", "she", "they"}:
            if token not in projection.known_family and token != projection.name:
                return token
    return None
