"""
Lorevox Memory Archive
======================
Person-first, session-based transcript archive.

Layout on disk:
  DATA_DIR/memory/archive/people/<person_id>/
      index.json
      sessions/<session_id>/
          meta.json
          transcript.jsonl   ← append-only, one JSON object per line
          transcript.txt     ← human-readable, rebuilt on demand
          artifacts/
              audio/
              images/
              docs/

Rules enforced here:
  1. Original transcripts are NEVER overwritten (append-only JSONL).
  2. Every event carries a timestamp and session provenance.
  3. The index.json is updated whenever a new session starts.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Root path
# ---------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _safe_id(value: Optional[str], fallback: str) -> str:
    v = (value or "").strip()
    return v if v else fallback


# ---------------------------------------------------------------------------
# Directory helpers
# ---------------------------------------------------------------------------
def person_root(person_id: Optional[str]) -> Path:
    pid = _safe_id(person_id, "unknown_person")
    return DATA_DIR / "memory" / "archive" / "people" / pid


def session_root(person_id: Optional[str], session_id: str) -> Path:
    sid = _safe_id(session_id, "unknown_session")
    return person_root(person_id) / "sessions" / sid


# ---------------------------------------------------------------------------
# ensure_session  — call once at session start
# ---------------------------------------------------------------------------
def ensure_session(
    *,
    person_id: Optional[str],
    session_id: str,
    mode: str,
    title: str = "",
    started_at: Optional[str] = None,
    extra_meta: Optional[Dict[str, Any]] = None,
) -> Path:
    """
    Create the session directory tree and write meta.json (idempotent).
    Returns the session root path.
    """
    root = session_root(person_id, session_id)

    # Create artifact sub-dirs
    for sub in ("artifacts/audio", "artifacts/images", "artifacts/docs"):
        (root / sub).mkdir(parents=True, exist_ok=True)

    # Write meta.json only on first call
    meta_path = root / "meta.json"
    if not meta_path.exists():
        meta: Dict[str, Any] = {
            "person_id": _safe_id(person_id, "unknown_person"),
            "session_id": session_id,
            "mode": mode,
            "title": title or "",
            "started_at": started_at or _now_iso(),
            "created_at": _now_iso(),
        }
        if extra_meta:
            meta["extra"] = extra_meta
        meta_path.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # Ensure person index.json exists
    _ensure_person_index(person_id)

    # Register session in person index
    _register_session_in_index(
        person_id=person_id,
        session_id=session_id,
        title=title or "",
        mode=mode,
        started_at=started_at or _now_iso(),
    )

    return root


# ---------------------------------------------------------------------------
# append_event  — call for every user/assistant turn
# ---------------------------------------------------------------------------
def append_event(
    *,
    person_id: Optional[str],
    session_id: str,
    role: str,
    content: str,
    ts: Optional[str] = None,
    question_id: Optional[str] = None,
    section_id: Optional[str] = None,
    anchor_id: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Append a single event to transcript.jsonl (append-only — never rewrites).
    """
    root = session_root(person_id, session_id)
    root.mkdir(parents=True, exist_ok=True)

    event: Dict[str, Any] = {
        "ts": ts or _now_iso(),
        "role": (role or "").strip().lower(),
        "content": content or "",
    }
    if question_id:
        event["question_id"] = question_id
    if section_id:
        event["section_id"] = section_id
    if anchor_id:
        event["anchor_id"] = anchor_id
    if meta:
        event["meta"] = meta

    jsonl_path = root / "transcript.jsonl"
    with jsonl_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


