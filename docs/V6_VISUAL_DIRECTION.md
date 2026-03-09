# Lorevox v6 Visual Direction
**Status:** Design specification — not yet implemented
**Source:** Synthesized from v5.5 audit, 20-persona cohort findings, and UI/UX research review
**Goal:** Softer, richer, more dimensional — not trendier. Still serious enough for memoir, grief, and inheritance.

---

## 1. Color System

### 1.1 Background Layers (replace pure black)

| Layer | v5.5 (current) | v6 target | Notes |
|---|---|---|---|
| App shell / outermost | `#0b0b0c` | `#14151a` | Violet-tinted near-black |
| Panel background | `#111214` | `#181a20` | Slightly elevated, cooler |
| Card surface | `#1a1c20` | `#1d2027` | Readable separation from panel |
| Active / hover card | `#1e2028` | `#22252e` | ~8% lighter than card |
| Modal / overlay | `#23262e` | `#282c36` | Glassmorphism candidate |
| Border (default) | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.08)` | Slightly more visible |
| Border (active) | `rgba(255,255,255,0.12)` | `rgba(255,255,255,0.16)` | Clearer elevation signal |

**Rule:** No surface should be pure `#000000`. The tint direction is violet-indigo, not blue-gray.

---

### 1.2 Accent Palette (replace mono-amber)

v5.5 uses amber for almost everything. v6 gives each function its own color.

| Role | v5.5 | v6 target | Hex | Usage |
|---|---|---|---|---|
| Trust / primary action | amber | Soft indigo | `#6c8ef5` | Buttons, active tabs, primary CTA |
| Capture / success | amber | Fresh teal-green | `#3ecf8e` | "Captured", saved states, progress fill |
| Warm memory / highlight | amber | Muted amber-coral | `#e8925a` | Memory triggers, emotional moments, family |
| AI / reflective | — | Digital lavender | `#9b8ec4` | Lori status, AI summaries, memoir mode |
| Youth / energy | — | Lime-teal | `#5ef0b0` | Youth mode accents, vibrant theme |
| Warning / caution | amber | Warm amber (retained) | `#d97706` | Errors, overwrite warnings only |
| Destructive | red | Deep coral-red | `#e05a5a` | Delete, irreversible actions |

**Rule:** Amber is demoted to warnings only. It is no longer the primary brand color.

---

### 1.3 Text Colors

| Role | v5.5 | v6 target |
|---|---|---|
| Primary text | `#f1f5f9` | `#e8eaf0` — very slightly warm |
| Secondary text | `#94a3b8` | `#8a93a8` — same range, slightly warmer |
| Muted / metadata | `#475569` | `#4a5168` |
| Disabled | `#334155` | `#383e52` |
| Link / emphasis | amber | `#6c8ef5` indigo |

---

## 2. Two-Theme System

Do not rebuild the shell. Add theme personality as a CSS variable swap.

### Theme A: Reflective (default)
- Current archival tone, softened with the v6 colors above
- Lavender and muted coral as accents
- Slower, calmer microinteractions
- Lori status: lavender pulse
- For: memoir, obituary, family history, grief contexts

### Theme B: Vibrant
- Same shell, same layout
- Lime-teal and indigo as primary accents
- Slightly faster transitions
- Higher color saturation on cards and progress
- Lori status: teal pulse
- For: youth mode, personal archive, identity-forward use cases

**Implementation:** Single `data-theme="reflective|vibrant"` attribute on `<body>`. CSS variables do the rest. No structural changes required.

---

## 3. Youth Mode — Visual Changes (not just section changes)

Youth mode currently toggles sections. v6 should also toggle visuals.

When `youthMode = true`:

| Element | Default | Youth Mode |
|---|---|---|
| Theme | Reflective | Vibrant (auto) |
| Accent | Lavender + coral | Lime-teal + indigo |
| Roadmap dots | Muted circles | Filled with lime glow |
| Empty states | Minimal text | Illustrated / more expressive copy |
| Memory Trigger chips | Subdued | Colorized by category |
| Progress fill | Teal-green | Lime-teal with subtle pulse |
| Memoir framing default | Chronological | Thematic (auto) |
| Lori greeting | Warm, measured | More conversational, shorter prompts |

**Rule:** Youth mode feels more alive, not younger. No infantilizing design. Still serious.

---

## 4. Surface Depth — Tactile Improvements

Replace visual flatness with dimensional layering. No full glassmorphism — just controlled depth.

### 4.1 Cards
```css
/* v6 card baseline */
background: #1d2027;
border: 1px solid rgba(255,255,255,0.08);
border-radius: 10px;
box-shadow:
  0 1px 2px rgba(0,0,0,0.4),
  inset 0 1px 0 rgba(255,255,255,0.04); /* subtle inner highlight */
```

