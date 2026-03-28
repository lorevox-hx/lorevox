/* ═══════════════════════════════════════════════════════════════
   bio-phase-f-debug.js — Lorevox Phase F status/debug panel

   Responsibilities:
   - read Phase F sync state
   - display last run, counts, warnings
   - let user run orchestration actions
   - inspect feed payloads safely

   Depends on: window.LorevoxPhaseF, state.phaseFFeeds
   Load order: after bio-phase-f.js
   Exposes: window.LorevoxPhaseFDebug
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.LorevoxPhaseFDebug) return;

  var NS      = {};
  var ROOT_ID = "bioPhaseFDebugRoot";

  var ui = {
    activeFeedTab:    "lifeMap",
    lastActionReport: null
  };

  function _ensureState() {
    if (!window.state) window.state = {};
    if (!state.phaseFFeeds) {
      state.phaseFFeeds = {
        lifeMap:       { people: [], memories: [], events: [], places: [] },
        timeline:      [],
        memoirPreview: { memories: [], events: [] },
        sync: { lastRunAt: null, lastPromotedCounts: {}, totalStructuredCounts: {}, warnings: [], runCount: 0 }
      };
    }
  }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function _el(id) { return document.getElementById(id); }

  function _phaseFLoaded() { return !!window.LorevoxPhaseF; }
  function _syncState()    { _ensureState(); return state.phaseFFeeds.sync || {}; }
  function _lastRunAt()    { return _syncState().lastRunAt || "Never"; }
  function _runCount()     { return Number(_syncState().runCount || 0); }
  function _warnings()     { var w = _syncState().warnings; return Array.isArray(w) ? w : []; }
  function _structuredCounts() { return _syncState().totalStructuredCounts || {}; }
  function _approvedCounts()   { return _syncState().lastPromotedCounts   || {}; }

  function _statusClass() {
    if (!_phaseFLoaded()) return "bad";
    if (_warnings().length) return "warn";
    if (_syncState().lastRunAt) return "ok";
    return "warn";
  }
  function _statusLabel() {
    if (!_phaseFLoaded()) return "Phase F module not loaded";
    if (_warnings().length) return "Warnings present";
    if (_syncState().lastRunAt) return "Ready";
    return "Not run yet";
  }

  function _getFeedData() {
    _ensureState();
    var t = ui.activeFeedTab;
    if (t === "lifeMap")       return state.phaseFFeeds.lifeMap       || {};
    if (t === "timeline")      return state.phaseFFeeds.timeline      || [];
    if (t === "memoirPreview") return state.phaseFFeeds.memoirPreview || {};
    if (t === "report")        return ui.lastActionReport             || {};
    return {};
  }

  function _json(v) {
    try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }
  }

  /* ── Render helpers ───────────────────────────────────────── */

  function _renderHeader() {
    return '<div class="bio-phasef-debug-head">'
      + '<div class="bio-phasef-debug-title-wrap">'
      + '<h2 class="bio-phasef-debug-title">Phase F Status &amp; Debug</h2>'
      + '<p class="bio-phasef-debug-subtitle">Approved biography data only. Coordinates structured promotion, feed sync, and downstream refreshes.</p>'
      + '</div>'
      + '<div class="bio-phasef-status-chip">'
      + '<span class="bio-phasef-status-dot ' + _esc(_statusClass()) + '"></span>'
      + _esc(_statusLabel())
      + '</div>'
      + '</div>';
  }

  function _renderCounts() {
    var ap = _approvedCounts();
    var sc = _structuredCounts();
    return '<div class="bio-phasef-section">'
      + '<h3 class="bio-phasef-section-title">Counts</h3>'
      + '<div class="bio-phasef-grid">'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Last Run</div><div class="bio-phasef-mini-value" style="font-size:11px">' + _esc(_lastRunAt()) + '</div></div>'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Run Count</div><div class="bio-phasef-mini-value">' + _esc(_runCount()) + '</div></div>'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Approved: People</div><div class="bio-phasef-mini-value">' + _esc(ap.people || 0) + '</div></div>'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Structured: People</div><div class="bio-phasef-mini-value">' + _esc(sc.people || 0) + '</div></div>'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Approved: Memories</div><div class="bio-phasef-mini-value">' + _esc(ap.memories || 0) + '</div></div>'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Structured: Memories</div><div class="bio-phasef-mini-value">' + _esc(sc.memories || 0) + '</div></div>'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Approved: Events</div><div class="bio-phasef-mini-value">' + _esc(ap.events || 0) + '</div></div>'
      + '<div class="bio-phasef-mini-card"><div class="bio-phasef-mini-label">Structured: Events</div><div class="bio-phasef-mini-value">' + _esc(sc.events || 0) + '</div></div>'
      + '</div></div>';
  }

  function _renderActions() {
    var dis = _phaseFLoaded() ? "" : " disabled";
    return '<div class="bio-phasef-section">'
      + '<h3 class="bio-phasef-section-title">Actions</h3>'
      + '<div class="bio-phasef-actions">'
      + '<button class="bio-phasef-btn primary" id="phaseFRunBtn"' + dis + '>Run Full Phase F</button>'
      + '<button class="bio-phasef-btn secondary" id="phaseFSyncBtn"' + dis + '>Sync Feeds Only</button>'
      + '<button class="bio-phasef-btn secondary" id="phaseFRefreshViewsBtn"' + dis + '>Refresh Views Only</button>'
      + '<button class="bio-phasef-btn warn" id="phaseFVerifyBtn"' + dis + '>Verify Approved-Only Guard</button>'
      + '</div></div>';
  }

  function _renderWarnings() {
    var items = _warnings();
    return '<div class="bio-phasef-section">'
      + '<h3 class="bio-phasef-section-title">Warnings</h3>'
      + (items.length
          ? '<div class="bio-phasef-warning-list">' + items.map(function (w) {
              return '<div class="bio-phasef-warning"><strong>' + _esc(w.at || "warning") + ':</strong><br>' + _esc(w.message || "") + '</div>';
            }).join("") + '</div>'
          : '<div class="bio-phasef-warning bio-phasef-ok">No warnings. Phase F state is clean.</div>')
      + '</div>';
  }

  function _renderFeedTabs() {
    var tabs = [
      { id: "lifeMap",       label: "Life Map Feed" },
      { id: "timeline",      label: "Timeline Feed" },
      { id: "memoirPreview", label: "Memoir Feed"   },
      { id: "report",        label: "Last Report"   }
    ];
    return '<div class="bio-phasef-section">'
      + '<h3 class="bio-phasef-section-title">Feed Inspector</h3>'
      + '<div class="bio-phasef-feed-tabs">'
      + tabs.map(function (tab) {
          return '<button class="bio-phasef-feed-tab' + (ui.activeFeedTab === tab.id ? ' active' : '')
            + '" data-phasef-feed-tab="' + _esc(tab.id) + '">' + _esc(tab.label) + '</button>';
        }).join("")
      + '</div></div>';
  }

  function _renderShell() {
    return '<div class="bio-phasef-debug">'
      + _renderHeader()
      + '<div class="bio-phasef-debug-body">'
      + '<div class="bio-phasef-sidebar">' + _renderCounts() + _renderActions() + _renderWarnings() + '</div>'
      + '<div class="bio-phasef-main">'
      +   _renderFeedTabs()
      +   '<div class="bio-phasef-console" id="phaseFConsole">' + _esc(_json(_getFeedData())) + '</div>'
      + '</div>'
      + '</div></div>';
  }

  /* ── Event binding ────────────────────────────────────────── */

  function _bindEvents() {
    var runBtn     = _el("phaseFRunBtn");
    var syncBtn    = _el("phaseFSyncBtn");
    var refreshBtn = _el("phaseFRefreshViewsBtn");
    var verifyBtn  = _el("phaseFVerifyBtn");

    if (runBtn) runBtn.addEventListener("click", function () {
      if (!_phaseFLoaded()) return;
      ui.lastActionReport = window.LorevoxPhaseF.run({ refreshViews: true, logToConsole: true });
      _render();
    });
    if (syncBtn) syncBtn.addEventListener("click", function () {
      if (!_phaseFLoaded()) return;
      ui.lastActionReport = { action: "syncFeeds", result: window.LorevoxPhaseF.syncFeeds() };
      _render();
    });
    if (refreshBtn) refreshBtn.addEventListener("click", function () {
      if (!_phaseFLoaded()) return;
      ui.lastActionReport = { action: "refreshAllViews", result: window.LorevoxPhaseF.refreshAllViews() };
      _render();
    });
    if (verifyBtn) verifyBtn.addEventListener("click", function () {
      if (!_phaseFLoaded()) return;
      ui.lastActionReport = { action: "verifyApprovedOnlyFeeds", result: window.LorevoxPhaseF.verifyApprovedOnlyFeeds() };
      _render();
    });

    var root = _el(ROOT_ID);
    if (root) {
      root.querySelectorAll("[data-phasef-feed-tab]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          ui.activeFeedTab = btn.getAttribute("data-phasef-feed-tab");
          _render();
        });
      });
    }
  }

  function _render(targetId) {
    _ensureState();
    var root = _el(targetId || ROOT_ID);
    if (!root) return;
    root.innerHTML = _renderShell();
    _bindEvents();
  }

  function init(targetId) {
    _ensureState();
    _render(targetId || ROOT_ID);
  }

  NS.init   = init;
  NS.render = _render;
  window.LorevoxPhaseFDebug = NS;

})();
