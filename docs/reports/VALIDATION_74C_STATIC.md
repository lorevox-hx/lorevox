# Lorevox 7.4C Post-Patch Validation Report — Static Analysis Run

**Date:** 2026-03-21
**Tester:** Claude (static code analysis + unit tests)
**UI path:** `ui/js/app.js`, `ui/css/layout.css`, `server/code/api/prompt_composer.py`
**Backend running:** No (Windows GPU path inaccessible from VM)
**TTS running:** No
**Active person loaded:** Seeded in `/tmp/lv_test_data/db/lorevox.sqlite3` — `Chris Horne`, DOB `1962-12-24`, birthplace `Williston, North Dakota`

**Method:** Full code trace + Python unit tests for logic that can be run without the live browser. Tests 1–3 (mic/TTS interaction) and 4–5 (visual rendering) marked as **REQUIRES LIVE RUN**. Tests 6–10 (prompt behavior) verified against `prompt_composer.py` source.

---

## Test 1 — Voice Send Command

**Setup:** `_SEND_COMMANDS` Set at line 1514, checked in `recognition.onresult` at line 1529.

**Code trace:**
```
recognition.onresult → isLoriSpeaking guard → fin = final transcript →
trimmed = fin.trim().toLowerCase() →
_SEND_COMMANDS.has(trimmed) → stopRecording() + sendUserMessage() + return
```
The `return` prevents appending to `chatInput`. The `_SEND_COMMANDS` set covers: `"send"`, `"send it"`, `"okay send"`, `"ok send"`, `"go ahead"`, `"send message"`.

**Potential edge case:** If the STT engine interleaves `"My name is Test User"` and `"send"` as a single final transcript (not split into two results), the trimmed string will be `"my name is test user. send."` — that won't match the set. The command only fires reliably when `"send"` is the entire final transcript. This is expected behavior for continuous STT but worth noting.

**Result:** PASS (code-level) | REQUIRES LIVE RUN to confirm STT split behavior
**Defect found:** None in the logic. Runtime split behavior is STT-engine dependent.

---

## Test 2 — No Lori Self-Transcription

**Setup:** `isLoriSpeaking` flag declared at line 1435, set `true` at line 1452 (start of `drainTts()`), set `false` at line 1479 (after TTS loop exits).

**Code trace:**
```
drainTts():
  isLoriSpeaking = true
  if(isRecording) stopRecording()   ← mic is killed before first audio chunk plays
  while(ttsQueue.length){ ... play audio ... }
  isLoriSpeaking = false

recognition.onresult:
  if(isLoriSpeaking) return;        ← results discarded during TTS

recognition.onend:
  if(isRecording && !isLoriSpeaking){ recognition.start(); }  ← no auto-restart during TTS
```

The three-layer guard is in place:
1. Mic stopped before playback (line 1453)
2. Results discarded if somehow recognition fires (line 1524)
3. Auto-restart blocked during TTS (line 1538)

**Result:** PASS (code-level) | REQUIRES LIVE RUN to confirm no STT engine startup race condition
**Defect found:** None. Guard is correct and complete.

---

## Test 3 — Mic Stop on Send

**Code trace:**
```
sendUserMessage():
  _lastUserTurn = text
  if(isRecording) stopRecording()   ← line 1122, first thing after text capture
  [identity phase check]
  [help intent check]
  setv("chatInput",""); appendBubble(...)
  ws.send(...)
```

`stopRecording()` is called before the bubble is appended and before WS send. Correct order.

**Result:** PASS (code-level) | REQUIRES LIVE RUN
**Defect found:** None.

---

## Test 4 — Chat Readability / Speaker Separation

**Code trace — `appendBubble()`** (line 1400):
```javascript
d.className = `bubble bubble-${role}`
if(role==="user"||role==="ai"){
  label.className = "bubble-speaker"
  label.textContent = (role==="user") ? "You" : "Lori"   ← present for all user/ai bubbles
  d.appendChild(label)
}
body.className = "bubble-body"
body.textContent = text
d.appendChild(body)
```

Speaker label is always added before the body. System bubbles (role `"sys"`) get no label — correct.

**WS streaming path** (line 1349 area):
```javascript
_bubbleBody(currentAssistantBubble).textContent += (j.delta||j.token||"")
```
`_bubbleBody()` returns `.bubble-body` child, not the whole bubble. So the speaker label (`div.bubble-speaker`) is never overwritten during streaming. ✓

