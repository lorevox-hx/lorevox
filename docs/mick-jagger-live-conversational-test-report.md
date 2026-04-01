# Mick Jagger Live Conversational Test Report

**Lorevox 8.0 -- LLM + TTS + Extraction Latency Validation**
**Test Date:** March 31, 2026 | **Tester:** Claude (automated via Cowork)

---

## Runtime

| Component | Status |
|-----------|--------|
| UI started | `http://127.0.0.1:8080/ui/lori8.0.html` -- confirmed loaded |
| API started | Port 8000 -- **UNSTABLE** (multiple crashes during test) |
| LLM active | Yes -- Claude-based interview engine (when backend available) |
| TTS active | Port 8001 -- p335 speaker -- **UNSTABLE** (went down with API) |
| Narrator | Mick Jagger (Michael Philip Jagger) -- created via + New flow |

**Note:** Both API and TTS crashed multiple times during the test session. The backend had to be restarted by the operator at least once. This instability is a significant finding that impacts all other test results.

---

## Turn-by-Turn Latency Execution

9 conversational turns were executed covering: personal identity, parents, early life, education, early career, career progression, major achievements, personal challenges, interests/hobbies, and later years.

| Turn | Lori Text | TTS Before | After Complete | Proj Updated | BB Updated | Next Q Correct | Notes |
|------|-----------|------------|----------------|--------------|------------|----------------|-------|
| 1 | PASS | PASS | PASS | PASS | PASS | PASS | Identity gate: name captured as "Mick". Full name "Michael Philip Jagger" missed. |
| 2 | PASS | PASS | PASS | PASS | PASS | PASS | Compound answer (DOB + birthplace). DOB stored as 1943-01-01 (BUG). POB extracted correctly. |
| 3 | PASS | PASS | PASS | **FAIL** | **FAIL** | PASS | Multi-fact compound (father, mother, brother, address). Zero fields extracted to projection or candidates. |
| 4 | PASS | PASS | PASS | **FAIL** | **FAIL** | PASS | "Added to Story" badge appeared. But projection fields remain empty. Education, music interest not captured. |
| 5 | PASS | PASS | **FAIL** | **FAIL** | **FAIL** | PASS | Backend crashed after response. Chat service unavailable. Correction test ("Actually...") included. |
| 6 | PASS | PASS | PASS | **FAIL** | **FAIL** | PASS | Message stacking bug (3 Lori prompts queued). Mode drifted to "Companion" briefly. |
| 7 | PASS | PASS | PASS | **FAIL** | **FAIL** | PASS | "Added to Story" badge. Lori handled grief (Charlie Watts) sensitively. Still zero projection fields. |
| 8 | PASS | PASS | **FAIL** | **FAIL** | **FAIL** | PASS | Backend blip before response. Topic jump (hobbies) handled well by Lori. |
| 9 | PASS | PASS | PASS | **FAIL** | **FAIL** | PASS | Partial/vague answer test (declined politics). Later years content (heart surgery 2019). |

**Summary:** Lori text rendering and TTS timing were reliable. Question flow was logical and contextual. However, projection and Bio Builder updates failed on every turn except the identity gate (Turns 1-2 partial). The extraction-to-projection pipeline is the primary failure.

---

## Extraction Quality

### Multi-field extraction: FAIL

Despite providing rich compound answers containing 4-6 facts each, the multi-field extraction pipeline produced **zero** projection field updates across all 9 turns. The "Added to Story" badge appeared on some turns, suggesting the backend story capture may be working independently of the projection system, but the structured extraction that populates Bio Builder fields is completely non-functional.

**Verification:** JavaScript console inspection of `localStorage['lorevox_proj_draft_{mickId}']` confirmed `fieldCount: 0` after all turns. The projection draft exists but contains no filled fields.

### Missed facts

Every conversational fact was missed by the extraction pipeline. Key examples:

- Father: Basil Fanshawe "Joe" Jagger (PE teacher)
- Mother: Eva (hairdresser)
- Brother: Chris
- Dartford Grammar School
- London School of Economics
- Rolling Stones formation 1962
- Marquee Club residency
- Brian Jones (founding member)
- Keith Richards (met 1961 at Dartford station)
- Decca Records 1963
- Knighthood 2003
- Marriage to Bianca 1971 (Saint-Tropez)
- Jerry Hall (20+ years, four children)
- Charlie Watts death 2021
- Heart surgery 2019
- Hobbies: cricket, running (8 miles/day), art collecting

### Incorrect mappings

Three incorrect data points were found in the Personal Information section:

1. **Full Name** stored as "Mick" instead of "Michael Philip Jagger" -- the narrator explicitly said "my full name is Michael Philip Jagger"
2. **Date of Birth** stored as 1943-01-01 instead of 1943-07-26 -- the text "Twenty-sixth of July, 1943" was not parsed correctly; only the year was captured
3. **Time of Birth** shows "1250p, 12:50 pm -> auto-parsed" despite **never being mentioned** -- phantom data created by the system

### Grouping issues

Cannot assess repeatable section grouping (parents, siblings) because zero candidates were created. The `candidate_only` and `suggest_only` write modes were never triggered during the test.

---

## Conversation Quality

**Lori question flow:** PASS

Lori asked contextually appropriate questions that built on previous answers. She correctly referenced Denver Road, Dartford, Keith Richards, the Marquee Club, and Charlie Watts from the narrator's own words. She never introduced information the narrator hadn't mentioned (except one reference to "Charlie" in a question before it was discussed -- minor).

**Natural progression:** PASS

The conversation moved logically from identity through childhood, education, early career, achievements, personal life, hobbies, and later years. Lori respected the narrator's emotional boundaries (declined politics, grief about Charlie).

