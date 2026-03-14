from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional


class TranscriptStore:
    """Persist session transcript turns and metadata locally as JSONL.

    This store is intentionally simple and append-only for the review bundle.
    """

    def __init__(self, root: str = "./archive_data/transcripts") -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _utcnow() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _session_dir(self, session_id: str) -> Path:
        path = self.root / session_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def transcript_path(self, session_id: str) -> Path:
        return self._session_dir(session_id) / "transcript.jsonl"

    def session_meta_path(self, session_id: str) -> Path:
        return self._session_dir(session_id) / "session_meta.json"

    async def append_turn(self, session_id: str, turn: Dict[str, object]) -> None:
        payload = dict(turn)
        payload.setdefault("timestamp", self._utcnow())
        with self.transcript_path(session_id).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")

    def read_turns(self, session_id: str) -> List[Dict[str, object]]:
        path = self.transcript_path(session_id)
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    async def save_session_meta(self, session_id: str, meta: Dict[str, object]) -> None:
        payload = dict(meta)
        payload["updated_at"] = self._utcnow()
        with self.session_meta_path(session_id).open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

    def read_session_meta(self, session_id: str) -> Optional[Dict[str, object]]:
        path = self.session_meta_path(session_id)
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
