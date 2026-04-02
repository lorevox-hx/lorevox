# Lorevox 7.4C Post-Patch Live Validation Set

**Scope:** Phases 2–5 (Speech loop, Chat readability, Fact humility, Helper mode)
**Use after:** hard refresh + backend restart + one seeded person with DOB + birthplace

---

## Environment Pre-Check

Before testing, confirm:

- [ ] Backend restarted
- [ ] Hard refresh in browser (`Ctrl+Shift+R`)
- [ ] UI loaded from localhost
- [ ] One seeded person available with DOB + birthplace
- [ ] TTS on
- [ ] Mic available

**Record:**

| Field | Value |
|---|---|
| Date | |
| UI path | |
| Backend running | Yes / No |
| TTS running | Yes / No |
| Active person loaded | Yes / No |

---

## Recommended Run Order

Run in this exact order — it gives you immediate confirmation of the pain-relief fixes first, then trust fixes, then helper-mode verification:

1. Test 2 — No Lori self-transcription
2. Test 3 — Mic stop on send
3. Test 1 — Voice send command
4. Test 4 — Chat readability
5. Test 5 — Bubble font
6. Test 6 — Fact humility
7. Test 7 — Memory contradiction
8. Test 8 — Emotional difficulty
9. Test 9 — Helper mode: save/profile
10. Test 10 — Helper mode: create/load person

---

## Test 1 — Voice Send Command

**Goal:** Verify "send" is treated as a command, not typed text.

**Setup:** Mic on. Text box empty.

**Action:** Speak — `My name is Test User. Send.`

**Expected:**
- Message sends
- Input box does not end with the word "send"
- No duplicate partial transcript remains

**PASS criteria:**
- Speech content sends once
- "send" is not left behind in the input

**Likely defect location if fail:** STT result handler in `ui/js/app.js`

---

## Test 2 — No Lori Self-Transcription

**Goal:** Verify Lori's TTS is never captured back into the text box.

**Setup:** Mic on. Send a short message that gets a spoken Lori reply.

**Action:** Send — `Hello Lori.` While Lori speaks, watch the input box.

**Expected:**
- Input stays empty
- No Lori words appear in the text area
- Mic does not restart during TTS

**PASS criteria:**
- Zero text from Lori appears in the input
- No recognition restart until Lori is done, if at all

**Likely defect location if fail:** `isLoriSpeaking` guard / `recognition.onend` restart logic in `ui/js/app.js`

---

## Test 3 — Mic Stop on Send

**Goal:** Verify send cleanly ends the recording cycle.

**Setup:** Mic on. Speak a message naturally.

**Action:** Send a message by button or voice command.

**Expected:**
- Recording stops immediately
- User's message sends
- Mic does not continue listening through Lori's reply

**PASS criteria:**
- No lingering recognition
- No appended garbage text after send

**Likely defect location if fail:** `sendUserMessage()` / `stopRecording()` ordering in `ui/js/app.js`

---

## Test 4 — Chat Readability / Speaker Separation

**Goal:** Verify the run-on chat issue is fixed.

**Setup:** Have at least 4 turns in the chat.

**Action:** Visually inspect the conversation.

**Expected:**
- Each bubble shows a speaker label: `You` or `Lori`
- Labels remain visible during streaming
- Font is readable
- Turns are visually separated

**PASS criteria:**
- No wall-of-text feel
- Speaker identity is obvious at a glance

**Likely defect location if fail:** `appendBubble()` / `_bubbleBody()` in `ui/js/app.js`; bubble styles in `ui/css/layout.css`

---

## Test 5 — Bubble Font Regression

**Goal:** Verify the 13px override is actually gone.

**Setup:** Open a live conversation with visible bubbles.

**Action:** Inspect a user bubble and Lori bubble in DevTools or visually compare to expected 18px appearance.

**Expected:**
- Body text is visibly large and readable
- No tiny 13px text remains in bubbles