**Repetition issues:** MINOR

After narrator switch and return, Lori asked about Dartford childhood again (already covered in Turns 3-4). Conversation history may not fully persist across narrator switches.

---

## Latency Behavior

| Check | Result | Details |
|-------|--------|---------|
| LLM delay manageable | PASS | Responses generated within 5-10 seconds |
| TTS delay manageable | PASS | When operational, TTS played within acceptable timeframe |
| No race conditions | **FAIL** | Message stacking bug on reconnect (3-4 unprompted Lori messages) |
| No interruption required | **FAIL** | Backend crashes required manual restart |

---

## Persistence

| Check | Result | Details |
|-------|--------|---------|
| Reload | PASS | All localStorage data intact. Narrator header restored. 5 projection drafts, 13 questionnaire drafts preserved. Lori resumed with correct context. |
| Narrator switch | PASS | Switched Mick -> Mel Blanc -> Mick. No data bleed. Mel Blanc showed San Francisco context. Mick showed Dartford context on return. +1 qq_draft created (expected). |

---

## Bugs Found

| # | Bug | Severity | Reproduction | Suspected Layer |
|---|-----|----------|-------------|-----------------|
| 1 | Projection pipeline non-functional | **CRITICAL** | After 9 turns with rich multi-fact answers, projection has 0 filled fields. Only identity gate data saved. | `interview.js` projection / `extract.py` |
| 2 | Candidate pipeline non-functional | **CRITICAL** | Mentioned 2 parents, 1 sibling, 2+ band members. Candidates tab shows 0 people. | `projection-sync.js` / `candidate_only` write mode |
| 3 | DOB normalization failure | HIGH | Enter DOB as text ("Twenty-sixth of July, 1943"). System stores 1943-01-01. | Backend extraction / date normalizer |
| 4 | Backend intermittent crashes | HIGH | "Chat service unavailable" errors appeared 4+ times during 9 turns. | `server/code/api` (uvicorn or LLM timeout) |
| 5 | Message stacking on reconnect | HIGH | When backend recovers from outage, Lori sends 3-4 consecutive unprompted messages without waiting for user input. | Frontend WebSocket reconnect / idle timer |
| 6 | Full name not captured | MEDIUM | Say "my full name is Michael Philip Jagger." Only "Mick" stored as fullName. | Frontend projection / `prefill_if_blank` logic |
| 7 | Phantom time of birth | MEDIUM | Never mention birth time. System shows "1250p, 12:50 pm -> auto-parsed". | Backend extraction / normalizer hallucination |
| 8 | Mode drift to Companion | LOW | During Turn 6, mode indicator briefly showed "Companion" instead of "Life Story". | Frontend state / interaction mode logic |

---

## Pros

1. **Lori's conversational intelligence is genuinely impressive.** Questions were contextual, empathetic, and built naturally on previous answers. She felt like a skilled interviewer, not a script reader.

2. **Persistence layer is solid.** localStorage survived reload and narrator switch without data loss. The narrator isolation model works correctly with no cross-contamination.

3. **Identity gate (Pass 1) works end-to-end.** Name, DOB, and birthplace were captured and displayed in the narrator header. The onboarding flow is smooth.

4. **TTS integration with p335 speaker is seamless** when the backend is stable. Speech plays naturally and the UI correctly indicates readiness state via the status dot.

---

## Cons

1. **The extraction-to-projection pipeline is completely non-functional.** After 9 rich conversational turns, zero fields were populated in the projection, zero candidates were created, and zero suggestions were queued. This is the core value proposition of the system and it does not work.

2. **Backend stability is unacceptable** for a live conversational test. The API crashed 4+ times during 9 turns, requiring manual restart. This creates message stacking artifacts, lost extraction opportunities, and a broken user experience.

3. **Date normalization cannot parse written-out dates** ("Twenty-sixth of July"). This is a basic NLP task that should be handled reliably.

4. **Phantom data in Time of Birth field** (1250p) with no user input is a data integrity concern. The system is inventing biographical data.

---

## Key Insight

### What felt intelligent

Lori's question generation is the strongest component. She listened, remembered, referenced prior answers, navigated emotional topics with care, and never felt mechanical. The conversational layer is genuinely ready for human testing. The interview engine's ability to maintain context across turns and generate relevant follow-ups is production-quality.

### What felt mechanical

The extraction and Bio Builder pipeline felt **absent**, not mechanical. There was no visible evidence that the system was understanding or structuring the rich biographical data being shared. The "Added to Story" badge appeared occasionally but produced no actual structured output. The system captures conversation but does not learn from it.

---

## Final Status

# READY FOR NEXT ITERATION: NO

### Critical failure reasons

- Extraction misses ALL multi-fact answers (0/9 turns produced projection data)
- Bio Builder lags and misaligns (completely empty despite rich conversation)
- Projection fails under latency (backend crashes break the extraction pipeline)
- TTS/LLM timing causes state drift (message stacking on reconnect)

### Recommended next step

The conversational layer is strong. The extraction layer needs fundamental debugging before this system can advance.

1. **Isolate and unit-test the multi-field extraction pipeline** (`/api/extract-fields`) with the actual conversation texts from this test
2. **Verify `_extractAndProjectMultiField()` in interview.js** is actually being called and its results are being processed
3. **Fix backend stability** -- investigate why the API crashes intermittently during sustained conversation
4. **Fix date normalization** to handle written-out dates
5. **Audit phantom data** in Time of Birth -- trace where "1250p" originates
6. **Add reconnection debounce** to prevent message stacking after backend recovery
7. Re-run this test after fixes
