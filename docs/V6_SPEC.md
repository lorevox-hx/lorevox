# Lorevox v6 Visual Specification
**Author:** Chris / Lorevox
**Status:** Approved for implementation
**Source:** v5.5 audit + cohort findings + design research review

---

## 1) Keep the product shape, change the mood

Do not throw away the current shell. 5.5 already has a stable three-zone structure with sidebar, main stage, and Lori panel, and the whole theme is still driven by a near-black/amber token set: `--bg:#0b0b0c`, `--panel:#111214`, `--card:#0f1113`, `--accent:#d97706`, with a `300px / 1fr / 420px` grid.

For v6:
* keep the three-zone architecture
* keep the card workflow
* keep the persistent Lori presence
* change the color system, surface depth, and responsive behavior

---

## 2) Replace the base color system

### Current problem
The current palette is too close to black and too dependent on amber, which makes the whole app feel heavier and more industrial than it needs to.

### v6 palette — Reflective Dark theme (default)

```css
:root{
  --bg:#14161b;
  --panel:#1a1d24;
  --card:#20242d;
  --card-2:#262b36;
  --elev:#2c3240;
  --ink:#eef2f7;
  --muted:#a9b3c3;
  --border:#31384a;

  --accent-primary:#7c9cff;   /* indigo-blue */
  --accent-secondary:#c6a7ff; /* digital lavender */
  --accent-warm:#ff9b6b;      /* warm coral */
  --accent-good:#6ee7a8;      /* fresh green */
  --accent-caution:#f6c453;   /* gold, not hazard amber */
  --accent-danger:#ff7b7b;
}
```

Why this works:
* softer background than pure black
* richer chroma without looking childish
* blue/indigo builds trust
* lavender supports reflection and AI states
* coral adds warmth for personal/family material
* green still works for capture/success states

---

## 3) Two visual themes

### Theme A: Reflective (default)
For memoir, obituary, legacy, grief, older users
* background: `#14161b`
* panel: `#1a1d24`
* primary accent: `#7c9cff`
* secondary accent: `#c6a7ff`
* warm accent: `#ff9b6b`

### Theme B: Vibrant
For youth mode, early-life journaling, active memory capture
* background: `#151822`
* panel: `#1c2130`
* card: `#252b3a`
* primary accent: `#79f2a3`
* secondary accent: `#8bb8ff`
* tertiary accent: `#d1a9ff`
* celebration accent: `#ffe066`

Implementation: single `data-theme="reflective|vibrant"` on `<body>`. CSS variables swap. No structural changes.

---

## 4) Surface hierarchy through tone

Surface ladder:
* app background: `#14161b`
* sidebar/chat panel: `#1a1d24`
* standard card: `#20242d`
* interactive card: `#262b36`
* modal/focus surface: `#2c3240`

Rules:
* cards must always be lighter than the parent surface
* active cards get a faint 1px inner border and subtle outer glow
* borders should be cool and thin, not harsh white

```css
box-shadow: 0 1px 0 rgba(255,255,255,.03), 0 8px 24px rgba(0,0,0,.22);
border: 1px solid rgba(255,255,255,.06);
```

---

## 5) Accent usage by meaning

| Meaning | Color | Hex |
|---|---|---|
| Primary navigation / active tab | indigo-blue | `#7c9cff` |
| AI / reflective / summary / drafting | lavender | `#c6a7ff` |
| Captured / success / ready | green | `#6ee7a8` |
| Warm personal/family emphasis | coral | `#ff9b6b` |
| Caution / unsaved / needs review | gold | `#f6c453` |
| Destructive / overwrite risk | red | `#ff7b7b` |

Apply to current UI:
* active tab buttons: blue, not amber
* "Captured answer" chip: green
* "Written with Lori" chip: lavender
* "Edited by hand" chip: coral-outline or gold-outline
* obituary overwrite modal confirm: red-accented
* memoir progress fill: blue or green
* Family/relationship highlights: coral or warm neutral

---

## 6) Layout grid

Current: `300px / 1fr / 420px`

v6: `280px / minmax(720px,1fr) / 360px`

```css
grid-template-columns: 280px minmax(720px,1fr) 360px;
```

Responsive modes:
* xl desktop: full 3-column
* laptop: Lori rail 320px
* tablet: Lori becomes slide-over drawer
* focus mode: centered 940px max-width

---

## 7) Story Stage center pane

* max content width: `920px`
* vertical spacing between cards: `20–24px`
* more breathing room on section headers

Three card types only:
1. **Editorial card** — interview prompts, memoir, obituary text
2. **Data card** — profile, family map, settings
3. **Trigger card** — events, chapter rows, timeline items

---

## 8) Lori panel v6

Panel background: `#1d2230`

State colors:
* Ready: green `#6ee7a8`
* Listening: blue `#7c9cff`
* Thinking: lavender pulse `#c6a7ff`
* Drafting: coral-lavender mix

Changes:
* soft animated status bar under header
* very subtle gradient ring around state icon
* reduced hard borders
* slightly larger message bubbles with more padding
* collapse to 48px sliver in focus mode

---

## 9) Typography

Fonts unchanged (Inter + Cormorant Garamond).

| Element | Size |
|---|---|
| Page title | 28–32px serif |
| Section headers | 18–20px sans |
| Card labels | 13px (reduce uppercase overuse) |
| Body copy | 15–16px |
| Metadata | 12–13px |

Text colors:
* primary: `#eef2f7`
* secondary: `#a9b3c3`
* tertiary/helper: `#8893a7`

---

## 10) Motion system

* tab/content fade: `180ms ease`
* card hover lift: `translateY(-1px)` + border brighten
* status chips: soft color bloom, no bouncing
* roadmap completion: smooth fill
* Lori thinking: breathing glow, not spinner

4 signature microinteractions:
1. active tab underline glides
2. saved/captured chip blooms softly
3. Lori state breathes gently
4. timeline item expands with fade

---

## 11) Memory Triggers grid

```css
grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
gap: 14px;
```

Category color bars:
* History = blue
* Everyday Life = coral
* Life & Tradition = lavender

---

## 12) Youth mode visual treatment

When `youthMode = true`:
* use Vibrant theme
* switch roadmap header to open-ended language
* increase color separation
* make Memory Triggers more prominent
* default memoir framing to early-life or theme-based
* progress labels: Started → Building → Ready to draft

---

## 13) Obituary mode

* force Reflective theme regardless of global theme
* lavender + warm coral, not bright green
* draft provenance chips:
  * Filled from Profile = muted blue
  * Written with Lori = lavender
  * Edited by hand = warm coral outline

---

## 14) Background texture

```css
background:
  radial-gradient(circle at top left, rgba(124,156,255,.08), transparent 28%),
  radial-gradient(circle at bottom right, rgba(198,167,255,.06), transparent 26%),
  #14161b;
```

Grain overlay: 2–3% noise on app background only.
Backdrop blur: overlays and modals only.

---

## 15) Implementation phases

### v6.0
- Replace color tokens
- Split accent meanings
- Lighten surfaces
- Reduce amber dependence
- Tighten typography/colors
- Resize rails

### v6.1
- Add Reflective vs Vibrant themes
- Style Youth Mode visually
- Improve Lori presence
- Redesign Memory Triggers grid

### v6.2
- Richer motion system
- Background texture and soft gradients
- Refine obituary/memoir provenance styling
- Optimize tablet/drawer behavior
