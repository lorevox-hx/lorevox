# Lorevox v7.1 — Master Migration Plan
**Written:** 2026-03-17  
**Author:** Chris + OpenAI  
**Status:** Review draft — grounded in the approved v7.0 plan and extended for 7.1 architecture

> This document updates the original `MOVE_TO_V7.md` into a `v7.1` migration plan.  
> v7.0 established the shell and core inversion: **Lori is the app.**  
> v7.1 makes that architecture smarter, safer, and more humane by adding:
> - the **Timeline Spine**
> - the **two-pass interview model**
> - **affect support**
> - **aging / cognitive support**
> - a healthier Lori behavior model
> - scene capture and narrative intelligence

---

## The v7.1 Vision in One Sentence

**Lori is the guide. The timeline is her map. The archive is the truth.**

v7.0 inverted the interface so Lori became the visible center of the product rather than a panel inside a data tool. v7.1 keeps that inversion, but adds a deeper intelligence model: Lori no longer interviews blindly. She begins with date of birth and birthplace, builds a life timeline, and then uses that structure to guide a safer, more relevant, more memory-friendly interview.

---

## What Changes vs. v7.0

| Aspect | v7.0 | v7.1 |
|---|---|---|
| Core idea | Lori is the app | Lori is the guide, the timeline is her map |
| Interview logic | Natural conversation + extraction | **Two-pass model**: timeline first, narrative depth second |
| Opening | Lori begins naturally | **DOB + birthplace seed the timeline spine** |
| Prompting | Context-aware | **Timeline-aware + affect-aware + aging-aware** |
| Affect | Layered emotion detection | **Affect support layer** with smoothing, directives, TTS shaping |
| Aging support | Not formalized | **Recognition-based cognitive support** for older narrators |
| Timeline | Events appear as extracted facts | **Timeline Spine** exists first, then deepens over time |
| UI migration | Floating Lori shell | Existing shell reinterpreted around passes, life periods, and timeline seed |
| Lori persona | Warm interviewer | **Healthy interviewer**: trauma-aware, non-interrogative, dignity-preserving |

---

## The v7.1 Architecture in One Diagram

```text
Profile Seed (DOB + birthplace)
        ↓
Timeline Spine (Pass 2A)
        ↓
Narrative Deepening (Pass 2B)
        ↓
Archive / History / Scene Capture
        ↓
Memoir / Obituary / Family History Outputs
```

And at runtime:

```text
camera/audio cues
        ↓
affect support layer
        ↓
session vitals + cognitive support
        ↓
prompt composer / Lori
        ↓
TTS state mapper (P335)
```

---

## Core Doctrine Carried Forward

The README doctrine still governs v7.1: **ARCHIVE → HISTORY → MEMOIR**. Archive is immutable source material, History is structured interpretation, and Memoir is the editable narrative layer. Contradictions are preserved, human edits are sacred, and the AI never becomes the authority over a person's own life. fileciteturn12file6

v7.1 adds three operational doctrines on top of that:

1. **Timeline before depth.**  
   Lori should know where a person is in life before she asks for deeper scenes and meaning.

2. **Affect is runtime support, not truth.**  
   Camera- or voice-derived states are soft hints that shape pacing and delivery, not historical facts.

3. **Recognition beats recall when memory is strained.**  
   Lori should be able to shift from open-ended recall to recognition-based support when aging, fatigue, or confusion make open recall harder.

---

## The Two-Pass Interview Model

### Pass 1 — Vocabulary + Identity Seed
This happens at profile start and early conversation.

Required fields:
- Date of birth
- Birthplace
- Preferred name
- Optional language / culture / family map context

Outcome:
- Build the minimum temporal vocabulary
- Initialize the timeline seed
- Make Pass 2A available

### Pass 2A — Timeline Spine
Lori walks from DOB to present, building broad life structure:
- early childhood
- school years
- adolescence
- early adulthood
- midlife
- later life

This is not yet the deep memoir pass. It is a guided walk that establishes:
- rough chronology
- anchor places
- major family phases
- major work phases
- life transitions
- known gaps

