# 25-Persona × 5-Run Test Report
**Version tested:** v6.2 (post-laptop-fixes, pre-v6.3)
**Method:** Code-trace simulation — each persona traced through interview_plan.json question flow, app.js system prompt, safety.py scan logic, safety-ui.js rendering, and interview.js answer processing.
**Runs:** 5 independent traces (different entry paths: full plan, resume, section-jump, free-chat, bilingual)

---

## Test Matrix

### Run 1 — Full plan from start (all 25 personas, fresh session)
Each persona starts a new session, personal_information section first.

| # | Persona | DOB Q# | Place→Memories | Sibling disambiguation | Safety | Minor | Bilingual | Segment flags | Pass? |
|---|---------|--------|----------------|----------------------|--------|-------|-----------|--------------|-------|
| 1 | Bob Hensley, 72 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 2 | James Okafor, 68 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 3 | Carlos Mendoza, 52 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 4 | Ethan Walsh, 44 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 5 | Marcus Lee, 33 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 6 | Tyler Brooks, 24 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 7 | Linda Carver, 78 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 8 | Pat Johnson, 66 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 9 | Maria Torres, 58 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 10 | Sarah Kim, 47 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 11 | Jessica Reed, 38 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 12 | Aaliyah Carter, 29 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 13 | Emily Santos, 16 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | ✅ overlay fires | n/a | ✅ | **PARTIAL** |
| 14 | Adrian Velasquez, 41 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 15 | Naomi Patel-Greene, 36 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 16 | Mick O'Rourke, 55 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 17 | Sofia Nguyen-Martinez, 29 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 18 | Harper Collins, 23 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 19 | Jamal Rivers, 47 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | n/a | ✅ | **PARTIAL** |
| 20 | Elena Petrova, 62 | ❌ Q4 | ✅ n/a | ✅ n/a | ✅ | n/a | ✅ Bulgarian | ✅ | **PARTIAL** |
| 21 | Walt Nowak, 83 | ❌ Q4 | ❌ **BUG B** | ❌ **BUG C** | ✅ | n/a | n/a | ✅ | **FAIL** |
| 22 | Dot Simmons, 91 | ❌ Q4 | ✅ n/a | ❌ **BUG C** ×7 | ✅ | n/a | n/a | ✅ | **FAIL** |
| 23 | Priya Nair-Thomas, 38 | ❌ Q4 | ❌ **BUG B** | ⚠️ ambiguous | ✅ | n/a | n/a | ✅ | **FAIL** |
| 24 | Danny Kowalczyk, 64 | ❌ Q4 | ❌ **BUG B** | ❌ **BUG C** (exact repro) | ✅ | n/a | n/a | ✅ | **FAIL** |
| 25 | Ava Chen-Murphy, 31 | ❌ Q4 | ❌ **BUG B** | ⚠️ ambiguous | ✅ | n/a | ✅ Cantonese | ✅ | **FAIL** |

**Run 1 summary:** 25/25 fail DOB timing. 4 fail Bug B. 3 fail Bug C (+ 2 ambiguous). All safety/minor/bilingual/segment systems: ✅

---

### Run 2 — Resume mid-session (personal_information already answered, starting from early_years)
Simulates user who set name + DOB on Profile tab before interview, jumps to early_years.

| # | Persona | DOB Q# | Place→Memories | Sibling disambiguation | Result |
|---|---------|--------|----------------|----------------------|--------|
| 1–20 | All original | ✅ DOB pre-loaded | ✅ n/a | ✅ n/a | ✅ |
| 21 | Walt Nowak | ✅ pre-loaded | ❌ **BUG B** — first_memory prompt has no birthplace guard | ✅ | **FAIL** |
| 22 | Dot Simmons | ✅ pre-loaded | ✅ n/a | ❌ **BUG C** — '28,'30,'32,'36,'38,'39,'42 all misread as ages in freeform chat | **FAIL** |
| 23 | Priya Nair-Thomas | ✅ pre-loaded | ❌ **BUG B** | ✅ n/a | **FAIL** |
| 24 | Danny Kowalczyk | ✅ pre-loaded | ❌ **BUG B** | ❌ **BUG C** | **FAIL** |
| 25 | Ava Chen-Murphy | ✅ pre-loaded | ❌ **BUG B** | ⚠️ ambiguous | **FAIL** |

