/* ═══════════════════════════════════════════════════════════════
   bio-review.js — Lorevox Phase E Review & Promote
   No Tailwind. No CDN. Writes only through explicit approval actions.

   Phase D data model compatibility
   ─────────────────────────────────
   Phase D candidates store the meaningful value in a nested data
   object:  candidate.data.name  (persons)  or  candidate.data.text
   (events / places / memories).  Phase E normalises on  candidate.value
   and  candidate.snippet  at the top level.  When a candidate has been
   created or edited through the Phase E UI those fields are present.
   For Phase D candidates that pre-date Phase E the shim functions
   candidateTitle() and candidateSnippet() fall back to the nested data
   object so every card still renders correctly without a data migration.

   Truth rules:
     - Approved items land in  state.bioBuilder.review.promoted[type]
     - Nothing is written to state.archive / state.facts / state.timeline
     - Promotion into structured Lorevox stores (Phase F) is done by
       bio-promotion-adapters.js, NOT by this module
     - Rejected candidates are logged and removed from the pending queue
     - Every approval preserves full provenance

   Load order: after bio-builder.js
   Exposes: window.LorevoxCandidateReview
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.LorevoxCandidateReview) return;   // singleton guard

  var NS      = {};
  var ROOT_ID = "candidateReviewRoot";

  var ui = {
    activeType:          "people",
    activeCandidateId:   null,
    filterText:          ""
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
        approved: [],
        rejected: [],
        promoted: {
          people: [], relationships: [], memories: [],
          events: [], places: [], documents: []
        }
      };
    }
  }

  /* ── Escape helper ────────────────────────────────────────── */

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _el(id) { return document.getElementById(id); }

  /* ── Candidate accessors (Phase D compat shims) ───────────── */

  /* Returns the human-readable value for a candidate.
     Checks Phase E top-level fields first, then falls back to the
     Phase D nested data object. */
  function _title(c) {
    if (c.value  && c.value.trim())  return c.value.trim();
    if (c.label  && c.label.trim())  return c.label.trim();
    if (c.name   && c.name.trim())   return c.name.trim();
    if (c.title  && c.title.trim())  return c.title.trim();
    /* Phase D nested data */
    var d = c.data || {};
    return (d.name || d.label || d.text || "").trim() || "(Untitled candidate)";
  }

  /* Returns the source snippet / context sentence. */
  function _snippet(c) {
    if (c.snippet && c.snippet.trim()) return c.snippet.trim();
    if (c.preview)                     return c.preview;
    if (c.sourceSnippet)               return c.sourceSnippet;
    /* Phase D nested data */
    var d = c.data || {};
    var ctx = d.context || d.text || "";
    return ctx.slice(0, 220) || "No source snippet available.";
  }

  /* Returns a human-readable source label. */
  function _sourceLabel(c) {
    if (c.sourceFilename && c.sourceFilename.trim()) return c.sourceFilename;
    if (c.sourceLabel    && c.sourceLabel.trim())    return c.sourceLabel;
    /* Phase D source strings: "questionnaire:sectionId", "source:cardId", "quick:…" */
    var src = c.source || "";
    if (src.startsWith("questionnaire:")) return "questionnaire — " + src.replace("questionnaire:", "");
    if (src.startsWith("source:"))        return c.sourceFilename || "uploaded document";
    if (src.startsWith("quick:"))         return "quick capture";
    if (c.sourceId)                       return String(c.sourceId);
    return "Unknown source";
  }

  function _confidence(c) { return c.confidence || "low"; }
  function _status(c)     { return c.status || "pending"; }

  /* ── Bucket helpers ───────────────────────────────────────── */

  var _TYPES = ["people","relationships","memories","events","places","documents"];

  var _PLURAL = {
    people:"People", relationships:"Relationships", memories:"Memories",
    events:"Events", places:"Places", documents:"Documents"
  };
  var _SINGULAR = {
    people:"Person", relationships:"Relationship", memories:"Memory",
    events:"Event", places:"Place", documents:"Document"
  };

  function _bucket(type) {
    _ensureState();
    var b = state.bioBuilder.candidates[type];
    return Array.isArray(b) ? b : [];
  }

  function _reviewState() {
    _ensureState();
    return state.bioBuilder.review;
  }

  function _findCandidate(id) {
    _ensureState();
    var cats = state.bioBuilder.candidates;
    for (var i = 0; i < _TYPES.length; i++) {
      var type = _TYPES[i];
      var arr  = cats[type] || [];
      var idx  = arr.findIndex(function (c) { return c.id === id; });
      if (idx !== -1) return { candidate: arr[idx], type: type, index: idx, arr: arr };
    }
    return null;
  }

  function _currentCandidate() {
    return ui.activeCandidateId ? _findCandidate(ui.activeCandidateId) : null;
  }

  function _filtered(type) {
    var items = _bucket(type).filter(function (c) { return _status(c) === "pending"; });
    if (!ui.filterText.trim()) return items;
    var q = ui.filterText.trim().toLowerCase();
    return items.filter(function (c) {
      var hay = [_title(c), _snippet(c), _sourceLabel(c), c.type, c.source || ""].join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function _bucketCounts() {
    var out = {};
    _TYPES.forEach(function (t) {
      out[t] = _bucket(t).filter(function (c) { return _status(c) === "pending"; }).length;
    });
    return out;
  }

  function _totalPending()  { var co = _bucketCounts(); return _TYPES.reduce(function (s, t) { return s + (co[t] || 0); }, 0); }
  function _totalApproved() { return _reviewState().approved.length; }

  /* ── Duplicate detector (v6: fuzzy-aware) ───────────────── */

  /* Access fuzzy scoring from bio-builder.js if available */
  function _fuzzyScore(a, b) {
    var BB = window.LorevoxBioBuilder;
    if (BB && typeof BB._fuzzyNameScore === "function") return BB._fuzzyNameScore(a, b);
    // Fallback: exact match only
    var na = String(a || "").toLowerCase().trim();
    var nb = String(b || "").toLowerCase().trim();
    return (na && nb && na === nb) ? 1.0 : 0;
  }

  function _fuzzyTier(score) {
    var BB = window.LorevoxBioBuilder;
    if (BB && typeof BB._fuzzyDuplicateTier === "function") return BB._fuzzyDuplicateTier(score);
    return score >= 1.0 ? "exact" : score >= 0.8 ? "likely" : score >= 0.5 ? "possible" : "distinct";
  }

  function _possibleDuplicate(c, type) {
    var promoted = (_reviewState().promoted[type] || []);
    var v = _title(c);
    if (!v || !v.trim()) return null;
    var bestHit = null, bestScore = 0, bestTier = "distinct";
    promoted.forEach(function (p) {
      var pVal = String(p.value || p.label || p.name || p.title || "").trim();
      if (!pVal) return;
      var score = _fuzzyScore(v, pVal);
      if (score > bestScore) {
        bestScore = score;
        bestHit = pVal;
        bestTier = _fuzzyTier(score);
      }
    });
    if (bestTier === "distinct") return null;
    var singular = (_SINGULAR[type] || type).toLowerCase();
    if (bestTier === "exact") {
      return "A promoted " + singular + " with the same value already exists: \"" + bestHit + "\".";
    }
    return "A promoted " + singular + " is a " + bestTier + " match (" + Math.round(bestScore * 100) + "%): \"" + bestHit + "\".";
  }

  /* ── v5/v6 Integration — FT/LT cross-reference (fuzzy-aware) */

  /* Check if a candidate's value appears in the Bio Builder
     Family Tree or Life Threads draft for the current person.
     v6: Uses fuzzy name scoring when available.
     Returns { inFT: bool, inLT: bool, ftNode: obj|null, ltNode: obj|null,
               ftScore: number, ltScore: number, ftTier: string, ltTier: string } */
  function _draftCrossRef(c) {
    var result = { inFT: false, inLT: false, ftNode: null, ltNode: null,
                   ftScore: 0, ltScore: 0, ftTier: "distinct", ltTier: "distinct" };
    if (typeof window.LorevoxBioBuilder === "undefined" || !window.LorevoxBioBuilder._getDraftFamilyContext) return result;
    var ctx = window.LorevoxBioBuilder._getDraftFamilyContext();
    if (!ctx) return result;
    var v = _title(c);
    if (!v || !v.trim()) return result;

    // Search Family Tree nodes (fuzzy)
    if (ctx.familyTree && Array.isArray(ctx.familyTree.nodes)) {
      var bestFT = 0, bestFTNode = null;
      ctx.familyTree.nodes.forEach(function (n) {
        var nLabel = n.displayName || n.preferredName || n.label || "";
        var score = _fuzzyScore(v, nLabel);
        if (score > bestFT) { bestFT = score; bestFTNode = n; }
      });
      var ftTier = _fuzzyTier(bestFT);
      if (ftTier !== "distinct") {
        result.inFT = true; result.ftNode = bestFTNode;
        result.ftScore = bestFT; result.ftTier = ftTier;
      }
    }

    // Search Life Threads nodes (fuzzy)
    if (ctx.lifeThreads && Array.isArray(ctx.lifeThreads.nodes)) {
      var bestLT = 0, bestLTNode = null;
      ctx.lifeThreads.nodes.forEach(function (n) {
        var nLabel = n.label || n.displayName || "";
        var score = _fuzzyScore(v, nLabel);
        if (score > bestLT) { bestLT = score; bestLTNode = n; }
      });
      var ltTier = _fuzzyTier(bestLT);
      if (ltTier !== "distinct") {
        result.inLT = true; result.ltNode = bestLTNode;
        result.ltScore = bestLT; result.ltTier = ltTier;
      }
    }

    return result;
  }

  /* ── Render — stats ───────────────────────────────────────── */

  function _renderStats() {
    var co = _bucketCounts();
    return '<div class="bio-review-stats">'
      + '<span class="bio-stat-chip">Pending <span class="bio-stat-count">' + _totalPending()  + '</span></span>'
      + '<span class="bio-stat-chip">Approved <span class="bio-stat-count">' + _totalApproved() + '</span></span>'
      + '<span class="bio-stat-chip">People <span class="bio-stat-count">'    + (co.people    || 0) + '</span></span>'
      + '<span class="bio-stat-chip">Memories <span class="bio-stat-count">'  + (co.memories  || 0) + '</span></span>'
      + '<span class="bio-stat-chip">Events <span class="bio-stat-count">'    + (co.events    || 0) + '</span></span>'
      + '</div>';
  }

  /* ── Render — tabs ────────────────────────────────────────── */

  function _renderTabs() {
    var co = _bucketCounts();
    return '<div class="bio-review-tabs">'
      + _TYPES.map(function (t) {
          return '<button class="bio-review-tab' + (ui.activeType === t ? ' active' : '') + '" data-review-tab="' + t + '">'
            + _PLURAL[t] + ' (' + (co[t] || 0) + ')'
            + '</button>';
        }).join("")
      + '</div>';
  }

  /* ── Render — queue ───────────────────────────────────────── */

  function _renderQueueCard(c, type) {
    var id     = c.id;
    var active = ui.activeCandidateId === id ? " active" : "";
    var conf   = _confidence(c);
    var src    = _sourceLabel(c);
    // v6: fuzzy cross-ref badges with confidence tier
    var xref   = _draftCrossRef(c);
    var xrefBadge = "";
    if (xref.inFT) {
      var ftPct = Math.round(xref.ftScore * 100);
      var ftLabel = xref.ftTier === "exact" ? "FT" : "FT " + ftPct + "%";
      xrefBadge += '<span class="bio-mini-chip" style="background:rgba(20,184,166,0.12);color:#5eead4;font-size:9px;" title="Family Tree: ' + xref.ftTier + ' match (' + ftPct + '%)">' + ftLabel + '</span>';
    }
    if (xref.inLT) {
      var ltPct = Math.round(xref.ltScore * 100);
      var ltLabel = xref.ltTier === "exact" ? "LT" : "LT " + ltPct + "%";
      xrefBadge += '<span class="bio-mini-chip" style="background:rgba(168,85,247,0.12);color:#c4b5fd;font-size:9px;" title="Life Threads: ' + xref.ltTier + ' match (' + ltPct + '%)">' + ltLabel + '</span>';
    }

    return '<div class="bio-candidate-card' + active + '" data-candidate-id="' + _esc(id) + '" data-candidate-type="' + _esc(type) + '">'
      + '<div class="bio-candidate-card-top">'
      +   '<div class="bio-candidate-title">' + _esc(_title(c)) + '</div>'
      +   '<div class="bio-candidate-type">' + _esc(_SINGULAR[type] || type) + '</div>'
      + '</div>'
      + '<div class="bio-candidate-snippet">' + _esc(_snippet(c)) + '</div>'
      + '<div class="bio-candidate-meta">'
      +   '<span class="bio-mini-chip" title="' + _esc(src) + '">📂 ' + _esc(src) + '</span>'
      +   '<span class="bio-mini-chip bio-confidence ' + _esc(conf) + '">' + _esc(conf) + '</span>'
      +   xrefBadge
      + '</div>'
      + '</div>';
  }

  function _renderQueue() {
    var items = _filtered(ui.activeType);
    var cardsHtml = items.length
      ? items.map(function (c) { return _renderQueueCard(c, ui.activeType); }).join("")
      : '<div class="bio-review-list-empty">No pending ' + _esc(_PLURAL[ui.activeType] || ui.activeType).toLowerCase() + ' in this queue.</div>';

    return '<div class="bio-review-queue-head">'
      + '<h3 class="bio-review-queue-title">Candidate Queue</h3>'
      + _renderTabs()
      + '<div class="bio-review-queue-toolbar">'
      + '<input id="bioReviewFilter" class="bio-review-filter" type="text"'
      +   ' placeholder="Filter by value, source, or snippet…" value="' + _esc(ui.filterText) + '">'
      + '</div>'
      + '</div>'
      + '<div class="bio-review-list" id="bioReviewList">' + cardsHtml + '</div>';
  }

  /* ── Render — detail ──────────────────────────────────────── */

  function _renderDetail() {
    var found = _currentCandidate();
    if (!found) {
      return '<div class="bio-review-detail-scroll">'
        + '<div class="bio-review-detail-empty">Select a candidate from the queue to review, edit, approve, or reject it.</div>'
        + '</div>'
        + '<div class="bio-review-actions">'
        + '<span class="bio-review-helper">Nothing is promoted automatically — every decision is yours.</span>'
        + '</div>';
    }

    var c    = found.candidate;
    var type = found.type;
    var titleVal  = _title(c);
    var snippetTx = _snippet(c);
    var status    = _status(c);
    var dup       = _possibleDuplicate(c, type);
    var conf      = _confidence(c);

    // v5: Cross-reference with FT/LT draft
    var xref = _draftCrossRef(c);

    var typeOptions = _TYPES.map(function (t) {
      return '<option value="' + t + '"' + (t === type ? ' selected' : '') + '>' + _PLURAL[t] + '</option>';
    }).join("");
    var confOptions = ["low","medium","high"].map(function (lv) {
      return '<option value="' + lv + '"' + (conf === lv ? ' selected' : '') + '>' + lv + '</option>';
    }).join("");

    return '<div class="bio-review-detail-scroll">'
      /* title row */
      + '<div class="bio-detail-title-row">'
      +   '<h3 class="bio-detail-title">' + _esc(titleVal) + '</h3>'
      +   '<div class="bio-detail-status">'
      +     '<span class="bio-status-dot ' + _esc(status) + '"></span>'
      +     _esc(status.charAt(0).toUpperCase() + status.slice(1))
      +   '</div>'
      + '</div>'
      /* editable fields */
      + '<div class="bio-detail-grid">'
      +   '<div class="bio-field">'
      +     '<label class="bio-label" for="reviewValue">Value</label>'
      +     '<input id="reviewValue" class="bio-input" type="text" value="' + _esc(c.value || titleVal) + '">'
      +   '</div>'
      +   '<div class="bio-field">'
      +     '<label class="bio-label" for="reviewType">Type</label>'
      +     '<select id="reviewType" class="bio-select">' + typeOptions + '</select>'
      +   '</div>'
      +   '<div class="bio-field">'
      +     '<label class="bio-label" for="reviewConfidence">Confidence</label>'
      +     '<select id="reviewConfidence" class="bio-select">' + confOptions + '</select>'
      +   '</div>'
      +   '<div class="bio-field">'
      +     '<label class="bio-label" for="reviewLabel">Display Label</label>'
      +     '<input id="reviewLabel" class="bio-input" type="text" value="' + _esc(c.label || "") + '">'
      +   '</div>'
      +   '<div class="bio-field full">'
      +     '<label class="bio-label" for="reviewNote">Reviewer Note</label>'
      +     '<textarea id="reviewNote" class="bio-textarea">' + _esc(c.note || "") + '</textarea>'
      +   '</div>'
      + '</div>'
      /* source snippet */
      + '<div class="bio-detail-block">'
      +   '<h4 class="bio-detail-block-title">Source Snippet</h4>'
      +   '<div class="bio-snippet-box">' + _esc(snippetTx) + '</div>'
      + '</div>'
      /* provenance */
      + '<div class="bio-detail-block">'
      +   '<h4 class="bio-detail-block-title">Provenance</h4>'
      +   '<div class="bio-provenance-box">Unapproved staged candidate — not yet part of structured biography data.</div>'
      +   '<div class="bio-provenance-row">'
      +     '<span class="bio-provenance-chip">type: ' + _esc(c.sourceType || "source_inbox") + '</span>'
      +     '<span class="bio-provenance-chip">id: '   + _esc(c.sourceId   || c.source || "—") + '</span>'
      +     '<span class="bio-provenance-chip">file: ' + _esc(_sourceLabel(c)) + '</span>'
      +   '</div>'
      + '</div>'
      /* possible duplicate */
      + (dup
          ? '<div class="bio-detail-block">'
          +   '<h4 class="bio-detail-block-title">Possible Duplicate</h4>'
          +   '<div class="bio-merge-box">' + _esc(dup) + '</div>'
          +   '<div class="bio-possible-duplicate">Use Merge to combine with the existing record.</div>'
          + '</div>'
          : "")
      /* v6: FT/LT cross-reference indicator with fuzzy confidence */
      + ((xref.inFT || xref.inLT)
          ? '<div class="bio-detail-block">'
          +   '<h4 class="bio-detail-block-title">Bio Builder Cross-Reference</h4>'
          +   '<div class="bio-provenance-row">'
          +     (xref.inFT
              ? '<span class="bio-provenance-chip" style="background:rgba(20,184,166,0.12);color:#5eead4;">'
              +   (xref.ftTier === "exact" ? "Exact match" : (_esc(xref.ftTier.charAt(0).toUpperCase() + xref.ftTier.slice(1)) + " match (" + Math.round(xref.ftScore * 100) + "%)"))
              +   ' in Family Tree'
              +   (xref.ftNode && xref.ftNode.role ? ' — ' + _esc(xref.ftNode.role) : '')
              +   (xref.ftNode ? ' — "' + _esc(xref.ftNode.displayName || xref.ftNode.preferredName || xref.ftNode.label || "") + '"' : '')
              + '</span>'
              : '')
          +     (xref.inLT
              ? '<span class="bio-provenance-chip" style="background:rgba(168,85,247,0.12);color:#c4b5fd;">'
              +   (xref.ltTier === "exact" ? "Exact match" : (_esc(xref.ltTier.charAt(0).toUpperCase() + xref.ltTier.slice(1)) + " match (" + Math.round(xref.ltScore * 100) + "%)"))
              +   ' in Life Threads'
              +   (xref.ltNode && xref.ltNode.type ? ' — ' + _esc(xref.ltNode.type) : '')
              +   (xref.ltNode ? ' — "' + _esc(xref.ltNode.label || xref.ltNode.displayName || "") + '"' : '')
              + '</span>'
              : '')
          +   '</div>'
          +   '<div style="font-size:11px;color:#64748b;margin-top:4px;">'
          +     (xref.ftTier === "exact" || xref.ltTier === "exact"
                  ? 'This candidate is already represented in the draft surfaces above.'
                  : 'This candidate has a fuzzy match in the draft surfaces — review carefully before approving.')
          +   '</div>'
          + '</div>'
          : "")
      + '</div>'  /* end scroll */
      /* action footer */
      + '<div class="bio-review-actions">'
      +   '<button class="bio-btn secondary" id="bioSaveEditsBtn">Save Edits</button>'
      +   '<button class="bio-btn primary"   id="bioApproveBtn">✓ Approve</button>'
      +   '<button class="bio-btn warn"      id="bioMergeBtn">⇄ Merge</button>'
      +   '<button class="bio-btn danger"    id="bioRejectBtn">✕ Reject</button>'
      +   '<span class="bio-review-helper">Approval is the only path into structured biography data.</span>'
      + '</div>';
  }

  /* ── Render — full shell ──────────────────────────────────── */

  function _renderShell() {
    return '<div class="bio-review-root">'
      + '<div class="bio-review-header">'
      +   '<div class="bio-review-title-wrap">'
      +     '<h2 class="bio-review-title">Review &amp; Promote</h2>'
      +     '<p class="bio-review-subtitle">Review staged candidates, refine them, then explicitly approve what should enter structured biography data.</p>'
      +   '</div>'
      +   _renderStats()
      + '</div>'
      + '<div class="bio-review-body">'
      +   '<div class="bio-review-queue">' + _renderQueue()  + '</div>'
      +   '<div class="bio-review-detail">' + _renderDetail() + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ── Event binding ────────────────────────────────────────── */

  function _bindEvents() {
    var root = _el(ROOT_ID);
    if (!root) return;

    /* Type tabs */
    root.querySelectorAll("[data-review-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ui.activeType          = btn.getAttribute("data-review-tab");
        ui.activeCandidateId   = null;
        _render();
      });
    });

    /* Filter — P4-002 fix: preserve focus + cursor position after re-render */
    var filterEl = _el("bioReviewFilter");
    if (filterEl) {
      filterEl.addEventListener("input", function (e) {
        ui.filterText = e.target.value || "";
        var cursorPos = e.target.selectionStart;
        _render();
        var newFilter = _el("bioReviewFilter");
        if (newFilter) {
          newFilter.focus();
          if (typeof cursorPos === "number") {
            newFilter.setSelectionRange(cursorPos, cursorPos);
          }
        }
      });
    }

    /* Queue card selection */
    root.querySelectorAll("[data-candidate-id]").forEach(function (card) {
      card.addEventListener("click", function () {
        ui.activeCandidateId = card.getAttribute("data-candidate-id");
        _render();
      });
    });

    /* Detail actions */
    var saveBtn    = _el("bioSaveEditsBtn");
    var approveBtn = _el("bioApproveBtn");
    var rejectBtn  = _el("bioRejectBtn");
    var mergeBtn   = _el("bioMergeBtn");

    if (saveBtn)    saveBtn.addEventListener("click",    _saveEdits);
    if (approveBtn) approveBtn.addEventListener("click", _approveCurrent);
    if (rejectBtn)  rejectBtn.addEventListener("click",  _rejectCurrent);
    if (mergeBtn)   mergeBtn.addEventListener("click",   _mergeCurrent);
  }

  /* ── Actions ──────────────────────────────────────────────── */

  function _saveEdits() {
    var found = _currentCandidate();
    if (!found) return;
    var c    = found.candidate;
    var type = found.type;

    var nextType  = (_el("reviewType")       || {}).value || type;
    var nextValue = ((_el("reviewValue")     || {}).value || "").trim();
    c.value      = nextValue || _title(c);
    c.label      = ((_el("reviewLabel")      || {}).value || "").trim();
    c.note       = ((_el("reviewNote")       || {}).value || "").trim();
    c.confidence = ((_el("reviewConfidence") || {}).value) || c.confidence || "low";
    c.lastEditedAt = Date.now();

    /* Move between type buckets if the user changed the type selector */
    if (nextType !== type) {
      _ensureState();
      var srcArr  = state.bioBuilder.candidates[type];
      var dstArr  = state.bioBuilder.candidates[nextType];
      if (Array.isArray(srcArr) && Array.isArray(dstArr)) {
        srcArr.splice(found.index, 1);
        c.type = nextType;
        dstArr.push(c);
        ui.activeType = nextType;
      }
    }
    _render();
  }

  function _promote(c, type) {
    _ensureState();
    var rev = _reviewState();
    var promoted = {
      id:           c.id,
      type:         type,
      value:        c.value || _title(c),
      label:        c.label || "",
      source:       c.source       || null,
      sourceType:   c.sourceType   || "source_inbox",
      sourceId:     c.sourceId     || null,
      sourceFilename: c.sourceFilename || null,
      snippet:      c.snippet      || _snippet(c),
      confidence:   c.confidence   || "low",
      note:         c.note         || "",
      verified:     true,
      approvedAt:   Date.now(),
      /* Preserve Phase D nested data so adapters have full context */
      data:         c.data         || {}
    };
    rev.promoted[type] = rev.promoted[type] || [];
    rev.promoted[type].push(promoted);
    rev.approved.push({ id: c.id, type: type, approvedAt: Date.now() });
    c.status = "approved";
  }

  function _removeFromPending(id) {
    _ensureState();
    _TYPES.forEach(function (t) {
      var arr = state.bioBuilder.candidates[t];
      if (!Array.isArray(arr)) return;
      var idx = arr.findIndex(function (c) { return c.id === id; });
      if (idx !== -1) arr.splice(idx, 1);
    });
  }

  function _approveCurrent() {
    var found = _currentCandidate();
    if (!found) return;
    _saveEdits();
    /* Re-fetch after possible type change from saveEdits */
    var refreshed = _findCandidate(found.candidate.id);
    if (!refreshed) return;
    _promote(refreshed.candidate, refreshed.type);
    _removeFromPending(refreshed.candidate.id);
    ui.activeCandidateId = null;
    _render();
  }

  function _rejectCurrent() {
    var found = _currentCandidate();
    if (!found) return;
    found.candidate.status = "rejected";
    _reviewState().rejected.push({ id: found.candidate.id, type: found.type, rejectedAt: Date.now() });
    _removeFromPending(found.candidate.id);
    ui.activeCandidateId = null;
    _render();
  }

  function _mergeCurrent() {
    /* Lightweight merge: approve with a merge note */
    var found = _currentCandidate();
    if (!found) return;
    var dup = _possibleDuplicate(found.candidate, found.type);
    var c   = found.candidate;
    c.note = [c.note || "", dup ? "Merged hint: " + dup : "Merge requested."]
      .filter(Boolean).join("\n");
    _saveEdits();
    _approveCurrent();
  }

  /* ── Public render ────────────────────────────────────────── */

  function _render(targetId) {
    _ensureState();
    var root = _el(targetId || ROOT_ID);
    if (!root) return;

    /* Drop stale active-candidate reference */
    if (ui.activeCandidateId && !_findCandidate(ui.activeCandidateId)) {
      ui.activeCandidateId = null;
    }

    root.innerHTML = _renderShell();
    _bindEvents();
  }

  function init(targetId) {
    _ensureState();
    /* Auto-select the first type that has pending items */
    var defaultType = _TYPES.find(function (t) {
      return _bucket(t).some(function (c) { return _status(c) === "pending"; });
    });
    if (defaultType) ui.activeType = defaultType;
    _render(targetId || ROOT_ID);
  }

  /* ── Public API ───────────────────────────────────────────── */

  NS.init    = init;
  NS.render  = _render;
  NS.approve = _approveCurrent;
  NS.reject  = _rejectCurrent;
  NS.save    = _saveEdits;
  NS.merge   = _mergeCurrent;

  /* Exposed for smoke tests */
  NS._ensureState     = _ensureState;
  NS._title           = _title;
  NS._snippet         = _snippet;
  NS._sourceLabel     = _sourceLabel;
  NS._promote         = _promote;
  NS._removeFromPending = _removeFromPending;
  NS._draftCrossRef   = _draftCrossRef;    // v5/v6 (fuzzy-aware)
  NS._fuzzyScore      = _fuzzyScore;       // v6
  NS._fuzzyTier       = _fuzzyTier;        // v6

  window.LorevoxCandidateReview = NS;

})();
