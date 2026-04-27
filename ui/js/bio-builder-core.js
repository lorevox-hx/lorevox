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

  /* ── BUG-208: Narrator-switch generation counter ─────────────
     Every reset/personChanged increments this.  Async restores stamp
     the value at call-time and verify it before applying — defends
     against a slow Christopher backend response landing AFTER a switch
     to Corky and overwriting Corky's questionnaire blob.
  ─────────────────────────────────────────────────────────── */
  var _narratorSwitchGen = 0;
  function _currentSwitchGen() { return _narratorSwitchGen; }

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
      // BUG-208: Hard-stop if the requested pid does not match the active
      // narrator — never cross-write one narrator's blob under another's id.
      if (pid !== bb.personId) {
        console.warn("[bb-drift] _persistDrafts BLOCKED: pid=" + (pid || "").slice(0, 8) +
          " !== bb.personId=" + ((bb.personId || "").slice(0, 8) || "null") +
          " — refusing to persist to avoid cross-narrator contamination");
      } else {
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

     BUG-208: Stamps the narrator-switch generation + requested pid
     at call-time.  When the response resolves, three guards must all
     hold before the response is applied:
       (a) the switch generation hasn't advanced (no narrator switch
           happened during the in-flight request),
       (b) bb.personId still equals the requested pid,
       (c) the backend response's person_id field equals the requested pid.
     If any guard fails, log [bb-drift] and discard the response.
  ─────────────────────────────────────────────────────────── */
  function _restoreQuestionnaireFromBackend(pid) {
    if (!pid || typeof API === "undefined" || !API.BB_QQ_GET) return;
    var stampedGen = _narratorSwitchGen;
    var stampedPid = pid;
    fetch(API.BB_QQ_GET(pid))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        var bb = _bb(); if (!bb) return;
        // Guard A: switch generation
        if (_narratorSwitchGen !== stampedGen) {
          console.warn("[bb-drift] backend QQ response DISCARDED: narrator switch happened during fetch " +
            "(stampedGen=" + stampedGen + " currentGen=" + _narratorSwitchGen + " stampedPid=" +
            stampedPid.slice(0, 8) + ")");
          return;
        }
        // Guard B: in-memory pid
        if (bb.personId !== stampedPid) {
          console.warn("[bb-drift] backend QQ response DISCARDED: bb.personId moved during fetch " +
            "(stampedPid=" + stampedPid.slice(0, 8) + " bb.personId=" +
            ((bb.personId || "").slice(0, 8) || "null") + ")");
          return;
        }
        // Guard C: backend echoed person_id matches request
        if (j.person_id && j.person_id !== stampedPid) {
          console.warn("[bb-drift] backend QQ response DISCARDED: response.person_id mismatch " +
            "(requested=" + stampedPid.slice(0, 8) + " response=" + (j.person_id || "").slice(0, 8) + ")");
          return;
        }
        if (!j.questionnaire) return;
        var q = j.questionnaire;
        if (typeof q === "object" && Object.keys(q).length > 0) {
          // Unwrap { v, d } envelope if present — backend stores { v:1, d:{sections} }
          // but bb.questionnaire expects flat sections { personal:{}, parents:[], ... }
          var sections = (q.d && typeof q.d === "object" && !Array.isArray(q.d)) ? q.d : q;
          // Only overwrite if backend has data (backend authority rule)
          bb.questionnaire = sections;
          _qqDebugSnapshot("restore_backend", stampedPid, bb);
          console.log("[bb-core] ✅ Questionnaire restored from backend for " + stampedPid.slice(0, 8));
          // Update transient localStorage to match backend (wrap in { v, d } for localStorage format)
          try {
            localStorage.setItem(_LS_QQ_PREFIX + stampedPid, JSON.stringify({ v: DRAFT_SCHEMA_VERSION, d: sections }));
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

    // BUG-208: bump generation FIRST so any in-flight async restores stamped
    // under the OLD pid see a stale generation when they resolve and discard.
    _narratorSwitchGen += 1;

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

  /* ── BUG-226: Identity intake → Bio Builder questionnaire sync ──
     Called from app.js identity onboarding handlers (askName / askDob /
     askBirthplace) whenever the canonical identity captures land in
     state.profile.basics.  Mirrors the captures into
     bb.questionnaire.personal under the canonical MINIMAL_SECTIONS
     schema (camelCase: fullName / preferredName / dateOfBirth /
     placeOfBirth) so that Bio Builder reflects what Lori already knows
     instead of asking again.  Persists via the canonical _persistDrafts
     path (backend PUT + transient localStorage).
     Idempotent: only fills empty fields, never overwrites operator-edited values.
  ─────────────────────────────────────────────────────────── */
  function _syncIdentityToBB(profile) {
    var bb = _bb(); if (!bb) return false;
    var basics = (profile && profile.basics) || profile || {};
    if (!basics || typeof basics !== "object") return false;

    var pid = bb.personId || _currentPersonId();
    if (!pid) {
      console.warn("[bb-sync] _syncIdentityToBB: no active narrator pid — skipping");
      return false;
    }
    // Scope guard — never write under the wrong narrator
    if (bb.personId && bb.personId !== pid) {
      console.warn("[bb-sync] _syncIdentityToBB BLOCKED: bb.personId=" +
        (bb.personId || "").slice(0, 8) + " !== pid=" + (pid || "").slice(0, 8));
      return false;
    }

    if (!bb.questionnaire) bb.questionnaire = {};
    if (!bb.questionnaire.personal || typeof bb.questionnaire.personal !== "object") {
      bb.questionnaire.personal = {};
    }
    var personal = bb.questionnaire.personal;

    // Accept either camelCase or legacy snake/lowercase shapes from state.profile.basics
    var fullName = basics.fullname || basics.fullName ||
                   basics.preferred || basics.preferredName || null;
    var dob      = basics.dob || basics.dateOfBirth || null;
    var pob      = basics.pob || basics.placeOfBirth || null;

    var changed = false;
    if (fullName && !personal.fullName)        { personal.fullName        = fullName; changed = true; }
    if (fullName && !personal.preferredName)   { personal.preferredName   = fullName; changed = true; }
    if (dob      && !personal.dateOfBirth)     { personal.dateOfBirth     = dob;      changed = true; }
    if (pob      && !personal.placeOfBirth)    { personal.placeOfBirth    = pob;      changed = true; }

    if (!changed) return false;

    console.log("[bb-sync] identity → questionnaire.personal " +
      JSON.stringify({ fullName: !!fullName, dob: !!dob, pob: !!pob }) +
      " for pid=" + pid.slice(0, 8));

    // Persist via canonical path (backend PUT + transient localStorage).
    // _persistDrafts gates on bb.personId === pid so this is scope-safe.
    try { _persistDrafts(pid); } catch (e) {
      console.warn("[bb-sync] _persistDrafts threw:", e);
    }

    return true;
  }

  /* ── Person-change logic (called from render path) ──────── */
  function _personChanged(newId) {
    var bb = _bb(); if (!bb) return;
    if (bb.personId !== newId) {
      // BUG-208: bump generation FIRST so any in-flight async restores
      // stamped under the OLD pid see a stale generation when they resolve.
      _narratorSwitchGen += 1;
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

  /* ── v7: Inline confirmation dialog (replaces native confirm()) ──
     Native popovers (popover="auto") render in the browser's top layer
     ABOVE position:fixed elements.  So if the caller is inside an open
     popover (e.g., Bug Panel), a fixed-position overlay appended to
     document.body will be hidden BEHIND the popover.
     Fix: detect the currently-open popover and append the overlay to
     it so it renders in the same top layer.  Falls back to bioBuilder
     popover or document.body. */
  function _showInlineConfirm(message, onConfirm) {
    var existing = document.getElementById("bbInlineConfirm");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "bbInlineConfirm";
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:2147483647;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:8px;padding:20px 24px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.35);text-align:center;font-family:inherit;color:#1e293b;";
    box.innerHTML = '<div style="margin:0 0 16px;font-size:14px;color:#1e293b;line-height:1.5;">' + message + '</div>'
      + '<div style="display:flex;gap:8px;justify-content:center;">'
      + '<button id="bbConfirmCancel" style="padding:8px 18px;border:1px solid #cbd5e1;border-radius:4px;background:#f1f5f9;color:#1e293b;cursor:pointer;font-size:13px;">Cancel</button>'
      + '<button id="bbConfirmOk" style="padding:8px 18px;border:none;border-radius:4px;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Delete</button>'
      + '</div>';
    overlay.appendChild(box);
    // Find the currently-open popover (top layer).  Native popover spec:
    // :popover-open matches any open popover.  Append the overlay to it
    // so the overlay renders in the same top-layer as the popover above
    // all page content.
    var openPopover = null;
    try { openPopover = document.querySelector('[popover]:popover-open'); } catch (_) {}
    var bioPopover = document.getElementById("bioBuilderPopover");
    var target = openPopover || bioPopover || document.body;
    target.appendChild(overlay);
    console.log("[bb-confirm-dialog] shown (target=" + (target.id || target.tagName) + ")");
    var doneCancel = function () { overlay.remove(); console.log("[bb-confirm-dialog] cancelled"); };
    var doneOk     = function () { overlay.remove(); console.log("[bb-confirm-dialog] confirmed → running onConfirm"); onConfirm(); };
    document.getElementById("bbConfirmCancel").onclick = doneCancel;
    document.getElementById("bbConfirmOk").onclick     = doneOk;
    overlay.onclick = function (e) { if (e.target === overlay) doneCancel(); };
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
     WO-BB-RESET-UTILITY-01 — Dev-only safety valve.
     Clears questionnaire / candidates / drafts / Quick Capture
     ONLY for the currently-active narrator.  Never touches another
     narrator's data.  Confirms via inline dialog before firing.
     Triggered from the Bug Panel button.
  ─────────────────────────────────────────────────────────── */
  function lvBbResetCurrentNarrator() {
    console.log("[bb-reset] button clicked — entering lvBbResetCurrentNarrator");
    var bb = _bb(); if (!bb) {
      console.warn("[bb-reset] ABORT — state.bioBuilder not initialized — nothing to reset");
      alert("Bio Builder state not initialized yet. Open the Bio Builder once or pick a narrator first.");
      return false;
    }
    var pid = bb.personId || _currentPersonId();
    if (!pid) {
      console.warn("[bb-reset] ABORT — no active narrator selected");
      alert("No active narrator selected. Pick a narrator first, then try again.");
      return false;
    }
    var name = _currentPersonName() || pid.slice(0, 8);
    // Pre-snapshot — counts of what's about to be cleared so the user can
    // see the reset DID something, even if the confirm dialog is hidden.
    var qq = bb.questionnaire || {};
    var qqSectionCount = Object.keys(qq).length;
    var qqFieldCount = 0;
    Object.keys(qq).forEach(function (sk) {
      var v = qq[sk];
      if (Array.isArray(v)) qqFieldCount += v.length;
      else if (v && typeof v === "object") qqFieldCount += Object.keys(v).filter(function (fk) { return v[fk] && String(v[fk]).trim(); }).length;
    });
    var candidateCount = 0;
    if (bb.candidates) {
      Object.keys(bb.candidates).forEach(function (k) {
        if (Array.isArray(bb.candidates[k])) candidateCount += bb.candidates[k].length;
      });
    }
    var qcCount = (bb.quickItems || []).length;
    console.log("[bb-reset] PRE-RESET snapshot for " + name + " (" + pid.slice(0,8) + "): " +
      qqSectionCount + " questionnaire section(s), " + qqFieldCount + " filled field(s), " +
      candidateCount + " candidate(s), " + qcCount + " quick-capture item(s)");
    _showInlineConfirm(
      "Reset Bio Builder data for <strong>" + _esc(name) + "</strong>?<br><br>" +
      "<div style='text-align:left;font-size:12px;color:#475569;'>" +
      "Will clear:<br>" +
      "&nbsp;&nbsp;• " + qqSectionCount + " questionnaire section(s) (" + qqFieldCount + " filled field" + (qqFieldCount === 1 ? "" : "s") + ")<br>" +
      "&nbsp;&nbsp;• " + candidateCount + " candidate" + (candidateCount === 1 ? "" : "s") + " across people / events / memories<br>" +
      "&nbsp;&nbsp;• " + qcCount + " Quick Capture item" + (qcCount === 1 ? "" : "s") + "<br>" +
      "&nbsp;&nbsp;• localStorage drafts for this narrator<br>" +
      "&nbsp;&nbsp;• Backend questionnaire blob (PUT empty)" +
      "</div>" +
      "<br><small>Other narrators are NOT affected. Cannot be undone.</small>",
      function () {
        // Bump generation to invalidate any in-flight async restores.
        _narratorSwitchGen += 1;
        // Clear in-memory state for active narrator only
        bb.quickItems    = [];
        bb.questionnaire = {};
        bb.graph         = { persons: {}, relationships: {} };
        bb.sourceCards   = [];
        bb.candidates    = {
          people: [], relationships: [], events: [], memories: [], places: [], documents: []
        };
        // Clear localStorage drafts for active narrator only
        try {
          localStorage.removeItem(_LS_FT_PREFIX + pid);
          localStorage.removeItem(_LS_LT_PREFIX + pid);
          localStorage.removeItem(_LS_QQ_PREFIX + pid);
          localStorage.removeItem(_LS_QC_PREFIX + pid);
          localStorage.removeItem(_LS_QC_PREFIX.replace("_qc_", "_qc_") + pid);
        } catch (e) {
          console.warn("[bb-reset] localStorage clear partial:", e);
        }
        // Best-effort backend wipe — PUT an empty questionnaire under this pid.
        // Backend echoes person_id; if mismatch, we don't write.
        if (typeof API !== "undefined" && API.BB_QQ_PUT) {
          try {
            fetch(API.BB_QQ_PUT, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                person_id: pid,
                questionnaire: {},
                source: "bb_reset_utility",
                version: DRAFT_SCHEMA_VERSION
              })
            }).catch(function (e) {
              console.warn("[bb-reset] backend wipe failed:", e);
            });
          } catch (e) {
            console.warn("[bb-reset] backend wipe threw:", e);
          }
        }
        console.log("[bb-reset] CLEARED for " + pid.slice(0, 8) + " (" + name + ") — was " +
          qqSectionCount + " section(s), " + qqFieldCount + " field(s), " +
          candidateCount + " candidate(s), " + qcCount + " QC item(s).");
        // Post-reset snapshot — confirms the wipe in console
        try {
          var bbAfter = _bb() || {};
          console.log("[bb-reset] POST-RESET snapshot:", {
            personId: bbAfter.personId,
            questionnaireSections: Object.keys(bbAfter.questionnaire || {}).length,
            candidates: bbAfter.candidates ? Object.values(bbAfter.candidates).reduce(function (s, a) { return s + (Array.isArray(a) ? a.length : 0); }, 0) : 0,
            quickItems: (bbAfter.quickItems || []).length,
          });
        } catch (_) {}
        // Update status line if Bug Panel is open
        var status = document.getElementById("lv10dBpBbResetStatus");
        if (status) {
          status.textContent = "✓ reset BB for " + name + " (" + pid.slice(0, 8) +
            ") — cleared " + qqFieldCount + " field(s), " + candidateCount + " candidate(s), at " +
            new Date().toLocaleTimeString();
        }
        // Visible top-of-viewport toast — operator sees success even when
        // the Bug Panel popover obscures the status line.  Append to the
        // currently-open popover so it renders in the same top layer.
        try {
          var openPopoverT = null;
          try { openPopoverT = document.querySelector('[popover]:popover-open'); } catch (_) {}
          var toast = document.createElement("div");
          toast.id = "bbResetToast";
          toast.style.cssText = "position:fixed;top:24px;left:50%;transform:translateX(-50%);" +
            "z-index:2147483647;background:#10b981;color:#fff;padding:14px 22px;border-radius:8px;" +
            "box-shadow:0 6px 24px rgba(0,0,0,0.35);font-size:14px;font-weight:600;font-family:inherit;" +
            "min-width:300px;text-align:center;line-height:1.4;";
          toast.innerHTML = "✓ Bio Builder reset for " + _esc(name) + "<br>" +
            "<span style='font-weight:400;font-size:12px;opacity:0.9;'>" +
            "cleared " + qqFieldCount + " field(s), " + candidateCount + " candidate(s), " +
            qcCount + " quick item(s)</span>";
          (openPopoverT || document.body).appendChild(toast);
          setTimeout(function () { try { toast.remove(); } catch (_) {} }, 8000);
        } catch (_) {}
      }
    );
    return true;
  }
  window.lvBbResetCurrentNarrator = lvBbResetCurrentNarrator;

  /* ───────────────────────────────────────────────────────────
     WO-DEEP-RESET — Dev/operator-only nuke for dirty narrator data.
     Extends the lvBbResetCurrentNarrator scope to ALSO clear the
     interview projection layer + state.profile family fields.

     Use case: Chris's runtime71.projection_family had pollution like
     "Stanley ND" as Father, "and dad" as Mother, dupe Janice rows —
     pre-existing data accumulated from old extraction errors.
     Reset BB clears the BB questionnaire blob but does NOT reach
     the projection layer; this reset does both.

     SCOPE — clears:
       1. Bio Builder substate (questionnaire / candidates / drafts /
          quick capture / family-graph) — same as lvBbResetCurrentNarrator
       2. localStorage drafts (FT / LT / QQ / QC) for active narrator
       3. interview projection (state.interviewProjection.fields +
          lorevox_proj_draft_<pid> localStorage key) via existing
          LorevoxProjectionSync.clearProjection(pid)
       4. state.profile.kinship + state.profile.pets (derived/polluted
          family rosters that might feed runtime71)
       5. Backend questionnaire blob (PUT empty)
       6. Backend projection (PUT empty fields)

     DOES NOT touch:
       - state.profile.basics (name/DOB/place — load-bearing for identity)
       - memory archive (transcripts + audio + meta.json + zips)
       - state.session (style, recordVoice, narrator-room state)
       - any OTHER narrator
       - WO-13 promoted truth pipeline (only the projection-derived view
         that feeds runtime71)
  ─────────────────────────────────────────────────────────── */
  function lvBbDeepResetCurrentNarrator() {
    console.log("[bb-deep-reset] button clicked — entering lvBbDeepResetCurrentNarrator");
    var bb = _bb(); if (!bb) {
      console.warn("[bb-deep-reset] ABORT — state.bioBuilder not initialized");
      alert("Bio Builder state not initialized. Pick a narrator first.");
      return false;
    }
    var pid = bb.personId || _currentPersonId();
    if (!pid) {
      console.warn("[bb-deep-reset] ABORT — no active narrator");
      alert("No active narrator selected. Pick a narrator first, then try again.");
      return false;
    }
    var name = _currentPersonName() || pid.slice(0, 8);

    // Pre-snapshot
    var qq = bb.questionnaire || {};
    var qqFieldCount = 0;
    Object.keys(qq).forEach(function (sk) {
      var v = qq[sk];
      if (Array.isArray(v)) qqFieldCount += v.length;
      else if (v && typeof v === "object") qqFieldCount += Object.keys(v).filter(function (fk) { return v[fk] && String(v[fk]).trim(); }).length;
    });
    var candidateCount = 0;
    if (bb.candidates) {
      Object.keys(bb.candidates).forEach(function (k) {
        if (Array.isArray(bb.candidates[k])) candidateCount += bb.candidates[k].length;
      });
    }
    // Projection field count
    var projFieldCount = 0;
    try {
      var iProj = (typeof state !== "undefined") ? state.interviewProjection : null;
      if (iProj && iProj.fields) projFieldCount = Object.keys(iProj.fields).length;
    } catch (_) {}
    // Kinship + pets count
    var kinshipCount = 0, petsCount = 0;
    try {
      var prof = (typeof state !== "undefined") ? state.profile : null;
      if (prof) {
        if (Array.isArray(prof.kinship)) kinshipCount = prof.kinship.length;
        if (Array.isArray(prof.pets))    petsCount    = prof.pets.length;
      }
    } catch (_) {}
    console.log("[bb-deep-reset] PRE-RESET snapshot for " + name + " (" + pid.slice(0, 8) + "): " +
      qqFieldCount + " BB field(s), " + candidateCount + " candidate(s), " +
      projFieldCount + " projection field(s), " + kinshipCount + " kinship row(s), " +
      petsCount + " pet(s)");

    _showInlineConfirm(
      "<strong style='color:#dc2626;'>Deep Reset</strong> for <strong>" + _esc(name) + "</strong>?<br><br>" +
      "<div style='text-align:left;font-size:12px;color:#475569;'>" +
      "Will clear:<br>" +
      "&nbsp;&nbsp;• " + qqFieldCount + " questionnaire field" + (qqFieldCount === 1 ? "" : "s") + "<br>" +
      "&nbsp;&nbsp;• " + candidateCount + " candidate" + (candidateCount === 1 ? "" : "s") + "<br>" +
      "&nbsp;&nbsp;• " + projFieldCount + " projection field" + (projFieldCount === 1 ? "" : "s") + " (the dirty parents/family roster)<br>" +
      "&nbsp;&nbsp;• " + kinshipCount + " kinship row" + (kinshipCount === 1 ? "" : "s") + "<br>" +
      "&nbsp;&nbsp;• " + petsCount + " pet" + (petsCount === 1 ? "" : "s") + "<br>" +
      "&nbsp;&nbsp;• localStorage QQ + projection draft<br>" +
      "&nbsp;&nbsp;• Backend questionnaire + projection blobs (PUT empty)" +
      "</div>" +
      "<br><strong style='color:#dc2626;'>Will NOT touch:</strong>" +
      "<div style='text-align:left;font-size:12px;color:#475569;'>" +
      "&nbsp;&nbsp;• Identity (name/DOB/place)<br>" +
      "&nbsp;&nbsp;• Memory archive (transcripts + audio + zips)<br>" +
      "&nbsp;&nbsp;• Session style + recordVoice toggle<br>" +
      "&nbsp;&nbsp;• Other narrators" +
      "</div>" +
      "<br><small>Other narrators are NOT affected. Cannot be undone.</small>",
      function () {
        // 1. Bump narrator-switch generation to invalidate any in-flight async
        _narratorSwitchGen += 1;

        // 2. Clear BB substate (in-memory)
        bb.quickItems    = [];
        bb.questionnaire = {};
        bb.graph         = { persons: {}, relationships: {} };
        bb.sourceCards   = [];
        bb.candidates    = {
          people: [], relationships: [], events: [], memories: [], places: [], documents: []
        };

        // 3. Clear projection layer via projection-sync's existing helper
        var projCleared = false;
        try {
          if (typeof LorevoxProjectionSync !== "undefined" && LorevoxProjectionSync.clearProjection) {
            LorevoxProjectionSync.clearProjection(pid);
            projCleared = true;
            console.log("[bb-deep-reset] LorevoxProjectionSync.clearProjection() called");
          } else {
            // Fallback: clear directly
            try { localStorage.removeItem("lorevox_proj_draft_" + pid); } catch (_) {}
            if (typeof state !== "undefined" && state.interviewProjection &&
                state.interviewProjection.personId === pid) {
              state.interviewProjection.fields = {};
              state.interviewProjection.pendingSuggestions = [];
              state.interviewProjection.syncLog = [];
            }
            projCleared = true;
            console.log("[bb-deep-reset] projection cleared via fallback path");
          }
        } catch (e) {
          console.warn("[bb-deep-reset] projection clear threw:", e && e.message || e);
        }

        // 4. Clear state.profile.kinship + pets (preserve basics — load-bearing for identity)
        var profileCleared = { kinship: 0, pets: 0 };
        try {
          if (typeof state !== "undefined" && state.profile) {
            if (Array.isArray(state.profile.kinship)) {
              profileCleared.kinship = state.profile.kinship.length;
              state.profile.kinship = [];
            }
            if (Array.isArray(state.profile.pets)) {
              profileCleared.pets = state.profile.pets.length;
              state.profile.pets = [];
            }
          }
        } catch (e) {
          console.warn("[bb-deep-reset] state.profile clear threw:", e);
        }

        // 5. Clear localStorage drafts (FT, LT, QQ, QC) for active narrator
        try {
          localStorage.removeItem(_LS_FT_PREFIX + pid);
          localStorage.removeItem(_LS_LT_PREFIX + pid);
          localStorage.removeItem(_LS_QQ_PREFIX + pid);
          localStorage.removeItem(_LS_QC_PREFIX + pid);
        } catch (e) {
          console.warn("[bb-deep-reset] localStorage clear partial:", e);
        }

        // 6. Backend QQ wipe (best-effort, fire-and-forget)
        if (typeof API !== "undefined" && API.BB_QQ_PUT) {
          try {
            fetch(API.BB_QQ_PUT, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                person_id: pid,
                questionnaire: {},
                source: "bb_deep_reset",
                version: DRAFT_SCHEMA_VERSION
              })
            }).then(function (r) {
              console.log("[bb-deep-reset] backend QQ wipe → " + r.status);
            }).catch(function (e) {
              console.warn("[bb-deep-reset] backend QQ wipe failed:", e);
            });
          } catch (e) { console.warn("[bb-deep-reset] backend QQ wipe threw:", e); }
        }

        // 7. Backend projection wipe (best-effort, fire-and-forget)
        if (typeof API !== "undefined" && API.IV_PROJ_PUT) {
          try {
            fetch(API.IV_PROJ_PUT, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                person_id: pid,
                fields: {},
                source: "bb_deep_reset",
                version: 1
              })
            }).then(function (r) {
              console.log("[bb-deep-reset] backend projection wipe → " + r.status);
            }).catch(function (e) {
              console.warn("[bb-deep-reset] backend projection wipe failed:", e);
            });
          } catch (e) { console.warn("[bb-deep-reset] backend projection wipe threw:", e); }
        }

        console.log("[bb-deep-reset] CLEARED for " + pid.slice(0, 8) + " (" + name + ") — was " +
          qqFieldCount + " BB fields, " + candidateCount + " candidates, " +
          projFieldCount + " projection fields, " + kinshipCount + " kinship rows, " +
          petsCount + " pets. projCleared=" + projCleared +
          " profileCleared=" + JSON.stringify(profileCleared));

        // Status line if Bug Panel is open
        var status = document.getElementById("lv10dBpDeepResetStatus");
        if (status) {
          status.textContent = "✓ deep reset for " + name + " (" + pid.slice(0, 8) +
            ") — cleared " + qqFieldCount + " BB + " + projFieldCount + " projection + " +
            kinshipCount + " kinship at " + new Date().toLocaleTimeString();
        }

        // Visible top-of-viewport toast
        try {
          var openPopoverT = null;
          try { openPopoverT = document.querySelector('[popover]:popover-open'); } catch (_) {}
          var toast = document.createElement("div");
          toast.id = "bbDeepResetToast";
          toast.style.cssText = "position:fixed;top:24px;left:50%;transform:translateX(-50%);" +
            "z-index:2147483647;background:#dc2626;color:#fff;padding:14px 22px;border-radius:8px;" +
            "box-shadow:0 6px 24px rgba(0,0,0,0.35);font-size:14px;font-weight:600;font-family:inherit;" +
            "min-width:340px;text-align:center;line-height:1.4;";
          toast.innerHTML = "✓ Deep Reset for " + _esc(name) + "<br>" +
            "<span style='font-weight:400;font-size:12px;opacity:0.95;'>" +
            "cleared " + qqFieldCount + " BB + " + projFieldCount + " projection + " +
            kinshipCount + " kinship row(s).<br>" +
            "Switch away/back or hard-refresh to verify runtime71.</span>";
          (openPopoverT || document.body).appendChild(toast);
          setTimeout(function () { try { toast.remove(); } catch (_) {} }, 10000);
        } catch (_) {}
      }
    );
    return true;
  }
  window.lvBbDeepResetCurrentNarrator = lvBbDeepResetCurrentNarrator;

  // BUG-226: expose identity → BB sync so app.js identity onboarding can call it
  // without depending on the LorevoxBioBuilderCore module export shape.
  window.lvBbSyncIdentity = function (profile) {
    try { return _syncIdentityToBB(profile); }
    catch (e) { console.warn("[bb-sync] lvBbSyncIdentity threw:", e); return false; }
  };

  /* ───────────────────────────────────────────────────────────
     BUG-228: RESET IDENTITY for current narrator

     Operational tool — wipes the polluted identity fields for the
     active narrator and re-opens identity onboarding.  Use when a
     narrator's bb.questionnaire.personal contains garbage from
     prior test sessions (refusal replies saved as fullName,
     wrong DOB, wrong birthplace, etc.) and the simple BUG-220A
     scope fix can't help because the data IS for this narrator.

     Scope (narrow on purpose):
       • bb.questionnaire.personal — wiped to {}
       • state.profile.basics.fullname / preferred / dob / pob — wiped
       • state.session.identityPhase — reset to "askName"
       • state.session.identityCapture — reset to fresh shape
       • backend BB QQ personal section — PUT empty
       • backend person row — PATCHed to clear date_of_birth + place_of_birth
       • identity onboarding — re-fired via startIdentityOnboarding()

     Out of scope:
       • Other narrators' data (not touched)
       • Memory archive (preserved — sessions stay intact)
       • Family tree, life threads, photos (preserved)
       • Other BB sections (parents, siblings) (preserved)
       • person_id (preserved — same narrator, just identity reset)
   ─────────────────────────────────────────────────────────── */
  function _setResetIdentityStatus(html) {
    try {
      const el = document.getElementById("lv10dBpResetIdentityStatus");
      if (el) el.innerHTML = html;
    } catch (_) {}
  }

  async function lvBbResetIdentityForCurrentNarrator() {
    const pid = (typeof state !== "undefined" && state.person_id) || null;
    if (!pid) {
      console.warn("[bb-reset-identity] ABORT — no active narrator");
      _setResetIdentityStatus('<span style="color:#f87171;">✗ FAIL — no narrator selected</span>');
      try { alert("No active narrator selected — pick a narrator first."); } catch (_) {}
      return false;
    }
    const bb = _bb();
    if (!bb || bb.personId !== pid) {
      console.warn("[bb-reset-identity] ABORT — bb.personId mismatch (bb=" +
        ((bb && bb.personId) || "null").slice(0, 8) + " state=" + pid.slice(0, 8) + ")");
      _setResetIdentityStatus('<span style="color:#f87171;">✗ FAIL — BB scope reconciling, try again</span>');
      try { alert("Bio Builder scope is reconciling — try again in a moment."); } catch (_) {}
      return false;
    }

    const currentName = (state.profile && state.profile.basics &&
      (state.profile.basics.preferred || state.profile.basics.fullname)) || "this narrator";

    // Confirm with the operator (popover-aware so it shows above bug panel).
    const ok = await _confirmIdentityReset(currentName, pid);
    if (!ok) {
      console.log("[bb-reset-identity] cancelled by operator");
      return false;
    }

    console.log("[bb-reset-identity] starting reset for pid=" + pid.slice(0, 8) +
      " name=" + currentName);

    // 1. Wipe in-memory bb.questionnaire.personal (preserve other sections).
    try {
      if (bb.questionnaire) bb.questionnaire.personal = {};
    } catch (e) { console.warn("[bb-reset-identity] bb wipe threw:", e); }

    // 2. Wipe state.profile.basics identity fields.
    try {
      if (state.profile && state.profile.basics) {
        delete state.profile.basics.fullname;
        delete state.profile.basics.fullName;
        delete state.profile.basics.preferred;
        delete state.profile.basics.preferredName;
        delete state.profile.basics.dob;
        delete state.profile.basics.dateOfBirth;
        delete state.profile.basics.pob;
        delete state.profile.basics.placeOfBirth;
      }
    } catch (e) { console.warn("[bb-reset-identity] basics wipe threw:", e); }

    // 3. Reset session identity machine.
    try {
      if (!state.session) state.session = {};
      state.session.identityPhase   = "askName";
      state.session.identityCapture = { name: null, dob: null, birthplace: null };
      state.session.speakerName     = null;
    } catch (e) { console.warn("[bb-reset-identity] session reset threw:", e); }

    // 4. Persist BB blob to backend (empty personal merges with whatever else is there).
    try { _persistDrafts(pid); } catch (e) { console.warn("[bb-reset-identity] persist threw:", e); }

    // 5. PATCH backend person row to clear DOB + place fields.
    try {
      if (typeof API !== "undefined" && API.PERSON) {
        const r = await fetch(API.PERSON(pid), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date_of_birth: null, place_of_birth: null }),
        });
        if (!r.ok) console.warn("[bb-reset-identity] PATCH person failed:", r.status);
        else console.log("[bb-reset-identity] PATCH person cleared DOB+POB");
      }
    } catch (e) { console.warn("[bb-reset-identity] PATCH person threw:", e); }

    // 6. Re-render BB if popover is open.
    try {
      if (window.LorevoxBioBuilder && typeof window.LorevoxBioBuilder.refresh === "function") {
        window.LorevoxBioBuilder.refresh();
      }
    } catch (_) {}

    // 7. Re-fire identity onboarding so Lori asks for the three anchors again.
    try {
      if (typeof window.startIdentityOnboarding === "function") {
        window.startIdentityOnboarding();
      } else if (typeof startIdentityOnboarding === "function") {
        startIdentityOnboarding();
      }
    } catch (e) { console.warn("[bb-reset-identity] startIdentityOnboarding threw:", e); }

    console.log("[bb-reset-identity] complete — Lori will re-ask name + DOB + birthplace");
    _setResetIdentityStatus(
      '<span style="color:#22c55e;">✓ PASS — identity cleared for ' +
      currentName.replace(/[<>&]/g, "") + ' (' + pid.slice(0, 8) + ')</span><br>' +
      '<span style="color:#94a3b8;">Identity cleared. Start Questionnaire First and re-enter name/DOB/birthplace.</span>');
    return true;
  }

  function _confirmIdentityReset(name, pid) {
    return new Promise(function (resolve) {
      const msg =
        "Reset identity for \"" + name + "\" (" + pid.slice(0, 8) + ")?\n\n" +
        "This will:\n" +
        "  • Wipe bb.questionnaire.personal (Full Name / Preferred / DOB / Birthplace / Time of Birth)\n" +
        "  • Clear state.profile.basics identity fields\n" +
        "  • PATCH the backend person row to null DOB + birthplace\n" +
        "  • Re-fire identity onboarding (Lori will ask the three anchors again)\n\n" +
        "PRESERVED:\n" +
        "  • Memory archive (transcripts intact)\n" +
        "  • Other BB sections (parents, siblings, family tree)\n" +
        "  • Other narrators (untouched)\n" +
        "  • person_id (same narrator, just identity reset)\n\n" +
        "Continue?";
      let answer;
      try { answer = window.confirm(msg); } catch (_) { answer = false; }
      resolve(!!answer);
    });
  }

  window.lvBbResetIdentityForCurrentNarrator = lvBbResetIdentityForCurrentNarrator;

  /* ───────────────────────────────────────────────────────────
     BUG-221B: PURGE TEST NARRATORS (nuclear, dev-only)

     Walks the people list, identifies any narrator whose display_name
     does NOT match the 5 canonical Horne-family + trainer narrators,
     and removes them from BOTH localStorage AND backend (soft-delete).

     Purpose: clean up dev pollution accumulated across days of test
     sessions (Sarah/Walter/Test Harness/Corky variants/etc.) BEFORE
     real parent sessions start. The ad-hoc per-narrator cleanup
     (BUG-228 above) is too slow for "I have 14 stale test narrators
     in my list" cases.

     Preserved (whitelist, exact display_name match):
       - Kent James Horne
       - Janice Josephine Horne
       - Christopher Todd Horne
       - William Alan Shatner   (trainer)
       - Dolly Rebecca Parton   (trainer)

     For each non-canonical narrator the purge:
       - Wipes localStorage keys: lorevox_qq_draft_<pid>, lv_done_<pid>,
         lv_segs_<pid>, lorevox_offline_profile_<pid>,
         lorevox_proj_draft_<pid>, bb_qq_<pid> (legacy)
       - Soft-deletes the person row via DELETE /api/people/{id}?mode=soft

     NOT touched:
       - Photo + memory archive on disk (preserved for forensic restore)
       - The 5 canonical narrators (zero risk to real demo data)
       - Backend family_truth / projection tables (covered by soft-delete)

     The whitelist is hardcoded by display_name so renaming a real
     narrator would orphan it. That's a deliberate trade — the utility
     refuses to delete based on heuristics; it deletes only what isn't
     on the explicit whitelist.
  ─────────────────────────────────────────────────────────── */

  var _CANONICAL_NARRATOR_NAMES = [
    "Kent James Horne",
    "Janice Josephine Horne",
    "Christopher Todd Horne",
    "William Alan Shatner",
    "Dolly Rebecca Parton"
  ];

  function _setPurgeStatus(html) {
    try {
      var el = document.getElementById("lv10dBpPurgeTestStatus");
      if (el) el.innerHTML = html;
    } catch (_) {}
  }

  function _isCanonicalNarrator(person) {
    if (!person) return false;
    var name = (person.display_name || person.name || "").trim();
    return _CANONICAL_NARRATOR_NAMES.indexOf(name) >= 0;
  }

  function _wipeNarratorLocalStorage(pid) {
    if (!pid) return [];
    var prefixes = [
      "lorevox_qq_draft_",
      "lv_done_",
      "lv_segs_",
      "lorevox_offline_profile_",
      "lorevox_proj_draft_",
      "bb_qq_",                    // legacy pre-WO-INTAKE-IDENTITY-01
      "lv_active_person_v55_",     // edge case: stale active-pid pointers
    ];
    var wiped = [];
    for (var i = 0; i < prefixes.length; i += 1) {
      var key = prefixes[i] + pid;
      try {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          wiped.push(key);
        }
      } catch (_) {}
    }
    return wiped;
  }

  async function _softDeleteNarrator(pid) {
    if (typeof API === "undefined" || !API.PERSON) {
      throw new Error("API.PERSON helper not available");
    }
    var resp = await fetch(API.PERSON(pid) + "?mode=soft", { method: "DELETE" });
    if (!resp.ok) {
      throw new Error("DELETE /api/people/" + pid + " returned HTTP " + resp.status);
    }
    return true;
  }

  async function lvBbPurgeTestNarrators() {
    _setPurgeStatus('<span style="color:#94a3b8;">Fetching narrator list…</span>');

    // 1. Fetch all narrators from backend
    var allNarrators;
    try {
      var resp = await fetch(API.PEOPLE + "?limit=200");
      if (!resp.ok) {
        _setPurgeStatus('<span style="color:#f87171;">✗ FAIL — could not fetch narrators (HTTP ' + resp.status + ')</span>');
        return false;
      }
      var body = await resp.json();
      allNarrators = Array.isArray(body) ? body : (body && body.people) || [];
    } catch (e) {
      _setPurgeStatus('<span style="color:#f87171;">✗ FAIL — fetch threw: ' + (e.message || e) + '</span>');
      return false;
    }

    // 2. Partition into canonical (preserve) and tests (purge)
    var canonical = allNarrators.filter(_isCanonicalNarrator);
    var tests = allNarrators.filter(function (p) { return !_isCanonicalNarrator(p); });

    if (!tests.length) {
      _setPurgeStatus('<span style="color:#22c55e;">✓ No test narrators found. ' +
        canonical.length + ' canonical narrators preserved.</span>');
      console.log("[bb-purge] no test narrators to purge; canonical preserved:",
        canonical.map(function (p) { return p.display_name || p.name; }));
      try {
        alert("No test narrators to purge.\n\nCanonical narrators preserved (" +
          canonical.length + "):\n  • " +
          canonical.map(function (p) { return p.display_name || p.name; }).join("\n  • "));
      } catch (_) {}
      return true;
    }

    // 3. Confirm with operator (full list shown so they can verify)
    var testNames = tests.map(function (p) {
      return (p.display_name || p.name || "(unnamed)") + " — " + (p.id || "").slice(0, 8);
    });
    var canonicalNames = canonical.map(function (p) { return p.display_name || p.name; });

    var msg =
      "PURGE " + tests.length + " test narrators?\n\n" +
      "Will be DELETED (soft-delete + localStorage wipe):\n  • " + testNames.join("\n  • ") + "\n\n" +
      "Will be PRESERVED (canonical, " + canonical.length + "):\n  • " +
      (canonicalNames.length ? canonicalNames.join("\n  • ") : "(NONE FOUND — check display_name strings)") + "\n\n" +
      "Photos + memory archive on disk are NOT touched (preserved for restore).\n\n" +
      "This is irreversible from the UI. Continue?";

    var ok;
    try { ok = window.confirm(msg); } catch (_) { ok = false; }
    if (!ok) {
      _setPurgeStatus('<span style="color:#94a3b8;">Cancelled by operator.</span>');
      console.log("[bb-purge] cancelled by operator");
      return false;
    }

    // 4. Execute purge (sequential — protects backend from N parallel deletes)
    _setPurgeStatus('<span style="color:#94a3b8;">Purging ' + tests.length + ' narrators…</span>');
    console.log("[bb-purge] starting purge of " + tests.length + " test narrators");

    var succeeded = 0;
    var failed = 0;
    var ls_keys_total = 0;
    for (var i = 0; i < tests.length; i += 1) {
      var narrator = tests[i];
      var pid = narrator.id;
      if (!pid) {
        console.warn("[bb-purge] skipping narrator with no id:", narrator);
        failed += 1;
        continue;
      }

      // Wipe localStorage first (always succeeds)
      var wiped_keys = _wipeNarratorLocalStorage(pid);
      ls_keys_total += wiped_keys.length;

      // Soft-delete from backend
      try {
        await _softDeleteNarrator(pid);
        succeeded += 1;
        console.log("[bb-purge] purged " + (narrator.display_name || pid.slice(0, 8)) +
          " (" + pid.slice(0, 8) + ") — " + wiped_keys.length + " LS keys + 1 backend row");
      } catch (e) {
        failed += 1;
        console.warn("[bb-purge] backend delete FAILED for " +
          (narrator.display_name || pid.slice(0, 8)) + ": " + (e.message || e) +
          " — localStorage was still wiped");
      }
    }

    var summaryColor = failed ? "#fbbf24" : "#22c55e";
    var summaryIcon = failed ? "⚠" : "✓";
    _setPurgeStatus(
      '<span style="color:' + summaryColor + ';">' + summaryIcon + ' Purged ' +
      succeeded + '/' + tests.length + ' test narrators (' + ls_keys_total + ' LS keys wiped' +
      (failed ? ', ' + failed + ' backend deletes failed' : '') + ').</span><br>' +
      '<span style="color:#94a3b8;">Refresh the page to see the cleaned narrator list.</span>'
    );
    console.log("[bb-purge] complete — " + succeeded + "/" + tests.length +
      " purged, " + ls_keys_total + " localStorage keys wiped, " +
      failed + " backend failures");
    return failed === 0;
  }

  window.lvBbPurgeTestNarrators = lvBbPurgeTestNarrators;

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
    _syncIdentityToBB:        _syncIdentityToBB,
    _loadDrafts:              _loadDrafts,
    _clearDrafts:             _clearDrafts,
    _getDraftIndex:           _getDraftIndex,
    _restoreQuestionnaire:    _restoreQuestionnaire,

    // BUG-208: Narrator-switch generation (in-flight async guard)
    _currentSwitchGen:        _currentSwitchGen,

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
