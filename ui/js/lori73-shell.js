/* ═══════════════════════════════════════════════════════════════════
   lori73-shell.js — Lorevox v7.3 Shell Behavior
   ───────────────────────────────────────────────────────────────────
   Scope : Layout shell only.
           - Left nav collapse / expand
           - Lori dock collapse / expand
           - Large-text accessibility toggle
           - Tab context label updates (pass/era badge next to tab)
           - Topbar title sync on tab change

   MUST NOT touch runtime71 pipeline, chat logic, state machine,
   prompt_composer, or any existing JS file.

   All persistent preferences stored in localStorage with lv73.* keys.
═══════════════════════════════════════════════════════════════════ */

/* Safety guard — escape-hatch if state.js hasn't loaded yet */
function _lv73State() {
  return (typeof window.state !== 'undefined') ? window.state : null;
}

/* ── escHtml73: XSS-safe HTML encoding (used by inline-patch fns) ─ */
if (typeof window.escHtml71 === 'undefined') {
  window.escHtml71 = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
}

/* ═══════════════════════════════════════════════════════════════════
   lv73 NAMESPACE — shell controller
═══════════════════════════════════════════════════════════════════ */
window.lv73 = {

  /* ── Left nav collapse / expand ────────────────────────────── */
  collapseNav: function() {
    var nav = document.getElementById('lv73Nav');
    var btn = document.getElementById('btnCollapseNav');
    if (!nav) return;
    var willCollapse = !nav.classList.contains('collapsed');
    nav.classList.toggle('collapsed', willCollapse);
    if (btn) {
      btn.textContent = willCollapse ? '▶' : '◀';
      btn.setAttribute('title', willCollapse ? 'Expand navigation' : 'Collapse navigation');
      btn.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
    }
    try { localStorage.setItem('lv73.nav.collapsed', willCollapse ? '1' : '0'); } catch(e) {}
  },

  /* ── Lori dock collapse ─────────────────────────────────────── */
  collapseDock: function() {
    var dock   = document.getElementById('lv73LoriDock');
    var colBtn = document.getElementById('btnCollapseDock');
    var float  = document.getElementById('btnLoriFloat');
    if (!dock) return;
    dock.classList.add('collapsed');
    if (colBtn) colBtn.setAttribute('aria-expanded', 'false');
    if (float)  float.style.display = 'flex';
    try { localStorage.setItem('lv73.dock.collapsed', '1'); } catch(e) {}
  },

  /* ── Lori dock expand ───────────────────────────────────────── */
  expandDock: function() {
    var dock   = document.getElementById('lv73LoriDock');
    var colBtn = document.getElementById('btnCollapseDock');
    var float  = document.getElementById('btnLoriFloat');
    if (!dock) return;
    dock.classList.remove('collapsed');
    if (colBtn) colBtn.setAttribute('aria-expanded', 'true');
    if (float)  float.style.display = 'none';
    /* Scroll transcript to bottom after reveal */
    var transcript = document.getElementById('chatMessages');
    if (transcript) {
      setTimeout(function() { transcript.scrollTop = transcript.scrollHeight; }, 50);
    }
    try { localStorage.setItem('lv73.dock.collapsed', '0'); } catch(e) {}
  },

  /* ── Large-text accessibility toggle ───────────────────────── */
  toggleLargeText: function() {
    var body = document.body;
    var btn  = document.getElementById('btnLargeText');
    var on   = body.classList.toggle('lv73-large-text');
    if (btn) {
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Reduce text size' : 'Increase text size';
    }
    try { localStorage.setItem('lv73.largeText', on ? '1' : '0'); } catch(e) {}
  },

  /* ── Tab context label (pass / era badge beside Interview tab) ─ */
  updateTabContext: function() {
    var ctx = document.getElementById('navCtxInterview');
    if (!ctx) return;
    var st = _lv73State();
    if (!st || !st.session) { ctx.textContent = ''; return; }
    var pass = st.session.currentPass || 'pass1';
    var era  = st.session.currentEra  || null;
    var label = (pass === 'pass2b') ? '2B' : (pass === 'pass2a') ? '2A' : 'P1';
    if (era) label += '\u00b7' + String(era).slice(0, 4);
    ctx.textContent = label;
  },

  /* ── Topbar title sync ──────────────────────────────────────── */
  updateTopbarTitle: function(tabId) {
    var el = document.getElementById('lv73TopbarTitle');
    if (!el) return;
    var btn = document.getElementById('tab-' + tabId);
    if (btn) {
      var labelEl = btn.querySelector('.lv73-label');
      el.textContent = labelEl ? labelEl.textContent : (tabId.charAt(0).toUpperCase() + tabId.slice(1));
    }
  },

  /* ── Replay last Lori response via TTS ─────────────────────── */
  replayLastResponse: function() {
    /* Prefer TTS if available; fall back to reading the last-response strip */
    if (typeof window.replayLastTts === 'function') {
      window.replayLastTts();
      return;
    }
    var lastPanel = document.getElementById('lastAssistantPanel');
    if (lastPanel && lastPanel.textContent.trim()) {
      if (typeof window.speakText === 'function') {
        window.speakText(lastPanel.textContent.trim());
      }
    }
  },

  /* ── Restore all preferences from localStorage ──────────────── */
  restorePrefs: function() {
    try {
      if (localStorage.getItem('lv73.nav.collapsed') === '1') {
        var nav = document.getElementById('lv73Nav');
        var btn = document.getElementById('btnCollapseNav');
        if (nav) nav.classList.add('collapsed');
        if (btn) {
          btn.textContent = '▶';
          btn.setAttribute('title', 'Expand navigation');
          btn.setAttribute('aria-expanded', 'false');
        }
      }
      if (localStorage.getItem('lv73.dock.collapsed') === '1') {
        this.collapseDock();
      }
      if (localStorage.getItem('lv73.largeText') === '1') {
        document.body.classList.add('lv73-large-text');
        var ltBtn = document.getElementById('btnLargeText');
        if (ltBtn) {
          ltBtn.classList.add('active');
          ltBtn.setAttribute('aria-pressed', 'true');
          ltBtn.title = 'Reduce text size';
        }
      }
    } catch(e) {}
  },

  /* ── Patch showTab to also update shell chrome ──────────────── */
  _patchShowTab: function() {
    var self = this;
    var orig = window.showTab;
    if (typeof orig !== 'function') return;
    window.showTab = function(id) {
      orig(id);
      self.updateTopbarTitle(id);
      self.updateTabContext();
    };
  },

  /* ── Keyboard shortcuts ─────────────────────────────────────── */
  _bindKeyboard: function() {
    var self = this;
    document.addEventListener('keydown', function(e) {
      /* Ctrl+L — toggle Lori dock */
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'l') {
        e.preventDefault();
        var dock = document.getElementById('lv73LoriDock');
        if (dock && dock.classList.contains('collapsed')) self.expandDock();
        else self.collapseDock();
        return;
      }
      /* Ctrl+\ — toggle nav */
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '\\') {
        e.preventDefault();
        self.collapseNav();
        return;
      }
      /* Ctrl+Shift+A — large text toggle (accessibility) */
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'A') {
        e.preventDefault();
        self.toggleLargeText();
      }
    });
  },

  /* ── Boot ───────────────────────────────────────────────────── */
  init: function() {
    this.restorePrefs();
    this._patchShowTab();
    this._bindKeyboard();
    /* Ensure first visible tab title is set */
    var activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
      var id = activeBtn.id ? activeBtn.id.replace('tab-', '') : null;
      if (id) this.updateTopbarTitle(id);
    }
  }
};

