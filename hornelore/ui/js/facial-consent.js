/* ═══════════════════════════════════════════════════════════════
   facial-consent.js — Facial Expression Analysis consent gate
   Lorevox v7.1
   Load order: after emotion-ui.js, before any LoreVoxEmotion.start()

   Purpose:
   - Blocks camera/MediaPipe activation until explicit, informed consent
     has been given for facial expression analysis.
   - Consent is session-scoped: granted once per page load.
   - Provides a clear safety explanation of what is detected,
     what stays on-device, and what is sent to the backend.
   - Resolves the gap identified in the 2026-03-19 validation report:
     "no safety questions about facial recognition / facial expression
      analysis before camera use".
═══════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* ── State ─────────────────────────────────────────────────── */
  let _consentGranted  = false;   // true once user confirms
  let _consentDeclined = false;   // true if user explicitly declined
  let _pendingResolve  = null;    // Promise resolver waiting on consent answer

  /* ── Public API ─────────────────────────────────────────────── */
  const FacialConsent = {

    /**
     * Returns true if consent has been granted this session.
     */
    isGranted() { return _consentGranted; },

    /**
     * Returns true if the user explicitly declined this session.
     */
    isDeclined() { return _consentDeclined; },

    /**
     * Show the consent overlay if consent has not yet been given.
     * Returns a Promise that resolves to true (granted) or false (declined).
     * If consent was already given, resolves immediately.
     */
    request() {
      if (_consentGranted)  return Promise.resolve(true);
      if (_consentDeclined) return Promise.resolve(false);

      return new Promise((resolve) => {
        _pendingResolve = resolve;
        _showOverlay();
      });
    },

    /**
     * Called by the consent overlay's confirm button.
     * Internal — exposed on window for inline onclick handlers.
     */
    _confirm() {
      _consentGranted  = true;
      _consentDeclined = false;
      _hideOverlay();
      console.log('[Lorevox] Facial expression consent: GRANTED');
      if (_pendingResolve) { _pendingResolve(true); _pendingResolve = null; }
    },

    /**
     * Called by the consent overlay's decline button.
     */
    _decline() {
      _consentGranted  = false;
      _consentDeclined = true;
      _hideOverlay();
      console.log('[Lorevox] Facial expression consent: DECLINED');
      if (_pendingResolve) { _pendingResolve(false); _pendingResolve = null; }
    },

    /**
     * Reset consent state (e.g. when a new person is selected).
     */
    reset() {
      _consentGranted  = false;
      _consentDeclined = false;
      _pendingResolve  = null;
    },
  };

  /* ── Overlay rendering ──────────────────────────────────────── */
  function _showOverlay() {
    let overlay = document.getElementById('facialConsentOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'facialConsentOverlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = _html();
    overlay.classList.remove('hidden');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'fcoTitle');
    // Trap focus on the confirm button
    const btn = overlay.querySelector('#fcoConfirmBtn');
    if (btn) setTimeout(() => btn.focus(), 80);
  }

  function _hideOverlay() {
    const overlay = document.getElementById('facialConsentOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function _html() {
    return `
<div class="fco-box" role="document">

  <div class="fco-icon" aria-hidden="true">✦</div>

  <h2 class="fco-title" id="fcoTitle">Before we turn on the camera</h2>

  <p class="fco-intro">
    Lori can use your camera to gently adapt how she interviews you —
    slowing down when you seem tired, offering space when things feel hard.
    To do this, Lorevox uses <strong>facial expression analysis</strong>.
  </p>

  <!-- What it does -->
  <div class="fco-section">
    <div class="fco-section-label">What the camera detects</div>
    <ul class="fco-list">
      <li>Facial geometry (eyebrow position, lip corners, eye openness)</li>
      <li>Derived emotional signals — e.g. "engaged", "reflective", "tired", "distressed"</li>
      <li>How long that signal has been present</li>
    </ul>
  </div>

  <!-- What stays private -->
  <div class="fco-section">
    <div class="fco-section-label">What is <em>never</em> saved or transmitted</div>
    <ul class="fco-list">
      <li>Video frames — discarded immediately after processing</li>
      <li>Raw emotion labels (e.g. "sadness", "fear") — these never leave your browser</li>
      <li>Facial landmarks or biometric data</li>
    </ul>
  </div>

  <!-- What is sent -->
  <div class="fco-section">
    <div class="fco-section-label">What is sent to Lorevox</div>
    <ul class="fco-list">
      <li>Only a general state label — e.g. <em>"reflective"</em> or <em>"distressed"</em></li>
      <li>A confidence score and duration</li>
      <li>No image, no biometric data, no identity information</li>
    </ul>
  </div>

  <!-- Safety note -->
  <div class="fco-safety">
    <span class="fco-safety-icon" aria-hidden="true">⚠</span>
    <span>
      This is <strong>not facial recognition</strong> — Lori cannot identify who you are.
      This technology is used only to support the pace and tone of the interview.
      You can turn it off at any time using the <em>Affect-aware</em> toggle.
    </span>
  </div>

  <!-- Confirmation question -->
  <div class="fco-confirm-question">
    <label class="fco-checkbox-label">
      <input type="checkbox" id="fcoUnderstoodCheck" onchange="document.getElementById('fcoConfirmBtn').disabled=!this.checked" />
      I understand that facial expression analysis will be used to adapt Lori's interview style,
      and that no video or biometric data is stored or transmitted.
    </label>
  </div>

  <!-- Actions -->
  <div class="fco-actions">
    <button
      id="fcoConfirmBtn"
      class="fco-btn fco-btn-primary"
      disabled
      onclick="window.FacialConsent._confirm()">
      Allow camera — start affect-aware mode
    </button>
    <button
      class="fco-btn fco-btn-ghost"
      onclick="window.FacialConsent._decline()">
      No thanks — continue without camera
    </button>
  </div>

  <p class="fco-footer">
    You can change this at any time using the <em>Affect-aware</em> toggle in the interview panel.
  </p>

</div>`;
  }

  /* ── Expose globally ─────────────────────────────────────────── */
  global.FacialConsent = FacialConsent;

})(typeof window !== 'undefined' ? window : global);