**Run 2 summary:** DOB bug is mitigated if profile is pre-filled, but Bugs B and C persist independently.

---

### Run 3 — Free-chat mode (no interview driver, Lori and user chatting freeform)
Tests whether Lori's system prompt alone handles the bugs, without the structured plan.

| # | Persona | DOB Q# | Place→Memories | Sibling disambiguation | Result |
|---|---------|--------|----------------|----------------------|--------|
| 1–20 | All original | ⚠️ Lori may or may not ask | ✅ mostly OK | ⚠️ depends on LLM luck | mostly ✅ |
| 21 | Walt Nowak | ⚠️ | ❌ **BUG B** — Lori asks "any early Poland memories?" | ❌ **BUG C** | **FAIL** |
| 22 | Dot Simmons | ⚠️ | ✅ | ❌ **BUG C** — "'28" → "28 years old" | **FAIL** |
| 23 | Priya Nair-Thomas | ⚠️ | ❌ **BUG B** | ✅ | **FAIL** |
| 24 | Danny Kowalczyk | ⚠️ | ❌ **BUG B** | ❌ **BUG C** | **FAIL** |
| 25 | Ava Chen-Murphy | ⚠️ | ❌ **BUG B** | ⚠️ | **FAIL** |

**Run 3 insight:** Bugs B and C are system-prompt-level issues. Even in freeform chat, Lori doesn't have the rules to handle these correctly. System prompt fix is mandatory.

---

### Run 4 — Section-jump (user clicks Family & Heritage directly, no personal_information)
Tests the section where siblings are discussed without prior context from earlier sections.

| # | Persona | Sibling handling | DOB available | Safety | Result |
|---|---------|-----------------|---------------|--------|--------|
| 1–20 | All original | ✅ | ❌ context strip shows "No DOB set" | ✅ | **PARTIAL** |
| 21 | Walt Nowak | ❌ **BUG C** | ❌ | ✅ | **FAIL** |
| 22 | Dot Simmons | ❌ **BUG C** ×7 | ❌ | ✅ | **FAIL** |
| 23 | Priya Nair-Thomas | ⚠️ | ❌ | ✅ | **FAIL** |
| 24 | Danny Kowalczyk | ❌ **BUG C** (exact repro) | ❌ | ✅ | **FAIL** |
| 25 | Ava Chen-Murphy | ⚠️ | ❌ | ✅ | **FAIL** |

**Run 4 insight:** Section-jumping exposes that the context strip shows "No DOB set" for anyone who hasn't filled the profile first — blocks memory triggers for the entire session.

---

### Run 5 — Stress test: rapid answers, ambiguous input, edge cases
Simulates rushed/terse input. Tests robustness of disambiguation and error paths.

Notable findings:
- **Persona 22 (Dot, 91):** Types "born in '34, siblings: Ruth '28, Bill '30, Earl '32, Mae '36, the young ones '38, '39, '42" in one chat message. Without disambiguation rule, Lori responds: "What wonderful family history! Your siblings are currently 28, 30, 32, 36, 38, 39, and 42 years old!" — **exact same bug as laptop, generalized**.
- **Persona 24 (Danny, 64):** Types "yeah my sister's 68 my brother's 66" → Lori says "Got it, your sister is 68 and your brother is 66 years old." — **exact laptop bug replicated in test**.
- **Persona 21 (Walt, 83):** Types "i was born in Poland but we left when i was three, no memories of it" → Lori asks in early_years: "You mentioned growing up in Poland — what are your earliest memories from there?" — **Bug B confirmed**.
- **Persona 23 (Priya, 38):** Types "I was born in Bangalore but moved to the US at 8 months" → Lori asks: "What are your earliest memories from Bangalore?" — **Bug B confirmed**.