### Pass 2B — Narrative Depth
Lori returns to known life periods and deepens:
- scenes
- sensory details
- relationships
- meaning
- legacy
- memoir-quality material

This pass uses the timeline as a support scaffold.

---

## The Opening Sequence (Now Required)

The approved default opening sequence for v7.1 is:

1. **When were you born?**
2. **And where were you born?**
3. **Thank you. That helps me begin building a timeline of your life so I can guide the interview more naturally.**
4. **Are you ready to begin, or do you have any questions for me first?**

This is not optional framing. It is the seed that allows Lori to:
- estimate life stage
- prepare recognition anchors
- surface relevant historical context
- avoid asking blind questions later

---

## Lori 7.1 — Healthy Interviewer Upgrade

v7.1 formalizes Lori's behavior more explicitly than v7.0.

### Lori is now:
- a warm oral historian
- a memoir biographer
- a healthy interviewer
- a dignity-preserving guide
- a runtime-aware companion

### Lori must:
- prefer open prompts over yes/no prompts
- use sensory prompts when a scene is emerging
- accept fragmented memory without forcing linear consistency
- pause, soften, or redirect when distress rises
- ask one good follow-up instead of many stacked questions
- end early rather than push through fatigue

### Lori must never:
- interrogate
- diagnose
- pressure painful disclosure
- act like a questionnaire
- force strict chronology while a memory is still forming
- treat affect inference as truth

---

## New Runtime Layers in v7.1

### 1. Affect Support Layer
The affect layer is now formalized as a runtime subsystem rather than a vague “emotion detection” feature.

Purpose:
- help Lori pace more safely
- simplify when confusion appears
- ground when disengagement appears
- slow and soften TTS delivery
- prepare gentle session close when fatigue persists

Important rule:
- affect states are transient hints only
- they do not enter Archive / History as facts

Normalized runtime states:
- `neutral`
- `engaged`
- `fatigue_hint`
- `confusion_hint`
- `distress_hint`
- `dissociation_hint`

### 2. TTS State Mapping
The same affect support state should shape P335 voice delivery.

Primary controls:
- speech rate
- onset delay
- pause timing
- output energy

Pitch shifts should stay subtle.

### 3. Aging / Cognitive Support Layer
Lorevox now formally supports memory accessibility for older narrators.

Rules:
- recognition often works better than raw recall
- use one question at a time
- avoid forcing exact chronology during recall
- use place, age, family, and era anchors
- protect dignity over precision

Recognition mode examples:
- “Was that before or after you moved?”
- “Does that feel closer to your school years, or later on?”
- “Were you still living at home then, or already on your own?”

---

## UI Architecture — v7.1 Reframe of the Existing Shell

v7.0 planned a floating Lori shell and tabbed content areas. v7.1 keeps that direction, but the tabs now obey a clearer runtime model. The current v6.3 shell can be migrated without a full rewrite. fileciteturn12file1turn12file8

### The tabs now mean:

#### Profile
Becomes the **timeline seed** pane.
- DOB + birthplace are first-class
- saving profile initializes `TimelineSpine`
- readiness now means “timeline seed ready”

#### Interview
Becomes the **pass engine**.
- Pass 2A = timeline walk
- Pass 2B = narrative deepening
- current pass / era / mode should be visible

#### Memory Triggers
Becomes **contextual era support**.
- world events are secondary
- age-anchored cultural context is primary

#### Timeline
Becomes the **visible output of Pass 2A**.
- life periods
- timeline seed
- known places
- saved memories / scenes
- gaps

#### Memoir
Downstream writing mode built from timeline + scenes + reviewed history.

#### Obituary
Separate downstream writing mode with different tone and structure rules.

#### Private Segments
Trust layer for access control, private material, memoir exclusions, and future scene restrictions.

---

## Complete File Plan — v7.1

### New Files

