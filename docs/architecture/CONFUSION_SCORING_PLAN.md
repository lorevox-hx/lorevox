# Confusion Scoring & Memory Care Mode — Implementation Plan
**Phase 1 implemented 2026-03-23. Phases 2–6 pending.**
Generated: 2026-03-23 | Last updated: 2026-03-23

---

## Design refinements (incorporated after review)

Four refinements were agreed before implementation began. All phases below reflect them.

**1. Message-type classification replaces phrase-based empathy guard.**
The empathy rule now classifies every narrator message into one of four types before deciding how to respond: `interaction_feedback`, `emotional_distress`, `meta_confusion`, `content_answer`. The empathy acknowledgment fires only for `emotional_distress`. This solves the class of problem rather than the specific phrase that surfaced in testing.

**2. Scorer produces recommendations, not final modes.**
The scoring engine outputs `response_type`, `clarity_score`, `confusion_flags`, and `recommended_next_style`. A separate runtime decision layer in `chat_ws.py` combines these with existing Lorevox state to set `current_mode`. The scorer is never a second brain — it advises, the runtime layer decides.

**3. Authority precedence order.**
When multiple layers have a view on how Lori should behave, this order applies:
`safety / consent → human supervisor override → identity/onboarding state → adaptive score recommendation → default interview plan`

**4. Human-readable confusion reasons in the audit trail.**
`confusion_events` stores short interpretable reason strings alongside scores — e.g. "answered with timeline contradiction", "asked for question rewording", "nonresponsive to prior prompt" — so supervisors can understand why a score was assigned, not just what it was.

---

## What exists vs. what the proposal adds

### Already in the codebase (no work needed)

| Proposed concept | Existing equivalent | Where |
|---|---|---|
| Emotion signals (emotion_spike, drop, sustain) | `affect_events` table | `db.py` line 421 |
| `current_mode` (recognition, grounding, light) | `LORI_RUNTIME.mode` directive | `prompt_composer.py` line 334 |
| `cognitive_mode` (recognition, alongside) | `LORI_RUNTIME.cognitive_mode` | `prompt_composer.py` line 362 |
| Session payload / toggle storage | `sessions.payload_json` | `db.py` line 100 |
| Segment flagging | `segment_flags` table | `db.py` line 391 |
| Softened interview mode | `interview_softened` column | `interview_sessions` table |
| Free-form chat turns | `turns` table | `db.py` line 106 |

### What is missing and needs to be built

1. **`confusion_events` table** — per-turn scoring record with human-readable reasons
2. **`scoring_engine.py`** — heuristic scorer that produces `clarity_score`, `confusion_flags`, `response_type`, `recommended_next_style` (not final mode — recommendations only)
3. **Runtime decision layer in `chat_ws.py`** — combines scorer output with existing state to set `current_mode`, respecting the authority precedence order
4. **Memory care toggle** — read/write `memory_care_mode` from `sessions.payload_json`
5. **Supervisor endpoint** — retrieve confusion history with readable reasons, set memory care mode
6. ~~Two prompt fixes~~ — **DONE.** DOB phrasing and message-type empathy classification implemented 2026-03-23

### Important: SQLite, not Postgres

The proposal uses PostgreSQL syntax. The repo uses **SQLite**. All SQL below is adapted accordingly:
- `gen_random_uuid()` → Python `uuid.uuid4().hex`
- `TIMESTAMPTZ` → `TEXT`
- `JSONB` → `TEXT` (stored as JSON strings, loaded in Python)
- No `pgcrypto` extension needed

---

## Phase 1 — Fix immediate Lori behavior (prompt_composer.py)
**No new tables. No new files. Two targeted edits.**

### Fix 1: Onboarding DOB — ask for the actual date

**Current code (line 255):**
```python
"  2. Their date of birth (year is sufficient; exact date is better)\n"
```

**Replace with:**
```python
"  2. Their date of birth — ask for the full date (day, month, year). "
"     A precise date builds a better timeline. If they offer only a year, "
"     accept it and move on — do not press.\n"
```

**Why:** "Year is sufficient" is a memory-care softening that has no place in standard onboarding. Ask for the real date; accept whatever they give.

---

### Fix 2: Empathy rule — add meta-feedback guard

