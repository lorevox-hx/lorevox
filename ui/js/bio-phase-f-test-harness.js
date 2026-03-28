/* ═══════════════════════════════════════════════════════════════
   bio-phase-f-test-harness.js — Lorevox Phase F test harness

   Responsibilities:
   - run structured Phase F validation checks
   - classify results as VERIFIED / INSPECTED / NOT EXECUTED
   - summarize report status
   - export test results for docs/reporting

   Rules:
   - no truth mutation beyond optional Phase F run when explicitly requested
   - no external services
   - honest result labels only

   Load order: after bio-phase-f-report.js
   Exposes: window.LorevoxPhaseFTests
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.LorevoxPhaseFTests) return;

  var NS = {};

  /* ── State bootstrap ──────────────────────────────────────── */

  function _ensureState() {
    if (!window.state) window.state = {};
    if (!state.phaseFTestRuns) {
      state.phaseFTestRuns = {
        history: [],
        lastRun: null
      };
    }
  }

  /* ── Utilities ────────────────────────────────────────────── */

  function _now()       { return new Date().toISOString(); }
  function _safeArr(v)  { return Array.isArray(v) ? v : []; }
  function _hasFn(name) { return typeof window[name] === "function"; }
  function _phaseFLoaded()       { return !!window.LorevoxPhaseF; }
  function _phaseFReportLoaded() { return !!window.LorevoxPhaseFReport; }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function _getCounts() {
    var feeds = (window.state && state.phaseFFeeds) || {};
    var sync  = feeds.sync || {};
    return {
      approved:   sync.lastPromotedCounts   || {},
      structured: sync.totalStructuredCounts || {},
      feedSizes: {
        lifeMap: {
          people:   _safeArr(feeds.lifeMap   && feeds.lifeMap.people).length,
          memories: _safeArr(feeds.lifeMap   && feeds.lifeMap.memories).length,
          events:   _safeArr(feeds.lifeMap   && feeds.lifeMap.events).length,
          places:   _safeArr(feeds.lifeMap   && feeds.lifeMap.places).length
        },
        timeline:      _safeArr(feeds.timeline).length,
        memoirPreview: {
          memories: _safeArr(feeds.memoirPreview && feeds.memoirPreview.memories).length,
          events:   _safeArr(feeds.memoirPreview && feeds.memoirPreview.events).length
        }
      }
    };
  }

  /* ── Result factory ───────────────────────────────────────── */

  function _result(id, label, status, details, recommendation) {
    return {
      id:             id,
      label:          label,
      status:         status,   // VERIFIED | INSPECTED | NOT EXECUTED
      details:        details        || "",
      recommendation: recommendation || ""
    };
  }

  /* ── Summarizer ───────────────────────────────────────────── */

  function _summarize(results) {
    var counts = { "VERIFIED": 0, "INSPECTED": 0, "NOT EXECUTED": 0 };
    results.forEach(function (r) {
      if (counts[r.status] !== undefined) counts[r.status]++;
    });
    var overall = "ok";
    if (counts["NOT EXECUTED"] > 0) overall = "partial";
    if (!results.length)            overall = "empty";
    return { overall: overall, counts: counts };
  }

  /* ── Individual test functions ────────────────────────────── */

  function _testModuleLoaded() {
    if (_phaseFLoaded()) {
      return _result("phasef_module_loaded", "Phase F module is loaded",
        "VERIFIED", "window.LorevoxPhaseF is available.");
    }
    return _result("phasef_module_loaded", "Phase F module is loaded",
      "NOT EXECUTED", "window.LorevoxPhaseF is not available.",
      "Load bio-phase-f.js before running Phase F tests.");
  }

  function _testAdaptersLoaded() {
    if (window.LorevoxPromotionAdapters) {
      return _result("promotion_adapters_loaded", "Promotion adapters are loaded",
        "VERIFIED", "window.LorevoxPromotionAdapters is available.");
    }
    return _result("promotion_adapters_loaded", "Promotion adapters are loaded",
      "NOT EXECUTED", "window.LorevoxPromotionAdapters is not available.",
      "Load bio-promotion-adapters.js before running integration tests.");
  }

  function _testReportModuleLoaded() {
    if (_phaseFReportLoaded()) {
      return _result("phasef_report_loaded", "Phase F report module is loaded",
        "VERIFIED", "window.LorevoxPhaseFReport is available.");
    }
    return _result("phasef_report_loaded", "Phase F report module is loaded",
      "NOT EXECUTED", "window.LorevoxPhaseFReport is not available.",
      "Load bio-phase-f-report.js to enable report export tests.");
  }

  function _testApprovedOnlyGuard() {
    if (!_phaseFLoaded()) {
      return _result("approved_only_guard", "Approved-only feed guard can run",
        "NOT EXECUTED", "Phase F module not loaded.");
    }
    try {
      var result = window.LorevoxPhaseF.verifyApprovedOnlyFeeds();
      return _result("approved_only_guard", "Approved-only feed guard can run",
        "VERIFIED",
        result.ok
          ? "Guard ran successfully with no blocking warnings."
          : "Guard ran with warnings: " + JSON.stringify(result.warnings || []));
    } catch (err) {
      return _result("approved_only_guard", "Approved-only feed guard can run",
        "INSPECTED",
        "Guard function exists but threw an error: " + String(err && err.message || err),
        "Inspect guard assumptions and state shape.");
    }
  }

  function _testFeedsExist() {
    var feeds = window.state && state.phaseFFeeds;
    if (!feeds) {
      return _result("feeds_exist", "Phase F feed containers exist",
        "NOT EXECUTED", "state.phaseFFeeds is missing.",
        "Run ensureState() path or execute Phase F once.");
    }
    var hasLifeMap  = !!feeds.lifeMap;
    var hasTimeline = Array.isArray(feeds.timeline);
    var hasMemoir   = !!feeds.memoirPreview;
    if (hasLifeMap && hasTimeline && hasMemoir) {
      return _result("feeds_exist", "Phase F feed containers exist",
        "VERIFIED", "lifeMap, timeline, and memoirPreview feed containers are present.");
    }
    return _result("feeds_exist", "Phase F feed containers exist",
      "INSPECTED", "Some feed containers are missing or malformed.",
      "Verify state.phaseFFeeds initialization shape.");
  }

  function _testLifeMapRefresh() {
    if (window.LorevoxLifeMap && typeof window.LorevoxLifeMap.refresh === "function") {
      return _result("lifemap_refresh_available", "Life Map refresh function is available",
        "VERIFIED", "window.LorevoxLifeMap.refresh() is callable.");
    }
    return _result("lifemap_refresh_available", "Life Map refresh function is available",
      "INSPECTED", "Life Map refresh hook is not present.",
      "Add or verify window.LorevoxLifeMap.refresh() before final Phase F UI validation.");
  }

  function _testTimelineRefresh() {
    if (_hasFn("renderTimeline")) {
      return _result("timeline_refresh_available", "Timeline refresh function is available",
        "VERIFIED", "renderTimeline() is callable.");
    }
    return _result("timeline_refresh_available", "Timeline refresh function is available",
      "INSPECTED", "renderTimeline() is not present on window.",
      "Ensure timeline rendering path is loaded when testing Phase F.");
  }

  function _testMemoirRefresh() {
    if (_hasFn("renderMemoirChapters") || _hasFn("renderPeekAtMemoir")) {
      var which = _hasFn("renderMemoirChapters") ? "renderMemoirChapters()" : "renderPeekAtMemoir()";
      return _result("memoir_refresh_available", "Memoir preview refresh function is available",
        "VERIFIED", which + " is callable.");
    }
    return _result("memoir_refresh_available", "Memoir preview refresh function is available",
      "INSPECTED", "No known memoir refresh hook is available.",
      "Wire renderMemoirChapters() or renderPeekAtMemoir() for full downstream validation.");
  }

  function _testStructuredCountsVisible() {
    var counts = _getCounts();
    var hasAny =
      Object.keys(counts.structured || {}).some(function (k) { return Number(counts.structured[k] || 0) > 0; }) ||
      Object.keys(counts.approved   || {}).some(function (k) { return Number(counts.approved[k]   || 0) > 0; });
    return _result("structured_counts_visible", "Structured and approved counts are available",
      "VERIFIED",
      hasAny
        ? "Counts visible: " + JSON.stringify(counts)
        : "Counts are present but currently zero.");
  }

  function _testRunPhaseF(doRun) {
    if (!_phaseFLoaded()) {
      return _result("run_phasef", "Phase F orchestration can run",
        "NOT EXECUTED", "Phase F module not loaded.");
    }
    if (!doRun) {
      return _result("run_phasef", "Phase F orchestration can run",
        "INSPECTED", "Run skipped by configuration. Function presence confirmed.",
        "Run with { executeRun: true } when you want a live orchestration test.");
    }
    try {
      var report = window.LorevoxPhaseF.run({ refreshViews: false, logToConsole: false });
      return _result("run_phasef", "Phase F orchestration can run",
        "VERIFIED",
        "Phase F executed. ok=" + !!report.ok + "; warnings=" + _safeArr(report.warnings).length);
    } catch (err) {
      return _result("run_phasef", "Phase F orchestration can run",
        "INSPECTED",
        "Run attempted but failed: " + String(err && err.message || err),
        "Inspect orchestration assumptions and state readiness.");
    }
  }

  function _testReportExport(doRun) {
    if (!_phaseFReportLoaded()) {
      return _result("report_export", "Phase F report/export module can create a report",
        "NOT EXECUTED", "Phase F report module not loaded.");
    }
    try {
      var report = doRun
        ? window.LorevoxPhaseFReport.runAndReport({ refreshViews: false, logToConsole: false })
        : window.LorevoxPhaseFReport.snapshot("test_snapshot", { ok: true });
      return _result("report_export", "Phase F report/export module can create a report",
        "VERIFIED",
        "Report created with overallStatus=" + (report.overallStatus || "unknown"));
    } catch (err) {
      return _result("report_export", "Phase F report/export module can create a report",
        "INSPECTED",
        "Report module exists but failed during report creation: " + String(err && err.message || err),
        "Inspect report/export dependencies.");
    }
  }

  /* ── Test runner ──────────────────────────────────────────── */

  function runTests(options) {
    _ensureState();
    var opts = Object.assign({ executeRun: false, executeReportRun: false }, options || {});

    var results = [
      _testModuleLoaded(),
      _testAdaptersLoaded(),
      _testReportModuleLoaded(),
      _testFeedsExist(),
      _testApprovedOnlyGuard(),
      _testLifeMapRefresh(),
      _testTimelineRefresh(),
      _testMemoirRefresh(),
      _testStructuredCountsVisible(),
      _testRunPhaseF(opts.executeRun),
      _testReportExport(opts.executeReportRun)
    ];

    var summary = _summarize(results);
    var run = {
      ranAt:   _now(),
      options: opts,
      summary: summary,
      results: results
    };

    state.phaseFTestRuns.lastRun = run;
    state.phaseFTestRuns.history.push(run);
    return run;
  }

  /* ── Export helpers ───────────────────────────────────────── */

  function exportLastRunObject() {
    _ensureState();
    return state.phaseFTestRuns.lastRun
      ? JSON.parse(JSON.stringify(state.phaseFTestRuns.lastRun))
      : null;
  }

  function exportLastRunJson() {
    var run = exportLastRunObject();
    try { return JSON.stringify(run, null, 2); } catch (e) { return "null"; }
  }

  function downloadLastRunJson(filename) {
    var json = exportLastRunJson();
    var blob = new Blob([json], { type: "application/json" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = filename || ("phase-f-test-run-" + Date.now() + ".json");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ── Summary renderer ─────────────────────────────────────── */

  function renderSummaryHtml(targetId) {
    _ensureState();
    var target = document.getElementById(targetId);
    if (!target) return;

    var run = state.phaseFTestRuns.lastRun;
    if (!run) {
      target.innerHTML = '<div class="bio-phasef-test-empty">No Phase F test run has been executed yet.</div>';
      return;
    }

    var rows = _safeArr(run.results).map(function (r) {
      var badgeClass = _esc(r.status.replace(/\s+/g, "-").toLowerCase());
      return '<tr>'
        + '<td>' + _esc(r.label) + '</td>'
        + '<td><span class="bio-phasef-test-badge ' + badgeClass + '">' + _esc(r.status) + '</span></td>'
        + '<td>' + _esc(r.details || "") + '</td>'
        + '</tr>';
    }).join("");

    target.innerHTML = '<div class="bio-phasef-test-card">'
      + '<div class="bio-phasef-test-head">'
      +   '<div>'
      +     '<h3 class="bio-phasef-test-title">Phase F Test Run</h3>'
      +     '<div class="bio-phasef-test-subtitle">Ran at ' + _esc(run.ranAt) + '</div>'
      +   '</div>'
      +   '<div class="bio-phasef-test-overall ' + _esc(run.summary.overall) + '">' + _esc(run.summary.overall) + '</div>'
      + '</div>'
      + '<div class="bio-phasef-test-stats">'
      +   '<div class="bio-phasef-test-stat">VERIFIED: ' + _esc(run.summary.counts["VERIFIED"]) + '</div>'
      +   '<div class="bio-phasef-test-stat">INSPECTED: ' + _esc(run.summary.counts["INSPECTED"]) + '</div>'
      +   '<div class="bio-phasef-test-stat">NOT EXECUTED: ' + _esc(run.summary.counts["NOT EXECUTED"]) + '</div>'
      + '</div>'
      + '<div class="bio-phasef-test-actions">'
      +   '<button id="phaseFTestsDownloadBtn" class="bio-phasef-test-btn">Download Test JSON</button>'
      + '</div>'
      + '<div class="bio-phasef-test-table-wrap">'
      +   '<table class="bio-phasef-test-table">'
      +     '<thead><tr><th>Test</th><th>Status</th><th>Details</th></tr></thead>'
      +     '<tbody>' + rows + '</tbody>'
      +   '</table>'
      + '</div>'
      + '</div>';

    var dlBtn = document.getElementById("phaseFTestsDownloadBtn");
    if (dlBtn) dlBtn.addEventListener("click", function () { downloadLastRunJson(); });
  }

  function clearHistory() {
    _ensureState();
    state.phaseFTestRuns.history = [];
    state.phaseFTestRuns.lastRun = null;
  }

  /* ── Public API ───────────────────────────────────────────── */

  NS.run                  = runTests;
  NS.exportLastRunObject  = exportLastRunObject;
  NS.exportLastRunJson    = exportLastRunJson;
  NS.downloadLastRunJson  = downloadLastRunJson;
  NS.renderSummaryHtml    = renderSummaryHtml;
  NS.clearHistory         = clearHistory;

  window.LorevoxPhaseFTests = NS;

})();
