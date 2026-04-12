"""
Lorevox 7.1 — Real Model Validation Test
=========================================
Loads the actual Llama 3.1 8B Instruct model (same path and config as the
live server) and runs each test scenario against it.

Scoring: 0–100 per test group (not just pass/fail).
  40 pts  required signals (at least 1 must hit; full credit scales with coverage)
  20 pts  forbidden signals (all-or-nothing)
  30 pts  structural behavior checks (group-specific)
  10 pts  question discipline (≤ 2 question marks in response)

Grade thresholds:
  90–100  A  — Lori is behaving correctly
  70–89   B  — mostly correct, minor drift
  50–69   C  — partial compliance, directive tuning needed
  < 50    F  — directive is not being followed; fix prompt_composer.py

Usage (from server/code/):
    python test_model.py
    python test_model.py --verbose        # full response for every test
    python test_model.py --group 5        # single group
    python test_model.py --no-model       # pipeline-only (no GPU needed)

The script exits with code 0 if overall score ≥ 70, else 1.
"""

import argparse
import json
import os
import re
import sys
import time
import types
import importlib.util

# ── Bootstrap prompt_composer without a live DB ───────────────────────────────
def _load_dotenv(path):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

_load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

_db_stub = types.ModuleType("api.db")
_db_stub.ensure_session    = lambda x: None
_db_stub.get_session_payload = lambda x: {}
_db_stub.rag_get_doc_text  = lambda x: None

_api_pkg = types.ModuleType("api")
_api_pkg.__package__ = "api"
_api_pkg.__path__ = []
sys.modules.setdefault("api", _api_pkg)
sys.modules.setdefault("api.db", _db_stub)

_spec = importlib.util.spec_from_file_location(
    "api.prompt_composer",
    os.path.join(os.path.dirname(__file__), "api/prompt_composer.py"),
    submodule_search_locations=[],
)
_pc_mod = importlib.util.module_from_spec(_spec)
_pc_mod.__package__ = "api"
sys.modules["api.prompt_composer"] = _pc_mod
_spec.loader.exec_module(_pc_mod)
_pc_mod.db = _db_stub

compose_system_prompt = _pc_mod.compose_system_prompt


# ── Model loader ──────────────────────────────────────────────────────────────
_model = None
_tok   = None

def load_model():
    global _model, _tok
    if _model is not None:
        return _model, _tok

    model_path      = os.getenv("MODEL_PATH", "").strip()
    model_id        = os.getenv("MODEL_ID", "meta-llama/Meta-Llama-3.1-8B-Instruct").strip()
    model_src       = model_path if model_path else model_id
    quant           = os.getenv("QUANT", "").strip().lower()
    torch_dtype_str = os.getenv("TORCH_DTYPE", "bfloat16").strip()
    device_map      = os.getenv("DEVICE_MAP", "auto").strip()

    print(f"[test_model] Loading: {model_src}")
    print(f"[test_model] QUANT={quant or 'none'}  DTYPE={torch_dtype_str}  DEVICE={device_map}")

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        torch_dtype = getattr(torch, torch_dtype_str, torch.bfloat16)
        bnb_config  = None

        if quant == "4bit" or os.getenv("LOAD_IN_4BIT", "0") in ("1","true","True"):
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch_dtype,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
            )
            print("[test_model] 4-bit quantization active")
        elif quant == "8bit":
            bnb_config = BitsAndBytesConfig(load_in_8bit=True)

        local_only = bool(model_path) or os.getenv("TRANSFORMERS_OFFLINE","0") in ("1","true","True")

        _tok = AutoTokenizer.from_pretrained(model_src, local_files_only=local_only, trust_remote_code=True)
        if _tok.pad_token_id is None:
            _tok.pad_token_id = _tok.eos_token_id

        _model = AutoModelForCausalLM.from_pretrained(
            model_src,
            quantization_config=bnb_config,
            torch_dtype=torch_dtype if not bnb_config else None,
            device_map=device_map,
            local_files_only=local_only,
            trust_remote_code=True,
            attn_implementation=os.getenv("ATTN_IMPL", "sdpa"),
        )
        _model.eval()
        print(f"[test_model] Ready — device: {next(_model.parameters()).device}\n")
        return _model, _tok

    except Exception as e:
        print(f"[test_model] ERROR: {e}")
        sys.exit(1)


