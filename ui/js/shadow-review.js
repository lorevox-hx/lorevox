/* ═══════════════════════════════════════════════════════════════
   shadow-review.js — WO-13X Source-Centric Shadow Review
   Lorevox 1.0

   Replaces candidate-centric review with source-centric review.
   Three-pane layout:
     LEFT   — source list (sourceCards + chat-extraction sources)
     CENTER — source excerpt + grouped claims
     RIGHT  — resolved outcomes

   Data sources:
     1. state.bioBuilder.sourceCards[] (document uploads)
     2. WO-13 family-truth rows (/api/family-truth/rows)
     3. state.bioBuilder.candidates.* (existing candidate pipeline)

   Resolution state (UI only):
     state.shadowReview = {
       activeSourceId: null,
       resolutions: { claimId: "approve"|"follow_up"|"source_only"|"reject" },
       committed: []
     }

   Wires to existing:
     - bio-review.js._promote() for candidate approvals
     - wo13PatchRowStatus() for truth-row status changes

   Load order: after bio-review.js, wo13-review.js, projection-map.js
   Exposes: window.LorevoxShadowReview
═══════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  if (global.LorevoxShadowReview) return;

  /* ───────────────────────────────────────────────────────────
     CONSTANTS & STATE
  ─────────────────────────────────────────────────────────── */

  var ROOT_ID = "shadowReviewRoot";

  /* ── State accessors ─────────────────────────────────────── */
  // The app's `state` is closure-scoped in app.js, not on window.
  // Bio Builder data is accessed through module exports.
  function _getBB() {
    var mods = global.LorevoxBioBuilderModules;
    return (mods && mods.core && mods.core._bb) ? mods.core._bb() : null;
  }
  function _getPersonId() {
    var mods = global.LorevoxBioBuilderModules;
    return (mods && mods.core && mods.core._currentPersonId) ? mods.core._currentPersonId() : null;
  }

  var CLAIM_GROUPS = [
    { key: "identity",      label: "Protected Identity", icon: "🛡️" },
    { key: "people",        label: "People / Relationships", icon: "👤" },
    { key: "events",        label: "Events", icon: "📅" },
    { key: "places",        label: "Places", icon: "📍" },
    { key: "memories",      label: "Memories / Narrative", icon: "💭" },
    { key: "follow_up",     label: "Needs Follow-Up", icon: "❓" }
  ];

  var ACTIONS = [
    { key: "approve",     label: "Approve",              cls: "sr-act-approve" },
    { key: "correct",     label: "Correct",              cls: "sr-act-correct" },
    { key: "correct_fu",  label: "Correct + Follow-up",  cls: "sr-act-correctfu" },
    { key: "source_only", label: "Source Only",           cls: "sr-act-sourceonly" },
    { key: "reject",      label: "Reject",               cls: "sr-act-reject" }
  ];

  var IDENTITY_FIELDS = [
    "personal.fullName", "personal.preferredName",
    "personal.dateOfBirth", "personal.placeOfBirth", "personal.birthOrder"
  ];

  /* Destination mapping: candidate type → human label */
  var DEST_MAP = {
    "person":       "→ Family Tree",
    "people":       "→ Family Tree",
    "relationship": "→ Family Tree",
    "event":        "→ Timeline",
    "place":        "→ Life Map",
    "memory":       "→ Memoir Context",
    "document":     "→ Source Only"
  };

  function _destForClaim(claim) {
    if (claim.protectedIdentity) return "→ Source Only (protected)";
    if (claim.fieldPath) {
      // Use projection map if available
      var pm = global.LorevoxProjectionMap;
      if (pm && pm.getFieldConfig) {
        var conf = pm.getFieldConfig(claim.fieldPath);
        if (conf) {
          if (conf.writeMode === "prefill_if_blank") return "→ Questionnaire";
          if (conf.writeMode === "candidate_only") return "→ Family Tree";
          if (conf.writeMode === "suggest_only") return "→ Questionnaire (suggestion)";
        }
      }
    }
    return DEST_MAP[claim.type] || "→ Memoir Context";
  }

  /* ───────────────────────────────────────────────────────────
     DESTINATION LOCKING
  ─────────────────────────────────────────────────────────── */

  function _isDestLocked(claim) {
    if (claim.protectedIdentity) return true;
    if (claim.fieldPath) {
      var pm = global.LorevoxProjectionMap;
      if (pm && pm.getFieldConfig) {
        var conf = pm.getFieldConfig(claim.fieldPath);
        if (conf && conf.writeMode === "candidate_only") return true;
      }
      if (pm && pm.isProtectedIdentity && pm.isProtectedIdentity(claim.fieldPath)) return true;
    }
    return false;
  }

  /* ───────────────────────────────────────────────────────────
     NORMALIZE + CONFLICT DETECTION
  ─────────────────────────────────────────────────────────── */

  function _normalize(value, type) {
    if (!value) return "";
    if (type === "date") return _toISODate(value);
    if (type === "name") return String(value).toLowerCase().trim();
    return String(value).toLowerCase().trim();
  }

  function _toISODate(v) {
    if (!v) return "";
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    try {
      var d = new Date(v);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    } catch (e) {}
    return String(v).toLowerCase().trim();
  }

  function _fieldType(fieldPath) {
    if (!fieldPath) return "text";
    var fp = fieldPath.toLowerCase();
    if (fp.indexOf("date") >= 0 || fp.indexOf("dob") >= 0 || fp.indexOf("birth") >= 0) return "date";
    if (fp.indexOf("name") >= 0) return "name";
    return "text";
  }

  /**
   * Read current truth from questionnaire for a given fieldPath.
   * Returns null if no existing value.
   */
  function _getCurrentTruth(fieldPath) {
    if (!fieldPath) return null;
    var bb = _getBB();
    if (!bb || !bb.questionnaire) return null;
    var pm = global.LorevoxProjectionMap;
    if (!pm || !pm.parsePath) return null;
    var parsed = pm.parsePath(fieldPath);
    if (!parsed) return null;

    if (parsed.index !== null) {
      var arr = bb.questionnaire[parsed.section];
      if (!Array.isArray(arr) || !arr[parsed.index]) return null;
      var val = arr[parsed.index][parsed.field];
      return (val && String(val).trim() !== "") ? String(val) : null;
    } else {
      var sec = bb.questionnaire[parsed.section];
      if (!sec) return null;
      var val2 = sec[parsed.field];
      return (val2 && String(val2).trim() !== "") ? String(val2) : null;
    }
  }

  /**
   * Detect if a value conflicts with existing truth.
   * Returns { conflicting: bool, existingValue: string|null, isQuestionnaire: bool }
   */
  function _detectConflict(fieldPath, newValue) {
    var existing = _getCurrentTruth(fieldPath);
    if (!existing) return { conflicting: false, existingValue: null, isQuestionnaire: false };
    var ft = _fieldType(fieldPath);
    if (_normalize(newValue, ft) === _normalize(existing, ft)) {
      return { conflicting: false, existingValue: existing, isQuestionnaire: true };
    }
    return { conflicting: true, existingValue: existing, isQuestionnaire: true };
  }

  /* ───────────────────────────────────────────────────────────
     DISAGREEMENT LOG (APPEND-ONLY)
  ─────────────────────────────────────────────────────────── */

  function _logDisagreement(claimId, original, corrected, sourceType, decision, note) {
    var sr = _sr();
    sr.disagreements.push({
      claimId: claimId,
      original: original,
      corrected: corrected || null,
      sourceType: sourceType || "unknown",
      decision: decision,
      reviewer: "Chris",
      timestamp: new Date().toISOString(),
      note: note || ""
    });
    console.log("[shadow-review] Disagreement logged: " + decision + " for " + claimId);
  }

  // Module-local shadow review state (not dependent on app.js state object)
  var _shadowState = null;
  function _ensureState() {
    if (!_shadowState) {
      _shadowState = {
        activeSourceId: null,
        resolutions: {},
        corrections: {},     // claimId → { value, destination, note, followUp }
        committed: [],
        disagreements: [],   // append-only audit log
        conflicts: [],       // active conflicts awaiting resolution
        editingClaimId: null // currently expanded correction editor
      };
    }
    return _shadowState;
  }

  function _sr() { return _ensureState(); }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ───────────────────────────────────────────────────────────
     DATA ADAPTERS — Build unified source list
  ─────────────────────────────────────────────────────────── */

  /**
   * Build a list of "review sources", each containing claims.
   * Merges sourceCards (document uploads) + truth rows (chat extraction)
   * + loose candidates into a unified model.
   */
  function _buildSources() {
    var sources = [];

    // 1. sourceCards from document uploads
    var bb = _getBB();
    if (bb && bb.sourceCards) {
      bb.sourceCards.forEach(function (card) {
        if (!card || !card.id) return;
        var claims = _claimsFromSourceCard(card);
        if (claims.length === 0) return;
        sources.push({
          id: "src:" + card.id,
          type: "document",
          label: card.filename || "Uploaded document",
          excerpt: (card.extractedText || card.pastedText || "").slice(0, 500),
          timestamp: card.ts || null,
          speaker: null,
          claims: claims,
          claimCount: claims.length
        });
      });
    }

    // 2. WO-13 truth rows grouped by note_id (chat extraction sources)
    var truthRows = (global._wo13State && global._wo13State.rows) || [];
    if (truthRows.length > 0) {
      var byNote = {};
      truthRows.forEach(function (row) {
        var key = row.note_id || ("row:" + (row.id || Math.random()));
        if (!byNote[key]) byNote[key] = [];
        byNote[key].push(row);
      });
      Object.keys(byNote).forEach(function (noteKey) {
        var rows = byNote[noteKey];
        var first = rows[0] || {};
        var prov = first.provenance || {};
        sources.push({
          id: "truth:" + noteKey,
          type: "chat_extraction",
          label: "Chat extraction",
          excerpt: prov.source_text || first.source_says || rows.map(function (r) { return r.source_says; }).join("; "),
          timestamp: first.created_at || null,
          speaker: first.subject_name || null,
          claims: rows.map(function (r) { return _claimFromTruthRow(r); }),
          claimCount: rows.length
        });
      });
    }

    // 3. Loose candidates not tied to a source card
    if (bb && bb.candidates) {
      var looseClaims = [];
      ["people", "relationships", "memories", "events", "places", "documents"].forEach(function (bucket) {
        var arr = bb.candidates[bucket] || [];
        arr.forEach(function (c) {
          if (c.status === "approved" || c.status === "rejected") return;
          // Only include if not already covered by a sourceCard
          if (c.source && c.source.startsWith("source:")) return;
          looseClaims.push(_claimFromCandidate(c, bucket));
        });
      });
      if (looseClaims.length > 0) {
        sources.push({
          id: "loose:candidates",
          type: "candidates",
          label: "Quick captures & questionnaire",
          excerpt: looseClaims.length + " pending items from quick capture and questionnaire extraction",
          timestamp: null,
          speaker: null,
          claims: looseClaims,
          claimCount: looseClaims.length
        });
      }
    }

    return sources;
  }

  function _claimsFromSourceCard(card) {
    var claims = [];
    if (!card.detectedItems) return claims;
    var typeMap = { people: "person", dates: "event", places: "place", memories: "memory" };
    Object.keys(typeMap).forEach(function (bucket) {
      var items = card.detectedItems[bucket] || [];
      items.forEach(function (item) {
        claims.push({
          id: "sc:" + card.id + ":" + (item.id || Math.random()),
          sourceId: card.id,
          sourceType: "document",
          type: typeMap[bucket],
          text: item.text || "",
          snippet: item.context || "",
          confidence: item.confidence || 0.5,
          protectedIdentity: false,
          fieldPath: null,
          candidateRef: null,
          truthRowRef: null
        });
      });
    });
    return claims;
  }

  function _claimFromTruthRow(row) {
    var isProtected = IDENTITY_FIELDS.indexOf(row.field) >= 0;
    return {
      id: "tr:" + (row.id || row.row_id || Math.random()),
      sourceId: row.note_id,
      sourceType: "chat",
      type: _truthRowToClaimType(row),
      text: row.source_says || "",
      snippet: (row.subject_name || "") + " · " + (row.field || ""),
      confidence: row.confidence || 0.5,
      protectedIdentity: isProtected,
      fieldPath: row.field || null,
      candidateRef: null,
      truthRowRef: row
    };
  }

  function _truthRowToClaimType(row) {
    var field = (row.field || "").toLowerCase();
    if (field.startsWith("personal.")) return "identity_field";
    if (field.indexOf("parent") >= 0 || field.indexOf("sibling") >= 0 ||
        field.indexOf("grandparent") >= 0 || field.indexOf("children") >= 0) return "person";
    if (field.indexOf("place") >= 0 || field.indexOf("birth") >= 0) return "place";
    if (field.indexOf("event") >= 0 || field.indexOf("date") >= 0) return "event";
    return "memory";
  }

  function _claimFromCandidate(c, bucket) {
    var review = global.LorevoxCandidateReview;
    var title = review ? review._title(c) : (c.value || c.label || c.type || "");
    var snippet = review ? review._snippet(c) : (c.snippet || "");
    return {
      id: "cand:" + c.id,
      sourceId: c.sourceId || c.source || null,
      sourceType: "candidate",
      type: bucket === "people" ? "person" :
            bucket === "relationships" ? "relationship" :
            bucket === "events" ? "event" :
            bucket === "places" ? "place" : "memory",
      text: title,
      snippet: snippet,
      confidence: c.confidence || "low",
      protectedIdentity: false,
      fieldPath: null,
      candidateRef: c,
      truthRowRef: null
    };
  }

  /* ───────────────────────────────────────────────────────────
     CLAIM GROUPING
  ─────────────────────────────────────────────────────────── */

  function _groupClaims(claims) {
    var groups = {};
    CLAIM_GROUPS.forEach(function (g) { groups[g.key] = []; });

    claims.forEach(function (claim) {
      if (claim.protectedIdentity || claim.type === "identity_field") {
        groups.identity.push(claim);
      } else if (claim.type === "person" || claim.type === "relationship") {
        groups.people.push(claim);
      } else if (claim.type === "event") {
        groups.events.push(claim);
      } else if (claim.type === "place") {
        groups.places.push(claim);
      } else if (claim.type === "memory") {
        groups.memories.push(claim);
      } else {
        groups.follow_up.push(claim);
      }
    });
    return groups;
  }

  /* ───────────────────────────────────────────────────────────
     DUPLICATE CLUSTERING
  ─────────────────────────────────────────────────────────── */

  function _clusterDuplicates(claims) {
    var clusters = [];
    var used = {};

    claims.forEach(function (claim) {
      if (used[claim.id]) return;
      var cluster = [claim];
      used[claim.id] = true;

      // Find duplicates by text similarity
      claims.forEach(function (other) {
        if (used[other.id] || other.id === claim.id) return;
        if (_textSimilarity(claim.text, other.text) > 0.7) {
          cluster.push(other);
          used[other.id] = true;
        }
      });

      clusters.push({
        primary: claim,
        variants: cluster.length > 1 ? cluster.slice(1) : [],
        isDuplicate: cluster.length > 1
      });
    });
    return clusters;
  }

  function _textSimilarity(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 1.0;
    var wordsA = a.split(/\s+/).filter(function (w) { return w.length > 2; });
    var wordsB = b.split(/\s+/).filter(function (w) { return w.length > 2; });
    if (!wordsA.length || !wordsB.length) return 0;
    var setA = {};
    wordsA.forEach(function (w) { setA[w] = true; });
    var overlap = 0;
    wordsB.forEach(function (w) { if (setA[w]) overlap++; });
    return overlap / Math.max(wordsA.length, wordsB.length);
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — LEFT PANE (Source List)
  ─────────────────────────────────────────────────────────── */

  function _renderSourceList(sources) {
    var sr = _sr();
    if (!sources.length) {
      return '<div class="sr-empty">No sources to review. Chat with a narrator or upload documents to generate reviewable claims.</div>';
    }
    return sources.map(function (src) {
      var active = sr.activeSourceId === src.id ? " sr-source-active" : "";
      var statusCls = _sourceStatus(src);
      var excerptPreview = _esc((src.excerpt || "").slice(0, 80));
      var icon = src.type === "document" ? "📄" :
                 src.type === "chat_extraction" ? "💬" : "📋";
      return '<div class="sr-source-item' + active + '" data-sr-source="' + _esc(src.id) + '">'
        + '<div class="sr-source-top">'
        +   '<span class="sr-source-icon">' + icon + '</span>'
        +   '<span class="sr-source-label">' + _esc(src.label) + '</span>'
        +   '<span class="sr-source-count">' + src.claimCount + '</span>'
        + '</div>'
        + '<div class="sr-source-excerpt">' + excerptPreview + '</div>'
        + '<span class="sr-source-badge sr-badge-' + statusCls + '">' + statusCls + '</span>'
        + '</div>';
    }).join("");
  }

  function _sourceStatus(src) {
    var sr = _sr();
    var resolved = 0;
    src.claims.forEach(function (c) {
      if (sr.resolutions[c.id]) resolved++;
    });
    if (resolved === 0) return "unreviewed";
    if (resolved < src.claims.length) return "partial";
    return "resolved";
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — CENTER PANE (Source + Grouped Claims)
  ─────────────────────────────────────────────────────────── */

  function _renderCenterPane(source) {
    if (!source) {
      return '<div class="sr-center-empty">Select a source from the left to begin reviewing claims.</div>';
    }

    var sr = _sr();
    var grouped = _groupClaims(source.claims);

    // Source excerpt block
    var html = '<div class="sr-source-block">'
      + '<div class="sr-source-header">'
      +   (source.speaker ? '<span class="sr-speaker">' + _esc(source.speaker) + '</span>' : '')
      +   (source.timestamp ? '<span class="sr-timestamp">' + _esc(_formatTime(source.timestamp)) + '</span>' : '')
      +   '<span class="sr-type-badge">' + _esc(source.type) + '</span>'
      + '</div>'
      + '<div class="sr-excerpt">' + _esc(source.excerpt) + '</div>'
      + '</div>';

    // Grouped claims
    html += '<div class="sr-claims">';
    CLAIM_GROUPS.forEach(function (g) {
      var claims = grouped[g.key];
      if (!claims || claims.length === 0) return;
      var clusters = _clusterDuplicates(claims);

      html += '<div class="sr-group">'
        + '<div class="sr-group-header" data-sr-toggle="' + g.key + '">'
        +   '<span class="sr-group-icon">' + g.icon + '</span>'
        +   '<span class="sr-group-label">' + g.label + '</span>'
        +   '<span class="sr-group-count">' + claims.length + '</span>'
        +   '<span class="sr-group-chevron">▾</span>'
        + '</div>'
        + '<div class="sr-group-body">';

      clusters.forEach(function (cluster) {
        html += _renderClaimRow(cluster, sr);
      });

      html += '</div></div>';
    });
    html += '</div>';

    return html;
  }

  function _renderClaimRow(cluster, sr) {
    var claim = cluster.primary;
    var resolution = sr.resolutions[claim.id] || null;
    var dest = _destForClaim(claim);
    var confLabel = typeof claim.confidence === "number"
      ? (claim.confidence * 100).toFixed(0) + "%"
      : claim.confidence || "—";
    var isEditing = sr.editingClaimId === claim.id;
    var correction = sr.corrections[claim.id] || null;
    var resolvedCls = resolution ? " sr-claim-resolved" : "";
    if (resolution === "correct" || resolution === "correct_fu") resolvedCls = " sr-claim-corrected";

    var html = '<div class="sr-claim' + resolvedCls + '" data-sr-claim="' + _esc(claim.id) + '">'
      + '<div class="sr-claim-main">'
      +   '<div class="sr-claim-text">' + _esc(claim.text) + '</div>'
      +   (claim.snippet ? '<div class="sr-claim-snippet">' + _esc(claim.snippet) + '</div>' : '')
      +   '<div class="sr-claim-meta">'
      +     '<span class="sr-conf">' + _esc(confLabel) + '</span>'
      +     '<span class="sr-dest">' + _esc(dest) + '</span>'
      +     (cluster.isDuplicate ? '<span class="sr-dup-badge" data-sr-expand="' + _esc(claim.id) + '">+' + cluster.variants.length + ' similar</span>' : '')
      +   '</div>'
      + '</div>'
      + '<div class="sr-claim-actions">';

    ACTIONS.forEach(function (act) {
      var active = resolution === act.key ? " sr-act-active" : "";
      html += '<button class="sr-act ' + act.cls + active + '" data-sr-claim="' + _esc(claim.id) + '" data-sr-action="' + act.key + '">'
        + act.label + '</button>';
    });

    html += '</div></div>';

    // Inline correction editor (expands when Correct or Correct+FU is clicked)
    if (isEditing) {
      var destLocked = _isDestLocked(claim);
      var corrVal = correction ? (correction.value || "") : claim.text;
      var corrNote = correction ? (correction.note || "") : "";
      html += '<div class="sr-correction-editor" data-sr-editor="' + _esc(claim.id) + '">'
        + '<div class="sr-editor-row">'
        +   '<span class="sr-editor-label">Original</span>'
        +   '<span class="sr-editor-original">' + _esc(claim.text) + '</span>'
        + '</div>'
        + (claim.snippet ? '<div class="sr-editor-row"><span class="sr-editor-label">Source</span><span class="sr-editor-snippet">' + _esc(claim.snippet) + '</span></div>' : '')
        + '<div class="sr-editor-row">'
        +   '<span class="sr-editor-label">Corrected value</span>'
        +   '<input class="sr-editor-input" data-sr-corr-value="' + _esc(claim.id) + '" value="' + _esc(corrVal) + '" placeholder="Enter corrected value..." />'
        + '</div>'
        + '<div class="sr-editor-row">'
        +   '<span class="sr-editor-label">Destination</span>'
        +   '<span class="sr-editor-dest' + (destLocked ? ' sr-dest-locked' : '') + '">' + _esc(dest) + (destLocked ? ' (locked)' : '') + '</span>'
        + '</div>'
        + '<div class="sr-editor-row">'
        +   '<span class="sr-editor-label">Note (optional)</span>'
        +   '<input class="sr-editor-input sr-editor-note" data-sr-corr-note="' + _esc(claim.id) + '" value="' + _esc(corrNote) + '" placeholder="Reason for correction..." />'
        + '</div>'
        + '<div class="sr-editor-buttons">'
        +   '<button class="sr-btn sr-btn-save" data-sr-save="' + _esc(claim.id) + '">Save Correction</button>'
        +   '<button class="sr-btn sr-btn-savefu" data-sr-savefu="' + _esc(claim.id) + '">Save + Follow-up</button>'
        +   '<button class="sr-btn sr-btn-cancel" data-sr-cancel="' + _esc(claim.id) + '">Cancel</button>'
        + '</div>'
        + '</div>';
    }

    // Duplicate variants (collapsed by default)
    if (cluster.isDuplicate) {
      html += '<div class="sr-dup-variants sr-hidden" data-sr-variants="' + _esc(claim.id) + '">';
      cluster.variants.forEach(function (v) {
        html += '<div class="sr-dup-variant">'
          + '<span class="sr-dup-text">' + _esc(v.text) + '</span>'
          + '<span class="sr-dup-snippet">' + _esc(v.snippet) + '</span>'
          + '</div>';
      });
      html += '</div>';
    }

    return html;
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — RIGHT PANE (Resolved Outcomes)
  ─────────────────────────────────────────────────────────── */

  function _renderRightPane(sources) {
    var sr = _sr();
    var byAction = { approve: [], correct: [], correct_fu: [], source_only: [], reject: [] };

    sources.forEach(function (src) {
      src.claims.forEach(function (claim) {
        var res = sr.resolutions[claim.id];
        if (res && byAction[res]) {
          byAction[res].push(claim);
        }
      });
    });

    var totalResolved = Object.keys(sr.resolutions).length;
    var html = '<div class="sr-right-header">'
      + '<h3 class="sr-right-title">Resolved</h3>'
      + '<span class="sr-right-count">' + totalResolved + ' decision' + (totalResolved !== 1 ? 's' : '') + '</span>'
      + '</div>';

    // Approved — grouped by destination
    if (byAction.approve.length) {
      html += '<div class="sr-outcome-group">'
        + '<h4 class="sr-outcome-label sr-outcome-approve">Approved (' + byAction.approve.length + ')</h4>';
      var byDest = {};
      byAction.approve.forEach(function (c) {
        var d = _destForClaim(c);
        if (!byDest[d]) byDest[d] = [];
        byDest[d].push(c);
      });
      Object.keys(byDest).forEach(function (dest) {
        html += '<div class="sr-dest-group"><span class="sr-dest-label">' + _esc(dest) + '</span>';
        byDest[dest].forEach(function (c) {
          html += '<div class="sr-outcome-item">' + _esc(c.text) + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }

    // Corrected
    var allCorrected = byAction.correct.concat(byAction.correct_fu);
    if (allCorrected.length) {
      html += '<div class="sr-outcome-group">'
        + '<h4 class="sr-outcome-label sr-outcome-correct">Corrected (' + allCorrected.length + ')</h4>';
      allCorrected.forEach(function (c) {
        var corr = sr.corrections[c.id];
        var corrText = corr ? corr.value : c.text;
        var fu = sr.resolutions[c.id] === "correct_fu" ? ' <span class="sr-fu-flag">+ follow-up</span>' : '';
        html += '<div class="sr-outcome-item"><span class="sr-outcome-original">' + _esc(c.text) + '</span>'
          + ' → <strong>' + _esc(corrText) + '</strong>' + fu + '</div>';
      });
      html += '</div>';
    }

    // Follow-up (approve + follow-up, not correct + follow-up)
    if (byAction.follow_up && byAction.follow_up.length) {
      html += '<div class="sr-outcome-group">'
        + '<h4 class="sr-outcome-label sr-outcome-followup">Follow-up (' + byAction.follow_up.length + ')</h4>';
      byAction.follow_up.forEach(function (c) {
        html += '<div class="sr-outcome-item">' + _esc(c.text) + '</div>';
      });
      html += '</div>';
    }

    // Source only
    if (byAction.source_only.length) {
      html += '<div class="sr-outcome-group">'
        + '<h4 class="sr-outcome-label sr-outcome-sourceonly">Source Only (' + byAction.source_only.length + ')</h4>';
      byAction.source_only.forEach(function (c) {
        html += '<div class="sr-outcome-item">' + _esc(c.text) + '</div>';
      });
      html += '</div>';
    }

    // Rejected (collapsed)
    if (byAction.reject.length) {
      html += '<div class="sr-outcome-group sr-outcome-collapsed">'
        + '<h4 class="sr-outcome-label sr-outcome-reject">Rejected (' + byAction.reject.length + ')</h4>'
        + '</div>';
    }

    // Commit button
    if (totalResolved > 0) {
      html += '<button class="sr-commit-btn" id="srCommitBtn">Commit Resolutions</button>';
    }

    return html;
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — FULL SHELL
  ─────────────────────────────────────────────────────────── */

  function _renderShell(sources) {
    var sr = _sr();
    var activeSource = null;
    if (sr.activeSourceId) {
      activeSource = sources.find(function (s) { return s.id === sr.activeSourceId; });
    }

    return '<div class="sr-root">'
      + '<div class="sr-header">'
      +   '<h2 class="sr-title">Shadow Review</h2>'
      +   '<p class="sr-subtitle">Review sources and resolve claims. Each decision is yours — nothing is promoted automatically.</p>'
      + '</div>'
      + '<div class="sr-body">'
      +   '<div class="sr-left">' + _renderSourceList(sources) + '</div>'
      +   '<div class="sr-center">' + _renderCenterPane(activeSource) + '</div>'
      +   '<div class="sr-right">' + _renderRightPane(sources) + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ───────────────────────────────────────────────────────────
     EVENT BINDING
  ─────────────────────────────────────────────────────────── */

  function _bindEvents(root, sources) {
    if (!root) return;

    // Source selection
    root.querySelectorAll("[data-sr-source]").forEach(function (el) {
      el.addEventListener("click", function () {
        _sr().activeSourceId = el.getAttribute("data-sr-source");
        render();
      });
    });

    // Claim actions
    root.querySelectorAll("[data-sr-action]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var claimId = btn.getAttribute("data-sr-claim");
        var action = btn.getAttribute("data-sr-action");
        var sr = _sr();

        // Correct / Correct+FU: open inline editor
        if (action === "correct" || action === "correct_fu") {
          sr.editingClaimId = claimId;
          sr.resolutions[claimId] = action;
          render();
          return;
        }

        // Toggle: clicking same action again clears it
        if (sr.resolutions[claimId] === action) {
          delete sr.resolutions[claimId];
          sr.editingClaimId = null;
        } else {
          sr.resolutions[claimId] = action;
          sr.editingClaimId = null;
        }
        render();
      });
    });

    // Correction editor: Save
    root.querySelectorAll("[data-sr-save]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var claimId = btn.getAttribute("data-sr-save");
        _saveCorrectionFromEditor(root, claimId, false);
      });
    });

    // Correction editor: Save + Follow-up
    root.querySelectorAll("[data-sr-savefu]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var claimId = btn.getAttribute("data-sr-savefu");
        _saveCorrectionFromEditor(root, claimId, true);
      });
    });

    // Correction editor: Cancel
    root.querySelectorAll("[data-sr-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var claimId = btn.getAttribute("data-sr-cancel");
        var sr = _sr();
        delete sr.resolutions[claimId];
        delete sr.corrections[claimId];
        sr.editingClaimId = null;
        render();
      });
    });

    // Group toggle (collapse/expand)
    root.querySelectorAll("[data-sr-toggle]").forEach(function (header) {
      header.addEventListener("click", function () {
        var body = header.nextElementSibling;
        if (body) body.classList.toggle("sr-hidden");
        var chevron = header.querySelector(".sr-group-chevron");
        if (chevron) chevron.textContent = body && body.classList.contains("sr-hidden") ? "▸" : "▾";
      });
    });

    // Duplicate expand
    root.querySelectorAll("[data-sr-expand]").forEach(function (badge) {
      badge.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = badge.getAttribute("data-sr-expand");
        var variants = root.querySelector('[data-sr-variants="' + id + '"]');
        if (variants) variants.classList.toggle("sr-hidden");
      });
    });

    // Commit button
    var commitBtn = root.querySelector("#srCommitBtn");
    if (commitBtn) {
      commitBtn.addEventListener("click", function () {
        _commitResolutions(sources);
      });
    }
  }

  /* ───────────────────────────────────────────────────────────
     CORRECTION EDITOR SAVE HELPER
  ─────────────────────────────────────────────────────────── */

  function _saveCorrectionFromEditor(root, claimId, followUp) {
    var sr = _sr();
    var valueInput = root.querySelector('[data-sr-corr-value="' + claimId + '"]');
    var noteInput = root.querySelector('[data-sr-corr-note="' + claimId + '"]');
    var correctedValue = valueInput ? valueInput.value.trim() : "";
    var note = noteInput ? noteInput.value.trim() : "";

    if (!correctedValue) {
      // Flash the input red briefly
      if (valueInput) {
        valueInput.style.borderColor = "var(--br-bad)";
        setTimeout(function () { valueInput.style.borderColor = ""; }, 1500);
      }
      return;
    }

    sr.corrections[claimId] = {
      value: correctedValue,
      destination: null, // uses claim's default destination
      note: note,
      followUp: followUp
    };
    sr.resolutions[claimId] = followUp ? "correct_fu" : "correct";
    sr.editingClaimId = null;
    render();
  }

  /* ───────────────────────────────────────────────────────────
     COMMIT — Wire resolutions to existing pipelines
  ─────────────────────────────────────────────────────────── */

  async function _commitResolutions(sources) {
    var sr = _sr();
    var resolutions = sr.resolutions;
    var keys = Object.keys(resolutions);
    if (!keys.length) return;

    var committed = 0;
    var blocked = 0;

    for (var i = 0; i < keys.length; i++) {
      var claimId = keys[i];
      var action = resolutions[claimId];
      var claim = _findClaim(sources, claimId);
      if (!claim) continue;

      try {
        /* ── WO-13YZ: Correction path with conflict gate ── */
        if (action === "correct" || action === "correct_fu") {
          var corr = sr.corrections[claimId];
          if (!corr || !corr.value) continue;

          var fieldPath = claim.fieldPath || null;

          // Log disagreement: reviewer corrected the original value
          _logDisagreement(
            claimId,
            claim.displayValue || claim.title || "",
            corr.value,
            claim.sourceType || "unknown",
            action,
            corr.note
          );

          // Conflict gate: check if correction conflicts with questionnaire truth
          if (fieldPath) {
            var conflict = _detectConflict(fieldPath, corr.value);
            if (conflict.conflicting) {
              // Questionnaire always wins — block the write, create conflict entry
              sr.conflicts.push({
                id: "conflict:" + Date.now() + ":" + claimId,
                claimId: claimId,
                fieldPath: fieldPath,
                proposedValue: corr.value,
                existingValue: conflict.existingValue,
                isQuestionnaire: conflict.isQuestionnaire,
                sourceType: claim.sourceType || "unknown",
                note: corr.note,
                followUp: corr.followUp || false,
                claimTitle: claim.title || claim.displayValue || "",
                timestamp: new Date().toISOString(),
                resolution: null  // pending resolution in conflict console
              });
              blocked++;
              console.log("[shadow-review] Conflict blocked write for " + fieldPath
                + ": proposed=" + corr.value + " vs existing=" + conflict.existingValue);
              continue; // skip the write — will show in conflict console
            }

            // No conflict: write via projection-sync with human_edit authority
            var ps = global.LorevoxProjectionSync;
            if (ps && ps.projectValue) {
              ps.projectValue(fieldPath, corr.value, { source: "human_edit" });
              committed++;
            } else {
              console.warn("[shadow-review] projection-sync not available for " + fieldPath);
              committed++;
            }
          } else {
            // No fieldPath — candidate-based correction, promote with corrected value
            if (claim.candidateRef) {
              var review = global.LorevoxCandidateReview;
              if (review) {
                var found = _findCandidateInState(claim.candidateRef.id);
                if (found) {
                  // Update candidate data with corrected value before promoting
                  if (found.candidate.data) {
                    found.candidate.data._correctedValue = corr.value;
                    if (corr.note) found.candidate.data._correctionNote = corr.note;
                  }
                  review._promote(found.candidate, found.type);
                  review._removeFromPending(found.candidate.id);
                  committed++;
                }
              }
            } else {
              committed++;
            }
          }
          continue;
        }

        /* ── Standard actions (approve, reject, source_only) ── */

        // Log disagreement for reject actions
        if (action === "reject") {
          _logDisagreement(
            claimId,
            claim.displayValue || claim.title || "",
            null,
            claim.sourceType || "unknown",
            "reject",
            ""
          );
        }

        if (claim.truthRowRef) {
          // WO-13 truth row — use existing patch endpoint
          var statusMap = {
            approve: "approve",
            follow_up: "approve_q",
            source_only: "source_only",
            reject: "reject"
          };
          var status = statusMap[action] || "needs_verify";
          if (typeof global.wo13PatchRowStatus === "function") {
            var res = await global.wo13PatchRowStatus(claim.truthRowRef.id || claim.truthRowRef.row_id, status);
            if (res.ok) committed++;
          }
        } else if (claim.candidateRef) {
          // Bio Builder candidate — use existing approve/reject
          var review2 = global.LorevoxCandidateReview;
          if (review2) {
            if (action === "approve" || action === "follow_up") {
              var found2 = _findCandidateInState(claim.candidateRef.id);
              if (found2) {
                review2._promote(found2.candidate, found2.type);
                review2._removeFromPending(found2.candidate.id);
                committed++;
              }
            } else if (action === "reject") {
              review2._removeFromPending(claim.candidateRef.id);
              committed++;
            }
            // source_only = leave in place, don't promote
            if (action === "source_only") committed++;
          }
        } else {
          // Source card detected item — just track resolution
          committed++;
        }
      } catch (e) {
        console.warn("[shadow-review] commit error for claim " + claimId, e);
      }
    }

    // Track committed and clear resolutions
    sr.committed = sr.committed.concat(keys);
    sr.resolutions = {};
    sr.corrections = {};
    console.log("[shadow-review] Committed " + committed + "/" + keys.length
      + " resolutions (" + blocked + " blocked by conflicts)");

    // Refresh WO-13 review data
    if (typeof global.wo13ReloadReviewQueue === "function") {
      await global.wo13ReloadReviewQueue();
    }

    render();

    // If conflicts were generated, notify
    if (blocked > 0 && sr.conflicts.length > 0) {
      console.log("[shadow-review] " + blocked + " conflict(s) pending in Conflict Console");
      // Trigger conflict console refresh if available
      if (global.LorevoxConflictConsole && global.LorevoxConflictConsole.render) {
        global.LorevoxConflictConsole.render();
      }
    }
  }

  function _findClaim(sources, claimId) {
    for (var i = 0; i < sources.length; i++) {
      for (var j = 0; j < sources[i].claims.length; j++) {
        if (sources[i].claims[j].id === claimId) return sources[i].claims[j];
      }
    }
    return null;
  }

  function _findCandidateInState(candidateId) {
    var bb = _getBB();
    if (!bb || !bb.candidates) return null;
    var cats = bb.candidates;
    var types = ["people", "relationships", "memories", "events", "places", "documents"];
    for (var i = 0; i < types.length; i++) {
      var arr = cats[types[i]] || [];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].id === candidateId) return { candidate: arr[j], type: types[i], index: j };
      }
    }
    return null;
  }

  /* ───────────────────────────────────────────────────────────
     HELPERS
  ─────────────────────────────────────────────────────────── */

  function _formatTime(ts) {
    if (!ts) return "";
    try {
      var d = new Date(ts);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return String(ts); }
  }

  /* ───────────────────────────────────────────────────────────
     PUBLIC — render()
  ─────────────────────────────────────────────────────────── */

  var _cachedSources = [];

  function render(targetId) {
    _ensureState();
    var root = document.getElementById(targetId || ROOT_ID);
    if (!root) return;

    // Fetch truth rows if needed
    var pid = _getPersonId();
    if (pid && typeof global.wo13FetchRows === "function" && (!global._wo13State || !global._wo13State.rows || global._wo13State.rows.length === 0)) {
      global.wo13FetchRows(pid).then(function (rows) {
        if (global._wo13State) global._wo13State.rows = rows;
        _doRender(root);
      });
    } else {
      _doRender(root);
    }
  }

  function _doRender(root) {
    _cachedSources = _buildSources();
    root.innerHTML = _renderShell(_cachedSources);
    _bindEvents(root, _cachedSources);
  }

  function init(targetId) {
    _ensureState();
    render(targetId);
  }

  /* ───────────────────────────────────────────────────────────
     INLINE POST-CHAT PANEL (Part B)
  ─────────────────────────────────────────────────────────── */

  /**
   * Called after extraction completes with extracted items.
   * Shows a compact inline review panel near the chat log.
   * @param {Array} items - extracted field items from /api/extract-fields
   * @param {string} answerText - the original user message
   */
  function showInlineClaims(items, answerText) {
    if (!items || !items.length) return;

    // Remove any existing inline panel
    var existing = document.getElementById("srInlinePanel");
    if (existing) existing.remove();

    var panel = document.createElement("div");
    panel.id = "srInlinePanel";
    panel.className = "sr-inline-panel";

    var html = '<div class="sr-inline-header">'
      + '<span class="sr-inline-title">From this message:</span>'
      + '<button class="sr-inline-dismiss" id="srInlineDismiss">✕</button>'
      + '</div>'
      + '<div class="sr-inline-claims">';

    items.forEach(function (item, idx) {
      var claimId = "inline:" + Date.now() + ":" + idx;
      var fieldLabel = (item.fieldPath || "").replace(/\./g, " › ");
      html += '<div class="sr-inline-claim" data-sr-inline-idx="' + idx + '">'
        + '<div class="sr-inline-claim-text">'
        +   '<span class="sr-inline-field">' + _esc(fieldLabel) + '</span>'
        +   '<span class="sr-inline-value">' + _esc(item.value || "") + '</span>'
        + '</div>'
        + '<div class="sr-inline-actions">'
        +   '<button class="sr-iact sr-iact-approve" data-sr-iact="approve" data-sr-iidx="' + idx + '">Approve</button>'
        +   '<button class="sr-iact sr-iact-correct" data-sr-iact="correct" data-sr-iidx="' + idx + '">Correct</button>'
        +   '<button class="sr-iact sr-iact-hold" data-sr-iact="hold" data-sr-iidx="' + idx + '">Hold</button>'
        +   '<button class="sr-iact sr-iact-sourceonly" data-sr-iact="source_only" data-sr-iidx="' + idx + '">Source Only</button>'
        +   '<button class="sr-iact sr-iact-reject" data-sr-iact="reject" data-sr-iidx="' + idx + '">Reject</button>'
        + '</div>'
        + '</div>';
    });

    html += '</div>'
      + '<button class="sr-inline-open" id="srInlineOpenFull">Open in Shadow Review</button>';

    panel.innerHTML = html;

    // Insert into chat log
    var chatLog = document.getElementById("chatLog") || document.getElementById("chatMessages");
    if (chatLog) {
      chatLog.appendChild(panel);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    // Bind events
    var dismissBtn = panel.querySelector("#srInlineDismiss");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", function () { panel.remove(); });
    }

    var openBtn = panel.querySelector("#srInlineOpenFull");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        panel.remove();
        // Switch to Shadow Review tab in Bio Builder
        if (global.LorevoxBioBuilder && global.LorevoxBioBuilder._switchTab) {
          global.LorevoxBioBuilder._switchTab("shadowReview");
        }
        // Open Bio Builder popover if not open
        var bbPop = document.getElementById("bioBuilderPopover");
        if (bbPop && typeof bbPop.showPopover === "function") {
          try { bbPop.showPopover(); } catch (e) {}
        }
      });
    }

    // Inline action buttons
    panel.querySelectorAll("[data-sr-iact]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = btn.getAttribute("data-sr-iact");
        var idx = btn.getAttribute("data-sr-iidx");
        var row = btn.closest(".sr-inline-claim");
        if (!row) return;

        if (action === "correct") {
          // Toggle inline correction editor
          var existingEditor = row.querySelector(".sr-inline-corr-editor");
          if (existingEditor) {
            existingEditor.remove();
            btn.classList.remove("sr-iact-active");
            return;
          }
          // Remove any other editors in the panel
          panel.querySelectorAll(".sr-inline-corr-editor").forEach(function (e) { e.remove(); });
          panel.querySelectorAll(".sr-iact-correct").forEach(function (b) { b.classList.remove("sr-iact-active"); });

          btn.classList.add("sr-iact-active");
          var editor = document.createElement("div");
          editor.className = "sr-inline-corr-editor sr-correction-editor";
          editor.innerHTML = '<div class="sr-editor-row">'
            + '<span class="sr-editor-label">Corrected</span>'
            + '<input type="text" class="sr-editor-input" data-sr-icorr-value="' + idx + '"'
            + ' placeholder="Enter corrected value…" />'
            + '</div>'
            + '<div class="sr-editor-actions">'
            + '<button class="sr-btn-save" data-sr-icorr-save="' + idx + '">Save Correction</button>'
            + '<button class="sr-btn-cancel" data-sr-icorr-cancel="' + idx + '">Cancel</button>'
            + '</div>';
          row.appendChild(editor);

          // Bind save/cancel
          var saveBtn = editor.querySelector("[data-sr-icorr-save]");
          if (saveBtn) {
            saveBtn.addEventListener("click", function () {
              var input = editor.querySelector("[data-sr-icorr-value]");
              var val = input ? input.value.trim() : "";
              if (!val) {
                if (input) { input.style.borderColor = "var(--br-bad)"; setTimeout(function () { input.style.borderColor = ""; }, 1500); }
                return;
              }
              row.classList.add("sr-inline-resolved");
              row.setAttribute("data-sr-iresolved", "correct");
              // Show corrected value
              var textDiv = row.querySelector(".sr-inline-value");
              if (textDiv) {
                textDiv.innerHTML = '<s style="opacity:.5">' + textDiv.textContent + '</s>'
                  + ' <span style="color:#60a5fa;font-weight:600">' + _esc(val) + '</span>';
              }
              editor.remove();
            });
          }
          var cancelBtn = editor.querySelector("[data-sr-icorr-cancel]");
          if (cancelBtn) {
            cancelBtn.addEventListener("click", function () {
              editor.remove();
              btn.classList.remove("sr-iact-active");
            });
          }
          return;
        }

        // Standard actions
        row.classList.add("sr-inline-resolved");
        row.setAttribute("data-sr-iresolved", action);
        // Visual feedback
        btn.classList.add("sr-iact-active");
        row.querySelectorAll(".sr-iact").forEach(function (b) {
          if (b !== btn) b.classList.remove("sr-iact-active");
        });
        // Remove any open correction editor on this row
        var ed = row.querySelector(".sr-inline-corr-editor");
        if (ed) ed.remove();
      });
    });
  }

  /* ───────────────────────────────────────────────────────────
     MODULE EXPORT
  ─────────────────────────────────────────────────────────── */

  global.LorevoxShadowReview = {
    init: init,
    render: render,
    showInlineClaims: showInlineClaims,
    _buildSources: _buildSources,
    _groupClaims: _groupClaims,
    _clusterDuplicates: _clusterDuplicates,
    _commitResolutions: _commitResolutions,
    _ensureState: _ensureState,
    _getState: _sr,
    _detectConflict: _detectConflict,
    _getCurrentTruth: _getCurrentTruth,
    _logDisagreement: _logDisagreement
  };

})(typeof window !== "undefined" ? window : globalThis);
