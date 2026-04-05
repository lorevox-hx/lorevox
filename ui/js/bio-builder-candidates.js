/* ═══════════════════════════════════════════════════════════════
   bio-builder-candidates.js — Candidate intake, display, and shaping

   Phase 4 of the Bio Builder module split.
   Depends on: bio-builder-core.js, bio-builder-sources.js (must load first)

   Owns:
     - Candidate display tab rendering (_renderCandidatesTab)
     - Candidate summary and formatting helpers (_candidateSummary, _sourceLabel)
     - Candidate safe accessors (_getCandidateTitle, _getCandidateText, _getCandidateSnippet, _getCandidateType)
     - Detected item → candidate conversion (_detectedItemToCandidate)
     - Bulk add actions from source review (_addItemAsCandidate, _addAllOfType, _addAllFromCard)
     - Duplicate detection helpers (wraps questionnaire module checks)

   Does NOT own:
     - Candidate review UI (Phase E — bio-review.js)
     - Questionnaire-generated candidate extraction (bio-builder-questionnaire.js)
     - Source text detection (bio-builder-sources.js)

   Exposes: window.LorevoxBioBuilderModules.candidates
   Load order: After bio-builder-core.js and bio-builder-sources.js
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────
     CORE & SOURCES MODULE DELEGATION
  ─────────────────────────────────────────────────────────── */

  var _core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!_core) throw new Error("bio-builder-core.js must load before bio-builder-candidates.js");

  var _src = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.sources;
  if (!_src) throw new Error("bio-builder-sources.js must load before bio-builder-candidates.js");

  // Core utilities
  var _bb              = _core._bb;
  var _uid             = _core._uid;
  var _esc             = _core._esc;
  var _el              = _core._el;
  var _emptyStateHtml  = _core._emptyStateHtml;
  var _currentPersonId = _core._currentPersonId;

  // Sources module
  var _renderSourceReview = _src._renderSourceReview;

  /* ───────────────────────────────────────────────────────────
     QUESTIONNAIRE MODULE DELEGATION
     Imported lazily to avoid circular dependencies.
     These functions check for duplicate candidates.
  ─────────────────────────────────────────────────────────── */

  function _getQuestionnaireModule() {
    return window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.questionnaire;
  }

  function _candidateExists(candidateText) {
    var _qq = _getQuestionnaireModule();
    if (!_qq || !_qq._candidateExists) return false;
    return _qq._candidateExists(candidateText);
  }

  function _relCandidateExists(personA, personB) {
    var _qq = _getQuestionnaireModule();
    if (!_qq || !_qq._relCandidateExists) return false;
    return _qq._relCandidateExists(personA, personB);
  }

  function _memCandidateExists(text) {
    var _qq = _getQuestionnaireModule();
    if (!_qq || !_qq._memCandidateExists) return false;
    return _qq._memCandidateExists(text);
  }

  /* ───────────────────────────────────────────────────────────
     CANDIDATES TAB RENDERING (Phase E — delegates to bio-review.js)
  ─────────────────────────────────────────────────────────── */

  function _renderCandidatesTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml(
        "No narrator selected",
        "Select a narrator and fill in questionnaire sections to generate candidate items.",
        []
      );
      return;
    }

    /* Phase E: mount the review UI into a child div so the popover
       scroll / layout is managed by bio-review.css.  The inner div
       needs display:flex;flex:1 so the review root fills the tab area. */
    container.innerHTML = '<div id="candidateReviewRoot" style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;"></div>';

    if (window.LorevoxCandidateReview) {
      window.LorevoxCandidateReview.render("candidateReviewRoot");
    } else {
      /* Graceful fallback if bio-review.js has not loaded yet */
      container.innerHTML = _emptyStateHtml(
        "Review module loading…",
        "Reload the page if this message persists.",
        []
      );
    }
  }

  /* ───────────────────────────────────────────────────────────
     CANDIDATE DISPLAY HELPERS
  ─────────────────────────────────────────────────────────── */

  function _candidateSummary(c) {
    var d = c.data || {};
    if (c.type === "person")       return { title: d.name || "Unknown person", detail: [d.birthDate, d.birthPlace, d.occupation].filter(Boolean).join(" · ") };
    if (c.type === "relationship") return { title: (d.personA || "?") + " → " + (d.personB || "?"), detail: d.relation || "" };
    if (c.type === "memory")       return { title: d.label || "Memory", detail: (d.text || "").slice(0, 120) };
    if (c.type === "event")        return { title: d.text || "Date/Event", detail: d.context ? d.context.slice(0, 80) : "" };
    if (c.type === "place")        return { title: d.text || "Place", detail: d.context ? d.context.slice(0, 80) : "" };
    return { title: c.type, detail: "" };
  }

  function _sourceLabel(candidate) {
    var src      = candidate.source || "";
    var filename = candidate.sourceFilename || null;
    if (src.startsWith("questionnaire:")) {
      return "questionnaire — " + src.replace("questionnaire:", "");
    }
    if (src.startsWith("source:")) {
      return filename ? "📄 " + filename : "uploaded document";
    }
    if (src.startsWith("quickCapture:") || src.startsWith("quick:")) {
      // Phase M: show displayTag if available (e.g. "Possible Duplicate", "Adds New Detail")
      var d = candidate.data || {};
      var tag = d.displayTag || d.label || "";
      var base = src.startsWith("quickCapture:fact") ? "Quick Fact" : src.startsWith("quickCapture:note") ? "Quick Note" : "Quick Capture";
      return tag && tag !== base ? base + " — " + tag : base;
    }
    return src || "unknown";
  }

  /* ═══════════════════════════════════════════════════════════════
     SAFE CANDIDATE ACCESSORS
     Handles both Phase D `data.*` nested shapes and Phase E
     top-level normalized shapes without breaking.
  ═══════════════════════════════════════════════════════════════ */

  function _getCandidateTitle(c) {
    if (!c) return "Untitled";
    var d = c.data || {};
    return c.value || c.label || c.name || c.title || d.name || d.label || d.text || d.title || c.type || "Untitled";
  }

  function _getCandidateText(c) {
    if (!c) return "";
    var d = c.data || {};
    return c.text || c.snippet || c.preview || d.text || d.context || d.notes || d.snippet || "";
  }

  function _getCandidateSnippet(c) {
    var full = _getCandidateText(c);
    return full.length > 120 ? full.slice(0, 117) + "…" : full;
  }

  function _getCandidateType(c) {
    if (!c) return "unknown";
    return c.type || (c.data && c.data.type) || "unknown";
  }

  /* ───────────────────────────────────────────────────────────
     DETECTED ITEM → CANDIDATE CONVERSION
     Transforms detected items from source review into candidates
     with proper provenance tracking and Phase E compatibility.
  ─────────────────────────────────────────────────────────── */

  function _detectedItemToCandidate(item, type, card) {
    var data = {};
    if (type === "person") {
      data = { name: item.text, relation: item.relation || "", context: item.context || "" };
    } else {
      data = { text: item.text, context: item.context || "" };
    }
    /* value + snippet are Phase E top-level fields that bio-review.js reads
       directly.  For questionnaire-generated candidates that were created before
       Phase E, bio-review.js falls back to the nested data object via its compat
       shims (_title / _snippet), so those cards still display correctly. */
    return {
      id:             _uid(),
      type:           type,
      value:          item.text,         // Phase E: direct title accessor
      snippet:        item.context || "", // Phase E: source sentence
      source:         "source:" + card.id,
      sourceId:       card.id,
      sourceFilename: card.filename,
      data:           data,
      status:         "pending"
    };
  }

  /* ───────────────────────────────────────────────────────────
     BULK ADD ACTIONS FROM SOURCE REVIEW
     Called from detected item review surface to add items as candidates.
  ─────────────────────────────────────────────────────────── */

  function _addItemAsCandidate(cardId, bucketKey, itemId, candidateType) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card || !card.detectedItems) return;

    var bucket = card.detectedItems[bucketKey];
    if (!bucket) return;
    var item = bucket.find(function (it) { return it.id === itemId; });
    if (!item || item.added) return;

    // Map detected item → candidate
    var candidate = _detectedItemToCandidate(item, candidateType, card);

    // Duplicate guard
    var existingBucket = candidateType === "person"   ? "people"
                       : candidateType === "event"    ? "events"
                       : candidateType === "place"    ? "places"
                       : candidateType === "memory"   ? "memories"
                       : "documents";

    var isDupe = bb.candidates[existingBucket].some(function (c) {
      return c.data && c.data.text === candidate.data.text && c.source === candidate.source;
    });

    if (!isDupe) {
      bb.candidates[existingBucket].push(candidate);
      card.addedCandidateIds = card.addedCandidateIds || [];
      card.addedCandidateIds.push(candidate.id);
    }

    item.added = true;
    _renderSourceReview(_el("bbTabContent"));
  }

  function _addAllOfType(cardId, bucketKey, candidateType) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card || !card.detectedItems) return;

    var bucket = card.detectedItems[bucketKey];
    if (!bucket) return;

    bucket.forEach(function (item) {
      if (item.added) return;
      _addItemAsCandidate(cardId, bucketKey, item.id, candidateType);
    });
  }

  function _addAllFromCard(cardId) {
    var bb   = _bb(); if (!bb) return;
    var card = bb.sourceCards.find(function (c) { return c.id === cardId; });
    if (!card || !card.detectedItems) return;

    var typeMap = { people: "person", dates: "event", places: "place", memories: "memory" };
    Object.keys(typeMap).forEach(function (bucketKey) {
      var bucket = card.detectedItems[bucketKey];
      if (!bucket) return;
      bucket.forEach(function (item) {
        if (item.added) return;
        _addItemAsCandidate(cardId, bucketKey, item.id, typeMap[bucketKey]);
      });
    });
  }

  /* ───────────────────────────────────────────────────────────
     MODULE EXPORT
  ─────────────────────────────────────────────────────────── */

  window.LorevoxBioBuilderModules.candidates = {
    // Candidates tab rendering
    _renderCandidatesTab:    _renderCandidatesTab,

    // Display helpers
    _candidateSummary:       _candidateSummary,
    _sourceLabel:            _sourceLabel,

    // Safe accessors (Phase D/E compatible)
    _getCandidateTitle:      _getCandidateTitle,
    _getCandidateText:       _getCandidateText,
    _getCandidateSnippet:    _getCandidateSnippet,
    _getCandidateType:       _getCandidateType,

    // Duplicate detection (wraps questionnaire module)
    _candidateExists:        _candidateExists,
    _relCandidateExists:     _relCandidateExists,
    _memCandidateExists:     _memCandidateExists,

    // Detected item → candidate conversion
    _detectedItemToCandidate: _detectedItemToCandidate,

    // Bulk add actions
    _addItemAsCandidate:     _addItemAsCandidate,
    _addAllOfType:           _addAllOfType,
    _addAllFromCard:         _addAllFromCard
  };

})();
