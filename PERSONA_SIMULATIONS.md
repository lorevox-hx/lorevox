# Lorevox — Persona Interview Simulations

Five subjects run through the full interview plan to identify real friction points.

---

## Persona 1 — Robert "Bob" Martinez, 78

**Background:** Korean War veteran, retired machinist at Ford, married 52 years, 3 kids, 7 grandkids. Grew up in San Antonio. Speaks slowly, uses era-specific slang ("the outfit," "stateside," "the shop"). Strong accent. Refers to people by nicknames only ("Hector" not "Hector Rodriguez").

---

### Session Trace

**personal_information**
- Full legal name: "Roberto Luis Martinez" — no friction
- Preferred name: "Bob" — STT: ✅
- Date of birth: "Nineteen forty-seven, August the third" — UI expects YYYY-MM-DD format, Bob says it naturally; there's no coaching on format
- 🔴 **Issue:** No birth year calculation. Bob says he was born in 1947 but the app doesn't connect this to the timeline or calculate his age during historical events

**family_and_heritage**
- Parents question: "Use the form section to add one or more parents" — Bob is looking at a voice-first interface; he wants to just say "My father was Ignacio Martinez, born in Monterrey, Mexico in 1919" — form feels like an interruption
- 🔴 **Issue:** The "use the form" instruction breaks the conversational flow. Bob doesn't know which form, where it is, or why he can't just talk
- Grandfather's name: "Abuelo Tito" — STT transcribes "Abuela Tito" (feminine article). The proper name "Tito" is fine but the honorific is wrong. `initial_prompt` would help here

**early_years**
- "What is your very first memory?" — Bob answers with a 3-minute story about a flooding in San Antonio in 1952. Great response. The LLM follow-up asks a good clarifying question.
- 🟡 **Observation:** Bob's answer is rich but he keeps going. There's no gentle signal that the answer has been saved and the next question is ready — he's not sure if he should keep talking or stop

**adolescence**
- "Did you have part-time jobs as a teenager?" — Bob says "I worked at the Five and Dime on Commerce Street, stocking shelves for old man Garza." STT catches this fine, but "Five and Dime" might not index well for future search
- 🟡 **Observation:** Rich place names and business names (defunct businesses, old neighborhoods) need to be surfaced for the memory graph. A "named entities" extractor would be useful here

**young_adulthood**
- Military service: Bob has a lot to say — 14th Infantry Regiment, Korea 1951-53, Inchon, the Chosin Reservoir.
- 🔴 **Issue:** The military question is single and generic: "Any military service? If yes, branch/roles/locations." This barely scratches the surface. For a veteran, there should be a dedicated military section with sub-questions about unit, battles, buddies, what coming home was like
- STT: "Chosin Reservoir" → transcribed as "Chosen Reservoir" — classic Whisper error on Korean War place names. `initial_prompt` with "Korean War veteran" hint would help

**marriage_and_family**
- "Tell me the proposal story" — Bob tells a beautiful 5-minute story about proposing at the Majestic Theater in 1969.
- 🟡 **Observation:** This is the richest answer in the session. No way to flag it as "highlight" — it would get buried in the session data
- "Add family traditions in the form" — same form-breaking issue as parents

**later_years**
- "What has retirement looked like for you?" — Bob mentions woodworking, his grandkids, his health issues. He naturally segues into health topics here before we reach the health section.
- 🔴 **Issue:** No mechanism to say "we'll come back to that in the health section." Answers that span sections are lost or duplicated

**technology_and_beliefs**
- "What is your astrological sign?" — Bob says "I don't put much stock in that." The question feels out of place for a 78-year-old Korean War vet. He gives a polite non-answer.
- 🔴 **Issue:** Astrology question is jarring in the context of a life history interview for someone of this generation. It needs to be optional or removed from the default plan

---

### Key Issues Found (Bob)
1. Date input needs natural language coaching or NLP parsing ("August third, 1947")
2. "Use the form" instructions break voice flow — needs inline voice capture for people/relationships
3. No way to mark a standout answer as a highlight
4. Military section is too thin for veterans — needs dedicated sub-section
5. STT accuracy drops on Korean/WWII-era place names and foreign honorifics
6. Astrological sign question feels culturally misaligned for older subjects

---
---

## Persona 2 — David Chen, 52

**Background:** Immigrated from Hong Kong at age 10, grew up in San Francisco's Richmond District. Software engineer at a mid-size company. Divorced, two teenage kids (shared custody). Fast talker, precise vocabulary, occasionally drops Cantonese words. Has a rich immigration story but an unconventional family structure.

---

### Session Trace

