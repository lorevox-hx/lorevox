# Lorevox v6.1 — Feature Plan (Reviewed & Revised)
**Two Tracks: Safety/Intervention Layer + Emotion Signal Layer**
_Reviewer pass complete — ready for implementation_

---

## Two Separate Tracks

| Track | Name | Core Mandate |
|---|---|---|
| A | Safety / Intervention Layer | Detect crisis disclosures. Pause. Acknowledge. Provide resources. Never assist with or suggest methods of self-harm under any circumstances. |
| B | Emotion Signal Layer | Assist the interview with gentle, contextual signals derived from facial geometry. Never make hard claims about a person's emotional state. Never judge. |

Track A ships and is tested before Track B begins.

---

## Track A — Safety / Intervention Layer

### Mandate (non-negotiable)
- Detect disclosures and distress signals in the live transcript
- Respond with warmth and provide real resources
- **Never offer, suggest, or engage with methods or ideas related to suicide or self-harm under any circumstances**
- System's only job when crisis is detected: pause → acknowledge → provide resources → give the person a choice

### Crisis Categories

| Category | Example Trigger Phrases |
|---|---|
| Suicidal ideation | "I wanted to die", "I thought about ending it", "not worth living", "kill myself" |
| Sexual abuse | "I was raped", "he molested me", "touched me when I was little", "sexual abuse" |
| Physical abuse | "he used to beat me", "she hit me", "I was beaten", "hurt me badly" |
| Child abuse | Age + perpetrator role + harm verb (compound trigger required) |
| Spousal / domestic | "my husband would hit", "domestic violence", "I was afraid of him at home" |
| Caregiver abuse | "my caregiver", "the nursing home", "they took my money", "they left me" |
| General distress call | "I need help", "please help me", "I don't know what to do" |

### Detection Design
- Scans at **sentence level** (full sentence, not fragments — fewer false positives)
- Weighted keyword list + compound trigger scoring (single-pass, < 1ms)
- Compound rule example: `[age < 18 context] + [perpetrator role word] + [harm verb]` = high confidence child abuse trigger
- False-positive guards: "I beat the heat", "I fought off depression" do NOT trigger
- Confidence threshold before firing: **0.70**

### Response Flow

```
Person speaks → Whisper transcribes → Safety scanner checks sentence →

IF confidence ≥ 0.70:
  1. Lori immediately stops generating the next interview question
  2. Soft safety overlay appears (warm palette, not alarming red)
  3. Lori's message displayed (and spoken if TTS active)
  4. Resource cards shown below Lori's message
  5. Four options offered:
       [Continue talking]   [Take a break]   [Show support options]   [Save and close]

IF "Continue talking":
  - interview_softened = true (see Post-Disclosure Mode below)
  - Interview resumes at same section
  - Segment flagged: { sensitive: true, category: "..." }
  - Roadmap item receives subtle sensitive indicator (design-system icon, not emoji)

IF "Take a break":
  - Session state saved
  - Resources remain visible

IF "Show support options":
  - Full resource panel expands in place
  - Person initiates contact themselves

IF "Save and close":
  - Session state saved, app closes gracefully
```

### What Lori Says
> _"Thank you for telling me. What you shared matters. You do not have to keep going right now. We can pause, keep talking, or look at support options."_

Resources are shown **below** Lori's message — the acknowledgment comes first.

### Resource Cards

Each resource is a clean tap-to-call card. Not a list. Not a paragraph.

**Display behavior:** Basic resource cards appear immediately below Lori's message — no click required to see them. The "Show support options" button expands a fuller panel (additional context, alternate contacts, online chat links). Cards are never hidden until the person acts.

| Resource | Contact |
|---|---|
| Crisis & Suicide Prevention | **988** — call or text (US) |
| RAINN Sexual Assault Hotline | **1-800-656-4673** |
| National DV Hotline | **1-800-799-7233** |
| Eldercare / Caregiver Abuse | **1-800-677-1116** |

