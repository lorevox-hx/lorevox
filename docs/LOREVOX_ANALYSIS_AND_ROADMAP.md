# Lorevox — Full Analysis, Strengths, Weaknesses & Roadmap
*Based on complete codebase review + Dorothy Whitfield simulation — March 2026*

---

## Target Hardware: Lenovo Legion Pro 7i Gen 10

| Component | Spec | Lorevox implication |
|-----------|------|---------------------|
| GPU | RTX 5080 16GB VRAM | Runs Llama 3.1 8B in 4-bit comfortably (~5GB VRAM). Room for Whisper large-v3 simultaneously. TTS should move to GPU. |
| CPU | Intel 14th-gen HX | Handles FastAPI + SQLite + multi-agent pipeline without bottleneck |
| RAM | 32GB+ | Enough for two-process design (LLM + TTS) plus browser |
| Cooling | ColdFront | Sustained GPU workloads are stable — long interview sessions won't throttle |
| OS | WSL2 Ubuntu 24.04 | Already the dev environment — no changes needed |
| CUDA | 12.8 (Blackwell) | requirements.blackwell.txt is already written for this |

**Bottom line:** This laptop can run the full stack — LLM + Whisper STT + TTS — all on GPU simultaneously. That is the goal configuration.

---

## STRENGTHS

### Architecture
- **Clean two-process split** (LLM :8000 / TTS :8001) — TTS never blocks the interview
- **Person-first data model** is correct for memoir work — everything ties to a `person_id`
- **Append-only transcript archive** — raw source is never rewritten (Memory Archive we added)
- **SQLite + file hybrid** — portable, no external DB dependency, backs up as a simple folder copy
- **Local-first** — all data and models stay on device; no cloud required; critical for elder subjects

### Interview Engine
- **Section-based flow** with 13 well-designed sections covering a full life
- **Auto follow-up generation** — LLM proposes 5 clarifying questions at plan end
- **Section summary drafts** at section boundaries — gives subject and interviewer a checkpoint
- **Skip support** — subjects can skip any question without breaking the flow
- **Profile JSON injection** into system prompt — Lori knows who she's talking to

### LLM Stack
- **Llama 3.1 8B Instruct** — well-suited for memoir work: good narrative quality, follows instructions reliably
- **4-bit NF4 quantization** — halves VRAM usage with minimal quality loss
- **Flash attention 2** — faster token generation for longer sessions
- **LoRA adapter support** — path exists for future fine-tuning on memoir/oral history style
- **Graceful fallback** — if LLM unavailable, interview engine still functions (just no summaries)

### New Features (just added)
- **Memory Archive** — full person-first transcript tree on disk with append-only JSONL
- **Facts system** — atomic claims with confidence scores and source provenance
- **Life Phases** — era blocks that give calendar context to facts
- **Calendar events** — rich date precision model (exact_day → approx_year → season → unknown)

---

## WEAKNESSES

### Critical — Blocks Live Interviews

**1. No live voice input pipeline**
The `/stt/transcribe` endpoint exists in `api.py` and `faster-whisper` is in requirements, but there is no browser microphone → WebSocket → Whisper → text flow. Subjects currently have to type all answers. For an 86-year-old like Dorothy that is a hard blocker.

**2. TTS running CPU-only**
`run_tts_8001.sh` sets `TTS_GPU=0`. On an RTX 5080 this wastes the GPU. p335 synthesis at CPU speed will have noticeable latency per question read-back. On GPU it would be near-instant.

**3. Launcher scripts point to wrong path**
Both `run_gpu_8000.sh` and `run_tts_8001.sh` use `cd /mnt/c/lorevox` but the repo is now at `/mnt/c/Users/chris/lorevox`. They will fail on the laptop.

**4. Memoir draft is too short**
`draft_final_memoir()` targets 500–900 words. A full life memoir covering 80+ years should be 3,000–8,000 words minimum across multiple chapters. The current output is more of a summary paragraph than a memoir.

**5. RAG uses keyword matching only**
`rag_query()` in `db.py` uses token overlap scoring — no embeddings. `sentence-transformers` and `faiss-cpu` are in requirements but never called. The oral history manifesto and golden mock standard docs are pinned by hardcoded IDs (`sys_oral_history_manifesto`, `sys_golden_mock_standard`) which may not exist in a fresh DB.

**6. No export to PDF or DOCX**
After all interviews are done and a memoir is drafted, there is no way to export it to a printable document from the UI. The subject's family expects a physical book or PDF, not a web page.