def generate(system_prompt: str, user_text: str, max_new: int = 300) -> str:
    import torch
    model, tok = load_model()
    msgs = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_text}]
    try:
        prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
    except Exception:
        prompt = f"<s>[INST] <<SYS>>\n{system_prompt}\n<</SYS>>\n\n{user_text} [/INST]"
    inputs = tok(prompt, return_tensors="pt").to(next(model.parameters()).device)
    with torch.inference_mode():
        out = model.generate(
            **inputs, max_new_tokens=max_new, temperature=0.3, do_sample=True,
            top_p=0.9, repetition_penalty=1.1,
            pad_token_id=tok.eos_token_id, eos_token_id=tok.eos_token_id,
        )
    return tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()


# ── Structural check helpers ──────────────────────────────────────────────────

def question_count(text: str) -> int:
    return text.count("?")

def word_count(text: str) -> int:
    return len(text.split())

def has_choice_pattern(text: str) -> bool:
    """Detects multiple-choice / either-or phrasing."""
    t = text.lower()
    return bool(re.search(r'\bor\b', t)) or "perhaps" in t or "maybe it was" in t or "could it be" in t

def is_scene_prompt(text: str) -> bool:
    """Detects Pass 2B style — asking for a specific moment/scene."""
    t = text.lower()
    return any(x in t for x in [
        "moment", "walk me through", "specific time", "picture that",
        "what do you see", "what do you hear", "what did it feel",
        "one particular", "one specific",
    ])

def is_broad_place_prompt(text: str) -> bool:
    """Detects Pass 2A style — broad, place-anchored, not a scene demand."""
    t = text.lower()
    return any(x in t for x in ["where were you", "where did you", "what was it like living",
                                  "what do you remember about", "who was around", "daily life"])

def has_empathy_first(text: str) -> bool:
    """Detects that Lori acknowledges emotion before (or instead of) asking."""
    t = text.lower()
    return any(x in t for x in [
        "that sounds", "that must have been", "i can hear", "i'm sorry",
        "thank you for sharing", "i'm glad you", "that was", "how difficult",
        "sounds like", "i understand",
    ])

def has_pause_offer(text: str) -> bool:
    t = text.lower()
    return any(x in t for x in ["pause", "stop", "rest", "break", "whenever you're ready",
                                  "no rush", "take your time", "another time", "enough for today",
                                  "whenever you are ready"])


# ── Scoring engine ────────────────────────────────────────────────────────────

