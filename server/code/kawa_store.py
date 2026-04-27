"""
kawa_store.py — Local-first Kawa segment storage
WO-KAWA-UI-01A

Stores river segments as individual JSON files under:
  {DATA_DIR}/kawa/people/{person_id}/segments/{segment_id}.json

No database dependency. Segment history appended on every save.
"""

import json
import time
from pathlib import Path


def _kawa_base(data_dir: str, person_id: str) -> Path:
    p = Path(data_dir) / "kawa" / "people" / person_id / "segments"
    p.mkdir(parents=True, exist_ok=True)
    return p


def get_kawa_segment_path(data_dir: str, person_id: str, segment_id: str) -> Path:
    return _kawa_base(data_dir, person_id) / f"{segment_id}.json"


def load_kawa_segment(data_dir: str, person_id: str, segment_id: str):
    path = get_kawa_segment_path(data_dir, person_id, segment_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_kawa_segment(data_dir: str, person_id: str, segment: dict):
    path = get_kawa_segment_path(data_dir, person_id, segment["segment_id"])
    path.write_text(json.dumps(segment, ensure_ascii=False, indent=2), encoding="utf-8")


def append_kawa_history(segment: dict, prior: dict | None):
    """Append a snapshot of the prior version to the segment's history list."""
    segment.setdefault("history", [])
    if prior:
        segment["history"].append({
            "saved_at": time.time(),
            "snapshot": prior
        })
    return segment


def list_kawa_segments(data_dir: str, person_id: str):
    base = _kawa_base(data_dir, person_id)
    out = []
    for fp in sorted(base.glob("*.json")):
        try:
            out.append(json.loads(fp.read_text(encoding="utf-8")))
        except Exception:
            continue
    return out