**Current code (lines 43–45):**
```python
" EMPATHY RULE: When the narrator expresses difficulty, pain, grief, regret, or loss, "
"always acknowledge their feeling warmly in your first sentence before asking any follow-up. "
"Do not immediately pivot to a factual or chronological question. "
"A brief, genuine acknowledgment ('That sounds like it was really hard') is enough before gently continuing."
```

**Replace with:**
```python
" EMPATHY RULE: When the narrator expresses genuine emotional difficulty — sadness, grief, "
"pain, regret, or loss — acknowledge their feeling warmly before asking any follow-up. "
"EXCEPTION: If the narrator's message is feedback about your questioning style "
"(phrases like 'don't you just want', 'why are you asking', 'just ask me', "
"'shouldn't you ask') — respond to the feedback directly. "
"Do not apply the empathy acknowledgment to meta-feedback. "
"A correction about how you are asking is not an expression of emotional distress."
```

**Why:** The LLM saw "hard to pinpoint" and fired the empathy phrase on a user who was giving interview design feedback, not expressing grief.

---

## Phase 2 — Add confusion_events table (db.py)

Add the following CREATE TABLE call inside `init_db()`, after the existing `affect_events` block.

### New table definition

```python
cur.execute(
    """
    CREATE TABLE IF NOT EXISTS confusion_events (
      id TEXT PRIMARY KEY,
      conv_id TEXT NOT NULL,
      turn_id INTEGER,
      confusion_score INTEGER NOT NULL DEFAULT 0,
      memory_depth_score INTEGER NOT NULL DEFAULT 0,
      text_signals TEXT NOT NULL DEFAULT '[]',
      emotion_signals TEXT NOT NULL DEFAULT '[]',
      timeline_signals TEXT NOT NULL DEFAULT '[]',
      agent_action TEXT NOT NULL DEFAULT 'continue',
      camera_on INTEGER NOT NULL DEFAULT 0,
      fatigue_score REAL,
      confidence REAL,
      question_text TEXT DEFAULT '',
      answer_text TEXT DEFAULT '',
      ts TEXT NOT NULL,
      FOREIGN KEY(conv_id) REFERENCES sessions(conv_id) ON DELETE CASCADE
    );
    """
)
cur.execute(
    "CREATE INDEX IF NOT EXISTS idx_confusion_events_conv_ts "
    "ON confusion_events(conv_id, ts);"
)
```

**Note:** `turn_id` links to `turns.id` but is nullable since `turns.id` is assigned after insert. We populate it in the scoring flow using the lastrowid from the turn insert.

### New DB helper functions (add to db.py)

```python
def insert_confusion_event(
    conv_id: str,
    confusion_score: int,
    memory_depth_score: int,
    text_signals: list,
    emotion_signals: list,
    timeline_signals: list,
    agent_action: str,
    camera_on: bool = False,
    fatigue_score: Optional[float] = None,
    confidence: Optional[float] = None,
    question_text: str = "",
    answer_text: str = "",
    turn_id: Optional[int] = None,
) -> str:
    """Insert a confusion event and return its id."""
    import uuid as _uuid_mod
    event_id = _uuid_mod.uuid4().hex
    ts = _now_iso()
    init_db()
    con = _connect()
    con.execute(
        """
        INSERT INTO confusion_events(
            id, conv_id, turn_id, confusion_score, memory_depth_score,
            text_signals, emotion_signals, timeline_signals, agent_action,
            camera_on, fatigue_score, confidence, question_text, answer_text, ts
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            event_id, conv_id, turn_id, confusion_score, memory_depth_score,
            _json_dump(text_signals), _json_dump(emotion_signals),
            _json_dump(timeline_signals), agent_action,
            1 if camera_on else 0, fatigue_score, confidence,
            question_text[:1000], answer_text[:2000], ts,
        ),
    )
    con.commit()
    con.close()
    return event_id


def get_confusion_history(conv_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return confusion events for a conversation, most recent first."""
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id, turn_id, confusion_score, memory_depth_score,
               text_signals, emotion_signals, timeline_signals,
               agent_action, camera_on, fatigue_score, confidence,
               question_text, answer_text, ts
        FROM confusion_events
        WHERE conv_id = ?
        ORDER BY ts DESC, rowid DESC
        LIMIT ?
        """,
        (conv_id, limit),
    ).fetchall()
    con.close()
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "turn_id": r["turn_id"],
            "confusion_score": r["confusion_score"],
            "memory_depth_score": r["memory_depth_score"],
            "text_signals": _json_load(r["text_signals"], []),
            "emotion_signals": _json_load(r["emotion_signals"], []),
            "timeline_signals": _json_load(r["timeline_signals"], []),
            "agent_action": r["agent_action"],
            "camera_on": bool(r["camera_on"]),
            "fatigue_score": r["fatigue_score"],
            "confidence": r["confidence"],
            "question_text": r["question_text"] or "",
            "answer_text": r["answer_text"] or "",
            "ts": r["ts"],
        })
    return out


def get_memory_care_mode(conv_id: str) -> bool:
    """Return True if memory care mode is enabled for this conversation."""
    payload = get_session_payload(conv_id) or {}
    return bool(payload.get("memory_care_mode", False))


def set_memory_care_mode(conv_id: str, enabled: bool) -> None:
    """Enable or disable memory care mode for this conversation.
    Stored in sessions.payload_json so it persists across turns.
    Only a supervisor should call this — never called by the scoring engine.
    """
    init_db()
    ensure_session(conv_id)
    con = _connect()
    row = con.execute(
        "SELECT payload_json FROM sessions WHERE conv_id=?", (conv_id,)
    ).fetchone()
    payload = _json_load(row["payload_json"] if row else "{}", {})
    payload["memory_care_mode"] = bool(enabled)
    con.execute(
        "UPDATE sessions SET payload_json=?, updated_at=? WHERE conv_id=?",
        (_json_dump(payload), _now_iso(), conv_id),
    )
    con.commit()
    con.close()
```

