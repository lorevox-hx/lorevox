# Lorevox Three-Layer Test Coverage Status

**Date:** 2026-03-21
**Reference model:** `tests/three-layer-model.md`
**Current version:** v7.4C / v7.4D (Phase 6B active)
**Backend at time of report:** OFFLINE — LLM server not running

This document maps current test coverage against the three-layer model requirements.

---

## LAYER 1 — Simulation / Persona Layer

### Coverage summary

| Cohort subset | Status | Source |
|---|---|---|
| Personas 1–20 (broad-spectrum baseline) | ✅ Prior runs — bugs A/B/C confirmed fixed | `test_30persona_5runs_couple5.md` |
| Personas 21–25 (regression personas) | ✅ v6.3 regression confirmed — all fixed | `test_30persona_5runs_couple5.md` |
| Personas 26–28 (cognitive accessibility) | 🔴 Bugs D/E/F identified — D/E resolved, F open | `test_30persona_5runs_couple5.md` |
| Personas 29–30 (Ellie + George couple) | 🔴 Bugs G/H identified — both open | `test_30persona_5runs_couple5.md` |

### Run type coverage

| Run type | Status | Notes |
|---|---|---|
| Run A — Fresh session from start | ✅ Covered by identity gating (Phase 6B) | Live verification blocked by offline backend |
| Run B — Profile pre-filled / resume | ⚠️ Partial — persistence tested, resume not fully verified | Bug B1 fixed; pause/resume (Bug H) open |
| Run C — Free-chat mode | ✅ Phase 6B directive still fires without interview driver | Static verified |
| Run D — Era jump / section jump | ⚠️ Not yet explicitly tested post-Phase 6B | Pending live session |
| Run E — Ambiguity / stress run | ✅ _parseDob handles uncertainty; cognitive-auto wired | Text-only; camera distress still open (Bug F) |
| Run F — Couple/support-person run | 🔴 Bug G (mixed speaker) unresolved — no UI toggle | Open |

### Scoring domain coverage

| Domain | Status | Notes |
|---|---|---|
| 1. Timeline seed discipline | ✅ Phase 6B gates Pass 1 until identity confirmed | Static verified; live test pending restart |
| 2. Timeline routing (era/pass) | ✅ Pass1/2A/2B directives in prompt_composer verified | Tests 4–10 in VALIDATION_74C_LIVE |
| 3. Cognitive accessibility | ⚠️ CognitiveAuto wired; no cognitive_mode directive in prompt yet | Bug D: slow-mode not in system prompt |
| 4. Safety and warmth | ✅ Track A fires (trauma/grief/health); cognitive distress gap open | Bug F confirmed text-blind |
| 5. Support-person integrity | 🔴 No speaker disambiguation; paired field present but unused | Bug G |
| 6. Structured-data integrity | ✅ DOB: _parseDob + estimated_dob_note path; sibling disambiguation fixed | Bugs A/B/C/E verified |

### Mandatory persona checks (pass/fail)

| Persona | Required checks | Status |
|---|---|---|
| 21. Walt Nowak | Born Poland ≠ Polish memories; `'35,'38,'39` = birth years | ✅ v6.3 confirmed |
| 22. Dot Simmons | 2-digit sibling year strings; dates-heavy not confusing | ✅ v6.3 confirmed |
| 23. Priya Nair-Thomas | Born Bangalore, moved 8 months → no childhood memory assumption | ✅ v6.3 confirmed |
| 24. Danny Kowalczyk | Laptop bug repro fixed; "sister's 68, brother's 66" safe | ✅ v6.3 confirmed |
| 25. Ava Chen-Murphy | Hong Kong birth, no HK memory; Cantonese bilingual path | ✅ v6.3 confirmed |
| 26. Peggy O'Brien | Uncertain DOB not stored as false date; repetition tolerated; warm pacing | ✅ Bug E fixed; D partial |
| 27. Hank Washington | Rich long-term + poor recency; repeated answers no cold transitions | ⚠️ Bug D (slow-mode) open |
| 28. Ruth Silverstein | Cognitive distress acknowledged; children's name confusion handled | 🔴 Bug F open |
| 29. Ellie Morrison | Mixed-speaker controlled; fatigue/pause logic | 🔴 Bug G, H open |
| 30. George Morrison | Support-person data doesn't leak into memoir voice | 🔴 Bug G open |

---

## LAYER 2 — Live Runtime / Persistence Layer

### Block coverage

| Block | Status | Notes |
|---|---|---|
| Block 1 — Startup / readiness | ✅ Verified in prior sessions | Model, DB, WebSocket, UI, debug overlay, cognitive-auto all confirmed |
| Block 2 — Prompt path (runtime71 → LORI_RUNTIME) | ✅ Static verified this session | `buildRuntime71()` confirmed emitting Phase 6B fields correctly |
| Block 3 — Real model obedience (Run 2) | ⚠️ Partially run | Tests 4–10 in VALIDATION_74C_LIVE; Tests 1–3 (STT/TTS) blocked |
| Block 4 — Live browser persona sessions | ⚠️ Minimal — only "Margaret Final Smoke Test" seeded | 7 required live personas not yet run |
| Block 5 — Persistence / resume | ⚠️ Partial — Bug B1 (profile empty after onboarding) fixed | Pause/resume (Bug H) open |
| Block 6 — Speech stack (STT/TTS) | 🔴 NOT RUN — requires physical mic + speaker | Blocked for all sessions |
| Block 7 — Safety and private segments | ✅ Track A verified (Tests 4–10); cognitive distress gap (Bug F) noted | |

### Emotion / affect detection status