# ---------------------------------------------------------------------------
# rebuild_txt  — regenerate human-readable transcript
# ---------------------------------------------------------------------------
def rebuild_txt(*, person_id: Optional[str], session_id: str) -> None:
    """
    Rebuild transcript.txt from transcript.jsonl.
    Safe to call repeatedly — always regenerates from source.
    """
    root = session_root(person_id, session_id)
    jsonl_path = root / "transcript.jsonl"
    if not jsonl_path.exists():
        return

    out_lines: List[str] = []
    for raw in jsonl_path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            ev = json.loads(raw)
        except Exception:
            continue
        role = (ev.get("role") or "").upper()
        ts = ev.get("ts") or ""
        content = (ev.get("content") or "").strip()
        qid = ev.get("question_id", "")
        sid = ev.get("section_id", "")

        prefix = f"[{ts}] {role}"
        if sid:
            prefix += f" [{sid}]"
        if qid:
            prefix += f" (q:{qid})"
        out_lines.append(f"{prefix}:\n{content}")

    (root / "transcript.txt").write_text(
        "\n\n".join(out_lines) + "\n", encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# read_transcript  — load all events for a session
# ---------------------------------------------------------------------------
def read_transcript(
    *, person_id: Optional[str], session_id: str
) -> List[Dict[str, Any]]:
    """Return all transcript events for a session as a list of dicts."""
    root = session_root(person_id, session_id)
    jsonl_path = root / "transcript.jsonl"
    if not jsonl_path.exists():
        return []
    events: List[Dict[str, Any]] = []
    for raw in jsonl_path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        try:
            events.append(json.loads(raw))
        except Exception:
            continue
    return events


# ---------------------------------------------------------------------------
# list_sessions  — enumerate sessions for a person
# ---------------------------------------------------------------------------
def list_sessions(person_id: Optional[str]) -> List[Dict[str, Any]]:
    """Return session summaries from person index.json."""
    index_path = person_root(person_id) / "index.json"
    if not index_path.exists():
        return []
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
        return data.get("sessions", [])
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _ensure_person_index(person_id: Optional[str]) -> None:
    pid = _safe_id(person_id, "unknown_person")
    index_path = person_root(person_id) / "index.json"
    if not index_path.exists():
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text(
            json.dumps(
                {"person_id": pid, "sessions": []},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )


def update_thread_anchor(
    *,
    person_id: Optional[str],
    session_id: str,
    topic_label: str = "",
    topic_summary: str = "",
    active_era: str = "",
    last_turn_ids: Optional[List[str]] = None,
    last_narrator_turns: Optional[List[str]] = None,
    # WO-9 additions for stronger continuity
    subtopic_label: str = "",
    continuation_keywords: Optional[List[str]] = None,
    last_meaningful_user_turn: str = "",
    last_meaningful_assistant_turn: str = "",
) -> None:
    """
    Store or update the thread anchor for a session.
    WO-9: Now includes subtopic, continuation keywords, and last meaningful turns
    for stronger resume continuity.
    """
    root = session_root(person_id, session_id)
    root.mkdir(parents=True, exist_ok=True)
    anchor_path = root / "thread_anchor.json"
    anchor: Dict[str, Any] = {
        "updated_at": _now_iso(),
        "session_id": session_id,
        "topic_label": topic_label or "",
        "topic_summary": topic_summary or "",
        "subtopic_label": subtopic_label or "",
        "active_era": active_era or "",
        "continuation_keywords": (continuation_keywords or [])[:10],
        "last_meaningful_user_turn": (last_meaningful_user_turn or "")[:500],
        "last_meaningful_assistant_turn": (last_meaningful_assistant_turn or "")[:500],
        "last_turn_ids": last_turn_ids or [],
        "last_narrator_turns": (last_narrator_turns or [])[-5:],
    }
    anchor_path.write_text(
        json.dumps(anchor, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def read_thread_anchor(
    *, person_id: Optional[str], session_id: str
) -> Optional[Dict[str, Any]]:
    """Read the thread anchor for a session, or None if not set."""
    root = session_root(person_id, session_id)
    anchor_path = root / "thread_anchor.json"
    if not anchor_path.exists():
        return None
    try:
        return json.loads(anchor_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def get_latest_session_id(person_id: Optional[str]) -> Optional[str]:
    """Return the most recently created session_id for a person."""
    sessions = list_sessions(person_id)
    if not sessions:
        return None
    # Sort by started_at descending
    sessions.sort(key=lambda s: s.get("started_at", ""), reverse=True)
    return sessions[0].get("session_id")


def export_transcript_txt(*, person_id: Optional[str], session_id: str) -> str:
    """Return a formatted plain-text transcript for export."""
    events = read_transcript(person_id=person_id, session_id=session_id)
    lines: List[str] = []
    for ev in events:
        role = (ev.get("role") or "").upper()
        ts = ev.get("ts") or ""
        content = (ev.get("content") or "").strip()
        if not content:
            continue
        # Format timestamp to human-readable if possible
        try:
            dt = datetime.fromisoformat(ts)
            ts_display = dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            ts_display = ts
        lines.append(f"[{ts_display}] {role}:\n{content}")
    return "\n\n".join(lines) + "\n" if lines else ""


# ---------------------------------------------------------------------------
# WO-9: Rolling summary  — compact narrator-scoped conversation memory
# WO-10: Upgraded with scoring, pruning, multi-thread, and confidence
# ---------------------------------------------------------------------------
def read_rolling_summary(person_id: Optional[str]) -> Dict[str, Any]:
    """Read the rolling summary for a narrator, or {} if absent."""
    path = person_root(person_id) / "rolling_summary.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_rolling_summary(person_id: Optional[str], payload: Dict[str, Any]) -> None:
    """Write the rolling summary for a narrator."""
    root = person_root(person_id)
    root.mkdir(parents=True, exist_ok=True)
    path = root / "rolling_summary.json"
    payload["last_updated"] = _now_iso()
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# WO-10 Phase 1: Summary scoring and pruning
# ---------------------------------------------------------------------------
import time as _time

_LIFE_THREAD_KEYWORDS = {
    "army", "military", "service", "enlisted", "deploy", "stationed",
    "married", "wedding", "wife", "husband", "spouse", "children", "baby",
    "school", "college", "university", "graduate", "diploma",
    "job", "work", "career", "retire", "company", "hired",
    "church", "faith", "god", "religion",
    "farm", "ranch", "land", "crop", "cattle",
    "died", "passed", "funeral", "death", "cancer",
    "mother", "father", "parents", "brother", "sister",
}


_LIFE_TRANSITION_MARKERS = {
    "moved", "left", "arrived", "started", "ended", "graduated", "enlisted",
    "married", "divorced", "born", "died", "retired", "hired", "fired",
    "promoted", "deployed", "returned", "lost", "found", "built", "sold",
    "opened", "closed", "met", "joined", "quit",
}

_EMOTIONAL_SALIENCE_MARKERS = {
    "never forget", "changed my life", "hardest thing", "proudest", "worst day",
    "best day", "broke my heart", "scared", "grateful", "miracle", "devastated",
    "lucky", "terrified", "joy", "tears", "cried", "loved", "hated", "regret",
    "ashamed", "relieved", "heartbroken",
}


def score_summary_item(item: Dict[str, Any], now_ts: float) -> float:
    """
    Score a summary item by recency, importance, repetition, and open-thread value.
    WO-10B: Also rewards narrative richness (life transitions, emotional salience)
    and content depth — not raw length, but substance indicators.
    """
    score = 0.0

    # Recency: items seen within the last hour score highest, decaying over days
    last_seen = item.get("last_seen_at", 0)
    if last_seen:
        age_hours = max(0.0, (now_ts - last_seen) / 3600.0)
        score += max(0.0, 10.0 - age_hours * 0.1)  # 10 pts, decays ~0.1/hr
    else:
        score += 1.0  # no timestamp → low baseline

    # Narrative importance: life-thread keywords score higher
    kind = item.get("kind", "fact")
    text = str(item.get("text", "")).lower()
    if kind in ("thread", "open_loop"):
        score += 5.0
    elif kind == "preference":
        score += 3.0
    elif kind == "tone":
        score += 2.0

    # Life-thread keyword boost
    for kw in _LIFE_THREAD_KEYWORDS:
        if kw in text:
            score += 2.0
            break

    # WO-10B: Life transition marker boost
    transition_count = sum(1 for m in _LIFE_TRANSITION_MARKERS if m in text)
    score += min(4.0, transition_count * 1.5)

    # WO-10B: Emotional salience boost
    emotional_count = sum(1 for m in _EMOTIONAL_SALIENCE_MARKERS if m in text)
    score += min(3.0, emotional_count * 2.0)

    # WO-10B: Content depth bonus — not raw length, but a minor bonus for
    # substantive content (>100 chars suggests a real narrative, not a label)
    text_len = len(text)
    if text_len > 200:
        score += 2.0  # clearly a rich narrative fragment
    elif text_len > 100:
        score += 1.0  # moderate substance

    # Repetition: referenced multiple times = important
    times_ref = item.get("times_referenced", 1)
    score += min(5.0, times_ref * 1.5)

    # Unresolved/open value
    if item.get("status") in ("active", "open"):
        score += 3.0

    # Explicit user emphasis (narrator repeated or corrected)
    if item.get("user_emphasized"):
        score += 4.0

    item["score"] = round(score, 2)
    return score


def prune_rolling_summary(summary: Dict[str, Any], max_items: int = 30) -> Dict[str, Any]:
    """Score and prune summary items, keeping top-N by score."""
    items = summary.get("scored_items", [])
    if not items:
        # Migrate from WO-9 flat format if needed
        items = _migrate_flat_summary_to_scored(summary)

    now_ts = _time.time()
    for item in items:
        score_summary_item(item, now_ts)

    # Sort by score descending, keep top max_items
    items.sort(key=lambda x: x.get("score", 0), reverse=True)
    summary["scored_items"] = items[:max_items]

    # Also prune open_threads to active only
    threads = summary.get("active_threads", [])
    if threads:
        for t in threads:
            _score_thread(t, now_ts)
        threads.sort(key=lambda x: x.get("score", 0), reverse=True)
        summary["active_threads"] = threads[:5]  # max 5 concurrent threads

    return summary


def _migrate_flat_summary_to_scored(summary: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert WO-9 flat key_facts_mentioned list to scored items."""
    items: List[Dict[str, Any]] = []
    now_ts = _time.time()
    for fact in summary.get("key_facts_mentioned", []):
        items.append({
            "text": fact,
            "kind": "fact",
            "last_seen_at": now_ts,
            "times_referenced": 1,
            "source_turn_ids": [],
            "status": "active",
        })
    if summary.get("emotional_tone"):
        items.append({
            "text": f"Narrator tone: {summary['emotional_tone']}",
            "kind": "tone",
            "last_seen_at": now_ts,
            "times_referenced": 1,
            "source_turn_ids": [],
            "status": "active",
        })
    if summary.get("last_question_asked"):
        items.append({
            "text": summary["last_question_asked"],
            "kind": "question",
            "last_seen_at": now_ts,
            "times_referenced": 1,
            "source_turn_ids": [],
            "status": "open",
        })
    for thread in summary.get("open_threads", []):
        items.append({
            "text": thread,
            "kind": "open_loop",
            "last_seen_at": now_ts,
            "times_referenced": 1,
            "source_turn_ids": [],
            "status": "open",
        })
    return items


# ---------------------------------------------------------------------------
# WO-10 Phase 2: Multi-thread awareness
# ---------------------------------------------------------------------------
def _score_thread(thread: Dict[str, Any], now_ts: float) -> float:
    """
    Score a conversation thread by recency, depth, and open status.
    WO-10B: Also rewards narrative richness of the thread summary.
    """
    score = 0.0
    last_seen = thread.get("last_seen_at", 0)
    if last_seen:
        age_hours = max(0.0, (now_ts - last_seen) / 3600.0)
        score += max(0.0, 10.0 - age_hours * 0.05)
    turn_count = len(thread.get("related_turn_ids", []))
    score += min(8.0, turn_count * 1.0)
    status = thread.get("status", "active")
    if status == "active":
        score += 5.0
    elif status == "dormant":
        score += 1.0
    # resolved threads get no bonus

    # WO-10B: Narrative richness of thread summary
    summary_text = (thread.get("summary") or "").lower()
    summary_len = len(summary_text)
    if summary_len > 200:
        score += 3.0  # rich narrative thread
    elif summary_len > 100:
        score += 1.5

    # WO-10B: Life-transition content in thread summary boosts it
    transition_hits = sum(1 for m in _LIFE_TRANSITION_MARKERS if m in summary_text)
    score += min(3.0, transition_hits * 1.0)

    # WO-10B: Demote identity/homeplace threads so they only win as last resort
    if _is_identity_fallback_thread(thread):
        score = max(0.0, score * 0.3)  # heavy demotion

    thread["score"] = round(score, 2)
    return score


def update_active_threads(
    person_id: Optional[str],
    new_topic_label: str,
    new_subtopic: str = "",
    new_era: str = "",
    turn_id: str = "",
    user_text: str = "",
    lori_text: str = "",
) -> List[Dict[str, Any]]:
    """
    Update the multi-thread tracker for a narrator.
    - If a matching thread exists, update it.
    - If topic is new, create a new thread.
    - Decay dormant threads.
    Returns the updated thread list.
    """
    import uuid
    summary = read_rolling_summary(person_id)
    threads: List[Dict[str, Any]] = summary.get("active_threads", [])
    now_ts = _time.time()
    matched = False

    for t in threads:
        label = (t.get("topic_label") or "").lower()
        new_label = (new_topic_label or "").lower()
        # Match if labels overlap or are similar
        if new_label and (new_label in label or label in new_label or new_label == label):
            # Update existing thread
            t["last_seen_at"] = now_ts
            t["status"] = "active"
            if new_subtopic:
                t["subtopic_label"] = new_subtopic
            if new_era:
                t["related_era"] = new_era
            if turn_id:
                related = t.get("related_turn_ids", [])
                related.append(turn_id)
                t["related_turn_ids"] = related[-20:]  # keep last 20
            # WO-10B: Keep the LONGER of existing or new summary
            # so long narrator turns aren't overwritten by short ones
            new_summary = (user_text or "")[:500]
            if len(new_summary) > len(t.get("summary") or ""):
                t["summary"] = new_summary
            matched = True
            break
        else:
            # Decay non-matching threads
            if t.get("status") == "active":
                age_hours = (now_ts - (t.get("last_seen_at") or now_ts)) / 3600.0
                if age_hours > 24:
                    t["status"] = "dormant"

    if not matched and new_topic_label:
        threads.append({
            "thread_id": str(uuid.uuid4())[:8],
            "topic_label": new_topic_label,
            "subtopic_label": new_subtopic,
            "summary": (user_text or "")[:500],  # WO-10B: preserve more for richness scoring
            "score": 0.0,
            "last_seen_at": now_ts,
            "status": "active",
            "related_turn_ids": [turn_id] if turn_id else [],
            "related_era": new_era,
        })

    # Score and sort, keep top 5
    for t in threads:
        _score_thread(t, now_ts)
    threads.sort(key=lambda x: x.get("score", 0), reverse=True)
    threads = threads[:5]

    # Persist back
    summary["active_threads"] = threads
    write_rolling_summary(person_id, summary)
    return threads


_IDENTITY_FALLBACK_PATTERNS = {
    "birthplace", "childhood", "born in", "hometown", "grew up", "childhood home",
    "stanley", "north dakota", "fargo", "where were you born", "where you from",
    "early life", "earliest memory", "onboarding", "identity",
}


def _is_identity_fallback_thread(thread: Dict[str, Any]) -> bool:
    """WO-10B: Detect if a thread is an identity/homeplace fallback topic."""
    label = (thread.get("topic_label") or "").lower()
    summary = (thread.get("summary") or "").lower()
    for pat in _IDENTITY_FALLBACK_PATTERNS:
        if pat in label or pat in summary:
            return True
    return False


def choose_best_thread(
    anchor: Optional[Dict[str, Any]],
    threads: List[Dict[str, Any]],
    recent_turns: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Choose the strongest thread for resume.
    WO-10B: Identity/homeplace threads are demoted to last-resort status.
    They can only win if NO other active thread has a meaningful score.
    """
    if not threads:
        return None

    now_ts = _time.time()
    for t in threads:
        _score_thread(t, now_ts)
    threads.sort(key=lambda x: x.get("score", 0), reverse=True)

    # WO-10B: Separate identity-fallback threads from substantive threads
    substantive = [t for t in threads if not _is_identity_fallback_thread(t)]
    identity_only = [t for t in threads if _is_identity_fallback_thread(t)]

    # If we have ANY substantive thread with a meaningful score, prefer it
    if substantive and substantive[0].get("score", 0) > 3.0:
        best = substantive[0]
    else:
        best = threads[0]  # fall back to highest overall if nothing substantive

    # If anchor matches a different thread and is very recent, prefer anchor
    # WO-10B: But NOT if the anchor points to identity and substantive threads exist
    if anchor and anchor.get("topic_label"):
        anchor_label = anchor["topic_label"].lower()
        best_label = (best.get("topic_label") or "").lower()

        anchor_is_identity = any(pat in anchor_label for pat in _IDENTITY_FALLBACK_PATTERNS)

        if anchor_label != best_label and not (anchor_is_identity and substantive):
            # Check if anchor is within last 2 hours
            anchor_updated = anchor.get("updated_at", "")
            if anchor_updated:
                try:
                    from datetime import datetime, timezone
                    anchor_dt = datetime.fromisoformat(anchor_updated.replace("Z", "+00:00"))
                    age_hours = (datetime.now(timezone.utc) - anchor_dt).total_seconds() / 3600
                    if age_hours < 2:
                        # Anchor is very fresh — check if it matches a thread
                        for t in threads:
                            if anchor_label in (t.get("topic_label") or "").lower():
                                return t
                except Exception:
                    pass

    return best


# ---------------------------------------------------------------------------
# WO-10C: Single support thread selection for cognitive support mode
# ---------------------------------------------------------------------------
def wo10c_select_single_support_thread(
    anchor: Optional[Dict[str, Any]],
    threads: List[Dict[str, Any]],
    recent_turns: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Select ONE warm, familiar thread for cognitive support mode.
    Prefers: emotional salience > narrative richness > recency.
    Identity threads are acceptable here (unlike standard resume) because
    familiar ground is comforting for narrators with cognitive difficulty.
    Returns None if no threads are available.
    """
    if not threads:
        # Fall back to anchor if available
        if anchor and anchor.get("topic_label"):
            return {"topic_label": anchor.get("topic_label", "general"),
                    "summary": anchor.get("topic_summary", ""),
                    "related_era": anchor.get("active_era")}
        return None

    now_ts = _time.time()
    for t in threads:
        _score_thread(t, now_ts)

    # In CSM: override identity demotion — familiar is good
    for t in threads:
        if _is_identity_fallback_thread(t):
            # Restore score (undo the 0.3x penalty) — identity is comforting here
            t["score"] = t.get("score", 0) / 0.3 if t.get("score", 0) > 0 else 1.0

    # Boost threads with emotional salience markers
    for t in threads:
        summary_text = (t.get("summary") or "").lower()
        emotional_hits = sum(1 for m in _EMOTIONAL_SALIENCE_MARKERS if m in summary_text)
        if emotional_hits > 0:
            t["score"] = t.get("score", 0) + emotional_hits * 2.0

    threads.sort(key=lambda x: x.get("score", 0), reverse=True)
    return threads[0]


# ---------------------------------------------------------------------------
# WO-10 Phase 4: Resume confidence scoring
# ---------------------------------------------------------------------------
def score_resume_confidence(
    anchor: Optional[Dict[str, Any]],
    summary: Dict[str, Any],
    recent_turns: List[Dict[str, Any]],
    selected_thread: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Score how confident the resume should be.
    Returns { score: float 0-1, level: 'high'|'medium'|'low', reasons: [str] }
    """
    score = 0.0
    reasons: List[str] = []

    # 1. Anchor exists and has content
    if anchor and anchor.get("topic_summary"):
        score += 0.2
        reasons.append("anchor_exists")
    else:
        reasons.append("no_anchor")

    # 2. Anchor freshness (updated within last 24h is good)
    if anchor and anchor.get("updated_at"):
        try:
            from datetime import datetime, timezone
            anchor_dt = datetime.fromisoformat(anchor.get("updated_at", "").replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - anchor_dt).total_seconds() / 3600
            if age_hours < 2:
                score += 0.2
                reasons.append("anchor_fresh")
            elif age_hours < 24:
                score += 0.1
                reasons.append("anchor_recent")
            else:
                reasons.append("anchor_stale")
        except Exception:
            pass

    # 3. Recent turns support the same thread
    if recent_turns and selected_thread:
        thread_label = (selected_thread.get("topic_label") or "").lower()
        matching_turns = 0
        for t in recent_turns[-4:]:
            content = (t.get("content") or "").lower()
            if thread_label and any(kw in content for kw in thread_label.split()):
                matching_turns += 1
        if matching_turns >= 2:
            score += 0.2
            reasons.append("turns_support_thread")
        elif matching_turns >= 1:
            score += 0.1
            reasons.append("turns_partially_support")

    # 4. Thread has unresolved open loop
    if selected_thread and selected_thread.get("status") == "active":
        score += 0.15
        reasons.append("thread_active")

    # 5. Thread summary is specific (not generic)
    if selected_thread and len(selected_thread.get("summary", "")) > 50:
        score += 0.1
        reasons.append("thread_specific")

    # 6. Rolling summary has meaningful content
    scored_items = summary.get("scored_items", [])
    if len(scored_items) >= 3:
        score += 0.1
        reasons.append("rich_summary")

    # 7. Last question asked (Lori has an open question to resume from)
    if summary.get("last_question_asked"):
        score += 0.05
        reasons.append("open_question")

    score = min(1.0, score)
    level = "high" if score >= 0.6 else ("medium" if score >= 0.3 else "low")

    return {"score": round(score, 3), "level": level, "reasons": reasons}


def load_recent_archive_turns(
    person_id: Optional[str],
    session_id: Optional[str] = None,
    limit: int = 8,
) -> List[Dict[str, Any]]:
    """
    Load the most recent meaningful turns from the archive.
    Filters out [SYSTEM:...] messages to return only real narrator/Lori exchanges.
    """
    if not session_id:
        session_id = get_latest_session_id(person_id)
    if not session_id:
        return []

    events = read_transcript(person_id=person_id, session_id=session_id)
    # Filter out system prompts and empty content
    meaningful = [
        e for e in events
        if (e.get("content") or "").strip()
        and not (e.get("content") or "").strip().startswith("[SYSTEM:")
    ]
    return meaningful[-limit:]


def _register_session_in_index(
    *,
    person_id: Optional[str],
    session_id: str,
    title: str,
    mode: str,
    started_at: str,
) -> None:
    index_path = person_root(person_id) / "index.json"
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except Exception:
        data = {"person_id": _safe_id(person_id, "unknown_person"), "sessions": []}

    sessions: List[Dict[str, Any]] = data.get("sessions") or []

    # Avoid duplicates
    existing_ids = {s.get("session_id") for s in sessions}
    if session_id not in existing_ids:
        sessions.append(
            {
                "session_id": session_id,
                "title": title,
                "mode": mode,
                "started_at": started_at,
            }
        )
        data["sessions"] = sessions
        index_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