**personal_information**
- Full legal name: "David Wei-Lin Chen" — STT: gets "Wei Lin" without the hyphen. Minor.
- Birthplace: "Kowloon, Hong Kong" — STT: ✅ Whisper handles this well

**family_and_heritage**
- Parents form: David wants to note his parents are deceased. No field for that.
- 🔴 **Issue:** No way to mark a family member as deceased within the form, which is crucial for older subjects and for anyone doing genealogy
- Grandparents: "My maternal grandmother — we called her Poh Poh — came from Guangdong province during the 1930s." STT: "Poh Poh" → "Pa Pa." `initial_prompt` with "Cantonese family" would help.
- 🔴 **Issue:** No support for non-English family honorifics (Poh Poh, Yeye, Nai Nai, Abuela, etc.) — these are culturally essential but STT mangles them

**early_years**
- "What was your favorite toy or game as a child?" — David says "mahjong tiles, which my grandmother let me sort." Good answer, no friction.
- "What was the most significant event from your early years?" — David answers with immigration at age 10. Rich story.
- 🟡 **Observation:** Immigration is a major life event but there's no dedicated question for it. It surfaces only because David volunteers it here

**adolescence**
- School section: David attended Galileo High School in SF. He mentions his ESL struggles and cultural identity conflicts.
- 🔴 **Issue:** The standard adolescence questions don't have any immigration/acculturation angle. For a significant portion of the population, this is the defining teenage experience and the current questions miss it entirely

**young_adulthood**
- Military: "No" — skipped cleanly
- Early career: David has a non-linear story — community college → self-taught coding → bootcamp before bootcamps existed → first job at a startup that failed.
- 🟡 **Observation:** Career section assumes linear progression (roles, promotions). Doesn't handle pivots, self-teaching, startup failures, or gig work well

**marriage_and_family**
- Spouse section: David is divorced. The question "Tell me the proposal story" and "Tell me about your wedding" feel awkward — he doesn't want to dwell on this.
- 🔴 **Issue:** No way to gracefully handle divorce, remarriage, blended families, or estranged family members. The questions are written assuming a single, intact marriage
- Children: David's kids are 15 and 17, still at home. The children form probably expects ages/birthdays — fine. But describing "family life" in present tense is complex when custody is shared.
- 🔴 **Issue:** The family section is written entirely in past tense from the perspective of someone much older. For a 52-year-old with kids at home, this is present-tense reality

**technology_and_beliefs**
- "What was your first memorable experience with technology?" — David lights up. Commodore 64 at age 12, writing BASIC games. This leads naturally into his whole career story.
- 🟡 **Observation:** For a tech person, this question is a goldmine, but it comes near the end of the interview when fatigue sets in. Ordering matters.
- Astrology question — David answers with mild amusement. Fine for him, but still odd in a life history context.

---

### Key Issues Found (David)
1. No deceased/relationship-status field for family members
2. Non-English honorifics (Poh Poh, Abuela, etc.) need to be in STT vocabulary
3. No immigration/acculturation question in adolescence or early years
4. Career section doesn't handle non-linear paths, pivots, or self-taught journeys
5. Marriage section assumes single intact marriage — divorce/blended families need graceful handling
6. Questions feel past-tense for subjects still in active life phases

---
---

## Persona 3 — Margaret "Peggy" Kowalski, 71

**Background:** Second-generation Polish-American. Grew up in Chicago's Polish neighborhood (Avondale). Retired ICU nurse. Widowed 4 years ago. Deeply Catholic. Heavy on Polish family names, Catholic vocabulary, Chicago neighborhood names.

---

### Session Trace

**personal_information**
- Full legal name: "Margaret Anna Kowalski-Nowak" — hyphenated name handled fine
- Birthplace: "Chicago, Illinois" — ✅

**family_and_heritage**
- Parents: Father "Zbigniew Kowalski" — STT: "Zbigniew" → "Swig New" 🔴 Classic STT failure on Polish names
- Grandparents: "Dziadek Wojciech" — STT: "Jed Tech Wojtek" — completely wrong
- 🔴 **Issue:** Polish names are a systematic STT failure point. `initial_prompt` with "Polish family names" would help, but the real fix is a post-transcription name review step where the user can correct proper nouns before they're saved
- Siblings: She has 5 siblings. The form is fine but entering 5 people by voice is tedious.
- 🟡 **Observation:** Large families (5+ members) make the form-entry approach very slow. A "keep adding" flow or batch entry would help

