# Lorevox Operating Doctrine

## Purpose

Lorevox is not a chatbot with memory.
Lorevox is a **human legacy studio** for capturing, organizing, and shaping lived experience into durable archives, timelines, memoirs, and memorial writing.

The system exists to help a person preserve a life with dignity, clarity, and emotional truth.

## Product Standard

Every UI decision, workflow, and generation feature must satisfy these five standards:

1. **Human memory stays primary**
2. **AI assistance stays visible but subordinate**
3. **The interface must feel calm, permanent, and trustworthy**
4. **Drafting must support gradual progress, not false completeness**
5. **Human-edited voice must never be silently overwritten**

---

## 1. Human Memory Is the Source of Truth

Lorevox treats the person's memory, voice, and corrections as the authoritative source.

### Rules

- The system must never imply that AI-generated phrasing is the primary artifact.
- Interview capture fields must describe the content as the person's memory, not Lori's output.
- Labels such as `Lori's answer` are disallowed.
- Preferred wording must reinforce ownership:
  - `Captured answer`
  - `Edited by hand`
  - `Built from interview answers`
  - `Written with Lori`

### Required behaviors

- If Lori populates a field, the UI must disclose that clearly.
- If the user edits that field, authorship status must visibly shift to human-reviewed or human-edited.
- Final saved content must always preserve the user's editorial authority.

---

## 2. AI Is a Collaborator, Never the Authoritative Voice

Lori assists with prompting, organizing, drafting, and reframing. Lori does not replace the subject, the family, or the archive.

### Rules

- AI actions must be framed as collaborative:
  - `Write with Lori`, not `Generate via Lori`
  - `Fill from Profile`, not `Auto-fill`
- AI output must always remain editable.
- The system must distinguish between:
  - structured factual fill
  - AI-written narrative draft
  - human-edited text

### Required behaviors

- All generated text areas must support revision without friction.
- The UI must show draft provenance when it matters:
  - `Filled from Profile`
  - `Written with Lori`
  - `Edited by hand`

---

## 3. Production UI Must Hide Scaffolding

Lorevox must feel like a memory studio, not a testing environment.

### Rules

- Developer-facing controls must not appear in the normal user path.
- Diagnostics, transport indicators, raw IDs, and internal service states are hidden by default.
- Production wording must avoid backend or operator language.

### Disallowed in standard mode

- raw session IDs
- service pills like `Chat / TTS / WS`
- developer info panels
- internal endpoint references
- monitoring-style labels like `Last reply`

### Allowed only in dev mode

- connection diagnostics
- session metadata
- raw system state
- debugging panels

### Required behaviors

- Dev mode must be explicit and separate from normal use.
- If a control exists only for debugging, it must not be visible by default.

---

## 4. Language Must Support Reflection, Not Operation

Lorevox is used during memory work, life review, memoir drafting, and obituary writing. The wording must respect that emotional context.

### Rules

- Prefer human, archival, and narrative language over technical or mechanical language.
- Avoid operator-console language, especially in emotional workflows.
- Avoid icons that make interview control feel like media playback or machine operation unless they truly improve clarity.

### Preferred language patterns

- `Personal Details` over `Identity`
- `Helpful Memory Prompts` over `Memory Triggers for this Section`
- `Chapter Map` over `Chapters`
- `Obituary Text` over `Draft`
- `World Context: On/Off` over `Hide World Context`

### Required behaviors

- Labels must reflect the user's mental model, not the implementation model.
- Empty states must invite action and reassure continuity.
- The interface should consistently sound like a trusted archival companion.

---

## 5. Lorevox Must Design for Partial Progress

Human memory work is gradual, recursive, and incomplete by nature. The interface must not force false binary states.

### Rules

- Memoir, timeline, and interview workflows must support partial completion.
- `Not started` and `Ready` are insufficient by themselves in long-form workflows.
- Intermediate states must be visible where meaningful.

### Required states

- `Not started`
- `In progress`
- `Ready`

### Required behaviors

