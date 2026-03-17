# Affect Support Layer

## Purpose

The Affect Support Layer helps Lori 7.0 pace interviews more safely and speak more gently by treating visual and conversational affect cues as soft hints, not diagnostic truths.

Lorevox must never present camera or expression analysis as certainty about a narrator's inner emotional state. The purpose of this layer is to support pacing, grounding, and voice modulation — not to label, diagnose, or override the narrator.

## Core Doctrine

- Affect cues are transient hints, not archival facts.
- Visual inference must remain outside the permanent transcript unless explicitly promoted for analytics.
- The camera may suggest fatigue, confusion, distress, or disengagement, but it does not know the narrator's internal truth.
- Lori uses affect to slow down, clarify, ground, pause, or soften — never to pressure.
- Affect support must be local-first, transparent, and optional.

## Consent and Privacy Rules

The narrator must be clearly informed if camera-based affect support is enabled.

Minimum requirements:
- Show that the camera is on.
- Explain that it is used only to help pacing and emotional safety.
- Explain that it runs locally.
- Explain that it can be turned off.
- Do not store raw video in the archive unless separately consented.
- Do not write affect labels into memoir, obituary, or historical truth records.

## Architecture Position

Affect support sits beside — not inside — the interview archive.

camera/audio cues
→ affect engine
→ smoothed state hints
→ session vitals
→ narrative engine / prompt composer
→ Lori response + TTS modulation
