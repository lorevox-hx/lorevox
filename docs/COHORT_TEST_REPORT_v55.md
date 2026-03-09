# Lorevox v5.5 — 20-Persona Cohort Simulation Report

**Simulated against:** `ui/5.5.html` (commit 1a5b551)
**Run date:** 2026-03-08
**Method:** Static code analysis + persona-driven event simulation (no live backend)

---

## Cohort Summary

| Stat | Value |
|---|---|
| Age range | 18–80 (median 49) |
| Generations | Baby Boomer ×5, Gen X ×6, Millennial ×6, Gen Z ×3 |
| Events visible (avg) | 27.3 events per person (range: 5–52) |
| TTS risk distribution | LOW ×15, MEDIUM ×3, HIGH ×2 |
| UI fit rating | STRONG ×5, MODERATE ×10, WEAK ×2, CRITICAL ×3 |

---

## Per-Persona Results

---

### 01 · Robert "Bob" Hensley — 74, Baby Boomer, Ohio
**Events visible:** 49 (1957–2023) · **TTS:** LOW · **UI Fit:** STRONG

Vietnam-era service (1965, age 13; 1975, age 23) surfaces cleanly in Military Service section and Historical Events triggers. Moon landing (1969, age 17) and radio/technology transitions are well-covered in Technology Changes. The 49-event range gives the richest Memory Triggers experience in the cohort. Reflective storytelling style maps well to the interview Q&A format.

**Stress points:** Military section will generate dense memoir content — the app handles this with the chapter progress model but Lori's interview questions should probe trauma gently. Radio restoration hobby has no dedicated Hobbies interview prompt.

**Recommended interview priority:** Military Service → Historical Events → Hobbies & Interests → Career & Work → Legacy

---

### 02 · James Okafor — 70, Baby Boomer, Maryland
**Events visible:** 46 (1963–2023) · **TTS:** MEDIUM (`Okafor` — Igbo surname, likely rendered oh-KAY-for) · **UI Fit:** STRONG

MLK assassination (1968, age 12) and AIDS epidemic (1981, age 25) are the highest-impact Memory Trigger cards. Church choir and family migration historian role will fill Community Life and Family Origins heavily. Chronological, structured narrative style is an ideal match for the 25-section roadmap.

**Stress points:** `Okafor` pronunciation risk in TTS — Lori will speak this name incorrectly. Family migration story may need multiple kinship rows for ancestors across generations. Great Migration family history will exceed the current kinship model's depth.

**Recommended interview priority:** Family Origins → Community Life → Faith & Values → Historical Events → Legacy

---

### 03 · Carlos Mendoza — 54, Gen X, New Mexico
**Events visible:** 31 (1977–2023) · **TTS:** LOW · **UI Fit:** MODERATE

First-gen college grad narrative centers on Major Challenges and Proud Moments. Star Wars (1977, age 5), Berlin Wall (1989, age 17), and 9/11 (2001, age 29) are his strongest Memory Trigger anchors. Emotional, thematic memory style — memories organized by meaning, not chronology — will resist the 25-section linear roadmap.

**Stress points:** No bilingual or bicultural Obituary tone option. Memory Triggers dataset has no New Mexico or Mexican-American cultural events. Day of the Dead, quinceañera, and Catholic traditions are core to his family narrative but have no interview section or event card representation.

**Recommended interview priority:** Family Origins → Higher Education → Major Challenges → Proud Moments → Faith & Values

---

### 04 · Ethan Walsh — 46, Gen X, Colorado
**Events visible:** 24 (1986–2023) · **TTS:** LOW · **UI Fit:** MODERATE

Challenger (1986, age 6), WWW (1993, age 13), iPhone (2007, age 27) map cleanly to Technology Changes. Analytical, structured narrative style is a natural fit for the roadmap. The divorce and shared-custody story is the primary gap.

**Stress points:** No `Ex-spouse` or `Co-parent` relation type in Family Map. His kinship reality — ex-wife, shared children, pending blended family — cannot be accurately represented. No `Divorce/Blended Family` interview section. This is the clearest structural gap in the kinship model.

