/* ═══════════════════════════════════════════════════════════════
   affect-bridge.js — Lorevox v7.4A
   Authoritative bridge: browser affect events → state.session.visualSignals

   Data flow:
     emotion-ui.js (MediaPipe callback)
       → AffectBridge74.consume()
       → state.session.visualSignals
       → buildRuntime71() [prefers live signal; falls back to synthetic if stale]
       → WebSocket payload (visual_signals block)
       → prompt_composer.py

   Load order: after state.js, before emotion-ui.js
   This is the single authoritative write path for visual affect data.
   The deprecated postAffectEvent() POST in emotion.js is non-authoritative
   and must not be used alongside this bridge.
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Ensure state.session has the required 7.4 fields.
     Safe to call multiple times — no-ops if already present. */
  function ensureSession74() {
    if (typeof state === "undefined") return null;
    if (!state.session) state.session = {};

    if (!state.session.visualSignals) {
      state.session.visualSignals = {
        affectState:     null,
        confidence:      0,
        gazeOnScreen:    null,
        blendConfidence: 0,
        timestamp:       null,
      };
    }

    if (!state.session.affectBaseline) {
      state.session.affectBaseline = {
        active:      false,
        established: false,
        startedAt:   null,
        samples:     [],
        summary:     null,
      };
    }

    return state.session;
  }

  /* ── consume() ─────────────────────────────────────────────────
     Called from onBrowserAffectEvent() in emotion-ui.js on each
     affect event. Writes into state.session.visualSignals and
     accumulates baseline samples when the baseline window is open. */
  function consume(event, extras) {
    extras = extras || {};
    const session = ensureSession74();
    if (!session || !event) return;

    const signals = {
      affectState:     event.affectState || null,
      confidence:      Number(event.confidence || 0),
      gazeOnScreen:    (extras.gazeOnScreen !== undefined) ? extras.gazeOnScreen : null,
      blendConfidence: Number(extras.blendConfidence !== undefined
                              ? extras.blendConfidence
                              : (event.confidence || 0)),
      timestamp:       Date.now(),
    };

    session.visualSignals = signals;

    // Accumulate baseline samples while calibration window is open
    if (session.affectBaseline && session.affectBaseline.active) {
      session.affectBaseline.samples.push({
        affectState: signals.affectState,
        confidence:  signals.confidence,
        timestamp:   signals.timestamp,
      });
    }
  }

  /* ── beginBaselineWindow() ─────────────────────────────────────
     Called when camera consent is granted during onboarding.
     Starts accumulating affect samples for baseline computation. */
  function beginBaselineWindow() {
    const session = ensureSession74();
    if (!session) return;

    session.affectBaseline.active      = true;
    session.affectBaseline.established = false;
    session.affectBaseline.startedAt   = Date.now();
    session.affectBaseline.samples     = [];
    session.affectBaseline.summary     = null;
  }

  /* ── finalizeBaseline() ────────────────────────────────────────
     Called at end of onboarding warm-up window.
     Requires >= 5 samples; computes coarse session-normal summary.
     Returns true if baseline was successfully established. */
  function finalizeBaseline() {
    const session = ensureSession74();
    if (!session) return false;

    const baseline = session.affectBaseline;
    const samples  = baseline.samples || [];

    if (samples.length < 5) {
      // Not enough data — do not set established; leave for retry
      baseline.active      = false;
      baseline.established = false;
      baseline.summary     = null;
      console.warn('[AffectBridge74] Baseline finalization failed: fewer than 5 samples (' + samples.length + ')');
      return false;
    }

    // Compute mode of affect states during calm window
    const counts = {};
    for (const s of samples) {
      const k = s.affectState || 'steady';
      counts[k] = (counts[k] || 0) + 1;
    }
    const neutralAffect = Object.entries(counts)
      .sort(function (a, b) { return b[1] - a[1]; })[0][0];

    baseline.summary = {
      neutralAffect: neutralAffect,
      sampleCount:   samples.length,
      capturedAt:    Date.now(),
    };
    baseline.active      = false;
    baseline.established = true;
    baseline.samples     = []; // clear raw samples — summary only

    console.log('[AffectBridge74] Baseline established:', baseline.summary);
    return true;
  }

  /* ── getVisualSignals() ────────────────────────────────────────
     Returns current visualSignals or null if state not ready. */
  function getVisualSignals() {
    const session = ensureSession74();
    return session ? session.visualSignals : null;
  }

  /* ── isBaselineEstablished() ───────────────────────────────────
     Returns true only when a valid baseline summary exists.
     Prompt directives must check this before firing. */
  function isBaselineEstablished() {
    const session = ensureSession74();
    return !!(session && session.affectBaseline && session.affectBaseline.established);
  }

  /* ── reset() ───────────────────────────────────────────────────
     Called on session end or person change.
     Clears visual signals and baseline without touching other state. */
  function reset() {
    const session = ensureSession74();
    if (!session) return;

    session.visualSignals = {
      affectState:     null,
      confidence:      0,
      gazeOnScreen:    null,
      blendConfidence: 0,
      timestamp:       null,
    };

    session.affectBaseline = {
      active:      false,
      established: false,
      startedAt:   null,
      samples:     [],
      summary:     null,
    };
  }

  /* ── Public API ─────────────────────────────────────────────── */
  window.AffectBridge74 = {
    consume:                consume,
    beginBaselineWindow:    beginBaselineWindow,
    finalizeBaseline:       finalizeBaseline,
    getVisualSignals:       getVisualSignals,
    isBaselineEstablished:  isBaselineEstablished,
    reset:                  reset,
  };

})();
