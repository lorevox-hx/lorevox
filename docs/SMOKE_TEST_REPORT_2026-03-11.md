# Smoke Test Report — 2026-03-11

**Machine:** Lenovo Legion Pro 7i Gen 10 · RTX 5080 (Blackwell) · WSL2 / Ubuntu 24.04
**Lorevox version:** v6.3.0
**Tested by:** Chris + Claude
**Result:** PASS (after two repo-level fixes applied during session)

---

## Test Scope

This was a new-laptop bring-up test. Both servers were started fresh with no prior data directory. The smoke test covered the core REST API contract from the browser:

| Step | Endpoint | Assertion |
|------|----------|-----------|
| 1 | `POST /api/people` | Person created, `person_id` returned |
| 2 | `PUT /api/profiles/:id` | Profile saved, round-trip JSON verified |
| 3 | `POST /api/interview/start` | Session created, `question.prompt` non-null |

The following were **not** tested in this session and remain pending manual verification:

- Mic input / STT transcription
- TTS auto-speak playback
- WebSocket streaming chat round-trip
- Answer submission and next-question progression
- Section boundary summary generation
- Timeline event recording
- Final memoir draft trigger

---

## Infrastructure Verified

| Component | Status | Notes |
|-----------|--------|-------|
| CUDA / PyTorch | ✅ | torch 2.12 nightly / cu128, RTX 5080 detected |
| Llama 3.1-8B (4-bit NF4) | ✅ | 4 shards loaded in ~105s, model warm after first inference |
| Whisper large-v3 | ✅ | Loaded on CUDA (float16) alongside LLM |
| TTS VITS (port 8001) | ✅ | Warmed on CPU, no GPU contention |
| FastAPI / Uvicorn | ✅ | Both servers reached Application startup complete |
| SQLite DB | ✅ | init_db created schema, DB connectivity confirmed |
| WebSocket | ✅ | `/api/chat/ws` accepted connection during warmup |
| CORS | ✅ | OPTIONS preflight returned 200 |

---

## Defects Found and Fixed

### Bug 1 — `PUT /api/profiles/:id` returns 500 on every install

**Severity:** High — affects all installs, not just this machine.

**Root cause:** `routers/profiles.py` called `update_profile_json(..., reason="PUT /api/profiles")` but `db.py:update_profile_json()` had no `reason` parameter. Python raises `TypeError` → FastAPI returns 500.

**Symptom:** Any attempt to save a profile silently fails. The UI may not surface this clearly, meaning profile data was being lost on every save across every install.

**Fix:** Added `reason: str = ""` to `update_profile_json` signature in `server/code/api/db.py`.

**File:** `server/code/api/db.py`

---

### Bug 2 — `POST /api/interview/start` returns `question: null` on fresh install

**Severity:** High — interview flow is non-functional until manually resolved.

**Root cause:** `init_db()` creates the `default` plan row in `interview_plans` but never seeds any questions. `interview_plan.json` exists at the repo root but there was no mechanism to import it into the database, and no seed script existed.

**Symptom:** Interview session is created successfully (200 OK, `session_id` returned), but `question` is `null`. The interview appears to start but delivers no first question. Failure is silent — the API doesn't error, it just returns empty.

**Fix (two parts):**
1. Created `scripts/seed_interview_plan.py` — reads `interview_plan.json`, inserts all sections and questions with `plan_id = "default"`. Safe to re-run.
2. Added a startup guard in `routers/interview.py:start_interview()` — calls `db.count_plan_questions(plan_id)` before creating the session; raises HTTP 503 with an actionable message if the plan is empty.

**Files:** `scripts/seed_interview_plan.py`, `server/code/api/db.py`, `server/code/api/routers/interview.py`

---

## Protections Added (Post-Test)

### Startup Guard

`POST /api/interview/start` now returns a 503 with a clear message if the plan is unseeded:

```json
{
  "detail": "Interview plan 'default' has no seeded questions. Run: python scripts/seed_interview_plan.py"
}
```

This converts a silent wrong-result failure into a loud, actionable error.

### Bootstrap Script

`scripts/bootstrap.sh` — single entry point for all DB setup on a fresh install:
1. Creates data directories
2. Initialises DB schema (`init_db`)
3. Seeds the interview plan (`seed_interview_plan.py`)
4. Verifies question count > 0 and exits non-zero if not

LEGION_SETUP.md Phase 7 updated to point here instead of individual steps.

---

## Remaining Risks

| Risk | Severity | Status |
|------|----------|--------|
| STT mic capture not tested | Medium | Pending — requires manual mic test in UI |
| TTS playback not tested | Medium | Pending — requires manual auto-speak test |
| WebSocket chat not load-tested | Low | Basic connection verified; streaming not exercised |
| Answer submission / section summaries not tested | Medium | Pending — requires completing at least one section |
| Memoir generation not tested | Low | Pending — requires completing full interview |
| `scripts/seed_oral_history.py` referenced in LEGION_SETUP.md but does not exist | Low | Dead reference — script never existed; remove or create |

---

## Next Verification Steps

Complete Phase 8 of LEGION_SETUP.md in order:

1. **Chat round-trip** — type a short message, verify streamed response. Confirms LLM generating, not just loading.
2. **STT** — click mic, say a sentence, verify transcription appears. Confirms Whisper on GPU.
3. **TTS** — enable auto-speak, send a chat message, verify audio plays sentence by sentence.
4. **Interview answer** — start an interview in the UI, answer the first question, verify the second question is returned.
5. **Section completion** — answer all questions in one section, verify a section summary is generated and persisted.
6. **Timeline** — verify at least one memory event lands in the timeline after an answer.

Once all six pass, the Legion is fully validated.

---

## Commit

```
c4b58d1  Fix profile PUT 500, add interview plan seed script, update setup doc
```

Follow-up commit (this session):
- `server/code/api/db.py` — `count_plan_questions()` helper
- `server/code/api/routers/interview.py` — 503 guard on empty plan
- `scripts/bootstrap.sh` — single-step DB bootstrap
- `LEGION_SETUP.md` — Phase 7 replaced with bootstrap script reference
- `docs/SMOKE_TEST_REPORT_2026-03-11.md` — this file