**early_years**
- "What was your very first memory?" — Peggy describes attending her grandfather's funeral at age 4, the Polish church, the smell of incense, her grandmother crying. Incredibly vivid.
- 🟡 **Observation:** This answer is a highlight, contains rich sensory detail, and should be easily retrievable. No mechanism to tag it.
- "What was the most significant event from your early years?" — Peggy talks about the 1968 Democratic convention protests in Chicago. Historical context is rich here.
- 🟡 **Observation:** The app doesn't connect "1968" to the timeline or cross-reference with world events

**adolescence**
- High school: "St. Mary of the Angels" — STT gets this right. ✅
- Part-time job: "I worked at the bakery on Milwaukee Avenue, Racine Bakery." STT: "Racine" → fine, "Milwaukee Avenue" → fine. Chicago street names work.
- 🟡 **Observation:** She wants to say "my Aunt Helena taught me nursing first" — but there's no place in the adolescence section to mention formative figures who weren't parents

**marriage_and_family**
- Husband: Stanisław (Stan) Nowak, married 1978, died 2022.
- 🔴 **Issue:** Same deceased-family-member issue. "Tell me the proposal story" triggers tears. The app has no emotional pacing mechanism — no "take your time" response, no option to come back to this.
- 🔴 **Issue:** For a widow/widower, these questions need sensitivity framing. The LLM response at section end should acknowledge this gracefully rather than just moving forward.
- Family traditions: Peggy describes Wigilia (Polish Christmas Eve dinner) in detail. Very rich. But "Add family traditions in the form" stops the flow.

**health_and_wellness**
- As an ICU nurse, Peggy has a lot to say here — her own hip replacement, her husband's cancer, her mental health after his death. Very important content.
- 🟡 **Observation:** The health questions are brief for someone with this much health history. And Peggy's professional medical knowledge means she uses clinical terms that the average person wouldn't — no accommodation for that.

**technology_and_beliefs**
- Cultural/religious practices: Peggy describes her Catholic faith extensively. This is the most important section for her personally.
- 🔴 **Issue:** The religion/belief question is buried at the end of technology section, as if it's an afterthought. For many older subjects, faith is the organizing principle of their entire life story and deserves its own section.

---

### Key Issues Found (Peggy)
1. STT failures on Polish (and other Slavic/non-Latin) names — need post-STT name correction
2. Large family entry is slow — batch entry or faster form flow needed
3. No formative figures field outside parents (mentors, aunts/uncles who shaped you)
4. No emotional pacing — widow/widower context needs compassionate question framing
5. Religion/faith buried in technology section — should be a standalone section
6. No world events cross-referencing (1968 Chicago, etc.)

---
---

## Persona 4 — Aisha Thompson, 38

**Background:** Marketing director, Atlanta-based. Single mom to a 9-year-old daughter. Her parents immigrated from Ghana. First-generation American. Fast talker, confident, very tech-comfortable. Her "history" is recent (childhood in the 90s, career in 2000s-2020s). Active social life, strong opinions.

---

### Session Trace

**personal_information**
- Full legal name: "Aisha Nana Thompson" — STT: "Nana" → "Nana" ✅ (common enough word)
- DOB: "July 14th, 1987" — spoken naturally; same format coaching issue as Bob

**family_and_heritage**
- Parents: Father Kwame Thompson (Ghana), Mother Abena Thompson (Ghana).
- STT: "Kwame" → "Kwame" ✅ (well-known name), "Abena" → "Abena" ✅
- Grandparents: "Nana Akosua" — STT: "Nana Acoosa" — Ghanaian names are less common than Korean War placenames in Whisper's training data
- 🟡 **Observation:** Less severe than Polish but Akan names (Kwasi, Akosua, Kofi, Ama) need to be in the `initial_prompt` vocabulary

**early_years**
- "What is your very first memory?" — Aisha says "watching my mom braid my sister's hair on Sunday mornings while Aretha Franklin played." Strong, vivid. No friction.
- 🟡 **Observation:** This is a 1990s childhood. The "major world events" question later will be: 9/11 (age 14), Hurricane Katrina, smartphones, social media, COVID. Very different set than Bob's Korean War era.

**adolescence**
- Schooling: Aisha attended a magnet school for arts. She's proud of this.
- Social media: "I was one of the first people at my school on Facebook." — 🟡 **Observation:** No question about social media, digital life, or online identity even though this is a defining adolescent experience for anyone born after 1985.
- Part-time job: "I was a Brand Ambassador for Sprint at the mall" — 🟡 **Observation:** This type of job (brand ambassador, social media manager, influencer work) isn't captured by "part-time job" framing which implicitly suggests retail or farm work

