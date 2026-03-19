# FATIGUE_RUNTIME71_PATCH_AND_TESTS_7_8.md

## Purpose

This patch note fixes the defect found in the live Claude validation report:

- `setLoriState('high_fatigue')` updated only the UI badge
- it did **not** update the runtime state used to build `runtime71`
- so fatigue never reached the prompt composer
- therefore the model never received fatigue-aware instructions

This note includes:
1. the exact `setLoriState()` + `runtime71` patch
2. the validation steps for the fatigue fix
3. two new live tests for the next Claude run:
   - Test 7 — Emotional difficulty
   - Test 8 — Memory contradiction handling

---

# 1. Patch: `ui/js/app.js`

## A. Add helper: `normalizeLoriState()`
Add this near the other runtime helpers.

```javascript
function normalizeLoriState(input) {
  const raw = String(input || "").trim().toLowerCase();

  const map = {
    ready: {
      badge: "Ready",
      affectState: "neutral",
      affectConfidence: 0,
      cognitiveMode: "open",
      fatigueScore: 0,
    },
    open: {
      badge: "Open",
      affectState: "neutral",
      affectConfidence: 0,
      cognitiveMode: "open",
      fatigueScore: 0,
    },
    recognition: {
      badge: "recognition",
      affectState: "confusion_hint",
      affectConfidence: 0.65,
      cognitiveMode: "recognition",
      fatigueScore: Math.max(Number(state?.runtime?.fatigueScore || 0), 20),
    },
    grounding: {
      badge: "grounding",
      affectState: "distress_hint",
      affectConfidence: 0.8,
      cognitiveMode: "grounding",
      fatigueScore: Math.max(Number(state?.runtime?.fatigueScore || 0), 40),
    },
    light: {
      badge: "light",
      affectState: "fatigue_hint",
      affectConfidence: 0.6,
      cognitiveMode: "light",
      fatigueScore: Math.max(Number(state?.runtime?.fatigueScore || 0), 60),
    },
    high_fatigue: {
      badge: "high_fatigue",
      affectState: "fatigue_hint",
      affectConfidence: 0.9,
      cognitiveMode: "light",
      fatigueScore: 80,
    },
  };

  return map[raw] || map.ready;
}
```

---

## B. Add helper: `buildRuntime71()`
Use this helper everywhere a `start_turn` payload is built.

```javascript
function buildRuntime71() {
  return {
    current_pass: state?.session?.currentPass || "pass1",
    current_era: state?.session?.currentEra || null,
    current_mode: state?.session?.currentMode || "open",
    affect_state: state?.runtime?.affectState || "neutral",
    affect_confidence: Number(state?.runtime?.affectConfidence || 0),
    cognitive_mode: state?.runtime?.cognitiveMode || "open",
    fatigue_score: Number(state?.runtime?.fatigueScore || 0),
  };
}
```

---

## C. Replace `setLoriState()` with this version

```javascript
function setLoriState(nextState) {
  const norm = normalizeLoriState(nextState);

  if (!state.runtime) state.runtime = {};
  if (!state.session) state.session = {};

  // Persist real runtime values used by runtime71 -> backend -> prompt composer
  state.runtime.affectState = norm.affectState;
  state.runtime.affectConfidence = norm.affectConfidence;
  state.runtime.cognitiveMode = norm.cognitiveMode;
  state.runtime.fatigueScore = norm.fatigueScore;

  // Keep session mode aligned with runtime mode
  state.session.currentMode = norm.cognitiveMode;

  // Existing UI badge/status update
  const loriStatus = document.getElementById("loriStatus");
  if (loriStatus) {
    loriStatus.textContent = `● ${norm.badge}`;
    loriStatus.className = `lori-status ${norm.badge}`;
  }

  // Update 7.1 runtime UI
  if (typeof update71RuntimeUI === "function") {
    update71RuntimeUI();
  }
  if (window.LORI71 && typeof window.LORI71.updateBadges === "function") {
    window.LORI71.updateBadges();
  }
  if (window.LORI71 && typeof window.LORI71.updateDebugOverlay === "function") {
    window.LORI71.updateDebugOverlay();
  }

  console.log("[Lori 7.1] setLoriState -> runtime =", {
    affectState: state.runtime.affectState,
    affectConfidence: state.runtime.affectConfidence,
    cognitiveMode: state.runtime.cognitiveMode,
    fatigueScore: state.runtime.fatigueScore,
  });
}
```

---

## D. In both `start_turn` WebSocket send paths, use `buildRuntime71()`

Replace ad hoc runtime objects with:

