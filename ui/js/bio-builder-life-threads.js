/* ═══════════════════════════════════════════════════════════════
   bio-builder-life-threads.js — Life Threads draft staging module
   Lorevox 9.0 — Phase 6 module extraction

   Extracted from bio-builder.js to match the modular architecture
   established in Phases 1-5 (core, questionnaire, sources,
   candidates, family-tree).

   Life Threads let users connect memories, people, places, events,
   and themes into a draft graph that reveals narrative structure
   before review and memoir drafting.

   Registration: window.LorevoxBioBuilderModules.lifeThreads
   Load order: after bio-builder-core.js, bio-builder-candidates.js
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ───────────────────────────────────────────────────────────
     CORE MODULE IMPORTS
  ─────────────────────────────────────────────────────────── */

  var _core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!_core) throw new Error("bio-builder-core.js must load before bio-builder-life-threads.js");

  var _ensureState       = _core._ensureState;
  var _bb                = _core._bb;
  var _el                = _core._el;
  var _uid               = _core._uid;
  var _esc               = _core._esc;
  var _currentPersonId   = _core._currentPersonId;
  var _currentPersonName = _core._currentPersonName;
  var _persistDrafts     = _core._persistDrafts;
  var _showInlineConfirm = _core._showInlineConfirm;
  var _emptyStateHtml    = _core._emptyStateHtml;

  /* ───────────────────────────────────────────────────────────
     CANDIDATES MODULE IMPORTS (for seeding)
  ─────────────────────────────────────────────────────────── */

  var _cand = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.candidates;
  if (!_cand) throw new Error("bio-builder-candidates.js must load before bio-builder-life-threads.js");

  var _getCandidateTitle = _cand._getCandidateTitle;
  var _getCandidateText  = _cand._getCandidateText;

  /* ───────────────────────────────────────────────────────────
     FAMILY TREE MODULE IMPORTS (for ERA_THEME_KEYWORDS)
  ─────────────────────────────────────────────────────────── */

  var _ft = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.familyTree;
  if (!_ft) throw new Error("bio-builder-family-tree.js must load before bio-builder-life-threads.js");

  var ERA_THEME_KEYWORDS = _ft.ERA_THEME_KEYWORDS;

  /* ───────────────────────────────────────────────────────────
     CALLBACK WIRING (set by bio-builder.js after load)
     Same pattern as bio-builder-family-tree.js
  ─────────────────────────────────────────────────────────── */

  var _renderCallback = function () {};
  function _setRenderCallback(fn) { _renderCallback = fn; }

  var _switchTabCallback = function () {};
  function _setSwitchTabCallback(fn) { _switchTabCallback = fn; }

  var _renderDraftUtilities = function () { return ""; };
  var _viewModeToggle       = function () { return ""; };
  var _isGroupCollapsed     = function () { return false; };
  var _toggleGroupCollapse  = function () {};

  function _setSharedRenderers(fns) {
    if (fns.renderDraftUtilities) _renderDraftUtilities = fns.renderDraftUtilities;
    if (fns.viewModeToggle)       _viewModeToggle       = fns.viewModeToggle;
    if (fns.isGroupCollapsed)     _isGroupCollapsed     = fns.isGroupCollapsed;
    if (fns.toggleGroupCollapse)  _toggleGroupCollapse  = fns.toggleGroupCollapse;
  }

  /* ───────────────────────────────────────────────────────────
     CONSTANTS
  ─────────────────────────────────────────────────────────── */

  var LT_NODE_TYPES = ["person","place","memory","event","theme"];
  var LT_EDGE_TYPES = ["family_of","happened_in","remembered_with","connected_to","influenced_by","theme_of","other"];

  /* ───────────────────────────────────────────────────────────
     VIEW MODE STATE
  ─────────────────────────────────────────────────────────── */

  var _ltViewMode = "cards";

  function _getLTViewMode() { return _ltViewMode; }

  function _toggleLTViewMode() {
    _ltViewMode = _ltViewMode === "cards" ? "graph" : "cards";
    _renderCallback();
  }

  /* ───────────────────────────────────────────────────────────
     DRAFT MANAGEMENT
  ─────────────────────────────────────────────────────────── */

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

  /* ───────────────────────────────────────────────────────────
     CRUD — NODES
  ─────────────────────────────────────────────────────────── */

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
    _renderCallback();
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
    _switchTabCallback("lifeThreads");
  }

  /* ───────────────────────────────────────────────────────────
     CRUD — EDGES
  ─────────────────────────────────────────────────────────── */

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
    _switchTabCallback("lifeThreads");
  }

  function _ltDeleteEdge(edgeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ltDraft(pid);
    draft.edges = draft.edges.filter(function (e) { return e.id !== edgeId; });
    _persistDrafts(pid);
    _renderCallback();
  }

  /* ───────────────────────────────────────────────────────────
     SEEDING
  ─────────────────────────────────────────────────────────── */

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
    _renderCallback();
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
    _renderCallback();
  }

  /* ───────────────────────────────────────────────────────────
     TAB RENDERER
  ─────────────────────────────────────────────────────────── */

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

  /* ───────────────────────────────────────────────────────────
     GRAPH MODE — SVG-based relationship graph (v6)
  ─────────────────────────────────────────────────────────── */

  var _GRAPH_MAX_NODES = 80;

  var _LT_TYPE_POSITIONS = {
    person: { cx: 0.30, cy: 0.30 },
    place:  { cx: 0.70, cy: 0.30 },
    memory: { cx: 0.30, cy: 0.70 },
    event:  { cx: 0.70, cy: 0.70 },
    theme:  { cx: 0.50, cy: 0.10 }
  };

  var _LT_TYPE_COLORS = {
    person: "#818cf8", place: "#34d399", memory: "#f97316", event: "#38bdf8", theme: "#a78bfa"
  };

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

  /* ───────────────────────────────────────────────────────────
     DRAFT CONTEXT ACCESSORS (for integration — Passes 4-6)
  ─────────────────────────────────────────────────────────── */

  function _getDraftLTContext(pid) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var lt = _ltDraft(pid);
    return lt ? { nodes: lt.nodes, edges: lt.edges } : null;
  }

  function _getDraftLTContextForEra(pid, era) {
    pid = pid || _currentPersonId();
    if (!pid) return { primary: [], secondary: [], global: [] };

    var lt = _ltDraft(pid);
    if (!lt || !lt.nodes) return { primary: [], secondary: [], global: [] };

    var primary = [];
    var secondary = [];
    var global = [];

    var themeKeywords = ERA_THEME_KEYWORDS[era] || [];

    lt.nodes.forEach(function (n) {
      var label = n.label || n.displayName || "";
      var item = { type: "lt_" + (n.type || "other"), node: n, label: label, nodeType: n.type || "other" };

      if (n.eraRelevance && n.eraRelevance.length > 0) {
        if (n.eraRelevance.indexOf(era) >= 0) { item.score = n.eraWeight || 0.9; primary.push(item); return; }
      }

      var lower = label.toLowerCase();
      var keywordHits = 0;
      themeKeywords.forEach(function (kw) { if (lower.indexOf(kw) >= 0) keywordHits++; });
      var kwScore = Math.min(keywordHits * 0.25, 0.9);

      if (n.type === "theme" && kwScore >= 0.25) { item.score = kwScore; primary.push(item); }
      else if (n.type === "place" && kwScore >= 0.25) { item.score = kwScore; primary.push(item); }
      else if (kwScore > 0) { item.score = kwScore; secondary.push(item); }
      else { item.score = 0.1; global.push(item); }
    });

    var byScore = function (a, b) { return (b.score || 0) - (a.score || 0); };
    primary.sort(byScore);
    secondary.sort(byScore);

    return { primary: primary, secondary: secondary, global: global };
  }

  /* ───────────────────────────────────────────────────────────
     MODULE REGISTRATION
  ─────────────────────────────────────────────────────────── */

  var MOD = {
    // Constants
    LT_NODE_TYPES:            LT_NODE_TYPES,
    LT_EDGE_TYPES:            LT_EDGE_TYPES,

    // View mode
    _getLTViewMode:            _getLTViewMode,
    _toggleLTViewMode:        _toggleLTViewMode,

    // Draft management
    _ltDraft:                 _ltDraft,
    _ltMakeNode:              _ltMakeNode,
    _ltMakeEdge:              _ltMakeEdge,

    // CRUD — Nodes
    _ltAddNode:               _ltAddNode,
    _ltDeleteNode:            _ltDeleteNode,
    _ltEditNode:              _ltEditNode,
    _ltSaveNode:              _ltSaveNode,

    // CRUD — Edges
    _ltAddEdge:               _ltAddEdge,
    _ltSaveEdge:              _ltSaveEdge,
    _ltDeleteEdge:            _ltDeleteEdge,

    // Seeding
    _ltSeedFromCandidates:    _ltSeedFromCandidates,
    _ltSeedThemes:            _ltSeedThemes,

    // Rendering
    _renderLifeThreadsTab:    _renderLifeThreadsTab,
    _renderLTGraph:           _renderLTGraph,

    // Graph helpers
    _clusterSpread:           _clusterSpread,
    _GRAPH_MAX_NODES:         _GRAPH_MAX_NODES,
    _LT_TYPE_POSITIONS:       _LT_TYPE_POSITIONS,
    _LT_TYPE_COLORS:          _LT_TYPE_COLORS,

    // Draft context
    _getDraftLTContext:        _getDraftLTContext,
    _getDraftLTContextForEra:  _getDraftLTContextForEra,

    // Wiring
    _setRenderCallback:       _setRenderCallback,
    _setSwitchTabCallback:    _setSwitchTabCallback,
    _setSharedRenderers:      _setSharedRenderers
  };

  if (!window.LorevoxBioBuilderModules) window.LorevoxBioBuilderModules = {};
  window.LorevoxBioBuilderModules.lifeThreads = MOD;

})();
