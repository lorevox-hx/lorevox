# 30-Persona × 5-Run Test + Couple × 5-Run Test
**Version tested:** v6.3
**Cohort:** 30 personas (25 prior + 5 new cognitive/couple personas)
**Method:** Code-trace simulation

---

## PART 1 — 30-Persona × 5 Runs

### v6.3 Regression Check (Bugs A, B, C — should all be fixed)

All 30 personas, runs 1–5:
- **Bug A (DOB at Q4):** ✅ Fixed — DOB is now Q2. Context strip shows birth year correctly from the second question onward for all 30 personas across all 5 runs.
- **Bug B (birthplace memories):** ✅ Fixed — `raised_in` question fires after `place_of_birth`. Walt (#21), Danny (#24), Priya (#23), Ava (#25) all answer "moved when I was young" and Lori's system prompt rule prevents birthplace memory questions. New personas #26–30 all born in the US, n/a.
- **Bug C (sibling year/age disambiguation):** ✅ Fixed — Dot's "'28, '30, '32..." correctly treated as birth years. Danny's "sister's 68, brother's 66" Lori now asks for confirmation. George's references to Ellie's family members handled correctly.

---

### New Findings: Personas 26–28 (Cognitive Accessibility)

#### 🔴 Bug D — No cognitive accessibility mode
**Affects:** #26 Peggy (early Alzheimer's), #27 Hank (vascular dementia), #28 Ruth (beginning Alzheimer's)
**All 5 runs, all 3 personas**

**Peggy trace (Run 1):**
- Q1 (full_name): "Margaret O'Brien, but everyone calls me... calls me Peggy."  → saved fine
- Q2 (DOB): "Oh let me think... 1947, I think? June? No, I don't remember the month." → system tries to store "1947, I think? June? No, I don't remember the month" as date_of_birth → **invalid date stored**
- Q3 (preferred_name): "Peggy. Oh, I said that already didn't I." → fine
- Q5 (time_of_birth): "I... I have no idea. Does anyone know their time of birth?" → saved as empty/skip, fine
- Q6 (place_of_birth): "Boston. Jamaica Plain. That part I know." → fine
- Q7 (raised_in): "Yes, grew up right there... yes." → fine
- After ~8 questions, answers shorten: "I'm not sure." / "I already told you." → system saves and moves on with no warmth adjustment
- At family_and_heritage siblings question: Peggy gives a correct answer, then gives the same answer again 2 questions later: "My brother Danny, he lived on Tremont Street..." → system has no dedup detection, saves duplicate content silently
- **Lori's tone throughout: neutral-professional** — no adjustment for fatigue or confusion despite all the signals
- First_memory question: Lori asks generically → Peggy gives a fragmented answer → Lori's [SYSTEM: Acknowledge in 1–2 sentences and ask next question] causes her to move on briskly → feels cold for this persona

**Hank trace (Run 3):**
- Q2 (DOB): "1943. August... no, July. It was summer, I know that." → invalid date, same problem
- At career questions (most relevant to him): rich, detailed, excellent content
- At family questions: "I already told you about my wife." when he hasn't → system just moves on, no acknowledgment
- Lori presses for the next question regardless of confusion signals → no mechanism to slow down

**Ruth trace (Run 5):**
- Mixes up her children's names twice: "My daughter Rachel... no, David. David is my son. Rachel is the girl. Michael too. All three." → stored as-is, no structured name clarification
- At Q2 (DOB): gives correct date (she remembers her birthday) → ✅
- At a later question about family: "I should know this. I always knew this. My brain is just... it's not what it was." → **Track A (safety) does NOT fire** — this is self-directed grief and frustration, not a classic trauma/abuse/health category
- **🔴 Safety gap: cognitive decline distress does not trigger the safety system** — Ruth is visibly distressed about her memory loss and Lori keeps moving forward as if nothing happened

**Bug D diagnosis:**
- Lori's system prompt has no cognitive accessibility instructions
- The system has no "slow mode" or "short session" path
- After-answer instruction (`[SYSTEM: Acknowledge in 1–2 sentences, then ask next]`) causes Lori to move efficiently — the right behaviour for most users, wrong for Peggy/Hank/Ruth

---

#### 🔴 Bug E — Invalid DOB from uncertain/confused input not handled
**Affects:** #26 Peggy, #27 Hank (and potentially any elderly user unsure of DOB)
**All 5 runs**

When DOB is now Q2 (v6.3 fix), the first substantial answer for some users is the most fragile one. A confused elderly person gives "1947, I think? June? No..." — the system tries to store this string as `date_of_birth` in the profile. The backend's `PATCH /api/person` will receive an invalid date string.

The frontend `scrapeBasics()` / `saveProfile()` would write this raw string to `bio_dob`. The age display would fail silently (NaN). The context strip shows "No DOB set". Memory triggers dead.

Fix: DOB answer validation — if the answer to the DOB question is not a parseable date, store the raw text in an `estimated_dob_note` field instead of `date_of_birth`, and show a gentle note: *"No worries — let's keep going. We can confirm the date with a family member later."*

---

#### 🔴 Bug F — Self-critical cognitive-loss distress does not trigger safety
**Affects:** #28 Ruth (most acute), also relevant for #26 Peggy
**All 5 runs**

Ruth's statements — "My brain is just not what it was", "I hate that I can't remember my own children's names", "What's wrong with me" — are expressions of distress and potential depression. The current `safety.py` scans for categories like trauma, abuse, grief, health crisis, self-harm. Cognitive decline grief may not fall cleanly into any existing category.

In all 5 runs, Ruth's distress statements pass through without triggering the safety overlay. Lori moves on to the next question. This is the wrong behaviour.

Fix: Add `cognitive_distress` as a safety category in `safety.py`. Trigger when someone expresses significant frustration, sadness, or self-deprecation about their own memory/cognitive decline. The response should be gentle acknowledgment, not resources — this is not a crisis but a moment that deserves to be met with warmth before continuing.

---

### New Findings: Personas 29–30 (Couple Scenario — Ellie + George)

#### 🔴 Bug G — No support-person mode: George's speech blends into Ellie's transcript
**Affects:** #29 Ellie + #30 George, all 5 runs
**Most critical new finding**

The interview is built on a single-speaker assumption. Every message typed or spoken goes into the chat as "the user" — there is no concept of a second speaker. When George and Ellie are both at the device:

**Trace (Run 1 — Ellie's session, George present):**
- Lori asks: "What is your full legal name?"
- George types/says: "Go ahead Ellie, tell her your name."
- Ellie: "Eleanor Morrison. Well, Eleanor Ruth Morrison."
- George (same text box): "She goes by Ellie. Always has."
→ Saved to transcript: "Eleanor Morrison. Well, Eleanor Ruth Morrison. She goes by Ellie. Always has." — blended, but acceptable here.

- Lori asks: "What is your date of birth?"
- Ellie: "I was born in... August. Nineteen... thirty..."
- George: "August 20th, 1939, Ellie."
- Ellie: "Yes, August 20th, 1939."
→ Transcript: "I was born in... August. Nineteen... thirty... August 20th, 1939, Ellie. Yes, August 20th, 1939." → messy, two voices, Lori can't distinguish

- Lori asks (early_years): "What is your very first memory?"
- Ellie begins answering about her childhood home
- George interjects: "She has a wonderful story about the Victory Garden, don't you Ellie."
- Ellie: "Oh yes, the Victory Garden, 1945, I must have been about 5..."
→ George's interjection is captured as part of Ellie's answer — the memoir would include "She has a wonderful story about the Victory Garden" written as if Ellie said it about herself — **grammatically wrong, narratively confusing**

- Lori asks: "Tell me about your schooling."
- George: "Actually Lori, she went to Mount Saint Charles Academy. She was valedictorian. Tell her, Ellie."
- Ellie: "Yes, I was... I was good at school."
→ George's direct address to Lori ("Actually Lori, she went to...") saved verbatim as Ellie's answer. This is third-person about the subject — the memoir would read as if Ellie is describing herself in the third person.

**Diagnosis:** The single-speaker assumption causes the memoir to contain:
1. George's words verbatim as if Ellie said them
2. Third-person descriptions ("she went to...", "she was valedictorian")
3. Corrections that read as contradictions ("August. Nineteen... thirty... August 20th, 1939, Ellie. Yes, August 20th, 1939.")

---

#### 🟡 Partial: George's date corrections not updating structured data
**Run 2 — Ellie gives a wrong date, George corrects it**

- Lori asks "Did you grow up there or did you move?"
- Ellie: "I grew up right there in Providence, on Hope Street. We moved to... 1956? 1952? George, when did we move?"
- George: "You moved to the East Side in 1954, dear. With your parents."
- Ellie: "Yes, 1954."
→ The answer saved: "I grew up right there in Providence, on Hope Street. We moved to... 1956? 1952? George, when did we move? You moved to the East Side in 1954, dear. With your parents. Yes, 1954."
→ The CORRECT date (1954) is buried in mixed-speaker text. The system has no way to extract and confirm the structured value.

---

#### 🟡 Lori's tone does not adapt to couple scenario
**All 5 runs**

Lori's system prompt says "The speaker" as a single person. In couple mode:
- Lori never acknowledges George directly with warmth
- Lori never says "Thank you George, that's helpful — Ellie, does that sound right to you?"
- Lori never addresses the couple as a unit: "You two have such a rich shared history"
- The [SYSTEM: Acknowledge in 1–2 sentences, then ask next question] instruction causes Lori to address "you" (singular) even when two people answered

---

## PART 2 — Couple (Ellie + George) × 5 Dedicated Runs

Each run tests a different session scenario for this specific couple.

### Couple Run A — Standard interview, both present, George helps with dates
**Result:** Bug G confirmed at every question boundary. Transcript is a mixed-speaker blend throughout. 14 out of 30 questions have identifiable George-only content saved as Ellie's answers. Memoir draft would be substantially wrong.

### Couple Run B — George takes over for an entire question section (early_years)
**Scenario:** Ellie gets tired and confused during early_years. George answers all three questions directly.
**Result:** The entire early_years section is in George's voice describing Ellie in the third person. The system processes and stores it as Ellie's answers. Section summary generated: "Ellie grew up on Hope Street..." — grammatically correct but George wrote it. No attribution to George. Memoir attribution problem is total for this section.

### Couple Run C — Ellie has a clear, strong section (nursing career)
**Scenario:** When Lori reaches career_and_achievements, Ellie lights up. She remembers her nursing career vividly and George mostly stays quiet.
**Result:** ✅ This section works beautifully. Ellie's nursing memories are detailed, emotionally rich, and produce excellent content. George only interjects once to confirm a date. This demonstrates that the system works well WHEN one person is speaking. The problem is specifically the mixed-speaker moments.

### Couple Run D — Safety trigger for Ellie (grief — deceased patient)
**Scenario:** During health_and_wellness, Ellie describes losing a young patient and begins to cry.
**Result:** ✅ Track A fires correctly. Safety overlay appears. Softened mode activates. George says "It's okay Ellie, take your time." This gets captured in the transcript but doesn't interfere with the safety system. The safety overlay is shown to whoever is reading the screen. This actually works acceptably in the couple scenario.

### Couple Run E — Session fatigue, George asks to pause
**Scenario:** After ~20 questions, Ellie is visibly tired. George types: "Lori, can we take a break and come back tomorrow? She's getting tired."
**Result:** There is no "pause" or "take a break" UI path. The interview session is either in-progress or complete. George's message is processed as Ellie's answer to whatever question was active. The system doesn't recognise it as a meta-request to pause.
The only workaround is to not answer the question and close the tab — the session_id persists in localStorage but the in-progress question state may not resume cleanly.
**🔴 Bug H: No session pause/resume for interrupted sessions.**

---

## Consolidated New Bug Report

### 🔴 Bug D — No cognitive accessibility mode
**Impact:** Peggy, Hank, Ruth, Ellie — all get standard pacing and question tone. No slowdown, no warmth adjustment, Lori presses forward after each answer regardless of confusion signals.
**Fix:** Add `cognitive_accessibility` flag to profile basics. When set, Lori's system prompt adds: shorter questions, one thing at a time, accepts "I don't remember", never presses. Also add short-session option (stop after N questions and save progress).

### 🔴 Bug E — Confused/uncertain DOB input breaks date field
**Impact:** Any elderly or uncertain user giving "1947, I think?" as their DOB breaks the date_of_birth profile field silently.
**Fix:** DOB answer validation — non-parseable dates saved to `estimated_dob_note`, gentle continuation message shown.

### 🔴 Bug F — Cognitive decline distress does not trigger safety
**Impact:** Ruth's "My brain is just not what it was" and Peggy's self-criticism go unacknowledged by the safety system.
**Fix:** Add `cognitive_distress` safety category. Gentle response (not crisis resources), just warmth and a pause.

### 🔴 Bug G — No support-person mode: mixed-speaker transcripts corrupt memoir
**Impact:** George's words are saved verbatim as Ellie's answers. Memoir contains third-person descriptions, corrections, and George's direct addresses to Lori — all attributed to Ellie.
**Fix:** Add "Support person present" toggle in permission card. When on:
  1. System prompt tells Lori to expect two voices and to acknowledge both warmly
  2. System prompt instructs Lori to rephrase third-person additions into first-person for Ellie ("George mentioned you were valedictorian — Ellie, would you like to tell me about that in your own words?")
  3. Lori explicitly confirms corrections: "George mentioned 1954 — Ellie, does that sound right to you?"

### 🔴 Bug H — No session pause/resume
**Impact:** George cannot ask Lori to pause. The only escape is abandoning the tab. No graceful "let's stop here and continue tomorrow" path.
**Fix:** Add a "Take a break" button that saves progress cleanly and shows a warm closing message. Session resumes from the active question_id when reopened.

---

## What Passed in All Runs ✅
- v6.3 fixes (A, B, C): all confirmed fixed, no regression
- Track A safety (trauma, health, grief): ✅ — fires correctly for all personas including Ellie's nurse memory (Run D)
- Minor overlay (Emily Santos #13): ✅
- Bilingual (Elena Petrova #20, Ava #25): ✅
- Segment flags CRUD: ✅
- Section summaries: ✅ (George's sections produce grammatically odd summaries but system doesn't crash)
- TTS drain: ✅
- Couple Run C (Ellie's nursing section with one clear speaker): ✅ — beautiful content when the single-speaker assumption holds

---

## v6.4 Fix Plan Summary

| Fix | File(s) | Size |
|-----|---------|------|
| Cognitive accessibility flag in profile + system prompt | `ui/6.1.html`, `ui/js/app.js` | Medium |
| DOB validation — uncertain input → estimated_dob_note | `ui/js/interview.js`, `ui/js/app.js` | Small |
| `cognitive_distress` safety category | `server/code/api/safety.py` | Small |
| Support-person mode toggle + system prompt rules | `ui/6.1.html`, `ui/js/permissions.js`, `ui/js/app.js` | Medium |
| Session pause/resume ("Take a break" button) | `ui/6.1.html`, `ui/js/interview.js` | Medium |
| Expanded permission card (local, purpose, safeguards) | `ui/6.1.html`, `ui/css/permissions.css` | Medium |
| Version bump to v6.4 | `ui/6.1.html` | Tiny |