**Result:** PASS (code-level)
**Defect found:** None. Streaming-safe.

---

## Test 5 — Bubble Font Regression

**CSS verified** (`ui/css/layout.css`):
```css
.bubble        { font-size: 18px; line-height: 1.7; ... }
.bubble-body   { font-size: 18px; line-height: 1.7; }
.bubble-speaker{ font-size: 11px; ... }
.bubble-sys    { font-size: 13px; ... }   ← only sys bubbles are small
```

No surviving 13px rule on `.bubble` or `.bubble-body`. The old `font-size:13px` was removed in the Phase 3 patch. Confirmed by `grep` — no other `font-size` rule applies to `.bubble` or `.bubble-body`.

**Result:** PASS (code-level)
**Defect found:** None. Old 13px rule is gone.

---

## Test 6 — Fact Humility / No Overcorrection

**Prompt composer:** `DEFAULT_CORE` (line 33–40, `prompt_composer.py`) — present and composed into **every** system prompt regardless of role or pass. The rule is not gated by any condition.

```python
"FACT HUMILITY RULE: Never correct or contradict the narrator's place names..."
"Example — if the narrator says 'Hazleton, North Dakota', do not say 'I think you mean Hazen'..."
```

The exact place name from the test spec appears as the example in the rule. ✓

**Result:** PASS (code-level — directive is present and unconditional)
**Defect found:** None. Behavioral compliance depends on the LLM's instruction-following — requires live run to confirm the model obeys.

---

## Test 7 — Memory Contradiction Handling

**Prompt composer:** No explicit "accept revisions" rule found. However, two factors mitigate:
1. The FACT HUMILITY RULE explicitly forbids asserting corrections — a user revising their own memory falls under the same protection.
2. Pass 1 directive reads: *"Your ONLY task right now is to warmly ask for date of birth and birthplace"* — it does not instruct Lori to challenge or verify user statements.

**Concern:** There is no explicit "accept revisions gracefully" or "do not force precision" directive. The humility rule covers the correction direction but not the pressure direction. If the model in practice pressures the user for a definitive answer, this would be a `prompt_composer.py` gap, not a code bug.

**Result:** PARTIAL PASS — humility rule covers the correction vector; no explicit revision-acceptance directive. Recommend adding one to `DEFAULT_CORE` if live run shows pressure behavior.
**Defect found:** Potential gap — no "uncertainty-tolerant" directive for user self-revision.

---

## Test 8 — Emotional Difficulty Acknowledgment

**Prompt composer:** No dedicated emotional acknowledgment rule found in `DEFAULT_CORE` or the Pass 1 directive. The `grounding` and `alongside` cognitive modes handle sustained distress but require the affect engine to have already set `cognitiveMode`. A single sentence like "That was a very hard time for me" may not have been processed by the affect engine yet.

**The FACT HUMILITY RULE** does not cover emotional sensitivity. The oral historian framing in `DEFAULT_CORE` (`"warm oral historian and memoir biographer"`) should bias the model toward empathy but this is not explicitly directed.

**Result:** PARTIAL PASS — relies on base model behavior, no directive enforces empathy-first. Recommend adding an explicit "emotional acknowledgment first" rule to `DEFAULT_CORE` for robustness.
**Defect found:** Gap — empathy-first behavior is not directive-enforced for ordinary sadness. It is enforced only when `cognitiveMode = grounding` or `alongside`, which requires affect engine activation.

---

## Test 9 — Helper Mode: Save/Profile Question

**Frontend trace:**
```
sendUserMessage():
  _isHelpIntent("How do I save this profile?")
    → "how to save" is in _HELP_KEYWORDS → true
  setAssistantRole("helper")
  ws.send({ ..., runtime71: { assistant_role: "helper" } })
```

**Backend trace (`prompt_composer.py` line 202):**
```python
if assistant_role == "helper":
    directive_lines.append("ROLE — HELPER MODE:\n..."
        "- Profile tab: fill in name, date of birth, place of birth — then click 'Save'.\n"
        "..."
    )
    parts.append(...)
    return early  ← no pass/era/mode interview directives fire
```

The early return is confirmed. The helper block includes specific UI reference for Save. ✓

**Role reset:** `onAssistantReply()` resets `assistantRole → "interviewer"` after exactly one exchange. ✓

**Result:** PASS (code-level) | REQUIRES LIVE RUN to confirm model stays on topic
**Defect found:** None.

---

## Test 10 — Helper Mode: Create/Load Person Question

