# Lorevox — Improvement Ideas v3

Grounded in 11 total persona sessions across two rounds.
Astrology removed. Focus: adults 40+, with teenagers stress-tested.

---

## STRUCTURAL CHANGES TO THE INTERVIEW PLAN

These aren't features — they're fixes to how the interview itself is organized.

### S1 — Age-Aware Section Routing  🔴 Must Fix

The "Later Years" and "Retirement" questions actively alienate everyone under 55 and are
comedically wrong for teenagers. The Marriage section wastes a teenager's limited patience on
five consecutive inapplicable questions before reaching the one good one ("describe your family
life") that they actually have something to say about.

**Implementation:**
Add `age_min`, `age_max`, and `tense` fields to `interview_plan.json` sections. On session
start (where we already have the DOB), compute the subject's age and filter/relabel sections:

```json
{
  "id": "later_years",
  "title": "Later Years",
  "age_min": 55,
  "questions": [...]
}
```
```json
{
  "id": "future_aspirations",
  "title": "Looking Ahead",
  "age_max": 35,
  "questions": [
    {"id": "future_family", "prompt": "What does family life look like in your future?"},
    {"id": "future_career", "prompt": "What are your career or creative goals?"},
    {"id": "future_where", "prompt": "Where do you see yourself living in 10 years?"}
  ]
}
```

For the marriage section under age 25, collapse it to one question: "Tell me about relationships
and family — whatever that means for you right now." This one open question gets more from Tyler
and Maya than five structured ones.

---

### S2 — Reframe "Later Years" for 40–55 Range  🔴 Must Fix

Tom (45) and Sandra (48) both hit "What has retirement looked like?" and gave the same answer:
laughter. The section title and framing need to shift for mid-life subjects.

**Implementation:** Rename and rephrase for ages 40–55:
- Section title: "Reflections" (not "Later Years")
- "What has retirement looked like?" → "What does this chapter of your life feel like compared to earlier ones?"
- "Advice for future generations?" stays — it's the best question in the plan for this age group

---

### S3 — Faith and Belief as Its Own Section  🔴 Must Fix

Confirmed across four of six personas (Tom, Marcus, Sandra, Trish). Faith is either the central
organizing principle of someone's life or it's a complex lapsed/evolving relationship — either
way it deserves its own space. Buried after "what's your favorite gadget" is structurally wrong.

**Implementation:** Break `technology_and_beliefs` into two sections:
- `technology` — first tech experience, how technology has changed your life, digital habits
- `faith_and_values` — spiritual or religious practices, how your beliefs have changed over time,
  what you find meaningful or sacred

Place `faith_and_values` between `career_and_achievements` and `hobbies_and_events` — where it
naturally fits as a life-organizing topic rather than an afterthought.

---

### S4 — Military Service as a Major Section (Not One Question)  🔴 Must Fix

Marcus (50, 20-year Army veteran) had his entire military career — two Iraq deployments, Germany,
South Korea, a Bronze Star, lifelong friendships, a family that moved 11 times — captured by the
question "Any military service? If yes, branch/roles/locations."

**Implementation:** Add a `veteran_service` sub-section that appears when the subject answers
"yes" to the military service question:

```
- What branch and what years did you serve?
- Walk me through your most important assignments or duty stations.
- Tell me about the people you served alongside — anyone you want named and remembered?
- Did you see combat? What do you want to say about that?
- What was coming home like?
- How did military service shape who you are today?
- How did your family experience your service?
```

This can live as a conditional block triggered by the existing `military_service` answer.

---

### S5 — Add Missing Life Theme: Immigration & Acculturation

David, Sandra, Maya — three of eleven personas had immigration as a central thread. The plan has
no immigration question. It surfaces only when someone volunteers it under "early years" or
"family heritage."

**Implementation:** Add to `family_and_heritage`:
```json
{"id": "immigration", "prompt": "Did you or your family immigrate? If so, where from, when, and what was that journey like?", "kind": "long_text"}
```

This one question unlocks Sandra's restaurant origin story, David's cultural identity struggle,
and Maya's family's international military postings.

---

### S6 — Add Missing Life Theme: Military Family / High-Mobility Childhood

Maya's entire childhood was defined by constant moves — 6 schools, perpetual goodbyes,
friendships that exist over FaceTime. None of the current questions name this experience.

**Implementation:** Add to `early_years` and `adolescence`:
```json
{"id": "mobility", "prompt": "Did you move around a lot growing up? What was that like for making friends, feeling at home, and finding your sense of identity?"}
```

---

## FAMILY STRUCTURE IMPROVEMENTS

### F1 — Multiple Marriages / Relationship History  🔴 Must Fix

Tom has been married twice. Trish was partnered for 12 years before marriage was legal. The
spouse section is singular and assumes marriage is the only committed relationship worth capturing.

**Fix:** Convert spouse to a `relationship_history` list. Each entry includes:
- Partner name
- Relationship type (married / partnered / long-term)
- Start date, end date (or "present")
- How it ended (if applicable: divorce / death / separated — optional, sensitive)
- Whether children came from this relationship

This is a data model change to the people registry, not just the interview plan.

---

### F2 — Deceased / Estranged / Unknown Family Members  🔴 Must Fix

Tom's father is dead. Trish's father is dead. Tyler barely knows his maternal grandparents.
Sandra's grandmother survived the Korean War and is now gone. The people form has no fields for
any of this.

**Fix:** Add to every family member record:
- `status`: living / deceased / unknown / estranged
- `deceased_date`: optional
- `notes`: a free-text field where "I don't know much about them" is a valid and preserved answer

---

### F3 — Informal Kinship / Non-Adoptive Parenting  🔴 Must Fix

Trish raised Carol's niece Brianna. This is neither biological parenthood nor legal adoption — it
is informal kinship care, which is extremely common especially in LGBTQ+ families, working-class
families, and communities of color. The children form has no field for this.

**Fix:** Add `parenting_role` to children records:
- Biological / Adoptive / Step / Foster / Kinship / Raised as own
- Free-text field for "tell me about how this child came into your life"

---

### F4 — Voice-Native Family Entry  🟡 High Value

All six personas encountered "use the form section" at the same points and every time it
interrupted the conversational flow. For a product built around voice and story, making people
stop talking and start clicking is the wrong default.

**Fix:** After a family section question, let the subject answer in natural speech first:
"My father was James Brennan, he was a union electrician in Cleveland, he passed in 2019."
The LLM extracts: name=James Brennan, relationship=father, occupation=electrician,
deceased=true, deceased_year=2019. Pre-fills the form. Subject confirms or edits.
Fall back to the manual form only if the spoken answer is too vague to parse.

---

## EXPERIENCE IMPROVEMENTS

### E1 — Post-STT Name Correction  🔴 Must Fix

Confirmed failures: "Zbigniew" → "Swig New", "Chosin Reservoir" → "Chosen Reservoir",
"Yoon-Hee" → "Yoon He." These errors get silently saved. The person reviewing their
grandfather's name a year later sees "Swig New" — trust in the system is broken.

**Fix:** After transcription, highlight all detected proper nouns (capitalized words, names
in the people registry) for a quick inline review. Seed `initial_prompt` with all names from
the subject's existing people registry — this improves accuracy as the interview progresses.

---

### E2 — Highlight / Bookmark Answers  🟡 High Value

Tom's story about watching his dad wire a light switch. Marcus's memory of his grandfather's
discharge papers. Sandra's memory of folding dumplings with her mother. Maya's "every time we
moved — the goodbye." These are the answers that belong in the memoir. Right now they are stored
identically to "What is your birth order?"

**Fix:** Star/bookmark button on every answer. Voice command: "mark that as important."
Highlighted answers are prioritized in memoir generation and flagged in the progress view.
Export documents lead with highlighted answers.

---

### E3 — Emotional Pacing  🟡 High Value

Trish is a widow (Carol is still alive — Trish's father died and she cares for her elderly mother).
When the interview hits a clearly sensitive answer, the LLM should modulate:
- Add brief compassionate framing: "Take all the time you need with this one."
- Offer to come back: "We can return to this section later if you'd like."
- After a heavy answer, don't rush to the next question — add a beat.

This is primarily a prompt engineering change to the LLM system instruction.

---

### E4 — "Not Yet" as a Valid Answer  🟡 High Value

Tyler has no career. Maya hasn't decided about military service. These aren't "no" answers —
they're forward-looking answers. "Not yet" should be a first-class response that:
- Creates a placeholder in the record
- Is visually distinct from Skip (which means "I don't want to answer this")
- Can be set as a reminder: "Come back to this in a year"

---

### E5 — Vocational and Trade Path Recognition  🟡 High Value

Tom did a union apprenticeship — one of the most rigorous and structured training paths that
exists. The higher education question "Tell me about higher education — schools, degrees, and
what you studied" structurally excludes him. He answers reluctantly, feeling like his path was
lesser.

**Fix:** Reframe: "Tell me about the education or training that shaped your career — whether
that was college, trade school, apprenticeship, military training, or learning on the job."
This one sentence change is inclusive of the full spectrum of adult learning.

---

### E6 — LLM Follow-Up Quality at Key Moments  🟡 High Value

Tom gives a short answer ("Legos. Still have some.") about his favorite toy. If the LLM asks
"Was there a specific set or something you built that you're still proud of?" he'll open up. If
it just moves on, the moment is lost. The difference between a good and great oral history
interview is the quality of the follow-up question.

The LLM system prompt for the interview should include explicit guidance:
- If an answer is fewer than 2 sentences, probe for a specific memory or example
- If an answer contains a named person ("Old Tony DiFranco"), ask about them
- If an answer contains an emotion word (proud, scared, hard, lucky), reflect it back

This is high-leverage prompt engineering, not feature development.

---

### E7 — Era-Aware World Events  🟡 Medium Value

Based on birth year, the world events question should be primed with era-relevant prompts.
Tom (born 1980): 9/11 at 21, 2008 crash, COVID at 40.
Marcus (born 1975): LA riots at 17, OIF deployment, Obama's election, George Floyd.
Tyler (born 2008): COVID in 5th grade, school shooting drills, social media politics.

**Fix:** At question time, the LLM prompt includes: "The subject was born in [year] and was
[ages] during [relevant events]. Use these as optional touchpoints if relevant."

---

### E8 — Community Trauma Recognition  🟡 Medium Value

Three personas named community-specific traumas: Sandra named the 1992 LA riots (Korean-American
community), Trish named the AIDS crisis (LGBTQ+ community), Marcus named George Floyd
(Black American community). In every case the generic "world events" question captured the text
but the depth of these community-specific experiences was lost.

**Fix:** When the LLM detects a community-specific trauma answer, generate a targeted follow-up:
"That clearly affected your community specifically — can you tell me more about what that was
like for people around you, not just in the news?"

---

## TEENAGER-SPECIFIC IMPROVEMENTS

### T1 — Achievement Vocabulary for Young Subjects  🔴 Must Fix

Tyler's 87 MPH fastball. Maya's regional piano competition. Tyler's robotics win. These are real
and significant achievements that the career/community framing completely erases.

**Fix:** For subjects under 20, rename and reframe the career section:
- Section title: "Achievements and Passions" (not "Career and Achievements")
- Replace "Walk me through your career progression" with "What are you proudest of so far? This
  could be in school, sports, art, music, coding, helping people — anything that matters to you."
- Replace "Community involvement" with "Do you help out in your community, your team, your
  family, or online in any way?"

---

### T2 — Online Friends and Digital Communities  🟡 High Value

Tyler's friends include gamertag handles. Maya's best friend lives in Germany and they FaceTime
weekly. Both teenagers have meaningful online relationships that the "tell me about your
friendships" question, framed for in-person relationships, doesn't naturally capture.

**Fix:** Add to the adolescence friendships question: "And are there people you're close to
online — through gaming, social media, or staying in touch across distance?"

---

### T3 — School Shooting / Safety Anxiety  🟡 High Value

Both Tyler and Maya mentioned lockdown drills without being asked. This is normalized background
anxiety for American teens that no previous generation experienced. It is a legitimate
historical and psychological experience worth documenting.

**Fix:** For subjects born after 2000, add to the adolescence section:
"What has it been like to be a student during this era — with things like lockdown drills,
social media, and the pressures that come with growing up right now?"

---

## QUICK WINS (Confirmed Needed Across Multiple Personas)

- **Natural language date input** — "March 15, 1980" should parse to `1980-03-15` automatically.
  Every single persona stated their birthdate naturally. None said "1980-03-15."

- **"I don't know much about them" as a valid family record** — Tyler, Maya, and Tom all had
  limited grandparent knowledge. This is normal. The form should accept sparse records without
  requiring name/birthplace/date fields to be non-empty.

- **Reframe "part-time jobs" to include unpaid work** — Sandra worked in her parents' restaurant
  unpaid every weekend. Marcus helped at his uncle's auto shop informally. Reframe:
  "Did you work or help out as a teenager — paid or unpaid, formal or informal?"

- **Family story field on grandparent records** — A free-text "their story" field where Sandra
  can write "Survived the Korean War, told stories about it every Sunday" without needing a
  separate section for it.

- **Connect ROTC in adolescence to military service** — A tag or link between the adolescence
  ROTC answer and the military section so they read as one continuous thread.

- **Export / family document** — Still the highest-impact missing feature. Every persona ends
  with content their family would value. There's no way to get it out in a readable form.

---

## Priority Table (Updated)

| # | Item | Type | Effort | Impact |
|---|------|------|--------|--------|
| 1 | Age-aware section routing | Structural | Medium | 🔴 Critical |
| 2 | Reframe Later Years for 40–55 | Structural | Low | 🔴 Critical |
| 3 | Faith as its own section | Structural | Low | 🔴 Critical |
| 4 | Military service sub-section | Structural | Low | 🔴 Critical |
| 5 | Multiple marriage / relationship history | Data model | Medium | 🔴 Critical |
| 6 | Deceased / unknown family flags | Data model | Low | 🔴 Critical |
| 7 | Voice-native family entry | Feature | High | 🔴 Critical |
| 8 | Post-STT name correction | Feature | Medium | 🔴 Critical |
| 9 | Teen achievement vocabulary | Structural | Low | 🔴 Critical |
| 10 | Vocational/trade path reframe | Content | Trivial | 🟡 High |
| 11 | Highlight / bookmark answers | Feature | Low | 🟡 High |
| 12 | Immigration section | Content | Low | 🟡 High |
| 13 | LLM follow-up quality prompts | Prompt eng. | Low | 🟡 High |
| 14 | Emotional pacing | Prompt eng. | Low | 🟡 High |
| 15 | "Not yet" answer option | Feature | Low | 🟡 High |
| 16 | Era-aware world events | Feature | Medium | 🟡 Medium |
| 17 | Online friends in teen friendships | Content | Trivial | 🟡 Medium |
| 18 | School shooting / safety anxiety question | Content | Trivial | 🟡 Medium |
| 19 | Natural language date parsing | Feature | Low | Quick win |
| 20 | "I don't know them" family record | Feature | Low | Quick win |
| 21 | Reframe part-time jobs (paid+unpaid) | Content | Trivial | Quick win |
| 22 | Grandparent story free-text field | Data model | Low | Quick win |
| 23 | Export to family document | Feature | High | 🟡 High |
