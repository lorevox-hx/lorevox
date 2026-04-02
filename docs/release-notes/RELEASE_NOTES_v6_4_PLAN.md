# Lorevox v6.4 — Planning Document
**Status:** Pre-implementation plan
**Preceding version:** v6.3

---

## What Triggered This Version

Thirty-persona × 5-run testing plus a dedicated 5-run test of the Ellie/George couple scenario (personas 29 + 30) revealed 5 new bugs, all in the cognitive accessibility and couple-session areas. Additionally, a review of the permission card against the planned fully-local laptop deployment revealed it is too terse for elderly or vulnerable users.

---

## Bugs to Fix

### Bug D — No cognitive accessibility mode
**What goes wrong:** Lori uses standard pacing, standard question flow, and the `[SYSTEM: Acknowledge in 1–2 sentences, then ask next question]` instruction regardless of whether the person is confused, repeating themselves, or fatigued. For Peggy (Alzheimer's), Hank (vascular dementia), and Ruth (Alzheimer's), this creates a jarring, cold experience.

**Fix:**
1. Add an `accessibility` field to profile basics with values `standard` / `gentle`.
2. When `gentle` is set, Lori's system prompt adds:
   - "Use very short, simple sentences — one idea at a time."
   - "If the person says 'I don't remember' or trails off, respond: 'That's completely fine, let's keep going.' Never press for details."
   - "After 8 questions, suggest a short rest: 'You're doing wonderfully — would you like to take a short break?'"
   - "If the person repeats something they already said, gently acknowledge it and keep moving: 'Yes, you mentioned that — it sounds very important to you.'"
3. Add a "Gentle mode" toggle on the Profile tab (or permission card).

---

### Bug E — Uncertain DOB input breaks date field
**What goes wrong:** Someone who says "1947, I think? June? I'm not sure..." gets their entire uncertain string saved as `date_of_birth`. The age display shows NaN, context strip shows "No DOB set", memory triggers are dead.

**Fix:**
1. In `interview.js`, after the DOB question answer is processed, attempt to parse the answer.
2. If it's not a valid YYYY-MM-DD or parseable date, save the raw text to a new `estimated_dob_note` field in the profile instead, and show a gentle system bubble: "No problem — I've saved what you shared and we can confirm the date later."
3. Keep `date_of_birth` empty/null if unconfirmed.
4. Update `updateArchiveReadiness()` to show a yellow (not red) indicator when `estimated_dob_note` exists but `date_of_birth` doesn't.

---

### Bug F — Cognitive decline distress doesn't trigger safety system
**What goes wrong:** Statements like "My brain is just not what it was", "I hate that I can't remember my own children's names", "What's wrong with me" pass the safety scan without triggering. Lori moves on to the next question. These moments deserve warmth and acknowledgment.

**Fix:**
1. Add `cognitive_distress` category to `safety.py` scanner.
2. Trigger words/phrases: "my brain", "can't remember", "forget everything", "what's wrong with me", "stupid", "losing my mind", "embarrassing" — in contexts suggesting self-directed distress about memory.
3. Safety response for this category: no crisis resources needed. Instead, Lori's softened mode kicks in for 2–3 turns with the message: "I want you to know — what you're sharing is valuable exactly as it is. There's no test here."
4. The safety overlay for this category should show a warm message, not the full resources panel.

---

### Bug G — No support-person mode (mixed-speaker transcripts)
**What goes wrong:** When George and Ellie are both at the device, George's words are saved verbatim as Ellie's answers. The memoir draft contains third-person descriptions ("She went to Mount Saint Charles Academy") attributed to Ellie. Corrections appear as contradictions within a single answer.

**Fix:**
1. Add "A support person is helping me today" toggle to the permission card.
2. When toggled on, ask for the support person's name (e.g., "George").
3. Store `support_person_name` in the session.
4. Lori's system prompt adds:
   - "[Support person's name] is present and may speak to provide context or corrections. When [name] speaks, acknowledge them warmly and incorporate their contribution. Always confirm additions with the interviewee: 'George mentioned you were valedictorian — Ellie, would you like to say more about that in your own words?'"
   - "If [name] corrects a date or fact, respond: 'Thank you [name] — Ellie, does [date] sound right to you?' and use the confirmed value."
   - "Never include [name]'s words verbatim as Ellie's answers. Rephrase support-person contributions as prompts back to the interviewee."
5. Add a visual indicator in the UI showing "George is here to help" when support mode is active.

---

### Bug H — No session pause/resume
**What goes wrong:** If a session needs to stop mid-interview (Ellie tires, phone rings, George asks to pause), there is no graceful path. The only option is abandoning the tab. The session_id persists but in-progress state may not resume cleanly.

**Fix:**
1. Add a "Take a break 💛" button to the interview toolbar, visible at all times during an active interview session.
2. On click: save current `question_id` + `session_id` as the resume point, show a warm closing message in chat ("We've made wonderful progress today. We'll pick up right where we left off."), and transition the UI to a "session paused" state.
3. When the person returns and loads their profile, show "Resume interview" button that restores to the last active question.
4. Session pause state stored in `localStorage` keyed by `person_id`.

---

## Permission Card Rewrite

The current permission card is 4 lines. For a product used by elderly people, people with cognitive decline, and people testing locally without internet, it needs to be much more informative while remaining warm and readable.

### New content sections:
1. **"Your story stays on this device"** — explicit statement that everything runs locally, no cloud, no internet required. Video frames are never saved. Audio is processed locally and not transmitted.
2. **Camera — what it actually does:** "Lori watches for gentle signals — if you seem moved or need a moment, she slows down. No video is ever saved or transmitted. Only Lori's pacing adjusts."
3. **Microphone — what it actually does:** "Your voice is converted to text on this device. The audio itself is not stored — only the transcript of what you say."
4. **What IS saved:** "Your answers and memories are saved securely on this device in an interview archive. Nothing is uploaded or shared unless you choose to export it."
5. **Support person toggle:** "Is someone helping you today? → [Yes, enter their name] / [No, just me]"
6. **Accessibility toggle:** "Would you like Lori to use a gentler pace? → [Yes, gentle mode] / [Standard]"
7. **Settings note:** "You can change these settings any time from the Settings panel during the interview."

---

## Files to Change

| File | Change |
|------|--------|
| `ui/6.1.html` | Permission card rewrite; support-person name input; gentle-mode toggle; "Take a break" button; `estimated_dob_note` display; version bump to v6.4 |
| `ui/css/permissions.css` | Expand for new permission card layout |
| `ui/js/permissions.js` | `support_person_name`, `gentleMode` state; updated `confirmPermCard()` |
| `ui/js/app.js` | System prompt: gentle-mode rules; support-person rules; `estimated_dob_note` handling |
| `ui/js/interview.js` | DOB validation; "Take a break" function; pause/resume state |
| `server/code/api/safety.py` | `cognitive_distress` category |
| `docs/RELEASE_NOTES_v6_4.md` | New file (write at release) |

---

## Priority Order for Implementation

1. Permission card rewrite + support-person toggle (highest UX impact, affects every user)
2. Support-person mode system prompt rules (needed for Ellie/George)
3. Cognitive accessibility mode + gentle-mode system prompt
4. Session pause/resume ("Take a break" button)
5. DOB validation / `estimated_dob_note`
6. `cognitive_distress` safety category

---

## Not in v6.4 (Deferred)
- MediaPipe CDN → local vendor
- Multi-day session stitching (George + Ellie across multiple days)
- Auto-attribution of support-person contributions in memoir draft
- STT (speech-to-text) — mic toggle is present but full STT pipeline not yet implemented
