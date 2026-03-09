# Lorevox — Identity, Inclusion, and Belonging
## Interview Plan Additions and Design Principles

This document covers the full scope of identity dimensions that Lorevox must handle
to serve its users honestly: sexual identity, gender identity, same-sex relationships,
religion and faith journey, immigration and entry to the USA, and cultural identity.

---

## Design Principles First

Before any specific changes, these principles should guide everything in this section.

**1. All identity questions are optional and explicitly framed as such.**
The subject should never feel interrogated. Every question in this section should be
prefaced (in the LLM's voice) with something like: "These next questions are about
identity and belonging — share whatever feels right to you, and skip anything that doesn't."

**2. Language must be contemporary, inclusive, and non-clinical.**
Use "partner" alongside "spouse." Use "relationship" not "marriage" as the default.
Use "they/them" as the fallback pronoun until the subject states their preference.
Avoid: "homosexual" as a noun (clinical/dated), "sexual preference" (implies choice),
"lifestyle" (dismissive), "normal marriage" (implies others aren't).

**3. Sensitive topics come after rapport is built — not in the first section.**
The identity section should appear after the subject has already completed family
heritage, early years, and young adulthood. By then the LLM has established trust
and the subject understands the purpose.

**4. The data model must be orientation and gender neutral from the ground up.**
Spouse forms that say "Husband / Wife" exclude everyone who doesn't fit.
The form should say "Partner" with an optional relationship label the user defines.

**5. Capture the story, not just the category.**
Asking "Are you gay?" captures a category. Asking "Has your identity — how you see
yourself or who you love — shaped your life story in ways you'd like to talk about?"
captures a story. The second approach also doesn't require the subject to use a label
if they don't want one.

---

## 1 — Sexual Identity and Orientation

### What the current plan misses
The current interview plan is written entirely from a presumed-heterosexual default.
"Tell me the proposal story" assumes a man proposing to a woman (or at minimum, one
person proposing to another in a conventional way). The spouse form likely has
husband/wife fields. There are no questions about coming out, about navigating identity
in a world that may not have been accepting, or about how sexual identity shaped
relationships, family, career, or community.

For a 54-year-old lesbian like Trish O'Brien-Walsh, her coming-out story at 35 is one
of the three or four defining events of her life. It gets zero dedicated space in the
current interview.

### Proposed additions

**In the `personal_information` section (collected early, used for pronoun handling):**
```json
{
  "id": "pronouns",
  "prompt": "What pronouns do you use? (e.g., she/her, he/him, they/them, or any other)",
  "kind": "text",
  "required": false,
  "note": "This helps us refer to you correctly throughout the interview."
}
```

**New section: `identity_and_belonging`**
Place this after `career_and_achievements`, before `faith_and_values`.

```json
{
  "id": "identity_and_belonging",
  "title": "Identity and Belonging",
  "intro": "These questions are about who you are — how you see yourself, how you've
            been seen by others, and what belonging has meant to you. Share whatever
            feels right. There are no wrong answers and nothing is required.",
  "questions": [
    {
      "id": "identity_self",
      "prompt": "How would you describe your identity — in terms of who you are and
                 who you love? You might use words like straight, gay, lesbian, bisexual,
                 queer, or none of those — whatever fits for you.",
      "kind": "long_text",
      "required": false,
      "sensitive": true
    },
    {
      "id": "coming_out",
      "prompt": "If there was a moment — or a long process — of coming out or claiming
                 your identity, tell me about that. When did you first understand who
                 you were? Who did you tell, and what happened?",
      "kind": "long_text",
      "required": false,
      "sensitive": true
    },
    {
      "id": "identity_family_impact",
      "prompt": "How did your identity affect your family relationships? Were there
                 people who accepted you fully, people who struggled, people you lost
                 or found along the way?",
      "kind": "long_text",
      "required": false,
      "sensitive": true
    },
    {
      "id": "identity_community",
      "prompt": "Did your identity connect you to a community — an LGBTQ+ community,
                 a cultural community, a faith community, or any other? What did that
                 community mean to you?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "identity_era",
      "prompt": "The world has changed significantly around identity in recent decades.
                 What has it been like to live through those changes — whether that
                 meant fighting for rights, watching the culture shift, or simply
                 living your life?",
      "kind": "long_text",
      "required": false
    }
  ]
}
```

### STT considerations
The LLM and STT should handle contemporary identity vocabulary without error:
lesbian, bisexual, queer, transgender, non-binary, asexual, aromantic, pansexual,
gender fluid, two-spirit. These words should be in the STT vocabulary and the LLM
should use them naturally if the subject uses them, without correction or hedging.

---

## 2 — Gender Identity

### What the current plan misses
The plan assumes binary gender throughout. People forms almost certainly have a
"Male / Female" dropdown. For a transgender subject, their birth name, deadname (if
they choose to share it), transition timeline, legal name change, and relationship
with their former identity may all be part of their life story.

For a non-binary 45-year-old, the experience of spending decades in a binary world
before that language existed is a significant historical experience.

### Proposed additions

**In `personal_information`:**
```json
{
  "id": "gender_identity",
  "prompt": "How do you describe your gender?",
  "kind": "text",
  "required": false,
  "placeholder": "e.g., woman, man, non-binary, transgender woman, genderqueer..."
}
```

**In `identity_and_belonging` — add if subject indicates transgender or non-binary identity:**
```json
{
  "id": "gender_journey",
  "prompt": "Tell me about your relationship with your gender — when you first understood
             it, how it's evolved, and what transition or self-understanding has looked
             like for you, if you'd like to share.",
  "kind": "long_text",
  "required": false,
  "sensitive": true,
  "conditional": "gender_identity contains [trans, non-binary, genderqueer, gender fluid]"
}
```

**Data model change for all people records:**
Replace `gender: [Male, Female]` dropdown with:
- `gender_identity`: free text (they fill in their own words)
- `pronouns`: free text
- Remove any binary-only dropdowns system-wide

### For the marriage/relationship form
Remove "husband" / "wife" language entirely.
Use: "Partner's name" and "How would you describe your relationship?" (free text).
The subject defines it: "my wife," "my husband," "my partner," "my spouse."
The app stores what the subject says, not a category it assigned.

---

## 3 — Same-Sex Marriages and Relationships

### What the current plan misses
Trish and Carol were together for 12 years before marriage was legal in Massachusetts
(2004 for MA, 2015 federally). The "when did you get married" question erases those
12 years. For many same-sex couples, the legal marriage date is not the anniversary
that matters emotionally.

For older LGBTQ+ subjects, their relationship history may include:
- Long-term partnerships before marriage equality
- Commitment ceremonies that weren't legally recognized
- Relationships kept private for career or family safety
- Marriages in some states that were briefly invalidated during court challenges
- Multiple legal statuses across different countries or states over time

### Proposed additions

**In `marriage_and_family` — reframe entirely:**

Replace the current structure (assumes one marriage, heterosexual proposal) with:

```
Opening question (replaces spouse form prompt):
"Tell me about your most significant relationship or partnership — or relationships,
if there have been more than one. I'm interested in the full story: how you met,
what drew you together, what you built, and where it stands today."
```

Then conditional follow-ups based on their answer:
- If they mention a proposal: "Tell me about how that happened."
- If they mention a wedding or ceremony: "Tell me about the day itself."
- If they mention a long partnership before legal marriage: "What did it mean when
  you were finally able to marry legally — or did the legal piece matter to you?"
- If they mention divorce or loss: handled with emotional pacing (see E3 in v3)

**In the relationship history data model (referenced in F1 of v3):**
```
relationship_type: [married / domestic partnership / civil union / long-term partner /
                    commitment ceremony / informal / other (describe)]
legal_status_notes: free text — "married in MA 2004, federally recognized 2015"
together_since: date (can differ from legal marriage date)
married_date: date (optional)
```

This captures both the emotional anniversary and the legal date separately, which is
the reality for a generation of same-sex couples.

---

## 4 — Religion and Faith Journey

### What the current plan misses
Currently one question ("Any cultural or religious practices you observe?") at the end
of the technology section — already flagged for relocation. But even moving it isn't
enough. Religion for many subjects is not just "practices I observe" — it's a
full narrative arc: childhood faith, crisis of faith, leaving, returning, finding
something different, or deepening.

Tom is lapsed Catholic who still lights candles at Christmas. Trish says "I carry the
faith even without the institution." Marcus's Baptist church community held his family
together during deployments. Sandra keeps culture alive through food and Chuseok.
These are four different relationships with religion and the current single question
can't hold any of them adequately.

### Proposed new section: `faith_and_values`
Place between `career_and_achievements` and `hobbies_and_events`.

```json
{
  "id": "faith_and_values",
  "title": "Faith and Values",
  "intro": "This section is about what you believe, what you find meaningful, and
            how your relationship with faith or spirituality has evolved. Share as
            much or as little as feels right.",
  "questions": [
    {
      "id": "childhood_religion",
      "prompt": "What role did religion or spirituality play in your childhood? Were
                 you raised in a faith tradition, and what was that experience like?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "faith_journey",
      "prompt": "How has your relationship with faith, religion, or spirituality
                 changed over your life? Have you deepened in a tradition, drifted
                 from one, left and returned, or found something entirely different?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "faith_community",
      "prompt": "Has a faith community — a church, mosque, synagogue, temple, or
                 any other gathering — been part of your life? What has that community
                 meant to you?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "faith_and_major_decisions",
      "prompt": "Has faith or your values shaped any major decisions in your life —
                 who you married, how you raised your children, your career, how you
                 handled a crisis?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "what_you_believe",
      "prompt": "Setting aside labels and institutions — what do you actually believe?
                 About life, death, meaning, what happens after.",
      "kind": "long_text",
      "required": false
    }
  ]
}
```

### Religion and LGBTQ+ intersection
For subjects who identify as both LGBTQ+ and religious, this intersection is often
one of the most significant tensions in their life. The LLM should be prepared to
follow up when a subject mentions both:
"Some people navigate both a faith tradition and an LGBTQ+ identity — sometimes that's
been a source of conflict, sometimes of healing. Was that something you experienced?"

This should only surface as a follow-up, not a preset question, and only if both
identity threads have been mentioned.

---

## 5 — Immigration and Entry to the USA

### What the current plan misses
The plan has one partial question ("Did you or your family immigrate?") recommended
in v3 but not yet in the plan. That's a start. But immigration to the USA is a
specific and complex experience that deserves more structure.

Key dimensions that are currently invisible:
- The journey itself (how did you/your family get here — legally, on a visa, as a
  refugee, asylum seeker, undocumented, etc.)
- The legal and bureaucratic experience (naturalization, documentation, waiting periods)
- Language barriers and how they were navigated
- What you/your family left behind (family members, property, community, status)
- Discrimination and welcome in America — the two sides of the immigrant experience
- Citizenship and what it meant when (or if) it came
- How your children relate to the home country

### Proposed new section: `immigration_and_roots`
Place between `family_and_heritage` and `early_years` — it sets the stage for
everything that follows.

```json
{
  "id": "immigration_and_roots",
  "title": "Roots and Coming to America",
  "intro": "These questions are for anyone who immigrated to the United States, or
            whose family did. If this doesn't apply to you, we'll move on.",
  "show_if": "immigration question answered 'yes'",
  "questions": [
    {
      "id": "country_of_origin",
      "prompt": "Where did you or your family come from, and what brought you to
                 the United States?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "the_journey",
      "prompt": "Tell me about the journey itself — how did you or your family
                 actually get here? What was that process like?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "legal_path",
      "prompt": "What was your path to being here legally, if you'd like to share?
                 (Visa, green card, asylum, refugee status, naturalization, citizenship
                 — as much or as little as you're comfortable with.)",
      "kind": "long_text",
      "required": false,
      "sensitive": true,
      "note": "This is completely optional. Many immigration stories involve complicated
               legal histories and you only need to share what you're comfortable with."
    },
    {
      "id": "what_was_left_behind",
      "prompt": "What did you — or your family — leave behind? People, places,
                 a way of life, a status or profession that didn't transfer here?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "first_years_in_america",
      "prompt": "What were the first years in America like? What was hard, what was
                 surprising, what was better or worse than you expected?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "discrimination_and_welcome",
      "prompt": "What was the experience of being an immigrant or the child of immigrants
                 in America like in terms of how you were treated — by neighbors,
                 schools, employers, institutions? Were there people who helped you,
                 and people who made it harder?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "citizenship_moment",
      "prompt": "If you became a U.S. citizen, tell me about that moment. What did
                 it mean to you?",
      "kind": "long_text",
      "required": false
    },
    {
      "id": "home_country_connection",
      "prompt": "How connected do you stay to the country you or your family came from?
                 Do you visit? Do you still have family there? Does your children's
                 generation feel that connection?",
      "kind": "long_text",
      "required": false
    }
  ]
}
```

### Sensitivity notes for the LLM
- Never assume someone is undocumented based on their country of origin
- Never probe on legal status beyond what the subject volunteers
- If a subject mentions a difficult or traumatic journey (refugee experience, crossing
  the border, detention, family separation), the LLM should follow with care:
  "Thank you for sharing that. Take whatever time you need. You don't have to go
  into more detail than you're comfortable with."
- Immigration status can have legal consequences — the app should make clear in its
  framing that answers are private and stored locally only

---

## 6 — Cultural Identity

### What the current plan misses
Culture is not nationality and it's not religion — it sits at the intersection of
language, food, music, traditions, community, and a sense of where you belong.
Sandra keeps Korean culture alive through cooking Chuseok food. Marcus's Baptist
church is both faith and Black cultural community. Trish's Irish identity lives in
the rosary beads and lighting candles even without the theology.

Culture also includes: language (what languages do you speak, which do you dream in,
which did you lose), food traditions, music, storytelling traditions, naming customs,
clothing, holidays, and the experience of navigating between cultures — at school,
at work, in America.

### Proposed additions to `family_and_heritage`

```json
{
  "id": "cultural_identity",
  "prompt": "How would you describe your cultural identity? This might be a nationality,
             an ethnic background, a regional identity, a community — or a mix of
             several. What does culture mean in your daily life?",
  "kind": "long_text",
  "required": false
},
{
  "id": "language",
  "prompt": "What languages do you speak, read, or understand? Were there languages
             spoken at home when you were growing up? Are there languages you've lost
             connection with, or ones you've worked to preserve?",
  "kind": "long_text",
  "required": false
},
{
  "id": "cultural_traditions",
  "prompt": "What cultural traditions, foods, music, holidays, or practices have been
             most meaningful to you? Which ones have you worked to pass on?",
  "kind": "long_text",
  "required": false
},
{
  "id": "cultural_navigation",
  "prompt": "If you've moved between cultures — growing up in one culture and living
             in another, or navigating between a home culture and American culture —
             what has that been like? What have you held onto and what has changed?",
  "kind": "long_text",
  "required": false
}
```

---

## Updated Interview Section Order (Proposed)

After all additions, the section order should be:

1. **Personal Information** — name, DOB, birthplace, pronouns, gender identity
2. **Family and Heritage** — parents, grandparents, siblings + cultural identity, language, immigration gateway question
3. **Immigration and Roots** ← NEW (conditional on yes to immigration)
4. **Early Years** — first memories, childhood, significant events
5. **Adolescence** — school, friends, activities, era-specific questions
6. **Young Adulthood** — education (reframed to include trade/vocational), military (with veteran sub-section), early career
7. **Marriage and Family** — reframed as relationships (orientation-neutral, supports multiple partnerships)
8. **Career and Achievements** — reframed for non-linear paths; teen version is "Achievements and Passions"
9. **Identity and Belonging** ← NEW (sexual identity, gender identity, coming out, community)
10. **Faith and Values** ← NEW (separated from technology, full journey arc)
11. **Cultural Traditions** ← MOVED/EXPANDED (from technology section, now full section)
12. **Hobbies and Events** — hobbies, world events (era-aware), personal challenges, travel
13. **Health and Wellness**
14. **Technology** — first tech experience, tools, digital life (digital natives get different framing)
15. **Reflections** ← RENAMED from "Later Years" (age-gated: 55+ get retirement questions, 40-54 get mid-life reflection, under 35 get "Looking Ahead")
16. **Additional Notes** — unfinished dreams, messages for the future
17. **Pets**

---

## Data Model Changes Required

| Field | Current | Proposed |
|-------|---------|----------|
| `gender` on person records | Male/Female dropdown | Free text `gender_identity` + `pronouns` |
| `spouse` section | Singular, husband/wife | `relationship_history` list, orientation-neutral |
| `relationship_type` | Married / not married | Full spectrum: married, partnered, civil union, domestic partnership, commitment ceremony |
| `together_since` | Not tracked | Separate from `married_date` |
| `children.relationship` | Son/Daughter/Stepchild | Expanded: biological, adoptive, step, foster, kinship, raised as own |
| `family_member.status` | Not tracked | Living / deceased / unknown / estranged |
| `family_member.story` | Not tracked | Free-text narrative field |
| `immigration_status` | Not tracked | Optional, sensitive, free text |
| `languages` | Not tracked | List field on person profile |

---

## What This Unlocks

Once these additions are in place, Lorevox can authentically serve:

- **Same-sex couples** whose relationship preceded legal marriage equality
- **Transgender subjects** whose legal name change or transition is part of their life story
- **Non-binary subjects** whose experience of binary systems is itself a story
- **Immigrant subjects** at every level of documentation and every origin country
- **First-generation Americans** navigating between home culture and American culture
- **People with complex faith journeys** — lapsed, converted, syncretic, post-religious
- **Subjects from any religious tradition** — Christian, Muslim, Jewish, Hindu, Buddhist,
  Indigenous spiritual practices, secular humanist, or "I don't have a word for it"
- **LGBTQ+ subjects of older generations** who came out late, were closeted for careers
  or family, lost community to AIDS, fought for rights that younger people take for granted

These are not edge cases. They are tens of millions of Americans. Getting this right
is not a feature — it is the difference between a platform that serves real life and
one that serves an idealized version of it.
