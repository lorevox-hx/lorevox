/* ═══════════════════════════════════════════════════════════════
   projection-sync.js — Lorevox 9.0 Interview Projection Sync Layer

   Owns:
     - Writing values into state.interviewProjection.fields
     - Syncing projection → Bio Builder questionnaire (via write modes)
     - Locking rules (human edits are sacred — AI cannot overwrite)
     - Candidate creation for candidate_only fields
     - Suggestion queue management for suggest_only fields
     - localStorage persistence of projection state
     - Narrator-switch reset and restore
     - Audit / sync log

   Locking model:
     1. AI writes:    source = "interview" | "preload" | "profile_hydrate"
        - prefill_if_blank: only if BB field is empty AND not locked
        - candidate_only:   always creates candidate, never writes BB field
        - suggest_only:     queues suggestion, user must accept
        - AI can upgrade its own value if confidence improves
     2. Human writes: source = "human_edit"
        - Always accepted, sets locked = true
        - Overwrites any AI value, preserves in history
        - locked fields are NEVER overwritten by AI

   Depends on:
     - state.js (state.interviewProjection)
     - projection-map.js (LorevoxProjectionMap)
     - bio-builder-core.js (LorevoxBioBuilderModules.core)

   Load order: AFTER projection-map.js, BEFORE interview.js updates
   Exposes: window.LorevoxProjectionSync
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var _map = window.LorevoxProjectionMap;
  if (!_map) throw new Error("projection-map.js must load before projection-sync.js");

  /* ───────────────────────────────────────────────────────────
     CONSTANTS
  ─────────────────────────────────────────────────────────── */

  var LS_PROJ_PREFIX   = "lorevox_proj_draft_";
  var SYNC_LOG_CAP     = 200;
  var SCHEMA_VERSION   = 1;

  /* ───────────────────────────────────────────────────────────
     STATE ACCESS
  ─────────────────────────────────────────────────────────── */

  function _proj() {
    return (typeof state !== "undefined") ? state.interviewProjection : null;
  }

  function _bb() {
    if (typeof state === "undefined" || !state.bioBuilder) return null;
    return state.bioBuilder;
  }

  /* ───────────────────────────────────────────────────────────
     CORE: PROJECT A VALUE
     Main entry point for writing a value into the projection.

     @param {string} fieldPath - e.g. "personal.fullName" or "parents[0].firstName"
     @param {string} value     - the extracted value
     @param {object} opts      - { source, turnId, confidence }
       source     : "interview" | "preload" | "human_edit" | "profile_hydrate"
       turnId     : interview turn ID (null for non-interview sources)
       confidence : float 0–1 (default 0.8 for interview, 1.0 for human_edit)
  ─────────────────────────────────────────────────────────── */

  function projectValue(fieldPath, value, opts) {
    var proj = _proj();
    if (!proj) return false;

    opts = opts || {};
    var source     = opts.source     || "interview";
    var turnId     = opts.turnId     || null;
    var confidence = opts.confidence != null ? opts.confidence : (source === "human_edit" ? 1.0 : 0.8);
    var now        = Date.now();

    var existing = proj.fields[fieldPath];

    // ── LOCK CHECK: human-edited fields cannot be overwritten by AI ──
    if (existing && existing.locked && source !== "human_edit") {
      _logSync(fieldPath, "blocked_locked", existing.value, value);
      return false;
    }

    // ── Phase G: PROTECTED IDENTITY CHECK ──
    // Protected identity fields (fullName, DOB, placeOfBirth, etc.) cannot be
    // overwritten by non-human sources once they have a value.
    var PM = window.LorevoxProjectionMap;
    if (PM && PM.isProtectedIdentity && PM.isProtectedIdentity(fieldPath)) {
      if (existing && existing.value && source !== "human_edit") {
        if (value !== existing.value) {
          _logSync(fieldPath, "blocked_protected_identity", existing.value, value);
          // Route to suggestion instead of direct write
          _syncSuggestOnly(fieldPath, value, confidence);
          console.warn("[projection-sync] ⛔ Protected identity conflict: " + fieldPath +
            " current=" + existing.value + " proposed=" + value + " source=" + source);
          return false;
        }
      }
    }

    // ── CONFIDENCE GATE: AI can only upgrade, not downgrade ──
    if (existing && existing.value && source !== "human_edit") {
      if (existing.source !== "human_edit" && confidence <= existing.confidence) {
        // Same or lower confidence — skip unless value is substantively different
        if (value === existing.value) return false;
        // Allow if value is longer/richer (heuristic: more chars = more info)
        if (value.length <= existing.value.length && confidence < existing.confidence) {
          _logSync(fieldPath, "blocked_confidence", existing.value, value);
          return false;
        }
      }
    }

    // ── BUILD HISTORY ENTRY ──
    var historyEntry = null;
    if (existing && existing.value) {
      historyEntry = {
        value:      existing.value,
        source:     existing.source,
        turnId:     existing.turnId,
        confidence: existing.confidence,
        ts:         existing.ts
      };
    }

    // ── WRITE THE PROJECTION ──
    proj.fields[fieldPath] = {
      value:      value,
      source:     source,
      turnId:     turnId,
      confidence: confidence,
      locked:     source === "human_edit",
      ts:         now,
      history:    existing ? (existing.history || []).concat(historyEntry ? [historyEntry] : []).slice(-10) : []
    };

    _logSync(fieldPath, "projected", existing ? existing.value : null, value);

    // ── SYNC TO BIO BUILDER ──
    _syncToBioBuilder(fieldPath, value, source, confidence);

    // ── AUTO-PERSIST ──
    _debouncedPersist();

    return true;
  }

  /* ───────────────────────────────────────────────────────────
     SYNC TO BIO BUILDER — Applies write mode rules
  ─────────────────────────────────────────────────────────── */

  function _isTrustedSource(source) {
    return source === "human_edit" || source === "preload" || source === "profile_hydrate";
  }

  function _syncToBioBuilder(fieldPath, value, source, confidence) {
    var writeMode = _map.getWriteMode(fieldPath);
    var parsed    = _map.parsePath(fieldPath);
    if (!parsed) return;

    var bb = _bb();
    if (!bb) return;

    // Hornelore rule:
    // trusted sources write directly into questionnaire,
    // even for repeatable people sections that are candidate_only in generic Lorevox.
    if (_isTrustedSource(source)) {
      _syncDirectTrustedWrite(parsed, value, source, bb);
      return;
    }

    // Provisional interview/LLM-derived sources keep existing review flow
    if (writeMode === "prefill_if_blank") {
      _syncPrefillIfBlank(parsed, value, source, bb);
    } else if (writeMode === "candidate_only") {
      _syncCandidateOnly(parsed, value, source, confidence, bb);
    } else if (writeMode === "suggest_only") {
      _syncSuggestOnly(fieldPath, value, confidence);
    }
  }

  /* ── prefill_if_blank: write to BB field only if currently empty ── */
  function _syncPrefillIfBlank(parsed, value, source, bb) {
    if (!bb.questionnaire) bb.questionnaire = {};

    if (parsed.index !== null) {
      // Repeatable section
      if (!Array.isArray(bb.questionnaire[parsed.section])) {
        bb.questionnaire[parsed.section] = [];
      }
      while (bb.questionnaire[parsed.section].length <= parsed.index) {
        bb.questionnaire[parsed.section].push({});
      }
      var entry = bb.questionnaire[parsed.section][parsed.index];
      if (!entry[parsed.field] || String(entry[parsed.field]).trim() === "") {
        entry[parsed.field] = value;
        _logSync(parsed.section + "[" + parsed.index + "]." + parsed.field, "bb_prefilled", "", value);
      }
    } else {
      // Non-repeatable section
      if (!bb.questionnaire[parsed.section]) bb.questionnaire[parsed.section] = {};
      var existing = bb.questionnaire[parsed.section][parsed.field];
      if (!existing || String(existing).trim() === "") {
        bb.questionnaire[parsed.section][parsed.field] = value;
        _logSync(parsed.section + "." + parsed.field, "bb_prefilled", "", value);
      }
    }

    // Trigger BB persistence
    _triggerBBPersist();
  }

  /* ── trusted_direct: write directly for trusted sources (human_edit, preload, profile_hydrate) ── */
  function _syncDirectTrustedWrite(parsed, value, source, bb) {
    if (!bb.questionnaire) bb.questionnaire = {};

    if (parsed.index !== null) {
      if (!Array.isArray(bb.questionnaire[parsed.section])) {
        bb.questionnaire[parsed.section] = [];
      }
      while (bb.questionnaire[parsed.section].length <= parsed.index) {
        bb.questionnaire[parsed.section].push({});
      }

      var entry = bb.questionnaire[parsed.section][parsed.index];
      var oldVal = entry[parsed.field];

      // Preserve meaningful existing value unless this is an explicit human edit
      if (source !== "human_edit" && oldVal && String(oldVal).trim() !== "") {
        _logSync(
          parsed.section + "[" + parsed.index + "]." + parsed.field,
          "trusted_skip_existing",
          oldVal,
          value,
          {
            source: source,
            writeMode: "trusted_direct",
            resultBucket: "skip_existing"
          }
        );
        return;
      }

      entry[parsed.field] = value;
      _logSync(
        parsed.section + "[" + parsed.index + "]." + parsed.field,
        "bb_trusted_write",
        oldVal || "",
        value,
        {
          source: source,
          writeMode: "trusted_direct",
          resultBucket: "bb"
        }
      );
    } else {
      if (!bb.questionnaire[parsed.section]) bb.questionnaire[parsed.section] = {};
      var oldVal2 = bb.questionnaire[parsed.section][parsed.field];

      if (source !== "human_edit" && oldVal2 && String(oldVal2).trim() !== "") {
        _logSync(
          parsed.section + "." + parsed.field,
          "trusted_skip_existing",
          oldVal2,
          value,
          {
            source: source,
            writeMode: "trusted_direct",
            resultBucket: "skip_existing"
          }
        );
        return;
      }

      bb.questionnaire[parsed.section][parsed.field] = value;
      _logSync(
        parsed.section + "." + parsed.field,
        "bb_trusted_write",
        oldVal2 || "",
        value,
        {
          source: source,
          writeMode: "trusted_direct",
          resultBucket: "bb"
        }
      );
    }

    _triggerBBPersist();
  }

  /* ── candidate_only: create candidate entry, never write to BB directly ── */
  function _syncCandidateOnly(parsed, value, source, confidence, bb) {
    if (!bb.candidates) return;
    var config = _map.getFieldConfig(
      parsed.index !== null
        ? _map.buildRepeatablePath(parsed.section, parsed.index, parsed.field)
        : parsed.section + "." + parsed.field
    );
    var candidateType = (config && config.candidateType) || "people";

    // For people candidates, accumulate fields into a single candidate per entry index
    if (candidateType === "people" && parsed.index !== null) {
      var candidateId = "proj_" + parsed.section + "_" + parsed.index;
      var existing = null;
      for (var i = 0; i < bb.candidates.people.length; i++) {
        if (bb.candidates.people[i].id === candidateId) { existing = bb.candidates.people[i]; break; }
      }
      if (!existing) {
        existing = {
          id: candidateId,
          source: "interview_projection",
          section: parsed.section,
          entryIndex: parsed.index,
          confidence: confidence,
          ts: Date.now(),
          data: {}
        };
        bb.candidates.people.push(existing);
      }
      existing.data[parsed.field] = value;
      existing.confidence = Math.max(existing.confidence || 0, confidence);
      existing.ts = Date.now();
      _logSync(candidateId + "." + parsed.field, "candidate_updated", "", value, {
        source: source,
        writeMode: "candidate_only",
        resultBucket: "candidate",
        confidence: confidence
      });
    }
  }

  /* ── suggest_only: queue suggestion for user review ── */
  function _syncSuggestOnly(fieldPath, value, confidence) {
    var proj = _proj();
    if (!proj) return;

    // Remove any existing suggestion for this path
    proj.pendingSuggestions = (proj.pendingSuggestions || []).filter(function (s) {
      return s.fieldPath !== fieldPath;
    });

    proj.pendingSuggestions.push({
      fieldPath:  fieldPath,
      value:      value,
      confidence: confidence,
      turnId:     proj.fields[fieldPath] ? proj.fields[fieldPath].turnId : null,
      ts:         Date.now()
    });

    _logSync(fieldPath, "suggestion_queued", "", value, {
      source: "interview",
      writeMode: "suggest_only",
      resultBucket: "suggestion",
      confidence: confidence
    });
  }

  /* ───────────────────────────────────────────────────────────
     ACCEPT SUGGESTION — User approves a pending suggestion
  ─────────────────────────────────────────────────────────── */

  function acceptSuggestion(fieldPath) {
    var proj = _proj();
    if (!proj) return false;

    var suggestion = null;
    var idx = -1;
    for (var i = 0; i < (proj.pendingSuggestions || []).length; i++) {
      if (proj.pendingSuggestions[i].fieldPath === fieldPath) {
        suggestion = proj.pendingSuggestions[i];
        idx = i;
        break;
      }
    }
    if (!suggestion) return false;

    // Remove from pending
    proj.pendingSuggestions.splice(idx, 1);

    // Write directly to BB questionnaire (user accepted = authoritative)
    var parsed = _map.parsePath(fieldPath);
    if (!parsed) return false;

    var bb = _bb();
    if (bb && bb.questionnaire) {
      if (!bb.questionnaire[parsed.section]) bb.questionnaire[parsed.section] = {};
      bb.questionnaire[parsed.section][parsed.field] = suggestion.value;
      _logSync(fieldPath, "suggestion_accepted", "", suggestion.value);
      _triggerBBPersist();
    }

    // Mark the projection field as human-accepted (locked)
    if (proj.fields[fieldPath]) {
      proj.fields[fieldPath].locked = true;
      proj.fields[fieldPath].source = "human_edit";
      proj.fields[fieldPath].ts = Date.now();
    }

    _debouncedPersist();
    return true;
  }

  /**
   * Dismiss a pending suggestion without applying it.
   */
  function dismissSuggestion(fieldPath) {
    var proj = _proj();
    if (!proj) return;
    proj.pendingSuggestions = (proj.pendingSuggestions || []).filter(function (s) {
      return s.fieldPath !== fieldPath;
    });
    _logSync(fieldPath, "suggestion_dismissed", "", "");
  }

  /* ───────────────────────────────────────────────────────────
     HUMAN EDIT AUTHORITY — Called when user manually edits a
     Bio Builder questionnaire field.
     Sets projection locked = true, preserves history.
  ─────────────────────────────────────────────────────────── */

  function markHumanEdit(fieldPath, value) {
    return projectValue(fieldPath, value, {
      source: "human_edit",
      turnId: null,
      confidence: 1.0
    });
  }

  /* ───────────────────────────────────────────────────────────
     BATCH PROJECT — For preload or profile hydration scenarios
     where many fields arrive at once.
  ─────────────────────────────────────────────────────────── */

  function batchProject(entries, source) {
    source = source || "preload";
    var count = 0;
    entries.forEach(function (entry) {
      if (projectValue(entry.path, entry.value, {
        source: source,
        turnId: entry.turnId || null,
        confidence: entry.confidence || 0.9
      })) {
        count++;
      }
    });
    return count;
  }

  /* ───────────────────────────────────────────────────────────
     NARRATOR SWITCH — Reset + restore from localStorage
  ─────────────────────────────────────────────────────────── */

  function resetForNarrator(newPid) {
    var proj = _proj();
    if (!proj) return;

    var outgoingPid = proj.personId;
    var hasFields = Object.keys(proj.fields).length > 0;

    // v8.0 FIX: If the incoming pid matches the current pid and we already
    // have projection data, persist and reload (safe round-trip) instead of
    // wiping state. This prevents accidental data loss when loadPerson()
    // is called for the same narrator (e.g. after identity gate PATCH).
    if (newPid && newPid === outgoingPid && hasFields) {
      console.log("[projection-sync] Same narrator reset — persisting and reloading (no wipe)");
      _persistProjection(outgoingPid);
      _loadProjection(newPid);
      return;
    }

    // v8.0 FIX: If outgoingPid is null but we have identity-phase projection
    // data in memory (built during askName/askDob/askBirthplace before person
    // creation), persist those fields under the NEW pid so they survive the reset.
    // This happens during first-time identity gate: person_id was null, identity
    // answers built projection fields, then _resolveOrCreatePerson() POST-created
    // a new person and called loadPerson(newPid) → resetForNarrator(newPid).
    if (!outgoingPid && newPid && hasFields) {
      console.log("[projection-sync] Identity-phase fields detected (no outgoing pid) — persisting under new pid:", newPid);
      proj.personId = newPid;
      _persistProjection(newPid);
      // Reload to pick up the just-persisted fields
      _loadProjection(newPid);
      return;
    }

    // Persist outgoing narrator
    if (outgoingPid) _persistProjection(outgoingPid);

    // Clear state
    proj.personId = newPid || null;
    proj.fields = {};
    proj.pendingSuggestions = [];
    proj.syncLog = [];

    // Restore incoming narrator from localStorage
    if (newPid) _loadProjection(newPid);
  }

  /* ───────────────────────────────────────────────────────────
     LOCALSTORAGE PERSISTENCE
  ─────────────────────────────────────────────────────────── */

  function _persistProjection(pid) {
    if (!pid) return;
    var proj = _proj();
    if (!proj) return;
    var payload = {
      fields: proj.fields,
      pendingSuggestions: proj.pendingSuggestions
      // syncLog intentionally NOT persisted (session-only audit)
    };
    // Phase G: Backend canonical save (fire-and-forget)
    try {
      fetch(API.IV_PROJ_PUT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: pid, projection: payload, source: "projection_sync", version: SCHEMA_VERSION })
      }).catch(function(e) { console.warn("[projection-sync] Backend persist failed", e); });
    } catch (e) {}
    // Transient localStorage fallback
    try {
      localStorage.setItem(LS_PROJ_PREFIX + pid, JSON.stringify({ v: SCHEMA_VERSION, d: payload }));
    } catch (e) {
      // localStorage full — degrade silently
    }
  }

  function _loadProjection(pid) {
    if (!pid) return;
    var proj = _proj();
    if (!proj) return;

    // Phase G: Try backend first (async — overwrites when ready)
    _loadProjectionFromBackend(pid);

    // Immediate: localStorage transient fallback
    try {
      var raw = localStorage.getItem(LS_PROJ_PREFIX + pid);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      var d = parsed && (parsed.d || parsed.data);
      if (d && typeof d === "object") {
        proj.fields = d.fields || {};
        proj.pendingSuggestions = d.pendingSuggestions || [];
      }
    } catch (e) {
      // Malformed — ignore
    }
  }

  /* ── Phase G: Backend projection restore (async) ─────────── */
  function _loadProjectionFromBackend(pid) {
    if (!pid || typeof API === "undefined" || !API.IV_PROJ_GET) return;
    fetch(API.IV_PROJ_GET(pid))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(j) {
        if (!j || !j.projection) return;
        var p = j.projection;
        var fields = p.fields || {};
        if (typeof fields === "object" && Object.keys(fields).length > 0) {
          var proj = _proj(); if (!proj) return;
          proj.fields = fields;
          proj.pendingSuggestions = p.pendingSuggestions || [];
          console.log("[projection-sync] ✅ Projection restored from backend for " + pid);
          // Sync transient localStorage
          try {
            localStorage.setItem(LS_PROJ_PREFIX + pid, JSON.stringify({
              v: SCHEMA_VERSION, d: { fields: fields, pendingSuggestions: proj.pendingSuggestions }
            }));
          } catch (e) {}
        }
      })
      .catch(function(e) {
        console.warn("[projection-sync] Backend projection load failed (using localStorage fallback)", e);
      });
  }

  function clearProjection(pid) {
    if (!pid) return;
    try { localStorage.removeItem(LS_PROJ_PREFIX + pid); } catch (e) {}
    var proj = _proj();
    if (proj && proj.personId === pid) {
      proj.fields = {};
      proj.pendingSuggestions = [];
      proj.syncLog = [];
    }
  }

  // Debounced persistence (max once per 2s)
  var _persistTimer = null;
  function _debouncedPersist() {
    if (_persistTimer) return;
    _persistTimer = setTimeout(function () {
      _persistTimer = null;
      var proj = _proj();
      if (proj && proj.personId) _persistProjection(proj.personId);
    }, 2000);
  }

  /* ───────────────────────────────────────────────────────────
     BIO BUILDER PERSISTENCE TRIGGER
  ─────────────────────────────────────────────────────────── */

  function _triggerBBPersist() {
    try {
      var core = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
      if (core && core._persistDrafts && core._currentPersonId) {
        var pid = core._currentPersonId();
        if (pid) core._persistDrafts(pid);
      }
    } catch (e) {}
  }

  /* ───────────────────────────────────────────────────────────
     SYNC LOG — Audit trail for debugging and transparency
  ─────────────────────────────────────────────────────────── */

  function _logSync(fieldPath, action, fromValue, toValue, meta) {
    var proj = _proj();
    if (!proj) return;
    meta = meta || {};

    proj.syncLog.push({
      fieldPath: fieldPath,
      action:    action,
      fromValue: fromValue || "",
      toValue:   toValue || "",
      ts:        Date.now(),
      source:       meta.source || null,
      writeMode:    meta.writeMode || null,
      resultBucket: meta.resultBucket || null,
      confidence:   meta.confidence != null ? meta.confidence : null,
      personId: (typeof state !== "undefined" ? state.person_id : null),
      convId:   (typeof state !== "undefined" && state.chat ? state.chat.conv_id : null)
    });

    if (proj.syncLog.length > SYNC_LOG_CAP) {
      proj.syncLog = proj.syncLog.slice(-SYNC_LOG_CAP);
    }
  }

  /* ───────────────────────────────────────────────────────────
     QUERY HELPERS — For interview.js and UI
  ─────────────────────────────────────────────────────────── */

  /**
   * Get the projected value for a field, or null if not projected.
   */
  function getValue(fieldPath) {
    var proj = _proj();
    if (!proj || !proj.fields[fieldPath]) return null;
    return proj.fields[fieldPath].value || null;
  }

  /**
   * Check if a field is locked (human-edited).
   */
  function isLocked(fieldPath) {
    var proj = _proj();
    if (!proj || !proj.fields[fieldPath]) return false;
    return !!proj.fields[fieldPath].locked;
  }

  /**
   * Get all pending suggestions (for UI rendering).
   */
  function getPendingSuggestions() {
    var proj = _proj();
    return (proj && proj.pendingSuggestions) ? proj.pendingSuggestions : [];
  }

  /**
   * Get the full sync log (for dev/debug panel).
   */
  function getSyncLog() {
    var proj = _proj();
    return (proj && proj.syncLog) ? proj.syncLog : [];
  }

  /**
   * Get overall projection stats.
   */
  function getStats() {
    var proj = _proj();
    if (!proj) return { total: 0, locked: 0, pending: 0 };
    var fields = proj.fields;
    var keys = Object.keys(fields);
    var locked = keys.filter(function (k) { return fields[k].locked; }).length;
    return {
      total: keys.length,
      locked: locked,
      pending: (proj.pendingSuggestions || []).length
    };
  }

  /* ───────────────────────────────────────────────────────────
     EXPORT
  ─────────────────────────────────────────────────────────── */

  window.LorevoxProjectionSync = {
    // Core write
    projectValue:        projectValue,
    batchProject:        batchProject,
    markHumanEdit:       markHumanEdit,

    // Suggestions
    acceptSuggestion:    acceptSuggestion,
    dismissSuggestion:   dismissSuggestion,
    getPendingSuggestions: getPendingSuggestions,

    // Narrator lifecycle
    resetForNarrator:    resetForNarrator,
    clearProjection:     clearProjection,

    // Query
    getValue:            getValue,
    isLocked:            isLocked,
    getSyncLog:          getSyncLog,
    getStats:            getStats,

    // Persistence
    forcePersist:        function () {
      var proj = _proj();
      if (proj && proj.personId) _persistProjection(proj.personId);
    },

    // Constants (for external access)
    LS_PROJ_PREFIX:      LS_PROJ_PREFIX
  };

  console.log("[Lorevox] Projection sync layer loaded.");

  // v8.1: Auto-initialize projection on load if a person is already active.
  // This fixes the race condition where loadPerson() runs before projection-sync.js
  // loads. When this script loads, if state.person_id is already set, we restore
  // projection state from localStorage immediately.
  (function _autoInitOnLoad() {
    if (typeof state !== "undefined" && state.person_id) {
      var proj = _proj();
      if (proj && !proj.personId) {
        console.log("[projection-sync] Auto-initializing for active person: " + state.person_id);
        resetForNarrator(state.person_id);
      }
    }
  })();

})();
