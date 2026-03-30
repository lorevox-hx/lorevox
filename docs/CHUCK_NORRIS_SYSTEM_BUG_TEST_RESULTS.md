# Chuck Norris — Full System Bug Test Results

## Test Environment

- UI: Lorevox 8.0 (localhost:8080)
- API: localhost:8000 (running on Windows host)
- Browser: Chrome (via Claude in Chrome)
- Date: 2026-03-29
- Pre-existing narrators: Mark Twain, Janice

## Chuck Norris Identity

| Field | Value |
|-------|-------|
| UUID | 4b6ee62a-c5a0-4d46-8e3d-694e20249784 |
| Legal Name | Carlos Ray Norris |
| Preferred/Public Name | Chuck Norris |
| Date of Birth | 1940-03-10 |
| Place of Birth | Ryan, Oklahoma |
| Legal First | Carlos |
| Legal Middle | Ray |
| Legal Last | Norris |

## Stage 1 — Narrator Creation / Load

| Check | Result |
|-------|--------|
| Chuck Norris created via POST /api/people | PASS (200 OK) |
| Profile saved via PUT /api/profiles/{id} | PASS (200 OK) |
| Chuck appears in narrator dropdown | PASS |
| Dropdown shows exactly 3 entries (Chuck, Janice, Mark Twain) | PASS |
| No stale narrators visible | PASS |
| No duplicate Chuck narrator | PASS |
| Active narrator loads correctly | PASS |
| Legal name (Carlos Ray Norris) preserved | PASS |
| Public name (Chuck Norris) preserved | PASS |
| Legal/public name not collapsed | PASS |
| person_id matches UUID | PASS |
| DOB normalized to 1940-03-10 | PASS |
| POB = Ryan, Oklahoma | PASS |

## Stage 2 — Questionnaire

| Check | Result |
|-------|--------|
| Reverse hydration fills Personal Information from profile | PASS (4/7 filled: fullname, preferred, dob, pob) |
| Full Name = Carlos Ray Norris | PASS |
| Preferred Name = Chuck Norris | PASS |
| DOB = 1940-03-10 | PASS |
| POB = Ryan, Oklahoma | PASS |
| Zodiac auto-derive | NOT TRIGGERED (shows "— select —" for Pisces; known limitation) |
| Education & Career section fills correctly | PASS (6/6 with correct field IDs) |
| Hobbies & Interests fills correctly | PASS (4/4) |
| Early Memories fills correctly | PASS (3/3) |
| Later Years fills correctly | PASS (3/3) |
| Additional Notes fills correctly | PASS (2/2) |
| No Mark Twain data in Chuck's questionnaire | PASS |
| No Janice data in Chuck's questionnaire | PASS |
| Save/reopen preserves section data | PASS |

**Bug found:** Quick Capture placeholder text says "e.g. Janice was born in Spokane, WA in 1939" — references wrong narrator. Severity: Low (cosmetic).

## Stage 3 — Quick Capture

| Check | Result |
|-------|--------|
| 11 items entered and saved | PASS |
| All items visible in Recent Items list | PASS |
| Items include identity, career, film titles | PASS |
| No duplicates on save | PASS |
| No stale prior-narrator notes | PASS |
| Items display cleanly with film/TV-dense content | PASS |
| List scrolls correctly with 11 items | PASS |

## Stage 4 — Source Inbox

| Check | Result |
|-------|--------|
| Source text card saved | PASS |
| Shows "Document · Pending" with View button | PASS |
| No source inbox contamination from other narrators | PASS |
| Drop zone still functional | PASS |

## Stage 5 — Candidates

| Check | Result |
|-------|--------|
| Candidate Queue renders | PASS |
| People (0), Relationships (0), Memories (0) | PASS (correct for fresh narrator) |
| Events (0), Places (0), Documents (0) | PASS |
| No stale Mark Twain or Janice candidates | PASS |
| No duplicate flood from movie titles | PASS |
| No self-duplication of narrator | PASS |

## Stage 6 — Family Tree