---

## Phase 3 — scoring_engine.py (new file)

**Location:** `server/code/api/scoring_engine.py`

This is heuristic-based to start — no second LLM call, no added latency. The interface is designed so the internals can be swapped to an LLM call later without changing anything that calls it.

```python
"""
Lorevox confusion + memory-depth scoring engine.

Scores each user turn on two axes:
  confusion_score   0–4  (how disoriented/blocked the narrator appears)
  memory_depth      0–5  (surface label → identity-level narrative)

Produces an agent_action that maps to current_mode in prompt_composer.

Camera-off policy:
  When no affect events are present, confusion is capped at 3
  UNLESS the text itself contains an explicit block phrase ("I can't answer this",
  "I have no idea", "I don't want to talk about this", empty answer after timeout).
  Those phrases can reach 4 on text alone.

This engine never diagnoses. It observes behaviour only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class AffectEvent:
    type: str       # "emotion_spike" | "emotion_drop" | "emotion_sustain"
    intensity: float = 0.0
    ts: str = ""


@dataclass
class ScoringInput:
    question_text: str
    answer_text: str
    era: Optional[str] = None
    current_pass: Optional[str] = None
    affect_events: Optional[List[AffectEvent]] = None   # None = camera off
    fatigue_score: float = 0.0


@dataclass
class ScoringOutput:
    # Primary outputs consumed by the runtime decision layer
    response_type: str                            # "interaction_feedback" | "emotional_distress" | "meta_confusion" | "content_answer"
    clarity_score: int                            # 0–4 (inverse of confusion; 4 = clear, 0 = blocked)
    confusion_flags: List[str] = field(default_factory=list)  # human-readable reasons
    recommended_next_style: str = "continue"      # advisory only — runtime layer makes final call

    # Signals (stored in confusion_events for supervisor audit)
    text_signals: List[str] = field(default_factory=list)
    emotion_signals: List[str] = field(default_factory=list)
    timeline_signals: List[str] = field(default_factory=list)

    # Metadata
    memory_depth_score: int = 1                   # 0–5
    confidence: float = 0.85
    camera_on: bool = False


# ---------------------------------------------------------------------------
# Text signal patterns
# ---------------------------------------------------------------------------

_HEDGING = re.compile(
    r"\b(i think|i believe|maybe|perhaps|i'm not sure|not sure|i don't know|"
    r"possibly|probably|i guess|something like|around that time|roughly|"
    r"i can't remember exactly|i forget)\b",
    re.IGNORECASE,
)
_SELF_CORRECTION = re.compile(
    r"\b(no wait|or maybe|actually no|i mean|i meant|let me correct|"
    r"no,? i think|wait,? no|or was it|i think it was more like)\b",
    re.IGNORECASE,
)
_BLOCK_PHRASES = re.compile(
    r"\b(i can't answer|i have no idea|i don't want to talk about|"
    r"i can't do this|this is too much|i don't remember anything|"
    r"i have no memory of|i really can't say)\b",
    re.IGNORECASE,
)
_META_FEEDBACK = re.compile(
    r"\b(don't you (just )?want|why are you asking|just ask me|"
    r"shouldn't you ask|you should ask|that's not how|"
    r"can you just ask|just ask for)\b",
    re.IGNORECASE,
)
_IDENTITY_MARKERS = re.compile(
    r"\b(i am|i've always (been|felt)|that's just who i am|"
    r"i've never (been|felt)|that defined me|shaped who i am|"
    r"i realized i was|i knew then that i)\b",
    re.IGNORECASE,
)
_NARRATIVE_MARKERS = re.compile(
    r"\b(after that|because of that|that's why|ever since|"
    r"it led to|it changed|from that point|looking back|"
    r"that was the moment|that's when everything)\b",
    re.IGNORECASE,
)
_EMOTIONAL_MARKERS = re.compile(
    r"\b(i felt|i was (scared|happy|angry|sad|devastated|thrilled|proud|"
    r"ashamed|embarrassed|overwhelmed|heartbroken|relieved|terrified))\b",
    re.IGNORECASE,
)
_FACTUAL_ANCHORS = re.compile(
    r"\b(in \d{4}|when i was \d+|we lived|i worked|i moved|"
    r"we had|i started|i finished|i got married|i graduated|"
    r"i was born|i grew up)\b",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

class ScoringEngine:

    def score(self, inp: ScoringInput) -> ScoringOutput:
        camera_on = inp.affect_events is not None
        affect = inp.affect_events or []

        text_signals = self._text_signals(inp.answer_text)
        emotion_signals = self._emotion_signals(affect)
        timeline_signals = self._timeline_signals(inp.answer_text, inp.era)

        memory_depth = self._memory_depth(inp.answer_text)
        confusion = self._confusion_score(
            inp.answer_text, text_signals, emotion_signals, camera_on
        )
        agent_action = self._agent_action(memory_depth, confusion)

        return ScoringOutput(
            confusion_score=confusion,
            memory_depth_score=memory_depth,
            text_signals=text_signals,
            emotion_signals=emotion_signals,
            timeline_signals=timeline_signals,
            agent_action=agent_action,
            camera_on=camera_on,
        )

    # ── Memory depth ────────────────────────────────────────────────────────

    def _memory_depth(self, text: str) -> int:
        if not text.strip():
            return 0
        if _IDENTITY_MARKERS.search(text):
            return 5
        if _NARRATIVE_MARKERS.search(text):
            return 4
        if _EMOTIONAL_MARKERS.search(text):
            return 3
        if _FACTUAL_ANCHORS.search(text):
            return 2
        if len(text.split()) >= 4:
            return 1
        return 0

    # ── Text signals ────────────────────────────────────────────────────────

    def _text_signals(self, text: str) -> List[str]:
        signals: List[str] = []
        if not text.strip():
            signals.append("empty_answer")
            return signals
        if _META_FEEDBACK.search(text):
            signals.append("meta_feedback")
        if _BLOCK_PHRASES.search(text):
            signals.append("explicit_block")
        if _SELF_CORRECTION.search(text):
            signals.append("self_correction")
        if _HEDGING.search(text):
            signals.append("hedging")
        if len(text.split()) < 4 and "empty_answer" not in signals:
            signals.append("minimal_answer")
        return signals

    # ── Emotion signals ─────────────────────────────────────────────────────

    def _emotion_signals(self, affect: List[AffectEvent]) -> List[str]:
        signals: List[str] = []
        for ev in affect:
            if ev.type not in signals:
                signals.append(ev.type)
        return signals

    # ── Timeline signals ────────────────────────────────────────────────────

    def _timeline_signals(self, text: str, era: Optional[str]) -> List[str]:
        signals: List[str] = []
        if re.search(r"\b(before|after|then|later|earlier|next|eventually)\b", text, re.I):
            signals.append("timeline_reference")
        if re.search(r"\b(or was it|i think it was|maybe it was|not sure when)\b", text, re.I):
            signals.append("date_uncertainty")
        return signals

    # ── Confusion score ─────────────────────────────────────────────────────

    def _confusion_score(
        self,
        text: str,
        text_signals: List[str],
        emotion_signals: List[str],
        camera_on: bool,
    ) -> int:
        score = 0

        # Text-driven escalation
        if "empty_answer" in text_signals:
            score = max(score, 2)
        if "explicit_block" in text_signals:
            score = max(score, 4)   # text-only 4 allowed for explicit blocks
        if "self_correction" in text_signals:
            score = max(score, 2)
        if "hedging" in text_signals and score < 1:
            score = max(score, 1)
        if "minimal_answer" in text_signals and score < 1:
            score = max(score, 1)

        # Meta-feedback is NOT confusion — it's the user correcting Lori
        # Keep score low so Lori responds to the feedback, not treats it as distress
        if "meta_feedback" in text_signals:
            score = min(score, 1)

        # Emotion-driven escalation (camera on only)
        if camera_on:
            if "emotion_spike" in emotion_signals:
                score = max(score, 2)
            if "emotion_drop" in emotion_signals:
                score = max(score, 3)
            if "emotion_sustain" in emotion_signals:
                score = max(score, 2)
        else:
            # Camera off: cap at 3 unless text has explicit block
            if "explicit_block" not in text_signals:
                score = min(score, 3)

        return min(score, 4)

    # ── Agent action (from matrix) ───────────────────────────────────────────

    def _agent_action(self, memory_depth: int, confusion: int) -> str:
        # Direct mapping from the memory_depth × confusion matrix
        matrix = {
            # confusion: 0          1           2           3            4
            0:          ["continue","clarify",  "rephrase", "shift_topic","shift_topic"],
            1:          ["continue","clarify",  "slow_down","grounding",  "shift_topic"],
            2:          ["continue","clarify",  "rephrase", "grounding",  "shift_topic"],
            3:          ["continue","clarify",  "slow_down","grounding",  "shift_topic"],
            4:          ["continue","clarify",  "slow_down","grounding",  "shift_topic"],
            5:          ["continue","clarify",  "slow_down","grounding",  "shift_topic"],
        }
        row = matrix.get(memory_depth, matrix[1])
        idx = min(confusion, len(row) - 1)
        return row[idx]


# Singleton for import
_engine = ScoringEngine()


def score_turn(
    question_text: str,
    answer_text: str,
    era: Optional[str] = None,
    current_pass: Optional[str] = None,
    affect_events: Optional[List[AffectEvent]] = None,
    fatigue_score: float = 0.0,
) -> ScoringOutput:
    """Module-level entry point. Import and call this from chat_ws.py."""
    return _engine.score(ScoringInput(
        question_text=question_text,
        answer_text=answer_text,
        era=era,
        current_pass=current_pass,
        affect_events=affect_events,
        fatigue_score=fatigue_score,
    ))


# Agent action → current_mode mapping
# Used in chat_ws.py to update runtime71 before prompt composition.
ACTION_TO_MODE: Dict[str, str] = {
    "continue":   "open",
    "clarify":    "recognition",
    "slow_down":  "recognition",
    "rephrase":   "recognition",
    "grounding":  "grounding",
    "shift_topic":"light",
}
```

