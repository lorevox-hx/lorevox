"""
eval_onboarding.py — Lorevox v7.4E Onboarding Quality Eval
===========================================================

Tests the full onboarding sequence at two levels:

  OFFLINE (always runs):
    - Prompt generation correctness: each phase produces the right directive
    - Name extraction accuracy: 20+ test cases covering the cohort's realistic inputs
    - Language accessibility: flags terms that may not land with older adults

  LIVE (runs when --live flag is passed and API is up):
    - Calls the actual SSE endpoint to get Lori's real first message
    - Runs 5 representative persona scenarios through the 3-anchor sequence
    - Scores each turn against rubric criteria

Usage:
    python eval/eval_onboarding.py               # offline only
    python eval/eval_onboarding.py --live        # offline + live API calls
    python eval/eval_onboarding.py --live --verbose

Target: 100% offline pass, live scores >= 80/100 per scenario.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Optional

# ── path setup ──────────────────────────────────────────────────────────────
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "server"))
from code.api.prompt_composer import compose_system_prompt  # noqa: E402

API_BASE = "http://localhost:8000"
CHAT_SSE  = f"{API_BASE}/api/chat/stream"

# ═══════════════════════════════════════════════════════════════════════════
# COLOUR HELPERS
# ═══════════════════════════════════════════════════════════════════════════
GREEN  = "\033[32m"
RED    = "\033[31m"
YELLOW = "\033[33m"
CYAN   = "\033[36m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):  print(f"  {GREEN}✓{RESET} {msg}")
def fail(msg): print(f"  {RED}✗{RESET} {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET} {msg}")
def hdr(msg):  print(f"\n{BOLD}{CYAN}{msg}{RESET}")

# ═══════════════════════════════════════════════════════════════════════════
# RESULT TRACKING
# ═══════════════════════════════════════════════════════════════════════════
@dataclass
class EvalResult:
    name: str
    passed: int = 0
    failed: int = 0
    warnings: int = 0
    notes: list = field(default_factory=list)

    def record(self, passed: bool, label: str, note: str = ""):
        if passed:
            self.passed += 1
            ok(label)
        else:
            self.failed += 1
            fail(label)
        if note:
            self.notes.append(note)

    def score(self) -> int:
        total = self.passed + self.failed
        return int(100 * self.passed / total) if total else 0

RESULTS: list[EvalResult] = []

# ═══════════════════════════════════════════════════════════════════════════
# OFFLINE TEST 1 — PROMPT GENERATION CORRECTNESS
# ═══════════════════════════════════════════════════════════════════════════

def _rt(phase, speaker=None, role="onboarding"):
    return {
        "current_pass": "pass1",
        "current_era": None,
        "current_mode": "open",
        "affect_state": "neutral",
        "fatigue_score": 0,
        "cognitive_mode": None,
        "assistant_role": role,
        "identity_complete": False,
        "identity_phase": phase,
        "effective_pass": "pass1",
        "speaker_name": speaker,
    }

def test_prompt_generation():
    hdr("OFFLINE TEST 1 — Prompt generation correctness")
    r = EvalResult("prompt_generation")

    # 1a. askName phase: must mention all 3 anchors and NOT mention DOB/birthplace as current ask
    p = compose_system_prompt("t", runtime71=_rt("askName"))
    r.record(
        "name → date of birth → birthplace" in p,
        "askName: sequence listed (name → DOB → birthplace)"
    )
    r.record(
        "preferred name" in p.lower() or "ask only for their" in p.lower(),
        "askName: asks ONLY for name in current step"
    )
    r.record(
        "do not ask about date of birth" in p.lower() or "do NOT ask about date of birth" in p,
        "askName: explicitly holds off DOB"
    )
    r.record(
        "why you need three things" in p or "build a personal life timeline" in p,
        "askName: explains WHY the three anchors are needed"
    )

    # 1b. askDob phase: speaker name anchored, only asks for DOB
    p = compose_system_prompt("t", runtime71=_rt("askDob", speaker="Linda"))
    r.record(
        "speaker: Linda" in p,
        "askDob: speaker anchor injected (Linda)"
    )
    r.record(
        "date of birth right now" in p.lower() or "ask only for their date of birth" in p.lower(),
        "askDob: asks ONLY for date of birth"
    )
    r.record(
        "do not ask about birthplace" in p.lower() or "do NOT ask about birthplace" in p,
        "askDob: explicitly holds off birthplace"
    )
    r.record(
        "places their story in history" in p or "history" in p,
        "askDob: explains WHY DOB matters"
    )

    # 1c. askBirthplace phase
    p = compose_system_prompt("t", runtime71=_rt("askBirthplace", speaker="Bob"))
    r.record(
        "You are speaking with Bob" in p or "speaking with Bob" in p,
        "askBirthplace: speaker name used in step instruction"
    )
    r.record(
        "born or spent their earliest years" in p.lower(),
        "askBirthplace: asks only for birthplace"
    )
    r.record(
        "anchors their story" in p or "geographically" in p,
        "askBirthplace: explains WHY birthplace matters"
    )

    # 1d. Identity rule in DEFAULT_CORE
    p = compose_system_prompt("t", runtime71=_rt("askName"))
    r.record(
        "IDENTITY RULE" in p,
        "DEFAULT_CORE: IDENTITY RULE present"
    )
    r.record(
        "different person" in p.lower(),
        "DEFAULT_CORE: guards against confusing Lori with narrator's Lori"
    )

    # 1e. Sequence rule
    p = compose_system_prompt("t", runtime71=_rt("askDob", speaker="Chris"))
    r.record(
        "Do NOT skip ahead" in p or "do not skip" in p.lower(),
        "Directive: DO NOT skip ahead rule present"
    )
    r.record(
        "exactly ONE thing per turn" in p or "one question" in p.lower(),
        "Directive: one-question-per-turn rule present"
    )

    RESULTS.append(r)
    print(f"\n  Score: {r.score()}/100  ({r.passed} pass, {r.failed} fail)")

# ═══════════════════════════════════════════════════════════════════════════
# OFFLINE TEST 2 — NAME EXTRACTION ACCURACY
# ═══════════════════════════════════════════════════════════════════════════

# Replicate the JS extraction logic in Python for offline testing.
_NOT_A_NAME = {
    "that","it","i","the","a","an","this","there","here","yes","no","yeah","nope",
    "okay","ok","well","so","hi","hello","hey","oh","ah","uh","um","my","mine",
    "what","when","where","why","how","who","which","they","we","you","he","she",
    "just","not","but","and","or","if","then","was","were","is","am","are",
    "had","have","has","did","do","does","would","could","should","will","can",
}
_EMOTIONAL = re.compile(
    r"\b(hard|difficult|sad|scared|lost|hurt|pain|grief|suffered|struggling|"
    r"terrible|awful|horrible|tough|heartbroken|afraid|worried|anxious|miss|"
    r"missed|died|death|trauma|abuse|alone|lonely|crying|tears|broke|broken|"
    r"never|always|sometimes|really|very|so much)\b", re.I
)
_NAME_PATTERNS = [
    re.compile(r"\bmy\s+(?:\w+\s+)*name\s+is\s+([A-Za-z][a-z'-]+)", re.I),
    re.compile(r"\bcall\s+me\s+([A-Za-z][a-z'-]+)", re.I),
    re.compile(r"\bi(?:'m|\s+am)\s+(?:called\s+)?([A-Za-z][a-z'-]+)", re.I),
    re.compile(r"\bi\s+go\s+by\s+([A-Za-z][a-z'-]+)", re.I),
    re.compile(r"\byou\s+can\s+call\s+me\s+([A-Za-z][a-z'-]+)", re.I),
    re.compile(r"\bprefer(?:red)?\s+(?:name\s+is\s+|to\s+be\s+called\s+)?([A-Za-z][a-z'-]+)", re.I),
]

def _extract_name(text: str) -> Optional[str]:
    if _EMOTIONAL.search(text):
        return None
    for pat in _NAME_PATTERNS:
        m = pat.search(text)
        if m and m.group(1) and m.group(1).lower() not in _NOT_A_NAME and len(m.group(1)) >= 2:
            n = m.group(1)
            return n[0].upper() + n[1:]
    words = text.strip().split()
    if len(words) <= 4:
        c = re.sub(r"[^a-zA-Z'\-]", "", words[0]).strip()
        if c and c.lower() not in _NOT_A_NAME:
            return c
    return None

def test_name_extraction():
    hdr("OFFLINE TEST 2 — Name extraction accuracy")
    r = EvalResult("name_extraction")

    cases = [
        # (input, expected_output, label)
        # ── Direct name answers ──────────────────────────────────────────
        ("Christopher",                                         "Christopher",  "Single: Christopher"),
        ("Linda",                                              "Linda",        "Single: Linda"),
        ("Robert",                                             "Robert",       "Single: Robert"),
        ("Pat",                                                "Pat",          "Single: Pat (nickname)"),
        ("Mick",                                               "Mick",         "Single: Mick"),
        ("Bob",                                                "Bob",          "Short nickname"),
        # ── "My name is X" patterns ──────────────────────────────────────
        ("My name is Margaret",                                "Margaret",     "My name is X"),
        ("My special name is Chris or guch by my wife",       "Chris",        "My special name is X (real transcript)"),
        ("My preferred name is Patricia",                      "Patricia",     "My preferred name is X"),
        ("My full name is James Okafor",                       "James",        "My full name is X"),
        # ── "Call me / I go by" patterns ────────────────────────────────
        ("Call me Bill",                                       "Bill",         "Call me X"),
        ("You can call me Elena",                              "Elena",        "You can call me X"),
        ("I go by Gus",                                        "Gus",          "I go by X"),
        ("I am called Dorothy",                                "Dorothy",      "I am called X"),
        ("I'm Carlos",                                         "Carlos",       "I'm X"),
        # ── Emotional sentences — must return None ───────────────────────
        ("That was a very hard time for me",                   None,           "Emotional: hard time → None"),
        ("I lost my mother when I was young",                  None,           "Emotional: grief → None"),
        ("I'm not sure where to begin",                        None,           "Common word 'not' first word → None"),
        # ── Ambiguous or common-word starts ─────────────────────────────
        ("Well I suppose you could call me Jim",               "Jim",          "'call me Jim' pattern extracts Jim (correct)"),
        ("My name is hard to pronounce",                       None,           "My name is 'hard' — emotional guard"),
        # ── Names from cohort with cultural variation ────────────────────
        ("Aaliyah",                                            "Aaliyah",      "Single: Aaliyah"),
        ("Sofia",                                              "Sofia",        "Single: Sofia"),
        ("Naomi",                                              "Naomi",        "Single: Naomi"),
        ("Jamal",                                              "Jamal",        "Single: Jamal"),
        ("Elena Petrova",                                      "Elena",        "Two words: Elena Petrova → Elena"),
    ]

    for text, expected, label in cases:
        got = _extract_name(text)
        r.record(got == expected, label, note=f'  Input: "{text}" → got "{got}", expected "{expected}"')

    RESULTS.append(r)
    print(f"\n  Score: {r.score()}/100  ({r.passed} pass, {r.failed} fail)")
    pass  # failures already printed inline by record()

# ═══════════════════════════════════════════════════════════════════════════
# OFFLINE TEST 3 — LANGUAGE ACCESSIBILITY AUDIT
# ═══════════════════════════════════════════════════════════════════════════

# Words / phrases that may not land well with older adults or memory care
# contexts. These are flagged as warnings, not failures.
_ACCESSIBILITY_FLAGS = [
    ("memoir",        "CAUTION",  "Many older adults associate 'memoir' with published authors. "
                                  "Consider 'life story', 'personal history', or 'story guide'."),
    ("oral history",  "NOTE",     "Professional term; may feel academic. "
                                  "Could be replaced with 'telling your story' in user-facing text."),
    ("timeline seed", "NOTE",     "Internal developer term — must not appear in Lori's speech."),
    ("pass 1",        "FLAG",     "Internal term — must not appear in Lori's speech."),
    ("pass 2",        "FLAG",     "Internal term — must not appear in Lori's speech."),
    ("identity mode", "FLAG",     "Internal term — must not appear in Lori's speech."),
    ("runtime",       "FLAG",     "Internal term — must not appear in Lori's speech."),
]

def test_language_accessibility():
    hdr("OFFLINE TEST 3 — Language accessibility audit")
    r = EvalResult("language_accessibility")

    # Check DEFAULT_CORE and onboarding directive for flagged terms
    # (in Lori's OUTPUT, not in LORI_RUNTIME block which is never shown)
    p_askname = compose_system_prompt("t", runtime71=_rt("askName"))

    # Extract only the parts that would appear in Lori's response (not runtime block)
    # The LORI_RUNTIME block is context for the model, not output — flag terms there are OK.
    # We want to check the ROLE directive and DEFAULT_CORE instructions.
    role_block = ""
    m = re.search(r"(ROLE — ONBOARDING.*)", p_askname, re.DOTALL)
    if m:
        role_block = m.group(1)

    for term, severity, note in _ACCESSIBILITY_FLAGS:
        found_in_role = term.lower() in role_block.lower()
        if severity == "FLAG":
            r.record(not found_in_role,
                     f"{severity}: '{term}' absent from role directive",
                     note=note if found_in_role else "")
        else:
            # CAUTION / NOTE — warn but don't fail
            if found_in_role:
                warn(f"{severity}: '{term}' found in directive — {note}")
                r.warnings += 1
            else:
                ok(f"{severity}: '{term}' not in directive (no user-facing risk)")

    # Check that the opening instruction tells Lori to be warm and conversational
    opening_instr = "[SYSTEM: Begin the identity onboarding sequence."
    r.record(
        "warm" in p_askname.lower() and "conversational" in p_askname.lower(),
        "Opening instruction includes 'warm' and 'conversational'"
    )

    # Check that the SYSTEM instruction itself doesn't use "memoir companion"
    # in a way that forces Lori to repeat the phrase (it's fine to describe her)
    # "memoir companion" lives in the startIdentityOnboarding JS function (app.js),
    # not in compose_system_prompt — verify it's in the source file instead.
    import pathlib
    app_js = (pathlib.Path(__file__).parent.parent / "ui" / "js" / "app.js").read_text()
    r.record(
        "memoir companion" in app_js,
        "app.js startIdentityOnboarding: 'memoir companion' present in opening instruction"
    )

    # Flag if "memoir" is the ONLY description — we want an alternative too
    has_life_story_alt = any(alt in p_askname.lower() for alt in
                             ["life story", "personal history", "your story", "life timeline"])
    if not has_life_story_alt:
        warn("Opening instruction only uses 'memoir' — consider adding 'life story' or 'personal history' "
             "as an accessible alternative for narrators who aren't writers")
        r.warnings += 1
    else:
        ok("Opening also references 'life story' / 'life timeline' alongside memoir")

    RESULTS.append(r)
    print(f"\n  Score: {r.score()}/100  ({r.passed} pass, {r.failed} fail, {r.warnings} warnings)")

# ═══════════════════════════════════════════════════════════════════════════
# OFFLINE TEST 4 — SEQUENCE ENFORCEMENT (prompt-level simulation)
# ═══════════════════════════════════════════════════════════════════════════

def test_sequence_enforcement():
    hdr("OFFLINE TEST 4 — Sequence enforcement (prompt-level)")
    r = EvalResult("sequence_enforcement")

    # Test that the ACTION phrase (what Lori is told to ask FOR right now) is phase-specific.
    # The WHY explanation may mention all three terms — that's intentional.
    # We check for "ask only for ... right now" phrasing as the action marker.

    # askName → action says "ask only for their preferred name right now"
    p = compose_system_prompt("t", runtime71=_rt("askName"))
    m = re.search(r"(ask\s+only\s+for\s+their\s+preferred\s+name\s+right\s+now)", p, re.I)
    r.record(bool(m), "askName ACTION: 'ask only for preferred name right now'")
    # Must NOT have an action phrase telling Lori to ask for DOB or birthplace now
    r.record(
        not re.search(r"ask\s+only\s+for\s+their\s+date\s+of\s+birth\s+right\s+now", p, re.I),
        "askName: no 'ask only for DOB right now' action present"
    )

    # askDob → action says "ask only for their date of birth right now"
    p = compose_system_prompt("t", runtime71=_rt("askDob", speaker="Maria"))
    m = re.search(r"(ask\s+only\s+for\s+their\s+date\s+of\s+birth\s+right\s+now)", p, re.I)
    r.record(bool(m), "askDob ACTION: 'ask only for date of birth right now'")
    r.record(
        not re.search(r"ask\s+only\s+for.*birthplace\s+right\s+now", p, re.I),
        "askDob: no 'ask only for birthplace right now' action present"
    )

    # askBirthplace → action says "ask only where they were born"
    p = compose_system_prompt("t", runtime71=_rt("askBirthplace", speaker="Maria"))
    m = re.search(r"(ask\s+only\s+where\s+they\s+were\s+born)", p, re.I)
    r.record(bool(m), "askBirthplace ACTION: 'ask only where they were born'")
    r.record(
        not re.search(r"ask\s+only\s+for\s+their\s+date\s+of\s+birth", p, re.I),
        "askBirthplace: no 'ask only for DOB' action present"
    )

    # "Do NOT skip ahead" is in every onboarding phase
    for phase in ("askName", "askDob", "askBirthplace"):
        p = compose_system_prompt("t", runtime71=_rt(phase, speaker="Test"))
        r.record(
            "Do NOT skip ahead" in p or "do not skip" in p.lower(),
            f"{phase}: 'Do NOT skip ahead' rule present"
        )

    RESULTS.append(r)
    print(f"\n  Score: {r.score()}/100  ({r.passed} pass, {r.failed} fail)")

# ═══════════════════════════════════════════════════════════════════════════
# LIVE TEST — API CALL HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _sse_call(message: str, system: str = "", timeout: int = 30) -> str:
    """Send a message via SSE chat endpoint, collect streamed response."""
    payload = json.dumps({
        "message": message,
        "system": system,
        "stream": True,
    }).encode()
    req = urllib.request.Request(
        CHAT_SSE,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    chunks = []
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8").strip()
                if line.startswith("data:"):
                    blob = line[5:].strip()
                    if blob == "[DONE]":
                        break
                    try:
                        d = json.loads(blob)
                        token = (d.get("choices", [{}])[0]
                                  .get("delta", {}).get("content", ""))
                        if token:
                            chunks.append(token)
                    except Exception:
                        pass
    except (urllib.error.URLError, TimeoutError) as e:
        return f"[API ERROR: {e}]"
    return "".join(chunks).strip()

def _api_alive() -> bool:
    try:
        urllib.request.urlopen(f"{API_BASE}/api/ping", timeout=3)
        return True
    except Exception:
        return False

# ═══════════════════════════════════════════════════════════════════════════
# LIVE TEST — ONBOARDING RESPONSE RUBRIC
# ═══════════════════════════════════════════════════════════════════════════

def _score_opening(response: str, verbose: bool = False) -> tuple[int, list[str]]:
    """Score Lori's opening message against rubric. Returns (score_0_100, findings)."""
    findings = []
    score = 0

    checks = [
        (20, r"\b(name|call you|what.*call)\b", "Asks for narrator's name"),
        (20, r"\b(date of birth|born|birthday|when.*born)\b", "Mentions date of birth"),
        (20, r"\b(where.*born|birthplace|grew up|earliest years)\b", "Mentions birthplace"),
        (15, r"\b(timeline|life story|story|history|memoir)\b", "References purpose of the info"),
        (10, r"\b(one|first|start|begin)\b", "Signals sequential / one-at-a-time approach"),
        (15, r"^(?!.*(date of birth|birthplace|where.*born)).*(name|call)",
             "First question is ONLY about name (not DOB or birthplace combined)"),
    ]

    for pts, pattern, label in checks:
        if re.search(pattern, response, re.I | re.S):
            score += pts
            findings.append(f"  {GREEN}+{pts}{RESET} {label}")
        else:
            findings.append(f"  {RED}-{pts}{RESET} {label}")

    # Deductions
    if response.count("?") > 1:
        score -= 10
        findings.append(f"  {RED}-10{RESET} More than one question in opening (stacking)")

    if len(response) > 500:
        score -= 5
        findings.append(f"  {YELLOW}-5{RESET} Opening is long (>{len(response)} chars) — may overwhelm")

    return max(0, score), findings


