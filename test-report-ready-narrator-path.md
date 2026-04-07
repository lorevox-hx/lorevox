# Lorevox 9.0 — Ready Narrator Path: Live Chrome Test Report

**Date:** April 6, 2026, 6:02–6:13 PM MDT
**Tester:** Claude (live browser automation via Chrome)
**Environment:** Lorevox 9.0 on laptop, freshly restarted backend + WSL + Chrome cleanup
**Page tested:** `http://localhost:8000/ui/lori9.0.html`
**Backend:** Running at localhost:8000, model warm (latency 0.63–0.73s)

---

## 1. Purpose

This test covers the **one remaining untested flow**: the "ready" narrator open path. Previous test sessions (v1 and v2) verified startup neutrality, new narrator flow, incomplete narrator gating, rapid-click debounce, and narrator switching — but all three narrators in the database were incomplete (missing name + DOB), so the ready branch of `lv80SwitchPerson` was never exercised live.

This session makes Christopher Todd Horne genuinely ready through the product's own UI path, then verifies the entire ready-open flow live in Chrome.

---

## 2. How Christopher Was Made Ready

Christopher's identity was completed through Lorevox's deliberate onboarding path — the same path a real user would follow. No state was faked or injected.

### Sequence

1. **Opened Christopher (classified incomplete):** Clicked Open on Christopher in narrator selector. Classifier returned "incomplete" — missing name and DOB. Incomplete card rendered with "Complete profile basics" button.

2. **Clicked "Complete profile basics":** Chat cleared. Single Lori onboarding greeting appeared asking for narrator's name. Console: `User chose to complete basics for 1ec33c14...` → `startIdentityOnboarding() — new user path, phase=askName`

3. **Provided name:** Typed "My name is Christopher Todd Horne, but I go by Chris." Clicked "Save to My Story" in memoir capture modal. Lori advanced to DOB phase.

4. **Provided DOB:** Typed "I was born on September 10, 1982." Clicked "Save to My Story." Lori advanced to birthplace phase.

5. **Provided birthplace:** Typed "I was born in Denver, Colorado." Clicked "Save to My Story." Identity phase completed.

### Backend Confirmation

```
[identity] Patched existing person: 1ec33c14-7097-4dbe-af34-1ae6b93dcc12
identity_complete: true
identity_phase: "complete"
assistant_role: "interviewer"
current_pass: "pass2a"
speaker_name: "Christopher"
dob: "1982-09-10"
pob: "Denver, Colorado"
```

Header updated to: **Christopher / 1982-09-10 · Denver, Colorado · age 43**

---

## 3. Persistence Verification

After completing onboarding, performed a full page reload (`location.reload(true)`).

**Result after reload:**
- Narrator selector opened (startup neutrality maintained)
- Christopher's card showed: **Christopher — 1982-09-10 · Denver, Colorado · age 43**
- Kent and Janice still showed: **DOB unknown**
- Chat behind selector: completely empty
- Lori: silent

**Console proof:**
```
[startup] Enforced blank startup state — no active narrator.
[startup] v8.1 — blank state enforced. User must select a narrator.
[readiness] Model warm and ready. Latency: 0.71s
[readiness] _onModelReady — firing deferred startup.
[readiness] v9 — startup neutral. Opening narrator selector.
```

**Verdict: Data persisted through reload. Christopher's identity survived the round-trip to the backend.**

---

## 4. Test Matrix

| # | Test | Narrator | Expected | Observed | Pass/Fail |
|---|------|----------|----------|----------|-----------|
| A | Ready narrator open | Christopher (ready) | Classified "ready", resume greeting by name, no onboarding, no incomplete card | `Narrator classified as: ready`. Single Lori bubble: warm welcome-back addressing Christopher by name, referencing Denver, asking interview question. Header: "Christopher / 1982-09-10 · Denver, Colorado · age 43". Session set to pass2a/interviewer. | **PASS** |
| B | Rapid-click (4x) on ready narrator | Christopher (ready) | 1 load accepted, 3 ignored, single resume greeting | Click 1: `Opening narrator: 1ec33c14...` Clicks 2–4: `Open click ignored — already loading 1ec33c14...` Single classification "ready". Single Lori bubble. No stacking. | **PASS** |
| C | Regression: incomplete narrator (Kent) | Kent James Horne | Classified "incomplete", explicit UI card, Lori silent | `Narrator classified as: incomplete`. "Narrator record incomplete" card: "missing: name and date of birth." Two buttons. Lori silent. | **PASS** |
| D | Regression: startup neutrality | (none) | Blank chat, narrator selector opens, Lori silent | Blank startup. Selector opened. Console: `v9 — startup neutral`. Christopher shows full identity, Kent/Janice show "DOB unknown." | **PASS** |