| File | Purpose |
|---|---|
| `docs/timeline_spine_architecture.md` | Defines Pass 1 / Pass 2A / Pass 2B architecture |
| `docs/aging_and_cognitive_support.md` | Recognition-based memory support rules |
| `docs/affect_support_layer.md` | Runtime affect doctrine, smoothing, privacy, prompt directives |
| `docs/lori_behavior_model.md` | Healthy interviewer behavior model |
| `docs/interview_flow_notes.md` | Practical interview progression notes |
| `docs/memory_scene_capture.md` | Scene model with sensory detail, access designation, preservation info |
| `config/timeline_prompt_flow.yaml` | Timeline pass prompts and recognition anchors |
| `config/lorevox_prompt_library.yaml` | Lori narrative prompt library |
| `config/tts_affect_profiles.yaml` | P335 mapping, smoothing thresholds, consent/privacy rules |
| `lorevox_v7/timeline_builder.py` | Initializes and updates timeline spine |
| `lorevox_v7/cognitive_support.py` | Recognition/light/open mode recommendation |
| `lorevox_v7/affect_engine.py` | Runtime affect smoothing and directive generation |
| `lorevox_v7/tts_state_mapper.py` | Maps runtime state to P335 shaping parameters |
| `docs/LOREVOX_7_1_UI_MIGRATION_PLAN.md` | Maps the current shell into 7.1 behavior |
| `docs/FILE_BY_FILE_PATCH_PLAN.md` | Order and purpose of first JS/UI patch set |

### Modified Files

| File | Change |
|---|---|
| `README.md` | Rewrite for 7.1 doctrine and new runtime layers |
| `ui/7.0.html` or current shell | Retained, but reinterpreted around timeline seed + pass engine |
| `ui/js/state.js` | Add timeline spine, current pass, current era, current mode |
| `ui/js/interview.js` | Replace section-first behavior with pass-aware prompting |
| `ui/js/timeline-ui.js` | Make timeline show spine + life periods as primary |
| `ui/js/app.js` | Initialize timeline spine on profile save and hydrate 7.1 state |
| `server/code/api/routers/chat_ws.py` | Pass runtime context (era, pass, affect directives, cognitive mode) into Lori |
| `server/code/api/prompt_composer.py` | Accept timeline spine, pass, era, support mode, affect directives |
| `server/code/api/db.py` | Add storage helpers for timeline spine and scene records |
| `server/code/api/extract_facts.py` | Distinguish between timeline scaffold updates and deep narrative extraction |

### Retired / De-emphasized Concepts

| File / Concept | 7.1 stance |
|---|---|
| visible structured interview checklist | de-emphasized in the main experience |
| section-first interviewing | replaced by pass-first interviewing |
| emotion as client-only novelty | replaced by formal affect support layer |

---

## Data Model Additions in v7.1

### Timeline Spine
A rough temporal scaffold per person.

Suggested storage:
- `memory/archive/people/<person_id>/timeline/spine.json`
or DB equivalent

Contains:
- birth date
- birth place
- life periods
- rough start/end years
- gap notes

### Scene Records
A narrative unit richer than a simple event.

Fields:
- `scene_id`
- `title`
- `temporal_context`
- `location`
- `people`
- `summary`
- `sensory_details`
- `emotional_tone`
- `transcript_reference`
- `access_designation`
- `preservation`
- `associated_memorabilia`
- `scene_value`

### Runtime Session Vitals (still missing)
v7.1 strongly implies a unified runtime state object that should be built next.

Recommended future file:
- `lorevox_v7/session_vitals.py`

Would unify:
- affect state
- fatigue trajectory
- pause duration
- session length
- current pass
- current era
- current mode
- close recommendations

---

## Build Order — v7.1

Follow this sequence. Each phase should produce something usable.

### Phase 0 — Preserve v7.0 Foundation
Carry forward:
- offline setup doctrine
- `.env` auto-load
- basic shell
- voice + mic stability fixes
- extraction pipeline groundwork
- safety logic already in v6.3/v7.0 plan fileciteturn12file9turn12file10

**Checkpoint:** Current system still runs and speaks.

