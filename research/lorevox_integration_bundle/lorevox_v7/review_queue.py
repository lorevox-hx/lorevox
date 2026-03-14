from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ReviewAction(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    EDIT = "edit"


class ReviewItem(BaseModel):
    item_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_type: str
    session_id: str
    status: str
    timestamp: str
    data: Dict[str, Any]


class ReviewDecision(BaseModel):
    item_id: str
    action: ReviewAction
    decided_at: str
    original_status: str
    final_status: str
    edited_data: Optional[Dict[str, Any]] = None


class ReviewQueueManager:
    """Gatekeeper between AI proposals and verified history ledgers."""

    def __init__(self, data_dir: str = "./archive_data"):
        self.data_dir = data_dir
        self.queue_file = os.path.join(data_dir, "review_queue.jsonl")
        self.decisions_file = os.path.join(data_dir, "decisions.jsonl")
        self.destinations = {
            "claim": os.path.join(data_dir, "facts.jsonl"),
            "event": os.path.join(data_dir, "timeline.jsonl"),
            "relationship": os.path.join(data_dir, "relationships.jsonl"),
            "entity": os.path.join(data_dir, "entities.jsonl"),
        }
        os.makedirs(self.data_dir, exist_ok=True)

    @staticmethod
    def _utcnow() -> str:
        return datetime.now(timezone.utc).isoformat()

    def get_pending_items(self) -> List[ReviewItem]:
        return [item for item in self._read_all_queue_items() if item.status == "pending"]

    def process_action(
        self,
        item_id: str,
        action: ReviewAction,
        edited_data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        items = self._read_all_queue_items()
        target_item = next((item for item in items if item.item_id == item_id), None)
        if not target_item or target_item.status != "pending":
            return False

        original_status = target_item.status
        if action == ReviewAction.REJECT:
            target_item.status = "rejected"
            final_status = target_item.status
        elif action == ReviewAction.APPROVE:
            target_item.status = "approved"
            final_status = target_item.status
            self._commit_to_archive(target_item.item_type, target_item.data)
        elif action == ReviewAction.EDIT:
            if not edited_data:
                raise ValueError("edited_data is required for EDIT action")
            merged = dict(edited_data)
            merged["source"] = target_item.data.get("source", {})
            merged["provenance_flag"] = "human_edited"
            target_item.status = "edited_and_approved"
            final_status = target_item.status
            self._commit_to_archive(target_item.item_type, merged)
        else:  # pragma: no cover
            raise ValueError(f"Unknown action: {action}")

        self._append_decision(ReviewDecision(
            item_id=item_id,
            action=action,
            decided_at=self._utcnow(),
            original_status=original_status,
            final_status=final_status,
            edited_data=edited_data,
        ))
        self._rewrite_queue(items)
        return True

    def _commit_to_archive(self, item_type: str, data: Dict[str, Any]) -> None:
        target_file = self.destinations.get(item_type)
        if not target_file:
            raise ValueError(f"Unknown item type: {item_type}")
        record = {
            "verified_at": self._utcnow(),
            "data": data,
        }
        with open(target_file, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    def _append_decision(self, decision: ReviewDecision) -> None:
        with open(self.decisions_file, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(decision.model_dump(), ensure_ascii=False) + "\n")

    def _read_all_queue_items(self) -> List[ReviewItem]:
        if not os.path.exists(self.queue_file):
            return []
        with open(self.queue_file, "r", encoding="utf-8") as handle:
            return [ReviewItem(**json.loads(line)) for line in handle if line.strip()]

    def _rewrite_queue(self, items: List[ReviewItem]) -> None:
        with open(self.queue_file, "w", encoding="utf-8") as handle:
            for item in items:
                handle.write(json.dumps(item.model_dump(), ensure_ascii=False) + "\n")
