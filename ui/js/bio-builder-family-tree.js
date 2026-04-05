/* ═══════════════════════════════════════════════════════════════
   bio-builder-family-tree.js — Family Tree Draft Surface
   Lorevox 9.0 — Phase 5 module split

   Extracted from bio-builder.js.  Contains all Family Tree draft
   management, CRUD operations, seeding logic, quality utilities,
   rendering (cards, SVG graph, scaffold), and fuzzy name matching.

   Architecture:
     This module registers on window.LorevoxBioBuilderModules.familyTree
     and is composed into the main Bio Builder by bio-builder.js.

   Dependencies (from bio-builder-core.js):
     _ensureState, _bb, _el, _uid, _esc, _currentPersonId,
     _currentPersonName, _persistDrafts, _showInlineConfirm,
     _emptyStateHtml, _formatBytes

   Load order: after bio-builder-core.js, before bio-builder.js
   Registration: window.LorevoxBioBuilderModules.familyTree
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Core module delegation ──────────────────────────────── */

  var _core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
  if (!_core) throw new Error("bio-builder-core.js must load before bio-builder-family-tree.js");

  var _ensureState        = _core._ensureState;
  var _bb                 = _core._bb;
  var _el                 = _core._el;
  var _uid                = _core._uid;
  var _esc                = _core._esc;
  var _currentPersonId    = _core._currentPersonId;
  var _currentPersonName  = _core._currentPersonName;
  var _persistDrafts      = _core._persistDrafts;
  var _showInlineConfirm  = _core._showInlineConfirm;
  var _emptyStateHtml     = _core._emptyStateHtml;

  /* ── Candidates module (for seeding + display name accessors) ── */

  var _cand = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.candidates;
  // _cand is optional at load time — seeding functions check at call time

  function _getCandidateTitle(c) {
    if (_cand && _cand._getCandidateTitle) return _cand._getCandidateTitle(c);
    return (c && (c.value || c.label || c.name || c.title || (c.data && (c.data.name || c.data.label || c.data.text)))) || "Untitled";
  }

  function _getCandidateText(c) {
    if (_cand && _cand._getCandidateText) return _cand._getCandidateText(c);
    return (c && (c.snippet || c.text || (c.data && c.data.text))) || "";
  }

  /* ═══════════════════════════════════════════════════════════════
     CONSTANTS
  ═══════════════════════════════════════════════════════════════ */

  var FT_ROLES     = ["narrator","parent","sibling","spouse","child","grandparent","grandchild","guardian","chosen_family","other"];
  var FT_REL_TYPES = ["biological","adoptive","step","marriage","partnership","former_marriage","guardian","chosen_family","half","foster","other"];

  var FT_VIEW_MODES = ["cards", "graph", "scaffold"];

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

  /* ═══════════════════════════════════════════════════════════════
     FUZZY NAME MATCHING (v6)
  ═══════════════════════════════════════════════════════════════ */

  function _normalizeName(s) {
    if (!s) return "";
    return String(s).toLowerCase()
      .replace(/['\u2018\u2019`]/g, "'")
      .replace(/["\u201C\u201D\u201E]/g, '"')
      .replace(/\./g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .replace(/\b(jr|sr|ii|iii|iv|dr|mr|mrs|ms|miss)\b/gi, "")
      .trim();
  }

  /* ── Nickname dictionary (P4-001 fix) ────────────────────── */
  var _NICKNAMES = {
    "william": ["bill","will","billy","willy","liam"],
    "robert": ["bob","bobby","rob","robbie","bert"],
    "richard": ["dick","rick","rich","ricky"],
    "james": ["jim","jimmy","jamie"],
    "john": ["jack","johnny","jon"],
    "thomas": ["tom","tommy"],
    "charles": ["charlie","chuck","chas"],
    "edward": ["ed","eddie","ted","teddy","ned"],
    "joseph": ["joe","joey"],
    "michael": ["mike","mikey","mick"],
    "frederick": ["fred","freddy","freddie","fritz"],
    "daniel": ["dan","danny"],
    "samuel": ["sam","sammy"],
    "benjamin": ["ben","benny"],
    "nicholas": ["nick","nicky"],
    "alexander": ["alex","al","alec","xander"],
    "elizabeth": ["liz","lizzy","beth","betty","eliza","betsy"],
    "margaret": ["maggie","meg","peggy","marge","margo"],
    "catherine": ["kate","kathy","cathy","cat","katie"],
    "patricia": ["pat","patty","trish","tricia"],
    "jennifer": ["jen","jenny"],
    "rebecca": ["becky","becca"],
    "theodore": ["ted","teddy","theo"],
    "anthony": ["tony"],
    "andrew": ["andy","drew"],
    "christopher": ["chris"],
    "jonathan": ["jon","jonny"],
    "matthew": ["matt"],
    "gregory": ["greg"],
    "stephen": ["steve","steven"],
    "lawrence": ["larry"],
    "raymond": ["ray"],
    "gerald": ["jerry","gerry"],
    "donald": ["don","donny","donnie"],
    "ronald": ["ron","ronny","ronnie"],
    "dorothy": ["dot","dotty","dottie"],
    "virginia": ["ginny","ginger"],
    "katherine": ["kate","kathy","cathy","cat","katie"],
    "susanne": ["sue","susie","suzy"],
    "suzanne": ["sue","susie","suzy"],
    "mary": ["molly","polly","mae"]
  };

  // Build reverse lookup: nickname → canonical forms
  var _NICK_REVERSE = {};
  Object.keys(_NICKNAMES).forEach(function (canon) {
    _NICKNAMES[canon].forEach(function (nick) {
      if (!_NICK_REVERSE[nick]) _NICK_REVERSE[nick] = [];
      _NICK_REVERSE[nick].push(canon);
    });
  });

  function _isNicknameMatch(a, b) {
    if (a === b) return true;
    // a is canonical, b is nickname
    if (_NICKNAMES[a] && _NICKNAMES[a].indexOf(b) >= 0) return true;
    // b is canonical, a is nickname
    if (_NICKNAMES[b] && _NICKNAMES[b].indexOf(a) >= 0) return true;
    // Both are nicknames of the same canonical
    var revA = _NICK_REVERSE[a] || [];
    var revB = _NICK_REVERSE[b] || [];
    for (var i = 0; i < revA.length; i++) {
      if (revB.indexOf(revA[i]) >= 0) return true;
    }
    return false;
  }

  function _fuzzyNameScore(a, b) {
    var na = _normalizeName(a);
    var nb = _normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1.0;

    var tokA = na.split(/\s+/).filter(Boolean);
    var tokB = nb.split(/\s+/).filter(Boolean);
    if (!tokA.length || !tokB.length) return 0;

    // Check first/last name agreement (with nickname + prefix support)
    var firstA = tokA[0], firstB = tokB[0];
    var firstMatch = firstA === firstB ? 1
      : _isNicknameMatch(firstA, firstB) ? 0.9
      : (firstA.length >= 2 && firstB.length >= 2 && (firstA.indexOf(firstB) === 0 || firstB.indexOf(firstA) === 0)) ? 0.7
      : 0;

    var lastA = tokA[tokA.length - 1], lastB = tokB[tokB.length - 1];
    var lastMatch = lastA === lastB ? 1
      : _isNicknameMatch(lastA, lastB) ? 0.9
      : 0;

    // Token overlap (handles middle name presence/absence + nickname equivalence)
    var setA = {};
    tokA.forEach(function (t) { setA[t] = true; });
    var overlap = 0;
    var usedA = {};
    tokB.forEach(function (tB) {
      if (setA[tB]) { overlap++; return; }
      // Check nickname/prefix equivalence for unmatched tokens
      for (var i = 0; i < tokA.length; i++) {
        if (usedA[i]) continue;
        if (_isNicknameMatch(tB, tokA[i]) || (tB.length >= 2 && tokA[i].length >= 2 && (tB.indexOf(tokA[i]) === 0 || tokA[i].indexOf(tB) === 0))) {
          overlap += 0.8; // partial credit for nickname/prefix match
          usedA[i] = true;
          return;
        }
      }
    });
    var tokenScore = overlap / Math.max(tokA.length, tokB.length);

    // Initial + prefix matching (P4-001 fix: removed tokA.length !== tokB.length guard)
    var initialBonus = 0;
    tokA.forEach(function (tA) {
      tokB.forEach(function (tB) {
        if (tA === tB) return; // already counted in overlap
        // Single-letter initial matches full token
        if (tA.length === 1 && tB.charAt(0) === tA) { initialBonus += 0.15; return; }
        if (tB.length === 1 && tA.charAt(0) === tB) { initialBonus += 0.15; return; }
        // Prefix match (min 2 chars): "Fred" matches "Frederick"
        if (tA.length >= 2 && tB.length >= 2) {
          if (tB.indexOf(tA) === 0 || tA.indexOf(tB) === 0) initialBonus += 0.1;
        }
      });
    });

    // Nickname bonus for non-first/last tokens (middle names)
    var nickBonus = 0;
    if (tokA.length > 2 || tokB.length > 2) {
      var midA = tokA.slice(1, -1);
      var midB = tokB.slice(1, -1);
      midA.forEach(function (mA) {
        midB.forEach(function (mB) {
          if (mA !== mB && _isNicknameMatch(mA, mB)) nickBonus += 0.05;
        });
      });
    }

    // Weighted composite
    var score = (firstMatch * 0.3) + (lastMatch * 0.35) + (tokenScore * 0.25) + Math.min(initialBonus + nickBonus, 0.1);
    return Math.min(score, 1.0);
  }

  function _fuzzyDuplicateTier(score) {
    if (score >= 1.0)  return "exact";
    if (score >= 0.8)  return "likely";
    if (score >= 0.5)  return "possible";
    return "distinct";
  }

  /* ═══════════════════════════════════════════════════════════════
     DRAFT MANAGEMENT
  ═══════════════════════════════════════════════════════════════ */

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
      id: "ft_" + _uid(),
      role: role || "other",
      displayName:   (data && data.displayName)   || "",
      preferredName: (data && data.preferredName)  || "",
      birthYear:     (data && data.birthYear)      || "",
      deathYear:     (data && data.deathYear)      || "",
      notes:         (data && data.notes)          || "",
      source:        (data && data.source)         || "manual",
      sourceRef:     (data && data.sourceRef)      || null,
      deceased:      (data && data.deceased)        || false
    };
  }

  function _ftMakeEdge(fromId, toId, relType, label, notes) {
    return {
      id: "fte_" + _uid(),
      from: fromId,
      to: toId,
      relType: relType || "biological",
      label: label || "",
      notes: notes || ""
    };
  }

  function _ftNodeDisplayName(node) {
    if (!node) return "";
    if (node.displayName && node.displayName.trim()) return node.displayName.trim();
    if (node.preferredName && node.preferredName.trim()) return node.preferredName.trim();
    if (node.label && node.label.trim()) return node.label.trim();
    var d = node.data || {};
    return (d.name || d.displayName || d.label || "").trim() || "(Unnamed)";
  }

  /* ═══════════════════════════════════════════════════════════════
     CRUD OPERATIONS
  ═══════════════════════════════════════════════════════════════ */

  // _renderActiveTab callback — set by bio-builder.js after load
  var _renderCallback = function () {};

  function _setRenderCallback(fn) {
    _renderCallback = fn;
  }

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
    var edgeCount = draft.edges.filter(function (e) { return e.from === nodeId || e.to === nodeId; }).length;
    if (edgeCount > 0 && !confirmed) {
      _showInlineConfirm(
        "This person has " + edgeCount + " connection(s). Delete anyway?",
        function () { _ftDeleteNode(nodeId, true); }
      );
      return;
    }
    draft.nodes = draft.nodes.filter(function (n) { return n.id !== nodeId; });
    draft.edges = draft.edges.filter(function (e) { return e.from !== nodeId && e.to !== nodeId; });
    _persistDrafts(pid);
    _renderCallback();
  }

  function _ftEditNode(nodeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var node = draft.nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    var content = _el("bbTabContent"); if (!content) return;

    var roleOpts = FT_ROLES.map(function (r) {
      return '<option value="' + r + '"' + (r === node.role ? ' selected' : '') + '>' + r + '</option>';
    }).join("");

    content.innerHTML =
      '<div class="bb-section-nav"><button class="bb-ghost-btn bb-back-btn" onclick="window.LorevoxBioBuilder._switchTab(\'familyTree\')">← Back to Family Tree</button></div>'
      + '<div class="bb-section-title">Edit Family Member</div>'
      + '<div class="bb-fields-list">'
      + '<div class="bb-field"><label class="bb-label">Role</label><select id="ftEditRole" class="bb-select">' + roleOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Display Name</label><input id="ftEditName" class="bb-input" type="text" value="' + _esc(node.displayName) + '" placeholder="Full name" /></div>'
      + '<div class="bb-field"><label class="bb-label">Preferred Name</label><input id="ftEditPrefName" class="bb-input" type="text" value="' + _esc(node.preferredName) + '" placeholder="Nickname or short name" /></div>'
      + '<div class="bb-field"><label class="bb-label">Birth Year</label><input id="ftEditBirth" class="bb-input" type="text" value="' + _esc(node.birthYear) + '" placeholder="e.g. 1946" /></div>'
      + '<div class="bb-field"><label class="bb-label">Death Year</label><input id="ftEditDeath" class="bb-input" type="text" value="' + _esc(node.deathYear) + '" placeholder="Leave blank if living" /></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ftEditNotes" class="bb-textarea" rows="3">' + _esc(node.notes) + '</textarea></div>'
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
    node.role          = (_el("ftEditRole")     || {}).value || node.role;
    node.displayName   = (_el("ftEditName")     || {}).value || "";
    node.preferredName = (_el("ftEditPrefName") || {}).value || "";
    node.birthYear     = (_el("ftEditBirth")    || {}).value || "";
    node.deathYear     = (_el("ftEditDeath")    || {}).value || "";
    node.notes         = (_el("ftEditNotes")    || {}).value || "";
    node.deceased      = !!node.deathYear;
    _persistDrafts(pid);
    // Switch back to FT tab via main bio-builder
    if (window.LorevoxBioBuilder && window.LorevoxBioBuilder._switchTab) {
      window.LorevoxBioBuilder._switchTab("familyTree");
    } else {
      _renderCallback();
    }
  }

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
      + '<div class="bb-field"><label class="bb-label">Relationship</label><select id="ftEdgeRel" class="bb-select">' + relOpts + '</select></div>'
      + '<div class="bb-field"><label class="bb-label">Label</label><input id="ftEdgeLabel" class="bb-input" type="text" placeholder="e.g. mother, brother" /></div>'
      + '<div class="bb-field"><label class="bb-label">Notes</label><textarea id="ftEdgeNotes" class="bb-textarea" rows="2"></textarea></div>'
      + '</div>'
      + '<div class="bb-section-footer"><button class="bb-btn-primary" onclick="window.LorevoxBioBuilder._ftSaveEdge(\'' + fromId + '\')">Save Connection</button></div>';
  }

  function _ftSaveEdge(fromId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    var toId    = (_el("ftEdgeTo")    || {}).value;
    var relType = (_el("ftEdgeRel")   || {}).value || "biological";
    var label   = (_el("ftEdgeLabel") || {}).value || "";
    var notes   = (_el("ftEdgeNotes") || {}).value || "";
    if (toId) {
      draft.edges.push(_ftMakeEdge(fromId, toId, relType, label, notes));
    }
    _persistDrafts(pid);
    if (window.LorevoxBioBuilder && window.LorevoxBioBuilder._switchTab) {
      window.LorevoxBioBuilder._switchTab("familyTree");
    } else {
      _renderCallback();
    }
  }

  function _ftDeleteEdge(edgeId) {
    var pid = _currentPersonId(); if (!pid) return;
    var draft = _ftDraft(pid);
    draft.edges = draft.edges.filter(function (e) { return e.id !== edgeId; });
    _persistDrafts(pid);
    _renderCallback();
  }

  /* ═══════════════════════════════════════════════════════════════
     SEEDING
  ═══════════════════════════════════════════════════════════════ */

  function _ftSeedFromQuestionnaire() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb();
    if (!bb || !bb.questionnaire) {
      // Phase L: try to load questionnaire from localStorage if bio builder hasn't hydrated it
      var qqRaw = localStorage.getItem("lorevox_qq_draft_" + pid);
      if (qqRaw) {
        var qqParsed = JSON.parse(qqRaw);
        if (!bb) {
          if (typeof sysBubble === "function") sysBubble("Bio Builder state not ready — try again in a moment.");
          return;
        }
        bb.questionnaire = qqParsed.d || qqParsed;
        console.log("[family-tree] Loaded questionnaire from localStorage for seeding");
      } else {
        if (typeof sysBubble === "function") sysBubble("No questionnaire data available to seed.");
        return;
      }
    }
    var draft = _ftDraft(pid);
    var q = bb.questionnaire;

    // Dedupe helper
    var existing = {};
    draft.nodes.forEach(function (n) {
      var dn = _ftNodeDisplayName(n);
      if (dn) existing[dn.toLowerCase()] = true;
    });
    function _exists(name) { return !!existing[(name || "").toLowerCase().trim()]; }

    // Narrator node
    var narratorFullName = (q.personal && (q.personal.fullName || ((q.personal.firstName || "") + " " + (q.personal.lastName || "")).trim())) || "";
    var narratorPrefName = (q.personal && q.personal.preferredName) || "";
    var _narr = draft.nodes.find(function (n) { return n.role === "narrator"; });
    if (!_narr && narratorFullName) _narr = draft.nodes.find(function (n) { return _ftNodeDisplayName(n) === narratorFullName; });
    if (!_narr && narratorPrefName) _narr = draft.nodes.find(function (n) { return _ftNodeDisplayName(n) === narratorPrefName; });
    var narratorId;
    if (_narr) {
      narratorId = _narr.id;
    } else if (narratorFullName || narratorPrefName) {
      var narratorNode = _ftMakeNode("narrator", {
        displayName: narratorFullName,
        preferredName: narratorPrefName,
        birthYear: (q.personal && (q.personal.dateOfBirth || "").substring(0, 4)) || "",
        source: "questionnaire"
      });
      draft.nodes.push(narratorNode);
      narratorId = narratorNode.id;
      existing[(narratorFullName || narratorPrefName).toLowerCase()] = true;
    } else {
      return; // no narrator info
    }

    // Parents
    if (q.parents && Array.isArray(q.parents)) {
      q.parents.forEach(function (p) {
        var name = ((p.firstName || "") + " " + (p.lastName || "")).trim() || p.fullName || "";
        if (!name || _exists(name)) return;
        var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "parent" || n.type === "parent"); });
        if (exists) return;
        var node = _ftMakeNode("parent", {
          displayName: name,
          preferredName: p.preferredName || "",
          birthYear: (p.dateOfBirth || "").substring(0, 4),
          deathYear: (p.dateOfDeath || "").substring(0, 4),
          deceased: !!p.deceased,
          source: "questionnaire"
        });
        draft.nodes.push(node);
        existing[name.toLowerCase()] = true;
        var relType = (p.relation || "").toLowerCase().indexOf("step") >= 0 ? "step" : "biological";
        var label = p.relation || "parent";
        draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, label, ""));
      });
    }

    // Siblings
    if (q.siblings && Array.isArray(q.siblings)) {
      q.siblings.forEach(function (s) {
        var name = ((s.firstName || "") + " " + (s.lastName || "")).trim() || s.fullName || "";
        if (!name || _exists(name)) return;
        var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "sibling" || n.type === "sibling"); });
        if (exists) return;
        var node = _ftMakeNode("sibling", {
          displayName: name,
          preferredName: s.preferredName || "",
          birthYear: (s.dateOfBirth || "").substring(0, 4),
          deathYear: (s.dateOfDeath || "").substring(0, 4),
          deceased: !!s.deceased,
          source: "questionnaire"
        });
        draft.nodes.push(node);
        existing[name.toLowerCase()] = true;
        var relType = (s.relation || "").toLowerCase().indexOf("half") >= 0 ? "half" : (s.relation || "").toLowerCase().indexOf("step") >= 0 ? "step" : "biological";
        draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, s.relation || "sibling", ""));
      });
    }

    // Grandparents
    if (q.grandparents && Array.isArray(q.grandparents)) {
      q.grandparents.forEach(function (g) {
        var name = ((g.firstName || "") + " " + (g.lastName || "")).trim() || g.fullName || "";
        if (!name || _exists(name)) return;
        var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "grandparent" || n.type === "grandparent"); });
        if (exists) return;
        var node = _ftMakeNode("grandparent", {
          displayName: name,
          birthYear: (g.dateOfBirth || "").substring(0, 4),
          deathYear: (g.dateOfDeath || "").substring(0, 4),
          deceased: !!g.deceased,
          source: "questionnaire"
        });
        draft.nodes.push(node);
        existing[name.toLowerCase()] = true;
        draft.edges.push(_ftMakeEdge(narratorId, node.id, "biological", "grandparent", ""));
      });
    }

    // Phase L: Children (were missing from questionnaire seed)
    if (q.children && Array.isArray(q.children)) {
      q.children.forEach(function (ch) {
        var name = ((ch.firstName || "") + " " + (ch.lastName || "")).trim() || ch.fullName || "";
        if (!name || _exists(name)) return;
        var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === name && (n.role === "child" || n.type === "child"); });
        if (exists) return;
        var node = _ftMakeNode("child", {
          displayName: name,
          birthYear: (ch.birthDate || ch.dateOfBirth || "").substring(0, 4),
          deceased: !!ch.deceased,
          source: "questionnaire"
        });
        draft.nodes.push(node);
        existing[name.toLowerCase()] = true;
        var relType = (ch.relation || "").toLowerCase().indexOf("step") >= 0 ? "step"
                    : (ch.relation || "").toLowerCase().indexOf("adopt") >= 0 ? "adoptive"
                    : "biological";
        draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, ch.relation || "child", ""));
      });
    }

    var nodeCountAfter = draft.nodes.length;
    _ftCleanOrphanEdges(pid);
    _persistDrafts(pid);
    _renderCallback();

    // Phase L: visible user feedback
    var addedCount = nodeCountAfter - 1; // minus narrator node
    if (addedCount > 0) {
      if (typeof sysBubble === "function") sysBubble("Family Tree: added " + addedCount + " member(s) from questionnaire.");
      console.log("[family-tree] Seeded " + addedCount + " nodes from questionnaire for " + pid);
    } else {
      if (typeof sysBubble === "function") sysBubble("No new members found in questionnaire.");
    }
  }

  function _ftSeedFromProfile() {
    var pid = _currentPersonId(); if (!pid) return;
    if (typeof state === "undefined" || !state.profile) {
      if (typeof sysBubble === "function") sysBubble("No profile data available to seed.");
      return;
    }
    var prof = state.profile;
    var basics = prof.basics || {};
    var kin = prof.kinship || {};
    // Phase L: check for empty kinship and provide feedback
    var kinLength = Array.isArray(kin) ? kin.length : Object.keys(kin).length;
    if (kinLength === 0 && !basics.fullName && !basics.preferred) {
      if (typeof sysBubble === "function") sysBubble("Profile is empty — nothing to seed. Try Seed from Questionnaire instead.");
      return;
    }

    var draft = _ftDraft(pid);

    // Dedupe helper
    var existing = {};
    draft.nodes.forEach(function (n) {
      var dn = _ftNodeDisplayName(n);
      if (dn) existing[dn.toLowerCase()] = true;
    });
    function _exists(name) { return !!existing[(name || "").toLowerCase().trim()]; }

    // Narrator node
    var narratorName = basics.fullName || basics.preferred || "";
    var _narr = draft.nodes.find(function (n) { return n.role === "narrator"; });
    if (!_narr && narratorName) _narr = draft.nodes.find(function (n) { return _ftNodeDisplayName(n) === narratorName; });
    var narratorId;
    if (_narr) {
      narratorId = _narr.id;
    } else if (narratorName) {
      var narratorNode = _ftMakeNode("narrator", {
        displayName: narratorName,
        preferredName: basics.preferred || "",
        birthYear: (basics.dob || "").substring(0, 4),
        source: "profile"
      });
      draft.nodes.push(narratorNode);
      narratorId = narratorNode.id;
      existing[narratorName.toLowerCase()] = true;
    } else {
      return;
    }

    // Kinship entries
    // Phase L: handle both array-form kinship (preload: [{name, relation, ...}])
    // and legacy object-form kinship ({ parents: [...], siblings: [...] })
    var kinEntries = [];
    if (Array.isArray(kin)) {
      // Flat array — each entry has its own .relation property
      kin.forEach(function (entry) {
        if (entry && typeof entry === "object") {
          kinEntries.push({ entry: entry, relation: entry.relation || "other" });
        }
      });
    } else {
      // Object-keyed form (legacy): { parents: [...], spouse: {...}, ... }
      Object.keys(kin).forEach(function (k) {
        var arr = kin[k];
        if (Array.isArray(arr)) {
          arr.forEach(function (entry) {
            kinEntries.push({ entry: entry, relation: entry.relation || k });
          });
        } else if (arr && typeof arr === "object") {
          kinEntries.push({ entry: arr, relation: arr.relation || k });
        }
      });
    }

    kinEntries.forEach(function (item) {
      var e = item.entry;
      var name = e.fullName || e.name || ((e.firstName || "") + " " + (e.lastName || "")).trim();
      if (!name || _exists(name)) return;

      var role = "other";
      var relType = "biological";
      var rel = (item.relation || "").toLowerCase();
      if (rel.indexOf("mother") >= 0 || rel.indexOf("father") >= 0 || rel.indexOf("parent") >= 0) { role = "parent"; }
      else if (rel.indexOf("sister") >= 0 || rel.indexOf("brother") >= 0 || rel.indexOf("sibling") >= 0) { role = "sibling"; }
      else if (rel.indexOf("spouse") >= 0 || rel.indexOf("wife") >= 0 || rel.indexOf("husband") >= 0 || rel.indexOf("partner") >= 0) { role = "spouse"; relType = "marriage"; }
      else if (rel.indexOf("child") >= 0 || rel.indexOf("son") >= 0 || rel.indexOf("daughter") >= 0) { role = "child"; }
      else if (rel.indexOf("grandparent") >= 0 || rel.indexOf("grandmother") >= 0 || rel.indexOf("grandfather") >= 0) { role = "grandparent"; }
      else if (rel.indexOf("grandchild") >= 0 || rel.indexOf("grandson") >= 0 || rel.indexOf("granddaughter") >= 0) { role = "grandchild"; }
      else if (rel.indexOf("guardian") >= 0) { role = "guardian"; relType = "guardian"; }

      if (rel.indexOf("step") >= 0) relType = "step";
      if (rel.indexOf("half") >= 0) relType = "half";
      if (rel.indexOf("adopt") >= 0) relType = "adoptive";

      var exists = draft.nodes.some(function (n) {
        return _ftNodeDisplayName(n) === name && (n.role === role || n.role === "other");
      });
      if (exists) return;

      var node = _ftMakeNode(role, {
        displayName: name,
        preferredName: e.preferred || e.preferredName || "",
        birthYear: (e.dob || e.dateOfBirth || "").substring(0, 4),
        deathYear: (e.dod || e.dateOfDeath || "").substring(0, 4),
        deceased: !!e.deceased,
        source: "profile"
      });
      draft.nodes.push(node);
      existing[name.toLowerCase()] = true;

      draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, item.relation || role, ""));
    });

    _ftCleanOrphanEdges(pid);
    _persistDrafts(pid);
    _renderCallback();

    // Phase L: visible user feedback
    var addedCount = draft.nodes.length - 1; // minus narrator node
    if (addedCount > 0) {
      if (typeof sysBubble === "function") sysBubble("Family Tree: added " + addedCount + " member(s) from profile.");
      console.log("[family-tree] Seeded " + addedCount + " nodes from profile for " + pid);
    } else {
      if (typeof sysBubble === "function") sysBubble("No new members to add from profile — tree is up to date.");
    }
  }

  function _ftSeedFromCandidates() {
    var pid = _currentPersonId(); if (!pid) return;
    var bb = _bb(); if (!bb) return;
    var draft = _ftDraft(pid);

    // Dedupe helper
    var existing = {};
    draft.nodes.forEach(function (n) {
      var dn = _ftNodeDisplayName(n);
      if (dn) existing[dn.toLowerCase()] = true;
    });
    function _exists(name) { return !!existing[(name || "").toLowerCase().trim()]; }

    // People candidates
    var people = (bb.candidates && bb.candidates.people) || [];

    // Narrator anchor
    var _narr = draft.nodes.find(function (n) { return n.role === "narrator"; });
    var narratorId;
    if (_narr) {
      narratorId = _narr.id;
    } else {
      var narratorName = _currentPersonName() || "Narrator";
      if (!_exists(narratorName)) {
        var nNode = _ftMakeNode("narrator", {
          displayName: narratorName,
          source: "candidates"
        });
        draft.nodes.push(nNode);
        narratorId = nNode.id;
        existing[narratorName.toLowerCase()] = true;
      }
    }

    people.forEach(function (c) {
      var title = _getCandidateTitle(c);
      if (!title || title === "Untitled") return;
      if (_exists(title)) return;

      var d = c.data || {};
      var role = "other";
      var relType = "biological";
      var rel = (d.relation || c.relation || "").toLowerCase();
      if (rel.indexOf("mother") >= 0 || rel.indexOf("father") >= 0 || rel.indexOf("parent") >= 0) role = "parent";
      else if (rel.indexOf("sister") >= 0 || rel.indexOf("brother") >= 0 || rel.indexOf("sibling") >= 0) role = "sibling";
      else if (rel.indexOf("spouse") >= 0 || rel.indexOf("wife") >= 0 || rel.indexOf("husband") >= 0) { role = "spouse"; relType = "marriage"; }
      else if (rel.indexOf("child") >= 0 || rel.indexOf("son") >= 0 || rel.indexOf("daughter") >= 0) role = "child";
      else if (rel.indexOf("grandparent") >= 0) role = "grandparent";

      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === title && n.role === role; });
      if (exists) return;

      var node = _ftMakeNode(role, {
        displayName: title,
        birthYear: (d.birthYear || "").substring(0, 4),
        source: "candidate",
        sourceRef: c.id || null
      });
      draft.nodes.push(node);
      existing[title.toLowerCase()] = true;

      if (narratorId) {
        draft.edges.push(_ftMakeEdge(narratorId, node.id, relType, d.relation || role, ""));
      }
    });

    // Relationship candidates — pull out mentioned person names
    var rels = (bb.candidates && bb.candidates.relationships) || [];
    rels.forEach(function (c) {
      var pn = _getCandidateTitle(c);
      if (!pn || pn === "Untitled" || _exists(pn)) return;
      var exists = draft.nodes.some(function (n) { return _ftNodeDisplayName(n) === pn; });
      if (exists) return;
      draft.nodes.push(_ftMakeNode("other", {
        displayName: pn,
        source: "candidate",
        sourceRef: c.id || null
      }));
      existing[pn.toLowerCase()] = true;
    });

    _persistDrafts(pid);
    _renderCallback();
  }

  /* ── Phase Q.1: Seed from Relationship Graph ────────────────
     The primary seeding function.  Reads the canonical graph
     (persons + relationships) and creates FT nodes/edges.
     This is the preferred path — graph is the truth model.
  ─────────────────────────────────────────────────────────── */
  function _ftSeedFromGraph() {
    var pid = _currentPersonId(); if (!pid) return;
    var graphMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.graph;
    if (!graphMod || typeof graphMod.getGraphForFamilyTree !== "function") {
      console.log("[bb-ft] Graph module not loaded — falling back to profile/questionnaire seed");
      _ftSeedFromProfile();
      _ftSeedFromQuestionnaire();
      return;
    }

    var graphData = graphMod.getGraphForFamilyTree();
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      console.log("[bb-ft] Graph empty — falling back to profile/questionnaire seed");
      _ftSeedFromProfile();
      _ftSeedFromQuestionnaire();
      return;
    }

    var draft = _ftDraft(pid);

    // Dedupe helper
    var existing = {};
    draft.nodes.forEach(function (n) {
      var dn = _ftNodeDisplayName(n);
      if (dn) existing[dn.toLowerCase()] = true;
    });

    // Map from graph node id → FT node id
    var graphToFt = {};
    draft.nodes.forEach(function (n) {
      if (n.graphPersonId) graphToFt[n.graphPersonId] = n.id;
    });

    var added = 0;

    graphData.nodes.forEach(function (gn) {
      var name = gn.displayName || "";
      if (!name) return;
      var key = name.toLowerCase().trim();

      // Check if already exists by name
      if (existing[key]) {
        // Still map the graph ID for edge creation
        var existingNode = draft.nodes.find(function (n) {
          return _ftNodeDisplayName(n).toLowerCase().trim() === key;
        });
        if (existingNode) graphToFt[gn.graphPersonId] = existingNode.id;
        return;
      }

      var node = _ftMakeNode(gn.role || "other", {
        displayName: name,
        preferredName: gn.preferredName || "",
        birthYear: gn.birthYear || "",
        deathYear: gn.deathYear || "",
        source: "graph",
        sourceRef: gn.graphPersonId || null,
        deceased: gn.deceased || false
      });
      node.graphPersonId = gn.graphPersonId;
      draft.nodes.push(node);
      graphToFt[gn.graphPersonId] = node.id;
      existing[key] = true;
      added++;
    });

    // Add edges
    var edgeAdded = 0;
    graphData.edges.forEach(function (ge) {
      var fromFt = graphToFt[ge.from.replace("ft_", "")];
      var toFt = graphToFt[ge.to.replace("ft_", "")];
      if (!fromFt || !toFt) return;

      // Check for duplicate edge
      var dupEdge = draft.edges.some(function (e) {
        return (e.from === fromFt && e.to === toFt)
            || (e.from === toFt && e.to === fromFt);
      });
      if (dupEdge) return;

      draft.edges.push(_ftMakeEdge(fromFt, toFt, ge.relType || "biological", ge.label || "", ge.notes || ""));
      edgeAdded++;
    });

    console.log("[bb-ft] ✅ Graph seed: added " + added + " nodes, " + edgeAdded + " edges");
    _persistDrafts(pid);
    _renderCallback();
  }

  /* ═══════════════════════════════════════════════════════════════
     QUALITY UTILITIES
  ═══════════════════════════════════════════════════════════════ */

  function _ftFindDuplicates(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    var seen = {}, dupes = [];
    draft.nodes.forEach(function (n) {
      var key = _ftNodeDisplayName(n).toLowerCase().trim();
      if (!key) return;
      if (seen[key]) dupes.push({ original: seen[key], duplicate: n });
      else seen[key] = n;
    });
    return dupes;
  }

  function _ftFindUnconnected(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    var connected = {};
    draft.edges.forEach(function (e) { connected[e.from] = true; connected[e.to] = true; });
    return draft.nodes.filter(function (n) { return !connected[n.id]; });
  }

  function _ftFindWeakNodes(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    return draft.nodes.filter(function (n) {
      var name = _ftNodeDisplayName(n);
      return !name || name === "(Unnamed)" || (!n.birthYear && !n.notes && !n.source);
    });
  }

  function _ftFindUnsourced(pid) {
    var draft = _ftDraft(pid); if (!draft) return [];
    return draft.nodes.filter(function (n) {
      return !n.source || n.source === "manual";
    });
  }

  function _ftCleanOrphanEdges(pid) {
    var draft = _ftDraft(pid); if (!draft) return 0;
    var nodeIds = {};
    draft.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    var before = draft.edges.length;
    draft.edges = draft.edges.filter(function (e) { return nodeIds[e.from] && nodeIds[e.to]; });
    var removed = before - draft.edges.length;
    if (removed > 0) { _persistDrafts(pid); _renderCallback(); }
    return removed;
  }

  function _ftFindFuzzyDuplicates(pid) {
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
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDERING — Cards View
  ═══════════════════════════════════════════════════════════════ */

  // View mode state
  var _ftViewMode = "cards";

  function _toggleFTViewMode() {
    var idx = FT_VIEW_MODES.indexOf(_ftViewMode);
    _ftViewMode = FT_VIEW_MODES[(idx + 1) % FT_VIEW_MODES.length];
    _renderCallback();
  }

  // These are injected by bio-builder.js after load so FT can call shared renderers
  var _renderDraftUtilities = function () { return ""; };
  var _viewModeToggle = function () { return ""; };
  var _isGroupCollapsed = function () { return false; };
  var _toggleGroupCollapse = function () {};

  function _setSharedRenderers(fns) {
    if (fns.renderDraftUtilities) _renderDraftUtilities = fns.renderDraftUtilities;
    if (fns.viewModeToggle) _viewModeToggle = fns.viewModeToggle;
    if (fns.isGroupCollapsed) _isGroupCollapsed = fns.isGroupCollapsed;
    if (fns.toggleGroupCollapse) _toggleGroupCollapse = fns.toggleGroupCollapse;
  }

  function _renderFamilyTreeTab(container, pid) {
    if (!pid) {
      container.innerHTML = _emptyStateHtml("No narrator selected", "Select a narrator to start building their family tree.", []);
      return;
    }
    var draft = _ftDraft(pid);
    if (!draft.nodes.length) {
      container.innerHTML = _emptyStateHtml(
        "Family Tree",
        "Build the family structure here as you gather biography details. Add parents, siblings, spouses, children, and chosen family. This is a draft workspace \u2014 nothing is promoted automatically.",
        [
          { label: "Seed from Graph", action: "window.LorevoxBioBuilder._ftSeedFromGraph()" },
          { label: "\ud83d\udccb Seed from Profile", action: "window.LorevoxBioBuilder._ftSeedFromProfile()" },
          { label: "\ud83c\udf31 Seed from Questionnaire", action: "window.LorevoxBioBuilder._ftSeedFromQuestionnaire()" },
          { label: "\ud83d\udc65 Seed from Candidates", action: "window.LorevoxBioBuilder._ftSeedFromCandidates()" },
          { label: "+ Add Person", action: "window.LorevoxBioBuilder._ftAddNode('other')" }
        ]
      );
      return;
    }

    // Group by role
    var groups = {};
    FT_ROLES.forEach(function (r) { groups[r] = []; });
    draft.nodes.forEach(function (n) {
      var g = groups[n.role] || groups.other;
      g.push(n);
    });

    var utilHtml = _renderDraftUtilities(container, pid, "familyTree");

    // v6: Fuzzy duplicate warnings
    var fuzzyDupes = _ftFindFuzzyDuplicates(pid);
    var fuzzyHtml = "";
    if (fuzzyDupes.length) {
      fuzzyHtml = '<div class="ft-utilities-bar" style="background:rgba(251,191,36,0.08);border-color:#fbbf24">'
        + '<span class="ft-util-badge ft-util-warn">' + fuzzyDupes.length + ' fuzzy duplicate(s): '
        + fuzzyDupes.map(function (d) {
            return '"' + _esc(d.nameA) + '" \u2194 "' + _esc(d.nameB) + '" (' + d.tier + ' ' + Math.round(d.score * 100) + '%)';
          }).join(", ")
        + '</span></div>';
    }

    var html = '<div class="ft-toolbar">'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftAddNode(\'other\')">+ Add Person</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromGraph()">Seed Graph</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromProfile()">\ud83d\udccb Seed Profile</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromQuestionnaire()">\ud83c\udf31 Seed Questionnaire</button>'
      + '<button class="bb-btn-sm" onclick="window.LorevoxBioBuilder._ftSeedFromCandidates()">\ud83d\udc65 Seed Candidates</button>'
      + _viewModeToggle(_ftViewMode, "window.LorevoxBioBuilder._toggleFTViewMode()")
      + '</div>';

    html += utilHtml + fuzzyHtml;

    if (_ftViewMode === "graph") {
      html += _renderFTGraph(pid);
      container.innerHTML = html;
      return;
    }

    if (_ftViewMode === "scaffold") {
      html += _renderFTScaffold(pid);
      container.innerHTML = html;
      return;
    }

    FT_ROLES.forEach(function (role) {
      var nodes = groups[role];
      if (!nodes.length) return;
      var collapsed = _isGroupCollapsed("ft", role);
      html += '<div class="ft-role-group' + (collapsed ? ' ft-group-collapsed' : '') + '">';
      html += '<div class="ft-group-label" onclick="window.LorevoxBioBuilder._toggleGroupCollapse(\'ft\',\'' + role + '\')" style="cursor:pointer">'
        + '<span class="ft-collapse-arrow">' + (collapsed ? '\u25b8' : '\u25be') + '</span> '
        + role.replace(/_/g, ' ') + ' <span class="ft-group-count">(' + nodes.length + ')</span></div>';
      if (collapsed) { html += '</div>'; return; }
      html += '<div class="ft-cards">';
      nodes.forEach(function (n) {
        var name = _ftNodeDisplayName(n);
        var edges = draft.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
        var edgeHtml = edges.map(function (e) {
          var otherId = e.from === n.id ? e.to : e.from;
          var otherNode = draft.nodes.find(function (on) { return on.id === otherId; });
          var otherName = otherNode ? _ftNodeDisplayName(otherNode) : "?";
          return '<div class="ft-edge-line">'
            + '<span class="ft-edge-type">' + _esc(e.relType || "—") + '</span> → '
            + _esc(otherName) + ' <button class="ft-edge-del" onclick="window.LorevoxBioBuilder._ftDeleteEdge(\'' + e.id + '\')">✕</button></div>';
        }).join("");

        html += '<div class="ft-node-card">'
          + '<div class="ft-node-header"><strong>' + _esc(name) + '</strong>'
          + (n.birthYear ? ' <span class="ft-year">' + _esc(n.birthYear) + (n.deathYear ? '–' + _esc(n.deathYear) : '') + '</span>' : '')
          + '</div>'
          + (n.notes ? '<div class="ft-node-notes">' + _esc(n.notes.slice(0, 80)) + '</div>' : '')
          + (edgeHtml ? '<div class="ft-node-edges">' + edgeHtml + '</div>' : '')
          + '<div class="ft-node-actions">'
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
     RENDERING — SVG Graph View
  ═══════════════════════════════════════════════════════════════ */

  var _GRAPH_MAX_NODES = 80;

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

  var _FT_ROLE_COLORS = {
    narrator: "#818cf8", parent: "#f97316", grandparent: "#fb923c",
    sibling: "#34d399", spouse: "#f472b6", child: "#38bdf8",
    grandchild: "#67e8f9", guardian: "#fbbf24", chosen_family: "#a78bfa", other: "#94a3b8"
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

  function _renderFTGraph(pid) {
    var draft = _ftDraft(pid);
    if (!draft || !draft.nodes.length) return '<div class="ft-graph-empty">No nodes to graph.</div>';

    var nodes = draft.nodes;
    var edges = draft.edges;
    var capped = nodes.length > _GRAPH_MAX_NODES;
    if (capped) nodes = nodes.slice(0, _GRAPH_MAX_NODES);

    var W = 700, H = 500;
    var grouped = {};
    FT_ROLES.forEach(function (r) { grouped[r] = []; });
    nodes.forEach(function (n) {
      var g = grouped[n.role] || grouped.other;
      g.push(n);
    });

    FT_ROLES.forEach(function (role) {
      var clusterNodes = grouped[role];
      if (!clusterNodes.length) return;
      var center = _FT_ROLE_POSITIONS[role] || { cx: 0.5, cy: 0.5 };
      var positions = _clusterSpread(clusterNodes, center, W, H, 0.1);
      clusterNodes.forEach(function (n, i) {
        n._gx = positions[i].x;
        n._gy = positions[i].y;
      });
    });

    // Build node lookup
    var nodeMap = {};
    nodes.forEach(function (n) { nodeMap[n.id] = n; });

    var name = _ftNodeDisplayName;

    // SVG edges
    var edgeSvg = "";
    edges.forEach(function (e) {
      var fromN = nodeMap[e.from], toN = nodeMap[e.to];
      if (!fromN || !toN || fromN._gx == null || toN._gx == null) return;
      edgeSvg += '<line x1="' + fromN._gx + '" y1="' + fromN._gy + '" x2="' + toN._gx + '" y2="' + toN._gy + '" stroke="#475569" stroke-width="1" opacity="0.5"/>';
    });

    // SVG nodes
    FT_ROLES.forEach(function (role) {
      var clusterNodes = grouped[role];
      if (!clusterNodes.length) return;
      var color = _FT_ROLE_COLORS[role] || "#94a3b8";
      clusterNodes.forEach(function (n) {
        if (n._gx == null) return;
        edgeSvg += '<circle cx="' + n._gx + '" cy="' + n._gy + '" r="' + (n.role === "narrator" ? 10 : 6) + '" fill="' + color + '" stroke="#1e293b" stroke-width="1"/>';
        edgeSvg += '<text x="' + n._gx + '" y="' + (n._gy + 16) + '" text-anchor="middle" fill="#cbd5e1" font-size="9">' + _esc(name(n).slice(0, 18)) + '</text>';
      });
    });

    var svg = '<svg class="ft-graph-svg" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">'
      + '<rect width="' + W + '" height="' + H + '" fill="#0f172a" rx="8"/>'
      + edgeSvg
      + '</svg>';

    return '<div class="ft-graph-wrap">' + svg
      + (capped ? '<div class="ft-graph-note">Showing first ' + _GRAPH_MAX_NODES + ' of ' + draft.nodes.length + ' nodes.</div>' : '')
      + '</div>';
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDERING — Scaffold View
  ═══════════════════════════════════════════════════════════════ */

  var _SCAFFOLD_GEN_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b"];
  var _SCAFFOLD_GEN_LABELS = ["Narrator","Parents","Grandparents","Great-Grandparents"];

  function _scaffoldFindNodeByRoleAndName(draft, role, name) {
    return draft.nodes.find(function (n) {
      return n.role === role && _ftNodeDisplayName(n) === name;
    });
  }

  function _scaffoldFindParentsOf(draft, nodeId) {
    var parentIds = [];
    draft.edges.forEach(function (e) {
      if (e.from === nodeId) {
        var target = draft.nodes.find(function (n) { return n.id === e.to; });
        if (target && (target.role === "parent" || target.role === "grandparent")) parentIds.push(e.to);
      }
      if (e.to === nodeId) {
        var source = draft.nodes.find(function (n) { return n.id === e.from; });
        if (source && (source.role === "parent" || source.role === "grandparent")) parentIds.push(e.from);
      }
    });
    return parentIds;
  }

  function _scaffoldEffectiveRole(n) {
    if (n.role === "narrator") return "narrator";
    if (n.role === "parent") return "parent";
    if (n.role === "grandparent") return "grandparent";
    // Infer from edges
    return n.role || "other";
  }

  function _scaffoldBuildTree(draft) {
    var narrator = draft.nodes.find(function (n) { return _scaffoldEffectiveRole(n) === "narrator"; });
    if (!narrator) return { node: null, parents: [], siblings: [], spouses: [], children: [] };

    var tree = { node: narrator, parents: [], siblings: [], spouses: [], children: [] };

    // Direct parent edges
    var parentIds = _scaffoldFindParentsOf(draft, narrator.id);
    var parentNodes = [];
    parentIds.forEach(function (pid) {
      var pn = draft.nodes.find(function (n) { return n.id === pid && _scaffoldEffectiveRole(n) === "parent"; });
      if (pn) parentNodes.push(pn);
    });

    // Also pick up parent-role nodes not explicitly connected
    draft.nodes.forEach(function (n) {
      if (n.id !== narrator.id && _scaffoldEffectiveRole(n) === "parent") {
        if (!parentNodes.some(function (p) { return p.id === n.id; })) parentNodes.push(n);
      }
    });

    var _usedGpIds = {}; // P5-OBS1 fix: hoisted outside forEach so grandparents aren't reused across parents
    parentNodes.forEach(function (pn) {
      var pEntry = { node: pn, grandparents: [] };

      // Find grandparent edges from this parent
      var gpIds = _scaffoldFindParentsOf(draft, pn.id);
      var gpNodes = [];
      gpIds.forEach(function (gpId) {
        var gn = draft.nodes.find(function (n) { return n.id === gpId && _scaffoldEffectiveRole(n) === "grandparent"; });
        if (gn && !_usedGpIds[gn.id]) { gpNodes.push(gn); _usedGpIds[gn.id] = true; }
      });

      // Also pick up unconnected grandparents
      draft.nodes.forEach(function (n) {
        if (!_usedGpIds[n.id] && _scaffoldEffectiveRole(n) === "grandparent" && gpNodes.length < 2) {
          gpNodes.push(n);
          _usedGpIds[n.id] = true;
        }
      });

      gpNodes.forEach(function (gn) {
        var ggpIds = _scaffoldFindParentsOf(draft, gn.id);
        var ggpNodes = ggpIds.map(function (id) { return draft.nodes.find(function (n) { return n.id === id; }); }).filter(Boolean);
        pEntry.grandparents.push({ node: gn, greatGrandparents: ggpNodes.map(function (ggn) { return { node: ggn }; }) });
      });

      tree.parents.push(pEntry);
    });

    // Siblings, spouses, children
    draft.nodes.forEach(function (n) {
      if (n.id === narrator.id) return;
      if (n.role === "sibling") tree.siblings.push(n);
      else if (n.role === "spouse") tree.spouses.push(n);
      else if (n.role === "child") tree.children.push(n);
    });

    return tree;
  }

  function _scaffoldNodeHtml(nodeOrNull, gen) {
    var color = _SCAFFOLD_GEN_COLORS[gen] || "#94a3b8";
    if (!nodeOrNull) {
      return '<div class="scaffold-node scaffold-empty" style="border-color:' + color + ';">'
        + '<div class="scaffold-node-name">?</div>'
        + '<div class="scaffold-node-meta">' + _SCAFFOLD_GEN_LABELS[gen] + '</div>'
        + '</div>';
    }
    var n = nodeOrNull;
    var name = _ftNodeDisplayName(n);
    var years = "";
    if (n.birthYear) {
      years = n.birthYear;
      if (n.deathYear) years += "\u2013" + n.deathYear;
    }
    return '<div class="scaffold-node" style="border-color:' + color + ';" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">'
      + '<div class="scaffold-node-name">' + _esc(name) + '</div>'
      + (years ? '<div class="scaffold-node-years">' + _esc(years) + '</div>' : '')
      + '<div class="scaffold-node-meta">' + _esc(n.role || "") + '</div>'
      + '</div>';
  }

  function _renderFTScaffold(pid) {
    var draft = _ftDraft(pid);
    var tree = _scaffoldBuildTree(draft);
    if (!tree.node) return '<div class="ft-graph-empty">No narrator node found. Add one to see the scaffold view.</div>';

    var html = '<div class="scaffold-wrap">';

    // Great-grandparents row
    var allGGPs = [];
    tree.parents.forEach(function (p) {
      p.grandparents.forEach(function (gp) {
        (gp.greatGrandparents || []).forEach(function (ggp) {
          allGGPs.push(ggp);
        });
      });
    });

    var _eRole = _scaffoldEffectiveRole;

    if (allGGPs.length) {
      html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[3] + '</div>';
      html += '<div class="scaffold-row scaffold-row-ggp">';
      allGGPs.forEach(function (ggp) {
        html += _scaffoldNodeHtml(ggp.node, 3);
      });
      html += '</div>';
    }

    // Grandparents row
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[2] + '</div>';
    html += '<div class="scaffold-row scaffold-row-gp">';
    tree.parents.forEach(function (p) {
      p.grandparents.forEach(function (gp) {
        html += _scaffoldNodeHtml(gp.node, 2);
      });
    });
    html += '</div>';

    // Parents row
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[1] + '</div>';
    html += '<div class="scaffold-row scaffold-row-parent">';
    tree.parents.forEach(function (p) {
      html += _scaffoldNodeHtml(p.node, 1);
    });
    html += '</div>';

    // Narrator row
    html += '<div class="scaffold-gen-label">' + _SCAFFOLD_GEN_LABELS[0] + '</div>';
    html += '<div class="scaffold-row scaffold-row-narrator">';
    html += _scaffoldNodeHtml(tree.node, 0);

    // Spouses alongside narrator
    tree.spouses.forEach(function (sp) {
      html += '<div class="scaffold-node" style="width:120px;border-color:#f472b6;" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + sp.id + '\')">'
        + '<div class="scaffold-node-name">' + _esc(_ftNodeDisplayName(sp)) + '</div>'
        + '<div class="scaffold-node-meta">spouse</div></div>';
    });
    html += '</div>';

    // Siblings row
    if (tree.siblings.length) {
      html += '<div class="scaffold-row scaffold-row-sibling">';
      tree.siblings.forEach(function (n) {
        var name = _ftNodeDisplayName(n);
        html += '<div class="scaffold-node" style="width:120px;border-color:#34d399;" onclick="window.LorevoxBioBuilder._ftEditNode(\'' + n.id + '\')">'
          + '<div class="scaffold-node-name">' + _esc(name) + '</div>'
          + '<div class="scaffold-node-meta">sibling</div></div>';
      });
      html += '</div>';
    }

    // Children row
    if (tree.children.length) {
      html += '<div class="scaffold-row scaffold-row-children">';
      tree.children.forEach(function (n) {
        html += _scaffoldNodeHtml(n, 0);
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ═══════════════════════════════════════════════════════════════
     DRAFT CONTEXT ACCESSORS (for integration — bio-review.js etc.)
  ═══════════════════════════════════════════════════════════════ */

  function _getDraftFTContext(pid) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var ft = _ftDraft(pid);
    return ft ? { nodes: ft.nodes, edges: ft.edges } : null;
  }

  function _getDraftFTContextForEra(pid, era) {
    pid = pid || _currentPersonId();
    if (!pid) return null;
    var ft = _ftDraft(pid);
    if (!ft) return null;

    if (!era) {
      var items = [];
      ft.nodes.forEach(function (n) {
        if (n.role === "narrator") return;
        items.push({ type: "ft_person", node: n, label: n.displayName || n.preferredName || n.label || "", role: n.role || "other", score: 0.5 });
      });
      return { primary: [], secondary: [], global: items, era: null };
    }

    var primary = [], secondary = [], global = [];
    var roleWeights = ERA_ROLE_RELEVANCE[era] || {};

    ft.nodes.forEach(function (n) {
      if (n.role === "narrator") return;
      var item = { type: "ft_person", node: n, label: n.displayName || n.preferredName || n.label || "", role: n.role || "other" };

      if (n.eraRelevance && n.eraRelevance.length > 0) {
        if (n.eraRelevance.indexOf(era) >= 0) { item.score = n.eraWeight || 0.9; primary.push(item); return; }
      }

      var roleScore = roleWeights[n.role] != null ? roleWeights[n.role] : 0.3;
      item.score = roleScore;
      if (roleScore >= 0.7) primary.push(item);
      else if (roleScore >= 0.3) secondary.push(item);
      else global.push(item);
    });

    var byScore = function (a, b) { return (b.score || 0) - (a.score || 0); };
    primary.sort(byScore);
    secondary.sort(byScore);

    return { primary: primary, secondary: secondary, global: global, era: era };
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE REGISTRATION
  ═══════════════════════════════════════════════════════════════ */

  var MOD = {
    // Constants
    FT_ROLES:              FT_ROLES,
    FT_REL_TYPES:          FT_REL_TYPES,
    FT_VIEW_MODES:         FT_VIEW_MODES,
    ERA_ROLE_RELEVANCE:    ERA_ROLE_RELEVANCE,
    ERA_THEME_KEYWORDS:    ERA_THEME_KEYWORDS,

    // Fuzzy matching
    _normalizeName:        _normalizeName,
    _fuzzyNameScore:       _fuzzyNameScore,
    _fuzzyDuplicateTier:   _fuzzyDuplicateTier,

    // Draft management
    _ftDraft:              _ftDraft,
    _ftMakeNode:           _ftMakeNode,
    _ftMakeEdge:           _ftMakeEdge,
    _ftNodeDisplayName:    _ftNodeDisplayName,

    // CRUD
    _ftAddNode:            _ftAddNode,
    _ftDeleteNode:         _ftDeleteNode,
    _ftEditNode:           _ftEditNode,
    _ftSaveNode:           _ftSaveNode,
    _ftAddEdge:            _ftAddEdge,
    _ftSaveEdge:           _ftSaveEdge,
    _ftDeleteEdge:         _ftDeleteEdge,

    // Seeding
    _ftSeedFromGraph:         _ftSeedFromGraph,
    _ftSeedFromProfile:       _ftSeedFromProfile,
    _ftSeedFromQuestionnaire: _ftSeedFromQuestionnaire,
    _ftSeedFromCandidates:    _ftSeedFromCandidates,

    // Quality
    _ftFindDuplicates:     _ftFindDuplicates,
    _ftFindUnconnected:    _ftFindUnconnected,
    _ftFindWeakNodes:      _ftFindWeakNodes,
    _ftFindUnsourced:      _ftFindUnsourced,
    _ftCleanOrphanEdges:   _ftCleanOrphanEdges,
    _ftFindFuzzyDuplicates: _ftFindFuzzyDuplicates,

    // Rendering
    _renderFamilyTreeTab:  _renderFamilyTreeTab,
    _renderFTGraph:        _renderFTGraph,
    _renderFTScaffold:     _renderFTScaffold,
    _toggleFTViewMode:     _toggleFTViewMode,

    // View mode state accessor
    _getFTViewMode:        function () { return _ftViewMode; },

    // Draft context
    _getDraftFTContext:       _getDraftFTContext,
    _getDraftFTContextForEra: _getDraftFTContextForEra,

    // Wiring (called by bio-builder.js)
    _setRenderCallback:    _setRenderCallback,
    _setSharedRenderers:   _setSharedRenderers
  };

  if (!window.LorevoxBioBuilderModules) window.LorevoxBioBuilderModules = {};
  window.LorevoxBioBuilderModules.familyTree = MOD;

})();