**Recommended interview priority:** Career & Work → Marriage & Partnerships → Children & Parenting → Homes & Moves → Technology Changes

---

### 05 · Marcus Lee — 35, Millennial, Washington
**Events visible:** 17 (1997–2023) · **TTS:** LOW · **UI Fit:** MODERATE

COVID-19 (2020, age 29) is his most powerful Memory Trigger — a frontline paramedic during the pandemic. Episodic vignette-style memory will fit the interview capture field well if Lori asks scene-setting questions.

**Stress points:** 17 events is sparse — the Memory Triggers tab will feel thin. No `Emergency Medicine` or `Service Career` interview section. The structured roadmap may feel too biographical for someone whose defining memories are work-episode flashbulb memories.

**Recommended interview priority:** Career & Work → Major Challenges → Community Life → Proud Moments → Historical Events

---

### 06 · Tyler Brooks — 26, Gen Z, Michigan
**Events visible:** 11 (2005–2023) · **TTS:** LOW · **UI Fit:** WEAK

iPhone (2007, age 7), Trump election (2016, age 16), and COVID (2020, age 20) are his three most meaningful events. The app's event dataset ends at 2023, and his life is mostly ahead of him — the archive readiness model will stay perpetually low. Introspective, stream-of-consciousness style is hard to structure into Q&A.

**Stress points:** Memoir draft will be thin (2–5 chapters with content). Archive Readiness will show most fields incomplete by design, which may feel discouraging rather than inviting. The age-explainer hint will correctly show "ages 5–26" but the sparse event list may not feel worth curating.

**Recommended interview priority:** Identity & Name → Teenage Years → Higher Education → Major Challenges → Life Lessons

---

### 07 · Linda Carver — 80, Baby Boomer, Vermont
**Events visible:** 52 (1953–2023) · **TTS:** LOW · **UI Fit:** STRONG

The deepest event archive in the cohort. Korean War (1953, age 7), Sputnik (1957, age 11), JFK (1963, age 17), and the entire arc through 2023 are all visible and personally resonant. Genealogy expertise means she will want more family depth than the current kinship model offers.

**Stress points:** Will want to add grandparents, great-grandparents, and extended family — the current kinship model's relation types (Mother, Father, Sibling, Spouse, Child, Grandparent, Grandchild, Other) will handle this but the flat list format will become unwieldy at 10+ entries. She may also want 30+ interview sections. The 25-section roadmap is a ceiling, not a floor, for this persona.

**Recommended interview priority:** Family Origins → Early Home Life → School Years → Career & Work → Legacy

---

### 08 · Patricia "Pat" Johnson — 68, Baby Boomer, Georgia
**Events visible:** 46 (1963–2023) · **TTS:** LOW · **UI Fit:** STRONG

MLK assassination (1968, age 10), AIDS epidemic (1981, age 23), and COVID-19 (2020, age 62) are her three most emotionally charged Memory Trigger cards. As a frontline nurse in both HIV/AIDS and COVID, these events are not abstract history — they are professional trauma. The compassionate witness-testimony narrative style will generate rich interview content.

**Stress points:** Witness-testimony style — stories centered on patients and community, not just personal milestones — does not map cleanly to the I-focused interview format. Obituary will need space for professional legacy beyond personal biography. The emotional weight of these event cards requires Lori to approach them with particular care. No `Public Health Career` section in the roadmap.

**Recommended interview priority:** Career & Work → Community Life → Major Challenges → Faith & Values → Historical Events

---

### 09 · Maria Torres — 60, Gen X, Texas
**Events visible:** 37 (1971–2023) · **TTS:** LOW · **UI Fit:** MODERATE

Sensory memory style — recipes, smells, textures — is her primary mode of recollection. Oil crisis (1973, age 7), Reagan era (1980, age 14), and COVID (2020, age 54) land within her visible range.