/* ── Auto-init on DOMContentLoaded ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  window.lv73.init();
});

/* ═══════════════════════════════════════════════════════════════
   Lorevox 7.4C — Onboarding flow
   Lori introduces herself, explains input/output options,
   offers camera consent (pacing + photo separately),
   and creates the warm-up window for baseline calibration.

   Design principle: this is Lori meeting the user, not a setup wizard.
   Calibration happens invisibly inside the warm-up conversation.
   No clinical language. No "calibrate" or "biometric".

   Call: window.lv74.startOnboarding()
   The flow gates on state.session.onboarding.complete before
   allowing interview pass progression.
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Render a message from Lori into the chat transcript area */
  function loriSay(text) {
    var msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant lv74-onboarding-msg';
    bubble.style.cssText = 'margin-bottom:12px;animation:fadeIn .3s ease;';
    bubble.textContent = text;
    msgs.appendChild(bubble);
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* Render a camera consent UI card */
  function renderCameraConsentCard() {
    var msgs = document.getElementById('chatMessages');
    if (!msgs) return;

    var card = document.createElement('div');
    card.id = 'lv74CameraConsentCard';
    card.style.cssText = [
      'background:rgba(99,102,241,.08)',
      'border:1px solid rgba(99,102,241,.2)',
      'border-radius:10px',
      'padding:14px 16px',
      'margin-bottom:12px',
    ].join(';');

    card.innerHTML = [
      '<div style="font-size:14px;color:#a5b4fc;font-weight:600;margin-bottom:10px;">Camera options</div>',
      '<div style="display:flex;flex-direction:column;gap:8px;">',
        '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:#e2e8f0;">',
          '<input type="checkbox" id="lv74CbPacing" style="width:18px;height:18px;accent-color:#818cf8;">',
          '<span>Use camera for gentle pacing <span style="font-size:12px;color:#64748b;">(helps Lori notice when to slow down or give space)</span></span>',
        '</label>',
        '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:#e2e8f0;">',
          '<input type="checkbox" id="lv74CbPhoto" style="width:18px;height:18px;accent-color:#818cf8;">',
          '<span>Take a profile photo</span>',
        '</label>',
      '</div>',
      '<div style="display:flex;gap:8px;margin-top:14px;">',
        '<button id="lv74BtnCameraOk" style="background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:14px;cursor:pointer;font-weight:600;">Continue</button>',
        '<button id="lv74BtnCameraSkip" style="background:transparent;color:#64748b;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px 14px;font-size:14px;cursor:pointer;">Continue without camera</button>',
      '</div>',
    ].join('');

    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;

    document.getElementById('lv74BtnCameraOk').onclick = function () {
      var pacing = document.getElementById('lv74CbPacing').checked;
      var photo  = document.getElementById('lv74CbPhoto').checked;
      card.remove();
      handleCameraConsent(pacing, photo);
    };
    document.getElementById('lv74BtnCameraSkip').onclick = function () {
      card.remove();
      handleCameraConsent(false, false);
    };
  }

  /* Handle camera consent choices */
  function handleCameraConsent(pacing, photo) {
    if (!window.state || !window.state.session) return;
    window.state.session.onboarding.cameraForPacing     = pacing;
    window.state.session.onboarding.profilePhotoEnabled = photo;

    if (pacing) {
      loriSay("Thank you. Let's take a short moment to get comfortable. You don't need to do anything special — just look toward the screen naturally if that feels comfortable.");

      // Start camera and baseline window
      if (window.AffectBridge74) window.AffectBridge74.beginBaselineWindow();
      if (typeof startEmotionEngine === 'function') {
        startEmotionEngine();
      }

      // Warm-up conversation: baseline captured during these exchanges
      setTimeout(function () {
        loriSay("Is this a good time to begin?");
      }, 2000);
      setTimeout(function () {
        loriSay("How would you like me to address you?");
      }, 5000);
      setTimeout(function () {
        loriSay("Would you like me to speak more slowly, or is this pace comfortable?");
      }, 8000);

      // Finalize baseline after warm-up window (~20s from consent)
      setTimeout(function () {
        if (window.AffectBridge74) {
          var ok = window.AffectBridge74.finalizeBaseline();
          if (!ok) {
            console.warn('[lv74 onboarding] Baseline not established — insufficient samples. Directives will remain inactive.');
          }
        }
        if (photo) renderPhotoOption();
        else transitionToInterview();
      }, 22000);

    } else {
      // No camera — proceed directly
      if (photo) renderPhotoOption();
      else transitionToInterview();
    }
  }

  /* Offer profile photo capture */
  function renderPhotoOption() {
    var msgs = document.getElementById('chatMessages');
    if (!msgs) return;

    loriSay("When you're ready, I can take a photo for your profile. You can keep it, retake it, or skip it.");

    var card = document.createElement('div');
    card.id = 'lv74PhotoCard';
    card.style.cssText = 'margin-bottom:12px;';
    card.innerHTML = [
      '<div style="display:flex;gap:8px;margin-top:8px;">',
        '<button id="lv74BtnTakePhoto" style="background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:14px;cursor:pointer;font-weight:600;">Take photo</button>',
        '<button id="lv74BtnSkipPhoto" style="background:transparent;color:#64748b;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px 14px;font-size:14px;cursor:pointer;">Skip</button>',
      '</div>',
    ].join('');
    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;

    document.getElementById('lv74BtnTakePhoto').onclick = function () {
      card.remove();
      // Photo capture stub — full implementation wires to camera frame grab
      if (window.state && window.state.session) {
        window.state.session.onboarding.profilePhotoCaptured = true;
      }
      loriSay("Got it — I've saved your photo to your profile.");
      transitionToInterview();
    };
    document.getElementById('lv74BtnSkipPhoto').onclick = function () {
      card.remove();
      transitionToInterview();
    };
  }

  /* Mark onboarding complete and hand off to interview */
  function transitionToInterview() {
    if (window.state && window.state.session) {
      window.state.session.onboarding.complete = true;
    }
    loriSay("Whenever you're ready, we can begin at the beginning. I'll start by helping place your story in time.");
    // Allow interview pass progression — ivStart() or equivalent picks up from here
  }

  /* Main onboarding entry point */
  function startOnboarding() {
    if (!window.state || !window.state.session) {
      console.warn('[lv74 onboarding] state not ready — deferring');
      setTimeout(startOnboarding, 300);
      return;
    }
    if (window.state.session.onboarding && window.state.session.onboarding.complete) {
      return; // Already done this session
    }

    // Mark questions as available
    if (window.state.session.onboarding) {
      window.state.session.onboarding.questionsAsked = true;
    }

    // Onboarding script — spoken by Lori, rendered into transcript
    var delay = 0;
    var lines = [
      [0,    "Hello. I'm Lori. I'm here to help you tell your story, at your pace. We can talk, type, pause, skip something, or come back later. Nothing has to be perfect."],
      [2500, "You can speak to me and I can listen and turn your words into text. I can also speak my replies aloud, and everything I say will stay visible on screen. If typing feels easier, that works too."],
      [5500, "As we go, I'll help build your profile, timeline, and a draft of your story with you. You can review and edit those at any time."],
      [8500, "If you'd like, I can also use your camera in two optional ways. First, I can take a profile photo. Second, I can use a short warm-up moment to adjust to your lighting and expressions so I pace the conversation more gently."],
      [11000,"The camera is optional. If you turn it on, it stays on this device. I don't save video, and I don't need the camera to continue."],
      [13500,"Before we begin, do you have any questions about how I work, or would you like me to explain anything again?"],
    ];

    lines.forEach(function (item) {
      setTimeout(function () { loriSay(item[1]); }, item[0]);
    });

    // Show camera consent card after intro lines
    setTimeout(function () {
      loriSay("If you'd like to continue with the camera, here are your options:");
      setTimeout(renderCameraConsentCard, 600);
    }, 16000);
  }

  /* ── Camera preview float ──────────────────────────────────────
     Small draggable popup showing the live camera feed.
     Close button hides the preview but does NOT stop the camera.
     Re-open pill appears at top-centre after closing.
     Call: lv74.showCameraPreview()  — after cameraActive = true
  ────────────────────────────────────────────────────────────── */
  function showCameraPreview() {
    if (document.getElementById('lv74-cam-preview')) {
      // Already created — just make sure it's visible
      document.getElementById('lv74-cam-preview').classList.remove('lv74-preview-hidden');
      document.getElementById('lv74-cam-reopen').classList.remove('lv74-reopen-visible');
      _attachPreviewStream();
      return;
    }

    // Build preview container
    const preview = document.createElement('div');
    preview.id = 'lv74-cam-preview';
    preview.innerHTML =
      '<div id="lv74-cam-preview-bar">' +
        '<span>📷 Camera preview</span>' +
        '<button id="lv74-cam-close" title="Hide preview (camera keeps running)">✕</button>' +
      '</div>' +
      '<video id="lv74-cam-video" autoplay playsinline muted></video>';
    document.body.appendChild(preview);

    // Re-open pill
    const reopen = document.createElement('div');
    reopen.id = 'lv74-cam-reopen';
    reopen.title = 'Show camera preview';
    reopen.innerHTML = '<span>📷</span><span>Camera</span>';
    document.body.appendChild(reopen);

    // Close button
    document.getElementById('lv74-cam-close').addEventListener('click', function (e) {
      e.stopPropagation();
      preview.classList.add('lv74-preview-hidden');
      reopen.classList.add('lv74-reopen-visible');
    });

    // Re-open pill click
    reopen.addEventListener('click', function () {
      preview.classList.remove('lv74-preview-hidden');
      reopen.classList.remove('lv74-reopen-visible');
    });

    // Drag logic
    let dragging = false, ox = 0, oy = 0;
    preview.addEventListener('mousedown', function (e) {
      if (e.target.id === 'lv74-cam-close') return;
      dragging = true;
      // Convert from centered transform to explicit top/left on first drag
      const r = preview.getBoundingClientRect();
      preview.style.left   = r.left + 'px';
      preview.style.top    = r.top  + 'px';
      preview.style.transform = 'none';
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      preview.style.left = (e.clientX - ox) + 'px';
      preview.style.top  = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', function () { dragging = false; });

    _attachPreviewStream();
  }

  function _attachPreviewStream() {
    const video = document.getElementById('lv74-cam-video');
    if (!video) return;
    if (video.srcObject) return; // already attached

    // Re-request the camera — Chrome returns the same stream, no second prompt
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(function (stream) { video.srcObject = stream; })
      .catch(function (err) {
        console.warn('[lv74] Camera preview stream error:', err.message);
      });
  }

  /* Public API */
  window.lv74 = window.lv74 || {};
  window.lv74.startOnboarding    = startOnboarding;
  window.lv74.showCameraPreview  = showCameraPreview;
  window.lv74.finalizeBaseline   = function () {
    return window.AffectBridge74 ? window.AffectBridge74.finalizeBaseline() : false;
  };

})();