### Post-Disclosure Softened Interview Mode

When `interview_softened = true` (set after any safety trigger + "Continue talking"):

- Lori asks **shorter questions** for the next 3 prompts
- Lori avoids aggressive probing or follow-up pressure
- After the second prompt, Lori checks in once: _"How are you doing? We can keep going or take a break."_
- Roadmap pressure suppressed (no "you have X sections remaining" nudges)
- `interview_softened` resets after 3 prompts or when the person reaches a new section

### Sensitive Segment Review UI (Session Review — not the overlay)

In the session review panel, any segment flagged `sensitive: true` must explicitly expose all four controls:

```
┌─ [🔒 Private] [Excluded from memoir] ─────────────────────────────────┐
│  "...transcript text of segment..."                                     │
│                                                                         │
│  [ Include in writing ]    [ Remove this segment ]                      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Private badge** — always visible on flagged segments; uses a design-system lock icon (not emoji)
- **Excluded from memoir badge** — always visible; shows that segment is not in the auto-draft
- **Include in writing** — person explicitly opts this segment into the memoir draft; confirmation: _"This will include this part of your story in your memoir draft. You can remove it again at any time."_
- **Remove this segment** — permanent delete from session; confirmation: _"This will permanently remove this part of the session. This cannot be undone."_

These four controls are always visible together on sensitive segments. No hunting. No guessing. This is not in the interruption overlay — it belongs in the quiet, deliberate review flow.

### Hard Limits — What the System Never Does
- Never discusses, suggests, or references methods of suicide or self-harm
- Never gives advice or guidance of any kind on crisis situations
- Never dismisses a disclosure and moves on to the next question
- Never auto-reports or contacts external services
- Never contacts anything without the person's own action

### Data & Privacy
- Transcript segment stored normally in session
- Segment tagged: `{ sensitive: true, category: "sexual_abuse" }` (etc.)
- Sensitive segments default to: **private, excluded from auto-memoir-draft**
- Person can explicitly include sensitive material — it is their story and their choice
- No external calls triggered by safety detection

### UI Components Needed (6.1.html)
- `detectCrisis(sentence)` — scanner, returns `{ triggered: bool, category, confidence }`
- `showSafetyOverlay(category)` — warm modal, Lori message + resource cards
- `dismissSafetyOverlay(choice)` — handles continue / break / support / close
- `flagSensitiveSegment(sectionIndex, category)` — tags session state
- `setSoftenedMode(true)` — activates post-disclosure interview softening
- CSS: `.safety-overlay`, `.resource-card`, `.safety-lori-bubble`
- Roadmap item: design-system sensitive icon when section has sensitive flag (not emoji lock)

---

## Track B — Emotion Signal Layer

### Mandate
- Use camera signals to assist the interview in v6.1; add mic/voice-tone support in v6.2
- Feed signals back as **gentle assists** — never hard claims
- **Never label a person's emotion as fact**
- The system's job: notice signs → adapt quietly → occasionally check in — nothing more

### Architecture: Path 1 (browser-native MVP)
- MediaPipe Face Mesh via CDN (WebAssembly, no build step, no server)
- Rule-based geometry classifier for MVP (no model file needed)
- Runs at ~15 FPS, negligible GPU load
- Upgrade path to hybrid multimodal (+ voice tone) in v6.2

### How It Runs

```
getUserMedia(video) → frame capture at 15 FPS →
MediaPipe Face Mesh → 468 landmark points →
Normalize (scale + rotation invariant) →
Rule-based geometry classifier →
  → raw emotion guess (internal only, never exposed)
  → mapped to interview-safe affect state
  → emit only if confidence ≥ 0.65 AND sustained ≥ 2 seconds

Emitted affect event → interview engine (adaptive follow-ups)
                     → session affect log
                     → timeline arc