---

## Phase 4 — Wire scoring into chat_ws.py

This is the integration point. After receiving `user_text` and before calling `compose_system_prompt`, insert the scoring call.

### What changes in `generate_and_stream()`

**After this line (line 71):**
```python
system_prompt = compose_system_prompt(conv_id, ui_system=None, user_text=user_text, runtime71=runtime71)
```

**The full updated block becomes:**
```python
# ── Confusion scoring ────────────────────────────────────────────────────
# Score the user's answer. This runs before prompt composition so the
# resulting agent_action can update runtime71.current_mode for this turn.
# We never override memory_care_mode here — that is supervisor-only.
from .scoring_engine import score_turn, ACTION_TO_MODE, AffectEvent as SE_AffectEvent
from . import db as _db

_affect_raw = runtime71.get("affect_events") if runtime71 else None
_affect: Optional[list] = None
if _affect_raw is not None:
    _affect = [
        SE_AffectEvent(
            type=ev.get("type", ""),
            intensity=float(ev.get("intensity", 0.0)),
            ts=ev.get("ts", ""),
        )
        for ev in (_affect_raw or [])
        if ev.get("type")
    ]

_q_text = runtime71.get("last_question_text", "") if runtime71 else ""
_era    = runtime71.get("current_era") if runtime71 else None
_pass   = runtime71.get("current_pass") if runtime71 else None
_fatigue = float(runtime71.get("fatigue_score", 0)) if runtime71 else 0.0

score = score_turn(
    question_text=_q_text,
    answer_text=user_text,
    era=_era,
    current_pass=_pass,
    affect_events=_affect,
    fatigue_score=_fatigue,
)

# Update current_mode from scoring — but memory_care_mode stays supervisor-only
if runtime71 is not None and score.agent_action != "continue":
    derived_mode = ACTION_TO_MODE.get(score.agent_action, "open")
    runtime71 = {**runtime71, "current_mode": derived_mode}

# Check if supervisor has enabled persistent memory care mode for this session
if _db.get_memory_care_mode(conv_id):
    runtime71 = {**(runtime71 or {}), "cognitive_mode": "recognition"}

# ── End scoring ──────────────────────────────────────────────────────────

system_prompt = compose_system_prompt(
    conv_id, ui_system=None, user_text=user_text, runtime71=runtime71
)
```

