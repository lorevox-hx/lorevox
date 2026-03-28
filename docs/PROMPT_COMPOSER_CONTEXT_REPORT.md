# PROMPT_COMPOSER_CONTEXT_REPORT.md
## Prompt Composer Context Wiring — Ship Report

**Date**: 2026-03-27
**Status**: Complete. Three context fields now wired end-to-end.

---

## What Was Missing

The `MEANING_ENGINE_POSTSHIP_REPORT.md` identified one remaining architectural gap:

> "The frontend sends `device_context` and `location_context` in the WebSocket payload. The backend accepts these fields but does not yet use them."

The meaning engine's `memoir_context` was also not yet in the payload at all.

This pass closes all three.

---

## Data Flow (Before and After)

```
buildRuntime71()  →  WebSocket payload  →  chat_ws.py  →  compose_system_prompt()  →  LLM
```

**Before this pass:**

| Field | Sent? | Used in prompt? |
|---|---|---|
| `device_context` (date/time/timezone) | ✅ since Step 3 | ❌ no |
| `location_context` (city/region) | ✅ since Step 3 | ❌ no |
| `memoir_context` (arc coverage, state) | ❌ not sent | ❌ no |

**After this pass:**

| Field | Sent? | Used in prompt? |
|---|---|---|
| `device_context` | ✅ | ✅ yes |
| `location_context` | ✅ | ✅ when consented |
| `memoir_context` | ✅ | ✅ when threads/draft |

---

## Changes Made

### 1. `buildRuntime71()` — `ui/js/app.js`

Added `memoir_context` to the runtime payload:

```javascript
memoir_context: (function() {
  try {
    const mState = (typeof _memoirState !== "undefined") ? _memoirState : "empty";
    const content = document.getElementById("memoirScrollContent");
    const arcRoles = content
      ? [...new Set(
          Array.from(content.querySelectorAll("mark.new-fact[data-narrative-role]"))
            .map(m => m.dataset.narrativeRole).filter(Boolean)
        )]
      : [];
    const meaningTags = content
      ? [...new Set(
          Array.from(content.querySelectorAll("mark.new-fact[data-meaning-tags]"))
            .flatMap(m => (m.dataset.meaningTags || "").split(",").map(t => t.trim()).filter(Boolean))
        )]
      : [];
    return { state: mState, arc_roles_present: arcRoles, meaning_tags_present: meaningTags };
  } catch (_) {
    return { state: "empty", arc_roles_present: [], meaning_tags_present: [] };
  }
})(),
```

Reads from the memoir panel DOM on every turn. Falls back to empty state on error.

---

### 2. Mark rendering bug fix — `ui/lori8.0.html`

Found and fixed a latent bug in `_memoirLoadStoredFacts()`:

The loop over `items` destructured only `{ text }`, leaving `fact` undefined:
```javascript
// Bug: fact is undefined
for (const { text } of items) {
  mark.setAttribute("data-narrative-role", fact.narrative_role || "");
```

This meant `data-narrative-role` was always empty for stored facts, so `arc_roles_present` in `memoir_context` would always be empty on reload.

Fix:
```javascript
// Fixed: { text, fact: itemFact }
for (const { text, fact: itemFact } of items) {
  mark.setAttribute("data-narrative-role", itemFact?.narrative_role || "");
  mark.setAttribute("data-meaning-tags", tags.join(","));
```

Also added `data-meaning-tags` attribute to each mark so the `meaning_tags_present` read works correctly.

---

### 3. `compose_system_prompt()` — `server/code/api/prompt_composer.py`

Three new blocks added to the LORI_RUNTIME directive:

#### A. Device time

```
LORI_RUNTIME:
  ...
  device_time: Friday, March 27, 2026, 2:34 PM (America/Chicago)
    # Use this as your sense of 'today' and 'now'. Do not use your training cutoff date.
```

Fires when `device_context.date` or `device_context.time` is present. Always present — `buildRuntime71()` computes them fresh on every call.

