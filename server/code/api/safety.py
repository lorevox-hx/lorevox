"""
Lorevox Safety Scanner — v6.1 Track A
======================================
Crisis detection in live interview transcripts.

Design rules:
- Sentence-level scanning (not fragment-level)
- Weighted keyword + compound trigger scoring
- False-positive guards
- Returns structured result; caller decides UI response
- NEVER generates, suggests, or engages with methods of self-harm
- No external calls, fully local
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ─── Pydantic Models ────────────────────────────────────────────────────────

class SafetyResult(BaseModel):
    triggered: bool
    category: Optional[str] = None   # e.g. "suicidal_ideation", "sexual_abuse"
    confidence: float = 0.0
    matched_phrase: Optional[str] = None
    action: str = "continue"         # "pause" | "continue"


class SegmentFlags(BaseModel):
    sensitive: bool = False
    sensitive_category: Optional[str] = None
    excluded_from_memoir: bool = False
    private: bool = False
    deleted: bool = False


# ─── Sentence Splitter ──────────────────────────────────────────────────────

def split_sentences(text: str) -> list[str]:
    """
    Split text into sentences at . ! ? boundaries.
    Handles abbreviations like Mr. Mrs. Dr. by requiring capital letter after boundary.
    """
    text = text.strip()
    if not text:
        return []

    # Normalise whitespace
    text = re.sub(r"\s+", " ", text)

    # Protect known abbreviations
    protected = re.sub(
        r"\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|approx|dept|est|vol|no|fig)\.",
        r"\1<ABBR>",
        text,
        flags=re.IGNORECASE,
    )

    # Split on sentence-ending punctuation followed by space+capital or end
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"])", protected)

    # Restore abbreviations and clean up
    sentences = [p.replace("<ABBR>", ".").strip() for p in parts if p.strip()]
    return sentences if sentences else [text]


def _normalise(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for matching."""
    text = text.lower()
    text = re.sub(r"[''']", "'", text)          # smart apostrophes
    text = re.sub(r'["""]', '"', text)          # smart quotes
    text = re.sub(r"[^\w\s'\",-]", " ", text)   # keep words + basic punctuation
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ─── Keyword / Trigger Definitions ──────────────────────────────────────────

