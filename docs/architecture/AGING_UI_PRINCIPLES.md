# AGING_UI_PRINCIPLES.md

# Lorevox v7.3 — Aging-Centric UI Principles
**Status:** Active design standard  
**Version:** v7.3 planning layer  
**Date:** 2026-03-20

---

## 1. Purpose

This document defines the **aging-centric UI principles** for Lorevox v7.3.

Lorevox is being designed for older adults first, including users with:
- reduced visual acuity
- lower contrast sensitivity
- hearing loss
- slower or less precise motor control
- cognitive fatigue
- reduced working memory
- hesitation or anxiety around technology

These principles apply across:
- desktop
- laptop
- tablet
- mobile

They are not optional polish.  
They are part of the product definition.

---

## 2. Core Product Principle

**Lorevox v7.3 is a conversational life archive where Lori stays with the user, and the tabs are the places where the story can be reviewed, edited, and shaped.**

This means:

- Lori is always present
- the user can always speak naturally
- the tabs remain editable workspaces
- structure is preserved
- correction is easy
- the interface never feels like a test

This is:

**chat-first, not chat-only**

---

## 3. The Aging-Centric Design Position

Lorevox should not be designed as a sleek, minimal, hidden-control interface.

Lorevox should feel like:

> **a patient companion at a well-lit writing desk**

That means:
- calm
- readable
- stable
- forgiving
- obvious
- respectful

For older adults, what is a small inconvenience to a younger user may be a complete barrier:
- small fonts
- thin scrollbars
- vague error messages
- hidden navigation
- icon-only controls
- precise motor demands
- loss of entered text
- uncertainty about what just happened

Lorevox must treat these as design failures, not user failures.

---

## 4. Non-Negotiable v7.3 Rules

### 4.1 Lori is persistent
Lori must remain visible across the app.

Desktop:
- fixed right-side panel or persistent dock
- collapsible, but never hard to recover

Tablet/mobile:
- bottom drawer or persistent bubble
- obvious reopen control

Lori must never disappear simply because the user changed tabs.

---

### 4.2 Tabs remain real workspaces
Tabs are not passive dashboards.

They must allow direct review and editing of captured information.

At minimum:
- **Profile** → editable facts
- **Interview** → guided conversation workspace
- **Timeline** → editable events and chronology
- **Memoir** → editable narrative draft

Future:
- **Family Tree** → editable relatives and relationships

The user must always be able to correct Lori.

---

### 4.3 Accessibility is the default, not a hidden setting
Lorevox should open in a readable, comfortable state by default.

Do not rely on users to find:
- zoom controls
- hidden contrast modes
- buried accessibility settings

The first-run experience should already be senior-friendly.

---

## 5. Visual Design Rules

### 5.1 Typography
Default text must be larger than mainstream app norms.

**Required defaults**
- body text: **18–20px**
- small helper text: never below **14px**
- headings: large and clear
- line height: generous (1.4–1.6)

### 5.2 Font style
Prefer:
- sans-serif for body text
- high legibility
- moderate weight
- clear spacing

Decorative serif use is acceptable only for large headings, never for dense controls or small instructions.

### 5.3 Contrast
Lorevox must avoid low-contrast modern minimalism.

**Required**
- strong foreground/background separation
- no light gray on white as primary reading text
- controls visibly bounded
- labels and states clearly distinguishable

Target:
- at least WCAG AA baseline
- prefer stronger-than-minimum contrast for primary workflows

### 5.4 Color meaning
Color alone must never carry meaning.

If something is:
- complete
- warning
- error
- active
- selected

that meaning must also be shown using:
- text
- icons
- shape
- borders
- labels

### 5.5 Glare reduction
Avoid harsh pure-white fields as the dominant workspace.

Prefer:
- soft, warm, or muted surfaces
- strong text contrast without visual glare
- calm, non-vibrating color pairings

### 5.6 Layout stability
Keep major controls in stable positions.

Older users should not need to rediscover:
- where Lori is
- where tabs are
- where Save is
- where Send is
- where Back is

---

## 6. Motor and Dexterity Rules

### 6.1 Target size
Interactive controls must be large enough for reduced precision.

**Required**
- minimum target height: **44–52px**
- comfortable padding around controls
- generous spacing between adjacent actions

### 6.2 Spacing
Avoid tightly packed action clusters.