**After `persist_turn_transaction()` (line 160), add:**
```python
# Store confusion event (after turn is persisted so turn_id is available)
try:
    _db.insert_confusion_event(
        conv_id=conv_id,
        confusion_score=score.confusion_score,
        memory_depth_score=score.memory_depth_score,
        text_signals=score.text_signals,
        emotion_signals=score.emotion_signals,
        timeline_signals=score.timeline_signals,
        agent_action=score.agent_action,
        camera_on=score.camera_on,
        fatigue_score=_fatigue,
        confidence=score.confidence,
        question_text=_q_text,
        answer_text=user_text,
    )
except Exception as _e:
    logger.warning("[chat_ws] confusion event insert failed: %s", _e)
```

**Update the `done` message to include scoring data:**
```python
await _ws_send(ws, {
    "type": "done",
    "final_text": final_text,
    "confusion": {
        "score": score.confusion_score,
        "memory_depth": score.memory_depth_score,
        "agent_action": score.agent_action,
        "signals": {
            "text": score.text_signals,
            "emotion": score.emotion_signals,
            "timeline": score.timeline_signals,
        },
    },
})
```

### What the UI needs to send (new field in runtime71)

The scoring engine needs `last_question_text` — the question Lori just asked — so it can score the answer in context. The UI should include this in the `start_turn` params:

