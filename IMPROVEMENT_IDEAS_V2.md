# Lorevox — Improvement Ideas (v2)

Grounded in simulated sessions with Bob (78), David (52), Peggy (71), Aisha (38), and Jordan (16).

---

## 1. Age-Aware Interview Routing  🔴 Critical

The single biggest problem. The interview plan was built for someone in their 70s looking back on a completed life. When Jordan (16) hits the marriage/career/later-years sections, more than half the questions are inapplicable. When Aisha (38) hits the marriage section she's a single mom with no spouse story.

**Fix:** On session start, capture the subject's age and use it to:
- Show/hide sections (hide "later years" for under 40, hide "military" unless subject opts in)
- Rephrase past-tense questions to present or future tense for younger subjects
- Add a "Future Aspirations" section that only appears for subjects under 25

This is a one-time schema addition to `interview_plan.json` — add an `age_min` / `age_max` and `tense` field to each section.

---

## 2. Voice-Native People Entry  🔴 Critical

Every persona hit this. "Use the form section to add one or more parents" breaks the conversational flow completely. Bob, Peggy, and David want to just say who their family members are and have the app capture it.

**Fix:** Let the LLM extract people from a spoken answer. When the subject says "my father was Ignacio Martinez, born in Monterrey, Mexico in 1919," the app should:
1. Parse the name, relationship, birthplace, and approximate year from the answer
2. Pre-fill the people form and ask the subject to confirm
3. Fall back to the manual form only if the spoken answer is too vague

This turns "use the form" into "tell me about your parents" — a much more natural entry point.

---

## 3. Post-Transcription Name Correction  🔴 Critical

Zbigniew → "Swig New." Chosin Reservoir → "Chosen Reservoir." Poh Poh → "Pa Pa." STT systematically fails on Polish names, Korean War place names, Akan names, and non-English honorifics. These errors get silently saved and the subject doesn't see them until later.

**Fix:** After each STT transcription, show a brief inline review with detected proper nouns highlighted for quick correction. A small "Did you mean?" style confirmation for words flagged as low-confidence by Whisper. The `initial_prompt` can be improved by having the app build a vocabulary of known names from the subject's people registry as the interview progresses.

---

## 4. Non-Traditional Family Handling  🔴 Critical

David is divorced. Aisha is a single mom who never married. The marriage section as written ("Tell me the proposal story," "Tell me about your wedding") is actively alienating for anyone whose family structure doesn't match the 1950s template.

**Fix:**
- Before the marriage section, ask: "Are you married, in a partnership, divorced, widowed, or single?" and route accordingly
- For single parents: skip the proposal/wedding questions and go straight to "Tell me about how your family came together"
- For divorced subjects: offer "Tell me about your marriage and how things changed" as a single combined question they can answer at whatever depth they want
- Add a deceased flag to all family member records

---

## 5. Emotional Pacing and Sensitivity  🔴 Critical

Peggy is a widow of 4 years. Being asked "Tell me the proposal story" right after we established her husband has passed — with no acknowledgment — is a real UX failure for a product designed around meaningful life stories. The LLM has all the information it needs to do better.

**Fix:** The LLM should detect when a subject is recently widowed or has experienced significant loss and:
- Add a brief compassionate framing before sensitive questions ("I know this may bring up tender memories — feel free to share as much or as little as you'd like")
- Offer to come back to this section ("We can skip this for now and return later if you'd like")
- Not rush through emotion with a "great, moving on to the next question" tone

---

## 6. Highlight / Bookmark Answers  🟡 High Value

Peggy's grandfather's funeral story. Bob's proposal at the Majestic Theater. Aisha's COVID memory. These are the standout answers in every session — the ones that belong in the final memoir. Right now they're stored identically to "What is your birth order?"

**Fix:** Add a ⭐ bookmark button next to each answer (and a voice command: "mark that as important"). Bookmarked answers get a `highlight: true` flag in the database and are automatically prioritized in:
- The memoir generation
- Export documents
- The summary view

---

## 7. "Not Yet" as a Valid Answer  🟡 High Value

Jordan doesn't have a part-time job yet. He hasn't been to college yet. He has no career progression. The app offers "skip" but that feels like failure. It should offer "not yet" — which means "this question is for my future self."

**Fix:** Add a "Not Yet" button alongside Skip. Answers marked "not yet" create a placeholder that can be returned to later, and they show as "to be continued" in the subject's progress view rather than blank.

---

## 8. Dedicated Sections for Missing Life Themes  🟡 High Value

The simulations revealed four major life experiences that are completely absent from the interview plan:

**Immigration / acculturation** — David and Aisha's families both immigrated; it's the defining thread of their stories, but it surfaces only if they volunteer it under "early years." A dedicated section or sub-questions ("Did you or your family immigrate? How old were you? What was that transition like?") would capture this properly.

**Faith and religion** — Currently buried at the end of the technology section as an afterthought. For Peggy and Bob, faith is the organizing principle of their entire life. Needs its own section that comes before later years, not after gadgets.