**young_adulthood**
- "Any military service?" — "No." Fast skip. Fine.
- Higher education: Aisha went to Spelman College. She's proud of the HBCU context but the question doesn't invite that angle.
- 🟡 **Observation:** "Tell me about higher education" misses: HBCU experience, first-gen college student experience, being the first in your family to get a degree — huge life moments for many people

**marriage_and_family**
- Aisha is a single mom — never married. The entire marriage section as written doesn't apply.
- 🔴 **Issue:** "Let's add spouse information in the form" — Aisha has no spouse. "Tell me the proposal story" — not applicable. There's no graceful path for people who are single, have children outside marriage, or are in non-traditional relationships.
- Daughter: Aisha lights up talking about her daughter Imani. This is the heart of her family section.
- 🔴 **Issue:** The family section is heavily structured around marriage → children as sequential steps. For a single parent, the children are the whole story and the marriage questions feel intrusive or invalidating.

**career_and_achievements**
- Career progression: Aisha's career is all digital marketing, she's had 6 jobs in 15 years. She mentions mentoring young Black women in marketing specifically.
- 🟡 **Observation:** The mentorship question is good and she has a lot to say here. But "community involvement" doesn't naturally capture professional mentorship, DEI work, or online community leadership — forms of contribution that define a whole generation

**hobbies_and_events**
- "What major world events impacted your life?" — Aisha describes 9/11 at age 14 ("I remember watching in my homeroom"), Hurricane Katrina ("I had cousins in New Orleans"), and COVID.
- 🟡 **Observation:** This question works well but produces a very different answer for a 38-year-old than for a 78-year-old. The interview makes no distinction — both get the same question with no era context

**technology_and_beliefs**
- "What was your first memorable experience with technology?" — Aisha says "AOL Instant Messenger in 1999." This is generationally accurate.
- 🔴 **Issue:** The technology section feels like it was written for someone who first encountered a computer in their 40s. For a digital native, technology isn't a separate category — it's woven through everything: childhood, education, career, relationships.

---

### Key Issues Found (Aisha)
1. Marriage section completely misaligned for single parents — needs a graceful non-marriage path
2. No acknowledgment of HBCU, first-gen college, or minority experience in education questions
3. Social media / digital identity missing from adolescence questions (critical for 1985+ generation)
4. "Community involvement" doesn't capture professional mentorship, DEI, or online community work
5. Technology section framing is wrong for digital natives — technology is not a separate life category for them
6. Era-aware questions needed — a 38-year-old's "major world events" are completely different from a 78-year-old's

---
---

## Persona 5 — Jordan Rivera, 16

**Background:** 16-year-old, junior in high school. First-generation American, parents from Oaxaca, Mexico. Lives in Phoenix. Into gaming (Minecraft, competitive Valorant), music production. Parents want to document his life before he leaves for college. Jordan is skeptical about "an interview" but willing to try.

---

### Session Trace

**IMMEDIATE PROBLEM:** The interview plan was designed for someone looking back on a completed life. Jordan has no "later years," no military service, no career, no marriage. More than half the questions don't apply.

**personal_information**
- Full legal name: "Jordan Emilio Rivera" — ✅
- Birth order: "Second, I have an older sister" — fine
- Date of birth: "March 2009" — works

**family_and_heritage**
- Parents form: Father Manuel Rivera (Oaxaca, Mexico), Mother Lucia Rivera née Mendoza (Oaxaca, Mexico)
- STT: "Oaxaca" → "Wahaca" — Whisper knows this word but pronunciations vary. Jordan says "wah-HAH-kah" correctly and gets "wahaca." Minor.
- Grandparents: Jordan doesn't know much about his grandparents — "Abuela Rosa, she lives in Mexico, I don't see her much."
- 🔴 **Issue:** For a teenager, limited knowledge of grandparents is totally normal but the app has no way to capture "I know little about this person" gracefully. It either expects an answer or skips.
- Siblings: One older sister, Valentina, age 19 — fine.

**early_years**
- "What is your very first memory?" — Jordan says "playing Minecraft with my dad, we built a house." Completely genuine, perfect answer.
- 🟡 **Observation:** For a kid born in 2009, "very first memory" is likely 2012-2013. The world looks completely different — tablet before smartphone, Minecraft, YouTube, streaming. The app has no way to signal that this is totally valid context.
- "What was the most significant event from your early years?" — Jordan says "COVID, when school went online in 5th grade." This is a historically significant answer.
- 🟡 **Observation:** COVID as a childhood/adolescence experience is a defining moment for this generation and the app has no specific accommodation for it (it appears only in "major world events" much later)

