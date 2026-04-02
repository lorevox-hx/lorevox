# Lorevox v6.3 Release Notes
**Released:** March 2026
**Branch:** main
**Preceding version:** v6.2

---

## What Changed

### Bug Fixes

#### 🔴 Bug A — Date of Birth was Question #4 (now Question #2)
**File:** `interview_plan.json`
Previously: `full_name → preferred_name → birth_order → date_of_birth → place_of_birth`
Now: `full_name → date_of_birth → preferred_name → birth_order → place_of_birth → raised_in`

The date of birth is the single most important anchor in Lorevox — it drives memory triggers, generation detection, age-at-event calculations, and the context strip. Asking it 4th meant the context strip showed "No DOB set" for the first three questions, and memory triggers were disabled for the opening of every interview.

DOB is now asked immediately after the person's name.

---

#### 🔴 Bug B — Lori asked about birthplace memories for people born abroad as infants
**Files:** `interview_plan.json` (new `raised_in` question), `ui/js/app.js` (system prompt rule)

Lori's system prompt did not contain a rule preventing her from asking about early memories from a birthplace the person left as an infant. For personas like Danny (born in Warsaw, moved to Chicago at age 2) or Priya (born in Bangalore, moved to Houston at 8 months), Lori would ask "What are your earliest memories from Poland?" or "What do you remember about Bangalore?" — which is impossible and disorienting.

Two fixes applied:
1. New `raised_in` question added to `personal_information` immediately after `place_of_birth`: *"Did you grow up there, or did your family move somewhere else when you were young?"* This gives Lori structured context about where the person was actually raised.
2. Lori's system prompt now includes an explicit rule: if someone moved from their birthplace before age 4, don't ask for memories from there.

---

#### 🔴 Bug C — Sibling birth years (2-digit or "is X") misread as current ages
**File:** `ui/js/app.js` (system prompt rule)

This was the exact bug reported from laptop testing: user said "I was born in 1962, my brothers 60 and 61" and Lori responded as though the brothers are currently 60 and 61 years old, rather than understanding they were born in 1960 and 1961.

The same class of bug generalises:
- "My oldest sister was born in '28" → Lori: "Your sister is 28 years old"
- "Brother Bill in '30, Earl in '32" → Lori: "Got it, Bill is 30 and Earl is 32"

Lori's system prompt now contains an explicit DATE DISAMBIGUATION rule: when numbers describing family members are given in the context of a person's birth year, treat them as birth years unless the numbers clearly cannot be birth years. When ambiguous, Lori asks once for clarification rather than assuming.

---

### New Feature: DOB Gate Nudge
**File:** `ui/js/interview.js`

When a user starts an interview session without a date of birth set in their profile, a gentle system bubble now appears: *"💡 Tip: Add a date of birth on the Profile tab to unlock age-anchored memory triggers before we begin."*

The interview proceeds regardless — the nudge is informational, not blocking. If the DOB is already in the profile, no nudge is shown.

---

### New Question: `raised_in`
**File:** `interview_plan.json`

Added to `personal_information` section, after `place_of_birth`:
> *"Did you grow up there, or did your family move somewhere else when you were young?"*

This answer is stored at `profile_path: "raised_in"` and immediately feeds Lori context for the `early_years` section. For anyone who moved in early childhood, this ensures the `first_memory` question and subsequent early-years questions are anchored to the right place.

---

## 25-Persona × 5-Run Test Results

All three bugs were reproduced deterministically across all 5 test runs before the fixes. After applying the fixes, all 25 personas pass the relevant checks.

| System | Pre-v6.3 | Post-v6.3 |
|--------|----------|-----------|
| DOB asked at Q4 | ❌ 25/25 affected | ✅ Fixed |
| Born-but-no-memories | ❌ 4/25 fail | ✅ Fixed |
| Sibling year/age disambiguation | ❌ 3 definite / 2 ambiguous fail | ✅ Fixed |
| Safety / Track A | ✅ | ✅ |
| Minor overlay (Emily Santos) | ✅ | ✅ |
| Bilingual (Elena Petrova, Ava Chen-Murphy) | ✅ | ✅ |
| Segment flags CRUD | ✅ | ✅ |

---

## Files Changed

| File | Change |
|------|--------|
| `interview_plan.json` | DOB moved to Q2; `raised_in` question added after `place_of_birth` |
| `ui/js/app.js` | Lori system prompt expanded with 3-rule disambiguation block |
| `ui/js/interview.js` | DOB gate nudge added at interview start |
| `ui/6.1.html` | Version bumped to v6.3 |
| `docs/persona_cohort_25.md` | New file — 5 targeted personas (#21–25) |
| `docs/test_25persona_5runs.md` | New file — full 25×5 test report |
| `docs/RELEASE_NOTES_v6_3.md` | This file |

---

## Deferred (Next Version)
- MediaPipe CDN → local vendor (avoids external dependency on cold-start)
- `raised_in` answer surfaced in profile card UI
- Sibling birth year auto-calculation when both speaker's DOB and a birth year are known
- Structured disambiguation for children's ages in `marriage_and_family` section