# Each entry: (pattern_string, category, base_confidence)
# Patterns use word-boundary aware regex on normalised text.
_SIMPLE_TRIGGERS: list[tuple[str, str, float]] = [
    # ── Suicidal ideation ──
    (r"\bkill myself\b",                  "suicidal_ideation", 0.92),
    (r"\bend my life\b",                  "suicidal_ideation", 0.90),
    (r"\btake my (own )?life\b",          "suicidal_ideation", 0.90),
    (r"\bwant(ed)? to die\b",             "suicidal_ideation", 0.80),
    (r"\bnot worth living\b",             "suicidal_ideation", 0.82),
    (r"\brather be dead\b",               "suicidal_ideation", 0.85),
    (r"\bthought about (ending|killing)\b","suicidal_ideation", 0.78),
    (r"\bsuicidal\b",                     "suicidal_ideation", 0.88),
    (r"\bending it (all)?\b",             "suicidal_ideation", 0.72),

    # ── Sexual abuse ──
    (r"\bi was raped\b",                  "sexual_abuse", 0.95),
    (r"\braped me\b",                     "sexual_abuse", 0.95),
    (r"\bmolest(ed)?\b",                  "sexual_abuse", 0.90),
    (r"\bsexual(ly)? abuse[d]?\b",        "sexual_abuse", 0.90),
    (r"\bsexual assault\b",               "sexual_abuse", 0.90),
    (r"\bforced me (to|into)\b",          "sexual_abuse", 0.72),
    (r"\binappropriate(ly)? touch(ed)?\b","sexual_abuse", 0.80),

    # ── Physical abuse ──
    (r"\bbeat(ing)? me\b",                "physical_abuse", 0.85),
    (r"\bhit me\b",                       "physical_abuse", 0.78),
    (r"\bpunched? me\b",                  "physical_abuse", 0.82),
    (r"\bkicked? me\b",                   "physical_abuse", 0.80),
    (r"\bslapped? me\b",                  "physical_abuse", 0.80),
    (r"\bleft bruises\b",                 "physical_abuse", 0.78),
    (r"\bphysically abuse[d]?\b",         "physical_abuse", 0.88),

    # ── Spousal / domestic ──
    (r"\bdomestic violence\b",            "domestic_abuse", 0.90),
    (r"\b(husband|wife|partner|boyfriend|girlfriend) (would |used to )?(hit|beat|hurt|abuse|harm)\b",
                                          "domestic_abuse", 0.88),
    (r"\bafraid (of|to go home)\b",       "domestic_abuse", 0.72),
    (r"\bcontrolling (husband|wife|partner)\b", "domestic_abuse", 0.75),

    # ── Caregiver / elder abuse ──
    (r"\b(nursing home|care home|assisted living)\b.*\b(hurt|abuse|steal|neglect|lock(ed)?|left me)\b",
                                          "caregiver_abuse", 0.82),
    (r"\b(my caregiver|the aide|the nurse|the staff)\b.*\b(hurt|hit|abuse|steal|took|lock(ed)?)\b",
                                          "caregiver_abuse", 0.82),
    (r"\bthey (took|stole|took away) my money\b", "caregiver_abuse", 0.78),
    (r"\bthey left me (alone|there|locked)\b",     "caregiver_abuse", 0.75),
    (r"\bnot (allowed|let) (to leave|out)\b",      "caregiver_abuse", 0.72),

    # ── General distress / help request ──
    (r"\bi need help\b",                  "distress_call", 0.65),
    (r"\bplease (help|somebody help)\b",  "distress_call", 0.68),
    (r"\bi don'?t know (what to do|how to go on)\b", "distress_call", 0.70),
    (r"\bi can'?t (go on|do this anymore|take it)\b","distress_call", 0.72),
    (r"\bi('?m| am) in danger\b",         "distress_call", 0.80),

    # ── Cognitive distress / memory / dementia disclosure ──
    (r"\blosing my mind\b",                            "cognitive_distress", 0.82),
    (r"\bcan'?t remember anything\b",                  "cognitive_distress", 0.76),
    (r"\bcan'?t remember (who|where|what|my)\b",       "cognitive_distress", 0.72),
    (r"\bforget(ting)? everything\b",                  "cognitive_distress", 0.74),
    (r"\bforget(ting)? (more and more|all the time)\b","cognitive_distress", 0.70),
    (r"\bmemory (is )?getting worse\b",                "cognitive_distress", 0.72),
    (r"\bdon'?t recogni[sz]e (my|our|the)\b",         "cognitive_distress", 0.70),
    (r"\bscared.{0,30}(alzheimer|dementia)\b",         "cognitive_distress", 0.86),
    (r"\bthink i (have|might have).{0,20}(alzheimer|dementia)\b","cognitive_distress", 0.84),
    (r"\bconfused all the time\b",                     "cognitive_distress", 0.72),
    (r"\bdon'?t know (where i am|what day|who i)\b",   "cognitive_distress", 0.76),
    (r"\bmy mind (is|feels).{0,20}(going|slipping|fading)\b","cognitive_distress", 0.78),
    (r"\bwhat (year|day) is it\b",                     "cognitive_distress", 0.60),
]

# Compile all patterns once at import time
_COMPILED: list[tuple[re.Pattern, str, float]] = [
    (re.compile(pat, re.IGNORECASE), cat, conf)
    for pat, cat, conf in _SIMPLE_TRIGGERS
]


# ─── Compound Child Abuse Triggers ──────────────────────────────────────────

_CHILD_AGE_PATTERNS = re.compile(
    r"\b(when i was (young|little|small|a child|a kid|[3-9]|1[0-7]|(three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen) years old)|growing up|as a child|as a little (girl|boy)|childhood)\b",
    re.IGNORECASE,
)

_PERPETRATOR_ROLES = re.compile(
    r"\b(step(dad|father|mom|mother)|step-?(dad|father|mom|mother)|uncle|grandfather|granddad|great-uncle|cousin|father|dad|mother|mom|parent|teacher|coach|priest|pastor|minister|babysitter|neighbour|neighbor|family friend|family member)\b",
    re.IGNORECASE,
)

