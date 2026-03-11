# Lorevox v6.3 — Full Audit Report
**Date:** 2026-03-11
**Scope:** Deep repo code audit · 30-persona code-trace simulation · Live API smoke test
**Environment:** Lenovo Legion Pro 7i Gen 10 · RTX 5080 · WSL2/Ubuntu · Python .venv-gpu
**Tester:** Claude (Cowork) + Chris (manual voice/UI validation)

---

## Executive Summary

Three parallel workstreams were completed:

1. **Live API smoke test** — Core path (create person → save profile → start interview) passes cleanly. The `ingest_basic_info` endpoint crashes on every call (confirmed 500).
2. **Deep repo code audit** — 8 bugs found across 5 files. One is a guaranteed runtime crash. Two are missing-feature gaps confirmed by the 30-persona test. Three affect data integrity and safety system coverage.
3. **30-persona code-trace simulation** — Bugs A/B/C from prior test cycles are fixed in v6.3. Bugs D through H are all confirmed present in the current codebase.

**Current status:** Lorevox v6.3 is functional for the primary chat/interview loop with voice. It is not safe to use with cognitively vulnerable users (Bugs D, F) or with support-person/proxy sessions (Bug G).

---

## Part 1 — Live API Smoke Test

**Executed:** 2026-03-11 ~18:07 UTC via browser `fetch()` against `http://localhost:8000`

| Step | Endpoint | Method | Status | Result |
|------|----------|--------|--------|--------|
| 1 | `/api/people` | POST | 200 | ✅ Person created — `person_id` returned |
| 2 | `/api/profiles/{id}` | PUT | 200 | ✅ Profile saved — merge correct |
| 3 | `/api/interview/start` | POST | 200 | ✅ Session started — first question: *"What is your full legal name?"* |
| 4 | `/api/profiles/{id}/ingest_basic_info` | POST | **500** | ❌ Internal Server Error — confirmed crash (see Bug 1) |

**Smoke test verdict: PASS on core path. FAIL on ingest endpoint.**

Steps 1–3 represent the full happy path a real user walks through when Lori conducts a chat interview. That path is working. Step 4 tests the form-ingest convenience endpoint which crashes every time it is called.

---

## Part 2 — Deep Repo Code Audit

### Bug 1 — `ingest_basic_info` parameter mismatch — CRITICAL / Runtime Crash

**File:** `server/code/api/routers/profiles.py` line ~80
**File:** `server/code/api/db.py` line 728

**Router calls:**
```python
ingest_basic_info_document(person_id, body.document, create_relatives=body.create_relatives)
```

**DB function signature:**
```python
def ingest_basic_info_document(person_id: str, text: str) -> Dict[str, Any]:
```

Two problems:
- Second argument type mismatch: router passes `Dict[str, Any]` (`body.document`), db function expects `str`.
- `create_relatives` keyword argument does not exist on the db function — Python raises `TypeError` immediately.

**Impact:** Every call to `POST /api/profiles/{id}/ingest_basic_info` crashes with HTTP 500. The basic-info intake form (if used from any frontend) is completely non-functional.

**Fix required:**
```python
# db.py — update signature to accept dict and add create_relatives support
def ingest_basic_info_document(
    person_id: str,
    document: Dict[str, Any],
    create_relatives: bool = False
) -> Dict[str, Any]:
    init_db()
    p = get_profile(person_id) or {"profile_json": {}}
    prof = dict(p.get("profile_json") or {})
    ingest = dict(prof.get("ingest") or {})
    ingest["basic_info"] = {"document": document, "ts": _now_iso()}
    prof["ingest"] = ingest
    # Optionally: if create_relatives, parse document for relative names
    return update_profile_json(person_id, prof, merge=False)
```

---

### Bug 2 — No DOB validation — HIGH / Data Integrity

**File:** `server/code/api/db.py` lines 593–605 (`create_person`), 617–637 (`update_person`)

`date_of_birth` is stored as-is with no parsing or normalisation. Any string is accepted: `"1947, I think? June?"`, `"sometime in the 40s"`, `"yesterday"`. The field is never validated against ISO 8601 or any date format.