---

## 5. Ready Path Console Trace

The critical sequence when opening Christopher after reload:

```
[v9-gate] Opening narrator: 1ec33c14-7097-4dbe-af34-1ae6b93dcc12
[app] Phase G: narrator state snapshot loaded for 1ec33c14-7097-4dbe-af34-1ae6b93dcc12
[v9-gate] Narrator classified as: ready
[Lori 7.1] runtime71 (sys) → model: {
  "current_pass": "pass2a",
  "assistant_role": "interviewer",
  "identity_complete": true,
  "identity_phase": "complete",
  "speaker_name": "Christopher",
  "dob": "1982-09-10",
  "pob": "Denver, Colorado"
}
[v9-gate] Narrator open complete. Status: ready
```

Key observations:
- Phase G state snapshot loaded successfully from backend
- Classifier `getNarratorOpenState()` returned "ready" (name + DOB both present)
- System prompt sent via `sendSystemPrompt()` with resume-greeting instructions
- Session state set to `pass2a` / `identityPhase: "complete"` / `assistantRole: "interviewer"`
- No call to `startIdentityOnboarding()` — onboarding correctly bypassed

---

## 6. Findings

**No bugs found during this test run.** The ready narrator path works correctly end-to-end.

### Key Validations

1. **Classifier accuracy:** `getNarratorOpenState()` correctly returns "ready" for Christopher (has name + DOB) and "incomplete" for Kent/Janice (missing both).

2. **Resume greeting behavior:** Lori produces a single warm welcome-back message addressing the narrator by name, references their biographical context (Denver), and immediately asks an interview question. No re-introduction, no onboarding prompts, no DOB/name requests.

3. **Session state on ready open:** `currentPass` set to "pass2a", `identityPhase` to "complete", `assistantRole` to "interviewer" — all correct for a returning narrator with complete identity.

4. **Debounce on ready path:** Rapid-clicking (4x) on a ready narrator produces exactly one load and one greeting. Three clicks correctly ignored.

5. **Data persistence:** Christopher's identity (name, DOB, birthplace) survives full page reload. Backend `[identity] Patched existing person` confirmed the write, and Phase G snapshot reload confirmed the read.

---

## 7. Files Changed

No files were changed during this test run. All patches were already in place from the original implementation session. Christopher's identity was populated through the product's normal onboarding UI, not through code changes.

---

## 8. Final Status

### **PASS**

All acceptance criteria verified live in Chrome:

- A. Ready narrator open (Christopher): **PASS**
- B. Rapid-click on ready narrator (4x): **PASS**
- C. Regression — incomplete narrator (Kent): **PASS**
- D. Regression — startup neutrality: **PASS**

Combined with the v2 test report results, all narrator-open states are now verified live:

| State | Narrator | Test Report | Status |
|-------|----------|-------------|--------|
| Startup neutrality | (none) | v2 | **PASS** |
| New narrator flow | (new) | v2 | **PASS** |
| Incomplete narrator open | CTH, Kent, Janice | v2 | **PASS** |
| Deliberate onboarding from incomplete | CTH | v2 | **PASS** |
| Rapid-click (incomplete) | Kent | v2 | **PASS** |
| Narrator switching | Kent → Janice | v2 | **PASS** |
| **Ready narrator open** | **Christopher** | **this report** | **PASS** |
| **Rapid-click (ready)** | **Christopher** | **this report** | **PASS** |

---

## 9. Follow-up Items

1. **Error path (`lv80ShowNarratorOpenError`) still untested live.** The backend didn't throw during `lvxSwitchNarratorSafe` for any narrator. To exercise this, would need to simulate a backend failure.

2. **Header shows "Choose a narrator" for incomplete narrators.** Cosmetically correct (no basics to display) but could be improved to show the narrator's `display_name` from the people cache.

3. **Narrator selector card for Christopher could show preferred name.** Currently shows "Christopher" (from `display_name`) which is correct, but the card subtitle shows the raw DOB string rather than a formatted date.
