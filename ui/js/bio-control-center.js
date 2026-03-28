/* ═══════════════════════════════════════════════════════════════
   bio-control-center.js — Unified Bio Builder control center

   Combines:
   - Phase E review counts
   - Phase F status/debug summary
   - Phase F report summary
   - Phase F test harness summary
   - orchestration action buttons

   Depends on:
   - state.bioBuilder
   - window.LorevoxPhaseF           (optional but recommended)
   - window.LorevoxPhaseFReport     (optional)
   - window.LorevoxPhaseFTests      (optional)

   Load order: after bio-phase-f-test-harness.js
   Exposes: window.LorevoxBioControlCenter
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.LorevoxBioControlCenter) return;

  var NS      = {};
  var ROOT_ID = "bioControlCenterRoot";

  var ui = {
    activeTab:        "overview",
    lastActionMessage: null
  };

  /* ── State bootstrap ──────────────────────────────────────── */

  function _ensureState() {
    if (!window.state) window.state = {};

    if (!state.bioBuilder) state.bioBuilder = {};
    if (!state.bioBuilder.candidates) {
      state.bioBuilder.candidates = {
        people: [], relationships: [], memories: [],
        events: [], places: [], documents: []
      };
    }
    if (!state.bioBuilder.review) {
      state.bioBuilder.review = {
        approved: [], rejected: [],
        promoted: {
          people: [], relationships: [], memories: [],
          events: [], places: [], documents: []
        }
      };
    }
    if (!state.phaseFFeeds) {
      state.phaseFFeeds = {
        lifeMap:       { people: [], memories: [], events: [], places: [] },
        timeline:      [],
        memoirPreview: { memories: [], events: [] },
        sync: {
          lastRunAt:             null,
          lastPromotedCounts:    {},
          totalStructuredCounts: {},
          warnings:              [],
          runCount:              0
        }
      };
    }
    if (!state.phaseFReports) {
      state.phaseFReports = { history: [], lastReport: null };
    }
    if (!state.phaseFTestRuns) {
      state.phaseFTestRuns = { history: [], lastRun: null };
    }
  }

  /* ── Utilities ────────────────────────────────────────────── */

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function _el(id) { return document.getElementById(id); }
  function _safeArr(v) { return Array.isArray(v) ? v : []; }

  function _phaseFLoaded()       { return !!window.LorevoxPhaseF; }
  function _phaseFReportLoaded() { return !!window.LorevoxPhaseFReport; }
  function _phaseFTestsLoaded()  { return !!window.LorevoxPhaseFTests; }

  /* ── Stats helpers ────────────────────────────────────────── */

  function _countPendingCandidates() {
    _ensureState();
    var buckets = state.bioBuilder.candidates;
    var counts  = {};
    Object.keys(buckets).forEach(function (type) {
      counts[type] = _safeArr(buckets[type]).filter(function (c) {
        return (c.status || "pending") === "pending";
      }).length;
    });
    return counts;
  }

  function _totalPending() {
    var counts = _countPendingCandidates();
    return Object.keys(counts).reduce(function (sum, k) { return sum + counts[k]; }, 0);
  }

  function _approvedCount() {
    _ensureState();
    return _safeArr(state.bioBuilder.review.approved).length;
  }

  function _rejectedCount() {
    _ensureState();
    return _safeArr(state.bioBuilder.review.rejected).length;
  }

  function _syncSummary() {
    return (state.phaseFFeeds && state.phaseFFeeds.sync) || {};
  }

  function _statusLabel() {
    if (!_phaseFLoaded()) return "Phase F not loaded";
    var sync     = _syncSummary();
    var warnings = _safeArr(sync.warnings);
    if (!sync.lastRunAt) return "Phase F not run";
    if (warnings.length) return "Warnings present";
    return "Ready";
  }

  /* ── Render helpers ───────────────────────────────────────── */

  function _renderStatusBar() {
    var sync = _syncSummary();
    return '<div class="bio-control-statusbar">'
      + '<span class="bio-control-chip">Pending <span class="bio-control-chip-count">' + _esc(_totalPending()) + '</span></span>'
      + '<span class="bio-control-chip">Approved <span class="bio-control-chip-count">' + _esc(_approvedCount()) + '</span></span>'
      + '<span class="bio-control-chip">Rejected <span class="bio-control-chip-count">' + _esc(_rejectedCount()) + '</span></span>'
      + '<span class="bio-control-chip">Phase F <span class="bio-control-chip-count">' + _esc(_statusLabel()) + '</span></span>'
      + '<span class="bio-control-chip">Last Run <span class="bio-control-chip-count">' + _esc(sync.lastRunAt || "Never") + '</span></span>'
      + '</div>';
  }

  function _renderHeader() {
    return '<div class="bio-control-head">'
      + '<div class="bio-control-head-title-wrap">'
      +   '<h2 class="bio-control-title">Bio Builder Control Center</h2>'
      +   '<p class="bio-control-subtitle">Unified operational cockpit for Bio Builder review, approved promotion, Phase F orchestration, feed inspection, reporting, and testing.</p>'
      + '</div>'
      + _renderStatusBar()
      + '</div>';
  }

  function _renderSidebar() {
    var pending  = _countPendingCandidates();
    var disF     = _phaseFLoaded()       ? "" : " disabled";
    var disTests = _phaseFTestsLoaded()  ? "" : " disabled";
    var disRep   = _phaseFReportLoaded() ? "" : " disabled";

    var tabs = [
      { id: "overview", label: "Overview" },
      { id: "feeds",    label: "Feeds"    },
      { id: "report",   label: "Report"   },
      { id: "tests",    label: "Tests"    }
    ];

    return '<div class="bio-control-sidebar">'
      + '<div class="bio-control-section">'
      +   '<h3 class="bio-control-section-title">Review Queue</h3>'
      +   '<div class="bio-control-mini-grid">'
      +     '<div class="bio-control-mini"><div class="bio-control-mini-label">People</div><div class="bio-control-mini-value">' + _esc(pending.people || 0) + '</div></div>'
      +     '<div class="bio-control-mini"><div class="bio-control-mini-label">Memories</div><div class="bio-control-mini-value">' + _esc(pending.memories || 0) + '</div></div>'
      +     '<div class="bio-control-mini"><div class="bio-control-mini-label">Events</div><div class="bio-control-mini-value">' + _esc(pending.events || 0) + '</div></div>'
      +     '<div class="bio-control-mini"><div class="bio-control-mini-label">Places</div><div class="bio-control-mini-value">' + _esc(pending.places || 0) + '</div></div>'
      +   '</div>'
      + '</div>'
      + '<div class="bio-control-section">'
      +   '<h3 class="bio-control-section-title">Actions</h3>'
      +   '<div class="bio-control-actions">'
      +     '<button class="bio-control-btn primary"   id="bccRunPhaseFBtn"' + disF     + '>Run Full Phase F</button>'
      +     '<button class="bio-control-btn secondary" id="bccSyncFeedsBtn"' + disF     + '>Sync Feeds Only</button>'
      +     '<button class="bio-control-btn secondary" id="bccRefreshViewsBtn"' + disF  + '>Refresh Views Only</button>'
      +     '<button class="bio-control-btn warn"      id="bccRunTestsBtn"' + disTests  + '>Run Phase F Tests</button>'
      +     '<button class="bio-control-btn secondary" id="bccMakeReportBtn"' + disRep  + '>Generate Phase F Report</button>'
      +   '</div>'
      + '</div>'
      + '<div class="bio-control-section">'
      +   '<h3 class="bio-control-section-title">View</h3>'
      +   '<div class="bio-control-tabs">'
      +     tabs.map(function (tab) {
              return '<button class="bio-control-tab' + (ui.activeTab === tab.id ? ' active' : '')
                + '" data-bcc-tab="' + _esc(tab.id) + '">' + _esc(tab.label) + '</button>';
            }).join("")
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  function _renderOverview() {
    var sync     = _syncSummary();
    var warnings = _safeArr(sync.warnings);

    var warnHtml = warnings.length
      ? '<div class="bio-control-warning-list">'
          + warnings.map(function (w) {
              return '<div class="bio-control-warning"><strong>' + _esc(w.at || "warning") + ':</strong><br>' + _esc(w.message || "") + '</div>';
            }).join("")
          + '</div>'
      : '<div class="bio-control-warning ok">No warnings present.</div>';

    return '<div class="bio-control-block">'
      +   '<h3 class="bio-control-block-title">Phase F Overview</h3>'
      +   '<div class="bio-control-code">'
      +     'Phase F loaded: ' + _phaseFLoaded() + '\n'
      +     'Last run: ' + (sync.lastRunAt || "Never") + '\n'
      +     'Run count: ' + (sync.runCount || 0) + '\n'
      +     'Warnings: ' + warnings.length + '\n'
      +     'Last action: ' + (ui.lastActionMessage || "None")
      +   '</div>'
      + '</div>'
      + '<div class="bio-control-block">'
      +   '<h3 class="bio-control-block-title">Warnings</h3>'
      +   warnHtml
      + '</div>';
  }

  function _renderFeeds() {
    _ensureState();
    var feeds = state.phaseFFeeds || {};
    var snapshot = {
      lifeMap:       feeds.lifeMap,
      timelineCount: _safeArr(feeds.timeline).length,
      memoirPreview: feeds.memoirPreview
    };
    var json;
    try { json = JSON.stringify(snapshot, null, 2); } catch (e) { json = "{}"; }
    return '<div class="bio-control-block">'
      +   '<h3 class="bio-control-block-title">Feed Snapshot</h3>'
      +   '<div class="bio-control-code">' + _esc(json) + '</div>'
      + '</div>';
  }

  function _renderReport() {
    _ensureState();
    var report = state.phaseFReports.lastReport;
    if (!report) {
      return '<div class="bio-control-block"><div class="bio-control-empty">No Phase F report generated yet.</div></div>';
    }
    var json;
    try { json = JSON.stringify(report, null, 2); } catch (e) { json = "{}"; }
    return '<div class="bio-control-block">'
      +   '<h3 class="bio-control-block-title">Last Report</h3>'
      +   '<div class="bio-control-code">' + _esc(json) + '</div>'
      + '</div>';
  }

  function _renderTests() {
    _ensureState();
    var tests = state.phaseFTestRuns.lastRun;
    if (!tests) {
      return '<div class="bio-control-block"><div class="bio-control-empty">No Phase F test run has been executed yet.</div></div>';
    }

    var rows = _safeArr(tests.results).map(function (r) {
      var badgeClass = _esc(r.status.replace(/\s+/g, "-").toLowerCase());
      return '<tr>'
        + '<td>' + _esc(r.label) + '</td>'
        + '<td><span class="bio-control-badge ' + badgeClass + '">' + _esc(r.status) + '</span></td>'
        + '<td>' + _esc(r.details || "") + '</td>'
        + '</tr>';
    }).join("");

    return '<div class="bio-control-block">'
      +   '<h3 class="bio-control-block-title">Last Test Run</h3>'
      +   '<div class="bio-control-table-wrap">'
      +     '<table class="bio-control-table">'
      +       '<thead><tr><th>Test</th><th>Status</th><th>Details</th></tr></thead>'
      +       '<tbody>' + rows + '</tbody>'
      +     '</table>'
      +   '</div>'
      + '</div>';
  }

  function _renderMain() {
    var content = "";
    if (ui.activeTab === "overview") content = _renderOverview();
    if (ui.activeTab === "feeds")    content = _renderFeeds();
    if (ui.activeTab === "report")   content = _renderReport();
    if (ui.activeTab === "tests")    content = _renderTests();
    return '<div class="bio-control-main"><div class="bio-control-main-scroll">' + content + '</div></div>';
  }

  function _renderShell() {
    return '<div class="bio-control-center">'
      + _renderHeader()
      + '<div class="bio-control-body">'
      +   _renderSidebar()
      +   _renderMain()
      + '</div>'
      + '</div>';
  }

  /* ── Event binding ────────────────────────────────────────── */

  function _bindEvents() {
    /* Tab switching */
    var root = _el(ROOT_ID);
    if (root) {
      root.querySelectorAll("[data-bcc-tab]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          ui.activeTab = btn.getAttribute("data-bcc-tab");
          _render();
        });
      });
    }

    /* Run Phase F */
    var runBtn = _el("bccRunPhaseFBtn");
    if (runBtn) runBtn.addEventListener("click", function () {
      if (!window.LorevoxPhaseF) return;
      var report = window.LorevoxPhaseF.run({ refreshViews: true, logToConsole: true });
      ui.lastActionMessage = "Phase F run complete. ok=" + !!report.ok;
      if (window.LorevoxPhaseFReport) {
        window.LorevoxPhaseFReport.snapshot("control_center_phasef_run", report);
      }
      _render();
    });

    /* Sync feeds */
    var syncBtn = _el("bccSyncFeedsBtn");
    if (syncBtn) syncBtn.addEventListener("click", function () {
      if (!window.LorevoxPhaseF) return;
      var result = window.LorevoxPhaseF.syncFeeds();
      ui.lastActionMessage = "Feeds synced. ok=" + !!result.ok;
      _render();
    });

    /* Refresh views */
    var refreshBtn = _el("bccRefreshViewsBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", function () {
      if (!window.LorevoxPhaseF) return;
      var result = window.LorevoxPhaseF.refreshAllViews();
      ui.lastActionMessage = "Views refreshed.";
      if (window.LorevoxPhaseFReport) {
        window.LorevoxPhaseFReport.snapshot("control_center_refresh_views", result);
      }
      _render();
    });

    /* Run tests */
    var testsBtn = _el("bccRunTestsBtn");
    if (testsBtn) testsBtn.addEventListener("click", function () {
      if (!window.LorevoxPhaseFTests) return;
      var result = window.LorevoxPhaseFTests.run({ executeRun: false, executeReportRun: false });
      ui.lastActionMessage = "Phase F tests executed. overall=" + result.summary.overall;
      ui.activeTab = "tests";
      _render();
    });

    /* Make report */
    var reportBtn = _el("bccMakeReportBtn");
    if (reportBtn) reportBtn.addEventListener("click", function () {
      if (!window.LorevoxPhaseFReport) return;
      var result = window.LorevoxPhaseFReport.snapshot("control_center_manual_report", { ok: true });
      ui.lastActionMessage = "Phase F report generated. status=" + result.overallStatus;
      ui.activeTab = "report";
      _render();
    });
  }

  /* ── Core render/init ─────────────────────────────────────── */

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

  window.LorevoxBioControlCenter = NS;

})();