### 4.2 Active / selected cards
```css
background: #22252e;
border-color: rgba(108,142,245,0.3); /* indigo glow at edge */
box-shadow:
  0 0 0 1px rgba(108,142,245,0.15),
  0 2px 8px rgba(0,0,0,0.5);
```

### 4.3 Modal / overlay
```css
background: rgba(28,30,38,0.85);
backdrop-filter: blur(16px);
border: 1px solid rgba(255,255,255,0.1);
```
Light glassmorphism for modals only — not panels or sidebars.

### 4.4 Texture grain (optional, low priority)
```css
/* Overlay on app shell only */
background-image: url("data:image/svg+xml,..."); /* subtle noise SVG */
opacity: 0.025;
```
Adds warmth without visual noise. Skip if it causes performance issues.

---

## 5. Lori Panel — Ambient, Not Replaced

Keep the right rail. Do not move to ambient-only.

### Changes:
- **Status pulse:** Replace spinning dot with a soft breathing glow
  - Thinking: lavender `#9b8ec4` at 60–100% opacity, 2s cycle
  - Drafting: indigo `#6c8ef5`, faster 1s cycle
  - Ready: teal-green `#3ecf8e`, slow 4s cycle, very low amplitude
- **Collapse mode:** In focus view, Lori panel collapses to a 48px sliver showing only the status glow and a "↔ Expand" handle
- **Chat bubbles:** Lori bubbles get a very faint lavender tint (`rgba(155,142,196,0.06)` background). User bubbles stay neutral.
- **No sentiment color shifting yet** — implement after voice input is working

---

## 6. Motion Language

| Interaction | v5.5 | v6 |
|---|---|---|
| Tab switch | Instant | 120ms fade-through |
| Card hover | Static | 80ms scale(1.01) + border brightens |
| Capture success | Color change | "Bloom" — dot expands and settles, 300ms |
| Section complete | Dot color change | Dot fills with teal, brief 200ms pulse |
| Modal open | Instant | 150ms slide-up + fade |
| Roadmap item done | Static check | Checkmark draws in, 250ms |
| Skeleton loading | Spinner | Shimmer in lavender (`#9b8ec4` → `#6c6c8a`) |

**Rule:** Nothing longer than 350ms for functional transitions. Decorative animations can go to 500ms.

---

## 7. Typography Adjustments

No font changes required. Adjust weight and sizing:

| Element | v5.5 | v6 |
|---|---|---|
| Section headers | `text-sm font-semibold` | `text-sm font-semibold tracking-wide uppercase` in reflective; normal in vibrant |
| Card labels | `text-xs text-slate-500` | `text-xs` with slight letter-spacing |
| Lori chat text | Default | `leading-relaxed` — slightly more air |
| Empty states | Small muted text | Larger, centered, with icon above |
| Tab labels | Text only | Text + small emoji/icon in vibrant theme |

---

## 8. Roadmap Sidebar — Story Arc, Not Checklist

The 37-item vertical list reads as a task manager.

### v6 changes:
- Group items into **life phases** visually: Foundations / Early Life / Middle Years / Later Life / Legacy — with a faint divider and phase label between groups
- Done sections: filled dot + dimmed label (de-emphasize completed, don't delete)
- Active section: indigo left-border accent + slightly brighter label
- Locked/future sections: muted, no hover state until previous complete
- Progress shown as a thin fill bar running down the left edge of the sidebar — fills as sections complete

---

## 9. Priority Order for Implementation

| Priority | Change | Effort | Impact |
|---|---|---|---|
| P0 | Background tint (#14151a system) | 30 min | Immediately less morbid |
| P0 | Amber demotion — replace with indigo as primary | 1 hr | Removes industrial feel |
| P1 | Teal-green for capture/success states | 30 min | Feels more alive |
| P1 | Lavender for Lori / AI states | 30 min | Humanizes the AI |
| P1 | Card depth (border + inner glow) | 1 hr | More dimensional |
| P2 | Two-theme system (Reflective / Vibrant) | 2 hr | Unlocks youth mode visuals |
| P2 | Youth mode visual treatment | 2 hr | Fixes weak cohort fit for young personas |
| P2 | Lori breathing pulse + collapse mode | 1 hr | Ambient, not robotic |
| P3 | Roadmap sidebar life-phase grouping | 2 hr | Story arc feel |
| P3 | Motion language (transitions + bloom) | 3 hr | Alive, not static |
| P4 | Skeleton loading states | 1 hr | Polish |
| P4 | Texture grain overlay | 30 min | Warmth (optional) |

**Total estimated effort: ~15 hours for full v6 pass**
**P0+P1 alone: ~3.5 hours — ships 80% of the benefit**

---

## 10. What v6 Should Feel Like

> Trustworthy enough for a 75-year-old's life story.
> Alive enough for a 22-year-old building their own archive.
> Warm enough to sit with grief.
> Bright enough to celebrate a life.

Not trendy. Not morbid. A studio that feels like it's been there for people.
