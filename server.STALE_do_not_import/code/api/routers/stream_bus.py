from __future__ import annotations
import threading
from collections import defaultdict, deque
from typing import Deque, Dict

_lock = threading.Lock()
_streams: Dict[str, Deque[str]] = defaultdict(deque)
_closed = set()

def publish(stream_id: str, delta: str) -> None:
    if not stream_id:
        return
    with _lock:
        if stream_id in _closed:
            return
        _streams[stream_id].append(delta)

def close(stream_id: str) -> None:
    if not stream_id:
        return
    with _lock:
        _closed.add(stream_id)

def drain(stream_id: str, max_items: int = 512) -> str:
    if not stream_id:
        return ""
    with _lock:
        q = _streams.get(stream_id)
        if not q:
            return ""
        parts = []
        for _ in range(min(max_items, len(q))):
            parts.append(q.popleft())
        return "".join(parts)

def is_closed(stream_id: str) -> bool:
    with _lock:
        return stream_id in _closed
