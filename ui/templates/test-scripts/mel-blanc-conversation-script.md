# Mel Blanc Conversational Projection Test Script

## Purpose
Test the v8 interview projection system by feeding Lori conversational answers
as Mel Blanc's narrator, verifying that:
- Lori follows the template/questionnaire areas in a natural sequence
- interviewProjection fills as conversation progresses
- Bio Builder questionnaire cross-fills live
- Human edit locking works
- Partial → better answer updates work
- Candidates generate for people sections

---

## Pre-Test Setup
1. Ensure Lorevox UI is running on port 8080
2. Create/load Mel Blanc template (`mel-blanc.json`)
3. Open Bio Builder to confirm questionnaire is hydrated from preload
4. Open a console and verify: `window.__proj` is accessible

---

## Conversation Script

### Round 1 — Identity (should be mostly SKIPPED since preload fills these)
Lori should NOT re-ask name, DOB, birthplace if already filled from template.
If she does ask, that's a FAILURE of the "skip known basics" requirement.

Expected: Lori skips to the next incomplete area.

### Round 2 — Early Memories (likely first gap Lori targets)
**When Lori asks about earliest memories or early childhood:**

> Answer: "I remember the sounds of Portland more than anything. The trolley cars, the
> rain on the roof, the vendors calling out on the street. I was maybe four or five.
> I'd sit on the porch and just listen. That's probably my very first memory — just listening."

**Expected projection:**
- `earlyMemories.firstMemory` → projected, suggest_only
- pendingSuggestion created

### Round 3 — Parents (repeatable section)
**When Lori asks about parents:**

> Answer (PARTIAL — this tests partial-to-better): "My father was Frederick. He ran a
> little shop. We were a Jewish family, came from Europe originally."

**Expected projection:**
- `parents[0].firstName` → "Frederick" (candidate_only)
- Low confidence since partial

### Round 4 — Parents follow-up (better answer)
**When Lori asks more about the father or offers to continue:**

> Answer (IMPROVED): "His full name was Frederick Blank — Blank with no C at the end,
> that was the original family name. He came from Eastern Europe, Russia I think, or
> maybe Lithuania. He was a shopkeeper in Portland. Quiet man, hardworking."

**Expected projection:**
- `parents[0].firstName` → confidence upgrade (still "Frederick")
- `parents[0].lastName` → "Blank" projected
- `parents[0].occupation` → "Shopkeeper" projected
- `parents[0].birthPlace` → "Eastern Europe" projected

### Round 5 — Mother
**When Lori asks about another parent:**

> Answer: "My mother was Eva. Her maiden name was Katz. She was the heart of the family.
> Also came from the old country. She kept the house and kept us all fed and together."

**Expected projection:**
- `parents[1].firstName` → "Eva"
- `parents[1].maidenName` → "Katz"
- `parents[1].relation` → "Mother" (if detectable)

### Round 6 — Siblings
**When Lori asks about siblings:**

> Answer: "I had an older brother, Henry. We grew up together in Portland. He was the
> quiet one, I was the noisy one — always doing voices and making sounds."

**Expected projection:**
- `siblings[0].firstName` → "Henry"
- `siblings[0].relation` → "Brother"

### Round 7 — Education / Early Career
**When Lori asks about school or career:**

> Answer: "I went to Lincoln High School in Portland. I was in every play they'd let
> me into, played in the orchestra too. After school I went straight into radio —
> KGW and KEX, the Portland stations. I never went to college. Radio was my college."

**Expected projection:**
- `education.schooling` → projected (suggest_only)
- `education.earlyCareer` → projected (suggest_only)

### Round 8 — Career Progression
**When Lori asks about career development:**

> Answer: "In 1936 I auditioned at Warner Bros. and they hired me. First character I
> took over was Porky Pig. Then Bugs Bunny in 1940 — 'A Wild Hare' was the cartoon.
> After that it was Daffy, Tweety, Sylvester, Yosemite Sam... I lost count of how many
> characters I voiced. Hundreds, they tell me."

**Expected projection:**
- `education.careerProgression` → projected (suggest_only)

### HUMAN EDIT TEST
**At this point, manually edit a field in Bio Builder:**

1. Open Bio Builder → Education & Career section
2. Change "Schooling" from whatever was projected to:
   "Lincoln High School, Portland, Oregon. Active in drama and orchestra. Graduated."
3. Click Save

**Expected behavior:**
- `education.schooling` in projection → locked = true, source = "human_edit"
- If Lori later tries to update this field, it must be BLOCKED

### Round 9 — Later Years
**When Lori asks about later years or retirement:**

> Answer: "I never retired. I was still doing Bugs Bunny voices in my 80s. The last
> recordings I made were just before I passed. I loved every minute of it."

**Expected projection:**
- `laterYears.retirement` → projected (suggest_only)

### Round 10 — Personal Challenges / Hobbies
**When Lori asks about challenges or hobbies:**

> Answer: "The accident in 1961 — that was the hardest thing. Head-on crash on Sunset
> Boulevard. They said I'd never work again. Triple skull fracture, both legs broken.
> But I came back. Warner Bros. brought recording equipment to my bedroom. I was doing
> Bugs Bunny from my hospital bed. As for hobbies — I played the bass violin, loved music."

**Expected projection:**
- `hobbies.personalChallenges` → projected (suggest_only)
- `hobbies.hobbies` → projected (suggest_only)

### Round 11 — Additional Notes / Legacy
**When Lori asks about dreams or messages:**

> Answer: "I wanted voice acting to be respected. When I started, they didn't even
> give us screen credit. I fought for that. My headstone says 'That's All Folks.'
> I think that says everything I need to say."

**Expected projection:**
- `additionalNotes.unfinishedDreams` → projected (suggest_only)
- `additionalNotes.messagesForFutureGenerations` → projected (suggest_only)

---

## Post-Conversation Validation

### Console Checks
```javascript
// Check projection state
JSON.stringify(Object.keys(__proj.fields))

// Check locked fields
Object.entries(__proj.fields).filter(([k,v]) => v.locked).map(([k]) => k)

// Check pending suggestions
__proj.pendingSuggestions.length

// Check sync log
__proj.syncLog.slice(-10)

// Check BB questionnaire state
JSON.stringify(Object.keys(state.bioBuilder.questionnaire))
```

### Reload Test
1. Press F5 to reload the page
2. Re-select Mel Blanc narrator
3. Verify: `localStorage.getItem("lorevox_proj_draft_" + state.person_id)` has data
4. Verify: `localStorage.getItem("lorevox_qq_draft_" + state.person_id)` has data
5. Verify projection restores correctly after reload

### Narrator Switch Test
1. Switch to a different narrator (e.g., Mark Twain)
2. Verify Mel Blanc projection is persisted
3. Switch back to Mel Blanc
4. Verify projection restores: `__proj.fields` should have all previously projected values
5. Verify no cross-narrator bleed: Mark Twain's projection should not contain Mel Blanc data

---

## Success Criteria
- [ ] Lori followed template areas in natural sequence
- [ ] Identity questions skipped (already known from preload)
- [ ] Projection filled live during conversation
- [ ] Bio Builder questionnaire cross-filled
- [ ] Partial answer updated to better answer (confidence upgrade)
- [ ] Human edit locked field — not overwritten by AI
- [ ] Candidates generated for people sections
- [ ] No direct structuredBio bypass
- [ ] Reload persistence verified
- [ ] Narrator switch persistence verified
