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
