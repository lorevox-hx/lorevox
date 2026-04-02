# Lorevox v6.4 — UI & Interview Redesign Plan
**Date:** 2026-03-11
**Author:** Chris + Claude (Cowork)

---

## The Core Insight

The three-column layout was built to get voice chat working. It worked. Now that it works, the architecture should shift:

> **Lori should just chat naturally and gather everything into the database. The structured interview panel is noise.**

The memoir, the family tree, the timeline — all of that comes from what Lori learns in conversation. The UI should reflect that: a clean, focused conversation with Lori, and a quiet background that fills in as she learns.

---

## Phase 1 — Bug Fixes & Server Tests (Today, ~30 min)

Already done:
- ✅ Bug 1: `ingest_basic_info` 500 crash fixed (db.py + profiles.py parameter mismatch)
- ✅ Bug 2: DOB validation — fuzzy dates stored as `uncertain:` prefix, ISO dates pass through
- ✅ Bug 3: `cognitive_distress` safety category added to safety.py (13 patterns + Alzheimer's helpline resource)
- ✅ Bug 4: `prompt_composer.py` now logs PROFILE_JSON parse failures instead of silently swallowing them

**Action needed from Chris:**
```bash
# In WSL2, restart the main server to pick up Python changes:
cd /mnt/c/Users/chris/lorevox/server
pkill -f "uvicorn" 2>/dev/null; sleep 1
source ../.venv-gpu/bin/activate
uvicorn code.api.main:app --host 0.0.0.0 --port 8000 --reload
```
Then re-run the smoke test (Claude will run it from the browser).

---

## Phase 2 — UI Redesign: Single-Column Focused Chat (Half day)

### Current Problem
The three-column layout is visually overwhelming:
- **Left column:** Person selector / profile fields (admin-feeling, not warm)
- **Middle column:** Structured interview panel — too clinical, confusing which "mode" is active
- **Right column:** Chat with Lori

The middle column especially creates confusion because there are now *two* ways to talk to Lori (WebSocket chat vs. REST interview/start) and the user doesn't know which is doing what.

### New Design: Two-Panel Focused Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🎙 LOREVOX                          [Person: Chris ▾]  [⚙] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ╔═══════════════════════════════════════════════════╗     │
│   ║                  LORI CHAT                        ║     │
│   ║                                                   ║     │
│   ║   Lori: Hello Chris! I'd love to learn about      ║     │
│   ║         your life. What would you like to         ║     │
│   ║         talk about today?                         ║     │
│   ║                                                   ║     │
│   ║   You:  I grew up in Boston in the 1960s...       ║     │
│   ║                                                   ║     │
│   ╚═══════════════════════════════════════════════════╝     │
│                                                             │
│   [🎤 Hold to speak]  [__Type a message__________] [Send]  │
│                                                             │
├──────── PROFILE SIDEBAR (collapsed by default) ─────────────┤
│  ▶ What Lori knows about you  (tap to expand)               │
└─────────────────────────────────────────────────────────────┘
```

**Key changes:**
- Middle column (structured interview panel) **removed** from main view
- Left column collapsed to a small person-switcher in the header
- Chat takes full width
- "What Lori knows" — a collapsible drawer that shows live profile fields as they're captured

### Implementation
- File: `ui/6.4.html` (new, built on 6.1 as base)
- Remove `.col-interview` div and all JS that manages `interviewState`
- Replace with single `<main class="chat-main">` full-width layout
- Keep the WebSocket chat path (it works); remove the interview/start REST calls from the UI
- Profile drawer: reads `/api/profiles/{person_id}` on a 10-second poll and renders key fields

---

## Phase 3 — Lori Learns via Chat (Chat→DB pipeline) (1 day)

### Current Problem
When you talk to Lori via chat, she responds warmly — but nothing is saved. The answers don't go into the profile. The chat session is stored, but no structured data is extracted.

### Solution: Chat-to-Profile Extraction

After each assistant turn, the backend runs a lightweight extraction pass on the last N turns of chat:

**New flow:**
```
User speaks → WebSocket → LLM responds →
  extraction_pass(last_5_turns) →
    update_profile_json(person_id, extracted_fields)
```

**Extraction prompt (appended silently to context):**
```
Based on the conversation so far, extract any factual biographical data
mentioned and return ONLY a JSON object with these fields if found
(omit fields not mentioned):
{
  "full_name": string,
  "date_of_birth": string (ISO format if possible),
  "place_of_birth": string,
  "occupation_history": [string],
  "family_members": [{"name": string, "relation": string}],
  "key_life_events": [{"year": string, "event": string}],
  "places_lived": [string]
}
Return {} if nothing new was learned.
```

**Implementation:**
- New function: `server/code/api/extract_facts.py` — calls LLM with extraction prompt
- Called from `chat_ws.py` after each assistant response (async, non-blocking)
- Uses `update_profile_json(person_id, extracted, merge=True)` to accumulate facts
- Rate-limited: only runs if at least 2 new turns since last extraction

---

## Phase 4 — Guided Interview Topics (Sidebar UI) (Half day)

Instead of a structured interview questionnaire, Lori gets a **conversation guide** — a soft list of topics she can steer toward naturally.

```
WHAT LORI WANTS TO LEARN        [✓ = learned]
─────────────────────────────────────────────
✓ Full name
✓ Date of birth
✓ Place of birth
○ Parents' names & origins
○ Childhood neighborhood
○ Siblings
○ Schools attended
○ How parents met
○ First job
○ How you met your spouse/partner
○ Children's names & birth years
○ Key turning points
○ Places you've lived
○ Proudest moments
○ Advice to future generations
```

Lori's system prompt dynamically includes the next 2-3 uncovered topics so she can weave them into conversation when natural. The user doesn't see this — they just have a warm chat.

**Implementation:**
- New file: `server/code/api/interview_topics.json` — ordered list of 45 topics with field mappings
- `prompt_composer.py`: inject "Topics Lori hasn't covered yet: ..." into system prompt
- Topic completion detected by checking profile JSON fields after extraction pass

---

## Phase 5 — Family Tree Interview Mode (1 day)

### The Concept
A dedicated "Family Tree" conversation mode where Lori specifically asks about relatives. Output feeds a structured `family_tree` section of the profile.

**How it works:**
1. User says "Let's do the family tree" (or clicks a button)
2. Lori switches to family-tree mode: "Let's map out your family. Start with your parents — what were their full names?"
3. Lori works through: Parents → Grandparents → Siblings → Spouse/Partner → Children → Key extended family
4. Each person mentioned gets a structured record extracted:
   ```json
   {
     "name": "Margaret Sullivan",
     "relation": "mother",
     "birth_year": "1921",
     "birthplace": "Cork, Ireland",
     "death_year": "1997",
     "notes": "Came to Boston in 1938"
   }
   ```
5. These records create `People` rows in the DB (via `create_person`) and `Relationships` entries

**New DB usage:**
- `people` table: relatives added with `role="relative"`
- `relationships` table: already exists — links subject to relatives
- `family_tree` section in profile JSON: flat array of extracted relative records

**Implementation:**
- New system prompt injection: `FAMILY_TREE_MODE` flag in compose_system_prompt
- Family tree extraction prompt: parallel to Phase 3 but focused on relatives
- UI: "Family Tree" button in header → activates mode, shows a visual tree as it builds

---

## Phase 6 — Memoir Generation (Background job) (1 day)

### The Concept
Once Lori has collected enough through chat (name, DOB, key events, family), a "Generate Memoir Draft" button appears. This:
1. Reads the full profile JSON
2. Calls LLM with a memoir-writing prompt
3. Streams the memoir draft into a new document
4. User can read it, edit it, send it to a family member

**Implementation:**
- New endpoint: `POST /api/memoir/generate` → SSE stream of memoir text
- New UI panel: memoir viewer with "Download as PDF" and "Download as Word doc"
- Uses `prompt_composer.py` with `MEMOIR_MODE=True` — a different system prompt focused on narrative biography

---

## Implementation Order

| Phase | Feature | Effort | Target |
|-------|---------|--------|--------|
| 1 | Bug fixes + server restart + smoke test | Done / 30 min | Today |
| 2 | UI redesign: single-column focused chat | 3 hrs | Today/Tomorrow |
| 3 | Chat→DB extraction (Lori learns while chatting) | 4 hrs | This week |
| 4 | Guided interview topics sidebar | 2 hrs | This week |
| 5 | Family tree interview mode | 6 hrs | Next week |
| 6 | Memoir generation | 4 hrs | Next week |

---

## Immediate Next Step

After Chris restarts the server:
1. Claude runs smoke test to confirm Bug 1–4 fixes
2. Claude builds `ui/6.4.html` — the clean single-column layout
3. Chris does a live interview pass with the new UI: just talks to Lori naturally
4. We watch together what gets captured vs. what doesn't → informs Phase 3 extraction design

---

## Key Design Principles for v6.4+

- **Lori does the work.** The user just talks. Everything else (DB, profile, memoir) happens behind the scenes.
- **No visible interview machinery.** No question numbers, no progress bars, no "Section 3 of 13." Just conversation.
- **Accumulative, not sequential.** Lori can learn your date of birth in turn 2 or turn 47 — it doesn't matter.
- **Warm and unhurried.** Lori never feels like a form. She follows the conversation.
- **Family is first-class.** Relatives are real people in the DB, not just text in a notes field.

---

*Plan drafted by Claude (Cowork) · 2026-03-11*