def score_test(test: dict, response: str) -> dict:
    """
    Returns a score dict:
      {total: 0-100, required: 0-40, forbidden: 0-20,
       structural: 0-30, discipline: 0-10,
       details: [...], passed: bool}
    """
    r = response.lower()
    details = []

    # ── Required signals (40 pts) ─────────────────────────────────────────
    req_hits = [s for s in test["required"] if s.lower() in r]
    if not test["required"]:
        req_score = 40
    elif not req_hits:
        req_score = 0
        details.append("✗ No required signals found")
    else:
        coverage = min(len(req_hits) / max(len(test["required"]) * 0.3, 1), 1.0)
        req_score = int(40 * coverage)
        details.append(f"✓ Required hits ({len(req_hits)}): {req_hits[:4]}")

    # ── Forbidden signals (20 pts) ────────────────────────────────────────
    forb_hits = [s for s in test["forbidden"] if s.lower() in r]
    forb_score = 0 if forb_hits else 20
    if forb_hits:
        details.append(f"✗ Forbidden signals: {forb_hits}")

    # Global forbidden: "do you remember" phrasing is always too open
    if "do you remember a time" in r:
        forb_score = max(0, forb_score - 10)
        details.append("✗ Used 'do you remember a time' (too open-ended)")

    # ── Structural checks (30 pts) ────────────────────────────────────────
    struct_score = 0
    group = str(test["group"])

    if group == "1":
        # Pass 1: must ask for birth info, must not launch into story
        if any(x in r for x in ["born", "birth", "birthplace", "when were you", "where were you born"]):
            struct_score += 20
            details.append("✓ Asks for birth info")
        else:
            details.append("✗ Doesn't ask for birth info")
        if word_count(response) < 120:
            struct_score += 10
            details.append("✓ Response concise (< 120 words)")
        else:
            details.append(f"✗ Response too long ({word_count(response)} words)")

    elif group == "2":
        # Pass 2A early childhood: place-anchored, not a scene demand
        if is_broad_place_prompt(response) or any(x in r for x in ["home", "house", "neighborhood", "town", "city"]):
            struct_score += 20
            details.append("✓ Place-anchored question")
        else:
            details.append("✗ Not clearly place-anchored")
        if not is_scene_prompt(response):
            struct_score += 10
            details.append("✓ Correctly broad (not a scene demand)")
        else:
            details.append("✗ Wrongly asked for a specific scene (Pass 2B style)")

    elif group == "3":
        # Era switch: must be school-specific
        if any(x in r for x in ["school", "teacher", "grade", "classroom", "class", "student"]):
            struct_score += 20
            details.append("✓ School-era specific content")
        else:
            details.append("✗ Not school-specific")
        if "born" not in r and "toddler" not in r and "infant" not in r:
            struct_score += 10
            details.append("✓ No regression to earlier era")
        else:
            details.append("✗ Regressed to earlier era content")

    elif group == "4A":
        # Chronological: broad, NOT a scene demand
        if not is_scene_prompt(response):
            struct_score += 20
            details.append("✓ Broad question (not a scene demand)")
        else:
            details.append("✗ Asked for specific scene — wrong for Pass 2A")
        if is_broad_place_prompt(response) or any(x in r for x in ["where", "live", "daily", "around"]):
            struct_score += 10
            details.append("✓ Place/daily-life framing present")
        else:
            details.append("✗ Missing place/daily-life framing")

    elif group == "4B":
        # Narrative depth: MUST be a scene demand, must NOT be broad
        if is_scene_prompt(response):
            struct_score += 20
            details.append("✓ Scene-invitation question (Pass 2B correct)")
        else:
            details.append("✗ Not a scene demand — still broad (Pass 2A style)")
        if any(x in r for x in ["moment", "room", "sound", "smell", "face", "picture", "see", "hear"]):
            struct_score += 10
            details.append("✓ Sensory/specific detail language present")
        else:
            details.append("✗ Missing sensory detail language")

    elif group == "5":
        # Recognition: must offer a choice or anchor, not demand free recall
        if has_choice_pattern(response):
            struct_score += 20
            details.append("✓ Multiple-choice / either-or pattern detected")
        else:
            details.append("✗ No choice pattern — still open-ended recall")
        if question_count(response) >= 1:
            struct_score += 10
            details.append("✓ At least one question offered")
        else:
            details.append("✗ No question asked at all")

    elif group == "6":
        # Fatigue: short response, pause offer, no new question pressure
        if has_pause_offer(response):
            struct_score += 15
            details.append("✓ Offers to pause/stop")
        else:
            details.append("✗ No pause offer")
        if word_count(response) <= 80:
            struct_score += 15
            details.append(f"✓ Short response ({word_count(response)} words ≤ 80)")
        else:
            details.append(f"✗ Too long for fatigue ({word_count(response)} words)")

    elif group == "7b":
        # Grounding: empathy first, then gentle question (or no question)
        if has_empathy_first(response):
            struct_score += 20
            details.append("✓ Empathetic acknowledgment present")
        else:
            details.append("✗ No empathetic acknowledgment — jumped to question")
        if word_count(response) <= 80:
            struct_score += 10
            details.append(f"✓ Response brief ({word_count(response)} words)")
        else:
            details.append(f"~ Response moderate length ({word_count(response)} words)")

    else:
        struct_score = 15  # unknown group — give partial credit

    struct_score = min(struct_score, 30)

    # ── Question discipline (10 pts) ──────────────────────────────────────
    qc = question_count(response)
    # Fatigue (group 6) should have 0-1 questions; others ≤ 2
    if group == "6":
        disc_score = 10 if qc <= 1 else 0
        if qc > 1:
            details.append(f"✗ Too many questions in fatigue mode ({qc})")
    else:
        disc_score = 10 if qc <= 2 else (5 if qc == 3 else 0)
        if qc > 2:
            details.append(f"✗ Asked {qc} questions (should be ≤ 2)")

    # ── Total ─────────────────────────────────────────────────────────────
    total = req_score + forb_score + struct_score + disc_score
    total = max(0, min(100, total))
    passed = total >= 70

    return {
        "total": total,
        "required": req_score,
        "forbidden": forb_score,
        "structural": struct_score,
        "discipline": disc_score,
        "details": details,
        "passed": passed,
        "req_hits": req_hits,
        "forb_hits": forb_hits,
        "word_count": word_count(response),
        "question_count": qc,
    }