- Chapter readiness should reflect gradual accumulation.
- Timeline empty states must explain how to begin.
- Profile readiness should reward progress without feeling like compliance validation.
- Long-form areas should clearly communicate how collected material feeds the next stage.

---

## 6. Context Must Be Framed as Recollection Support

Historical and cultural events are not decorative metadata. They are memory cues.

### Rules

- World and cultural context must be presented as support for recollection.
- This feature must never feel like a cold event database.
- Taxonomy must reflect how people remember.

### Preferred framing

- `Memory Triggers`
- `History`
- `Everyday Life`
- `Ask Lori about this moment`

### Required behaviors

- Context pages must explain why the events shown are relevant.
- Age-based filtering must be understandable.
- Country and cultural context must visibly affect what is shown.
- Clicking an event should clearly feel like starting a memory conversation.

---

## 7. Human Edits Are Sacred

Once a person or family has edited a narrative, Lorevox must treat those words as protected.

### Rules

- Human-edited prose must never be silently replaced.
- Profile or fact changes must not overwrite user-edited memoir or obituary drafts without permission.
- Regeneration must be explicit and reversible in concept, even if not technically undoable yet.

### Required behaviors

- If a draft is purely structured and auto-filled, it may update from source facts.
- If a draft is Lori-written or human-edited, changes to source facts must not silently rewrite it.
- Before replacing edited content, the UI must warn clearly:
  - `Generating a new draft will replace your current edits. Do you want to proceed?`

---

## 8. Obituary and Memorial Writing Require Cultural Humility

Obituary drafting is not just another generation surface. It is a protected, culturally sensitive writing space.

### Rules

- Lorevox must assume cultural nuance matters.
- Default obituary output should be respectful, simple, and editable.
- Tone controls are optional supports, not authoritative style engines.
- Family voice outranks model fluency.

### Required behaviors

- Default tone should remain conservative and respectful.
- Tone options may assist, but should not dominate the interface.
- The UI must support culturally specific wording, bilingual expression, ritual details, and regional customs without friction.
- Human edits in this area receive the strongest overwrite protections.

---

## 9. Emotional Weight Should Shape Interaction Design

Not every tab carries the same emotional load. Lorevox must design accordingly.

### Priority by sensitivity

- Highest sensitivity: Obituary, memorial writing, family relationships
- High sensitivity: Interview capture, memoir drafting
- Moderate sensitivity: Profile, timeline
- Supportive sensitivity: Memory Triggers

### Required behaviors

- Higher-sensitivity areas should use calmer language, fewer decorative controls, and stronger protection against accidental loss.
- The more emotionally charged the task, the more the UI must favor restraint, clarity, and confirmation.

---

## 10. Every Surface Must Explain Its Role in the Archive

Users should always understand what a screen is for and how it contributes to the larger archive.

### Required behaviors

- Profile explains that it improves prompting and grounding.
- Interview explains that answers become notes, timeline material, and draft input.
- Memory Triggers explains that events help unlock recollection.
- Timeline explains that it grows from interviews and saved memories.
- Memoir explains that chapters are built from accumulated material.
- Obituary explains that facts can seed a respectful working draft.

---

## Implementation Doctrine for Next Versions

### Must do

- Remove all remaining production-visible diagnostics.
- Keep answer capture language human-centered.
- Add or preserve provenance chips for AI-filled vs. human-edited text.
- Support partial-state language in long-form outputs.
- Protect human-edited obituary and memoir text from silent overwrite.
- Keep tab and section naming consistent across navigation and page bodies.

### Must not do

- Reintroduce backend terminology into standard UI.
- Label human memories as AI answers.
- Present AI drafting as final or authoritative.
- Auto-regenerate over edited prose without warning.
- Let the product feel like a lab tool during memory work.

---

## Final Test

Before shipping any feature, ask:

1. Does this make the person's memory feel more owned or less owned?
2. Does this make Lori feel more collaborative or more controlling?
3. Does this screen feel like an archive studio or a software console?
4. Does this protect gradual progress?
5. Could this overwrite human voice or cultural specificity by accident?

If a feature fails any of those tests, it is not ready.
