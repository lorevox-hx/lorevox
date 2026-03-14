from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class OutboundEventType(str, Enum):
    STATUS = "status"
    TOKEN = "token"
    ASSISTANT_MESSAGE_COMPLETE = "assistant_message_complete"
    PROJECTION_PATCH = "projection_patch"
    PHASE_CHANGED = "phase_changed"
    FATIGUE_STATUS = "fatigue_status"
    ERROR = "error"


class BaseOutboundEvent(BaseModel):
    type: OutboundEventType
    session_id: str


class StatusEvent(BaseOutboundEvent):
    type: OutboundEventType = OutboundEventType.STATUS
    state: str
    detail: Optional[str] = None


class TokenEvent(BaseOutboundEvent):
    type: OutboundEventType = OutboundEventType.TOKEN
    delta: str


class AssistantMessageCompleteEvent(BaseOutboundEvent):
    type: OutboundEventType = OutboundEventType.ASSISTANT_MESSAGE_COMPLETE
    message_id: str
    text: str


class ProjectionPatchEvent(BaseOutboundEvent):
    type: OutboundEventType = OutboundEventType.PROJECTION_PATCH
    revision: int
    patch: Dict[str, Any] = Field(default_factory=dict)
    projection: Dict[str, Any] = Field(default_factory=dict)


class PhaseChangedEvent(BaseOutboundEvent):
    type: OutboundEventType = OutboundEventType.PHASE_CHANGED
    phase: str
    hidden_context: Dict[str, Any] = Field(default_factory=dict)


class FatigueStatusEvent(BaseOutboundEvent):
    type: OutboundEventType = OutboundEventType.FATIGUE_STATUS
    fatigue_score: int
    distress_score: int
    momentum_score: int
    affect_state: str


class ErrorEvent(BaseOutboundEvent):
    type: OutboundEventType = OutboundEventType.ERROR
    code: str
    message: str


def to_payload(event: BaseOutboundEvent) -> Dict[str, Any]:
    return event.model_dump()