def grade(score: int) -> str:
    if score >= 90: return "A"
    if score >= 70: return "B"
    if score >= 50: return "C"
    return "F"


# ── Test definitions ──────────────────────────────────────────────────────────
TESTS = [
    {
        "group": 1,
        "name": "Timeline Seed Enforcement (Pass 1)",
        "rt71": {"current_pass":"pass1","current_era":None,"current_mode":"open",
                 "affect_state":"neutral","fatigue_score":0,"cognitive_mode":None},
        "user": "Hi Lori, I'd like to tell my story.",
        "required": ["born","birth","birthplace","date of birth","where were you born",
                     "when were you born","hometown","grew up"],
        "forbidden": ["what was school like","tell me about your childhood memories",
                      "first job","your career"],
        "rationale": "Lori must ask for DOB/birthplace only — no storytelling",
    },
    {
        "group": 2,
        "name": "Pass 2A / Early Childhood",
        "rt71": {"current_pass":"pass2a","current_era":"early_childhood","current_mode":"open",
                 "affect_state":"neutral","fatigue_score":0,"cognitive_mode":None},
        "user": "Okay, let's begin.",
        "required": ["home","house","neighborhood","street","town","city","grew up",
                     "young","earliest","remember","child"],
        "forbidden": ["high school","college","career","marriage","first job"],
        "rationale": "Lori should ask a place-anchored early childhood question",
    },
    {
        "group": 3,
        "name": "Era Switch — School Years",
        "rt71": {"current_pass":"pass2a","current_era":"school_years","current_mode":"open",
                 "affect_state":"neutral","fatigue_score":0,"cognitive_mode":None},
        "user": "Let's talk about that time.",
        "required": ["school","teacher","grade","classroom","friends","recess",
                     "learn","class","student"],
        "forbidden": ["toddler","baby","born","infant","retirement","career"],
        "rationale": "Lori should ask about school life — no era regression",
    },
    {
        "group": "4A",
        "name": "Pass 2A — Chronological breadth",
        "rt71": {"current_pass":"pass2a","current_era":"adolescence","current_mode":"open",
                 "affect_state":"neutral","fatigue_score":0,"cognitive_mode":None},
        "user": "Tell me more.",
        "required": ["where","live","home","neighborhood","around","daily",
                     "remember","life","place","town","area"],
        "forbidden": [],
        "rationale": "Lori should ask broadly — NOT a specific scene/moment",
    },
    {
        "group": "4B",
        "name": "Pass 2B — Narrative Depth",
        "rt71": {"current_pass":"pass2b","current_era":"adolescence","current_mode":"open",
                 "affect_state":"neutral","fatigue_score":0,"cognitive_mode":None},
        "user": "Tell me more.",
        "required": ["moment","specific","remember","picture","scene","recall",
                     "room","sound","smell","feel","imagine","walk me through",
                     "what do you see","one particular"],
        "forbidden": [],
        "rationale": "Lori should ask for a specific scene/memory — not a broad walk",
    },
    {
        "group": 5,
        "name": "Cognitive Recognition Mode",
        "rt71": {"current_pass":"pass2a","current_era":"school_years","current_mode":"recognition",
                 "affect_state":"neutral","fatigue_score":0,"cognitive_mode":"recognition"},
        "user": "I'm not sure I remember.",
        "required": ["was it","did you","house or","city or","or maybe","perhaps",
                     "could it be","might","or a","apartment","rural","nearby"],
        "forbidden": [],
        "rationale": "Lori should offer anchors/choices — not demand free recall",
    },
    {
        "group": 6,
        "name": "High Fatigue Response",
        "rt71": {"current_pass":"pass2a","current_era":"midlife","current_mode":"open",
                 "affect_state":"fatigue_hint","fatigue_score":80,"cognitive_mode":None},
        "user": "Continue.",
        "required": ["pause","rest","stop","break","whenever you","another time",
                     "take your time","no rush","anytime","enough for today","whenever you are ready"],
        "forbidden": [],
        "rationale": "Lori should offer to pause — short response, no new question push",
    },
    {
        "group": "7b",
        "name": "Affect + Grounding Mode",
        "rt71": {"current_pass":"pass2a","current_era":"midlife","current_mode":"grounding",
                 "affect_state":"sadness","affect_confidence":0.8,"fatigue_score":0,"cognitive_mode":None},
        "user": "That was a hard time.",
        "required": ["understand","sounds","difficult","hard","sorry","take your time",
                     "whenever you","no rush","gently","it's okay","don't have to",
                     "that must","i can hear","thank you for sharing"],
        "forbidden": [],
        "rationale": "Lori should acknowledge emotion first — empathy before (or instead of) a question",
    },
]