| Path | Status |
|---|---|
| MediaPipe FaceMesh library | ✅ Loaded from local vendor |
| FaceMesh instance / camera feed | 🔴 NOT ACTIVE — no camera subject during testing |
| Visual affect signals (`affectState`, `distress_hint`) | NULL — all null, affect_confidence = 0 |
| CognitiveAuto text processing | ✅ Wired — processes text signals (uncertainty, hesitation, fatigue) |
| Text-based cognitive distress detection | 🔴 NOT IMPLEMENTED — Bug F root cause confirmed |

**Note on camera absence:** Automated testing sessions have no person in front of the camera. This is expected and valid — it means all visual affect paths (facial mood, distress hint, dissociation hint) produce null outputs. Any test involving visual distress detection **must be marked REQUIRES LIVE MANUAL RUN**. Text-based signals still work and were tested.

### Live runtime evidence collected

| Evidence type | Status |
|---|---|
| Browser console `runtime71` | ✅ Captured — Phase 6B fields confirmed |
| Server log `LORI_RUNTIME` | ⚠️ Not captured this session — backend offline |
| Run 2 result file | ✅ From prior session |
| Live persona transcript excerpts | ⚠️ Only "Margaret Final Smoke Test" + CQ tests 4–10 |
| Persistence / resume result | ⚠️ Partially verified |
| TTS/STT verification | 🔴 NOT RUN |

---

## LAYER 3 — Architecture Boundary Layer

### Test coverage

| Test | Status | Notes |
|---|---|---|
| Test A — Speaker integrity | 🔴 NOT TESTED — Bug G open | Mixed-speaker transcript corrupts memoir; no fix implemented yet |
| Test B — Uncertainty preservation | ✅ Partial — `_parseDob` handles uncertain DOB; `estimated_dob_note` path exists | Memoir output for fuzzy dates not yet verified end-to-end |
| Test C — Correction provenance | 🔴 NOT TESTED — requires couple session + memoir generation | Dependent on Bug G fix |
| Test D — Safety boundary (distress in Archive/Memoir) | ✅ Track A fires correctly; private segment flags tested | Cognitive distress gap (Bug F) affects Archive completeness |
| Test E — Private segment exclusion | ✅ Segment flags CRUD verified; exclusion from memoir not yet end-to-end tested | |
| Test F — Scene integrity | ⚠️ "Save as Memory" not yet structured scene capture | Future feature |

### Archive / History / Memoir separation

Current verdict: **NOT FULLY AUDITED**

- Archive layer (raw transcript preservation): ✅ Transcript saving works; mixed-speaker transcripts are the primary contamination risk
- History layer (facts, entities, timeline): ✅ `_extractFacts()` wired and posting; no dedup (Bug B5 open)
- Memoir layer (narrativization): ⚠️ Memoir draft tab exists; end-to-end memoir generation with couple/uncertain data not audited

---

## Open Bugs Summary

| Bug | Description | Layer(s) | Severity | Status |
|---|---|---|---|---|
| B5 | `_extractFacts()` no server-side dedup | L2, L3 | Medium | Open |
| F | `cognitive-auto.js` `distress` text-blind (camera only) | L1, L2 | Medium | Open — fix defined |
| G | No support-person mode — mixed-speaker memoir corruption | L1, L2, L3 | 🔴 Critical | Open |
| H | No session pause/resume | L1, L2 | Medium | Open |
| 5 | Helper block describes Save button as "bottom" (it's at top) | L2 | Low | Open |
| 8 | `LORI71.runtime71Snapshot()` missing Phase 6B fields | L2 | Low | Open (debug only) |

---

## Release Gate Status (vs three-layer-model.md §7)

### Gate A — Simulation
- [x] 30-person simulation run completed (v6.3)
- [x] No regression in prior bugs (A/B/C confirmed fixed)
- [ ] Cognitive/couple issues tracked — **D partial, F/G/H open**

**Gate A: NOT MET — F, G, H require resolution or explicit deferral**

### Gate B — Runtime
- [ ] Run 2 real-model validation — **Tests 1–3 blocked (mic/TTS)**
- [x] Live browser/runtime test — **partial (Tests 4–10 done)**
- [x] Persistence works — **Bug B1 fixed**
- [ ] TTS/STT verified — **NOT RUN**

**Gate B: NOT MET — speech stack unverified**

### Gate C — Architecture
- [ ] No mixed-speaker memoir contamination — **Bug G open**
- [x] No silent false exact dates — **Bug E fixed**
- [x] Private segment boundaries verified — **segment flags tested**
- [ ] Archive/History/Memoir separation verified — **L3 not fully audited**

**Gate C: NOT MET — Bug G must be resolved before memoir output is trustworthy**

---

## Next actions to advance toward gates

**Immediate (requires backend restart):**
1. Start LLM backend → hard refresh → run CQ2/3/4/6/7 post-Phase-6B to confirm identity gating works end-to-end
2. Rerun Tests 7–8 in a fully onboarded (pass2+) session to confirm EMPATHY RULE and REVISION RULE work without Pass 1 interference

**Short-term (code changes):**
3. Implement Bug F fix: add `cognitiveDistress` text regex to `cognitive-auto.js` `inferSignals()` → route to `grounding` mode
4. Implement Bug G fix: "Support person present" toggle + speaker disambiguation in transcript handling
5. Implement Bug H fix: "Take a break" button + session pause/resume path

**Verification after fixes:**
6. Re-run personas 28 (Ruth) for Bug F, 29+30 (Ellie+George) for Bug G/H
7. Run Layer 3 boundary audit with couple session + memoir generation
8. Run Tests 1–3 (STT/TTS) with physical mic — required before Gate B

**Deferred to later phases:**
- Phase 8: MediaPipe WASM crash fix (face mesh on Windows GPU path)
- Phase 9: UI scale / focus mode / dock widening
