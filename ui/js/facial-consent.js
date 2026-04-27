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

  /* ── Constants ──────────────────────────────────────────────── */
  const LS_KEY = 'lorevox_facial_consent_granted';

  /* ── State ─────────────────────────────────────────────────── */
  // WO-02: Check localStorage for prior consent (family-friendly persistence).
  // On a family machine, narrators should not have to re-confirm every session.
  let _storedConsent   = false;
  try { _storedConsent = localStorage.getItem(LS_KEY) === 'true'; } catch(_){}

  let _consentGranted  = _storedConsent;  // auto-grant if previously consented
  let _consentDeclined = false;           // true if user explicitly declined
  let _pendingResolve  = null;            // Promise resolver waiting on consent answer

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
      if (_consentGranted) {
        if (_storedConsent) console.log('[Lorevox] Facial expression consent: auto-granted from prior session.');
        return Promise.resolve(true);
      }
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
      _storedConsent   = true;
      try { localStorage.setItem(LS_KEY, 'true'); } catch(_){}
      _hideOverlay();
      console.log('[Lorevox] Facial expression consent: GRANTED (persisted)');
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
     * Reset session consent state (e.g. when a new person is selected).
     * Does NOT clear localStorage — use revokeStored() for that.
     */
    reset() {
      _consentGranted  = _storedConsent;  // WO-02: preserve stored consent on narrator switch
      _consentDeclined = false;
      _pendingResolve  = null;
    },

    /**
     * WO-02: Revoke stored consent entirely (from settings panel).
     * Next camera activation will show the full consent overlay again.
     */
    revokeStored() {
      _consentGranted  = false;
      _consentDeclined = false;
      _storedConsent   = false;
      try { localStorage.removeItem(LS_KEY); } catch(_){}
      console.log('[Lorevox] Facial expression consent: stored consent revoked.');
    },
  };

  /* ── Overlay styles (self-contained — injected on first show) ── */
  // #145: Previously relied on external CSS that was never shipped. Overlay
  // rendered as position:static below the fold, so FacialConsent.request()
  // hung forever because the confirm button was off-screen and never clicked.
  // Inline stylesheet keeps the consent gate self-contained and guaranteed
  // to render correctly regardless of what else is (or isn't) loaded.
  const _STYLE_ID = 'facialConsentOverlayStyles';
  const _CSS = `
#facialConsentOverlay{
  position:fixed; inset:0; z-index:2147483000;
  display:flex; align-items:center; justify-content:center;
  background:rgba(28,22,14,0.72); backdrop-filter:blur(3px);
  padding:24px; box-sizing:border-box; overflow-y:auto;
  font-family:Georgia,"Times New Roman",serif;
  animation:fcoFadeIn 160ms ease-out;
}
#facialConsentOverlay.hidden{ display:none; }
@keyframes fcoFadeIn { from { opacity:0; } to { opacity:1; } }
#facialConsentOverlay .fco-box{
  background:#fdf7ea; color:#2a241a;
  border:1px solid #cbb89a; border-radius:10px;
  box-shadow:0 18px 48px rgba(0,0,0,0.35);
  width:min(560px, 92vw); max-height:90vh; overflow-y:auto;
  padding:28px 30px; box-sizing:border-box;
}
#facialConsentOverlay .fco-icon{
  font-size:30px; color:#7a5a1f; text-align:center; margin-bottom:6px;
}
#facialConsentOverlay .fco-title{
  margin:0 0 10px; font-size:22px; font-weight:600; text-align:center;
  color:#2a241a;
}
#facialConsentOverlay .fco-intro{
  margin:0 0 18px; font-size:15px; line-height:1.5;
}
#facialConsentOverlay .fco-section{ margin:0 0 14px; }
#facialConsentOverlay .fco-section-label{
  font-size:12px; font-weight:700; letter-spacing:0.04em;
  text-transform:uppercase; color:#7a5a1f; margin-bottom:4px;
}
#facialConsentOverlay .fco-list{
  margin:0; padding-left:20px; font-size:14px; line-height:1.45;
}
#facialConsentOverlay .fco-list li{ margin:2px 0; }
#facialConsentOverlay .fco-safety{
  display:flex; gap:10px; align-items:flex-start;
  background:#fbefd0; border:1px solid #e0c57a; border-radius:6px;
  padding:10px 12px; font-size:13px; line-height:1.45; margin:14px 0;
}
#facialConsentOverlay .fco-safety-icon{ font-size:18px; line-height:1; }
#facialConsentOverlay .fco-confirm-question{ margin:14px 0 18px; }
#facialConsentOverlay .fco-checkbox-label{
  display:flex; gap:10px; align-items:flex-start;
  font-size:14px; line-height:1.45; cursor:pointer;
}
#facialConsentOverlay .fco-checkbox-label input[type=checkbox]{
  margin-top:3px; flex-shrink:0;
}
#facialConsentOverlay .fco-actions{
  display:flex; flex-direction:column; gap:8px; margin:10px 0 14px;
}
#facialConsentOverlay .fco-btn{
  padding:10px 16px; font-size:15px; font-weight:600;
  border-radius:6px; cursor:pointer; font-family:inherit;
  border:1px solid transparent;
  transition:background 120ms ease, border-color 120ms ease;
}
#facialConsentOverlay .fco-btn-primary{
  background:#6a4a14; color:#fdf7ea; border-color:#6a4a14;
}
#facialConsentOverlay .fco-btn-primary:hover:not(:disabled){
  background:#553a0f; border-color:#553a0f;
}
#facialConsentOverlay .fco-btn-primary:disabled{
  background:#c5b79b; border-color:#c5b79b; cursor:not-allowed;
}
#facialConsentOverlay .fco-btn-ghost{
  background:transparent; color:#6a4a14; border-color:#cbb89a;
}
#facialConsentOverlay .fco-btn-ghost:hover{
  background:#f3e7c9; border-color:#a08658;
}
#facialConsentOverlay .fco-footer{
  margin:8px 0 0; font-size:12px; color:#6a5a3e; text-align:center;
}
`;

  function _ensureStyles() {
    if (document.getElementById(_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = _STYLE_ID;
    style.textContent = _CSS;
    document.head.appendChild(style);
  }

  /* ── Overlay rendering ──────────────────────────────────────── */
  function _showOverlay() {
    _ensureStyles();
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