```json
{
  "type": "start_turn",
  "session_id": "...",
  "message": "user answer text",
  "params": {
    "runtime71": {
      "current_pass": "onboarding",
      "current_era": "early_childhood",
      "current_mode": "open",
      "affect_state": "neutral",
      "fatigue_score": 0,
      "cognitive_mode": null,
      "last_question_text": "What is your date of birth?"
    }
  }
}
```

---

## Phase 5 — Supervisor endpoint (new file)

**Location:** `server/code/api/routers/supervisor.py`

```python
"""
Lorevox supervisor API.

Endpoints:
  GET  /api/supervisor/confusion/{conv_id}        — confusion history for a session
  POST /api/supervisor/memory_care/{conv_id}       — enable / disable memory care mode
  GET  /api/supervisor/memory_care/{conv_id}       — current memory care state

These endpoints are intended for human supervisors only.
Lori never calls them. The scoring engine never calls them.
"""

from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

from ..db import get_confusion_history, get_memory_care_mode, set_memory_care_mode

router = APIRouter(prefix="/api/supervisor", tags=["supervisor"])


class MemoryCareRequest(BaseModel):
    enabled: bool
    supervisor_note: Optional[str] = None


@router.get("/confusion/{conv_id}")
def confusion_history(conv_id: str, limit: int = 50):
    """Return confusion events for a conversation, most recent first."""
    events = get_confusion_history(conv_id, limit=limit)
    return {"conv_id": conv_id, "events": events, "count": len(events)}


@router.get("/memory_care/{conv_id}")
def memory_care_state(conv_id: str):
    """Return current memory care mode state for a session."""
    enabled = get_memory_care_mode(conv_id)
    return {"conv_id": conv_id, "memory_care_mode": enabled}


@router.post("/memory_care/{conv_id}")
def set_memory_care(conv_id: str, req: MemoryCareRequest):
    """Enable or disable memory care mode. Supervisor-only."""
    set_memory_care_mode(conv_id, req.enabled)
    return {
        "conv_id": conv_id,
        "memory_care_mode": req.enabled,
        "note": req.supervisor_note or "",
    }
```

