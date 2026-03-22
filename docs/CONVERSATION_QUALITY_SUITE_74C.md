# Lorevox 7.4C — Conversation Quality Suite

**Date:**
**Tester:**
**UI path:** http://localhost:8080/ui/lori7.4c.html
**Backend running:** Yes / No
**TTS running:** Yes / No
**Active person:**
**Identity complete before test:** Yes / No

---

## Purpose

This suite moves beyond functional correctness into *interaction correctness* — whether Lorevox feels natural, not just whether it runs. These tests are the boundary between engineering correctness and real conversation quality.

---

## CQ1 — Gentle identity collection

**Goal:** Identity questions feel natural, not mechanical.

### Setup
Fresh session with no saved person (clear localStorage).

### Action
Start Lorevox and answer naturally:
- name
- DOB (in any natural phrasing)
- birthplace

### Expected
- Lori asks one identity question at a time
- No stacked questions
- Tone feels calm and welcoming
- Once complete, she transitions naturally into story mode without announcing it

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ2 — Emotion during identity mode

**Goal:** Lori does not abruptly break emotional continuity while collecting identity.

### Setup
Fresh session, identity incomplete (or clear storage and reload).

### Action
Say:
> That was a very hard time for me.

### Expected
- Lori acknowledges the difficulty first
- Does not immediately switch to cold DOB collection
- If she returns to identity, she does so gently with one short question
- No "Before we get into that, could I get your date of birth?" pattern

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ3 — Memory revision during identity mode

**Goal:** Lori respects self-revision before identity is complete.

### Setup
Fresh session, identity incomplete.

### Action
Say:
> I think we moved when I was about 8.

Then:
> Actually, maybe I was 10. I'm not completely sure.

### Expected
- Lori accepts the revision warmly
- Does not demand certainty or express surprise
- Does not abruptly pivot to identity collection without acknowledging the revision
- No "gotcha" tone

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ4 — Post-identity emotional continuity

**Goal:** Once identity is complete, Lori stays with meaning and emotion — no regression.

### Setup
Identity complete (profile has name + DOB + birthplace).

### Action
Say:
> That was a very hard time for me.

### Expected
- Lori responds with empathy
- Stays with the emotional thread for at least one full turn
- Does NOT fall back into identity or setup questions
- No immediate pivot to chronological collection

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ5 — Free-form memory anchoring

**Goal:** Lori can work with a nonlinear story and extract anchors without overstructuring.

### Setup
Identity complete.

### Action
Say:
> I was born in Williston, but what I really remember is school in Bismarck and later Austin. My father moved around a lot, and winters stand out more than years for me.

### Expected
- Lori identifies the major anchors (places, school, family, era feel)
- Asks ONE clarifying question — does not interrogate or overwhelm
- Does not over-structure too early ("now let me note each of those locations...")
- The response feels like a conversation, not a data intake

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ6 — Helper mode transition quality

**Goal:** Lori stops interviewing and helps cleanly, without mixing tones.

### Setup
Identity complete, interview active.

### Action
Say:
> How do I save this profile?

### Expected
- Lori answers directly (2–4 sentences, specific to UI)
- No interview question mixed into the answer
- She offers to return to the interview naturally
- Role resets to interviewer after one exchange

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ7 — Fact humility trust test

**Goal:** Lori protects user trust — never corrects unprompted.

### Setup
Identity complete.

### Action
Say:
> I remember Hazelton, North Dakota. That's where we spent summers.

### Expected
- Lori accepts "Hazelton" as stated
- Does not correct to "Hazen" or any alternative
- If she asks anything, it is a gentle clarifying question ("What do you remember about being there?")
- User remains the authority on their own memory

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ8 — One-thought-per-turn rule

**Goal:** Lori's turns remain calm and manageable — no stacking.

### Setup
Any normal session.

### Action
Say:
> Can you help me understand how this works and also ask me about my childhood?

### Expected
- Lori prioritizes one main thing (either help or interview, not both at once)
- Does not stack multiple instructions or questions
- Response feels guided, not overwhelming
- Under 5 sentences

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ9 — Return-to-story smoothness

**Goal:** Lori resumes narrative work naturally after a helper exchange.

### Setup
Identity complete, interview active.

### Action
1. Say: *How do I save this memory?*
2. After Lori answers, say: *I remember my mother talking about the cold winters.*

### Expected
- Lori returns to story mode cleanly after the help exchange
- No stale helper tone ("As I mentioned about saving...")
- No repeated setup logic
- Response treats the memory statement as the natural continuation it is

### Result
PASS / PARTIAL / FAIL

### Notes

---

## CQ10 — Older-user calmness test

**Goal:** The overall interaction feels calm, readable, and non-demanding across an extended session.

### Setup
10-turn live session. Identity complete.

### Observe
- Readability of Lori's bubbles
- Pacing of question + response rhythm
- Turn clarity — can the user track where they are?
- Emotional continuity — does Lori remember the emotional weight of earlier turns?
- Sense of being guided instead of processed

### Expected
- Conversation feels human
- User does not feel rushed or tested
- UI supports the exchange instead of fighting it
- Font, spacing, and label clarity support easy reading

### Result
PASS / PARTIAL / FAIL

### Notes

---

## Summary

| Area | Result |
|---|---|
| Identity mode quality (CQ1–3) | |
| Post-identity emotional continuity (CQ4) | |
| Free-form memory anchoring (CQ5) | |
| Helper mode quality (CQ6, CQ9) | |
| Fact humility (CQ7) | |
| Turn discipline / one thought (CQ8) | |
| Older-user calmness (CQ10) | |

---

## Top defects found
1.
2.
3.

## Recommended next changes
1.
2.
3.