def _score_sequence_turn(turn: int, response: str) -> tuple[int, list[str]]:
    """Score turns 2 (DOB ask) and 3 (birthplace ask) of the sequence."""
    findings = []
    score = 0

    if turn == 2:  # after name given — should ask for DOB only
        checks = [
            (40, r"\b(date of birth|when.*born|birthday|born.*when)\b", "Asks for date of birth"),
            (20, r"\b(place|story|time|history|timeline)\b", "Gives brief reason"),
            (20, r"^(?!.*where.*born).*", "Does NOT ask for birthplace at same time"),
            (20, r"^[^?]*\?(?:[^?]*)$", "Exactly one question"),
        ]
    elif turn == 3:  # after DOB given — should ask for birthplace only
        checks = [
            (40, r"\b(where.*born|birthplace|grew up|hometown|city.*born|born.*city)\b", "Asks for birthplace"),
            (20, r"\b(story|place|roots|anchor|world)\b", "Gives brief reason"),
            (20, r"^(?!.*date of birth).*", "Does NOT re-ask for DOB"),
            (20, r"^[^?]*\?(?:[^?]*)$", "Exactly one question"),
        ]
    else:
        return 100, ["(no rubric for this turn)"]

    for pts, pattern, label in checks:
        if re.search(pattern, response, re.I | re.S):
            score += pts
            findings.append(f"  {GREEN}+{pts}{RESET} {label}")
        else:
            findings.append(f"  {RED}-{pts}{RESET} {label}")

    return score, findings