```javascript
const payload = {
  type: "start_turn",
  message: userText,
  params: {
    person_id: state.person_id,
    session_id: state.interview?.session_id,
    runtime71: buildRuntime71(),
  }
};

console.log("[Lori 7.1] runtime71 -> model:", payload.params.runtime71);
ws.send(JSON.stringify(payload));
```

Do this in **both** `start_turn` send paths.

---

# 2. What this fixes

Before:
- `setLoriState('high_fatigue')` changed only the badge

After:
- `setLoriState('high_fatigue')` updates:
  - `state.runtime.affectState = "fatigue_hint"`
  - `state.runtime.affectConfidence = 0.9`
  - `state.runtime.cognitiveMode = "light"`
  - `state.runtime.fatigueScore = 80`
- then `buildRuntime71()` includes those values
- then `runtime71` reaches `chat_ws.py`
- then `prompt_composer.py` can apply fatigue-aware directives

This closes the exact defect found in the live validation run.

---

# 3. Validation steps for the fatigue fix

## Setup
In browser console:

```javascript
setLoriState("high_fatigue");
```

## Expected browser console
You should see:

```javascript
[Lori 7.1] setLoriState -> runtime = {
  affectState: "fatigue_hint",
  affectConfidence: 0.9,
  cognitiveMode: "light",
  fatigueScore: 80
}
```

Then on send:

```javascript
[Lori 7.1] runtime71 -> model: {
  current_pass: "...",
  current_era: "...",
  current_mode: "light",
  affect_state: "fatigue_hint",
  affect_confidence: 0.9,
  cognitive_mode: "light",
  fatigue_score: 80
}
```

## Expected backend prompt log
The prompt should now include the fatigue directive block from `prompt_composer.py`.

## Expected Lori behavior
When sending:

> We can keep going.

Lori should:
- shorten the response
- soften tone
- reduce pressure
- offer pause / break / lighter continuation

---

# 4. Test 7 — Emotional difficulty

## Goal
Verify Lori acknowledges emotional difficulty, softens appropriately, and does not become clinical or evasive.

## Setup
Use a seeded person with timeline active. If needed, set a soft affect state before the message:

```javascript
state.runtime.affectState = "distress_hint";
state.runtime.affectConfidence = 0.75;
if (window.LORI71?.updateDebugOverlay) window.LORI71.updateDebugOverlay();
```

## Action
Send:

> That was a very hard time for me.

## Expected
- Lori acknowledges difficulty directly
- Lori uses a softer tone
- Lori does not ignore the feeling
- Lori does not abruptly redirect into cold chronology
- Lori does not become overly clinical or crisis-scripted for ordinary sadness

## PASS criteria
- response contains acknowledgment such as:
  - “That sounds hard”
  - “I’m sorry that was so difficult”
  - “We can go gently”
- response reduces pressure
- response does not immediately demand a detailed answer

## FAIL criteria
- no emotional acknowledgment
- immediate hard question
- overly clinical language
- abrupt topic pivot

## Report format
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

---

# 5. Test 8 — Memory contradiction handling

## Goal
Verify Lori handles contradiction gently without forcing certainty or correcting the narrator harshly.

## Setup
Use a seeded person with timeline active.

## Action sequence
Send these two messages in order:

1.
> I think we moved to Chicago when I was about 8.

2.
> Actually, maybe I was 10. I’m not completely sure.

## Expected
- Lori accepts the correction/uncertainty gracefully
- Lori does not force an exact answer
- Lori does not say or imply the narrator is wrong
- Lori uses uncertainty-tolerant phrasing
- ideally shifts toward anchor-based clarification, e.g.:
  - “That’s okay”
  - “Was that before or after a school change?”
  - “Did it happen while you were still in grade school?”

## PASS criteria
- Lori preserves uncertainty
- Lori does not aggressively resolve the contradiction
- Lori offers a soft anchor instead of a fact-demand

## FAIL criteria
- Lori pushes for exact year immediately
- Lori behaves like contradiction is an error to fix
- Lori states one version as certain without basis
- Lori uses memory-test pressure

## Report format
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

---

# 6. Add to the next Claude live report template

Append:

```md
### Test 7 — Emotional difficulty
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:

### Test 8 — Memory contradiction handling
- Setup:
- Action:
- Observed Lori response:
- Result: PASS / PARTIAL / FAIL
- Notes:
- Likely defect location:
```

---

# 7. Priority after patch

## Highest priority
Re-run **Test 6** immediately after patching.

If Test 6 passes, then run:
- Test 7 — Emotional difficulty
- Test 8 — Memory contradiction handling

This order matters because fatigue is the currently known failing bridge defect.