**Military service depth** — The current question "Any military service? If yes, branch/roles/locations" is one sentence. For a veteran like Bob with 2 years in Korea, this is the central chapter of his life. A dedicated veteran sub-section with questions about unit, buddies, specific experiences, homecoming, and lasting effects is warranted.

**Digital identity and online life** — For anyone born after 1985, their online presence (social media accounts, online communities, usernames, YouTube channels, Discord servers) is as much a part of their identity as their neighborhood or school. Jordan's friendships exist in Discord. Aisha's career was built on digital platforms. These need to be capturable.

---

## 9. Era-Aware World Events  🟡 High Value

"What major world events impacted your life?" produces radically different answers for Bob (Korean War, Moon landing, Vietnam, Reagan), Aisha (9/11, Katrina, COVID, social media), and Jordan (COVID in 5th grade, school shootings, climate change). Right now the question is identical for all three.

**Fix:** Based on birth year, pre-populate suggested events as prompts: "You were [age] when [event] happened — did that affect you?" This makes the question far more conversational and produces richer, more accurate answers. The system already has the birth year — this is a data join, not new data.

---

## 10. Export to Family Document  🟡 High Value

The end product people actually want is something they can print and give to their family. A formatted PDF or Word document with the person's photo, a narrative memoir, and key life facts laid out in a readable way.

**Fix:** Add an Export button that generates a document using the section summaries, highlighted answers, and people registry. This is the "deliverable" that justifies the whole interview process and makes Lorevox feel complete rather than like a database entry tool.

---

## 11. Interview Audio Recording  🟡 High Value

Lorevox captures the words but not the voice. For oral history purposes, the actual recording of someone's voice telling their story — especially for elderly subjects — is irreplaceable. A grandchild hearing their grandfather's voice 30 years from now is a completely different experience than reading a transcript.

**Fix:** Optionally record the raw audio from each answer alongside the transcript. Store it as a media attachment to the interview session. The recording can be played back in the timeline view.

---

## 12. Long-Answer Pacing Signal  🟡 Medium Value

Bob told a 3-minute story about the 1952 San Antonio flood without any feedback on whether the app was still listening. Was it saving? Was it full? Did he say too much?

**Fix:** A subtle visual indicator during recording that shows the app is actively listening and capturing — something like a waveform or pulsing mic icon. When the answer exceeds a certain length, a gentle "That's a great story — say 'I'm done' or press Next when you're ready to continue" prompt. This respects long answers without making the subject feel cut off.

---

## 13. Cross-Section Answer Bridging  🟡 Medium Value

Bob started talking about his health issues during the "later years" section, before we reached the health section. That answer got recorded in the wrong section. Peggy's formative nursing mentor came up in adolescence, not career.

**Fix:** When the LLM detects that an answer belongs in a different section ("this sounds like it's about health — want me to save it there instead?"), offer a simple redirect. Cross-section tagging lets answers live in their natural home without forcing subjects to stay on a rigid track.

---

## 14. Progress That Tells a Story  🟡 Medium Value

The current progress bar shows "X of Y questions answered." That's useful but clinical. For a life history project, progress should feel like building something.

**Fix:** Show progress as life eras: "You've covered your early life and family. Next: Your career and community." A visual timeline that fills in as sections are completed makes the subject feel like they're building their story, not filling out a form.

---

## Quick Wins (Low Effort, High Impact)

- **Remove or make optional the astrology question** — it broke rapport with Bob and Peggy and feels out of place in a life history context. It's fine as an optional add-on but shouldn't be in the default flow.
- **Natural language date input** — "August 3rd, 1947" should be parsed to `1947-08-03` automatically. Requiring YYYY-MM-DD format with no coaching is a friction point for all older subjects.
- **"Not much is known" option for family members** — Jordan's knowledge of his grandparents is limited. "I don't know much about them" should be a first-class answer that creates a placeholder record.
- **Batch sibling/children entry** — Peggy has 5 siblings. A "keep adding" loop rather than one-at-a-time form would cut entry time significantly.
- **Subject's name in `initial_prompt` by default** — The STT engine should always be seeded with the subject's name and known family names from the registry, reducing transcription errors on proper nouns.

---

## Priority Order

| Priority | Item | Effort |
|----------|------|--------|
| 1 | Age-aware interview routing | Medium |
| 2 | Voice-native people entry | Medium |
| 3 | Non-traditional family handling | Low |
| 4 | Post-STT name correction | Low |
| 5 | Emotional pacing / widow sensitivity | Low |
| 6 | Highlight / bookmark answers | Low |
| 7 | Export to family document | High |
| 8 | Immigration & faith sections | Low |
| 9 | "Not Yet" answer option | Low |
| 10 | Era-aware world events | Medium |
| 11 | Interview audio recording | Medium |
| 12 | Remove/optionalize astrology | Trivial |
| 13 | Natural language date parsing | Low |
| 14 | Auto-seed STT with known names | Low |