# ═══════════════════════════════════════════════════════════════════════════
# LIVE TESTS — 5 REPRESENTATIVE PERSONAS
# ═══════════════════════════════════════════════════════════════════════════

LIVE_PERSONAS = [
    {
        "id": "P1",
        "name": "Linda Carver",
        "age": 78,
        "desc": "Retired librarian — organized, chronological storyteller",
        "name_reply":      "My name is Linda",
        "dob_reply":       "I was born December 12, 1947",
        "birthplace_reply": "Burlington, Vermont",
    },
    {
        "id": "P2",
        "name": "Bob Hensley",
        "age": 72,
        "desc": "Retired electrician — practical, terse",
        "name_reply":      "Bob",
        "dob_reply":       "March '53",
        "birthplace_reply": "Dayton Ohio",
    },
    {
        "id": "P3",
        "name": "Maria Torres",
        "age": 58,
        "desc": "Bakery owner — sensory, warm storyteller",
        "name_reply":      "Maria, but people call me Mari",
        "dob_reply":       "I was born in the summer of 1966, August I think",
        "birthplace_reply": "San Antonio, Texas — but my family is from Monterrey",
    },
    {
        "id": "P4",
        "name": "Elena Petrova",
        "age": 62,
        "desc": "Bulgarian immigrant — detailed, formal",
        "name_reply":      "My name is Elena Petrova. You may call me Elena.",
        "dob_reply":       "I was born on the 4th of May, 1963",
        "birthplace_reply": "Sofia, Bulgaria",
    },
    {
        "id": "P5",
        "name": "James Okafor",
        "age": 68,
        "desc": "Retired postal worker — family historian, reflective",
        "name_reply":      "James, though my family calls me Jimmy",
        "dob_reply":       "November 1956",
        "birthplace_reply": "Baltimore, Maryland",
    },
]