_HARM_VERBS = re.compile(
    r"\b(touch(ed)?|hurt|hit|abuse[d]?|rape[d]?|molest(ed)?|assault(ed)?|exposed (himself|herself)|forced|did things|came into my (room|bed))\b",
    re.IGNORECASE,
)


def _check_compound_child_abuse(norm_text: str) -> Optional[tuple[str, float]]:
    """
    Returns (category, confidence) if compound child-abuse trigger fires,
    else None.
    Requires all three: age_context + perpetrator + harm_verb.
    """
    has_age = bool(_CHILD_AGE_PATTERNS.search(norm_text))
    has_perp = bool(_PERPETRATOR_ROLES.search(norm_text))
    has_harm = bool(_HARM_VERBS.search(norm_text))

    if has_age and has_perp and has_harm:
        return ("child_abuse", 0.92)
    if has_perp and has_harm and not has_age:
        # Perpetrator + harm without explicit age: lower confidence
        return ("child_abuse", 0.70)
    return None


# ─── False-Positive Guards ───────────────────────────────────────────────────

# Phrases that contain trigger words but are clearly NOT abuse disclosures
_FALSE_POSITIVE_GUARDS: list[re.Pattern] = [
    re.compile(r"\bbeat (the heat|the odds|the record|the competition|him at|her at|them at)\b", re.IGNORECASE),
    re.compile(r"\bhit (a home run|the jackpot|the road|it off|it big|the nail)\b", re.IGNORECASE),
    re.compile(r"\bfought (off|through) (depression|anxiety|cancer|illness|disease)\b", re.IGNORECASE),
    re.compile(r"\b(music|song|movie|film|book|show|game|match) (ended|killed|destroyed|raped)\b", re.IGNORECASE),
    re.compile(r"\bkilled it\b", re.IGNORECASE),
    re.compile(r"\bdying (to|for) (see|meet|try|go|get)\b", re.IGNORECASE),
    re.compile(r"\bdead tired\b", re.IGNORECASE),
    re.compile(r"\bkill two birds\b", re.IGNORECASE),
    re.compile(r"\bdie(d)? of (laughter|embarrassment|excitement)\b", re.IGNORECASE),
    re.compile(r"\bdie(d)? laughing\b", re.IGNORECASE),
]


def _is_false_positive(norm_text: str) -> bool:
    return any(p.search(norm_text) for p in _FALSE_POSITIVE_GUARDS)


# ─── Core Detection Function ─────────────────────────────────────────────────

def detect_crisis(sentence: str) -> SafetyResult:
    """
    Scan a single sentence for crisis indicators.

    Args:
        sentence: A normalised sentence from the live transcript.

    Returns:
        SafetyResult with triggered=True if a crisis pattern is found
        above the confidence threshold.
    """
    if not sentence or not sentence.strip():
        return SafetyResult(triggered=False)

    norm = _normalise(sentence)

    # Early exit on false positives
    if _is_false_positive(norm):
        return SafetyResult(triggered=False)

    best_cat: Optional[str] = None
    best_conf: float = 0.0
    best_phrase: Optional[str] = None

    # Simple pattern triggers
    for pattern, category, base_conf in _COMPILED:
        m = pattern.search(norm)
        if m and base_conf > best_conf:
            best_cat = category
            best_conf = base_conf
            best_phrase = m.group(0)

    # Compound child abuse check
    compound = _check_compound_child_abuse(norm)
    if compound:
        cat, conf = compound
        if conf > best_conf:
            best_cat = cat
            best_conf = conf
            best_phrase = "[compound trigger]"

    THRESHOLD = 0.70
    if best_conf >= THRESHOLD:
        return SafetyResult(
            triggered=True,
            category=best_cat,
            confidence=round(best_conf, 3),
            matched_phrase=best_phrase,
            action="pause",
        )

    return SafetyResult(triggered=False)