# ── Runner ────────────────────────────────────────────────────────────────────
def run_test(test: dict, verbose: bool, no_model: bool) -> dict:
    rt71          = test["rt71"]
    system_prompt = compose_system_prompt("test-model-run", runtime71=rt71)
    user_text     = test["user"]

    if no_model:
        # Pipeline-only mode: return a dummy result so scoring logic still runs
        response = "[PIPELINE-ONLY MODE — no model inference]"
        elapsed  = 0.0
    else:
        t0       = time.time()
        response = generate(system_prompt, user_text)
        elapsed  = time.time() - t0

    sc = score_test(test, response)

    g      = str(test["group"])
    status = "PASS" if sc["passed"] else "FAIL"
    gr     = grade(sc["total"])

    print(f"\n{'='*68}")
    print(f"[{status}] GROUP {g} — {test['name']}   Score: {sc['total']}/100 ({gr})")
    print(f"  Breakdown → required:{sc['required']}/40  "
          f"forbidden:{sc['forbidden']}/20  "
          f"structural:{sc['structural']}/30  "
          f"discipline:{sc['discipline']}/10")
    print(f"  Words: {sc['word_count']}  Questions: {sc['question_count']}  Time: {elapsed:.1f}s")
    for d in sc["details"]:
        print(f"    {d}")

    if verbose or not sc["passed"]:
        print(f"\n  ── Lori's response ──────────────────────────────────────")
        for line in response.split("\n"):
            print(f"  {line}")
        print(f"  ─────────────────────────────────────────────────────────")
        if not sc["passed"] and not verbose:
            print(f"\n  ── LORI_RUNTIME block sent ───────────────────────────────")
            if "LORI_RUNTIME" in system_prompt:
                blk = system_prompt[system_prompt.index("LORI_RUNTIME"):]
                for line in blk.split("\n"):
                    print(f"  {line}")
            print(f"  ─────────────────────────────────────────────────────────")

    return {**sc, "group": g, "name": test["name"], "response": response,
            "elapsed": elapsed, "system_prompt_len": len(system_prompt)}