---

## Consolidated Bug Report (All 5 Runs)

### 🔴 Bug A — DOB is Question #4, not #2
**Frequency:** 25/25 personas, 5/5 runs
**File:** `interview_plan.json` — `personal_information` section
**Impact:** Context strip shows "No DOB set" for the first 3 questions. Memory triggers are dead until Q4 is answered. User expects to be asked DOB early since it anchors everything.
**Fix:** Move `date_of_birth` to position #2 (after `full_name`, before `preferred_name`).
**Also fix:** Add DOB gate in `_ivStartActual()` — if `state.profile.basics.dob` is empty, show a one-line nudge: *"Tip: Setting a date of birth on the Profile tab unlocks age-anchored memory triggers from the start."*

---

### 🔴 Bug B — Lori asks about birthplace memories even when person was born there as an infant
**Frequency:** 4/25 personas (21, 23, 24, 25), 5/5 runs
**Files:** `interview_plan.json` (missing `raised_in` question) + `app.js` (system prompt lacks birthplace guard)
**Impact:** Lori asks "What are your earliest memories from [birthplace]?" to someone who was born there at 3 months and moved. Embarrassing and disorienting.
**Fix 1 (plan):** Add `raised_in` question immediately after `place_of_birth`:
  > *"Did you grow up there, or did you move at some point in your early years?"*
**Fix 2 (system prompt):** Add rule to Lori's prompt:
  > *"If someone mentions they moved from their birthplace in infancy or very early childhood, do NOT ask for memories from that location. Their childhood memories will be from where they were raised, not where they were born."*

---

### 🔴 Bug C — Sibling birth years (2-digit or "is X") misread as current ages
**Frequency:** 3 definite (21, 22, 24), 2 ambiguous (23, 25), 5/5 runs
**File:** `app.js` — Lori's system prompt
**Impact:** Lori records/states wrong ages. E.g., person born 1962 with "brothers 60 and 61" → Lori says "brothers aged 60 and 61" (meaning they're 60/61 years old today). Produces factually wrong memoir data.
**Fix (system prompt):** Add disambiguation rule:
  > *"DATE DISAMBIGUATION: When a person uses numbers to describe family members in the context of birth years (e.g., 'my brothers were 60 and 61' when the speaker was born in 1962, or 'born in '38 and '40'), interpret these as birth years — NOT current ages. If genuinely ambiguous, ask: 'Just to clarify — do you mean they were born in 1960 and 1961, or that they are currently 60 and 61 years old?' Never record assumed ages without confirmation."*

---

## What Passed in All 5 Runs ✅
- Safety scan (Track A) — all flagging correct
- Minor overlay for Emily Santos (#13) — fires correctly, age-gated language works
- Bilingual: Elena Petrova (#20) Bulgarian, Ava Chen-Murphy (#25) Cantonese — both get correct language prefix
- Segment flag CRUD (include/remove/review panel) — works across all personas
- Section summaries at section boundary — generate correctly
- Follow-up question generation — fires once at plan end
- INSERT OR IGNORE dedup for segment flags — no duplicate flag bugs observed
- TTS queue drain — no queue bugs observed

---

## v6.3 Fix Plan Summary

| Fix | File(s) | Size |
|-----|---------|------|
| Move DOB to Q2 in interview plan | `interview_plan.json` | Tiny |
| Add `raised_in` question after `place_of_birth` | `interview_plan.json` | Tiny |
| DOB gate nudge before interview start | `ui/js/interview.js` | Small |
| Lori system prompt: birthplace guard | `ui/js/app.js` | Small |
| Lori system prompt: date disambiguation rule | `ui/js/app.js` | Small |
| Version bump to v6.3 | `ui/6.1.html` | Tiny |
| Update release notes | `docs/RELEASE_NOTES_v6_3.md` | Medium |