---

### Significant — Reduces Quality

**7. No adaptive branching**
The interview is strictly linear. If Dorothy mentions her brother died young of a heart attack, Lori does not branch to explore grief, sibling relationships, or family health history. She just moves to the next preset question. A good interviewer would follow the thread.

**8. No multi-session continuation**
If an interview is paused and resumed days later, the system starts a new `session_id` with no memory of the previous session. Lori doesn't know what was already covered.

**9. Voice p335 is British English**
For American subjects (which will be most users) a British voice sounds slightly off. The VCTK corpus has American voices. Subjects may find it distracting.

**10. Form section questions have no UI flow**
Questions for parents, grandparents, siblings, spouse, children, and pets are `kind: "form_section"` but the interview driver in the UI just shows them as text prompts. The structured form data never gets properly written to the profile.

**11. No progress indicator**
Subjects have no idea how far through the interview they are. For a 30-question plan an 86-year-old needs to know "you are on question 8 of 30" or "we are halfway through."

**12. Section summaries are generated but not stored**
`draft_section_summary()` is called in `interview.py` and returned in the API response, but the summary text is never persisted to the DB or archive. It lives only in the API response — if the UI doesn't display it, it is lost.

**13. No automatic fact extraction from transcripts**
The `facts` table now exists but there is no LLM agent that reads completed interview answers and extracts atomic facts into it. The table will stay empty unless someone calls `POST /api/facts/add` manually.

**14. TTS ENV variable name inconsistency**
`run_tts_8001.sh` sets `TTS_SPEAKER_LIBRARIAN=p335` but `tts.py` reads `TTS_SPEAKER_LORI`. The voice would load correctly only by default fallback — the env var is silently ignored.

**15. No STT for form fields**
Even if we add voice input for long-text answers, the date/name fields in form sections have no voice path.

---

### Minor — Polish

**16. No spell correction on voice transcripts**
Whisper occasionally mishears proper nouns (family names, place names). There is no post-processing step to flag or correct these.

**17. No confidence display for uncertain facts**
Facts with confidence < 0.7 should be visually flagged for human review. The UI has no review queue.

**18. The interview plan has no "warm-up" question**
Starting immediately with "What is your full legal name?" is clinical. A brief warm-up like "How are you feeling today?" helps older subjects settle before the structured questions begin.

**19. No session pause/resume UX**
There is no "Save and continue later" button. If the browser closes mid-interview, the session_id is lost from state.

**20. Memoir draft does not cite sources**
The final memoir does not reference which session or which answer a fact came from. For archival integrity it should.

---

## TEST SUBJECT PLAN

To validate the system before live subjects, run four distinct test profiles:

### Subject A — Dorothy Whitfield (already built)
- 86F, slow memory, 3 children, widowed
- Tests: patience handling, vague dates, trailing answers, slow recall

### Subject B — Robert "Bob" Delaney
- 74M, Korean War–era veteran, grew up in rural Ohio
- Sharp memory, terse answers, military pride, reluctant to discuss feelings
- Tests: short answers, male voice (need different TTS speaker), military section

### Subject C — Maria Elena Vasquez
- 68F, first-generation immigrant from Mexico (arrived 1978), bilingual
- Code-switches mid-answer, cultural references, large extended family
- Tests: name handling, cultural sections, large family map, possible accent impact on STT

### Subject D — James Whitmore Jr.
- 55M, relatively young for memoir work, career-focused, two divorces
- Tech-comfortable (will type answers), complex family structure
- Tests: multiple marriages in timeline, career-heavy answers, younger demographics

---

## WHAT NEEDS TO BE DONE — PRIORITY ORDER

### Phase 1 — Fix the Blockers (do first, enables live testing)

| # | Task | Why |
|---|------|-----|
| 1 | Fix launcher paths: `/mnt/c/lorevox` → `/mnt/c/Users/chris/lorevox` | Scripts fail without this |
| 2 | Enable TTS GPU: `TTS_GPU=1` in run_tts_8001.sh | Near-zero latency voice read-back |
| 3 | Fix TTS env var: `TTS_SPEAKER_LIBRARIAN` → `TTS_SPEAKER_LORI` | Voice silently loading wrong var |
| 4 | Add browser microphone → WebSocket → Whisper → text flow | Core input method for live subjects |
| 5 | Add RAG seed script to populate `sys_oral_history_manifesto` and `sys_golden_mock_standard` | Lori's persona instructions may be missing from DB entirely |