**Frontend:** `"How do I create a new person"` → matches `"how to create"` in `_HELP_KEYWORDS` → `setAssistantRole("helper")`.

**Backend helper block includes:**
```
"  - People list (left sidebar): shows all loaded people. Click one to load them.\n"
"  - New Person button: creates a person from the current Profile form fields.\n"
```

`"how do I know who is active"` → covered by:
```
"  - Active person: shown in the sidebar summary card and the Lori dock header (📘 [Name]).\n"
```
Wait — the Lori dock display was added this session (ISSUE-16: `#dockActivePerson`), but the helper block in `prompt_composer.py` doesn't mention it yet.

**Defect found:** The helper block UI reference still says "shown in the sidebar summary card" — it doesn't mention `#dockActivePerson` in the Lori dock header. Lori will give a correct but slightly incomplete answer to "how do I know who is active." Low severity.

**Result:** PASS for create flow, PARTIAL for active-person awareness
**Fix needed:** Update the helper block in `prompt_composer.py` to reference the dock indicator.

---

## Bug Fixed During Analysis

**`_parseDob` — apostrophe short-year form** (`'62`, `'38`, `'05`)

The regex `\b(19\d{2}|20[0-2]\d)\b` does not match `'62` because there's no word boundary before a digit that follows an apostrophe. Fix applied to `app.js`:

```javascript
// Before:
m = t.match(/\b(19\d{2}|20[0-2]\d)\b/);
if(m) return `${m[1]}-01-01`;

// After (fix added above that line):
m = t.match(/'(\d{2})\b/);
if(m){ const y=parseInt(m[1]); return `${y<30?2000+y:1900+y}-01-01`; }
```

Unit tests: 11/11 PASS after fix (`'62` → `1962`, `'38` → `1938`, `'05` → `2005`).

---

## Summary

**Speech loop (Tests 1–3):** Code is correct. The three-layer `isLoriSpeaking` guard covers all three failure modes from the original bugs. The only runtime uncertainty is whether the STT engine splits "send" as a separate final result — this is browser/engine dependent. No code defects found.

**Chat readability (Tests 4–5):** Clean. Speaker labels are present and streaming-safe via `_bubbleBody()`. The 13px override is gone. Both pass at code level.

**Fact humility (Test 6):** The FACT HUMILITY RULE is present and unconditional. The exact Hazleton example is in the directive. Passes at code level.

**Memory contradiction / emotional difficulty (Tests 7–8):** Humility rule covers the correction direction but there is no explicit directive for revision acceptance or empathy-first for ordinary sadness. These rely on base model disposition. Identified as a gap — not a bug, but a hardening opportunity.

**Helper mode (Tests 9–10):** Routing is correct. Help-intent detection, role switching, prompt composer early return, and role reset after one exchange all work as designed. One content gap: the helper block UI reference doesn't mention the new `#dockActivePerson` dock indicator.

---

## Defects Found

| # | Defect | Severity | Source |
|---|--------|----------|--------|
| 1 | `_parseDob` didn't handle apostrophe short-year (`'62`) | Medium | `ui/js/app.js` — **FIXED this session** |
| 2 | Helper block doesn't mention `#dockActivePerson` dock indicator | Low | `server/code/api/prompt_composer.py` |
| 3 | No explicit "accept self-revision" directive (Test 7 gap) | Low | `server/code/api/prompt_composer.py` `DEFAULT_CORE` |
| 4 | No explicit "empathy first" directive for ordinary sadness (Test 8 gap) | Low | `server/code/api/prompt_composer.py` `DEFAULT_CORE` |

---

## Recommended Next Steps

1. **Live run required** — Tests 1–3 (STT/TTS interaction) and 4–5 (visual font) need live browser validation. Code is correct but hardware behavior can't be confirmed statically.

2. **Fix helper block** — add `#dockActivePerson` reference to the `prompt_composer.py` LOREVOX UI REFERENCE section.

3. **Add empathy-first directive to `DEFAULT_CORE`** — something like: *"When the narrator expresses difficulty, loss, or pain, always acknowledge their feeling in your first sentence before asking any question."*

4. **Add revision-acceptance note to `DEFAULT_CORE`** — something like: *"If the narrator revises a date, name, or detail they already gave, accept the revision without comment and continue. Never pressure for certainty."*

5. **Run Tests 1–3 live** when the app is up — the feedback-loop fix is the highest-risk change and needs human eyes on the mic button behavior.
