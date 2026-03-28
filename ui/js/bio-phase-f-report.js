/* ═══════════════════════════════════════════════════════════════
   bio-phase-f-report.js — Lorevox Phase F report/export module

   Responsibilities:
   - collect structured report data from Phase F orchestration
   - capture counts, warnings, feed sizes, refresh results
   - provide local export helpers
   - support formal Phase F validation and documentation

   Rules:
   - reporting only
   - no truth mutation
   - no promotion logic
   - no external services

   Load order: after bio-phase-f.js
   Exposes: window.LorevoxPhaseFReport
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.LorevoxPhaseFReport) return;

  var NS = {};

  /* ── State bootstrap ──────────────────────────────────────── */

  function _ensureState() {
    if (!window.state) window.state = {};

    if (!state.phaseFReports) {
      state.phaseFReports = {
        history:    [],
        lastReport: null
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
  }

  /* ── Utilities ────────────────────────────────────────────── */

  function _now()       { return new Date().toISOString(); }
  function _safeArr(v)  { return Array.isArray(v) ? v : []; }
  function _phaseFLoaded() { return !!window.LorevoxPhaseF; }

  function _clone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; }
  }

  /* ── Feed / count helpers ─────────────────────────────────── */

  function _getFeedSizes() {
    _ensureState();
    var lm = state.phaseFFeeds.lifeMap       || {};
    var tl = state.phaseFFeeds.timeline      || [];
    var mp = state.phaseFFeeds.memoirPreview || {};
    return {
      lifeMap: {
        people:   _safeArr(lm.people).length,
        memories: _safeArr(lm.memories).length,
        events:   _safeArr(lm.events).length,
        places:   _safeArr(lm.places).length
      },
      timeline: { total: _safeArr(tl).length },
      memoirPreview: {
        memories: _safeArr(mp.memories).length,
        events:   _safeArr(mp.events).length
      }
    };
  }

  function _getWarnings() {
    _ensureState();
    var w = state.phaseFFeeds.sync && state.phaseFFeeds.sync.warnings;
    return _safeArr(w);
  }

  function _getApprovedCounts() {
    _ensureState();
    var sync = state.phaseFFeeds.sync || {};
    return _clone(sync.lastPromotedCounts || {});
  }

  function _getStructuredCounts() {
    _ensureState();
    var sync = state.phaseFFeeds.sync || {};
    return _clone(sync.totalStructuredCounts || {});
  }

  /* ── Report builder ───────────────────────────────────────── */

  function _buildMeta() {
    _ensureState();
    var sync = state.phaseFFeeds.sync || {};
    return {
      generatedAt:  _now(),
      phaseFLoaded: _phaseFLoaded(),
      lastRunAt:    sync.lastRunAt  || null,
      runCount:     Number(sync.runCount || 0)
    };
  }

  function _classifyStatus(report) {
    if (!report.meta.phaseFLoaded)     return "not_loaded";
    if (report.warnings.length > 0)    return "warnings";
    if (!report.meta.lastRunAt)        return "not_run";
    return "ok";
  }

  function _buildReport(actionLabel, actionResult) {
    _ensureState();
    var report = {
      meta:   _buildMeta(),
      action: {
        label:  actionLabel || "snapshot",
        result: _clone(actionResult || null)
      },
      counts: {
        approved:   _getApprovedCounts(),
        structured: _getStructuredCounts(),
        feedSizes:  _getFeedSizes()
      },
      warnings:      _getWarnings(),
      feeds: {
        lifeMap:       _clone(state.phaseFFeeds.lifeMap),
        timeline:      _clone(state.phaseFFeeds.timeline),
        memoirPreview: _clone(state.phaseFFeeds.memoirPreview)
      },
      overallStatus: null
    };
    report.overallStatus = _classifyStatus(report);
    return report;
  }

  function _saveReport(report) {
    _ensureState();
    state.phaseFReports.lastReport = report;
    state.phaseFReports.history.push(report);
    return report;
  }

  /* ── Public API ───────────────────────────────────────────── */

  function snapshot(actionLabel, actionResult) {
    return _saveReport(_buildReport(actionLabel, actionResult));
  }

  function runAndReport(options) {
    _ensureState();
    if (!_phaseFLoaded()) {
      return snapshot("run_phase_f_failed", { ok: false, reason: "LorevoxPhaseF not loaded" });
    }
    var result = window.LorevoxPhaseF.run(options || { refreshViews: true, logToConsole: true });
    return snapshot("run_phase_f", result);
  }

  function exportReportObject() {
    _ensureState();
    return _clone(state.phaseFReports.lastReport);
  }

  function exportReportJson() {
    var report = exportReportObject();
    try { return JSON.stringify(report, null, 2); } catch (e) { return "null"; }
  }

  function downloadJson(filename) {
    _ensureState();
    var json = exportReportJson();
    var blob = new Blob([json], { type: "application/json" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = filename || ("phase-f-report-" + Date.now() + ".json");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function renderSummaryHtml(targetId) {
    _ensureState();
    var target = document.getElementById(targetId);
    if (!target) return;

    var report = state.phaseFReports.lastReport;
    if (!report) {
      target.innerHTML = '<div class="bio-phasef-report-empty">No Phase F report has been generated yet.</div>';
      return;
    }

    var warnCount = _safeArr(report.warnings).length;
    var status    = report.overallStatus;

    target.innerHTML = '<div class="bio-phasef-report-card">'
      + '<div class="bio-phasef-report-head">'
      +   '<div>'
      +     '<h3 class="bio-phasef-report-title">Phase F Report</h3>'
      +     '<div class="bio-phasef-report-subtitle">Generated at ' + _esc(report.meta.generatedAt || "unknown") + '</div>'
      +   '</div>'
      +   '<div class="bio-phasef-report-status ' + _esc(status) + '">' + _esc(status) + '</div>'
      + '</div>'
      + '<div class="bio-phasef-report-grid">'
      +   '<div class="bio-phasef-report-mini"><div class="bio-phasef-report-label">Last Run</div><div class="bio-phasef-report-value">' + _esc(report.meta.lastRunAt || "Never") + '</div></div>'
      +   '<div class="bio-phasef-report-mini"><div class="bio-phasef-report-label">Run Count</div><div class="bio-phasef-report-value">' + _esc(report.meta.runCount) + '</div></div>'
      +   '<div class="bio-phasef-report-mini"><div class="bio-phasef-report-label">Warnings</div><div class="bio-phasef-report-value">' + _esc(warnCount) + '</div></div>'
      +   '<div class="bio-phasef-report-mini"><div class="bio-phasef-report-label">Timeline Feed</div><div class="bio-phasef-report-value">' + _esc(report.counts.feedSizes.timeline.total) + '</div></div>'
      + '</div>'
      + '<div class="bio-phasef-report-actions">'
      +   '<button id="phaseFReportDownloadBtn" class="bio-phasef-report-btn">Download JSON Report</button>'
      +   '<button id="phaseFReportRefreshBtn"  class="bio-phasef-report-btn">Refresh Snapshot</button>'
      + '</div>'
      + '</div>';

    var dlBtn = document.getElementById("phaseFReportDownloadBtn");
    if (dlBtn) dlBtn.addEventListener("click", function () { downloadJson(); });

    var rfBtn = document.getElementById("phaseFReportRefreshBtn");
    if (rfBtn) rfBtn.addEventListener("click", function () {
      snapshot("manual_snapshot", { ok: true });
      renderSummaryHtml(targetId);
    });
  }

  function getHistory() {
    _ensureState();
    return _clone(state.phaseFReports.history);
  }

  function clearHistory() {
    _ensureState();
    state.phaseFReports.history    = [];
    state.phaseFReports.lastReport = null;
  }

  NS.snapshot           = snapshot;
  NS.runAndReport       = runAndReport;
  NS.exportReportObject = exportReportObject;
  NS.exportReportJson   = exportReportJson;
  NS.downloadJson       = downloadJson;
  NS.renderSummaryHtml  = renderSummaryHtml;
  NS.getHistory         = getHistory;
  NS.clearHistory       = clearHistory;

  window.LorevoxPhaseFReport = NS;

})();
