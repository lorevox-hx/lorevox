/* ═══════════════════════════════════════════════════════════════
   bio-builder-core.js — Shared foundation for Bio Builder modules
   Lorevox 9.0 — Phase 1 module split

   Owns:
     - state initialization and access (_ensureState, _bb)
     - narrator-scoped state reset and switch logic
     - localStorage persistence helpers (FT, LT, QQ)
     - shared utility helpers
     - active view tracking state

   Does NOT own:
     - questionnaire field definitions or rendering
     - extraction engine
     - FT/LT feature logic
     - candidate shaping

   Exposes: window.LorevoxBioBuilderModules.core
   Load order: BEFORE all other bio-builder-*.js modules
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  window.LorevoxBioBuilderModules = window.LorevoxBioBuilderModules || {};

  /* ───────────────────────────────────────────────────────────
     STATE MODEL
     All Bio Builder state lives under state.bioBuilder.
     Scoped per narrator by personId.
     Never touches: state.archive, state.facts, state.timeline.
  ─────────────────────────────────────────────────────────── */

  function _ensureState() {
    if (typeof state === "undefined") return null;
    if (!state.bioBuilder) {
      state.bioBuilder = {
        personId:      null,
        quickItems:    [],   // [{id, text, type, ts}]  type: "fact"|"note"
        questionnaire: {},   // {sectionId: data}
        graph: { persons: {}, relationships: {} },  // Phase Q.1: canonical relationship graph
        sourceCards:   [],   // [{id, filename, fileSize, sourceType, ts, status,
                             //   extractedText, pastedText, detectedItems,
                             //   addedCandidateIds}]
                             //   status: "extracting"|"extracted"|"manual-only"|"failed"
        candidates: {
          people:        [],
          relationships: [],
          events:        [],
          memories:      [],
          places:        [],
          documents:     []
        }
      };
    }
    return state.bioBuilder;
  }

  function _bb() { return _ensureState(); }

  /* ───────────────────────────────────────────────────────────
     PERSISTENCE (v4+)
     Persist FT/LT/QQ drafts to localStorage per narrator.
     Keys: lorevox_ft_draft_{pid}, lorevox_lt_draft_{pid},
           lorevox_qq_draft_{pid}
     Schema version stamp for forward compat.
  ─────────────────────────────────────────────────────────── */

  var DRAFT_SCHEMA_VERSION = 1;
  var _LS_FT_PREFIX    = "lorevox_ft_draft_";
  var _LS_LT_PREFIX    = "lorevox_lt_draft_";
  var _LS_QQ_PREFIX    = "lorevox_qq_draft_";
  var _LS_QC_PREFIX    = "lorevox_qc_draft_";
  var _LS_DRAFT_INDEX  = "lorevox_draft_pids";

  function _persistDrafts(pid) {
    if (!pid) return;
    var bb = _bb(); if (!bb) return;
    try {
      var ft = bb.familyTreeDraftsByPerson && bb.familyTreeDraftsByPerson[pid];
      var lt = bb.lifeThreadsDraftsByPerson && bb.lifeThreadsDraftsByPerson[pid];
      if (ft) localStorage.setItem(_LS_FT_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: ft }));
      if (lt) localStorage.setItem(_LS_LT_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: lt }));
      // Phase G: persist questionnaire to BACKEND (canonical authority)
      // FT/LT stay in localStorage; QQ goes backend-first with localStorage as transient fallback.
      if (pid === bb.personId) {
        var qq = bb.questionnaire;
        if (qq && Object.keys(qq).length > 0) {
          // Backend canonical save (fire-and-forget, non-blocking)
          try {
            fetch(API.BB_QQ_PUT, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ person_id: pid, questionnaire: qq, source: "ui_save", version: DRAFT_SCHEMA_VERSION })
            }).catch(function(e) { console.warn("[bb-core] Backend QQ persist failed", e); });
          } catch (e) {}
          // Transient localStorage fallback
          localStorage.setItem(_LS_QQ_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: qq }));
        }
      }
      // Phase M: persist Quick Capture inbox
      if (pid === bb.personId && bb.quickItems && bb.quickItems.length > 0) {
        localStorage.setItem(_LS_QC_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: bb.quickItems }));
      }
      // Track which pids have drafts
      var idx = _getDraftIndex();
      if (idx.indexOf(pid) < 0) {
        idx.push(pid);
        localStorage.setItem(_LS_DRAFT_INDEX, JSON.stringify(idx));
      }
    } catch (e) {
      // localStorage full or unavailable — degrade silently
    }
  }

  function _loadDrafts(pid) {
    if (!pid) return;
    var bb = _bb(); if (!bb) return;
    if (!bb.familyTreeDraftsByPerson) bb.familyTreeDraftsByPerson = {};
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};
    // Phase M: restore Quick Capture inbox
    try {
      var qcRaw = localStorage.getItem(_LS_QC_PREFIX + pid);
      if (qcRaw) {
        var qcObj = JSON.parse(qcRaw);
        var qcD = qcObj && (qcObj.d || qcObj.data);
        if (qcD && Array.isArray(qcD) && qcD.length > 0) {
          bb.quickItems = qcD;
          console.log("[bb-core] ✅ Restored " + qcD.length + " Quick Capture items for " + pid.slice(0, 8));
        }
      }
    } catch (e) {
      console.warn("[bb-core] QC restore error for pid=" + pid, e);
    }
    // v8-fix: load questionnaire via canonical restore helper (Phase 1.1)
    _restoreQuestionnaire(pid);
    // Don't overwrite FT/LT if already in memory
    if (bb.familyTreeDraftsByPerson[pid] && bb.familyTreeDraftsByPerson[pid].nodes && bb.familyTreeDraftsByPerson[pid].nodes.length) return;
    try {
      var ftRaw = localStorage.getItem(_LS_FT_PREFIX + pid);
      if (ftRaw) {
        var ftObj = JSON.parse(ftRaw);
        var ftD = ftObj && (ftObj.d || ftObj.data);
        if (ftD && Array.isArray(ftD.nodes)) {
          bb.familyTreeDraftsByPerson[pid] = ftD;
        }
      }
      var ltRaw = localStorage.getItem(_LS_LT_PREFIX + pid);
      if (ltRaw) {
        var ltObj = JSON.parse(ltRaw);
        var ltD = ltObj && (ltObj.d || ltObj.data);
        if (ltD && Array.isArray(ltD.nodes)) {
          bb.lifeThreadsDraftsByPerson[pid] = ltD;
        }
      }
    } catch (e) {
      // Malformed data — ignore, let lazy init create fresh
    }
  }

  /* ── Phase L.1: Rehydrate candidates from questionnaire ────
     After narrator switch restores the questionnaire, re-run
     candidate extraction so the Candidates tab is never empty
     for a narrator that has questionnaire data.
     Idempotent — extraction dedup prevents doubling.
  ─────────────────────────────────────────────────────────── */
  function _rehydrateCandidates(pid) {
    var bb = _bb(); if (!bb) return;
    var qq = bb.questionnaire;
    if (!qq || Object.keys(qq).length === 0) return;

    var qqMod = window.LorevoxBioBuilderModules &&
                window.LorevoxBioBuilderModules.questionnaire;
    if (!qqMod || typeof qqMod._extractQuestionnaireCandidates !== "function") {
      console.log("[bb-core] Questionnaire module not loaded — skipping candidate rehydration");
      return;
    }

    // Ensure fresh candidate container
    if (!bb.candidates || !bb.candidates.people) {
      bb.candidates = {
        people: [], relationships: [], events: [],
        memories: [], places: [], documents: []
      };
    }

    // Phase Q+: added spouse to candidate rehydration pipeline
    var sections = ["parents", "grandparents", "siblings", "children", "spouse", "earlyMemories"];
    var before = bb.candidates.people.length + bb.candidates.relationships.length + bb.candidates.memories.length;
    sections.forEach(function (s) {
      if (qq[s]) qqMod._extractQuestionnaireCandidates(s);
    });
    var after = bb.candidates.people.length + bb.candidates.relationships.length + bb.candidates.memories.length;
    if (after > before) {
      console.log("[bb-core] ✅ Rehydrated " + (after - before) + " QQ candidates for " + pid);
    }

    // Phase M: also rehydrate candidates from persisted Quick Capture items
    var qcMod = window.LorevoxBioBuilderModules &&
                window.LorevoxBioBuilderModules._qcPipeline;
    if (qcMod && typeof qcMod.rehydrateQCCandidates === "function") {
      qcMod.rehydrateQCCandidates(bb);
    }
  }

  function _getDraftIndex() {
    try {
      var raw = localStorage.getItem(_LS_DRAFT_INDEX);
      if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
    } catch (e) {}
    return [];
  }

  function _clearDrafts(pid) {
    if (!pid) return;
    try {
      localStorage.removeItem(_LS_FT_PREFIX + pid);
      localStorage.removeItem(_LS_LT_PREFIX + pid);
      localStorage.removeItem(_LS_QQ_PREFIX + pid);
      localStorage.removeItem(_LS_QC_PREFIX + pid);
      var idx = _getDraftIndex().filter(function (p) { return p !== pid; });
      localStorage.setItem(_LS_DRAFT_INDEX, JSON.stringify(idx));
    } catch (e) {}
  }

  /* ── Phase G: Canonical questionnaire restore helper ─────────
     Single restore path for narrator-scoped questionnaire state.
     Backend is the authority; localStorage is transient fallback only.
     Returns the restored object.
     MUST be the only path that reads qq.
  ─────────────────────────────────────────────────────────── */
  function _restoreQuestionnaire(pid) {
    var bb = _bb(); if (!bb) return {};
    if (!pid) { bb.questionnaire = {}; return bb.questionnaire; }

    // Phase G: Try backend first (async, fire-and-forget for sync callers)
    // The backend load is async so we start it and also load localStorage
    // as immediate fallback. When backend responds it overwrites if non-empty.
    _restoreQuestionnaireFromBackend(pid);

    // Immediate: read transient localStorage draft
    try {
      var raw = localStorage.getItem(_LS_QQ_PREFIX + pid);
      if (raw) {
        var parsed = JSON.parse(raw);
        var d = parsed && (parsed.d || parsed.data);
        // Guard against double-wrapped drafts: { v, d: { v, d: {sections} } }
        // If d looks like another envelope (has .v and .d), unwrap one more level
        if (d && typeof d === "object" && d.v !== undefined && d.d && typeof d.d === "object") {
          console.warn("[bb-core] Unwrapping double-wrapped localStorage draft for pid=" + pid);
          d = d.d;
          // Fix the localStorage so it doesn't happen again
          localStorage.setItem(_LS_QQ_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: d }));
        }
        if (d && typeof d === "object") {
          bb.questionnaire = d;
          _qqDebugSnapshot("restore_ls", pid, bb);
          return bb.questionnaire;
        }
      }
    } catch (e) {
      console.warn("[bb-core] _restoreQuestionnaire parse error for pid=" + pid, e);
    }
    // Fallback: keep current if non-empty, else reset
    if (!bb.questionnaire || Object.keys(bb.questionnaire).length === 0) {
      bb.questionnaire = {};
    }
    _qqDebugSnapshot("restore_fallback", pid, bb);
    return bb.questionnaire;
  }

  /* ── Phase G: Backend questionnaire restore (async) ────────
     Fetches canonical QQ from backend and overwrites in-memory
     state if the backend has data. Non-blocking.
  ─────────────────────────────────────────────────────────── */
  function _restoreQuestionnaireFromBackend(pid) {
    if (!pid || typeof API === "undefined" || !API.BB_QQ_GET) return;
    fetch(API.BB_QQ_GET(pid))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.questionnaire) return;
        var q = j.questionnaire;
        if (typeof q === "object" && Object.keys(q).length > 0) {
          var bb = _bb(); if (!bb) return;
          // Unwrap { v, d } envelope if present — backend stores { v:1, d:{sections} }
          // but bb.questionnaire expects flat sections { personal:{}, parents:[], ... }
          var sections = (q.d && typeof q.d === "object" && !Array.isArray(q.d)) ? q.d : q;
          // Only overwrite if backend has data (backend authority rule)
          bb.questionnaire = sections;
          _qqDebugSnapshot("restore_backend", pid, bb);
          console.log("[bb-core] ✅ Questionnaire restored from backend for " + pid);
          // Update transient localStorage to match backend (wrap in { v, d } for localStorage format)
          try {
            localStorage.setItem(_LS_QQ_PREFIX + pid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: sections }));
          } catch (e) {}
        }
      })
      .catch(function (e) {
        console.warn("[bb-core] Backend QQ restore failed (using localStorage fallback)", e);
      });
  }

  /* ── Phase 2.5: Questionnaire debug snapshot helper ────────
     Emits a compact console log showing in-memory vs persisted
     section counts. Active in dev mode (localhost or ?debug).
  ─────────────────────────────────────────────────────────── */
  var _qqDebugEnabled = (function () {
    try {
      var loc = window.location;
      return loc.hostname === "localhost" || loc.hostname === "127.0.0.1"
        || (loc.search && loc.search.indexOf("debug") >= 0);
    } catch (_) { return false; }
  })();

  function _qqDebugSnapshot(action, pid, bb) {
    if (!_qqDebugEnabled) return;
    if (!bb) bb = _bb();
    if (!bb) return;

    // Count in-memory sections
    var memCounts = {};
    var q = bb.questionnaire || {};
    Object.keys(q).forEach(function (k) {
      var v = q[k];
      memCounts[k] = Array.isArray(v) ? v.length : (v && typeof v === "object" ? Object.keys(v).filter(function (fk) { return v[fk] && String(v[fk]).trim(); }).length : 0);
    });

    // Count persisted sections
    var persCounts = {};
    try {
      var raw = localStorage.getItem(_LS_QQ_PREFIX + (pid || ""));
      if (raw) {
        var parsed = JSON.parse(raw);
        var d = parsed && (parsed.d || parsed.data);
        if (d && typeof d === "object") {
          Object.keys(d).forEach(function (k) {
            var v = d[k];
            persCounts[k] = Array.isArray(v) ? v.length : (v && typeof v === "object" ? Object.keys(v).filter(function (fk) { return v[fk] && String(v[fk]).trim(); }).length : 0);
          });
        }
      }
    } catch (_) {}

    console.log("[bb-debug] %c" + action, "color:#6366f1;font-weight:bold", {
      ts: new Date().toISOString().slice(11, 23),
      pid: (pid || "none").slice(0, 8),
      mem: memCounts,
      disk: persCounts,
      section: (_viewState && _viewState.activeSection) || null
    });

    // Phase 2.5.2: Mismatch warning
    var memKeys = Object.keys(memCounts).sort().join(",");
    var persKeys = Object.keys(persCounts).sort().join(",");
    if (memKeys !== persKeys) {
      console.warn("[bb-drift] KEY MISMATCH after '" + action + "': mem=[" + memKeys + "] disk=[" + persKeys + "]");
    } else {
      Object.keys(memCounts).forEach(function (k) {
        if (memCounts[k] !== persCounts[k]) {
          console.warn("[bb-drift] COUNT MISMATCH '" + k + "' after '" + action + "': mem=" + memCounts[k] + " disk=" + persCounts[k]);
        }
      });
    }
  }

  /* ── v8 Narrator-switch hard reset ─────────────────────────
     Called from app.js lvxSwitchNarratorSafe() BEFORE profile
     hydration.  Runs even when Bio Builder popover is closed.
  ─────────────────────────────────────────────────────────── */
  function _resetNarratorScopedState(newId) {
    var bb = _bb(); if (!bb) return;

    // v8-fix: persist outgoing narrator's questionnaire before clearing (WD-1 fix)
    // Phase M: also persists Quick Capture inbox
    var outgoingPid = bb.personId;
    if (outgoingPid) {
      // Persist QC inbox for outgoing narrator (even if QQ is empty)
      if (bb.quickItems && bb.quickItems.length > 0) {
        try { localStorage.setItem(_LS_QC_PREFIX + outgoingPid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: bb.quickItems })); } catch (e) {}
      }
      if (bb.questionnaire && Object.keys(bb.questionnaire).length > 0) {
        _persistDrafts(outgoingPid);
      }
    }

    bb.personId      = newId || null;
    bb.quickItems    = [];
    bb.questionnaire = {};
    bb.graph         = { persons: {}, relationships: {} };  // Phase Q.1
    bb.sourceCards   = [];
    bb.candidates    = {
      people: [], relationships: [], events: [], memories: [], places: [], documents: []
    };

    if (!bb.familyTreeDraftsByPerson)  bb.familyTreeDraftsByPerson  = {};
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};

    // v8-fix: restore incoming narrator's questionnaire from localStorage (WD-1 fix)
    _loadDrafts(newId);

    // Phase L.1: rehydrate candidates from restored questionnaire
    _rehydrateCandidates(newId);
  }

  /* ── v8 Explicit narrator-switch entry point ───────────────
     Called from app.js after loadPerson() completes.
     Resets narrator-scoped state, then re-hydrates from the
     newly loaded profile.
     NOTE: _hydrateQuestionnaireFromProfile lives in the questionnaire
     module. The core module calls it via the registered hook.
  ─────────────────────────────────────────────────────────── */

  // Hook: questionnaire module registers its hydration function here
  var _postSwitchHooks = [];

  function _registerPostSwitchHook(fn) {
    _postSwitchHooks.push(fn);
  }

  function _onNarratorSwitch(newId) {
    var bb = _bb(); if (!bb) return;
    _resetNarratorScopedState(newId);
    // Run registered hooks (e.g. questionnaire hydration)
    _postSwitchHooks.forEach(function (fn) { fn(bb); });
    // Phase 2.5.3: Narrator-switch drift validation
    _qqDebugSnapshot("narrator_switch", newId, bb);
  }

  /* ── Person-change logic (called from render path) ──────── */
  function _personChanged(newId) {
    var bb = _bb(); if (!bb) return;
    if (bb.personId !== newId) {
      // v8-fix: persist outgoing narrator's questionnaire before clearing
      // Phase M: also persists Quick Capture inbox
      var outgoingPid = bb.personId;
      if (outgoingPid) {
        if (bb.quickItems && bb.quickItems.length > 0) {
          try { localStorage.setItem(_LS_QC_PREFIX + outgoingPid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: bb.quickItems })); } catch (e) {}
        }
        if (bb.questionnaire && Object.keys(bb.questionnaire).length > 0) {
          _persistDrafts(outgoingPid);
        }
      }
      bb.personId      = newId;
      bb.quickItems    = [];
      bb.questionnaire = {};
      bb.graph         = { persons: {}, relationships: {} };  // Phase Q.1
      bb.sourceCards   = [];
      bb.candidates    = {
        people: [], relationships: [], events: [], memories: [], places: [], documents: []
      };
    }
    // v3: ensure per-person draft containers exist (lazy — never reset on switch)
    if (!bb.familyTreeDraftsByPerson)  bb.familyTreeDraftsByPerson  = {};
    if (!bb.lifeThreadsDraftsByPerson) bb.lifeThreadsDraftsByPerson = {};
    // v4: restore persisted drafts for this narrator
    _loadDrafts(newId);
    // v6-fix: hydrate questionnaire from active profile if empty
    _postSwitchHooks.forEach(function (fn) { fn(bb); });
    // Phase L.1: rehydrate candidates from restored questionnaire
    _rehydrateCandidates(newId);
    // Phase 2.5: debug snapshot after person change
    _qqDebugSnapshot("person_changed", newId, bb);
  }

  /* ───────────────────────────────────────────────────────────
     UTILITIES
  ─────────────────────────────────────────────────────────── */

  function _el(id) { return document.getElementById(id); }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function _currentPersonId() {
    try { return (typeof state !== "undefined" && state.person_id) ? state.person_id : null; }
    catch (_) { return null; }
  }

  function _currentPersonName() {
    try {
      if (typeof state !== "undefined" && state.profile && state.profile.basics) {
        return state.profile.basics.preferredName || state.profile.basics.fullName || null;
      }
    } catch (_) {}
    return null;
  }

  function _esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function _formatBytes(bytes) {
    if (!bytes) return "";
    if (bytes < 1024)       return bytes + " B";
    if (bytes < 1048576)    return Math.round(bytes / 1024) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  /* ── v7: Inline confirmation dialog (replaces native confirm()) ── */
  function _showInlineConfirm(message, onConfirm) {
    var existing = document.getElementById("bbInlineConfirm");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "bbInlineConfirm";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:99999;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:8px;padding:20px 24px;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;font-family:inherit;";
    box.innerHTML = '<p style="margin:0 0 16px;font-size:14px;color:#1e293b;">' + message + '</p>'
      + '<div style="display:flex;gap:8px;justify-content:center;">'
      + '<button id="bbConfirmCancel" style="padding:6px 16px;border:1px solid #e2e8f0;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">Cancel</button>'
      + '<button id="bbConfirmOk" style="padding:6px 16px;border:none;border-radius:4px;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;">Delete</button>'
      + '</div>';
    overlay.appendChild(box);
    // Append inside the popover (top layer) so overlay is visible above it
    var popover = document.getElementById("bioBuilderPopover");
    (popover || document.body).appendChild(overlay);
    document.getElementById("bbConfirmCancel").onclick = function () { overlay.remove(); };
    document.getElementById("bbConfirmOk").onclick = function () { overlay.remove(); onConfirm(); };
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  }

  function _emptyStateHtml(title, message, actions) {
    var actionsHtml = (actions || []).map(function (a) {
      return '<button class="bb-ghost-btn" onclick="' + a.action + '">' + _esc(a.label) + '</button>';
    }).join("");
    return '<div class="bb-empty-state">'
      + '<div class="bb-empty-title">' + _esc(title) + '</div>'
      + '<div class="bb-empty-message">' + _esc(message) + '</div>'
      + (actionsHtml ? '<div class="bb-empty-actions">' + actionsHtml + '</div>' : '')
      + '</div>';
  }

  /* Check if an object has any non-empty string values */
  function _hasAnyValue(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (Array.isArray(obj)) return obj.length > 0;
    return Object.keys(obj).some(function (k) {
      var v = obj[k];
      return v && String(v).trim() !== "";
    });
  }

  /* ───────────────────────────────────────────────────────────
     ACTIVE VIEW TRACKING
  ─────────────────────────────────────────────────────────── */

  var _viewState = {
    activeSection:      null,
    activeTab:          "capture",
    activeSourceCardId: null,
    ftViewMode:         "cards",
    ltViewMode:         "cards"
  };

  /* ───────────────────────────────────────────────────────────
     EXPORT MODULE
  ─────────────────────────────────────────────────────────── */

  window.LorevoxBioBuilderModules.core = {
    // State access
    _ensureState:             _ensureState,
    _bb:                      _bb,

    // Narrator scoping
    _resetNarratorScopedState: _resetNarratorScopedState,
    _onNarratorSwitch:         _onNarratorSwitch,
    _personChanged:            _personChanged,
    _registerPostSwitchHook:   _registerPostSwitchHook,

    // Persistence
    DRAFT_SCHEMA_VERSION:     DRAFT_SCHEMA_VERSION,
    _LS_FT_PREFIX:            _LS_FT_PREFIX,
    _LS_LT_PREFIX:            _LS_LT_PREFIX,
    _LS_QQ_PREFIX:            _LS_QQ_PREFIX,
    _LS_QC_PREFIX:            _LS_QC_PREFIX,
    _LS_DRAFT_INDEX:          _LS_DRAFT_INDEX,
    _persistDrafts:           _persistDrafts,
    _loadDrafts:              _loadDrafts,
    _clearDrafts:             _clearDrafts,
    _getDraftIndex:           _getDraftIndex,
    _restoreQuestionnaire:    _restoreQuestionnaire,

    // Debug / drift detection (Phase 2.5)
    _qqDebugSnapshot:         _qqDebugSnapshot,

    // Utilities
    _el:                      _el,
    _uid:                     _uid,
    _esc:                     _esc,
    _currentPersonId:         _currentPersonId,
    _currentPersonName:       _currentPersonName,
    _formatBytes:             _formatBytes,
    _showInlineConfirm:       _showInlineConfirm,
    _emptyStateHtml:          _emptyStateHtml,
    _hasAnyValue:             _hasAnyValue,

    // View state (shared mutable object — submodules read/write directly)
    _viewState:               _viewState
  };

})();