**adolescence**
- Schooling: Jordan attends Desert Mountain High School. He's good at math, hates history (ironic). He's in the robotics club.
- Friendships: Jordan names his Discord server friends by their gamertags — "KrakenBoy and SilverEdge."
- 🔴 **Issue:** The app has no concept of online friends vs. in-person friends. For Gen Z, online friendships are just as real and significant, but the question framing implies physical friends.
- Part-time job: Jordan has no job. This section doesn't apply. No graceful skip with a note like "not yet" rather than "no."
- 🟡 **Observation:** Several questions need "not yet / not applicable" options that don't feel like failures

**young_adulthood**
- Higher education: Jordan is planning to study computer science. He says "I want to go to ASU or maybe somewhere with a good esports program."
- 🔴 **Issue:** The higher education question is framed entirely in past tense. For a teenager, this is future planning. There's no "what are your plans?" framing anywhere in the interview.
- Military service: "No." — slightly odd question for a 16-year-old. Should be skippable by age.

**marriage_and_family** — Entirely inapplicable. Jordan answers "I don't know" to all spouse questions. The proposal story question makes him laugh.
- 🔴 **Issue:** This entire section should be hidden or replaced with "future aspirations: relationships, family you hope to have" framing for younger subjects

**career_and_achievements**
- Walk me through career progression: Jordan has none. He mentions his YouTube channel about Minecraft (43 subscribers) with pride.
- 🔴 **Issue:** For a teenager, "achievements" means school awards, YouTube/social media presence, gaming rankings, creative projects — none of which are captured by the career/volunteer framing
- Community involvement: Jordan helps his dad's friend translate Spanish at community meetings sometimes. Good answer, not captured by "volunteer work" framing.

**later_years** — Completely inapplicable. Jordan is baffled by these questions.

**hobbies_and_events**
- Hobbies: Jordan is animated — gaming, music production (FL Studio), cooking with his mom. The best section for him.
- Major world events: "COVID, and January 6th, and the Uvalde shooting. That was at my school's district — we had lockdown drills after that." This is an important, painful answer.
- 🟡 **Observation:** School shootings as a formative experience for Gen Z is significant but not anywhere in the interview plan

**health_and_wellness** — Minimal answers. Jordan is 16 and healthy.

**technology_and_beliefs**
- Technology: "My first phone was an iPhone 7 my cousin gave me when I was 8." — completely valid and revealing.
- Astrology: Jordan actually engages with this. "I'm a Pisces and yeah it kind of fits." He finds it fun.
- Religion: Jordan's family is Catholic but he's questioning. He gives a thoughtful answer about not being sure what he believes.

---

### Key Issues Found (Jordan)
1. More than half the interview plan is inapplicable or future-tense for a teenager
2. No age-aware question routing — the app needs to skip or rephrase sections based on subject's age
3. Online friends, gamertags, Discord communities are invisible in the current people/relationships model
4. "Not yet" needs to be a valid answer distinct from "no" or "skip"
5. Future aspirations section is completely missing (crucial for young subjects)
6. Creative/digital achievements (YouTube, gaming rank, music production) have no place in the interview
7. Gen Z defining events (COVID in childhood, school shooting drills, social media) need dedicated questions
8. School shooting / community trauma is unaddressed — a significant experience for this generation

---
---

## Cross-Persona Summary: Top Friction Points

| Issue | Bob (78) | David (52) | Peggy (71) | Aisha (38) | Jordan (16) |
|-------|----------|------------|------------|------------|-------------|
| Form interrupts voice flow | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| No highlight/bookmark on answers | 🟡 | 🟡 | 🟡 | 🟡 | — |
| STT failures on names | 🔴 | 🔴 | 🔴 | 🟡 | 🟡 |
| Deceased family member flag | — | 🔴 | 🔴 | — | — |
| Divorce/non-traditional family | — | 🔴 | — | 🔴 | — |
| No emotional pacing | — | — | 🔴 | — | — |
| Astrology feels out of place | 🔴 | 🟡 | — | — | — |
| Military section too thin | 🔴 | — | — | — | — |
| No immigration questions | — | 🔴 | 🟡 | 🟡 | — |
| Faith/religion buried | 🟡 | — | 🔴 | — | — |
| Age-inappropriate sections | — | — | — | 🔴 | 🔴 |
| No "not yet" answer option | — | — | — | — | 🔴 |
| No future aspirations section | — | — | — | — | 🔴 |
| Online friends invisible | — | — | — | 🟡 | 🔴 |
| Digital native tech framing | — | 🟡 | — | 🔴 | 🔴 |
| Era-unaware questions | 🟡 | 🟡 | 🟡 | 🔴 | 🔴 |
