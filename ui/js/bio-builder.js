/* ═══════════════════════════════════════════════════════════════
   bio-builder.js — Bio Builder intake and staging layer
   Lorevox 8.0 — Phase D (builds on Phase B + C foundation)

   Phase D additions over Phase C:
     - FileReader text extraction for text/md/csv/htm uploads
     - Manual paste path for PDF, image, and binary files
     - Pattern-based detection: people (relationship-anchored), dates,
       places, memory fragments — each with sentence context
     - Provenance model: every candidate tracks sourceCardId + filename
     - Source card review surface: extracted text + detected items +
       add-to-candidate actions with duplicate guard
     - Updated Candidates tab: shows source filename as provenance

   Architecture:
     Archive / Source Intake
       ↓
     Bio Builder  ← THIS MODULE
       organizes and stages candidate biographical information
       ↓
     Structured History
       reviewed facts, people, relationships, periods, events
       ↓
     Derived Views (Life Map, Timeline, Peek at Memoir)

   Truth rules:
     - Writes ONLY to state.bioBuilder
     - Never writes to state.archive, state.facts, state.timeline
     - Candidate items are NOT reviewed facts
     - Promotion to structured history requires explicit user action (Phase E)
     - No CDN dependencies — self-contained

   Load order: after app.js / state.js
   Exposes: window.LorevoxBioBuilder
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────
     CORE MODULE DELEGATION (Phase 1 module split)
     All shared state, persistence, narrator scoping, and utility
     functions now live in bio-builder-core.js.  We pull them in
     as local aliases so existing code continues to work unchanged.
  ─────────────────────────────────────────────────────────── */

  var _core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!_core) throw new Error("bio-builder-core.js must load before bio-builder.js");

  // State access
  var _ensureState              = _core._ensureState;
  var _bb                       = _core._bb;

  // Narrator scoping
  var _resetNarratorScopedState = _core._resetNarratorScopedState;
  var _onNarratorSwitch         = _core._onNarratorSwitch;
  var _personChanged            = _core._personChanged;

  // Persistence
  var DRAFT_SCHEMA_VERSION      = _core.DRAFT_SCHEMA_VERSION;
  var _LS_FT_PREFIX             = _core._LS_FT_PREFIX;
  var _LS_LT_PREFIX             = _core._LS_LT_PREFIX;
  var _LS_QQ_PREFIX             = _core._LS_QQ_PREFIX;
  var _LS_DRAFT_INDEX           = _core._LS_DRAFT_INDEX;
  var _persistDrafts            = _core._persistDrafts;
  var _loadDrafts               = _core._loadDrafts;
  var _clearDrafts              = _core._clearDrafts;
  var _getDraftIndex            = _core._getDraftIndex;

  // Utilities
  var _el                       = _core._el;
  var _uid                      = _core._uid;
  var _esc                      = _core._esc;
  var _currentPersonId          = _core._currentPersonId;
  var _currentPersonName        = _core._currentPersonName;
  var _formatBytes              = _core._formatBytes;
  var _showInlineConfirm        = _core._showInlineConfirm;
  var _emptyStateHtml           = _core._emptyStateHtml;
  var _hasAnyValue              = _core._hasAnyValue;

  // View state (mutable shared object from core)
  var _viewState                = _core._viewState;

  /* ───────────────────────────────────────────────────────────
     QUESTIONNAIRE MODULE DELEGATION (Phase 2 module split)
     All questionnaire definitions, rendering, normalization,
     hydration, and candidate extraction now live in
     bio-builder-questionnaire.js.  We pull them in as local
     aliases so existing code continues to work unchanged.
  ─────────────────────────────────────────────────────────── */

  var _qq = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.questionnaire;
  if (!_qq) throw new Error("bio-builder-questionnaire.js must load before bio-builder.js");

  // Section definitions
  var SECTIONS                          = _qq.SECTIONS;

  // Rendering
  var _renderQuestionnaireTab           = _qq._renderQuestionnaireTab;
  var _renderSectionDetail              = _qq._renderSectionDetail;
  var _fieldHtml                        = _qq._fieldHtml;
  var _sectionFillCount                 = _qq._sectionFillCount;

  // Normalization
  var normalizeDobInput                 = _qq.normalizeDobInput;
  var normalizeTimeOfBirthInput         = _qq.normalizeTimeOfBirthInput;
  var normalizePlaceInput               = _qq.normalizePlaceInput;
  var deriveZodiacFromDob               = _qq.deriveZodiacFromDob;
  var buildCanonicalBasicsFromBioBuilder = _qq.buildCanonicalBasicsFromBioBuilder;
  var _onNormalizeBlur                  = _qq._onNormalizeBlur;

  // Hydration (registered as post-switch hook inside questionnaire module)
  var _hydrateQuestionnaireFromProfile  = _qq._hydrateQuestionnaireFromProfile;

  // Candidate extraction
  var _extractQuestionnaireCandidates   = _qq._extractQuestionnaireCandidates;
  var _candidateExists                  = _qq._candidateExists;
  var _relCandidateExists               = _qq._relCandidateExists;
  var _memCandidateExists               = _qq._memCandidateExists;

  // Actions (save/repeat use callbacks for re-render coordination)
  var _qqSaveSection                    = _qq._saveSection;
  var _qqAddRepeatEntry                 = _qq._addRepeatEntry;

  /* ───────────────────────────────────────────────────────────
     SOURCES MODULE DELEGATION (Phase 3 module split)
     All source intake, text extraction engine, and source card
     review rendering now live in bio-builder-sources.js.  We pull
     them in as local aliases so existing code continues to work
     unchanged.
  ─────────────────────────────────────────────────────────── */

  var _src = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.sources;
  if (!_src) throw new Error("bio-builder-sources.js must load before bio-builder.js");

  // Extraction engine
  var _parseTextItems                   = _src._parseTextItems;

  // Rendering (called from _renderActiveTab)
  var _renderSourcesTab                 = _src._renderSourcesTab;
  var _renderSourceReview               = _src._renderSourceReview;
  var _sourceIcon                       = _src._sourceIcon;

  // Source actions (wrapped below with _renderActiveTab callback)
  var _srcHandleFiles                   = _src._handleFiles;
  var _srcReviewSource                  = _src._reviewSource;
  var _srcCloseSourceReview             = _src._closeSourceReview;
  var _srcSavePastedText                = _src._savePastedText;
  var _srcClearSourceReviewState        = _src._clearSourceReviewState;

  /* ── Previously extracted modules ──────────────────────────
     STATE MODEL — now in bio-builder-core.js
     UTILITIES — now in bio-builder-core.js
     QUESTIONNAIRE — now in bio-builder-questionnaire.js
     SOURCE INTAKE + EXTRACTION — now in bio-builder-sources.js
  ─────────────────────────────────────────────────────────── */

  /* ───────────────────────────────────────────────────────────
     ACTIVE VIEW TRACKING
  ─────────────────────────────────────────────────────────── */

  var _activeSection      = null; // questionnaire section id currently open
  var _activeTab          = "capture";
  // _activeSourceCardId — now managed inside bio-builder-sources.js (Phase 3 module split)

  // v6: Graph mode state — "cards" (default) or "graph"
  var _ftViewMode = "cards";
  var FT_VIEW_MODES = ["cards", "graph", "scaffold"];
  var _ltViewMode = "cards";

  /* ── Candidate extraction + section fill progress ────────────
     Now in bio-builder-questionnaire.js. Imported as aliases above:
     _extractQuestionnaireCandidates, _candidateExists,
     _relCandidateExists, _memCandidateExists, _sectionFillCount
  ─────────────────────────────────────────────────────────── */

  /* ───────────────────────────────────────────────────────────
     RENDERING — MAIN POPOVER
  ─────────────────────────────────────────────────────────── */

  function render() {
    var host = _el("bioBuilderPopover");
    if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;
    var pid = _currentPersonId();
    _personChanged(pid);
    _renderHeader();
    _renderTabs();
    _renderActiveTab();
  }

  function _renderHeader() {
    var subtitle = _el("bbSubtitle"); if (!subtitle) return;
    var pid  = _currentPersonId();
    var name = _currentPersonName();
    if (!pid) {
      subtitle.textContent = "No narrator selected — choose one above to begin";
    } else {
      subtitle.textContent = name ? "Capturing biography for " + name : "Capturing biography";
    }
  }

  function _renderTabs() {
    ["bbTabCapture","bbTabQuestionnaire","bbTabSources","bbTabCandidates","bbTabFamilyTree","bbTabLifeThreads"].forEach(function (tid) {
      var el = _el(tid); if (!el) return;
      el.classList.toggle("bb-tab-active", el.dataset.tab === _activeTab);
    });
  }

  function _renderActiveTab() {
    var content = _el("bbTabContent"); if (!content) return;
    content.innerHTML = "";
    var pid = _currentPersonId();
    if      (_activeTab === "capture")       _renderCaptureTab(content, pid);
    else if (_activeTab === "questionnaire") _renderQuestionnaireTab(content, pid, _activeSection, _renderActiveTab);
    else if (_activeTab === "sources")       _renderSourcesTab(content, pid);
    else if (_activeTab === "candidates")    _renderCandidatesTab(content, pid);
    else if (_activeTab === "familyTree")    _renderFamilyTreeTab(content, pid);
    else if (_activeTab === "lifeThreads")   _renderLifeThreadsTab(content, pid);
  }

  /* ── Quick Capture Tab ──────────────────────────────────── */

  function _renderCaptureTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml(
        "No narrator selected",
        "Choose a narrator from the dropdown above to start capturing their biography.",
        [
          { label: "📋 Questionnaire", action: "window.LorevoxBioBuilder._switchTab('questionnaire')" },
          { label: "📁 Source Inbox",  action: "window.LorevoxBioBuilder._switchTab('sources')" }
        ]
      );
      return;
    }
    var bb = _bb();
    var itemsHtml = "";
    if (bb.quickItems.length > 0) {
      itemsHtml = '<div class="bb-quick-list">'
        + bb.quickItems.slice().reverse().slice(0, 20).map(function (item) {
            var typeLabel = item.type === "fact" ? "Fact" : "Note";
            var preview   = (item.text || "").slice(0, 120) + ((item.text || "").length > 120 ? "…" : "");
            return '<div class="bb-quick-item">'
              + '<span class="bb-quick-type">' + _esc(typeLabel) + '</span>'
              + '<span class="bb-quick-text">' + _esc(preview) + '</span>'
              + '</div>';
          }).join("")
        + '</div>';
    } else {
      itemsHtml = '<p class="bb-hint-text">Facts and notes you add here will appear as candidate items you can review.</p>';
    }
    container.innerHTML =
      '<div class="bb-section-title">Quick Capture</div>'
      + '<div class="bb-quick-entry">'
      +   '<div class="bb-entry-row">'
      +     '<input id="bbFactInput" class="bb-input" type="text" placeholder="Add a quick fact about the narrator" />'
      +     '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._addFact()">Add Fact</button>'
      +   '</div>'
      +   '<textarea id="bbNoteInput" class="bb-textarea" placeholder="Paste text, type notes, or add anything biographical — no structure required…" rows="4"></textarea>'
      +   '<div class="bb-entry-row bb-entry-row--end">'
      +     '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._addNote()">Save Note</button>'
      +   '</div>'
      + '</div>'
      + '<div class="bb-section-title bb-section-title--mt">Recent Items</div>'
      + itemsHtml
      + '<div class="bb-quick-links">'
      +   '<button class="bb-ghost-btn" onclick="window.LorevoxBioBuilder._switchTab(\'questionnaire\')">📋 Open Questionnaire</button>'
      +   '<button class="bb-ghost-btn" onclick="window.LorevoxBioBuilder._switchTab(\'sources\')">📁 Add Documents</button>'
      + '</div>';
    // Dynamically set placeholder using current narrator profile
    var factInput = _el("bbFactInput");
    try {
      if (factInput && typeof state !== "undefined" && state.profile && state.profile.basics) {
        var name = state.profile.basics.preferred || "the narrator";
        var pob  = state.profile.basics.pob || "their hometown";
        var year = (state.profile.basics.dob || "").substring(0, 4) || "YYYY";
        factInput.placeholder = "Add a quick fact \u2014 e.g. " + name + " was born in " + pob + " in " + year;
      }
    } catch (_) {}
  }

  /* ── Questionnaire Tab — now in bio-builder-questionnaire.js ──
     _renderQuestionnaireTab, _renderSectionDetail, _fieldHtml,
     _onNormalizeBlur are imported as aliases above.
  ─────────────────────────────────────────────────────────── */

  /* ── Source Inbox Tab — now in bio-builder-sources.js ─────
     _renderSourcesTab, _sourceCardStatusInfo, _renderSourceReview,
     _renderDetectedBucket, _sourceIcon are imported as aliases above.
  ─────────────────────────────────────────────────────────── */

  /* ── Candidates Tab (updated Phase D — provenance) ──────── */

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
    if (src.startsWith("quick:")) return "quick capture";
    return src || "unknown";
  }

  /* ── Helpers ────────────────────────────────────────────── */

  /* _emptyStateHtml — now in bio-builder-core.js, imported as alias above */
  /* _sourceIcon — now in bio-builder-sources.js, imported as alias above */

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

  /* ═══════════════════════════════════════════════════════════════
     FAMILY TREE — Draft staging surface (v3)
     Per-person draft stores under state.bioBuilder.familyTreeDraftsByPerson
     Uses state.person_id for narrator scoping.
     Writes ONLY to Bio Builder state — never to truth layers.
  ═══════════════════════════════════════════════════════════════ */

  var FT_ROLES = ["narrator","parent","sibling","spouse","child","grandparent","grandchild","guardian","chosen_family","other"];
  var FT_REL_TYPES = ["biological","adoptive","step","marriage","partnership","former_marriage","guardian","chosen_family","half","foster","other"];

  // v6: Era-role relevance map — which roles are most relevant to which eras
  var ERA_ROLE_RELEVANCE = {
    early_childhood:  { parent: 1.0, sibling: 0.8, grandparent: 0.9, guardian: 0.9, chosen_family: 0.3, spouse: 0.0, child: 0.0 },
    school_years:     { parent: 0.8, sibling: 0.9, grandparent: 0.6, guardian: 0.7, chosen_family: 0.4, spouse: 0.0, child: 0.0 },
    adolescence:      { parent: 0.6, sibling: 0.8, grandparent: 0.4, guardian: 0.5, chosen_family: 0.5, spouse: 0.1, child: 0.0 },
    early_adulthood:  { parent: 0.4, sibling: 0.5, grandparent: 0.3, guardian: 0.2, chosen_family: 0.6, spouse: 0.9, child: 0.5 },
    midlife:          { parent: 0.3, sibling: 0.4, grandparent: 0.1, guardian: 0.1, chosen_family: 0.5, spouse: 0.9, child: 0.9 },
    later_life:       { parent: 0.2, sibling: 0.3, grandparent: 0.0, guardian: 0.0, chosen_family: 0.5, spouse: 0.7, child: 0.8, grandchild: 0.9 }
  };

  // v6: Era-theme relevance keywords
  var ERA_THEME_KEYWORDS = {
    early_childhood:  ["home","family","childhood","birth","beginning","first","mother","father","house","yard","kitchen","play"],
    school_years:     ["school","education","teacher","class","learn","friend","grade","study","read","sport"],
    adolescence:      ["teen","independence","identity","rebel","music","friendship","dating","high school","growth"],
    early_adulthood:  ["career","college","marriage","wedding","move","job","apartment","independence","travel","ambition"],
    midlife:          ["career","work","responsibility","children","mortgage","promotion","stability","routine","caregiving","community"],
    later_life:       ["retire","legacy","loss","grandchild","health","reflection","wisdom","downsize","memory","faith","grief","gratitude"]
  };

  // v6: Fuzzy name normalization helper
  function _normalizeName(s) {
    if (!s) return "";
    return String(s).toLowerCase()
      .replace(/[''`\u2018\u2019]/g, "'")    // normalize apostrophes
      .replace(/["""\u201C\u201D]/g, '"')    // normalize quotes
      .replace(/\./g, "")                     // strip periods (J.R. → JR)
      .replace(/,/g, "")                      // strip commas
      .replace(/\s+/g, " ")                   // collapse whitespace
      .replace(/\b(jr|sr|ii|iii|iv|dr|mr|mrs|ms|miss)\b/gi, "")  // strip titles/suffixes
      .trim();
  }

  // v6: Token-based fuzzy score (0.0–1.0)
  function _fuzzyNameScore(a, b) {
    var na = _normalizeName(a);
    var nb = _normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1.0;

    var tokA = na.split(/\s+/).filter(Boolean);
    var tokB = nb.split(/\s+/).filter(Boolean);
    if (!tokA.length || !tokB.length) return 0;

    // Check first/last name agreement
    var firstMatch = tokA[0] === tokB[0] ? 1 : 0;
    var lastA = tokA[tokA.length - 1], lastB = tokB[tokB.length - 1];
    var lastMatch = lastA === lastB ? 1 : 0;

    // Token overlap (handles middle name presence/absence)
    var setA = {};
    tokA.forEach(function (t) { setA[t] = true; });
    var overlap = 0;
    tokB.forEach(function (t) { if (setA[t]) overlap++; });
    var tokenScore = overlap / Math.max(tokA.length, tokB.length);

    // Initial matching (handles "J" vs "James")
    var initialBonus = 0;
    if (tokA.length !== tokB.length) {
      var shorter = tokA.length < tokB.length ? tokA : tokB;
      var longer  = tokA.length < tokB.length ? tokB : tokA;
      shorter.forEach(function (t) {
        if (t.length === 1) {
          var match = longer.find(function (l) { return l.charAt(0) === t; });
          if (match) initialBonus += 0.15;
        }
      });
    }

    // Weighted composite
    var score = (firstMatch * 0.3) + (lastMatch * 0.35) + (tokenScore * 0.25) + Math.min(initialBonus, 0.1);
    return Math.min(score, 1.0);
  }

  // v6: Fuzzy duplicate confidence tier
  function _fuzzyDuplicateTier(score) {
    if (score >= 1.0)  return "exact";
    if (score >= 0.8)  return "likely";
    if (score >= 0.5)  return "possible";
    return "distinct";
  }

  function _ftDraft(pid) {
    var bb = _bb(); if (!bb) return null;
    if (!bb.familyTreeDraftsByPerson) bb.familyTreeDraftsByPerson = {};
    var id = pid || _currentPersonId() || "default";
    if (!bb.familyTreeDraftsByPerson[id]) {
      bb.familyTreeDraftsByPerson[id] = { nodes: [], edges: [], meta: {} };
    }
    return bb.familyTreeDraftsByPerson[id];
  }

  function _ftMakeNode(role, data) {
    return {
      id: "ftn_" + _uid(),
      type: "person",
      role: role || "other",
      firstName: (data && data.firstName) || "",
      middleName: (data && data.middleName) || "",
      lastName: (data && data.lastName) || "",
      displayName: (data && data.displayName) || "",
      preferredName: (data && data.preferredName) || "",
      deceased: !!(data && data.deceased),
      birthDate: (data && data.birthDate) || "",
      deathDate: (data && data.deathDate) || "",
      deathContext: (data && data.deathContext) || "",
      notes: (data && data.notes) || "",
      uncertainty: (data && data.uncertainty) || "",
      source: (data && data.source) || "manual"
    };
  }

  function _ftMakeEdge(fromId, toId, relType, label, notes) {
    return {
      id: "fte_" + _uid(),
      from: fromId,
      to: toId,
      relationshipType: relType || "other",
      label: label || "",
      notes: notes || ""
    };
  }

  function _ftNodeDisplayName(node) {
    if (node.displayName) return node.displayName;
    if (node.preferredName) return node.preferredName;
    var parts = [node.firstName, node.middleName, node.lastName].filter(Boolean);
    if (parts.length) return parts.join(" ");
    if (node.label) return node.label;
    return node.uncertainty || "Unknown";
  }

  /* ── Family Tree: Add / Edit / Delete ───────────────────── */

  function _ftAddNode(role) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var node = _ftMakeNode(role || "other", {});
    draft.nodes.push(node);
    _ftEditNode(node.id);
  }

  function _ftDeleteNode(nodeId, confirmed) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    // v7 fix: inline confirmation instead of native confirm() dialog
    var edgeCount = draft.edges.filter(function (e) { return e.from === nodeId || e.to === nodeId; }).length;
    if (edgeCount > 0 && !confirmed) {
      _showInlineConfirm(
        "This person has " + edgeCount + " connection(s). Delete anyway?",
        function () { _ftDeleteNode(nodeId, true); }
      );
      return;
    }
    draft.nodes = draft.nodes.filter(function (n) { return n.id !== nodeId; });
    // v7 fix: auto-clean orphan edges when node is deleted (V2-F04)
    draft.edges = draft.edges.filter(function (e) { return e.from !== nodeId && e.to !== nodeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ftEditNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    var content = _el("bbTabContent"); if (!content) return;

    var roleOpts = FT_ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === node.role ? ' selected' : '') + '>' + r.replace(/_/g, ' ') + '</option>';
    }).join("");

    var uncOpts = ["","Unknown","Approximate","Partially known","Not applicable","Can't remember","Fill in later","Family story / unverified"].map(function (u) {
      return '<option value="' + u + '"' + (u === (node.uncertainty || "") ? ' selected' : '') + '>' + (u || '— none —') + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'familyTree\')">← Back to Family Tree</button></div>'
      + '<div class="bb-section-title">Edit Family Member</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">Role</label><select id="ftEditRole" class="bb-select">' + roleOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">First Name</label><input id="ftEditFirst" class="bb-input" type="text" value="' + _esc(node.firstName) + '" placeholder="First name or leave blank if unknown" /></div>'
      + '<div class="bb-field"><label class="bb-label">Middle Name</label><input id="ftEditMiddle" class="bb-input" type="text" value="' + _esc(node.middleName) + '" /></div>'
      + '<div class="bb-field"><label class="bb-label">Last Name</label><input id="ftEditLast" class="bb-input" type="text" value="' + _esc(node.lastName) + '" /></div>'
      + '<div class="bb-field"><label class="bb-label">Preferred / Display Name</label><input id="ftEditPreferred" class="bb-input" type="text" value="' + _esc(node.preferredName) + '" placeholder="How they were known" /></div>'
      + '<div class="bb-field"><label class="bb-label">Birth Date</label><input id="ftEditBirth" class="bb-input" type="text" value="' + _esc(node.birthDate) + '" placeholder="YYYY-MM-DD or approximate" /></div>'
      + '<div class="bb-field"><label class="bb-label">Deceased</label><select id="ftEditDeceased" class="bb-select"><option value="false"' + (!node.deceased ? ' selected' : '') + '>No</option><option value="true"' + (node.deceased ? ' selected' : '') + '>Yes</option></select></div>'
      + '<div class="bb-field"><label class="bb-label">Death Date</label><input id="ftEditDeath" class="bb-input" type="text" value="' + _esc(node.deathDate) + '" placeholder="YYYY-MM-DD or approximate" /></div>'
      + '<div class="bb-field"><label class="bb-label">Death Context</label><textarea id="ftEditDeathCtx" class="bb-textarea" rows="2" placeholder="Died shortly after birth, Died by suicide, Cause unknown — use the person\'s own words when possible">' + _esc(node.deathContext) + '</textarea></div>'
      + '<div class="bb-field"><label class="bb-label">Uncertainty</label><select id="ftEditUncertain" class="bb-select">' + uncOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ftEditNotes" class="bb-textarea" rows="3" placeholder="Anything the narrator wants to capture">' + _esc(node.notes) + '</textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer">'
      + '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ftSaveNode(\'' + node.id + '\')">Save</button>'
      + '<button class="bb-ghost-btn" style="color:#f87171" onclick="window.LorevoxBioBuilder._ftDeleteNode(\'' + node.id + '\')">Delete</button>'
      + '</div>';
  }

  function _ftSaveNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    node.role = (_el("ftEditRole") || {}).value || node.role;
    node.firstName = (_el("ftEditFirst") || {}).value || "";
    node.middleName = (_el("ftEditMiddle") || {}).value || "";
    node.lastName = (_el("ftEditLast") || {}).value || "";
    node.preferredName = (_el("ftEditPreferred") || {}).value || "";
    node.birthDate = (_el("ftEditBirth") || {}).value || "";
    node.deceased = (_el("ftEditDeceased") || {}).value === "true";
    node.deathDate = (_el("ftEditDeath") || {}).value || "";
    node.deathContext = (_el("ftEditDeathCtx") || {}).value || "";
    node.uncertainty = (_el("ftEditUncertain") || {}).value || "";
    node.notes = (_el("ftEditNotes") || {}).value || "";
    node.displayName = ""; // recompute from parts
    _persistDrafts(pid);
    _switchTab("familyTree");
  }

  /* ── Family Tree: Add Edge ──────────────────────────────── */

  function _ftAddEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var content = _el("bbTabContent"); if (!content) return;
    var fromNode = draft.nodes.find(function (n) { return n.id === fromId; });
    if (!fromNode) return;

    var otherNodes = draft.nodes.filter(function (n) { return n.id !== fromId; });
    if (!otherNodes.length) {
      content.innerHTML = _emptyStateHtml("Need more people", "Add at least two family members before connecting them.", [
        { label: "← Back", action: "window.LorevoxBioBuilder._switchTab('familyTree')" }
      ]);
      return;
    }

    var toOpts = otherNodes.map(function (n) {
      return '<option value="' + n.id + '">' + _esc(_ftNodeDisplayName(n)) + '</option>';
    }).join("");
    var relOpts = FT_REL_TYPES.map(function (r) {
      return '<option value="' + r + '">' + r.replace(/_/g, ' ') + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'familyTree\')">← Back</button></div>'
      + '<div class="bb-section-title">Connect ' + _esc(_ftNodeDisplayName(fromNode)) + '</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">To</label><select id="ftEdgeTo" class="bb-select">' + toOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Relationship Type</label><select id="ftEdgeRel" class="bb-select">' + relOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Label</label><input id="ftEdgeLabel" class="bb-input" type="text" placeholder="e.g. biological mother, stepfather" /></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ftEdgeNotes" class="bb-textarea" rows="2"></textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer"><button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ftSaveEdge(\'' + fromId + '\')">Save Connection</button></div>';
  }

  function _ftSaveEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var toId = (_el("ftEdgeTo") || {}).value;
    var relType = (_el("ftEdgeRel") || {}).value || "other";
    var label = (_el("ftEdgeLabel") || {}).value || "";
    var notes = (_el("ftEdgeNotes") || {}).value || "";
    if (toId) {
      draft.edges.push(_ftMakeEdge(fromId, toId, relType, label, notes));
    }
    _persistDrafts(pid);
    _switchTab("familyTree");
  }

  function _ftDeleteEdge(edgeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    draft.edges = draft.edges.filter(function (e) { return e.id !== edgeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── Family Tree: Seeding ───────────────────────────────── */

  function _ftSeedFromQuestionnaire() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb(); if (!bb) return;
    var draft = _ftDraft(pid);

    // Ensure narrator root exists — v7 fix: also match by display name to avoid duplicates
    var q = bb.questionnaire.personal || {};
    var narratorFullName = (q.fullName || "").trim();
    var narratorPrefName = (q.preferredName || "").trim();
    var hasNarrator = draft.nodes.some(function (n) {
      if (n.role === "narrator") return true;
      // Also check if any existing node matches the narrator's name (prevents duplicate on re-seed)
      var dn = _ftNodeDisplayName(n);
      if (narratorFullName && dn === narratorFullName) return true;
      if (narratorPrefName && dn === narratorPrefName) return true;
      return false;
    });
    if (!hasNarrator) {
      var narratorNode = _ftMakeNode("narrator", {
        firstName: narratorFullName ? narratorFullName.split(/\s+/)[0] : "",
        lastName: narratorFullName ? narratorFullName.split(/\s+/).slice(-1)[0] : "",
        preferredName: narratorPrefName,
        source: "questionnaire"
      });
      draft.nodes.push(narratorNode);
    }
    // v7 fix: find narrator by role OR type OR display name (handles dual-schema)
    var _narr = draft.nodes.find(function (n) { return n.role === "narrator" || n.type === "narrator"; });
    if (!_narr && narratorFullName) _narr = draft.nodes.find(function (n) { return _ftNodeDisplayName(n) === narratorFullName; });
    if (!_narr && narratorPrefName) _narr = draft.nodes.find(function (n) { return _ftNodeDisplayName(n) === narratorPrefName; });
    if (!_narr) return; // safety
    var narratorId = _narr.id;

    // Seed parents
    var parents = Array.isArray(bb.questionnaire.parents) ? bb.questionnaire.parents : (bb.questionnaire.parents ? [bb.questionnaire.parents] : []);
    parents.forEach(function (p) {
      var name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
      if (!name) return;
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "parent" || n.type === "parent"); });
      if (exists) return;
      var node = _ftMakeNode("parent", {
        firstName: p.firstName || "", middleName: p.middleName || "", lastName: p.lastName || "",
        birthDate: p.birthDate || "", notes: [p.notableLifeEvents, p.notes].filter(Boolean).join("\n"),
        source: "questionnaire"
      });
      draft.nodes.push(node);
      var relType = (p.relation || "").toLowerCase().indexOf("step") >= 0 ? "step" :
                    (p.relation || "").toLowerCase().indexOf("adopt") >= 0 ? "adoptive" : "biological";
      var label = p.relation || "parent";
      draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, label, ""));
    });

    // Seed siblings
    var sibs = Array.isArray(bb.questionnaire.siblings) ? bb.questionnaire.siblings : (bb.questionnaire.siblings ? [bb.questionnaire.siblings] : []);
    sibs.forEach(function (s) {
      var name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
      if (!name) return;
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "sibling" || n.type === "sibling"); });
      if (exists) return;
      var node = _ftMakeNode("sibling", {
        firstName: s.firstName || "", middleName: s.middleName || "", lastName: s.lastName || "",
        notes: [s.uniqueCharacteristics, s.sharedExperiences, s.memories, s.notes].filter(Boolean).join("\n"),
        source: "questionnaire"
      });
      draft.nodes.push(node);
      var relType = (s.relation || "").toLowerCase().indexOf("step") >= 0 ? "step" :
                    (s.relation || "").toLowerCase().indexOf("half") >= 0 ? "half" : "biological";
      draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, s.relation || "sibling", ""));
    });

    // Seed grandparents
    var gps = Array.isArray(bb.questionnaire.grandparents) ? bb.questionnaire.grandparents : (bb.questionnaire.grandparents ? [bb.questionnaire.grandparents] : []);
    gps.forEach(function (g) {
      var name = [g.firstName, g.lastName].filter(Boolean).join(" ");
      if (!name) return;
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "grandparent" || n.type === "grandparent"); });
      if (exists) return;
      var node = _ftMakeNode("grandparent", {
        firstName: g.firstName || "", lastName: g.lastName || "",
        notes: g.memorableStories || "", source: "questionnaire"
      });
      draft.nodes.push(node);
      draft.edges.push(_ftMakeEdge(narratorId, node.id, "biological", "grandparent", ""));
    });

    // v7: auto-clean any orphan edges after seeding
    _ftCleanOrphanEdges(pid);
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ftSeedFromCandidates() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb(); if (!bb) return;
    var draft = _ftDraft(pid);

    // v4: infer role from candidate relation field
    var _inferRole = function (c) {
      var d = c.data || {};
      var rel = (d.relation || c.relation || "").toLowerCase();
      if (/mother|father|mom|dad|parent/.test(rel)) return "parent";
      if (/sister|brother|sibling/.test(rel)) return "sibling";
      if (/wife|husband|spouse|partner/.test(rel)) return "spouse";
      if (/son|daughter|child/.test(rel)) return "child";
      if (/grand/.test(rel)) return "grandparent";
      if (/guardian/.test(rel)) return "guardian";
      if (/aunt|uncle|cousin|chosen/.test(rel)) return "chosen_family";
      return "other";
    };
    var _inferRelType = function (c) {
      var d = c.data || {};
      var rel = (d.relation || c.relation || "").toLowerCase();
      if (/step/.test(rel)) return "step";
      if (/adopt/.test(rel)) return "adoptive";
      if (/half/.test(rel)) return "half";
      if (/foster/.test(rel)) return "foster";
      if (/chosen|aunt|uncle|cousin/.test(rel)) return "chosen_family";
      if (/former|ex/.test(rel)) return "former_marriage";
      if (/wife|husband|spouse|partner|marri/.test(rel)) return "marriage";
      return "biological";
    };

    // Ensure narrator root — v7 fix: check both role and type
    var hasNarrator = draft.nodes.some(function (n) { return n.role === "narrator" || n.type === "narrator"; });
    if (!hasNarrator) {
      var pName = _currentPersonName() || "";
      draft.nodes.push(_ftMakeNode("narrator", {
        firstName: pName.split(/\s+/)[0] || "", lastName: pName.split(/\s+/).slice(-1)[0] || "",
        preferredName: pName, source: "candidate"
      }));
    }
    var _narrC = draft.nodes.find(function (n) { return n.role === "narrator" || n.type === "narrator"; });
    if (!_narrC) return;
    var narratorId = _narrC.id;

    var people = (bb.candidates.people || []);
    people.forEach(function (c) {
      var title = _getCandidateTitle(c);
      if (!title || title === "Untitled") return;
      var role = _inferRole(c);
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === title && n.role === role; });
      if (exists) return;
      var d = c.data || {};
      var node = _ftMakeNode(role, {
        firstName: d.name ? d.name.split(/\s+/)[0] : title,
        lastName: d.name ? d.name.split(/\s+/).slice(-1)[0] : "",
        birthDate: d.birthDate || "", notes: d.notes || _getCandidateText(c),
        source: "candidate"
      });
      draft.nodes.push(node);
      // v4: auto-create edge to narrator
      var relType = _inferRelType(c);
      draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, d.relation || role, ""));
    });

    // v4: also seed from relationship candidates
    var rels = (bb.candidates.relationships || []);
    rels.forEach(function (c) {
      var d = c.data || {};
      var personNames = [d.personA, d.personB].filter(Boolean);
      personNames.forEach(function (pn) {
        if (!pn) return;
        var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === pn; });
        if (exists) return;
        draft.nodes.push(_ftMakeNode("other", {
          firstName: pn.split(/\s+/)[0], lastName: pn.split(/\s+/).slice(-1)[0] || "",
          notes: d.relation || "", source: "candidate"
        }));
      });
    });

    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── v4: Draft Quality Utilities ─────────────────────────── */

  function _ftFindDuplicates(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    var seen = {};
    var dupes = [];
    draft.nodes.forEach(function (n) {
      var key = _ftNodeDisplayName(n).toLowerCase().trim();
      if (!key || key === "unknown") return;
      if (seen[key]) dupes.push({ existing: seen[key], duplicate: n });
      else seen[key] = n;
    });
    return dupes;
  }

  function _ftFindUnconnected(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    var connected = {};
    draft.edges.forEach(function (e) { connected[e.from] = true; connected[e.to] = true; });
    return draft.nodes.filter(function (n) { return n.role !== "narrator" && !connected[n.id]; });
  }

  function _ftFindWeakNodes(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    return draft.nodes.filter(function (n) {
      var name = _ftNodeDisplayName(n);
      return !name || name === "Unknown" || name === "Unnamed" || n.uncertainty;
    });
  }

  function _ftFindUnsourced(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    return draft.nodes.filter(function (n) { return !n.source || n.source === "manual"; });
  }

  function _ftCleanOrphanEdges(pid) {
    var draft = _ftDraft(pid); if (!draft) return 0;
    var nodeIds = {};
    draft.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    var before = draft.edges.length;
    draft.edges = draft.edges.filter(function (e) { return nodeIds[e.from] && nodeIds[e.to]; });
    var removed = before - draft.edges.length;
    if (removed > 0) { _persistDrafts(pid); _renderActiveTab(); }
    return removed;
  }

  // Collapsed group state (v4 — per-session, not persisted)
  var _collapsedGroups = {};

  function _toggleGroupCollapse(tabType, role) {
    var key = tabType + ":" + role;
    _collapsedGroups[key] = !_collapsedGroups[key];
    _renderActiveTab();
  }

  function _isGroupCollapsed(tabType, role) {
    return !!_collapsedGroups[tabType + ":" + role];
  }

  /* ── v4: Draft Utilities Panel Renderer ──────────────────── */

  function _renderDraftUtilities(container, pid, tabType) {
    var ftDraft = tabType === "familyTree" ? _ftDraft(pid) : null;
    var ltDraftObj = tabType === "lifeThreads" ? _ltDraft(pid) : null;
    var draft = ftDraft || ltDraftObj;
    if (!draft || !draft.nodes.length) return "";

    var issues = [];
    if (tabType === "familyTree") {
      var dupes = _ftFindDuplicates(pid);
      var unconnected = _ftFindUnconnected(pid);
      var weak = _ftFindWeakNodes(pid);
      var unsourced = _ftFindUnsourced(pid);
      if (dupes.length) issues.push('<span class="ft-util-badge ft-util-warn">' + dupes.length + ' possible duplicate(s)</span>');
      if (unconnected.length) issues.push('<span class="ft-util-badge">' + unconnected.length + ' unconnected</span>');
      if (weak.length) issues.push('<span class="ft-util-badge">' + weak.length + ' weak/unlabeled</span>');
      if (unsourced.length) issues.push('<span class="ft-util-badge">' + unsourced.length + ' unsourced</span>');
    }

    // Orphan edge check (both tabs)
    var nodeIds = {};
    draft.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    var orphanEdges = draft.edges.filter(function (e) { return !nodeIds[e.from] || !nodeIds[e.to]; });
    if (orphanEdges.length) {
      issues.push('<span class="ft-util-badge ft-util-warn">' + orphanEdges.length + ' orphan edge(s) '
        + '<button class="bb-btn-xs" onclick="window.LorevoxBioBuilder._ftCleanOrphanEdges()">Clean</button></span>');
    }

    if (!issues.length) return "";
    return '<div class="ft-utilities-bar">' + issues.join(" ") + '</div>';
  }

  /* ── Family Tree: Tab Renderer ──────────────────────────── */

  function _renderFamilyTreeTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start building their family tree.", []);
      return;
    }
    var draft = _ftDraft(pid);
    if (!draft.nodes.length) {
      container.innerHTML = _emptyStateHtml(
        "Family Tree",
        "Build the family structure here as you gather biography details. Add parents, siblings, spouses, children, and chosen family. This is a draft workspace — nothing is promoted automatically.",
        [
          { label: "🌱 Seed from Questionnaire", action: "window.LorevoxBioBuilder._ftSeedFromQuestionnaire()" },
          { label: "👥 Seed from Candidates", action: "window.LorevoxBioBuilder._ftSeedFromCandidates()" },
          { label: "+ Add Person", action: "window.LorevoxBioBuilder._ftAddNode('other')" }
        ]
      );
      return;
    }

    // Group nodes by role
    var groups = {};
    FT_ROLES.forEach(function (r) { groups[r] = []; });
    draft.nodes.forEach(function (n) {
      var g = groups[n.role] || groups.other;
      g.push(n);
    });

    // v4: draft quality utilities bar
    var utilHtml = _renderDraftUtilities(container, pid, "familyTree");

    // v6: fuzzy duplicate bar (augments v4 exact duplicates)
    var fuzzyDupes = NS._ftFindFuzzyDuplicates ? NS._ftFindFuzzyDuplicates(pid) : [];
    var fuzzyNonExact = fuzzyDupes.filter(function (d) { return d.tier !== "exact"; });
    var fuzzyBar = fuzzyNonExact.length > 0
      ? '<div class="ft-utilities-bar"><span class="ft-util-badge ft-util-info">' + fuzzyNonExact.length
        + ' fuzzy match' + (fuzzyNonExact.length > 1 ? 'es' : '') + ': '
        + fuzzyNonExact.slice(0, 3).map(function (d) { return '"' + _esc(d.nameA) + '" ≈ "' + _esc(d.nameB) + '" (' + Math.round(d.score * 100) + '%)'; }).join(', ')
        + (fuzzyNonExact.length > 3 ? '…' : '') + '</span></div>'
      : '';

    var html = utilHtml + fuzzyBar
      + '<div class="ft-toolbar">'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftAddNode(\'other\')">+ Add Person</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromQuestionnaire()">🌱 Seed Questionnaire</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromCandidates()">👥 Seed Candidates</button>'
      + _viewModeToggle(_ftViewMode, "window.LorevoxBioBuilder._toggleFTViewMode()")
      + '</div>';

    // v6: Graph mode render
    if (_ftViewMode === "graph") {
      html += _renderFTGraph(pid);
      container.innerHTML = html;
      return;
    }

    // v7: Scaffold mode — 4-generation ancestor tree layout
    if (_ftViewMode === "scaffold") {
      html += _renderFTScaffold(pid);
      container.innerHTML = html;
      return;
    }

    FT_ROLES.forEach(function (role) {
      var nodes = groups[role];
      if (!nodes.length) return;
      var collapsed = _isGroupCollapsed("ft", role);
      html += '<div class="ft-group' + (collapsed ? ' ft-group-collapsed' : '') + '">';
      html += '<div class="ft-group-label" onclick="window.LorevoxBioBuilder._toggleGroupCollapse(\'ft\',\'' + role + '\')" style="cursor:pointer">'
        + '<span class="ft-collapse-arrow">' + (collapsed ? '▸' : '▾') + '</span> '
        + role.replace(/_/g, ' ') + ' <span class="ft-group-count">(' + nodes.length + ')</span></div>';
      if (collapsed) { html += '</div>'; return; }
      html += '<div class="ft-cards">';
      nodes.forEach(function (n) {
        var name = _ftNodeDisplayName(n);
        var decLabel = n.deceased ? '<span class="ft-deceased-badge">deceased</span>' : '';
        var uncLabel = n.uncertainty ? '<span class="ft-uncertain-badge">' + _esc(n.uncertainty) + '</span>' : '';
        var deathNote = n.deathContext ? '<div class="ft-card-death">' + _esc(n.deathContext) + '</div>' : '';
        var notesLine = n.notes ? '<div class="ft-card-notes">' + _esc(n.notes.slice(0, 80)) + (n.notes.length > 80 ? '…' : '') + '</div>' : '';

        // Find edges from this node
        var edges = draft.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
        var edgeHtml = edges.map(function (e) {
          var otherNodeId = e.from === n.id ? e.to : e.from;
          var otherNode = draft.nodes.find(function (on) { return on.id === otherNodeId; });
          var otherName = otherNode ? _ftNodeDisplayName(otherNode) : "?";
          var dir = e.from === n.id ? "→" : "←";
          return '<div class="ft-edge-line">' + dir + ' <span class="ft-edge-label">' + _esc(e.label || e.relationshipType.replace(/_/g, ' ')) + '</span> '
            + _esc(otherName) + ' <button class="ft-edge-del" onclick="window.LorevoxBioBuilder._ftDeleteEdge(\'' + e.id + '\')">✕</button></div>';
        }).join("");

        var srcBadge = n.source ? '<span class="ft-source-badge">' + _esc(n.source) + '</span>' : '';

        html += '<div class="ft-card' + (n.deceased ? ' ft-card-deceased' : '') + '">'
          + '<div class="ft-card-header">'
          + '<strong>' + _esc(name) + '</strong> ' + decLabel + uncLabel + srcBadge
          + '</div>'
          + (n.birthDate ? '<div class="ft-card-detail">b. ' + _esc(n.birthDate) + '</div>' : '')
          + (n.deathDate ? '<div class="ft-card-detail">d. ' + _esc(n.deathDate) + '</div>' : '')
          + deathNote + notesLine
          + (edgeHtml ? '<div class="ft-card-edges">' + edgeHtml + '</div>' : '')
          + '<div class="ft-card-actions">'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">Edit</button>'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftAddEdge(\'' + n.id + '\')">Connect</button>'
          + '<button class="bb-btn-sm" style="color:#f87171" onclick="window.LorevoxBioBuilder._ftDeleteNode(\'' + n.id + '\')">Delete</button>'
          + '</div></div>';
      });
      html += '</div></div>';
    });

    container.innerHTML = html;
  }

  /* ═══════════════════════════════════════════════════════════════
     LIFE THREADS — Draft staging surface (v3)
     Per-person draft stores under state.bioBuilder.lifeThreadsDraftsByPerson
     Uses state.person_id for narrator scoping.
     Writes ONLY to Bio Builder state — never to truth layers.
  ═══════════════════════════════════════════════════════════════ */

  var LT_NODE_TYPES = ["person","place","memory","event","theme"];
  var LT_EDGE_TYPES = ["family_of","happened_in","remembered_with","connected_to","influenced_by","theme_of","other"];

  function _ltDraft(pid) {
    var bb = _bb(); if (!bb) return null;
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};
    var id = pid || _currentPersonId() || "default";
    if (!bb.lifeThreadsDraftsByPerson[id]) {
      bb.lifeThreadsDraftsByPerson[id] = { nodes: [], edges: [], meta: {} };
    }
    return bb.lifeThreadsDraftsByPerson[id];
  }

  function _ltMakeNode(type, data) {
    return {
      id: "ltn_" + _uid(),
      type: type || "memory",
      label: (data && data.label) || "",
      text: (data && data.text) || "",
      notes: (data && data.notes) || "",
      source: (data && data.source) || "manual",
      sourceRef: (data && data.sourceRef) || null
    };
  }

  function _ltMakeEdge(fromId, toId, relationship, notes) {
    return {
      id: "lte_" + _uid(),
      from: fromId,
      to: toId,
      relationship: relationship || "connected_to",
      notes: notes || ""
    };
  }

  /* ── Life Threads: Add / Edit / Delete ──────────────────── */

  function _ltAddNode(type) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var node = _ltMakeNode(type || "memory", {});
    draft.nodes.push(node);
    _ltEditNode(node.id);
  }

  function _ltDeleteNode(nodeId, confirmed) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var edgeCount = draft.edges.filter(function (e) { return e.from === nodeId || e.to === nodeId; }).length;
    if (edgeCount > 0 && !confirmed) {
      _showInlineConfirm(
        "This thread node has " + edgeCount + " link(s). Delete anyway?",
        function () { _ltDeleteNode(nodeId, true); }
      );
      return;
    }
    draft.nodes = draft.nodes.filter(function (n) { return n.id !== nodeId; });
    draft.edges = draft.edges.filter(function (e) { return e.from !== nodeId && e.to !== nodeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ltEditNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    var content = _el("bbTabContent"); if (!content) return;

    var typeOpts = LT_NODE_TYPES.map(function (t) {
      return '<option value="' + t + '"' + (t === node.type ? ' selected' : '') + '>' + t + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'lifeThreads\')">← Back to Life Threads</button></div>'
      + '<div class="bb-section-title">Edit Thread Node</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">Type</label><select id="ltEditType" class="bb-select">' + typeOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Label</label><input id="ltEditLabel" class="bb-input" type="text" value="' + _esc(node.label) + '" placeholder="Short name: \'Austin years\', \'left church\', \'Shakey\'s Pizza\'" /></div>'
      + '<div class="bb-field"><label class="bb-label">Details</label><textarea id="ltEditText" class="bb-textarea" rows="3" placeholder="What happened, what it meant, or what you want to remember">' + _esc(node.text) + '</textarea></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ltEditNotes" class="bb-textarea" rows="2" placeholder="Approximate dates, uncertainty, things to fill in later">' + _esc(node.notes) + '</textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer">'
      + '<button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ltSaveNode(\'' + node.id + '\')">Save</button>'
      + '<button class="bb-ghost-btn" style="color:#f87171" onclick="window.LorevoxBioBuilder._ltDeleteNode(\'' + node.id + '\')">Delete</button>'
      + '</div>';
  }

  function _ltSaveNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    node.type = (_el("ltEditType") || {}).value || node.type;
    node.label = (_el("ltEditLabel") || {}).value || "";
    node.text = (_el("ltEditText") || {}).value || "";
    node.notes = (_el("ltEditNotes") || {}).value || "";
    _persistDrafts(pid);
    _switchTab("lifeThreads");
  }

  /* ── Life Threads: Add Edge ─────────────────────────────── */

  function _ltAddEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var content = _el("bbTabContent"); if (!content) return;
    var fromNode = draft.nodes.find(function (n) { return n.id === fromId; });
    if (!fromNode) return;

    var otherNodes = draft.nodes.filter(function (n) { return n.id !== fromId; });
    if (!otherNodes.length) {
      content.innerHTML = _emptyStateHtml("Need more nodes", "Add at least two thread nodes before connecting them.", [
        { label: "← Back", action: "window.LorevoxBioBuilder._switchTab('lifeThreads')" }
      ]);
      return;
    }

    var toOpts = otherNodes.map(function (n) {
      return '<option value="' + n.id + '">' + _esc(n.label || n.type) + '</option>';
    }).join("");
    var relOpts = LT_EDGE_TYPES.map(function (r) {
      return '<option value="' + r + '">' + r.replace(/_/g, ' ') + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'lifeThreads\')">← Back</button></div>'
      + '<div class="bb-section-title">Connect: ' + _esc(fromNode.label || fromNode.type) + '</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">To</label><select id="ltEdgeTo" class="bb-select">' + toOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Relationship</label><select id="ltEdgeRel" class="bb-select">' + relOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ltEdgeNotes" class="bb-textarea" rows="2"></textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer"><button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ltSaveEdge(\'' + fromId + '\')">Save Link</button></div>';
  }

  function _ltSaveEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var toId = (_el("ltEdgeTo") || {}).value;
    var rel = (_el("ltEdgeRel") || {}).value || "connected_to";
    var notes = (_el("ltEdgeNotes") || {}).value || "";
    if (toId) {
      draft.edges.push(_ltMakeEdge(fromId, toId, rel, notes));
    }
    _persistDrafts(pid);
    _switchTab("lifeThreads");
  }

  function _ltDeleteEdge(edgeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    draft.edges = draft.edges.filter(function (e) { return e.id !== edgeId; });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── Life Threads: Seeding ──────────────────────────────── */

  function _ltSeedFromCandidates() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb(); if (!bb) return;
    var draft = _ltDraft(pid);

    // Narrator anchor
    var hasNarrator = draft.nodes.some(function (n) { return n.type === "person" && n.label && n.label.indexOf("narrator") >= 0; });
    if (!hasNarrator) {
      var narratorName = _currentPersonName() || "Narrator";
      draft.nodes.push(_ltMakeNode("person", { label: narratorName + " (narrator)", source: "questionnaire" }));
    }

    var buckets = [
      { key: "people",        type: "person" },
      { key: "places",        type: "place" },
      { key: "memories",      type: "memory" },
      { key: "events",        type: "event" }
    ];
    buckets.forEach(function (bucket) {
      var items = bb.candidates[bucket.key] || [];
      items.forEach(function (c) {
        var title = _getCandidateTitle(c);
        if (!title || title === "Untitled") return;
        var exists = draft.nodes.some(function (n) { return n.label === title; });
        if (exists) return;
        draft.nodes.push(_ltMakeNode(bucket.type, {
          label: title,
          text: _getCandidateText(c),
          source: "candidate",
          sourceRef: c.id || null
        }));
      });
    });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  function _ltSeedThemes() {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    var bb = _bb(); if (!bb) return;

    var themeSeeds = [];
    var placeSeeds = [];
    var eventSeeds = [];
    var q = bb.questionnaire;

    // v4: expanded theme seeding from all questionnaire sections
    if (q.earlyMemories) {
      if (q.earlyMemories.firstMemory) themeSeeds.push({ label: "First Memory", text: q.earlyMemories.firstMemory });
      if (q.earlyMemories.favoriteToy) themeSeeds.push({ label: "Favorite Childhood Object", text: q.earlyMemories.favoriteToy });
      if (q.earlyMemories.significantEvent) eventSeeds.push({ label: "Significant Early Event", text: q.earlyMemories.significantEvent });
    }
    if (q.education) {
      if (q.education.schooling) placeSeeds.push({ label: "School Years", text: q.education.schooling });
      if (q.education.higherEducation) placeSeeds.push({ label: "Higher Education", text: q.education.higherEducation });
      if (q.education.earlyCareer) themeSeeds.push({ label: "Early Career", text: q.education.earlyCareer });
      if (q.education.careerProgression) themeSeeds.push({ label: "Career Progression", text: q.education.careerProgression });
      if (q.education.communityInvolvement) themeSeeds.push({ label: "Community Involvement", text: q.education.communityInvolvement });
      if (q.education.mentorship) themeSeeds.push({ label: "Mentorship", text: q.education.mentorship });
    }
    if (q.laterYears) {
      if (q.laterYears.lifeLessons) themeSeeds.push({ label: "Life Lessons", text: q.laterYears.lifeLessons });
      if (q.laterYears.retirement) themeSeeds.push({ label: "Retirement", text: q.laterYears.retirement });
      if (q.laterYears.adviceForFutureGenerations) themeSeeds.push({ label: "Advice for Future Generations", text: q.laterYears.adviceForFutureGenerations });
    }
    if (q.hobbies) {
      if (q.hobbies.hobbies) themeSeeds.push({ label: "Hobbies & Interests", text: q.hobbies.hobbies });
      if (q.hobbies.worldEvents) eventSeeds.push({ label: "World Events", text: q.hobbies.worldEvents });
      if (q.hobbies.personalChallenges) themeSeeds.push({ label: "Personal Challenges", text: q.hobbies.personalChallenges });
      if (q.hobbies.travel) placeSeeds.push({ label: "Travel", text: q.hobbies.travel });
    }
    if (q.additionalNotes) {
      if (q.additionalNotes.unfinishedDreams) themeSeeds.push({ label: "Unfinished Dreams", text: q.additionalNotes.unfinishedDreams });
      if (q.additionalNotes.messagesForFutureGenerations) themeSeeds.push({ label: "Messages for Future Generations", text: q.additionalNotes.messagesForFutureGenerations });
    }

    var _seedNode = function (type, t) {
      var exists = draft.nodes.some(function (n) { return n.label === t.label; });
      if (exists) return;
      draft.nodes.push(_ltMakeNode(type, { label: t.label, text: t.text, source: "questionnaire" }));
    };
    themeSeeds.forEach(function (t) { _seedNode("theme", t); });
    placeSeeds.forEach(function (t) { _seedNode("place", t); });
    eventSeeds.forEach(function (t) { _seedNode("event", t); });
    _persistDrafts(pid);
    _renderActiveTab();
  }

  /* ── Life Threads: Tab Renderer ─────────────────────────── */

  function _renderLifeThreadsTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start organizing their story threads.", []);
      return;
    }
    var draft = _ltDraft(pid);
    if (!draft.nodes.length) {
      container.innerHTML = _emptyStateHtml(
        "Life Threads",
        "Use Life Threads to connect memories, people, places, and life themes. This helps reveal story structure before review and memoir drafting. This is a draft workspace — not a final truth layer.",
        [
          { label: "👥 Seed from Candidates", action: "window.LorevoxBioBuilder._ltSeedFromCandidates()" },
          { label: "🎯 Seed Themes", action: "window.LorevoxBioBuilder._ltSeedThemes()" },
          { label: "+ Add Node", action: "window.LorevoxBioBuilder._ltAddNode('memory')" }
        ]
      );
      return;
    }

    // Group by type
    var groups = {};
    LT_NODE_TYPES.forEach(function (t) { groups[t] = []; });
    draft.nodes.forEach(function (n) {
      var g = groups[n.type] || groups.memory;
      g.push(n);
    });

    var typeIcons = { person: "👤", place: "📍", memory: "💭", event: "📅", theme: "🎯" };

    var html = '<div class="lt-toolbar">'
      + LT_NODE_TYPES.map(function (t) {
          return '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltAddNode(\'' + t + '\')">'
            + typeIcons[t] + ' + ' + t + '</button>';
        }).join("")
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltSeedFromCandidates()">🌱 Seed</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltSeedThemes()">🎯 Themes</button>'
      + _viewModeToggle(_ltViewMode, "window.LorevoxBioBuilder._toggleLTViewMode()")
      + '</div>';

    // v4: utilities bar
    html += _renderDraftUtilities(container, pid, "lifeThreads");

    // v6: Graph mode render
    if (_ltViewMode === "graph") {
      html += _renderLTGraph(pid);
      container.innerHTML = html;
      return;
    }

    LT_NODE_TYPES.forEach(function (type) {
      var nodes = groups[type];
      if (!nodes.length) return;
      var collapsed = _isGroupCollapsed("lt", type);
      html += '<div class="lt-group' + (collapsed ? ' lt-group-collapsed' : '') + '">';
      html += '<div class="lt-group-label" onclick="window.LorevoxBioBuilder._toggleGroupCollapse(\'lt\',\'' + type + '\')" style="cursor:pointer">'
        + '<span class="ft-collapse-arrow">' + (collapsed ? '▸' : '▾') + '</span> '
        + (typeIcons[type] || '') + ' ' + (type === "memory" ? "memories" : type + 's') + ' <span class="ft-group-count">(' + nodes.length + ')</span></div>';
      if (collapsed) { html += '</div>'; return; }
      html += '<div class="lt-cards">';
      nodes.forEach(function (n) {
        var edges = draft.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
        var edgeHtml = edges.map(function (e) {
          var otherId = e.from === n.id ? e.to : e.from;
          var otherNode = draft.nodes.find(function (on) { return on.id === otherId; });
          var otherLabel = otherNode ? (otherNode.label || otherNode.type) : "?";
          return '<div class="lt-edge-line">'
            + '<span class="lt-edge-rel">' + _esc(e.relationship.replace(/_/g, ' ')) + '</span> → '
            + _esc(otherLabel)
            + ' <button class="lt-edge-del" onclick="window.LorevoxBioBuilder._ltDeleteEdge(\'' + e.id + '\')">✕</button></div>';
        }).join("");

        html += '<div class="lt-card lt-card-' + type + '">'
          + '<div class="lt-card-header"><strong>' + _esc(n.label || "Untitled") + '</strong></div>'
          + (n.text ? '<div class="lt-card-text">' + _esc(n.text.slice(0, 120)) + (n.text.length > 120 ? '…' : '') + '</div>' : '')
          + (n.notes ? '<div class="lt-card-notes">' + _esc(n.notes.slice(0, 80)) + '</div>' : '')
          + (edgeHtml ? '<div class="lt-card-edges">' + edgeHtml + '</div>' : '')
          + '<div class="lt-card-actions">'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltEditNode(\'' + n.id + '\')">Edit</button>'
          + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ltAddEdge(\'' + n.id + '\')">Link</button>'
          + '<button class="bb-btn-sm" style="color:#f87171" onclick="window.LorevoxBioBuilder._ltDeleteNode(\'' + n.id + '\')">Delete</button>'
          + '</div></div>';
      });
      html += '</div></div>';
    });

    container.innerHTML = html;
  }

  /* ── v6: Graph Mode — SVG-based relationship graph ──────── */

  var _GRAPH_MAX_NODES = 80; // cap for performance on large profiles

  /* Role cluster positions for FT graph (relative, 0-1 coordinate space) */
  var _FT_ROLE_POSITIONS = {
    narrator:      { cx: 0.50, cy: 0.50 },
    parent:        { cx: 0.50, cy: 0.15 },
    grandparent:   { cx: 0.50, cy: 0.02 },
    sibling:       { cx: 0.15, cy: 0.40 },
    spouse:        { cx: 0.85, cy: 0.50 },
    child:         { cx: 0.50, cy: 0.85 },
    grandchild:    { cx: 0.50, cy: 0.98 },
    guardian:      { cx: 0.20, cy: 0.18 },
    chosen_family: { cx: 0.85, cy: 0.25 },
    other:         { cx: 0.15, cy: 0.75 }
  };

  /* LT type cluster positions */
  var _LT_TYPE_POSITIONS = {
    person: { cx: 0.30, cy: 0.30 },
    place:  { cx: 0.70, cy: 0.30 },
    memory: { cx: 0.30, cy: 0.70 },
    event:  { cx: 0.70, cy: 0.70 },
    theme:  { cx: 0.50, cy: 0.10 }
  };

  /* Color palette for graph nodes */
  var _FT_ROLE_COLORS = {
    narrator: "#818cf8", parent: "#f97316", grandparent: "#fb923c",
    sibling: "#34d399", spouse: "#f472b6", child: "#38bdf8",
    grandchild: "#67e8f9", guardian: "#fbbf24", chosen_family: "#a78bfa", other: "#94a3b8"
  };
  var _LT_TYPE_COLORS = {
    person: "#818cf8", place: "#34d399", memory: "#f97316", event: "#38bdf8", theme: "#a78bfa"
  };

  /* Spread nodes within a cluster to avoid overlap */
  function _clusterSpread(nodes, center, w, h, spread) {
    spread = spread || 0.12;
    var count = nodes.length;
    if (count === 0) return [];
    if (count === 1) return [{ x: center.cx * w, y: center.cy * h }];
    var positions = [];
    var angleStep = (2 * Math.PI) / count;
    var radius = Math.min(w, h) * spread * Math.min(1, count / 4);
    for (var i = 0; i < count; i++) {
      var angle = angleStep * i - Math.PI / 2;
      positions.push({
        x: center.cx * w + Math.cos(angle) * radius,
        y: center.cy * h + Math.sin(angle) * radius
      });
    }
    return positions;
  }

  /* Render FT graph as SVG string */
  function _renderFTGraph(pid) {
    var draft = _ftDraft(pid);
    if (!draft || !draft.nodes.length) return '<div class="ft-graph-empty">No nodes to graph.</div>';

    var nodes = draft.nodes;
    var edges = draft.edges;
    var capped = nodes.length > _GRAPH_MAX_NODES;
    if (capped) nodes = nodes.slice(0, _GRAPH_MAX_NODES);

    var w = 720, h = 480;
    var nodeRadius = 18;

    // Position nodes by role cluster
    var grouped = {};
    FT_ROLES.forEach(function (r) { grouped[r] = []; });
    nodes.forEach(function (n) { (grouped[n.role] || grouped.other).push(n); });

    var posMap = {}; // nodeId → { x, y }
    FT_ROLES.forEach(function (role) {
      var group = grouped[role];
      if (!group.length) return;
      var center = _FT_ROLE_POSITIONS[role] || _FT_ROLE_POSITIONS.other;
      var positions = _clusterSpread(group, center, w, h, 0.10);
      group.forEach(function (n, i) { posMap[n.id] = positions[i]; });
    });

    // Build SVG
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" class="ft-graph-svg" style="width:100%;height:auto;max-height:480px;">';

    // Edges
    edges.forEach(function (e) {
      var from = posMap[e.from], to = posMap[e.to];
      if (!from || !to) return;
      var label = e.label || e.relationshipType || "";
      var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      svg += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '" stroke="rgba(148,163,184,0.3)" stroke-width="1.5"/>';
      if (label) {
        svg += '<text x="' + mx + '" y="' + (my - 3) + '" text-anchor="middle" fill="#64748b" font-size="8" font-family="sans-serif">' + _esc(label.replace(/_/g, ' ').slice(0, 16)) + '</text>';
      }
    });

    // Nodes
    nodes.forEach(function (n) {
      var pos = posMap[n.id]; if (!pos) return;
      var color = _FT_ROLE_COLORS[n.role] || _FT_ROLE_COLORS.other;
      var name = _ftNodeDisplayName(n);
      var short = name.length > 12 ? name.slice(0, 11) + '…' : name;
      var opacity = n.deceased ? '0.5' : '1';
      var dnp = n.notes && /do\s*not\s*prompt/i.test(n.notes);
      var stroke = dnp ? '#ef4444' : color;
      svg += '<g style="opacity:' + opacity + '">'
        + '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + nodeRadius + '" fill="rgba(30,41,59,0.9)" stroke="' + stroke + '" stroke-width="' + (dnp ? 2.5 : 1.5) + '"/>'
        + '<text x="' + pos.x + '" y="' + (pos.y + 4) + '" text-anchor="middle" fill="' + color + '" font-size="9" font-weight="500" font-family="sans-serif">' + _esc(short) + '</text>'
        + '</g>';
    });

    // Role cluster labels (background)
    FT_ROLES.forEach(function (role) {
      if (!grouped[role].length) return;
      var center = _FT_ROLE_POSITIONS[role] || _FT_ROLE_POSITIONS.other;
      svg += '<text x="' + (center.cx * w) + '" y="' + Math.max(center.cy * h - 28, 10) + '" text-anchor="middle" fill="rgba(148,163,184,0.3)" font-size="10" font-family="sans-serif" font-weight="600">'
        + role.replace(/_/g, ' ').toUpperCase() + '</text>';
    });

    svg += '</svg>';

    if (capped) {
      svg += '<div class="ft-graph-cap-notice">Showing first ' + _GRAPH_MAX_NODES + ' of ' + draft.nodes.length + ' nodes for performance.</div>';
    }
    return svg;
  }

  /* Render LT graph as SVG string */
  function _renderLTGraph(pid) {
    var draft = _ltDraft(pid);
    if (!draft || !draft.nodes.length) return '<div class="lt-graph-empty">No nodes to graph.</div>';

    var nodes = draft.nodes;
    var edges = draft.edges;
    var capped = nodes.length > _GRAPH_MAX_NODES;
    if (capped) nodes = nodes.slice(0, _GRAPH_MAX_NODES);

    var w = 720, h = 480;
    var nodeRadius = 16;

    // Position nodes by type cluster
    var grouped = {};
    LT_NODE_TYPES.forEach(function (t) { grouped[t] = []; });
    nodes.forEach(function (n) { (grouped[n.type] || grouped.memory).push(n); });

    var posMap = {};
    LT_NODE_TYPES.forEach(function (type) {
      var group = grouped[type];
      if (!group.length) return;
      var center = _LT_TYPE_POSITIONS[type] || _LT_TYPE_POSITIONS.memory;
      var positions = _clusterSpread(group, center, w, h, 0.12);
      group.forEach(function (n, i) { posMap[n.id] = positions[i]; });
    });

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" class="lt-graph-svg" style="width:100%;height:auto;max-height:480px;">';

    // Edges
    edges.forEach(function (e) {
      var from = posMap[e.from], to = posMap[e.to];
      if (!from || !to) return;
      var label = e.relationship || "";
      var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      svg += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '" stroke="rgba(148,163,184,0.25)" stroke-width="1" stroke-dasharray="4,3"/>';
      if (label) {
        svg += '<text x="' + mx + '" y="' + (my - 3) + '" text-anchor="middle" fill="#475569" font-size="7" font-family="sans-serif">' + _esc(label.replace(/_/g, ' ').slice(0, 18)) + '</text>';
      }
    });

    // Nodes
    var typeIcons = { person: "👤", place: "📍", memory: "💭", event: "📅", theme: "🎯" };
    nodes.forEach(function (n) {
      var pos = posMap[n.id]; if (!pos) return;
      var color = _LT_TYPE_COLORS[n.type] || _LT_TYPE_COLORS.memory;
      var label = (n.label || "Untitled");
      var short = label.length > 14 ? label.slice(0, 13) + '…' : label;
      svg += '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + nodeRadius + '" fill="rgba(30,41,59,0.85)" stroke="' + color + '" stroke-width="1.5"/>'
        + '<text x="' + pos.x + '" y="' + (pos.y + 3) + '" text-anchor="middle" fill="' + color + '" font-size="8" font-weight="500" font-family="sans-serif">' + _esc(short) + '</text>';
    });

    // Type cluster labels
    LT_NODE_TYPES.forEach(function (type) {
      if (!grouped[type].length) return;
      var center = _LT_TYPE_POSITIONS[type] || _LT_TYPE_POSITIONS.memory;
      svg += '<text x="' + (center.cx * w) + '" y="' + Math.max(center.cy * h - 24, 10) + '" text-anchor="middle" fill="rgba(148,163,184,0.3)" font-size="10" font-family="sans-serif" font-weight="600">'
        + (typeIcons[type] || '') + ' ' + type.toUpperCase() + 'S</text>';
    });

    svg += '</svg>';
    if (capped) {
      svg += '<div class="lt-graph-cap-notice">Showing first ' + _GRAPH_MAX_NODES + ' of ' + draft.nodes.length + ' nodes for performance.</div>';
    }
    return svg;
  }

  /* ── v7: 4-Generation Scaffold Renderer ───────────────── */

  var _SCAFFOLD_GEN_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b"];
  var _SCAFFOLD_GEN_LABELS = ["Narrator","Parents","Grandparents","Great-Grandparents"];

  function _scaffoldFindNodeByRoleAndName(draft, role, name) {
    return draft.nodes.find(function (n) {
      return n.role === role && _ftNodeDisplayName(n) === name;
    });
  }

  function _scaffoldFindParentsOf(draft, nodeId) {
    // Find nodes connected to nodeId via parent_of or biological/step/adoptive edge where nodeId is the child
    var parentIds = [];
    draft.edges.forEach(function (e) {
      if (e.to === nodeId || e.from === nodeId) {
        var otherNodeId = e.from === nodeId ? e.to : e.from;
        var otherNode = draft.nodes.find(function (n) { return n.id === otherNodeId; });
        if (otherNode && (otherNode.role === "parent" || otherNode.role === "grandparent")) {
          parentIds.push(otherNodeId);
        }
      }
    });
    return parentIds;
  }

  // v7: helper to get effective role from either .role or .type field
  function _scaffoldEffectiveRole(n) {
    if (!n) return "other";
    // Prefer .role if it's a known FT role; fall back to .type
    var r = n.role || n.type || "other";
    if (r === "person") r = n.role || "other"; // "person" is generic, use role if available
    return r;
  }

  function _scaffoldBuildTree(draft) {
    // Build a 4-generation ancestor tree: narrator at center, parents, grandparents, great-grandparents
    var narrator = draft.nodes.find(function (n) { return _scaffoldEffectiveRole(n) === "narrator"; });
    if (!narrator) {
      narrator = draft.nodes[0]; // fallback to first node
    }
    if (!narrator) return null;

    // Generation 1: narrator
    var tree = {
      node: narrator,
      gen: 0,
      children: []
    };

    // Find parent-role nodes — first try via edges, then fall back to role matching
    var parentNodes = [];

    // Method 1: find via edges (if edges have valid from/to)
    draft.edges.forEach(function (e) {
      if (!e.from || !e.to) return; // skip orphan edges
      var parentId = null;
      if (e.from === narrator.id) parentId = e.to;
      else if (e.to === narrator.id) parentId = e.from;
      if (parentId) {
        var pn = draft.nodes.find(function (n) { return n.id === parentId && _scaffoldEffectiveRole(n) === "parent"; });
        if (pn && parentNodes.indexOf(pn) < 0) parentNodes.push(pn);
      }
    });

    // Method 2: if no parents found via edges, find all parent-role nodes directly
    if (parentNodes.length === 0) {
      draft.nodes.forEach(function (n) {
        if (n.id !== narrator.id && _scaffoldEffectiveRole(n) === "parent") {
          parentNodes.push(n);
        }
      });
    }

    // Pad to 2 parent slots
    while (parentNodes.length < 2) parentNodes.push(null);

    var _emptyGen2 = function () {
      return { node: null, gen: 2, children: [{ node: null, gen: 3, children: [] }, { node: null, gen: 3, children: [] }] };
    };

    // v7 fix: track grandparent IDs already assigned to prevent duplicate placement
    var _usedGpIds = {};
    parentNodes.forEach(function (p) { if (p) _usedGpIds[p.id] = true; });
    _usedGpIds[narrator.id] = true;

    tree.children = parentNodes.slice(0, 2).map(function (pn) {
      if (!pn) return { node: null, gen: 1, children: [_emptyGen2(), _emptyGen2()] };

      // Find grandparent-role nodes connected to this parent
      var gpNodes = [];
      draft.edges.forEach(function (e) {
        if (!e.from || !e.to) return;
        var gpId = null;
        if (e.from === pn.id) gpId = e.to;
        else if (e.to === pn.id) gpId = e.from;
        if (gpId && gpId !== narrator.id && !_usedGpIds[gpId]) {
          var gn = draft.nodes.find(function (n) { return n.id === gpId && _scaffoldEffectiveRole(n) === "grandparent"; });
          if (gn && gpNodes.indexOf(gn) < 0) gpNodes.push(gn);
        }
      });

      // Fallback: find grandparent-role nodes not yet placed
      if (gpNodes.length === 0) {
        draft.nodes.forEach(function (n) {
          if (!_usedGpIds[n.id] && _scaffoldEffectiveRole(n) === "grandparent" && gpNodes.length < 2) {
            gpNodes.push(n);
          }
        });
      }

      // Mark these grandparents as used so the next parent gets different ones
      gpNodes.forEach(function (gn) { if (gn) _usedGpIds[gn.id] = true; });

      while (gpNodes.length < 2) gpNodes.push(null);

      return {
        node: pn, gen: 1,
        children: gpNodes.slice(0, 2).map(function (gn) {
          return {
            node: gn, gen: 2,
            children: [{ node: null, gen: 3, children: [] }, { node: null, gen: 3, children: [] }]
          };
        })
      };
    });

    return tree;
  }

  function _scaffoldNodeHtml(nodeOrNull, gen) {
    var color = _SCAFFOLD_GEN_COLORS[gen] || "#94a3b8";
    if (!nodeOrNull) {
      return '<div class="scaffold-node scaffold-empty" style="border-color:' + color + ';">'
        + '<div class="scaffold-node-name">Add Ancestor</div>'
        + '<div class="scaffold-node-meta">' + _SCAFFOLD_GEN_LABELS[gen] + '</div>'
        + '</div>';
    }
    var n = nodeOrNull;
    var name = _ftNodeDisplayName(n);
    var meta = [];
    if (n.birthDate) meta.push("b. " + n.birthDate);
    if (n.deceased) meta.push("deceased");
    if (n.uncertainty) meta.push(n.uncertainty);
    var badges = '';
    if (n.source) badges += '<span class="scaffold-badge">' + _esc(n.source) + '</span>';
    if (n.deceased) badges += '<span class="scaffold-badge scaffold-badge-dec">deceased</span>';

    return '<div class="scaffold-node" style="border-color:' + color + ';" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">'
      + '<div class="scaffold-node-name">' + _esc(name) + '</div>'
      + (meta.length ? '<div class="scaffold-node-meta">' + _esc(meta.join(" · ")) + '</div>' : '')
      + badges
      + '</div>';
  }

  function _renderFTScaffold(pid) {
    var draft = _ftDraft(pid);
    var tree = _scaffoldBuildTree(draft);
    if (!tree) {
      return '<div class="scaffold-empty-state">No nodes yet. Add a narrator to see the 4-generation scaffold.</div>';
    }

    // Collect additional nodes not in the scaffold (siblings, spouses, children, chosen_family)
    var scaffoldIds = {};
    function _collectIds(t) {
      if (t.node) scaffoldIds[t.node.id] = true;
      (t.children || []).forEach(_collectIds);
    }
    _collectIds(tree);
    var otherNodes = draft.nodes.filter(function (n) { return !scaffoldIds[n.id]; });

    // Use effective role for grouping other nodes
    var _eRole = _scaffoldEffectiveRole;

    // Render CSS + HTML
    var css = '<style>'
      + '.scaffold-wrap { font-family:inherit; }'
      + '.scaffold-gen { display:flex; justify-content:center; gap:12px; margin-bottom:4px; flex-wrap:wrap; }'
      + '.scaffold-connector { text-align:center; color:#cbd5e1; font-size:18px; margin:2px 0; }'
      + '.scaffold-node { width:140px; padding:10px; border-radius:8px; background:#fff; border-top:4px solid #ccc;'
      + '  text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.08); cursor:pointer; transition:transform 0.15s; }'
      + '.scaffold-node:hover { transform:translateY(-3px); box-shadow:0 4px 12px rgba(0,0,0,0.12); }'
      + '.scaffold-empty { border-style:dashed; border-width:2px; opacity:0.5; background:transparent; cursor:default; }'
      + '.scaffold-node-name { font-size:0.85rem; font-weight:600; margin-bottom:2px; }'
      + '.scaffold-node-meta { font-size:0.7rem; color:#64748b; }'
      + '.scaffold-badge { display:inline-block; font-size:0.6rem; padding:1px 5px; border-radius:8px; background:#e2e8f0; color:#475569; margin-top:4px; }'
      + '.scaffold-badge-dec { background:#fecaca; color:#991b1b; }'
      + '.scaffold-gen-label { text-align:center; font-size:0.7rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }'
      + '.scaffold-others { margin-top:16px; padding-top:12px; border-top:1px dashed #e2e8f0; }'
      + '.scaffold-others-label { font-size:0.75rem; color:#94a3b8; margin-bottom:8px; text-transform:uppercase; }'
      + '.scaffold-others-row { display:flex; flex-wrap:wrap; gap:8px; }'
      + '</style>';

    var html = css + '<div class="scaffold-wrap">';

    // Gen 4: Great-grandparents (8 slots)
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[3] + '</div>';
    html += '<div class="scaffold-gen">';
    tree.children.forEach(function (p) {
      (p.children || []).forEach(function (gp) {
        (gp.children || []).forEach(function (ggp) {
          html += _scaffoldNodeHtml(ggp.node, 3);
        });
      });
    });
    html += '</div>';
    html += '<div class="scaffold-connector">│</div>';

    // Gen 3: Grandparents (4 slots)
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[2] + '</div>';
    html += '<div class="scaffold-gen">';
    tree.children.forEach(function (p) {
      (p.children || []).forEach(function (gp) {
        html += _scaffoldNodeHtml(gp.node, 2);
      });
    });
    html += '</div>';
    html += '<div class="scaffold-connector">│</div>';

    // Gen 2: Parents (2 slots)
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[1] + '</div>';
    html += '<div class="scaffold-gen">';
    tree.children.forEach(function (p) {
      html += _scaffoldNodeHtml(p.node, 1);
    });
    html += '</div>';
    html += '<div class="scaffold-connector">│</div>';

    // Gen 1: Narrator
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[0] + '</div>';
    html += '<div class="scaffold-gen">';
    html += _scaffoldNodeHtml(tree.node, 0);
    html += '</div>';

    // Other nodes (siblings, spouses, children, chosen family) below scaffold
    if (otherNodes.length > 0) {
      var otherGroups = {};
      otherNodes.forEach(function (n) {
        var r = _eRole(n);
        if (!otherGroups[r]) otherGroups[r] = [];
        otherGroups[r].push(n);
      });
      html += '<div class="scaffold-others">';
      html += '<div class="scaffold-others-label">Other family members</div>';
      Object.keys(otherGroups).forEach(function (role) {
        html += '<div style="margin-bottom:4px;font-size:0.7rem;color:#64748b;text-transform:uppercase;">' + role.replace(/_/g, ' ') + '</div>';
        html += '<div class="scaffold-others-row">';
        otherGroups[role].forEach(function (n) {
          var name = _ftNodeDisplayName(n);
          html += '<div class="scaffold-node" style="width:120px;border-color:#94a3b8;" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">'
            + '<div class="scaffold-node-name">' + _esc(name) + '</div>'
            + (n.birthDate ? '<div class="scaffold-node-meta">b. ' + _esc(n.birthDate) + '</div>' : '')
            + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /* View mode toggle */
  function _toggleFTViewMode() {
    var idx = FT_VIEW_MODES.indexOf(_ftViewMode);
    _ftViewMode = FT_VIEW_MODES[(idx + 1) % FT_VIEW_MODES.length];
    _renderActiveTab();
  }
  function _toggleLTViewMode() {
    _ltViewMode = _ltViewMode === "cards" ? "graph" : "cards";
    _renderActiveTab();
  }

  /* ── v6: Build toggle button HTML ─────────────────────── */
  function _viewModeToggle(mode, toggleFn) {
    var modes = mode === _ftViewMode
      ? [["cards","📋 Cards"],["graph","🔗 Graph"],["scaffold","🌳 Scaffold"]]
      : [["cards","📋 Cards"],["graph","🔗 Graph"]];
    return '<div class="ft-view-toggle">'
      + modes.map(function (m) {
          return '<button class="bb-btn-sm' + (mode === m[0] ? ' bb-btn-active' : '') + '" onclick="' + toggleFn + '"'
            + (mode === m[0] ? ' disabled' : '') + '>' + m[1] + '</button>';
        }).join("")
      + '</div>';
  }

  /* ───────────────────────────────────────────────────────────
     PUBLIC ACTIONS
  ─────────────────────────────────────────────────────────── */

  function _switchTab(tab) {
    _activeTab          = tab;
    _activeSection      = null;
    _srcClearSourceReviewState();
    _renderTabs();
    _renderActiveTab();
  }

  function _addFact() {
    var input = _el("bbFactInput"); if (!input) return;
    var text  = (input.value || "").trim(); if (!text) return;
    var bb    = _bb(); if (bb) bb.quickItems.push({ id: _uid(), type: "fact", text: text, ts: Date.now() });
    input.value = "";
    _renderActiveTab();
  }

  function _addNote() {
    var ta   = _el("bbNoteInput"); if (!ta) return;
    var text = (ta.value || "").trim(); if (!text) return;
    var bb   = _bb(); if (bb) bb.quickItems.push({ id: _uid(), type: "note", text: text, ts: Date.now() });
    ta.value = "";
    _renderActiveTab();
  }

  function _openSection(sectionId)  { _activeSection = sectionId; _renderActiveTab(); }
  function _closeSection()          { _activeSection = null;      _renderActiveTab(); }

  function _addRepeatEntry(sectionId) {
    _qqAddRepeatEntry(sectionId, function () {
      _renderActiveTab();
    });
  }

  function _saveSection(sectionId) {
    _qqSaveSection(sectionId, _closeSection);
  }

  /* ── Phase D: file handling — now in bio-builder-sources.js ──
     Thin wrappers pass _renderActiveTab as callback.
  ─────────────────────────────────────────────────────────── */

  function _handleFiles(files) {
    _srcHandleFiles(files, _renderActiveTab);
  }

  function _reviewSource(cardId) {
    _srcReviewSource(cardId, _renderActiveTab);
  }

  function _closeSourceReview() {
    _srcCloseSourceReview(_renderActiveTab);
  }

  function _savePastedText(cardId) {
    _srcSavePastedText(cardId, _renderActiveTab);
  }

  /* ── Phase D: add detected item as candidate ────────────── */

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
     PUBLIC API
  ─────────────────────────────────────────────────────────── */

  function refresh() {
    _ensureState();
    var host = _el("bioBuilderPopover");
    if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) return;
    render();
  }

  var NS = {};
  NS.render              = render;
  NS.refresh             = refresh;
  NS.onNarratorSwitch    = _onNarratorSwitch;
  NS.SECTIONS            = SECTIONS;

  // Tab navigation
  NS._switchTab          = _switchTab;

  // Quick capture
  NS._addFact            = _addFact;
  NS._addNote            = _addNote;

  // Questionnaire
  NS._openSection        = _openSection;
  NS._closeSection       = _closeSection;
  NS._addRepeatEntry     = _addRepeatEntry;
  NS._saveSection        = _saveSection;

  // Phase D: source inbox + extraction
  NS._handleFiles        = _handleFiles;
  NS._reviewSource       = _reviewSource;
  NS._closeSourceReview  = _closeSourceReview;
  NS._savePastedText     = _savePastedText;

  // Phase D: candidate generation from source
  NS._addItemAsCandidate = _addItemAsCandidate;
  NS._addAllOfType       = _addAllOfType;
  NS._addAllFromCard     = _addAllFromCard;

  // Normalization helpers (public for profile sync bridge)
  NS.normalizeDobInput          = normalizeDobInput;
  NS.normalizeTimeOfBirthInput  = normalizeTimeOfBirthInput;
  NS.normalizePlaceInput        = normalizePlaceInput;
  NS.deriveZodiacFromDob        = deriveZodiacFromDob;
  NS.buildCanonicalBasicsFromBioBuilder = buildCanonicalBasicsFromBioBuilder;
  NS._onNormalizeBlur           = _onNormalizeBlur;

  // Safe candidate accessors
  NS._getCandidateTitle   = _getCandidateTitle;
  NS._getCandidateText    = _getCandidateText;
  NS._getCandidateSnippet = _getCandidateSnippet;

  // Family Tree tab (v3)
  NS._ftAddNode              = _ftAddNode;
  NS._ftDeleteNode           = _ftDeleteNode;
  NS._ftEditNode             = _ftEditNode;
  NS._ftSaveNode             = _ftSaveNode;
  NS._ftAddEdge              = _ftAddEdge;
  NS._ftSaveEdge             = _ftSaveEdge;
  NS._ftDeleteEdge           = _ftDeleteEdge;
  NS._ftSeedFromQuestionnaire = _ftSeedFromQuestionnaire;
  NS._ftSeedFromCandidates   = _ftSeedFromCandidates;

  // Life Threads tab (v3)
  NS._ltAddNode              = _ltAddNode;
  NS._ltDeleteNode           = _ltDeleteNode;
  NS._ltEditNode             = _ltEditNode;
  NS._ltSaveNode             = _ltSaveNode;
  NS._ltAddEdge              = _ltAddEdge;
  NS._ltSaveEdge             = _ltSaveEdge;
  NS._ltDeleteEdge           = _ltDeleteEdge;
  NS._ltSeedFromCandidates   = _ltSeedFromCandidates;
  NS._ltSeedThemes           = _ltSeedThemes;

  // v4: Persistence
  NS._persistDrafts          = _persistDrafts;
  NS._loadDrafts             = _loadDrafts;
  NS._clearDrafts            = _clearDrafts;
  NS._getDraftIndex          = _getDraftIndex;

  // v4: Draft quality utilities
  NS._ftFindDuplicates       = _ftFindDuplicates;
  NS._ftFindUnconnected      = _ftFindUnconnected;
  NS._ftFindWeakNodes        = _ftFindWeakNodes;
  NS._ftFindUnsourced        = _ftFindUnsourced;
  NS._ftCleanOrphanEdges     = function () {
    var pid = _currentPersonId(); if (!pid) return;
    var removed = _ftCleanOrphanEdges(pid);
    if (removed) alert("Cleaned " + removed + " orphan edge(s).");
  };

  // v4: Collapse/expand
  NS._toggleGroupCollapse    = _toggleGroupCollapse;

  // v6: Graph mode toggle
  NS._toggleFTViewMode       = _toggleFTViewMode;
  NS._toggleLTViewMode       = _toggleLTViewMode;

  // v4: Draft context accessors (for integration — Passes 4-6)
  NS._getDraftFamilyContext   = function (pid) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var ft = _ftDraft(pid);
    var lt = _ltDraft(pid);
    return {
      familyTree: ft ? { nodes: ft.nodes, edges: ft.edges } : null,
      lifeThreads: lt ? { nodes: lt.nodes, edges: lt.edges } : null
    };
  };

  // v6: Era-aware draft context accessor
  NS._getDraftFamilyContextForEra = function (pid, era) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var base = NS._getDraftFamilyContext(pid);
    if (!base) return null;

    // If no era specified, fall back to global (same as v5)
    if (!era) return { primary: [], secondary: [], global: _flattenContext(base), era: null };

    var primary = [];
    var secondary = [];
    var global = [];
    var roleWeights = ERA_ROLE_RELEVANCE[era] || {};
    var themeKeywords = ERA_THEME_KEYWORDS[era] || [];

    // Score and rank FT nodes
    if (base.familyTree && base.familyTree.nodes) {
      base.familyTree.nodes.forEach(function (n) {
        if (n.role === "narrator") return;
        var item = { type: "ft_person", node: n, label: n.displayName || n.preferredName || n.label || "", role: n.role || "other" };

        // Check explicit era metadata first
        if (n.eraRelevance && n.eraRelevance.length > 0) {
          if (n.eraRelevance.indexOf(era) >= 0) { item.score = n.eraWeight || 0.9; primary.push(item); return; }
        }

        // Infer from role-era map
        var roleScore = roleWeights[n.role] != null ? roleWeights[n.role] : 0.3;
        item.score = roleScore;
        if (roleScore >= 0.7) primary.push(item);
        else if (roleScore >= 0.3) secondary.push(item);
        else global.push(item);
      });
    }

    // Score and rank LT nodes
    if (base.lifeThreads && base.lifeThreads.nodes) {
      base.lifeThreads.nodes.forEach(function (n) {
        var label = n.label || n.displayName || "";
        var item = { type: "lt_" + (n.type || "other"), node: n, label: label, nodeType: n.type || "other" };

        // Check explicit era metadata
        if (n.eraRelevance && n.eraRelevance.length > 0) {
          if (n.eraRelevance.indexOf(era) >= 0) { item.score = n.eraWeight || 0.9; primary.push(item); return; }
        }

        // Infer from keyword overlap
        var lower = label.toLowerCase();
        var keywordHits = 0;
        themeKeywords.forEach(function (kw) { if (lower.indexOf(kw) >= 0) keywordHits++; });
        var kwScore = Math.min(keywordHits * 0.25, 0.9);

        // Themes with keyword hits rank higher
        if (n.type === "theme" && kwScore >= 0.25) { item.score = kwScore; primary.push(item); }
        else if (n.type === "place" && kwScore >= 0.25) { item.score = kwScore; primary.push(item); }
        else if (kwScore > 0) { item.score = kwScore; secondary.push(item); }
        else { item.score = 0.1; global.push(item); }
      });
    }

    // Sort each tier by score descending
    var byScore = function (a, b) { return (b.score || 0) - (a.score || 0); };
    primary.sort(byScore);
    secondary.sort(byScore);

    // Safety: never return completely empty if draft has data
    if (primary.length === 0 && secondary.length === 0 && global.length === 0) {
      return { primary: [], secondary: [], global: _flattenContext(base), era: era };
    }

    return { primary: primary, secondary: secondary, global: global, era: era };
  };

  function _flattenContext(base) {
    var items = [];
    if (base.familyTree && base.familyTree.nodes) {
      base.familyTree.nodes.forEach(function (n) {
        if (n.role === "narrator") return;
        items.push({ type: "ft_person", node: n, label: n.displayName || n.preferredName || n.label || "", role: n.role || "other", score: 0.5 });
      });
    }
    if (base.lifeThreads && base.lifeThreads.nodes) {
      base.lifeThreads.nodes.forEach(function (n) {
        items.push({ type: "lt_" + (n.type || "other"), node: n, label: n.label || n.displayName || "", nodeType: n.type || "other", score: 0.5 });
      });
    }
    return items;
  }

  // v6: Fuzzy matching — exposed for review, dedupe, and seeding
  NS._normalizeName     = _normalizeName;
  NS._fuzzyNameScore    = _fuzzyNameScore;
  NS._fuzzyDuplicateTier = _fuzzyDuplicateTier;

  // v6: Fuzzy duplicate finder (returns { node, match, score, tier } pairs)
  NS._ftFindFuzzyDuplicates = function (pid) {
    pid = pid || _currentPersonId();
    var draft = _ftDraft(pid); if (!draft) return [];
    var results = [];
    for (var i = 0; i < draft.nodes.length; i++) {
      for (var j = i + 1; j < draft.nodes.length; j++) {
        var a = draft.nodes[i], b = draft.nodes[j];
        var nameA = _ftNodeDisplayName(a), nameB = _ftNodeDisplayName(b);
        var score = _fuzzyNameScore(nameA, nameB);
        var tier = _fuzzyDuplicateTier(score);
        if (tier !== "distinct") {
          results.push({ nodeA: a, nodeB: b, nameA: nameA, nameB: nameB, score: score, tier: tier });
        }
      }
    }
    return results;
  };

  // Exposed for tests
  NS._parseTextItems     = _parseTextItems;

  window.LorevoxBioBuilder = NS;

})();