def run_live_persona(persona: dict, verbose: bool, result: EvalResult):
    print(f"\n  {BOLD}{persona['id']}: {persona['name']}{RESET} ({persona['age']}) — {persona['desc']}")

    # Build the opening system prompt (askName phase, no speaker yet)
    opening_system = compose_system_prompt("eval-live", runtime71=_rt("askName"))

    # Turn 1: Lori's opening message
    lori_open = _sse_call(
        "[SYSTEM: Begin the identity onboarding sequence. "
        "Introduce yourself warmly as Lori, a personal memoir companion. "
        "Then briefly explain — in 2-3 short sentences — that you need three things to get started: "
        "their name, their date of birth, and where they were born. "
        "Explain WHY: these three anchors let you build a personal life timeline so you can guide "
        "the interview in the right order and ask the most meaningful questions. "
        "Tell them you will ask for each one separately, and it will only take a moment. "
        "Then ask for their preferred name. "
        "Keep the whole message warm, brief, and conversational — not clinical or form-like.]",
        system=opening_system,
    )
    if verbose:
        print(f"\n    Lori (opening):\n    {CYAN}{lori_open[:300]}{RESET}")

    score_open, findings_open = _score_opening(lori_open)
    result.record(score_open >= 70, f"Turn 1 opening quality: {score_open}/100")
    if verbose:
        for f in findings_open:
            print(f"    {f}")

    time.sleep(0.5)

    # Turn 2: Narrator gives name → Lori should ask for DOB
    dob_system = compose_system_prompt("eval-live", runtime71=_rt("askDob", speaker=persona["name"].split()[0]))
    lori_dob = _sse_call(persona["name_reply"], system=dob_system)
    if verbose:
        print(f"\n    User: {persona['name_reply']}")
        print(f"    Lori (DOB ask):\n    {CYAN}{lori_dob[:300]}{RESET}")

    score_dob, findings_dob = _score_sequence_turn(2, lori_dob)
    result.record(score_dob >= 70, f"Turn 2 DOB ask quality: {score_dob}/100")
    if verbose:
        for f in findings_dob:
            print(f"    {f}")

    time.sleep(0.5)

    # Turn 3: Narrator gives DOB → Lori should ask for birthplace
    bp_system = compose_system_prompt("eval-live", runtime71=_rt("askBirthplace", speaker=persona["name"].split()[0]))
    lori_bp = _sse_call(persona["dob_reply"], system=bp_system)
    if verbose:
        print(f"\n    User: {persona['dob_reply']}")
        print(f"    Lori (birthplace ask):\n    {CYAN}{lori_bp[:300]}{RESET}")

    score_bp, findings_bp = _score_sequence_turn(3, lori_bp)
    result.record(score_bp >= 70, f"Turn 3 birthplace ask quality: {score_bp}/100")
    if verbose:
        for f in findings_bp:
            print(f"    {f}")