**Register in main.py** (find the section that includes other routers):
```python
from .routers.supervisor import router as supervisor_router
app.include_router(supervisor_router)
```

---

## Phase 6 — prompt_composer.py: read memory_care_mode

Add this inside `compose_system_prompt()` before the `runtime71` block is processed, right after the session payload is loaded (around line 124):

```python
# Supervisor-set memory care mode takes priority over UI-supplied cognitive_mode
if payload.get("memory_care_mode"):
    if runtime71 is not None:
        runtime71 = {**runtime71, "cognitive_mode": "recognition"}
    else:
        runtime71 = {"cognitive_mode": "recognition"}
```

This means: if a supervisor has enabled memory care for this session, `cognitive_mode` is forced to `"recognition"` regardless of what the UI sends. The UI can still send `"alongside"` (deeper support) and that will not be overridden — only the default `None` case gets lifted to `"recognition"`.

---

## What to do with what exists now

| Existing thing | Action |
|---|---|
| `affect_events` table | Keep as-is. Scoring engine reads affect from `runtime71.affect_events` (UI-supplied), not from DB directly. DB version is for archival. |
| `segment_flags` table | Keep. This is for memoir exclusion and privacy — different concern from confusion scoring. |
| `interview_softened` / `softened_until_turn` columns | Keep. These handle the existing "soften for N turns" mechanic. Confusion scoring operates alongside this, not replacing it. |
| `cognitive_mode = "recognition"` in prompt_composer | Keep exactly as-is. The scoring engine maps to this via `current_mode`, and memory care mode uses it via supervisor toggle. |
| `cognitive_mode = "alongside"` | Keep. This is the deepest support level — scoring never auto-triggers it. Supervisor can manually set `runtime71.cognitive_mode = "alongside"` from the UI if needed. |
| `launchers/run_all_dev.sh` | Keep as legacy fallback. Primary paths: `start_lorevox.bat` (visible Windows Terminal tabs) or `bash scripts/start_all.sh` (shell-native). |

---

## Build order and what to test at each step

**Step 1** — Phase 1 only (prompt fixes). Reload API. Test:
- Ask Lori for your date of birth → should ask for full date, not "rough idea"
- Give Lori feedback about her questions → should respond to the feedback, not apply empathy phrase

**Step 2** — Phase 2 (DB table). Reload API. Test:
- `bash scripts/status_all.sh` still passes health check
- `sqlite3 /mnt/c/lorevox_data/db/*.db ".tables"` should show `confusion_events`

**Step 3** — Phase 3 (scoring_engine.py). No restart needed yet. Unit test:
- Run the test suite from the proposal (`pytest tests/test_scoring_engine.py`)
- Confirm camera-off cap at 3, explicit block reaches 4, meta-feedback stays ≤ 1

**Step 4** — Phase 4 (chat_ws integration). Reload API. Test:
- Have a conversation and check that `done` messages include `confusion` field
- Check `.runtime/logs/api.log` for `[chat_ws] turn:` lines to confirm scoring is firing
- Check DB that `confusion_events` rows are being written

**Step 5** — Phase 5 (supervisor endpoint). Reload API. Test:
- `curl http://localhost:8000/api/supervisor/confusion/{your_conv_id}`
- `curl -X POST http://localhost:8000/api/supervisor/memory_care/{conv_id} -d '{"enabled":true}'`
- Confirm memory care mode changes Lori's questioning style

---

## What is deliberately NOT in this plan

- **LLM-based confusion scoring** — heuristics are sufficient to start and add zero latency. Add the LLM scorer later when the basic flow is proven.
- **Supervisor UI** — the endpoint exists; the UI panel is a separate design task (the Figma mockup from the proposal is the right starting point for that).
- **`alongside` mode auto-trigger** — this is the deepest support level and requires human authorization per the design principle that Lorevox never self-diagnoses.
- **Camera-off confusion reaching 4 on silence/timeout** — the architecture supports it (empty_answer signal) but detecting "long silence" requires the UI to send a timeout signal. Add this after the basic flow is working.