def main():
    parser = argparse.ArgumentParser(description="Lorevox 7.1 Model Validation")
    parser.add_argument("--verbose",  "-v", action="store_true")
    parser.add_argument("--group",    "-g", type=str, default=None)
    parser.add_argument("--no-model", action="store_true",
                        help="Skip inference — validate pipeline only (no GPU needed)")
    args = parser.parse_args()

    tests = TESTS
    if args.group:
        tests = [t for t in TESTS if str(t["group"]).lower() == args.group.lower()]
        if not tests:
            print(f"No group '{args.group}'. Available: {[t['group'] for t in TESTS]}")
            sys.exit(1)

    print("="*68)
    print("LOREVOX 7.1 — MODEL VALIDATION  (scoring: 0–100 per group)")
    if args.no_model:
        print("MODE: pipeline-only (--no-model)  — no inference")
    else:
        print(f"Model: {os.getenv('MODEL_PATH') or os.getenv('MODEL_ID')}")
    print(f"Groups: {[t['group'] for t in tests]}")
    print("="*68)

    if not args.no_model:
        load_model()

    results = []
    for t in tests:
        r = run_test(t, verbose=args.verbose, no_model=args.no_model)
        results.append(r)

    # ── Summary ───────────────────────────────────────────────────────────────
    overall = int(sum(r["total"] for r in results) / len(results)) if results else 0
    passed  = sum(1 for r in results if r["passed"])

    print(f"\n{'='*68}")
    print(f"SUMMARY   Overall: {overall}/100 ({grade(overall)})   "
          f"Passing (≥70): {passed}/{len(results)}")
    print("="*68)
    for r in results:
        bar_fill = "█" * (r["total"] // 10) + "░" * (10 - r["total"] // 10)
        mark = "✓" if r["passed"] else "✗"
        print(f"  {mark} Group {r['group']:>3}  [{bar_fill}] {r['total']:>3}/100 ({grade(r['total'])})  {r['name']}")

    print(f"\n  Directive quality assessment:")
    if overall >= 90:
        print("  → Directives are strong. Model is compliant. Ready for live narrators.")
    elif overall >= 70:
        print("  → Mostly compliant. Tune directive text for failing groups in prompt_composer.py.")
    elif overall >= 50:
        print("  → Partial compliance. Directives need stronger DO/DO NOT language.")
    else:
        print("  → Model is not following directives. Rewrite failing directives with explicit examples.")

    # ── JSON result file ──────────────────────────────────────────────────────
    out_path = os.path.join(os.path.dirname(__file__), "test_model_results.json")
    with open(out_path, "w") as f:
        json.dump({
            "run_at":  time.strftime("%Y-%m-%dT%H:%M:%S"),
            "model":   os.getenv("MODEL_PATH") or os.getenv("MODEL_ID"),
            "overall": overall,
            "grade":   grade(overall),
            "passing": f"{passed}/{len(results)}",
            "results": [{
                "group":      r["group"],
                "name":       r["name"],
                "score":      r["total"],
                "grade":      grade(r["total"]),
                "passed":     r["passed"],
                "breakdown":  {k: r[k] for k in ("required","forbidden","structural","discipline")},
                "details":    r["details"],
                "words":      r["word_count"],
                "questions":  r["question_count"],
                "elapsed_s":  round(r["elapsed"], 1),
            } for r in results],
        }, f, indent=2)
    print(f"\n  Results → {out_path}")

    sys.exit(0 if overall >= 70 else 1)


if __name__ == "__main__":
    main()