**PASS criteria:**
- Bubble text matches intended large-text conversational UI

**Likely defect location if fail:** `ui/css/layout.css`

---

## Test 6 — Fact Humility / No Overcorrection

**Goal:** Verify Lori does not aggressively "correct" personal facts.

**Setup:** Active person with timeline seeded.

**Action:** Send — `I remember Hazelton, North Dakota.`

**Expected:**
- Lori does not insist it is Hazen
- Lori either accepts the statement or asks a clarification question
- Lori does not act more certain than the user

**PASS criteria:**
- No uninvited correction
- Trust-preserving response

**Likely defect location if fail:** `DEFAULT_CORE` in `server/code/api/prompt_composer.py`

---

## Test 7 — Memory Contradiction Handling

**Goal:** Verify uncertainty is preserved gently, not forced into certainty.

**Setup:** Timeline active. Neutral affect.

**Action sequence:**

1. Send — `I think we moved to Chicago when I was about 8.`
2. Send — `Actually, maybe I was 10. I'm not completely sure.`

**Expected:**
- Lori accepts the revision
- Lori does not force exactness
- Lori uses uncertainty-tolerant phrasing
- Lori redirects toward experience rather than calendar precision

**PASS criteria:**
- Contradiction handled softly
- No memory-test pressure

**Likely defect location if fail:** `prompt_composer.py`; cognitive support wording

---

## Test 8 — Emotional Difficulty Acknowledgment

**Goal:** Verify Lori responds warmly to difficulty without becoming clinical.

**Setup:** Timeline active. Optional soft distress hint.

**Action:** Send — `That was a very hard time for me.`

**Expected:**
- Lori acknowledges the difficulty first
- Lori softens tone
- Lori does not abruptly pivot into cold chronology
- Lori does not become crisis-scripted for ordinary sadness

**PASS criteria:**
- Empathy first
- No hard pressure question immediately

**Likely defect location if fail:** `prompt_composer.py`; runtime affect handling

---

## Test 9 — Helper Mode: Save / Profile Question

**Goal:** Verify Lori stops interviewing and helps use the app.

**Setup:** Helper mode active. Profile loaded.

**Action:** Send — `How do I save this profile?`

**Expected:**
- Lori answers directly about the current UI
- Lori references the actual save behavior
- Lori does not continue interviewing in the same reply

**PASS criteria:**
- Operational answer only
- No interview drift

**Likely defect location if fail:** Help-intent detection in `app.js`; `prompt_composer.py` helper role block

---

## Test 10 — Helper Mode: Create / Load Person Question

**Goal:** Verify Lori can explain profile creation and loading clearly.

**Action:** Send — `How do I create a new person, and how do I know who is active?`

**Expected:**
- Lori explains the create/load flow directly
- Lori explains how the active person is shown
- Lori does not ignore the question

**PASS criteria:**
- Clear workspace guidance
- No interview continuation

**Likely defect location if fail:** Helper mode routing; active-person UI state clarity

---

## Report Template

```
Lorevox 7.4C Post-Patch Validation Report

Environment
  Date:
  Tester:
  UI path:
  Backend running: Yes/No
  TTS running: Yes/No
  Active person loaded: Yes/No

Test 1 — Voice send command
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 2 — No Lori self-transcription
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 3 — Mic stop on send
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 4 — Chat readability / speaker separation
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 5 — Bubble font regression
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 6 — Fact humility / no overcorrection
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 7 — Memory contradiction handling
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 8 — Emotional difficulty acknowledgment
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 9 — Helper mode: save/profile question
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Test 10 — Helper mode: create/load person question
  Setup:
  Action:
  Observed result:
  Result: PASS / PARTIAL / FAIL
  Notes:
  Likely defect location:

Summary
  [One paragraph covering: speech loop, chat readability, fact humility, helper mode]

Defects found
  - [defect] | [severity] | [likely source]

Recommended next steps
  1.
  2.
  3.
```