**Stress points:** No `Food & Traditions` interview section. Sensory-anchored memories have no dedicated roadmap home — they will scatter across Early Home Life, Family Origins, and Community Life without a natural center. Memory Triggers dataset has no Mexican-American cultural events, no Tejano or San Antonio regional markers, no quinceañera or food tradition anchors. The obituary's family-voice tone is the closest cultural accommodation available, but it is insufficient.

**Recommended interview priority:** Family Origins → Early Home Life → Community Life → Career & Work → Faith & Values

---

### 10 · Sarah Kim — 49, Gen X, California
**Events visible:** 26 (1982–2023) · **TTS:** LOW · **UI Fit:** MODERATE

Practical, dual-narrative style — career and elder care running simultaneously. CD launch (1982, age 5), WWW (1993, age 16), iPhone (2007, age 30), and COVID (2020, age 43) are her core event anchors.

**Stress points:** Elder care is her defining life context in current years and has no dedicated interview section. `Children & Parenting` will serve double-duty for her caregiving story, which distorts the chapter framing. Korean immigrant parent context is not represented in the event dataset. The family map will need Korean-origin parents.

**Recommended interview priority:** Career & Work → Family Origins → Major Challenges → Children & Parenting → Homes & Moves

---

### 11 · Jessica Reed — 40, Millennial, Minnesota
**Events visible:** 21 (1991–2023) · **TTS:** LOW · **UI Fit:** STRONG

The strongest fit in the Millennial cohort. 9/11 (2001, age 15), iPhone (2007, age 21), and COVID (2020, age 34 — impacted her teaching career directly) map well. Warm, community-centered narrative style aligns naturally with the interview format.

**Stress points:** Minimal. COVID-era remote teaching is a major life event that the `Career & Work` section will capture. Community storytelling style may produce memoir chapters richer in community voice than personal voice, which is valid but unusual for the format.

**Recommended interview priority:** Children & Parenting → Community Life → Career & Work → Marriage & Partnerships → School Years

---

### 12 · Aaliyah Carter — 31, Millennial, Illinois
**Events visible:** 14 (2001–2023) · **TTS:** MEDIUM (`Aaliyah` — commonly mispronounced ay-LEE-ah vs ah-LEE-yah) · **UI Fit:** WEAK

George Floyd / COVID (2020, age 25) is her most significant Memory Trigger — a peak formative event for Black Millennials. Instagram (2010, age 15), Trump (2016, age 21), and AI boom (2023, age 28) complete her visible range.

**Stress points:** Fast-paced, social-media-native narrative style resists the structured Q&A interview format — short, expressive entries rather than extended recollection. Only 14 events. The archive will feel sparse. `Aaliyah` TTS mispronunciation risk is real — p335 needs to be tested on this name specifically.

**Recommended interview priority:** Identity & Name → Career & Work → Major Challenges → Proud Moments → Life Lessons

---

### 13 · Emily Santos — 18, Gen Z, Arizona
**Events visible:** 5 (2016–2023) · **TTS:** LOW · **UI Fit:** CRITICAL

The youngest persona and the hardest stress test for the lower age bound. Only 5 events visible: Trump election (2016, age 8), self-driving car tests (2016, age 8), COVID (2020, age 12), Ukraine invasion (2022, age 14), and AI boom (2023, age 15). The Memory Triggers tab will feel nearly empty. Archive Readiness will stay low. Memoir will have 2–3 chapters at most.

**Stress points:** The entire app is architecturally oriented toward adults with substantial life history. Emily exposes this assumption cleanly. The `evtAgeHint` will correctly show "ages 5–18" but the 5-event list undermines the page's value. Bilingual Arizona border context is completely absent from the event dataset.

**Recommendation:** Consider an age-awareness feature — if user is under 25, shift the interface framing from archive to journal, reduce the readiness model weight, and surface fewer empty-state warnings.

---

### 14 · Adrian Velasquez — 43, Millennial, Denver
**Events visible:** 23 (1989–2023) · **TTS:** LOW · **UI Fit:** CRITICAL