Do not place destructive or unrelated actions directly beside each other without spacing and clear labels.

### 6.3 Scrollbars
Desktop scrollbars must remain easy to see and use.

Avoid:
- ultra-thin scrollbars
- disappearing scrollbars
- low-contrast tracks/thumbs

Prefer:
- always-visible or clearly present scrollbars
- larger draggable area
- high contrast

### 6.4 Precision traps
Avoid workflows that depend on:
- pixel-perfect clicking
- hover-only menus
- nested flyout menus
- drag-only interaction
- tiny close buttons

### 6.5 Single-click over double-click
Do not require double-click interactions for core Lorevox tasks.

Single-click activation should be the rule.

---

## 7. Cognitive Design Rules

### 7.1 Recognition over recall
Lorevox must reduce memory burden.

The interface should always help answer:
- Where am I?
- What am I working on?
- What did Lori just do?
- What can I do next?
- How do I go back?

This means always-visible cues such as:
- active tab
- workspace title
- current pass / era / mode
- last Lori message
- obvious next actions

### 7.2 Breadth over depth
Navigation should remain shallow.

Avoid:
- deep nested menu structures
- hidden hierarchy
- buried settings

Prefer:
- visible tabs
- direct actions
- short paths to content

### 7.3 One clear step at a time
Lorevox should not crowd users with too many simultaneous decisions.

Complex workflows should be broken into:
- visible steps
- natural progression
- optional Lori guidance

### 7.4 Calm state continuity
The user should never feel “lost” after:
- saving
- sending a message
- changing tabs
- closing and reopening Lori
- receiving an error

The system should preserve continuity and orientation.

---

## 8. Lori Interaction Rules

### 8.1 Lori assists, not dominates
Lori is not replacing the interface.

Lori’s role:
- guide
- ask
- notice
- reassure
- help populate the archive
- suggest next steps

The tabs’ role:
- display
- organize
- confirm
- allow correction
- allow editing

### 8.2 Lori is context-aware
Lori should know the active workspace and respond accordingly.

Examples:
- “I can help add that to your timeline.”
- “Would you like me to place that in your profile?”
- “We can revise this memoir paragraph together.”

### 8.3 Lori must reduce anxiety
Lori’s language should be:
- plain
- reassuring
- non-technical
- non-judgmental

Avoid:
- jargon
- abrupt correction
- blame
- pressure
- memory-test framing

### 8.4 Lori must support correction
When the user revises something, Lori should support that without friction.

Examples:
- “We can update that.”
- “Let’s correct the date.”
- “That’s fine — we can leave it uncertain for now.”

---

## 9. Language and Microcopy Rules

### 9.1 Plain language
Use direct, familiar terms.

Prefer:
- “Save”
- “Send”
- “Back”
- “Replay Lori”
- “Talk to Lori”
- “Add to Timeline”

Avoid unnecessary technical terms such as:
- authenticate
- synchronize
- hydrate
- commit
- invoke
- cloud-save

### 9.2 Short, concrete instructions
Instructions should be:
- short
- sequential
- explicit

Prefer:
- “Choose a person, then begin the interview.”
- “Tell Lori about a memory, then review it in the Timeline tab.”

Avoid:
- multi-clause dense directions
- jargon-heavy helper text

### 9.3 Reassuring feedback
System feedback should reduce uncertainty.

Examples:
- “Saved.”
- “Your changes are still here.”
- “Lori heard you.”
- “It’s okay to leave this unfinished and come back later.”

### 9.4 Respectful language
Use respectful terms for older adults.

Prefer:
- older adults
- seniors
- the person
- the narrator

Avoid patronizing tone.

---

## 10. Forms and Error Handling

### 10.1 Preserve user input
If a form or save action fails, previously entered data must remain visible.

Never erase meaningful user work after validation failure.

### 10.2 Prevent errors before reporting them
Where possible:
- constrain invalid choices
- provide safe defaults
- format input flexibly
- normalize data behind the scenes

### 10.3 Delay intrusive validation
Avoid aggressive real-time error interruption while the user is typing.

Validation should be:
- calm
- clear
- specific
- easy to recover from

### 10.4 Actionable error messages
Error messages must say what to do next.

Prefer:
- “Enter a full year or a full date.”
- “Choose a person before starting the interview.”