**Impact:** Profile data is silently corrupted. Downstream features that attempt to compute age, format timelines, or display birth year will receive garbage input. Confirmed by 30-persona test Bug E (Vera #18, Hank #27).

**Fix required:**
```python
import re
_ISO_DATE_RE = re.compile(r'^\d{4}(-\d{2}(-\d{2})?)?$')

def _sanitise_dob(raw: str) -> str:
    """Accept ISO dates (YYYY, YYYY-MM, YYYY-MM-DD). Store uncertain input as-is under a separate key."""
    if not raw:
        return ""
    raw = raw.strip()
    if _ISO_DATE_RE.match(raw):
        return raw
    # Store uncertain string but flag it
    return f"uncertain:{raw}"
```
Or: accept the fuzzy string but store it in a separate `date_of_birth_raw` field alongside a parsed/normalised `date_of_birth`.

---

### Bug 3 — Missing `cognitive_distress` safety category — HIGH / Safety Gap

**File:** `server/code/api/safety.py`

Current categories in `_COMPILED` patterns:
`suicidal_ideation`, `sexual_abuse`, `physical_abuse`, `domestic_abuse`, `caregiver_abuse`, `child_abuse`, `distress_call`

There is **no** `cognitive_distress` category. Statements like "I can't remember anything anymore", "I think I'm losing my mind", "I don't recognise my family", or "I'm scared I have Alzheimer's" will not trigger any safety intercept. They will not produce a softened-mode response, will not surface resources, and will be treated as ordinary interview answers.

**Impact:** Cognitively vulnerable users disclosing distress about memory loss receive no protective response. Confirmed by 30-persona test Bug F (Margaret #4, Peggy #26, Ruth #28).

**Fix required:** Add cognitive distress patterns to `_COMPILED` and a corresponding `get_resources_for_category` branch:
```python
# safety.py — add to _COMPILED list
(r"\bcan'?t remember\b.*\banymore\b",      "cognitive_distress", 0.72),
(r"\blosing my mind\b",                    "cognitive_distress", 0.80),
(r"\bdon'?t recogni[sz]e\b",              "cognitive_distress", 0.68),
(r"\bscared.*alzheimer\b",                "cognitive_distress", 0.85),
(r"\bmemory (is )?getting worse\b",       "cognitive_distress", 0.70),
(r"\bconfused all the time\b",            "cognitive_distress", 0.72),
(r"\bforgetting everything\b",            "cognitive_distress", 0.75),
```
And in `get_resources_for_category`:
```python
elif category == "cognitive_distress":
    return [ALZHEIMERS_ASSOC, CAREGIVER_ACTION_NETWORK, CRISIS_988]
```

---

### Bug 4 — Silent JSON parse failure in `prompt_composer.py` — MEDIUM / Silent Data Loss

**File:** `server/code/api/prompt_composer.py`

The profile JSON passed to the prompt composer is parsed without error surfacing. If `PROFILE_JSON` is malformed or the profile dict is unexpectedly shaped, the parse silently fails and the LLM prompt is assembled without any profile context. Lori will conduct the interview as if she knows nothing about the person.

**Impact:** Any corruption of the profile JSON (e.g. from a partial write, a crash mid-update, or a malformed ingest) causes Lori to ask questions the subject already answered, with no error surfaced to the user or logs.

**Fix required:** Wrap JSON parse in a try/except that logs the failure and raises or returns a partial prompt with a note, rather than silently proceeding:
```python
try:
    profile = json.loads(profile_json_str)
except (json.JSONDecodeError, TypeError) as e:
    logger.error("prompt_composer: failed to parse PROFILE_JSON for person %s: %s", person_id, e)
    profile = {}
```

---

### Bug 5 — No cognitive accessibility / simple-language mode — MEDIUM / Accessibility Gap

**Files:** `server/code/api/prompt_composer.py`, `server/code/api/interview_engine.py`

There is no mechanism to trigger simplified language, shorter sentences, or repetition-tolerant responses for users with cognitive impairment. The softened mode (implemented for emotional distress) does not cover cognitive accessibility. The system has no way to detect or adapt to someone who is confused, hard of hearing, or cognitively slower.

**Impact:** Users like Peggy (#26), Hank (#27), Ruth (#28) in the 30-persona test receive the same complex, multi-part questions as a fully cognitively intact 45-year-old. Confirmed by 30-persona test Bug D.

**Fix required:**
- Add `cognitive_mode: bool` field to `InterviewSession` and a trigger path in the safety/affect layer.
- In `prompt_composer.py`, when `cognitive_mode=True`, append system instruction: "Use very short sentences. Ask only one thing at a time. Repeat the last answer warmly before asking the next question."

---

### Bug 6 — No support-person / proxy mode — MEDIUM / Data Attribution Error

**Files:** `server/code/api/routers/interview.py`, `server/code/api/interview_engine.py`

There is no mechanism for a session to designate that responses are being provided by a third party (e.g. "George is speaking for Ellie because Ellie has advanced dementia"). All submitted answers are attributed to the subject (`person_id`) regardless of who is actually speaking.

**Impact:** A caregiver or family member speaking on behalf of a subject will have their words stored as the subject's first-person testimony. This creates false attribution in the life archive — potentially introducing fabricated memories or inaccurate biographical data. Confirmed by 30-persona test Bug G (George speaking for Ellie #29, #30).

**Fix required:**
- Add `proxy_person_id: Optional[str]` to `InterviewStartRequest` and `interview_sessions` table.
- Tag all answers with `answered_by: "proxy"` or `answered_by: "subject"` in the answer log.
- In `prompt_composer.py`, when proxy mode active, use: "You are speaking with {proxy_name}, who is providing answers on behalf of {subject_name}."

---

### Bug 7 — No session pause / resume — MEDIUM / UX / Data Loss Risk

**File:** `server/code/api/routers/interview.py`

There is no `PATCH /api/interview/sessions/{id}/pause` or `resume` endpoint. Once a session starts, the only way to continue it later is to call `/api/interview/start` again with the same `person_id` — which creates a new session, abandoning progress in the old one.

**Impact:** Any interruption (phone call, fatigue, caregiver arriving) loses all in-session context. The next session starts from question 1. Confirmed by 30-persona test Bug H (Vera #18, Ellie #29, Ruth #28).

**Fix required:**
```python
# routers/interview.py
@router.patch("/sessions/{session_id}/pause")
def pause_session(session_id: str):
    db.set_session_state(session_id, "paused")
    return {"status": "paused", "session_id": session_id}

@router.post("/sessions/{session_id}/resume")
def resume_session(session_id: str, req: ResumeRequest):
    session = db.get_interview_session(session_id)
    if not session: raise HTTPException(404)
    next_q = db.get_next_question(session_id, session["current_question_idx"])
    return {"session_id": session_id, "question": next_q, "status": "resumed"}
```
And in `app.js`: persist `current_session_id` to `localStorage` so the user can close the tab and resume.

---

### Bug 8 — No answer deduplication in `interview_engine.py` — LOW / UX

**File:** `server/code/api/interview_engine.py`

The engine does not detect when a user has already provided an answer to a question and the same question is surfaced again (e.g. after a session restart, or if question ordering logic has a bug). The duplicate answer is stored without comment.

**Impact:** Minor data quality issue — duplicate answers accumulate in the `interview_answers` table. Low priority but worth a guard.

---

## Part 3 — 30-Persona Code-Trace Simulation Results

Cross-referencing the `test_30persona_5runs_couple5.md` simulation against the current codebase (post v6.3 fixes):

| Bug ID | Description | Status in v6.3 | Evidence |
|--------|-------------|----------------|----------|
| A | Profile save 500 (reason= param) | ✅ **Fixed** | `update_profile_json(reason="")` added to db.py |
| B | Interview start returns `question: null` | ✅ **Fixed** | `seed_interview_plan.py` + startup guard in interview.py |
| C | TTS silent / NDJSON not parsed | ✅ **Fixed** | `drainTts` now parses `wav_b64` NDJSON; persistent `_ttsAudio` |
| D | No cognitive accessibility mode | ❌ **Open** | No cognitive/accessibility logic in prompt_composer.py or interview_engine.py |
| E | Invalid DOB stored raw without validation | ❌ **Open** | `create_person()` accepts any string — no ISO date check |
| F | `cognitive_distress` not a safety category | ❌ **Open** | safety.py has 7 categories, cognitive_distress not among them |
| G | No support-person/proxy mode | ❌ **Open** | No `proxy_person_id` anywhere in routers or db schema |
| H | No session pause/resume | ❌ **Open** | No pause/resume endpoints; no session state stored to localStorage |

**30-persona simulation pass rate (v6.3):** 12 of 30 personas completed without hitting an open bug (all baseline personas). 18 of 30 hit at least one open bug.

**Personas most affected:**
- Margaret (#4) — cognitive distress disclosure, no safety intercept (Bug F)
- Vera (#18) — uncertain DOB "1947 I think", stored raw (Bug E) + session interrupted, no resume (Bug H)
- Peggy (#26), Hank (#27), Ruth (#28) — cognitive impairment, no accessibility mode (Bug D)
- Ellie (#29), couple run (#30) — proxy session, George's words attributed to Ellie (Bug G)

---

## Part 4 — Bug Priority Matrix

| # | Bug | Severity | Effort | Fix In |
|---|-----|----------|--------|--------|
| 1 | `ingest_basic_info` crash (create_relatives) | 🔴 Critical | 30 min | v6.4 |
| 3 | Missing `cognitive_distress` safety category | 🔴 High | 2 hrs | v6.4 |
| 2 | No DOB validation | 🟠 High | 1 hr | v6.4 |
| 5 | No cognitive accessibility mode | 🟠 Medium | 4 hrs | v6.4 |
| 6 | No support-person/proxy mode | 🟠 Medium | 6 hrs | v6.5 |
| 7 | No session pause/resume | 🟠 Medium | 4 hrs | v6.5 |
| 4 | Silent PROFILE_JSON parse failure | 🟡 Medium | 1 hr | v6.4 |
| 8 | No answer deduplication | 🟢 Low | 1 hr | v6.5 |

---

## Part 5 — Previously Fixed (This Session)

These issues were found and fixed during this session on 2026-03-11:

| Fix | File(s) | Commit |
|-----|---------|--------|
| Profile save 500 — added `reason: str = ""` param | db.py | earlier session |
| Interview `question: null` — seeded 45 questions, startup guard | interview.py, seed_interview_plan.py, bootstrap.sh | earlier session |
| TTS silent — NDJSON `wav_b64` parse + persistent Audio element | ui/js/app.js | earlier session |
| Mic re-permission on every unmute — `_ensureRecognition()` singleton | ui/js/app.js | earlier session |
| STT "period" transcribed literally — `_normalisePunctuation()` | ui/js/app.js | 69e7470 |
| UI 404 — added `UI_DIR` to .env | .env | earlier session |

---

## Appendix — File Inventory (Key Files Audited)

| File | Lines | Notes |
|------|-------|-------|
| `server/code/api/db.py` | ~1730 | Core data layer. No connection leaks detected. One untested function signature mismatch (Bug 1). |
| `server/code/api/routers/profiles.py` | ~100 | Bug 1 caller. Otherwise clean. |
| `server/code/api/routers/interview.py` | ~250 | Startup guard added. Missing pause/resume (Bug 7). |
| `server/code/api/safety.py` | 384 | Missing cognitive_distress category (Bug 3). |
| `server/code/api/prompt_composer.py` | unknown | Silent JSON failure (Bug 4). No accessibility/proxy mode (Bugs 5, 6). |
| `server/code/api/interview_engine.py` | unknown | No dedup (Bug 8). No cognitive/proxy logic. |
| `ui/js/app.js` | unknown | All v6.3 audio/STT fixes applied. No localStorage for session resume (Bug 7 client side). |
| `scripts/seed_interview_plan.py` | new | Idempotent seed — 45 questions, 13 sections. |
| `scripts/bootstrap.sh` | new | One-command setup entry point. |

---

*Report generated by Claude (Cowork) · Lorevox v6.3 · 2026-03-11*
