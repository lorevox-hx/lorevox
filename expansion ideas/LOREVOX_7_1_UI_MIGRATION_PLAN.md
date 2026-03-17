# Lorevox 7.1 UI Migration Plan
### Mapping the current v6.3 HTML shell into the 7.1 architecture

## Purpose

This document maps the current `v6.3` interface into the Lorevox `7.1` system without requiring a full front-end rewrite first.

The goal is not to discard the current shell. The goal is to reassign its meaning so the interface obeys the `7.1` architecture:

- DOB + birthplace seed the timeline spine
- Pass 1 builds vocabulary and temporal structure
- Pass 2A walks DOB → present
- Pass 2B returns for narrative depth
- affect support and aging/cognitive support shape pacing and access
- Lori becomes the guide, not a side chatbot

---

# 1. Architectural Reframe

## Current v6.3 UI model
The current HTML is organized like a capable archive app with many feature panes:

- Profile
- Interview
- Memory Triggers
- Timeline
- Memoir Draft
- Obituary Draft
- Private Segments
- Lori chat side panel

This is useful, but it still behaves like a multi-tool workflow.

## Lorevox 7.1 UI model
The `7.1` architecture wants the same shell to behave like a guided memory studio:

- **Profile** becomes timeline seeding and identity grounding
- **Interview** becomes the active pass engine
- **Memory Triggers** becomes contextual era support
- **Timeline** becomes visible proof of Pass 2A
- **Memoir** becomes output from scenes + history
- **Obituary** becomes a separate downstream writing mode
- **Private Segments** becomes trust / access control
- **Lori** becomes the visible guide across all panes

---

# 2. New UX Doctrine for This Shell

## Keep
- the existing tab layout
- the left sidebar
- the right Lori panel
- the Family Map
- the Timeline pane
- the Private Segments pane
- the permissions / affect-aware concepts

## Change
- what the panes mean
- when they activate
- what the Interview pane is actually doing
- how timeline data is seeded and displayed
- how Lori's state becomes visible

## Do not do yet
- do not rebuild the entire UI framework
- do not redesign every tab visually
- do not move to a completely new shell before `7.1` behavior is integrated

---

# 3. Current Element → 7.1 Meaning Map

## Top Bar

### Current
- `Lorevox`
- `Life Archive Studio`
- `v6.3`
- focus/dev/chat controls

### 7.1 role
Keep the top bar mostly intact for now.
Add only one new subtle runtime indicator:

- **Current Pass**
- **Current Era**
- **Current Mode**

Example:
- `Pass 2A`
- `Era: School Years`
- `Mode: Recognition`

### Recommendation
Add a compact status area to the top bar or Interview header rather than redesigning the top bar immediately.

---

## Left Sidebar

### Current sections
- Active person summary
- People
- Interview Roadmap
- Recent Sessions

### 7.1 change

#### `Interview Roadmap` → `Life Periods`
This is the most important label change.

The sidebar should now reflect:
- timeline spine periods
- known eras
- rough completeness
- current active era

### Recommended sidebar structure
- **People**
- **Life Periods**
- **Session History**

### What `Life Periods` should show
Instead of section checklist items only, show:
- Early Childhood
- School Years
- Adolescence
- Early Adulthood
- Midlife
- Later Life

Each can show:
- seeded
- started
- in progress
- deepened
- sparse / gap

### JS file impact
- `state.js`
- `interview.js`
- `timeline-ui.js`

---

## Profile Tab

### Current role
General bio and archive readiness form.

### 7.1 role
This becomes the **timeline seed pane**.

It should still collect:
- full name
- preferred name
- DOB
- place of birth
- culture / country
- language
- pronouns
- phonetic name
- family map

But the main behavioral change is:

### New core behavior
When the user saves a profile with:
- `bio_dob`
- `bio_pob`

Lorevox should:
1. initialize a `TimelineSpine`
2. store it
3. mark the person as ready for Pass 2A
4. populate the Life Periods list
5. show timeline seed readiness in the UI

### New visible UI states
Replace “Archive Readiness” emphasis with a stronger seed state such as:
- `Timeline Seed Ready`
- `Pass 2A Available`
- `Timeline Initialized`

### Current element mapping
- `bio_dob` → timeline seed input
- `bio_pob` → timeline seed input
- `saveProfile()` → must call timeline initialization
- `createPersonFromForm()` → should initialize person + optional spine
- `readinessChecks` → should include timeline readiness

### Recommended microcopy
Under DOB / birthplace:
> These details help Lori build a life timeline so she can guide the interview more naturally.

### JS file impact
- `interview.js`
- `state.js`
- `app.js`

---

## Family Map

### Current role
Relationship entry.

### 7.1 role
Keep it mostly as-is.

This is still useful in 7.1 because it supports:
- relationship mapping
- recognition anchors
- memoir context
- obituary context
- family-tree evolution later