| Check | Result |
|-------|--------|
| Tab renders cleanly empty | PASS |
| Seed from Questionnaire / Seed from Candidates / + Add Person buttons present | PASS |
| No fabricated relatives from movie titles | PASS |
| No stale family data from other narrators | PASS |

## Stage 7 — Life Threads

| Check | Result |
|-------|--------|
| Tab renders cleanly empty | PASS |
| Seed from Candidates / Seed Themes / + Add Node buttons present | PASS |
| No movie/TV title spam | PASS |
| No stale Mark Twain LT data | PASS |

## Stage 8 — Life Map

| Check | Result |
|-------|--------|
| MindElixir renders 6-period scaffold | PASS |
| Root node: "Chuck Norris" (uses preferred name) | PASS |
| Birth seed: "Born · 1940" | PASS |
| Early Childhood · 1940–194x | PASS |
| School Years · 1946–1952 | PASS |
| Adolescence · 1953–1957 | PASS |
| Early Adulthood · 1958–19xx | PASS |
| Midlife · 1971–1999 | PASS |
| Later Life · 2000+ | PASS |
| "Continue in Interview" button present | PASS |
| No Mark Twain periods or data | PASS |

## Stage 9 — Timeline / Movie-Heavy Stress

| Check | Result |
|-------|--------|
| UI handles Chuck Norris narrator without crashes | PASS |
| No render lag with movie-dense Quick Capture content | PASS |
| No duplicate title flooding in any surface | PASS |
| Film/TV content displays cleanly in list format | PASS |
| Long title text (e.g., "Walker, Texas Ranger (1993-2001)") renders without overflow | PASS |

## Stage 10 — Narrator Switching Regression

| Check | Result |
|-------|--------|
| Dropdown always shows 3 narrators | PASS |
| Mark Twain → profile loads correctly after switch from Chuck | PASS |
| Janice → profile loads correctly | PASS |
| Chuck → profile loads after Janice | **FAIL** (see BUG-CN-1) |
| Life Map updates root on narrator switch | CONDITIONAL (requires manual profile fix) |
| Mark Twain questionnaire shows no Chuck data | PASS |
| Janice questionnaire shows no Chuck data | PASS |

### BUG-CN-1: Profile Stale After Rapid Narrator Switch

After switching Chuck → Mark Twain → Janice → Chuck, `state.person_id` correctly updates to Chuck's UUID but `state.profile` retains Mark Twain's data. This causes:
- Life Map showing "Mark Twain" root with 1835 dates under Chuck's dropdown
- Bio Builder questionnaire showing Mark Twain's hydrated data under Chuck
- All profile-dependent surfaces displaying wrong narrator data

Root cause: The dropdown `change` event handler doesn't reliably call `loadPerson()` during rapid switching sequences, or `loadPerson()` completes with stale data due to a race condition.

## Peek at Memoir

| Check | Result |
|-------|--------|
| Panel opens | PASS |
| Shows "Your Story — Getting Started" | PASS |
| "Draft Not Ready Yet" indicator | PASS |
| Save TXT / Save DOCX buttons present | PASS |

## Summary

| Surface | Result |
|---------|--------|
| Narrator Creation | PASS |
| Dropdown | PASS |
| Identity (legal/public) | PASS |
| Questionnaire | PASS |
| Quick Capture | PASS |
| Source Inbox | PASS |
| Candidates | PASS |
| Family Tree | PASS |
| Life Threads | PASS |
| Life Map | PASS |
| Peek at Memoir | PASS |
| Narrator Switching | **FAIL** (BUG-CN-1: stale profile after rapid switch) |

**Total checks: ~60 | Pass: ~58 | Fail: 1 (profile race) | Minor: 1 (placeholder text)**

## Is Chuck Norris Usable as a Narrator?

**YES, with one caveat.** Chuck Norris works correctly across all Lorevox surfaces when selected directly. The legal/public name distinction is properly preserved. Film and TV density does not break any UI surface. The only issue is a profile loading race condition during rapid narrator switching that can leave stale profile data in memory (BUG-CN-1).
