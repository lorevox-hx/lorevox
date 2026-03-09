# Lorevox v5.0 — Sandbox Audit Report

**Date:** 2026-03-08
**Method:** Local HTTP server (port 7070) + full static analysis against live backend code
**Files reviewed:** `ui/5.0.html`, all router files under `server/code/api/routers/`

---

## What Works Well ✓

| Feature | Status | Notes |
|---------|--------|-------|
| HTML structure | ✓ Perfect | Zero unclosed tags, 6 tabs, clean grid layout |
| Tailwind + fonts load | ✓ | CDN imports valid |
| Generation detection (DOB → Silent/Boomer/GenX etc.) | ✓ | Logic correct |
| Age badge + generation badge on Profile | ✓ | Fires correctly on DOB change |
| 25-section interview roadmap | ✓ | All 25 sections correct, emojis, tags |
| 61 world events embedded | ✓ | 1929–2023, split across WORLD_EVENTS + EVERYDAY_EVENTS |
| Age-anchored event filtering (age 5–100) | ✓ | Correct math |
| Category filter chips | ✓ | All 8 filters wired |
| Click-event → memory trigger question in chat | ✓ | fireEventPrompt() correct |
| Context triggers panel in Interview tab | ✓ | Matches roadmap section tags to events |
| Pets section (add/remove/notes) | ✓ | Full row editing works |
| Deceased flag on family members | ✓ | Excluded from obituary survivors |
| Memoir chapter list (25 chapters) | ✓ | Chapter done/pending status |
| Memoir outline generator | ✓ | Builds text outline correctly |
| Obituary auto-fill from profile | ✓ | Uses name, DOB, POB, kinship |
| Tab switching | ✓ | All 6 tabs toggle correctly |
| TTS queue (chunked audio) | ✓ | Matches 4.10 pattern |
| Browser voice input (Web Speech API) | ✓ | Toggle mic, stop/start |
| Offline error handling | ✓ | Sysbubble on every catch block |
| Demo fill (Chris's data) | ✓ | Fills all fields including DOB |

---

## Bugs — Will Break Functionality 🔴

### Bug 1: `doChat()` sends wrong API shape
**Where:** `doChat()` line ~1152
**Problem:** Sends `{message: msg, conv_id, person_id, section}` but `/api/chat` expects `{messages: [{role:"user", content:...}], conv_id, section}`
**Also:** Reads `j.reply` from the response but `/api/chat` returns `{ok:true, text:"..."}` — so `reply` is always `""` and nothing appears in chat.
**Fix:**
```js
// Change body to:
const body = {
  messages: [{role:"user", content:msg}],
  conv_id: state.chat.conv_id || null,
  section: INTERVIEW_ROADMAP[sectionIndex]?.id || null
};
// Change response read to:
const reply = j.text || j.reply || "";
```

### Bug 2: WebSocket URL is wrong
**Where:** `connectWebSocket()` line ~1180
**Problem:** Connects to `/ws/stream` — endpoint doesn't exist.
**Actual endpoint:** `/api/chat/ws` (prefix `/api/chat` + route `/ws`)
**Also:** Message format mismatch. Backend expects `{type:"start_turn", session_id, message, params}` — UI just sends streaming tokens blindly.
**Fix:**
```js
// Change:
const wsUrl = (ORIGIN.replace(/^http/,"ws")) + "/ws/stream";
// To:
const wsUrl = (ORIGIN.replace(/^http/,"ws")) + "/api/chat/ws";

// And change WS send to:
ws.send(JSON.stringify({
  type: "start_turn",
  session_id: state.chat.conv_id || "default",
  message: msg,
  params: { person_id: state.person_id, max_new_tokens: 512 }
}));
```

### Bug 3: Sessions URL wrong
**Where:** `API.SESSIONS` constant
**Problem:** Set to `ORIGIN + "/api/sessions"` — actual endpoint is `/api/sessions/list`
**Fix:**
```js
SESSIONS: ORIGIN + "/api/sessions/list",
```

### Bug 4: Timeline fetch URL wrong
**Where:** `renderTimeline()`, `API.TIMELINE`
**Problem:** Calls `GET /api/timeline/${person_id}` — actual endpoint is `GET /api/timeline/list?person_id=X`
**Fix:**
```js
// Change API constant:
TIMELINE: (id) => `${ORIGIN}/api/timeline/list?person_id=${id}`,
// Change renderTimeline fetch:
const r = await fetch(API.TIMELINE(state.person_id));
// and read: j.items (not j.events)
const events = j.items || [];
```

### Bug 5: `ivStart()` sends wrong field and misreads response
**Where:** `ivStart()` line ~1073
**Problem (send):** Sends `{person_id, section:...}` but `StartInterviewRequest` expects `{person_id, plan_id:"default"}`
**Problem (read):** Reads `j.question_id` and `j.prompt` directly — but response is `{session_id, person_id, plan_id, question: {id, section_id, ord, prompt}}`
**Fix:**
```js
body: JSON.stringify({person_id: state.person_id, plan_id:"default"})
// then read:
state.interview = {
  session_id: j.session_id,
  question_id: j.question?.id,
  prompt: j.question?.prompt,
  person_id: state.person_id
};
```

### Bug 6: `processInterviewAnswer()` misreads next question
**Where:** `processInterviewAnswer()` line ~1085
**Problem:** Reads `j.next.question_id` and `j.next.prompt` — actual response key is `j.next_question.id` and `j.next_question.prompt`
**Fix:**
```js
if(j.next_question) {
  state.interview.question_id = j.next_question.id;
  state.interview.prompt = j.next_question.prompt;
}
// Also handle j.done and j.generated_summary (not j.summary_text)
if(j.generated_summary) appendOutput("📝 Section Summary", j.generated_summary);
```

### Bug 7: `hydrateOrCreateChatSession()` calls wrong endpoint
**Where:** `hydrateOrCreateChatSession()` line ~1158
**Problem:** POSTs to `/api/chat` with `{title, conv_id:null}` to create a session — but `/api/chat` is the LLM chat endpoint, not a session manager. It will try to run inference with no messages and fail.
**Fix:** Use the actual session creation endpoint:
```js
const r = await fetch(ORIGIN + "/api/session/new", {
  method:"POST", headers:{"Content-Type":"application/json"},
  body: JSON.stringify({title:"Lorevox Session"})
});
// returns {conv_id, session_id, title}
```

### Bug 8: `loadSession()` uses wrong URL
**Where:** `loadSession()` line ~1131
**Problem:** Calls `GET /api/chat/${cid}` — no such endpoint.
**Fix:** Use the turns endpoint:
```js
const r = await fetch(`${ORIGIN}/api/session/turns?conv_id=${cid}`);
// returns {conv_id, items:[{role,content,...}], turns:[...]}
const msgs = j.items || j.turns || [];
```

---

## Warnings — Silent Failures 🟡

| # | Warning | Impact |
|---|---------|--------|
| W1 | `processInterviewAnswer()` checks `!state.interview.question_id` as gate — but after Bug 5 fix, this may prevent the gate from firing initially | Low |
| W2 | Auto-fill `setv("ivAnswer", msg)` fills the interview answer with the **user's typed message**, not Lori's reply — should be `setv("ivAnswer", reply)` | Medium |
| W3 | `generateObitChat()` and `generateMemoirDraft()` load prompts into the chat input but never call `sendChat()` — user must click Send manually. This is actually by design but worth noting | Low (by design) |
| W4 | `onDobChange()` reads `getv("bio_dob")` which is correct on the profile form, but when a person is **loaded from API** and the form isn't re-rendered yet, the badge won't update until `hydrateProfileForm()` fires | Low |
| W5 | `buildObituary()` is called from `window.onload` before any person is selected — generates a blank template, fine, but `setv("obit_age")` runs without error (returns empty string) | Trivial |
| W6 | `refreshSessions()` parses sessions but `sessions.router` returns `{items, sessions}` — UI reads `j.sessions||j||[]` correctly. Fine. | OK |

---

## UX Issues 🟠

| # | Issue | Severity |
|---|-------|----------|
| U1 | **No session init on boot** — because `hydrateOrCreateChatSession()` fails (Bug 7), there is no `conv_id` when the page loads. Chat works in memory but nothing persists. | High |
| U2 | **Interview tab doesn't auto-switch** when roadmap section is clicked from sidebar — user has to manually click the Interview tab | Low |
| U3 | **Obituary "Generate via Lori" button** loads the prompt but chat input focus is on the Interview tab pane, so user might not see it was loaded | Medium |
| U4 | **World Events tab** — when no person is selected, all 61 events show with no age column, which is a bit noisy. A "select a person first" empty state would be cleaner | Low |
| U5 | **Memoir generate button** currently checks `sectionDone` array but `sectionDone` is in-memory only — if the page refreshes, all sections reset to undone even if interviews are complete | Medium |
| U6 | **No "Save Profile" reminder** — if user fills profile and forgets to save before starting interview, no warning fires | Low |

---

## What Works Perfectly (No Changes Needed) ✓

- All 6 tabs render and toggle cleanly
- DOB → generation badge → age display chain
- 61 world events + age calculator
- Category filter chips with toggle state
- Click-to-prompt event system (fires question into chat input)
- Context triggers in Interview tab (matches section tags to events)
- Pet rows (add/remove/edit)
- Kinship rows with deceased flag
- Family map → obituary survivors (excludes deceased)
- Memoir chapter list tied to `sectionDone[]`
- Generation detection math
- TTS queue and voice input
- Demo fill (Chris, 1962-12-24, Williston ND)
- All 25 roadmap sections render in sidebar with checkbox + progress

---

## Action Plan

### Priority 1 — Fix All 8 Bugs (v5.1 patch, ~60 min)

These are targeted surgical fixes. Nothing architectural needs to change.

| Fix | Change |
|-----|--------|
| F1 | `doChat()`: change body shape + read `j.text` |
| F2 | `connectWebSocket()`: fix URL + fix WS message format to `{type:"start_turn",...}` |
| F3 | `API.SESSIONS`: `/api/sessions/list` |
| F4 | `API.TIMELINE`: use query param pattern |
| F5 | `ivStart()`: send `plan_id:"default"`, read `j.question.id` + `j.question.prompt` |
| F6 | `processInterviewAnswer()`: read `j.next_question.id`, `j.next_question.prompt`, `j.generated_summary` |
| F7 | `hydrateOrCreateChatSession()`: POST to `/api/session/new` |
| F8 | `loadSession()`: GET `/api/session/turns?conv_id=X`, read `j.items` |

### Priority 2 — UX Improvements (v5.2, ~45 min)

- U1: Auto-route to Interview tab when a roadmap section is clicked
- U5: Persist `sectionDone` to localStorage (keyed by person_id) so page refresh doesn't reset
- U2: Add "Tip: fill profile and click Save before starting interview" guidance text
- U4: World Events tab — show "Select a person on the Profile tab to enable age context" when no person loaded

### Priority 3 — New Features (v5.3+)

These were discussed and are ready to implement:

1. **`world_events.json` file** — move the embedded event databases to `memory/cultural_events.json` so the server can use them too for LLM prompt injection
2. **Interview answer persistence** — when Lori answers in chat, auto-extract and save key facts via `/api/timeline/add`
3. **Profile summary sidebar** — show name + generation + age + completed section count below the People list
4. **Print/export** — Memoir and Obituary tabs get a print-ready CSS stylesheet and PDF export button
5. **Media upload** — Profile tab gets a photo upload area wired to `/api/media/upload`

---

## Bug Fix Summary Table

| Bug | File | Line(s) | Root Cause | Fix Complexity |
|-----|------|---------|-----------|----------------|
| Chat body shape | 5.0.html | ~1152 | API expects messages array not single message field | 3 lines |
| Chat response key | 5.0.html | ~1154 | API returns `text`, UI reads `reply` | 1 line |
| WebSocket URL | 5.0.html | ~1180 | Wrong path `/ws/stream` vs `/api/chat/ws` | 1 line |
| WebSocket format | 5.0.html | ~1180 | Missing `{type:"start_turn"}` wrapper | 5 lines |
| Sessions URL | 5.0.html | ~257 | Missing `/list` suffix | 1 line |
| Timeline URL | 5.0.html | ~261 | Path param vs query param | 2 lines |
| ivStart body | 5.0.html | ~1076 | Sends `section` not `plan_id` | 2 lines |
| ivStart response | 5.0.html | ~1074 | Reads `j.question_id` not `j.question.id` | 2 lines |
| Interview answer next | 5.0.html | ~1085 | Reads `j.next` not `j.next_question` | 3 lines |
| Session creation | 5.0.html | ~1158 | Wrong endpoint | 3 lines |
| Session load | 5.0.html | ~1131 | Wrong endpoint + response key | 3 lines |
| ivAnswer fill | 5.0.html | ~1157 | Fills user message not AI reply | 1 line |

**Total: ~27 lines changed to fix all bugs.**