Avoid:
- “Invalid input”
- “Form error”
- “Something went wrong”

### 10.5 Recovery must be visible
After an error, the interface should make recovery obvious:
- highlight the affected area
- keep the user in context
- preserve their progress
- provide a direct next step

---

## 11. Voice, Hearing, and Confirmation Rules

### 11.1 Voice-forward, text-visible
Lorevox may be voice-forward, but text must remain visible.

Every spoken Lori interaction should also be reflected on screen as readable text.

### 11.2 Replay is required
Users must be able to replay Lori’s last spoken message easily.

### 11.3 Mic state must be obvious
The microphone state must always be clear:
- listening
- idle
- failed
- processing

This must be visible even if audio feedback is missed.

### 11.4 Adjustable playback
Support:
- slower speech
- louder playback
- replay without penalty

### 11.5 Confirmation across senses
Whenever possible, key actions should be confirmed using more than one channel:
- visible message
- state change
- voice
- optional sound/haptic on supported devices

---

## 12. Mobile and Tablet Rules

### 12.1 Do not shrink desktop without redesign
Mobile must simplify the shell.

On smaller screens:
- Lori becomes a bottom drawer or persistent bubble
- tabs become larger, clearer, fewer per row
- actions remain explicit and finger-friendly

### 12.2 Avoid gesture-only control
Do not make essential actions depend on:
- swipe-only
- pinch-only
- multi-finger gestures

If gestures exist, they must have clear visible alternatives.

### 12.3 Single-finger interaction first
Primary interaction should assume:
- tap
- drag
- scroll

Do not require advanced gesture fluency.

### 12.4 Avoid accidental zoom triggers through bad form sizing
Inputs should be large enough and readable enough that mobile browsers do not need awkward auto-zoom behavior.

---

## 13. Emotional UX Rules

### 13.1 The interface must never make the user feel incompetent
Older users often blame themselves when an interface fails.

Lorevox must actively resist this dynamic.

### 13.2 Make success visible
Every successful action should feel clear and acknowledged.

### 13.3 Make mistakes survivable
The user should feel safe to:
- try
- revise
- back up
- leave something incomplete
- return later

### 13.4 Lori should feel patient, not urgent
No part of Lorevox should feel rushed, reactive, or punishing.

---

## 14. Lorevox-Specific v7.3 Requirements

### 14.1 Persistent Lori shell
The v7.3 shell must include:
- persistent Lori presence
- collapsible Lori panel
- context-aware workspace support
- no loss of Lori across tabs

### 14.2 Editable tab workspaces
The v7.3 shell must preserve:
- editable Profile
- editable Timeline
- editable Memoir
- Interview as a reviewable workspace
- future editable Family Tree

### 14.3 Runtime visibility
The interface should continue surfacing meaningful session state:
- pass
- era
- mode
- cognitive support state when appropriate

### 14.4 Safe continuity
The shell must not break the validated behavior pipeline:

`state.runtime → buildRuntime71() → WebSocket/SSE → prompt_composer.py`

Accessibility improvements must be layered on top of that pipeline, not outside it.

---

## 15. What Lorevox Must Avoid

Lorevox v7.3 must avoid:
- chat-only reduction of the product
- read-only tabs
- hidden navigation
- icon-only critical actions
- low-contrast minimalism
- small touch targets
- gesture-only primary actions
- aggressive real-time validation
- disappearing scrollbars
- deep navigation trees
- precision-based interaction traps
- jargon-heavy copy
- punishment for uncertainty or correction

---

## 16. Acceptance Criteria for v7.3 UI Work

A v7.3 shell change is only acceptable if all of the following remain true:

- Lori remains visible across workspaces
- tabs remain editable
- text is clearly readable by default
- buttons are large and easy to hit
- active context is always visible
- last Lori response is visible in text
- correction and saving remain easy
- no core action relies on hidden gesture or precision targeting
- the existing runtime71 behavior path is preserved
- the shell feels calmer and clearer than 7.1, not just newer

---

## 17. Final Principle

Lorevox is not being designed for speed, trendiness, or minimalism.

Lorevox is being designed for:
- independence
- clarity
- trust
- continuity
- dignity

If a design choice makes Lorevox look more modern but harder for an older adult to see, hear, understand, or recover from, it is the wrong choice.

**The correct Lorevox interface is the one that lets an older person continue telling their story with confidence.**