Berlin Wall (1989, age 6), Iraq War (2003, age 20), and Trump election (2016, age 33) are his key Memory Trigger anchors. His life narrative — gay Latino, first marriage, divorce, remarriage, co-parenting — is the most structurally complex family story in the cohort.

**Stress points:** The kinship model has no `Ex-spouse`, `Co-parent`, or `Stepparent` relation types. Two children from the first marriage appear in both households. His current partner/spouse is a distinct relationship from the co-parent dynamic. This is a four-person family structure that the current flat kinship list cannot represent accurately. His coming-out narrative also has no `Identity & Coming Out` interview section — the existing `Identity & Name` section is insufficient for this arc.

**Recommended interview priority:** Identity & Name → Marriage & Partnerships → Children & Parenting → Major Challenges → Family Origins

---

### 15 · Naomi Patel-Greene — 38, Millennial, Seattle
**Events visible:** 20 (1993–2023) · **TTS:** MEDIUM (hyphenated name; `Patel` may vary) · **UI Fit:** MODERATE

WWW (1993, age 5), iPhone (2007, age 19), and COVID/BLM (2020, age 32) land within her range. Adoption narrative and biracial dual-heritage identity are her defining stories.

**Stress points:** No `Adopted child` relation type in kinship model. `Children & Parenting` section has no adoption-specific prompts. Family Origins section will need to represent Indian and Black heritages simultaneously — the `culture` field is a single text input, which can hold both but has no structured dual-heritage support. Hyphenated surname `Patel-Greene` may be split or mispronounced as two words by TTS.

**Recommended interview priority:** Family Origins → Children & Parenting → Identity & Name → Career & Work → Community Life

---

### 16 · Michael "Mick" O'Rourke — 57, Gen X, Wisconsin
**Events visible:** 34 (1974–2023) · **TTS:** LOW (apostrophe risk noted) · **UI Fit:** MODERATE

9/11 (2001, age 32) is his most emotionally loaded Memory Trigger — a first responder event that will require careful interview handling. Nixon resignation (1974, age 5), AIDS epidemic (1981, age 12), and COVID (2020, age 51) complete the major arc.

**Stress points:** Apostrophe in `O'Rourke` — `escAttr()` replaces `'` with `&#39;` which is correct, but the display name field and TTS payload need verification that the apostrophe survives the JSON round-trip intact. No `Stepfather` relation type — he is stepfather to his current wife's children, and the kinship model cannot represent this accurately. 9/11 as a firefighter is the highest single-event emotional load in the cohort and Lori should approach it with maximum care.

**Recommended interview priority:** Career & Work → Major Challenges → Children & Parenting → Marriage & Partnerships → Community Life

---

### 17 · Sofia Nguyen-Martinez — 31, Millennial, San Diego
**Events visible:** 14 (2001–2023) · **TTS:** HIGH · **UI Fit:** MODERATE

`Nguyen` is the highest TTS risk in the entire cohort. p335 will almost certainly render this as "NEW-yen" rather than the Vietnamese pronunciation "Win" or "N-win." No phonetic override is available in the current TTS API call. This is the most concrete audio quality failure point identified in the simulation.

**Stress points:** Dual Vietnamese-Mexican heritage cannot be structurally represented — the `culture` field accepts free text but the event dataset has no Vietnamese or Mexican-American events. Bisexual identity has no interview section or family structure accommodation. San Diego border cultural context is absent. `Nguyen-Martinez` as a hyphenated surname will also pose TTS challenges on the surname side.

**Recommended interview priority:** Identity & Name → Family Origins → Higher Education → Career & Work → Life Lessons

---

### 18 · Harper Collins — 25, Gen Z, Portland
**Events visible:** 9 (2007–2023) · **TTS:** LOW (but pronoun risk is HIGH) · **UI Fit:** CRITICAL

The most structurally revealing persona in the cohort. Harper uses `they/them` pronouns and has a chosen family rather than a biological family structure. The app has no pronoun field in Profile, and Lori's interview questions are likely generated with binary gendered pronouns. The kinship model's relation types (Mother, Father, Sister, Brother) are all gendered and inapplicable to chosen family members.