**What this fixes**: Without this, Lori had no reliable sense of the current date. She would sometimes say "as of my last update" or use an incorrect year when the narrator asked date-relative questions ("how old am I now?", "what year is it?"). Now she reads the correct date from the device.

#### B. Narrator location

```
LORI_RUNTIME:
  ...
  narrator_location: Chicago, Illinois
    # Optional context only — do not bring it up unless relevant to their story.
```

Fires only when `location_context` is non-null (narrator has consented). Suppressed entirely when location is not shared.

**What this fixes**: When a narrator has shared location, Lori can acknowledge regional context naturally ("You mentioned growing up in the Midwest — that time sounds like it was…"). Without this, location data sat in the session but Lori had no access to it.

#### C. Memoir narrative arc guidance

```
LORI_RUNTIME:
  ...
  memoir_arc_covered: Who the narrator was before, What was at stake / the struggle
  memoir_arc_gaps: What first disrupted things; The irreversible moment
    # These narrative parts are not yet in the memoir. When natural, ask questions that
    # could surface this material. Do not force it — follow the narrator's lead.
  memoir_emotional_themes: stakes, vulnerability
    # These themes have emerged. Handle with care and appropriate depth.
```

Fires when `memoir_state` is `threads` or `draft`. Silent when panel is `empty`.

**What this fixes**: Previously Lori had no visibility into what the narrator has already told her (across the whole memoir, not just the current turn). She might ask for birthplace details the narrator already shared, or miss an obvious inciting incident gap. Now the prompt tells her which arc parts are covered and which are missing — enabling proactive but non-intrusive narrative gap-filling.

**Design discipline**: The arc gap injection is limited to two items maximum to avoid directive bloat. The instruction explicitly says "follow the narrator's lead" — this is guidance, not a mandatory redirect.

---

## Behavioral Examples

### Device time in use

**Before**: "What year is it? Well, as of my last training data, it's..."
**After**: Lori knows it's Friday March 27, 2026. She can say "You mentioned retiring thirty years ago — that would have been around 1996."

### Location in use (when consented)

**Before**: Lori treats every narrator as geographically placeless.
**After**: "I can see you're in Chicago — did your story begin there, or somewhere else?"

### Arc gap guidance in use

**After a narrator describes childhood and work (setup, escalation) but no inciting incident:**

Before this wiring: Lori might ask another setup question ("Tell me more about your school days").
After: The prompt now includes `memoir_arc_gaps: What first disrupted things`. Lori is guided toward: "Was there a particular moment that set your life in a different direction?"

---

## Constraints Respected

- Location is never injected without consent (`location_context` is null when denied)
- Arc guidance is suppressed in `empty` state (no memoir material to reason about)
- Arc gap list capped at 2 entries to avoid overwhelming the system prompt
- All three blocks are additive — no existing directive behavior is removed
- The `memoir_arc_gaps` directive explicitly says "follow the narrator's lead" — no forcing

---

## Files Changed

| File | Change |
|---|---|
| `ui/js/app.js` | `memoir_context` added to `buildRuntime71()` |
| `ui/lori8.0.html` | Bug fix: `{ text, fact: itemFact }` destructuring; `data-meaning-tags` attribute added |
| `server/code/api/prompt_composer.py` | `device_time`, `narrator_location`, `memoir_arc_covered`, `memoir_arc_gaps`, `memoir_emotional_themes` injected into LORI_RUNTIME block |

---

## What This Closes

The `MEANING_ENGINE_POSTSHIP_REPORT.md` identified this as the one remaining architectural gap:

> "Backend does not forward meaning fields to `prompt_composer.py`"

That gap is now closed. The full chain is:

```
narrator's session → extraction + meaning detection → memoir panel → DOM attributes
  → buildRuntime71() reads DOM → WebSocket payload → prompt_composer.py → LLM prompt
```

Lori now knows:
- What day and time it is on the narrator's computer
- Where the narrator is (when consented)
- What the narrator has already told her (memoir arc coverage)
- What narrative territory she hasn't yet explored
- What emotional themes have surfaced