### Phase 2 — Quality (enables good interviews)

| # | Task | Why |
|---|------|-----|
| 6 | Add interview progress indicator to UI ("Question 8 of 30, Section: Early Years") | Reduces anxiety for elderly subjects |
| 7 | Persist section summaries to DB/archive | Currently lost after API response |
| 8 | Add "warm-up" question as section 0 before personal information | Reduces opening awkwardness |
| 9 | Add multi-session resume: detect existing sessions for a person, offer to continue | Critical for multi-day interviews |
| 10 | Try American English TTS voices: p236, p241, p245 (VCTK American speakers) | Better voice fit for US subjects |

### Phase 3 — Memoir (delivers the end product)

| # | Task | Why |
|---|------|-----|
| 11 | Extend memoir draft to full chapter structure (3,000–8,000 words) | Current 500–900 word output is a summary, not a memoir |
| 12 | Add LLM-driven fact extractor that reads completed sessions → populates facts table | Makes the calendar and fact system actually fill up automatically |
| 13 | Add PDF/DOCX export for completed memoir | Subject's family needs a physical/printable document |
| 14 | Add memoir citation layer (each paragraph traces to source session + answer) | Archival integrity |

### Phase 4 — Polish

| # | Task | Why |
|---|------|-----|
| 15 | Add adaptive follow-up branching (detect emotional/notable answers, offer to go deeper) | Richer interviews |
| 16 | Add fact review queue UI (show low-confidence facts for human approval) | Quality control |
| 17 | Add Whisper proper noun correction pass (flag uncertain transcriptions for review) | Accuracy on names and places |
| 18 | Add "Save and resume later" session state to localStorage → server | Prevents data loss on browser close |
| 19 | Embed sentence-transformers for real semantic RAG search | Better context retrieval than keyword matching |
| 20 | Add American English voice selection UI (let interviewer pick voice per subject) | Personalization |

---

## IMMEDIATE NEXT STEPS FOR LAPTOP SETUP

```bash
# 1. Fix launcher scripts
sed -i 's|/mnt/c/lorevox|/mnt/c/Users/chris/lorevox|g' launchers/run_gpu_8000.sh
sed -i 's|/mnt/c/lorevox|/mnt/c/Users/chris/lorevox|g' launchers/run_tts_8001.sh

# 2. Enable TTS GPU + fix env var name in run_tts_8001.sh
#    Change: TTS_GPU=0 → TTS_GPU=1
#    Change: TTS_SPEAKER_LIBRARIAN → TTS_SPEAKER_LORI

# 3. Install dependencies on laptop (WSL2)
cd /mnt/c/Users/chris/lorevox
pip install -r server/requirements.blackwell.txt --break-system-packages

# 4. Test LLM server
cd server && bash ../launchers/run_gpu_8000.sh

# 5. Test TTS server
bash ../launchers/run_tts_8001.sh

# 6. Open UI
# http://localhost:8000/ui/index.html
```

---

## END-TO-END MEMOIR PIPELINE (target state)

```
Live Subject sits down
        ↓
Browser microphone captures voice
        ↓
WebSocket streams audio → Whisper STT on GPU
        ↓
Text appears in interview UI
        ↓
Interview engine serves next question
        ↓
TTS reads question aloud (p335 or chosen voice)
        ↓
Answers stored in DB (interview_answers)
        ↓
Transcript archived to disk (append-only JSONL)
        ↓
[After each section] Section summary drafted by LLM
        ↓
[After full interview] Follow-up questions auto-generated
        ↓
Subject answers follow-ups
        ↓
LLM Fact Extractor reads all answers → populates facts table
        ↓
Calendar engine builds timeline events from facts
        ↓
Life phases assigned
        ↓
Memoir drafter generates full chapter structure (5–8 chapters)
        ↓
Human review: edit, approve facts, add photos
        ↓
PDF/DOCX export → printable memoir
```

This is achievable on the Legion Pro 7i within the current architecture.
The biggest gap between now and that pipeline is items 4, 11, and 13 from the priority list above:
**voice input, longer memoir output, and document export.**

---

## VOICE SELECTION NOTES

For American subjects, VCTK voices to test:
- `p236` — American English female, clear
- `p241` — American English male, natural pace
- `p245` — American English female, warmer tone
- `p335` (current) — British English female, clear but accented

Run a comparison: synthesize "Tell me about your earliest memory" with each and listen.

---

*Document generated: March 2026*
*Codebase version: Lorevox v4.5*
