/* ═══════════════════════════════════════════════════════════════
   bio-builder.js — Bio Builder intake and staging layer
   Lorevox 9.0 — Phase D (builds on Phase B + C foundation)

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

  /* ───────────────────────────────────────────────────────────
     CANDIDATES MODULE DELEGATION (Phase 4 module split)
     All candidate display, formatting, and bulk add actions
     now live in bio-builder-candidates.js.  We pull them in as
     local aliases so existing code continues to work unchanged.
  ─────────────────────────────────────────────────────────── */

  var _cand = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.candidates;
  if (!_cand) throw new Error("bio-builder-candidates.js must load before bio-builder.js");

  // Candidates tab rendering
  var _renderCandidatesTab               = _cand._renderCandidatesTab;

  // Display helpers
  var _candidateSummary                  = _cand._candidateSummary;
  var _sourceLabel                       = _cand._sourceLabel;

  // Safe accessors (Phase D/E compatible)
  var _getCandidateTitle                 = _cand._getCandidateTitle;
  var _getCandidateText                  = _cand._getCandidateText;
  var _getCandidateSnippet               = _cand._getCandidateSnippet;
  var _getCandidateType                  = _cand._getCandidateType;

  // Duplicate detection
  var _cand_candidateExists              = _cand._candidateExists;
  var _cand_relCandidateExists           = _cand._relCandidateExists;
  var _cand_memCandidateExists           = _cand._memCandidateExists;

  // Detected item → candidate conversion
  var _detectedItemToCandidate           = _cand._detectedItemToCandidate;

  // Bulk add actions
  var _addItemAsCandidate                = _cand._addItemAsCandidate;
  var _addAllOfType                      = _cand._addAllOfType;
  var _addAllFromCard                    = _cand._addAllFromCard;

  /* ───────────────────────────────────────────────────────────
     FAMILY TREE MODULE DELEGATION (Phase 5 module split)
     All Family Tree draft management, CRUD, seeding, quality
     utilities, rendering, graph/scaffold views, and fuzzy name
     matching now live in bio-builder-family-tree.js.  We pull
     them in as local aliases so existing code continues to work
     unchanged.
  ─────────────────────────────────────────────────────────── */

  var _ft = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.familyTree;
  if (!_ft) throw new Error("bio-builder-family-tree.js must load before bio-builder.js");

  // Constants
  var FT_ROLES                         = _ft.FT_ROLES;
  var FT_REL_TYPES                     = _ft.FT_REL_TYPES;
  var FT_VIEW_MODES                    = _ft.FT_VIEW_MODES;
  var ERA_ROLE_RELEVANCE               = _ft.ERA_ROLE_RELEVANCE;
  var ERA_THEME_KEYWORDS               = _ft.ERA_THEME_KEYWORDS;

  // Fuzzy matching
  var _normalizeName                   = _ft._normalizeName;
  var _fuzzyNameScore                  = _ft._fuzzyNameScore;
  var _fuzzyDuplicateTier              = _ft._fuzzyDuplicateTier;

  // Draft management
  var _ftDraft                         = _ft._ftDraft;
  var _ftMakeNode                      = _ft._ftMakeNode;
  var _ftMakeEdge                      = _ft._ftMakeEdge;
  var _ftNodeDisplayName               = _ft._ftNodeDisplayName;

  // CRUD
  var _ftAddNode                       = _ft._ftAddNode;
  var _ftDeleteNode                    = _ft._ftDeleteNode;
  var _ftEditNode                      = _ft._ftEditNode;
  var _ftSaveNode                      = _ft._ftSaveNode;
  var _ftAddEdge                       = _ft._ftAddEdge;
  var _ftSaveEdge                      = _ft._ftSaveEdge;
  var _ftDeleteEdge                    = _ft._ftDeleteEdge;

  // Seeding
  var _ftSeedFromProfile               = _ft._ftSeedFromProfile;
  var _ftSeedFromQuestionnaire         = _ft._ftSeedFromQuestionnaire;
  var _ftSeedFromCandidates            = _ft._ftSeedFromCandidates;

  // Quality
  var _ftFindDuplicates                = _ft._ftFindDuplicates;
  var _ftFindUnconnected               = _ft._ftFindUnconnected;
  var _ftFindWeakNodes                 = _ft._ftFindWeakNodes;
  var _ftFindUnsourced                 = _ft._ftFindUnsourced;
  var _ftCleanOrphanEdges              = _ft._ftCleanOrphanEdges;
  var _ftFindFuzzyDuplicates           = _ft._ftFindFuzzyDuplicates;

  // Rendering
  var _renderFamilyTreeTab             = _ft._renderFamilyTreeTab;
  var _toggleFTViewMode                = _ft._toggleFTViewMode;

  // Draft context
  var _getDraftFTContext                = _ft._getDraftFTContext;
  var _getDraftFTContextForEra         = _ft._getDraftFTContextForEra;

  /* ───────────────────────────────────────────────────────────
     LIFE THREADS MODULE DELEGATION (Phase 6 module split)
     All Life Threads draft management, CRUD, seeding, graph
     rendering, and era-aware context scoring now live in
     bio-builder-life-threads.js.  We pull them in as local
     aliases so existing code continues to work unchanged.
  ─────────────────────────────────────────────────────────── */

  var _lt2 = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.lifeThreads;
  if (!_lt2) throw new Error("bio-builder-life-threads.js must load before bio-builder.js");

  // Constants
  var LT_NODE_TYPES                    = _lt2.LT_NODE_TYPES;
  var LT_EDGE_TYPES                    = _lt2.LT_EDGE_TYPES;

  // View mode
  var _toggleLTViewMode               = _lt2._toggleLTViewMode;

  // Draft management
  var _ltDraft                         = _lt2._ltDraft;
  var _ltMakeNode                      = _lt2._ltMakeNode;
  var _ltMakeEdge                      = _lt2._ltMakeEdge;

  // CRUD
  var _ltAddNode                       = _lt2._ltAddNode;
  var _ltDeleteNode                    = _lt2._ltDeleteNode;
  var _ltEditNode                      = _lt2._ltEditNode;
  var _ltSaveNode                      = _lt2._ltSaveNode;
  var _ltAddEdge                       = _lt2._ltAddEdge;
  var _ltSaveEdge                      = _lt2._ltSaveEdge;
  var _ltDeleteEdge                    = _lt2._ltDeleteEdge;

  // Seeding
  var _ltSeedFromCandidates            = _lt2._ltSeedFromCandidates;
  var _ltSeedThemes                    = _lt2._ltSeedThemes;

  // Rendering
  var _renderLifeThreadsTab            = _lt2._renderLifeThreadsTab;

  // Graph helpers (kept as aliases for shared use)
  var _clusterSpread                   = _lt2._clusterSpread;
  var _GRAPH_MAX_NODES                 = _lt2._GRAPH_MAX_NODES;

  // Draft context
  var _getDraftLTContext                = _lt2._getDraftLTContext;
  var _getDraftLTContextForEra         = _lt2._getDraftLTContextForEra;


  /* ── Previously extracted modules ──────────────────────────
     STATE MODEL — now in bio-builder-core.js
     UTILITIES — now in bio-builder-core.js
     QUESTIONNAIRE — now in bio-builder-questionnaire.js
     SOURCE INTAKE + EXTRACTION — now in bio-builder-sources.js
     CANDIDATE DISPLAY + ACTIONS — now in bio-builder-candidates.js
     FAMILY TREE — now in bio-builder-family-tree.js
  ─────────────────────────────────────────────────────────── */

  /* ───────────────────────────────────────────────────────────
     ACTIVE VIEW TRACKING
  ─────────────────────────────────────────────────────────── */

  var _activeSection      = null; // questionnaire section id currently open
  var _activeTab          = "capture";
  // _activeSourceCardId — now managed inside bio-builder-sources.js (Phase 3 module split)

  // v6: Graph mode state — FT view mode now in bio-builder-family-tree.js
  // v6: Graph mode state — LT view mode now in bio-builder-life-threads.js

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
            // Phase M: show overlap/split info from pipeline
            var tagHtml = "";
            if (_qcPipeline && bb.candidates && bb.candidates.memories) {
              var matchingCand = bb.candidates.memories.find(function (c) {
                return c.data && c.data.originalText === item.text;
              });
              if (matchingCand && matchingCand.data && matchingCand.data.overlapState && matchingCand.data.overlapState !== "none") {
                var tagText = matchingCand.data.displayTag || matchingCand.data.overlapState;
                tagHtml = ' <span class="bb-quick-tag bb-quick-tag--overlap">' + _esc(tagText) + '</span>';
              }
            }
            return '<div class="bb-quick-item">'
              + '<span class="bb-quick-type">' + _esc(typeLabel) + '</span>'
              + '<span class="bb-quick-text">' + _esc(preview) + '</span>'
              + tagHtml
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

  /* ── Candidates Tab — now in bio-builder-candidates.js ────
     _renderCandidatesTab, _candidateSummary, _sourceLabel,
     _getCandidateTitle, _getCandidateText, _getCandidateSnippet,
     _getCandidateType are imported as aliases above.
  ─────────────────────────────────────────────────────────── */

  /* ── Helpers ────────────────────────────────────────────── */

  /* _emptyStateHtml — now in bio-builder-core.js, imported as alias above */
  /* _sourceIcon — now in bio-builder-sources.js, imported as alias above */
  /* _getCandidateTitle, _getCandidateText, _getCandidateSnippet, _getCandidateType — now in bio-builder-candidates.js */

  /* ── Family Tree — now in bio-builder-family-tree.js ───────
     FT_ROLES, FT_REL_TYPES, ERA_ROLE_RELEVANCE, ERA_THEME_KEYWORDS,
     _normalizeName, _fuzzyNameScore, _fuzzyDuplicateTier,
     _ftDraft, _ftMakeNode, _ftMakeEdge, _ftNodeDisplayName,
     _ftAddNode, _ftDeleteNode, _ftEditNode, _ftSaveNode,
     _ftAddEdge, _ftSaveEdge, _ftDeleteEdge,
     _ftSeedFromProfile, _ftSeedFromQuestionnaire, _ftSeedFromCandidates,
     _ftFindDuplicates, _ftFindUnconnected, _ftFindWeakNodes,
     _ftFindUnsourced, _ftCleanOrphanEdges, _ftFindFuzzyDuplicates,
     _renderFamilyTreeTab, _renderFTGraph, _renderFTScaffold,
     _toggleFTViewMode are imported as aliases above.
  ─────────────────────────────────────────────────────────── */

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


  /* ── Life Threads — now in bio-builder-life-threads.js ────
     LT_NODE_TYPES, LT_EDGE_TYPES,
     _ltDraft, _ltMakeNode, _ltMakeEdge,
     _ltAddNode, _ltDeleteNode, _ltEditNode, _ltSaveNode,
     _ltAddEdge, _ltSaveEdge, _ltDeleteEdge,
     _ltSeedFromCandidates, _ltSeedThemes,
     _renderLifeThreadsTab, _renderLTGraph,
     _toggleLTViewMode, _clusterSpread,
     _LT_TYPE_POSITIONS, _LT_TYPE_COLORS,
     _GRAPH_MAX_NODES are imported as aliases above.
  ─────────────────────────────────────────────────────────── */


  /* ── v6: Build toggle button HTML ─────────────────────── */
  function _viewModeToggle(mode, toggleFn) {
    var ftMode = _ft._getFTViewMode ? _ft._getFTViewMode() : "cards";
    var ltMode = _lt2._getLTViewMode ? _lt2._getLTViewMode() : "cards";
    var isFT = (mode === ftMode && mode !== ltMode) || (mode === ftMode && toggleFn.indexOf("FT") >= 0);
    var modes = isFT
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

  /* ── Phase M: Quick Capture → Pipeline routing ───────────────
     Uses the QC pipeline module for atomic splitting, overlap
     comparison, relationship qualifier detection, and provenance
     labeling.  Falls back to simple candidate creation if the
     pipeline module is not loaded.
  ──────────────────────────────────────────────────────────── */
  var _qcPipeline = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules._qcPipeline;

  function _qcCreateCandidate(bb, text, sourceType) {
    if (!bb || !bb.candidates) return;

    if (_qcPipeline && typeof _qcPipeline.processQuickCapture === "function") {
      _qcPipeline.processQuickCapture(bb, text, sourceType);
      return;
    }

    // Fallback: simple candidate creation (pre-Phase M compat)
    if (!bb.candidates.memories) bb.candidates.memories = [];
    var isDupe = bb.candidates.memories.some(function (c) {
      return c.data && c.data.text === text;
    });
    if (isDupe) return;

    bb.candidates.memories.push({
      id: _uid(),
      type: "memory",
      source: "quickCapture:" + sourceType,
      sourceId: null,
      data: {
        label: sourceType === "fact" ? "Quick Fact" : "Quick Note",
        text: text
      },
      status: "pending"
    });
  }

  function _addFact() {
    var input = _el("bbFactInput"); if (!input) return;
    var text  = (input.value || "").trim(); if (!text) return;
    var bb    = _bb();
    if (bb) {
      bb.quickItems.push({ id: _uid(), type: "fact", text: text, ts: Date.now() });
      // Phase M: route through QC pipeline (atomic split, overlap, qualifiers)
      _qcCreateCandidate(bb, text, "fact");
      // Phase M: persist QC inbox immediately
      _persistQCInbox(bb);
    }
    input.value = "";
    _renderActiveTab();
  }

  function _addNote() {
    var ta   = _el("bbNoteInput"); if (!ta) return;
    var text = (ta.value || "").trim(); if (!text) return;
    var bb   = _bb();
    if (bb) {
      bb.quickItems.push({ id: _uid(), type: "note", text: text, ts: Date.now() });
      // Phase M: route through QC pipeline (atomic split, overlap, qualifiers)
      _qcCreateCandidate(bb, text, "note");
      // Phase M: persist QC inbox immediately
      _persistQCInbox(bb);
    }
    ta.value = "";
    _renderActiveTab();
  }

  /* Phase M: Immediately persist QC inbox after each add */
  function _persistQCInbox(bb) {
    if (!bb || !bb.personId || !bb.quickItems || bb.quickItems.length === 0) return;
    try {
      var prefix = _core._LS_QC_PREFIX || "lorevox_qc_draft_";
      localStorage.setItem(prefix + bb.personId, JSON.stringify({ v: 1, d: bb.quickItems }));
    } catch (e) {}
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

  /* ── Phase D: add detected item as candidate ───────────────
     _addItemAsCandidate, _addAllOfType, _addAllFromCard,
     _detectedItemToCandidate are now in bio-builder-candidates.js
  ─────────────────────────────────────────────────────────── */

  /* ───────────────────────────────────────────────────────────
     PUBLIC API
  ─────────────────────────────────────────────────────────── */

  function refresh() {
    _ensureState();
    // N.2-fix: always clear stale DOM on refresh, even when popover is closed,
    // so a narrator switch doesn't leave the previous narrator's content cached.
    var content = _el("bbTabContent");
    var host = _el("bioBuilderPopover");
    if (!host || (!host.hasAttribute("open") && !host.matches(":popover-open"))) {
      if (content) content.innerHTML = "";
      return;
    }
    render();
  }

  /* ── Wire up Family Tree module callbacks ────────────────── */
  _ft._setRenderCallback(_renderActiveTab);
  _ft._setSharedRenderers({
    renderDraftUtilities: _renderDraftUtilities,
    viewModeToggle:       _viewModeToggle,
    isGroupCollapsed:     _isGroupCollapsed,
    toggleGroupCollapse:  _toggleGroupCollapse
  });

  /* ── Wire up Life Threads module callbacks ──────────────── */
  _lt2._setRenderCallback(_renderActiveTab);
  _lt2._setSwitchTabCallback(_switchTab);
  _lt2._setSharedRenderers({
    renderDraftUtilities: _renderDraftUtilities,
    viewModeToggle:       _viewModeToggle,
    isGroupCollapsed:     _isGroupCollapsed,
    toggleGroupCollapse:  _toggleGroupCollapse
  });

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
  NS._ftSeedFromProfile       = _ftSeedFromProfile;
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
  // Combines FT context (from family-tree module) with LT context (local)
  NS._getDraftFamilyContext   = function (pid) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var ftCtx = _getDraftFTContext(pid);
    var ltCtx = _getDraftLTContext(pid);
    return {
      familyTree: ftCtx,
      lifeThreads: ltCtx
    };
  };

  // v6: Era-aware draft context accessor — delegates FT + LT era scoring to modules
  NS._getDraftFamilyContextForEra = function (pid, era) {
    pid = pid || _currentPersonId();
    if (!pid) return null;

    // FT era scoring — delegate to FT module
    var ftEra = _getDraftFTContextForEra(pid, era);
    var primary   = ftEra ? (ftEra.primary || [])   : [];
    var secondary = ftEra ? (ftEra.secondary || []) : [];
    var global    = ftEra ? (ftEra.global || [])    : [];

    // LT era scoring — delegate to LT module
    var ltEra = _getDraftLTContextForEra(pid, era);
    if (ltEra) {
      primary   = primary.concat(ltEra.primary || []);
      secondary = secondary.concat(ltEra.secondary || []);
      global    = global.concat(ltEra.global || []);
    }

    var byScore = function (a, b) { return (b.score || 0) - (a.score || 0); };
    primary.sort(byScore);
    secondary.sort(byScore);

    if (!era) {
      return { primary: [], secondary: [], global: global, era: null };
    }
    return { primary: primary, secondary: secondary, global: global, era: era };
  };

  // v6: Fuzzy matching — exposed for review, dedupe, and seeding (delegated from FT module)
  NS._normalizeName      = _normalizeName;
  NS._fuzzyNameScore     = _fuzzyNameScore;
  NS._fuzzyDuplicateTier = _fuzzyDuplicateTier;
  NS._ftFindFuzzyDuplicates = _ftFindFuzzyDuplicates;

  // Exposed for tests
  NS._parseTextItems     = _parseTextItems;

  window.LorevoxBioBuilder = NS;

})();