### Phase 1 — Timeline Seed
1. Add DOB + birthplace handling as first-class fields
2. On profile save, initialize `TimelineSpine`
3. Persist the spine locally / in archive
4. Surface “Timeline Seed Ready” in UI

**Checkpoint:** Creating a person with DOB + birthplace generates a life-period scaffold.

### Phase 2 — UI Reframe
1. Rename “Interview Roadmap” to “Life Periods”
2. Make Interview header show:
   - current pass
   - current era
   - current mode
3. Make Timeline tab render life periods first
4. Keep world context secondary

**Checkpoint:** The shell visibly behaves like 7.1 even before full backend orchestration.

### Phase 3 — Pass Engine
1. `Chronological` → Pass 2A
2. `Thematic` → Pass 2B
3. Interview prompts become timeline-aware
4. Recognition support appears when needed

**Checkpoint:** Lori can walk a life from birth to present and then deepen an era later.

### Phase 4 — Affect Support Integration
1. Wire `affect_engine.py` into runtime loop
2. Feed temporary directives into prompt composer
3. Feed same state into `tts_state_mapper.py`
4. Keep all affect data out of Archive / History by default

**Checkpoint:** Lori paces and sounds safer without polluting truth records.

### Phase 5 — Aging / Cognitive Support Integration
1. Add recognition mode switching
2. Adapt prompts when confusion / recall strain appears
3. Use place / age / family anchors
4. Keep dignity and low cognitive load central

**Checkpoint:** Lori becomes more accessible for older narrators and memory strain.

### Phase 6 — Scene Capture
1. Promote “Save as Memory” into scene candidate generation
2. Attach temporal context and sensory detail
3. Add access designation
4. Store scene records for memoir and timeline enrichment

**Checkpoint:** Timeline and Memoir are now fed by scenes, not just plain answers.

### Phase 7 — Full Orchestration
Build the missing orchestrator.

Recommended next file:
- `lorevox_v7/session_engine.py`

Responsibilities:
- coordinate timeline seed
- coordinate pass routing
- carry affect + cognitive runtime state
- choose prompt mode
- recommend session close
- hand off to extraction / scene capture

**Checkpoint:** 7.1 becomes a coordinated runtime system, not just a collection of modules.

---

## Updated Offline / Local-Only Position

The original v7.0 offline doctrine still stands: Lorevox should work fully offline after initial setup. v7.1 inherits that requirement directly. fileciteturn12file4turn12file5

v7.1 additions do **not** change that doctrine:
- timeline seed is local
- affect support is local
- cognitive support is local
- TTS state mapping is local
- no raw camera data should leave the machine
- no cloud sync is introduced

---

## New Open Questions for v7.1

1. **Where should the Timeline Spine live first?**  
   Local JSON in archive folders, DB tables, or both?

2. **How visible should pass state be in the UI?**  
   Minimal header text, or more explicit pass controls?

3. **Should Pass 2A be mandatory before Pass 2B?**  
   Recommendation: mostly yes, but Lori may still allow shallow deepening if the narrator begins with a vivid scene.

4. **How should Recognition Mode be surfaced?**  
   Automatically and silently, or with a visible “gentle mode” explanation?

5. **When does a saved memory become a Scene record automatically?**  
   Immediately, or after a lightweight review step?

6. **Should affect support be enabled by default?**  
   Recommendation: off by default until consent is given.

7. **How should aging/cognitive support interact with memoir drafting?**  
   Recommendation: use it only in runtime interviewing, not as a label in final outputs.

---

## Current State of the Migration

The v7.0 foundation remains the approved base: Lori-centered UI, structured extraction, offline-first doctrine, local model setup, and profile/timeline/memoir tabs. fileciteturn12file1turn12file13

v7.1 is the next layer:
- not a rejection of v7.0
- not a total redesign
- but a deepening of Lori's intelligence and interview method

The most important upgrade is simple:

**v7.0 gave Lori a shell.  
v7.1 gives Lori a map, a healthier method, and runtime support layers that make her safer and more useful.**

---

*Lorevox v7.1 — local-first, privacy-first, human-first. Lori is the guide. The timeline is the map. The archive is the truth.*