```

### Affect State Mapping (key reviewer refinement)

Raw geometry classification is **never exposed to the interview engine or the user directly.** It is immediately mapped to an interview-safe affect state:

| Raw classifier output | Affect state emitted |
|---|---|
| happiness | `engaged` |
| sadness (low intensity) | `reflective` |
| sadness (high intensity) | `moved` |
| surprise | `engaged` |
| fear or anger (low) | `distressed` |
| fear or anger (high) | `overwhelmed` |
| disgust | `distressed` |
| neutral (sustained) | `steady` |

These are the states the interview engine, timeline, and all other layers see. The raw classifier output is internal only and is not stored.

### Affect Event Shape (revised)
```json
{
  "timestamp": 142.3,
  "section_id": "early_home",
  "affect_state": "moved",
  "confidence": 0.81,
  "duration_ms": 2400
}
```
`emotion` key does not exist in stored events. `affect_state` is the operative field.

### Integration: Interview Engine (primary use)

The affect signal **assists** Lori's follow-up selection — it does not override the interview:

| Affect state (sustained >2s) | Lori's adaptive response |
|---|---|
| `moved` or `reflective` | Softens tone: _"Take your time with this one."_ |
| `engaged` + surprise context | Opens it: _"That seems like it was unexpected — what do you remember?"_ |
| `engaged` + positive context | Mirrors energy: _"That's a good memory — what else comes to mind?"_ |
| `distressed` or `overwhelmed` | Gently checks in: _"We can slow down if you'd like."_ |
| `steady` | Normal flow |

These are suggestions to the interview engine. If a strong follow-up is already queued, the affect nudge is skipped.

### Integration: Memory Snippets
- Affect confidence > 0.75 during a segment: snippet priority boosted
- `affect_state` tag attached for retrieval and memoir weighting

### Integration: Timeline
Timeline stores **emotional/affect arcs**, not hard emotion labels:

| Stored | Not stored |
|---|---|
| `affect_state: moved` | ~~`emotion: sadness`~~ |
| `affect_state: joyful_energy` | ~~`emotion: happiness`~~ |
| `affect_state: heightened_distress` | ~~`emotion: fear`~~ |

Stored as: timeline markers with `affect_state` field, visible as soft color-coded dots with an optional "Emotional moments" filter.

### UI Feedback — Assistive, Not Intrusive
- **No live emotion label** shown to the person
- **Delayed contextual check-in only**: after sustained affect, Lori may offer: _"You seem moved by this memory — would you like to say more?"_
- Person can ignore the check-in entirely — it is just an offer
- Setting: "Emotion-aware interview mode" — **default OFF**, user opts in

### Privacy Design (revised)
- Webcam frames processed in-browser, **discarded immediately after landmark extraction**
- Landmark coordinates processed in memory — **not stored by default**
- Only derived **affect events** saved to session state
- No biometric geometry stored (landmark vectors are biometric-ish even without images)
- Emotion log lives in session state only — local, never uploaded
- Camera permission is a separate explicit opt-in

### Camera Permission Copy (revised)
```
[ ] Camera — helps Lori pace the interview more gently
    Video is processed on this device and is not saved.
```

### Shared Permission Card (revised copy)

```
┌─────────────────────────────────────────────────────────┐
│  🎙 This interview works best with:                     │
│                                                         │
│  [✓] Microphone  — for voice responses                 │
│  [ ] Camera      — helps Lori pace the interview       │
│                    more gently                          │
│                                                         │
│  Everything is processed on this device.               │
│  Video is not saved.                                    │
│                                                         │
│                   [Start Interview]                     │
└─────────────────────────────────────────────────────────┘
```

### Rule-Based Geometry Classifier (MVP)

| Emotion (internal) | Key geometric signals |
|---|---|
| happiness | Lip corners raised (LM 61, 291), cheek raise (LM 117, 346) |
| sadness | Inner brow corners lowered (LM 65, 295), lip corners down |
| surprise | Brow raise (large vertical delta LM 70, 300), jaw drop (LM 152 y-delta) |
| fear | Brow raise + upper lid raise + lip tension |
| anger | Brow lowered + inner brow together + lip press |
| neutral | All deltas within baseline variance range |

### MediaPipe CDN (single-file compatible)
```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
        crossorigin="anonymous"></script>