def scan_answer(answer_text: str) -> Optional[SafetyResult]:
    """
    Split an answer into sentences and scan each one.
    Returns the highest-confidence result that triggered, or None.
    """
    if not answer_text or not answer_text.strip():
        return None

    sentences = split_sentences(answer_text)
    best: Optional[SafetyResult] = None

    for sentence in sentences:
        result = detect_crisis(sentence)
        if result.triggered:
            if best is None or result.confidence > best.confidence:
                best = result

    return best


# ─── Session Softened Mode ────────────────────────────────────────────────────

# In-memory softened state (persisted in DB separately).
# session_id -> turn number when softened mode expires.
_softened_sessions: dict[str, int] = {}

SOFTENED_TURNS = 3  # Lori stays gentle for this many turns after a disclosure


def set_softened(session_id: str, current_turn: int) -> None:
    """Mark a session as softened for the next SOFTENED_TURNS turns."""
    _softened_sessions[session_id] = current_turn + SOFTENED_TURNS


def is_softened(session_id: str, current_turn: int) -> bool:
    """Return True if the session is still in softened mode."""
    expiry = _softened_sessions.get(session_id)
    if expiry is None:
        return False
    if current_turn <= expiry:
        return True
    # Expired — clean up
    del _softened_sessions[session_id]
    return False


def clear_softened(session_id: str) -> None:
    """Explicitly clear softened mode (e.g. after section change)."""
    _softened_sessions.pop(session_id, None)


# ─── Segment Flag Helpers ─────────────────────────────────────────────────────

def build_segment_flags(safety_result: SafetyResult) -> SegmentFlags:
    """
    Build SegmentFlags from a SafetyResult.
    Sensitive segments are private and excluded from memoir by default.
    """
    if not safety_result.triggered:
        return SegmentFlags()
    return SegmentFlags(
        sensitive=True,
        sensitive_category=safety_result.category,
        excluded_from_memoir=True,
        private=True,
        deleted=False,
    )


# ─── Resource Card Definitions ─────────────────────────────────────────────

RESOURCE_CARDS = [
    {
        "name": "Crisis & Suicide Prevention",
        "contact": "988",
        "type": "call_or_text",
        "description": "Call or text 988 (US)",
    },
    {
        "name": "RAINN Sexual Assault Hotline",
        "contact": "1-800-656-4673",
        "type": "phone",
        "description": "Free, confidential support 24/7",
    },
    {
        "name": "National Domestic Violence Hotline",
        "contact": "1-800-799-7233",
        "type": "phone",
        "description": "Call or text START to 88788",
    },
    {
        "name": "Eldercare & Caregiver Abuse",
        "contact": "1-800-677-1116",
        "type": "phone",
        "description": "Eldercare Locator — free local resources",
    },
    {
        "name": "Alzheimer's Association Helpline",
        "contact": "1-800-272-3900",
        "type": "phone",
        "description": "24/7 support for memory concerns, dementia, and caregivers",
    },
]


def get_resources_for_category(category: Optional[str]) -> list[dict]:
    """
    Return relevant resource cards for a crisis category.
    Suicidal ideation always includes 988.
    Abuse categories include category-relevant + 988.
    """
    if not category:
        return RESOURCE_CARDS

    relevant = []
    if category == "suicidal_ideation":
        relevant = [RESOURCE_CARDS[0]]                     # 988 only
    elif category in ("sexual_abuse", "child_abuse"):
        relevant = [RESOURCE_CARDS[1], RESOURCE_CARDS[0]]  # RAINN + 988
    elif category in ("domestic_abuse",):
        relevant = [RESOURCE_CARDS[2], RESOURCE_CARDS[0]]  # DV + 988
    elif category == "caregiver_abuse":
        relevant = [RESOURCE_CARDS[3], RESOURCE_CARDS[0]]  # Eldercare + 988
    elif category == "physical_abuse":
        relevant = [RESOURCE_CARDS[2], RESOURCE_CARDS[0]]  # DV + 988
    elif category == "distress_call":
        relevant = [RESOURCE_CARDS[0]]                     # 988
    elif category == "cognitive_distress":
        relevant = [RESOURCE_CARDS[4], RESOURCE_CARDS[3], RESOURCE_CARDS[0]]  # Alzheimer's + Eldercare + 988
    else:
        relevant = RESOURCE_CARDS

    return relevant