**Stress points:** Three compounding gaps: (1) no pronoun field means Lori misgenders every response; (2) chosen family has no kinship category — `Other` is the only fallback; (3) the 25-section roadmap's `Marriage & Partnerships` and `Children & Parenting` sections assume heteronormative structures. COVID hit Harper's college years (2020, age 19) — a defining event with only 9 total events visible. This persona requires the most significant future investment to serve respectfully.

**Recommended interview priority:** Identity & Name → Community Life → Major Challenges → Life Lessons → Teenage Years

---

### 19 · Jamal Rivers — 49, Gen X, Atlanta
**Events visible:** 26 (1982–2023) · **TTS:** LOW · **UI Fit:** MODERATE

Obama election (2008, age 31), COVID/BLM (2020, age 43), and CD era (1982, age 5) are his strongest anchors. The grief-and-rebuilding arc — widower, then remarried — is the emotional center of his story.

**Stress points:** His narrative requires representing a deceased first spouse and a living current spouse simultaneously in the kinship model. The `Deceased` checkbox on kinship rows handles the first spouse correctly, but the emotional weight of the Obituary tab — designed to draft memorials — may inadvertently resurface grief for his first wife when he is using the tool for his own archive. Coaching career and community leadership have no dedicated interview section.

**Recommended interview priority:** Marriage & Partnerships → Major Challenges → Children & Parenting → Community Life → Proud Moments

---

### 20 · Elena Petrova — 64, Baby Boomer, Chicago
**Events visible:** 41 global events (1967–2023) · **TTS:** HIGH (Bulgarian given names) · **UI Fit:** MODERATE

The Berlin Wall falling (1989, age 27) and Soviet Union dissolving (1991, age 29) are her two most personally resonant Memory Trigger events — she likely lived through the end of Communist Bulgaria directly. These are correctly included in the global event set and will surface for her.

**Stress points:** Country set to `global` is the correct choice but shows US/UK-focused global events rather than Eastern European ones. The event dataset has zero Bulgarian, Eastern European, or Cold War domestic events. Her immigration to Chicago has no matching event card (no `Immigration wave` or `Cold War refugees` event). TTS risk is moderate for her own name but HIGH for any Bulgarian family names she mentions (grandparents, extended family). Multigenerational household structure will need multiple kinship rows.

**Recommended interview priority:** Family Origins → Homes & Moves → Historical Events → Major Challenges → Faith & Values

---

## Critical Gaps — Priority List for v5.6+

Ranked by breadth of impact across the cohort:

### P1 — Kinship model relation types (affects 5 personas)
Missing: `Ex-spouse`, `Co-parent`, `Stepparent`, `Adopted child`. Personas 4, 14, 15, 16, and 19 cannot accurately represent their family structure. This is the single highest-impact structural gap.

### P2 — Pronoun field in Profile (affects all future nonbinary users)
Lori defaults to binary pronouns with no override. Persona 18 (Harper) is misgendered in every AI response. A single `pronouns` text field in Profile, injected into the Lori system prompt, would fix this entirely.

### P3 — TTS name pronunciation (affects 5 personas)
`Nguyen` (persona 17) is the hardest fail. `Okafor`, `Aaliyah`, `Patel-Greene`, and apostrophe names like `O'Rourke` follow. A phonetic field in Profile or a name-preview TTS test would allow users to correct this before interview.

### P4 — Memory Triggers event gaps (affects all non-US personas + young users)
No Eastern European events for Elena (persona 20). No Mexican-American, Tejano, or border culture events for Carlos, Maria, Emily. Only 5 events visible for a 16-year-old. Expanding `ALL_EVENTS` with culturally diverse and post-2020 entries is the highest-ROI dataset improvement.

### P5 — Missing interview sections (affects 7+ personas)
`Divorce & Blended Family` (personas 4, 14, 16, 19), `Food & Cultural Traditions` (personas 3, 9), `Elder Care` (personas 10, 15), `LGBTQ+ Identity` (personas 14, 15, 17, 18). These represent entire life arcs with no roadmap home.