def run_live_tests(verbose: bool):
    hdr("LIVE TEST — 5 persona onboarding scenarios")
    r = EvalResult("live_personas")

    for persona in LIVE_PERSONAS:
        run_live_persona(persona, verbose, r)

    RESULTS.append(r)
    print(f"\n  Score: {r.score()}/100  ({r.passed} pass, {r.failed} fail)")

# ═══════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

def print_summary():
    hdr("══════════════════════════════════════════")
    hdr("  EVAL SUMMARY")
    hdr("══════════════════════════════════════════")
    overall_pass = sum(r.passed for r in RESULTS)
    overall_fail = sum(r.failed for r in RESULTS)
    overall_warn = sum(r.warnings for r in RESULTS)

    for r in RESULTS:
        bar = "█" * (r.score() // 10) + "░" * (10 - r.score() // 10)
        colour = GREEN if r.score() >= 80 else YELLOW if r.score() >= 60 else RED
        print(f"  {colour}{bar}{RESET}  {r.score():3d}/100  {r.name}")

    total = overall_pass + overall_fail
    pct = int(100 * overall_pass / total) if total else 0
    colour = GREEN if pct >= 80 else YELLOW if pct >= 60 else RED
    print(f"\n  {BOLD}Overall: {colour}{pct}%{RESET}{BOLD} ({overall_pass}/{total} checks pass, {overall_warn} warnings){RESET}")

    # Language flag — always show
    print(f"\n{BOLD}Language note:{RESET}")
    print(
        "  The phrase 'personal memoir companion' may not fully resonate with all\n"
        "  older adults — many associate 'memoir' with published authors and may\n"
        "  disengage with 'I'm not a writer.' Consider having Lori also use the\n"
        "  phrase 'life story' or 'personal history' when explaining what she helps\n"
        "  build. The word 'companion' is well-chosen — warm and non-clinical.\n"
        "\n"
        "  Alternatives to consider:\n"
        "    • 'your life story companion'  — accessible, no writing connotation\n"
        "    • 'your personal story guide'  — positions Lori as guide, narrator as expert\n"
        "    • 'your memory companion'      — caution: clinical in care contexts\n"
        "    • Keep 'memoir' but pair it:   'life story and memoir companion'"
    )


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lorevox onboarding eval")
    parser.add_argument("--live",    action="store_true", help="Run live API tests (requires server)")
    parser.add_argument("--verbose", action="store_true", help="Show full Lori responses")
    args = parser.parse_args()

    print(f"{BOLD}Lorevox v7.4E — Onboarding Eval{RESET}")
    print(f"Target: http://localhost:8000\n")

    test_prompt_generation()
    test_name_extraction()
    test_language_accessibility()
    test_sequence_enforcement()

    if args.live:
        if _api_alive():
            run_live_tests(args.verbose)
        else:
            hdr("LIVE TEST — SKIPPED")
            print(f"  {YELLOW}API not reachable at {API_BASE}{RESET}")
            print("  Start the server (start_lorevox.bat) then re-run with --live")

    print_summary()
