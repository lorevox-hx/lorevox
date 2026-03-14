from __future__ import annotations

import json
import os
from typing import Iterable, List


class JsonlFileIO:
    """Small local JSONL helper for Lorevox review builds.

    This is intentionally simple and local-first. It is enough for review,
    tests, and early integration before swapping in a richer persistence layer.
    """

    def __init__(self, root: str = "."):
        self.root = root
        os.makedirs(self.root, exist_ok=True)

    def _path(self, relative_name: str) -> str:
        return os.path.join(self.root, relative_name)

    async def append_to_jsonl(self, relative_name: str, rows: Iterable[dict]) -> None:
        path = self._path(relative_name)
        with open(path, "a", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    def read_jsonl(self, relative_name: str) -> List[dict]:
        path = self._path(relative_name)
        if not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]