### Recommended change
Minor text update only:
emphasize that these people help Lori ask more grounded questions later.

### JS file impact
Low priority.

---

## Interview Tab

### Current role
Section-driven interview pane with:
- begin section
- ask again
- skip
- current prompt
- answer field
- memory prompts
- notes

### 7.1 role
This becomes the **pass engine**.

This is the most important conceptual shift in the UI.

## New interview model inside this pane

### Pass 1
Identity + timeline seed
- handled mostly in Profile

### Pass 2A
Timeline Spine pass
- birth → present
- broad life periods
- rough chronology
- places, moves, transitions
- no pressure for deep emotional detail yet

### Pass 2B
Narrative deepening pass
- scene capture
- sensory detail
- meaning
- legacy
- memoir-quality material

### What should change in the header
The interview pane should show:
- current pass
- current era
- current support mode

Example:
- `Pass 2A — Timeline Spine`
- `Era: Adolescence`
- `Mode: Recognition Support`

### Current elements to reinterpret
- `ivSectionLabel` → should become pass/era label
- `Begin Section` → should become `Begin Pass` or `Continue`
- `Ask Again` → can remain
- `Skip for Now` → can remain
- `ivPrompt` → still core prompt display
- `ivAnswer` → still useful as captured/editable answer
- `Save & Continue` → still useful
- `Save as Memory` → becomes seed for scene extraction

### Mode buttons
Current:
- Chronological
- Thematic
- Youth Mode

### 7.1 recommendation
Keep the UI buttons for now, but rebind meaning.

#### `Chronological`
Maps to:
- Pass 2A timeline mode

#### `Thematic`
Maps to:
- Pass 2B deep narrative mode

#### `Youth Mode`
Can remain as a special profile overlay, but should eventually be folded into age-specific prompting rather than a raw toggle.

### Affect-aware toggle
Keep it.
It now belongs naturally to the 7.1 runtime because it affects:
- pacing
- grounding
- cognitive load
- session close

### Permission card
Keep it, but update the camera text so it matches the affect support doctrine:
- local
- optional
- not diagnosing
- helps Lori pace gently

### Memory prompts accordion
This should become timeline-aware.
Instead of generic trigger text:
- show age-anchored prompts
- show recognition prompts
- show era anchors

Example:
> You would have been around 10 then. Does this memory feel connected to school, home, or neighborhood life?

### Section notes accordion
Keep it. It can later become:
- draft notes
- Lori summary
- scene candidates

### JS file impact
Highest priority.
- `interview.js`
- `emotion.js`
- `emotion-ui.js`
- `api.js`

---

## Memory Triggers Tab

### Current role
Standalone event grid with filters.

### 7.1 role
This becomes **contextual era support**.

The concept stays, but the framing changes.

Instead of asking:
- “What world events can I click?”

It should answer:
- “What cultural or historical context is relevant to this person's life periods?”

### New role
Use DOB + timeline to show:
- age at event
- likely life stage
- family phase
- region / country context

### Recommended behavior
When the person has a timeline seed:
- filter events by plausible age relevance
- surface era-appropriate music, politics, war, culture, technology
- present events as optional anchors Lori can use

### UI text update
Rename explanatory copy so it says:
> Use these as memory anchors that Lori can weave into the interview naturally.

### JS file impact
- `data.js`
- `timeline-ui.js`
- `interview.js`

---

## Timeline Tab

### Current role
Life timeline built from milestones and world events.

### 7.1 role
This becomes the **visible output of Pass 2A**.

This tab should visually prove that Lorevox understands the shape of a life.

### New requirements
Timeline should display:
- DOB seed
- birthplace seed
- generated life periods
- rough chronology
- known places
- saved memories/scenes
- known gaps
- optional world context as secondary

### Important UI shift
World context should no longer dominate.
The primary story is:
- the person's life periods

World events are support context only.

### Suggested structure
- birth marker
- early childhood band
- school years band
- adolescence band
- adulthood bands
- saved scenes pinned within bands
- “gaps” or sparse periods visible lightly

### Current controls
- `World Context: On`
- `Affect Arc: Off`

### 7.1 recommendation
Keep both, but set expectations:
- world context = optional overlay
- affect arc = optional session overlay, not historical truth

### JS file impact
- `timeline-ui.js`
- `state.js`

---

## Memoir Draft Tab

### Current role
Build outline / write draft from sections.

### 7.1 role
Still valid, but downstream.

Memoir should no longer be treated as something written directly from answered sections alone.
It should increasingly depend on:
- timeline spine
- saved scenes
- reviewed history
- chapter map

### Immediate recommendation
Keep the pane mostly intact.
Update the descriptive text so it says the draft grows from:
- timeline periods
- interview scenes
- saved life context

### JS file impact
Later, not first sprint.