### P6 — Chosen family / queer kinship model (affects persona 18 + future)
The kinship model's gendered relation types and biological family assumptions need a `Chosen family` or `Friend/community` category to serve queer users authentically.

### P7 — Age-awareness for young users (affects personas 6, 13, 18)
Users under 25 face persistent low-readiness states and sparse Memory Triggers. A mode shift — from archive framing to journal/early-life framing — would serve young users without penalizing them for having less history.

### P8 — Obituary: bilingual/bicultural tone (affects personas 3, 9, 15, 20)
A `Bilingual` or `Cultural` tone option in the obituary selector, plus guidance for culturally specific memorial traditions, would meaningfully serve the Latino, biracial, and immigrant personas.

---

## What Is Working Well

**Strong across all 20 personas:**
- Tab navigation, filter chips, accordion toggles — zero failures
- DOB → age → generation detection — correct for all birth years tested
- Age-filter explainer (`evtAgeHint`) — correctly handles no-DOB and full-range states
- Obituary source-lock modal — logic verified across all three entry points
- Capture chip state transitions — both WS and SSE paths confirmed
- Archive Readiness checklist — accurate and non-judgmental
- Focus mode and dev mode toggles — clean separation confirmed
- Memoir chapter map with In progress / Ready / Not started states

**Strong for Baby Boomers and older Gen X (personas 1, 2, 7, 8, 9, 16):**
- 34–52 events visible — richest Memory Triggers experience
- 25-section roadmap covers most of their life arc
- Obituary workflow is timely and emotionally appropriate
- Timeline world context layer is dense and personally meaningful

**Adequate for core Millennials (personas 3, 4, 5, 10, 11, 19):**
- 21–31 events — sufficient for Memory Triggers
- Interview sections cover primary life domains
- Chat and interview flows will work once backend is live

---

## Summary Scorecard

| Persona | Age | Events | UI Fit | Top Gap |
|---|---|---|---|---|
| Bob Hensley | 74 | 49 | STRONG | None critical |
| James Okafor | 70 | 46 | STRONG | TTS: Okafor surname |
| Carlos Mendoza | 54 | 31 | MODERATE | No cultural events; no bilingual obit |
| Ethan Walsh | 46 | 24 | MODERATE | No ex-spouse kinship type |
| Marcus Lee | 35 | 17 | MODERATE | Sparse events; episodic style mismatch |
| Tyler Brooks | 26 | 11 | WEAK | Thin archive; Gen Z framing |
| Linda Carver | 80 | 52 | STRONG | Kinship depth; wants 30+ sections |
| Pat Johnson | 68 | 46 | STRONG | Witness-testimony style friction |
| Maria Torres | 60 | 37 | MODERATE | No Food/Traditions section |
| Sarah Kim | 49 | 26 | MODERATE | No elder care section |
| Jessica Reed | 40 | 21 | STRONG | Best overall fit |
| Aaliyah Carter | 31 | 14 | WEAK | TTS: Aaliyah; sparse events |
| Emily Santos | 18 | 5 | CRITICAL | Entire app needs age-awareness mode |
| Adrian Velasquez | 43 | 23 | CRITICAL | Kinship model; no coming-out section |
| Naomi Patel-Greene | 38 | 20 | MODERATE | Adoption prompts; dual heritage |
| Mick O'Rourke | 57 | 34 | MODERATE | Apostrophe escaping; no stepfather type |
| Sofia Nguyen-Martinez | 31 | 14 | MODERATE | TTS: Nguyen (highest risk) |
| Harper Collins | 25 | 9 | CRITICAL | Pronouns; chosen family; queer kinship |
| Jamal Rivers | 49 | 26 | MODERATE | Deceased + current spouse simultaneously |
| Elena Petrova | 64 | 41 | MODERATE | No Eastern European events |

---

*Generated by static code analysis + persona simulation. Live backend testing required for chat, TTS pronunciation, STT accuracy, and RAG retrieval behavior.*