```

### UI Components Needed (6.1.html)
- `initEmotionEngine()` — loads MediaPipe, requests camera, starts frame loop
- `classifyEmotion(landmarks)` — rule-based geometry → raw emotion (internal)
- `mapToAffectState(rawEmotion, confidence)` — maps to interview-safe affect state
- `emitAffectEvent(event)` — fires to interview engine + session log (affect_state only)
- `renderAffectArc()` — timeline visualization using affect_state
- Settings toggle: "Emotion-aware interview mode" (default off)
- Small green camera indicator dot in interview UI when active
- Camera permission card at interview start (opt-in)

---

## Confirmed Decisions (locked)

| # | Decision |
|---|---|
| 1 | No auto-reporting. Resources provided, action is the person's choice. |
| 2 | Sensitive material: private and excluded from auto-draft by default. Person opts in to include. |
| 3 | Real-time emotion UI: off by default. Contextual Lori check-ins only. No live labels. |
| 4 | Rule-based geometry classifier for MVP. No model file. Upgrade in v6.2. |
| 5 | Safety scanner: sentence-level (not fragment-level). |
| 6 | **Suicide/self-harm: hard rule — never engage. Resources only. No methods, no ideas, ever.** |
| 7 | **Emotion: assists the interview — never labels or judges the person.** |
| 8 | Post-disclosure softened interview mode added (Track A). |
| 9 | "Show support options" added as 4th button (Track A). |
| 10 | Raw landmark vectors not stored — only derived affect events saved (Track B). |
| 11 | Affect state mapping layer added — raw classifier never exposed externally (Track B). |
| 12 | Camera permission copy revised to sound humane, not surveillant. |

---

## Implementation Order

### Track A (Safety) — ships first
| Step | What | File |
|---|---|---|
| A1 | Shared `getUserMedia` permission card UI | 6.1.html |
| A2 | `detectCrisis(sentence)` scanner + rules | 6.1.html |
| A3 | `showSafetyOverlay(category)` + Lori message | 6.1.html |
| A4 | Resource cards (988, RAINN, DV, Eldercare) | 6.1.html |
| A5 | `dismissSafetyOverlay(choice)` — 4-option handler | 6.1.html |
| A6 | `setSoftenedMode()` + post-disclosure interview logic | 6.1.html |
| A7 | `flagSensitiveSegment()` + memoir privacy default | 6.1.html |
| A8 | Session review: delete sensitive segment option | 6.1.html |
| A9 | Backend: sensitive segment tag in session API | interview.py |

### Track B (Emotion) — ships after Track A is tested
| Step | What | File |
|---|---|---|
| B1 | MediaPipe CDN script tags + `initEmotionEngine()` | 6.1.html |
| B2 | Camera permission opt-in card | 6.1.html |
| B3 | `classifyEmotion(landmarks)` rule-based → raw emotion | 6.1.html |
| B4 | `mapToAffectState()` — internal mapping layer | 6.1.html |
| B5 | `emitAffectEvent()` → interview engine adaptive responses | 6.1.html |
| B6 | Affect log → session state (affect_state only, no raw geometry) | 6.1.html |
| B7 | `renderAffectArc()` → timeline markers with affect_state | 6.1.html |
| B8 | Settings toggle for emotion-aware mode | 6.1.html |

---

## What Does NOT Change
- Single-file HTML architecture
- Local-first (no cloud calls for either module)
- Existing interview engine (both tracks are additive only)
- v6.0 visual system and theming
- v6.0 git-committed baseline remains the rollback point

---
_Plan version: v6.1-rev2 | Reviewer pass complete | Ready to build_
