# Lorevox 25-Persona Test Cohort

## Original 20 Personas
*(See docs/20-person persona.md for full details)*

1. Robert "Bob" Hensley — 72, White, retired electrician, Ohio, Vietnam-era vet
2. James Okafor — 68, Black, retired postal worker, Maryland
3. Carlos Mendoza — 52, Latino, high-school counselor, New Mexico
4. Ethan Walsh — 44, White, software PM, Colorado, divorced father
5. Marcus Lee — 33, Asian American, paramedic, Washington
6. Tyler Brooks — 24, White, graduate student, Michigan
7. Linda Carver — 78, White, retired librarian, Vermont
8. Patricia "Pat" Johnson — 66, Black, retired nurse, Georgia
9. Maria Torres — 58, Latina, bakery owner, Texas
10. Sarah Kim — 47, Asian American, civil engineer, California
11. Jessica Reed — 38, White, elementary teacher, Minnesota
12. Aaliyah Carter — 29, Black, digital marketer, Illinois
13. Emily Santos — 16, Latina, high-school student, Arizona *(minor overlay test)*
14. Adrian Velasquez — 41, Latino/White, gay, remarried, Denver
15. Naomi Patel-Greene — 36, Indian/Black biracial, lesbian, Seattle
16. Michael "Mick" O'Rourke — 55, White, stepfather, Wisconsin, former firefighter
17. Sofia Nguyen-Martinez — 29, Vietnamese/Mexican, bisexual, San Diego
18. Harper Collins — 23, White, nonbinary (they/them), Portland
19. Jamal Rivers — 47, Black, widowed then remarried, Atlanta
20. Elena Petrova — 62, Bulgarian immigrant, Chicago *(bilingual test)*

---

## 5 New Personas (v6.3 — Bug-Targeted)
*Each new persona is specifically designed to stress-test the three bugs found in laptop testing.*

### 21. Walt Nowak — 83, Polish-American, retired steelworker
**Location:** Pittsburgh, PA
**Born:** Kraków, Poland, 1942. Immigrated to USA in 1945 at age 3 with his parents.
**Background:** Grew up entirely in Pittsburgh with no memories of Poland. English only (no Polish spoken at home after arrival). Worked in steel mills for 35 years.
**Siblings:** Three older brothers born in '35, '38, and '39 (1935, 1938, 1939). When asked, says "my brothers were born in '35, '38, and '39."
**Narrative style:** Gruff but warm. Short sentences. Proud of American life.
**Bug targets:**
- **Bug B** (born but no memories): Born in Poland but has zero Poland memories. Lori must not ask about Polish childhood memories.
- **Bug C** (year/age disambiguation): "'35, '38, '39" for brothers — could be ages or birth years.

---

### 22. Dorothy "Dot" Simmons — 91, White, retired schoolteacher
**Location:** Memphis, TN
**Born:** Rural Mississippi, 1934.
**Background:** One of 8 children. Grew up on a farm. Taught school for 42 years. Sharp memory, chronological storytelling style.
**Siblings:** 7 siblings with 2-digit birth year references — "My oldest sister Ruth was born in '28, then brothers Bill in '30 and Earl in '32, my sister Mae in '36, then the younger ones — '38, '39, and '42."
**Narrative style:** Meticulous, dates-heavy, uses 2-digit year format constantly ("back in '52," "married in '56").
**Bug targets:**
- **Bug C** (year/age disambiguation): 7 siblings all described with 2-digit years. Lori will almost certainly misread some as ages unless disambiguation rule is in place.
- **Bug A** (DOB timing): At 91, she's sharp about dates but may be confused if DOB comes 4th instead of early.

---

### 23. Priya Nair-Thomas — 38, Indian-American, pediatric nurse
**Location:** Houston, TX
**Born:** Bangalore, India, 1987. Moved to USA at 8 months old.
**Background:** Has literally no memories of India. Raised entirely in Houston. Parents speak Tamil at home. Priya is fully English-dominant but understands Tamil.
**Siblings:** One younger sister, born 1990 ("my sister is 35" — current age).
**Narrative style:** Warm, reflective, professional. Comfortable with medical/emotional topics.
**Bug targets:**
- **Bug B** (born but no memories): Born in Bangalore, raised in Houston from 8 months. Lori must not ask about Indian childhood memories.
- **Bug C** (sibling age reference): "My sister is 35" — is 35 her age or birth year? In context it's clearly an age, but the disambiguation rule should handle this gracefully.

---

### 24. Danny Kowalczyk — 64, Polish-American, retired Chicago cop
**Location:** Chicago, IL
**Born:** Warsaw, Poland, 1961. Immigrated with parents to Chicago at age 2.
**Background:** No memories of Poland. Chicago through and through. 30 years on the police force. Divorced, two adult kids.
**Siblings:** One sister ("she's 68") and one brother ("he's 66") — meaning born in 1958 and 1960. When asked, says "my sister is 68 and my brother is 66." This is the exact scenario from the laptop test.
**Narrative style:** Direct, cop-like. Brief answers. Warms up slowly.
**Bug targets:**
- **Bug A** (DOB timing): If the interview doesn't ask DOB early, Danny answers "yeah I was born in '61" in freeform chat before the DOB question arrives, leaving the structured field empty.
- **Bug B** (born but no memories): Born in Warsaw, has zero Poland memories.
- **Bug C** (sibling year/age disambiguation): "My sister is 68 and my brother is 66" — this is the exact bug. Lori says those are their ages; they're actually birth years 1958 and 1960.

---

### 25. Ava Chen-Murphy — 31, Chinese-Irish biracial, graphic designer
**Location:** Boston, MA
**Born:** Hong Kong, 1994. Moved to Boston at 6 months old.
**Background:** No memories of Hong Kong. Raised Irish-American in Boston. Bilingual (English/Cantonese) — profile language set to Cantonese to test bilingual mode.
**Siblings:** One younger sister, Lily, born 1996 ("she's 29").
**Narrative style:** Creative, nonlinear, mixes humour with sentiment. Uses ellipses a lot. Young professional energy.
**Bug targets:**
- **Bug B** (born but no memories): Born in Hong Kong, zero HK memories, raised entirely in Boston.
- **Bug C** (sibling disambiguation): "She's 29" — age vs birth year ambiguity.
- **Bilingual**: Cantonese language set in profile — Lori should communicate in Cantonese.

---

## What These 5 Personas Add to Coverage

| Gap | Covered by |
|-----|-----------|
| Born abroad, no memories, European | #21 Walt, #24 Danny |
| Born abroad, no memories, Asian/South Asian | #23 Priya, #25 Ava |
| 2-digit sibling birth year strings | #21 Walt, #22 Dot, #24 Danny |
| Current-age sibling reference (not birth year) | #23 Priya, #25 Ava |
| Elderly (90+) DOB-timing sensitivity | #22 Dot |
| Bilingual (Cantonese) | #25 Ava |
| Exact replication of laptop bug report | #24 Danny |
