/* ═══════════════════════════════════════════════════════════════
   bio-phase-f.js — Lorevox Phase F orchestration layer

   Responsibilities:
   - call promotion adapters (state.bioBuilder.review.promoted → state.structuredBio)
   - sync approved structured feeds into UI-consumable state
   - refresh Life Map / Timeline / Peek at Memoir
   - keep unapproved items out of downstream systems

   Rules:
   - Only approved items may flow through here
   - No direct writes from raw candidates
   - No direct writes to archive/source layers
   - No hidden promotion of unreviewed data

   Load order: after bio-promotion-adapters.js
   Exposes: window.LorevoxPhaseF
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.LorevoxPhaseF) return;

  var NS = {};

  /* ── State bootstrap ──────────────────────────────────────── */

  function _ensureState() {
    if (!window.state) window.state = {};
    if (!state.bioBuilder) state.bioBuilder = {};
    if (!state.bioBuilder.review) state.bioBuilder.review = {};
    if (!state.bioBuilder.review.promoted) {
      state.bioBuilder.review.promoted = {
        people: [], relationships: [], memories: [],
        events: [], places: [], documents: []
      };
    }
    if (!state.phaseFFeeds) {
      state.phaseFFeeds = {
        lifeMap:       { people: [], memories: [], events: [], places: [] },
        timeline:      [],
        memoirPreview: { memories: [], events: [] },
        sync: {
          lastRunAt:            null,
          lastPromotedCounts:   {},
          totalStructuredCounts: {},
          warnings:             [],
          runCount:             0
        }
      };
    }
  }

  function _now() { return new Date().toISOString(); }
  function _safeArray(v) { return Array.isArray(v) ? v : []; }

  /* ── Counts ───────────────────────────────────────────────── */

  function _countApprovedBuckets() {
    _ensureState();
    var buckets = state.bioBuilder.review.promoted || {};
    var counts  = {};
    Object.keys(buckets).forEach(function (t) {
      counts[t] = _safeArray(buckets[t]).length;
    });
    return counts;
  }

  function _countStructuredBuckets() {
    var s = state.structuredBio || {};
    return {
      people:        _safeArray(s.people).length,
      relationships: _safeArray(s.relationships).length,
      memories:      _safeArray(s.memories).length,
      events:        _safeArray(s.events).length,
      places:        _safeArray(s.places).length,
      documents:     _safeArray(s.documents).length
    };
  }

  function _hasAdapters() { return !!window.LorevoxPromotionAdapters; }

  /* ── Warnings ─────────────────────────────────────────────── */

  function _clearWarnings() {
    _ensureState();
    state.phaseFFeeds.sync.warnings = [];
  }

  function _addWarning(msg) {
    _ensureState();
    state.phaseFFeeds.sync.warnings.push({ at: _now(), message: msg });
  }

  /* ── Step 1: Promote approved items into structured stores ── */

  function promoteApprovedToStructured() {
    _ensureState();
    if (!_hasAdapters()) {
      _addWarning("LorevoxPromotionAdapters is not loaded. Phase F promotion skipped.");
      return { ok: false, promoted: null };
    }
    var promoted = window.LorevoxPromotionAdapters.promoteAllApproved();
    return { ok: true, promoted: promoted };
  }

  /* ── Step 2: Build UI-consumable feeds from structured data ─ */

  function syncFeeds() {
    _ensureState();
    if (!_hasAdapters()) {
      _addWarning("LorevoxPromotionAdapters is not loaded. Feed sync skipped.");
      return { ok: false, feeds: null };
    }

    var feeds = window.LorevoxPromotionAdapters.syncPhaseFFeedsToState();

    state.phaseFFeeds.lifeMap       = feeds.lifeMap       || { people: [], memories: [], events: [], places: [] };
    state.phaseFFeeds.timeline      = feeds.timeline      || [];
    state.phaseFFeeds.memoirPreview = feeds.memoirPreview || { memories: [], events: [] };
    state.phaseFFeeds.sync.lastRunAt              = _now();
    state.phaseFFeeds.sync.lastPromotedCounts     = _countApprovedBuckets();
    state.phaseFFeeds.sync.totalStructuredCounts  = _countStructuredBuckets();
    state.phaseFFeeds.sync.runCount               = Number(state.phaseFFeeds.sync.runCount || 0) + 1;

    return { ok: true, feeds: state.phaseFFeeds };
  }

  /* ── Step 3: Refresh downstream views safely ─────────────── */

  function refreshLifeMap() {
    try {
      if (window.LorevoxLifeMap && typeof window.LorevoxLifeMap.refresh === "function") {
        window.LorevoxLifeMap.refresh();
        return { ok: true, target: "LifeMap" };
      }
      _addWarning("Life Map refresh skipped: window.LorevoxLifeMap.refresh() not available.");
      return { ok: false, target: "LifeMap" };
    } catch (err) {
      _addWarning("Life Map refresh failed: " + String(err && err.message || err));
      return { ok: false, target: "LifeMap", error: String(err) };
    }
  }

  function refreshTimeline() {
    try {
      if (typeof window.renderTimeline === "function") {
        window.renderTimeline();
        return { ok: true, target: "Timeline" };
      }
      _addWarning("Timeline refresh skipped: renderTimeline() not available.");
      return { ok: false, target: "Timeline" };
    } catch (err) {
      _addWarning("Timeline refresh failed: " + String(err && err.message || err));
      return { ok: false, target: "Timeline", error: String(err) };
    }
  }

  function refreshMemoirPreview() {
    try {
      if (typeof window.renderMemoirChapters === "function") {
        window.renderMemoirChapters();
        return { ok: true, target: "MemoirPreview" };
      }
      if (typeof window.renderPeekAtMemoir === "function") {
        window.renderPeekAtMemoir();
        return { ok: true, target: "MemoirPreview" };
      }
      _addWarning("Memoir preview refresh skipped: no known memoir render function available.");
      return { ok: false, target: "MemoirPreview" };
    } catch (err) {
      _addWarning("Memoir preview refresh failed: " + String(err && err.message || err));
      return { ok: false, target: "MemoirPreview", error: String(err) };
    }
  }

  function refreshAllViews() {
    return {
      lifeMap:      refreshLifeMap(),
      timeline:     refreshTimeline(),
      memoirPreview: refreshMemoirPreview()
    };
  }

  /* ── Guard: approved-only feed verification ───────────────── */

  function verifyApprovedOnlyFeeds() {
    _ensureState();
    var warnings = [];

    var promoted  = state.bioBuilder.review.promoted || {};
    var structured = state.structuredBio || {};

    Object.keys(structured).forEach(function (type) {
      if (!Array.isArray(structured[type])) return;
      if (type === "promotionLog") return;
      structured[type].forEach(function (item) {
        if (!item || !item.id) return;
        if (item.createdFrom === "bio_builder_phase_e" && !item.verified) {
          warnings.push("Structured " + type + " item " + item.id + " is marked createdFrom phase_e but not verified.");
        }
      });
    });

    if (warnings.length) {
      warnings.forEach(_addWarning);
      return { ok: false, warnings: warnings };
    }
    return { ok: true, warnings: [] };
  }

  /* ── Full orchestration run ───────────────────────────────── */

  function runPhaseF(options) {
    _ensureState();
    _clearWarnings();

    var opts = Object.assign({ refreshViews: true, logToConsole: true }, options || {});

    var promoteStep = promoteApprovedToStructured();
    var syncStep    = syncFeeds();
    var guardStep   = verifyApprovedOnlyFeeds();
    var refreshStep = opts.refreshViews ? refreshAllViews() : null;

    var report = {
      ok:          !!(promoteStep.ok && syncStep.ok),
      ranAt:       _now(),
      promoteStep: promoteStep,
      syncStep:    syncStep,
      guardStep:   guardStep,
      refreshStep: refreshStep,
      warnings:    state.phaseFFeeds.sync.warnings.slice(),
      counts: {
        approved:   _countApprovedBuckets(),
        structured: _countStructuredBuckets()
      }
    };

    if (opts.logToConsole) {
      console.log("[Lorevox Phase F] Orchestration run complete", report);
    }

    return report;
  }

  /* ── Optional accessor helpers ────────────────────────────── */

  function getLifeMapFeed()       { _ensureState(); return state.phaseFFeeds.lifeMap; }
  function getTimelineFeed()      { _ensureState(); return state.phaseFFeeds.timeline; }
  function getMemoirPreviewFeed() { _ensureState(); return state.phaseFFeeds.memoirPreview; }

  function getLastReportSummary() {
    _ensureState();
    return {
      lastRunAt:            state.phaseFFeeds.sync.lastRunAt,
      runCount:             state.phaseFFeeds.sync.runCount,
      totalStructuredCounts: state.phaseFFeeds.sync.totalStructuredCounts,
      warnings:             state.phaseFFeeds.sync.warnings
    };
  }

  /* ── Public API ───────────────────────────────────────────── */

  NS.run                       = runPhaseF;
  NS.promoteApprovedToStructured = promoteApprovedToStructured;
  NS.syncFeeds                 = syncFeeds;
  NS.refreshAllViews           = refreshAllViews;
  NS.verifyApprovedOnlyFeeds   = verifyApprovedOnlyFeeds;

  NS.getLifeMapFeed            = getLifeMapFeed;
  NS.getTimelineFeed           = getTimelineFeed;
  NS.getMemoirPreviewFeed      = getMemoirPreviewFeed;
  NS.getLastReportSummary      = getLastReportSummary;

  /* Exposed for tests */
  NS._ensureState              = _ensureState;
  NS._countApprovedBuckets     = _countApprovedBuckets;
  NS._countStructuredBuckets   = _countStructuredBuckets;

  window.LorevoxPhaseF = NS;

})();