---

## Obituary Draft Tab

### Current role
Profile/family-based obituary builder.

### 7.1 role
Still valid and still separate.

This pane already fits the doctrine that obituary is not the same as memoir.
Keep it as a downstream writing mode.

### Recommendation
No major change in first 7.1 UI sprint.
Only update copy so Lori's healthier interviewer behavior and identity controls are reflected upstream.

---

## Private Segments Tab

### Current role
Sensitive/private segment review.

### 7.1 role
This remains highly important.

This is the trust layer.
It fits perfectly with:
- access designation
- private segments
- memoir exclusion
- family-only scenes

### Recommendation
Keep as-is for now.
Later connect this to:
- scene access designation
- memoir inclusion rules
- obituary exclusion rules

---

## Lori Chat Panel

### Current role
Right-side interviewer/chat agent with microphone and latest response.

### 7.1 role
Keep it as the emotional anchor for now.

The main thing that changes is not the panel itself, but Lori's runtime behavior:
- prompt directives
- affect support
- recognition support
- timeline-aware prompts
- pass-aware prompts

### Immediate recommendation
Do not rebuild this panel first.
Instead:
- change what Lori knows
- change what Lori asks
- surface current pass/era/mode near her status

### Suggested status additions
Under `Lori — Interviewer`:
- `Pass 2A`
- `Era: Midlife`
- `Mode: Grounding`

### JS file impact
- `app.js`
- `emotion-ui.js`
- `interview.js`

---

# 4. Required Backend/State Changes That the UI Depends On

## A. Timeline seed on profile save
When `bio_dob` and `bio_pob` are present:
- initialize `TimelineSpine`
- store it
- update left sidebar with life periods

## B. Interview state object
The UI now needs a runtime state including:
- current pass
- current era
- current mode
- current affect hint
- current cognitive mode
- current timeline anchor

## C. Prompt generation must become pass-aware
The Interview pane cannot stay section-first.
It must become:
- Pass 2A timeline prompting
- Pass 2B deep narrative prompting

## D. Save-as-memory should eventually emit scene candidates
This enables:
- timeline enrichment
- memoir support
- re-entry prompts
- access control later

---

# 5. JS Migration Order

## First files to change

### 1. `state.js`
Add new runtime fields:
- `currentPass`
- `currentEra`
- `currentMode`
- `timelineSeedReady`

### 2. `interview.js`
Highest priority rewrite.
This is where the pass engine should live.

Needed:
- pass selection
- era routing
- prompt updates
- recognition support
- affect-aware simplification hooks

### 3. `timeline-ui.js`
Make the timeline show life periods from the timeline spine.
World events become secondary overlays.

### 4. `app.js`
Wire profile save → timeline initialization.
Update UI labels and state hydration.

### 5. `emotion.js` / `emotion-ui.js`
Use affect support as runtime shaping rather than just UI signal.

---

# 6. Minimal 7.1 UI Sprint

## Goal
Make the existing shell obey the new architecture without visual redesign first.

## Deliverables

### Profile
- DOB + birthplace create timeline seed
- readiness badge updates

### Sidebar
- `Interview Roadmap` renamed to `Life Periods`
- populated from timeline spine

### Interview
- header shows pass + era + mode
- `Chronological` maps to Pass 2A
- `Thematic` maps to Pass 2B
- prompts become timeline-aware

### Timeline
- life periods visible
- world events secondary

### Lori panel
- current state visible
- same panel, smarter behavior

---

# 7. Suggested UI Copy Changes

## Current
“Interview Roadmap”

## Replace with
“Life Periods”

---

## Current
“Start the archive with the details that help Lori ask better, more personal questions.”

## Replace with
“Start with the details that help Lori build a life timeline and guide the interview more naturally.”

---

## Current
“Click any event to have Lori ask about that moment in the person's life.”

## Replace with
“Use these as memory anchors Lori can draw on when a life period needs more context.”

---

## Current
“Life Timeline — built from interview milestones and historical context.”

## Replace with
“Life Timeline — seeded from birth details, shaped through life periods, and enriched by memories and context.”

---

# 8. What Not to Change Yet

Do not:
- rebuild the entire visual shell
- remove tabs
- redesign Lori as a floating avatar first
- build chapter-generation UI before pass integration
- overcomplicate the Timeline tab before the spine is real

---

# 9. Summary

The current HTML is not obsolete.
It is structurally capable of hosting Lorevox 7.1.

The job now is to migrate meaning:

- Profile becomes timeline seed
- Interview becomes pass engine
- Memory Triggers becomes contextual era support
- Timeline becomes visible Pass 2A output
- Lori becomes the runtime guide across all panes

This should be treated as a **behavioral migration**, not a total redesign.

The UI already has the right rooms.
Now those rooms need to obey the new Lorevox architecture.
