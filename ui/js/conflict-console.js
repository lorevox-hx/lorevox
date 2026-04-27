/* ═══════════════════════════════════════════════════════════════
   conflict-console.js — WO-13YZ Conflict Console
   Lorevox 1.0

   Third lane of the Authority Workspace.
   Displays conflicts between corrections and existing questionnaire
   truth. Questionnaire always wins by default — "Keep Current" is
   the pre-selected default action.

   Layout: 3-column
     LEFT   — conflict list with severity badges
     CENTER — side-by-side comparison (current vs proposed)
     RIGHT  — resolution log + stats

   Resolution actions:
     Keep Current  — questionnaire truth stays (DEFAULT)
     Replace       — overwrite with proposed (human_edit authority)
     Merge         — manual merge value entered by reviewer
     Ambiguous     — flag for follow-up interview
     Follow-up     — keep current + schedule follow-up question

   Load order: after shadow-review.js, projection-sync.js
   Exposes: window.LorevoxConflictConsole
═══════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  if (global.LorevoxConflictConsole) return;

  var ROOT_ID = "conflictConsoleRoot";

  /* ───────────────────────────────────────────────────────────
     CONSTANTS
  ─────────────────────────────────────────────────────────── */

  var RESOLUTIONS = [
    { key: "keep",      label: "Keep Current",  cls: "cc-res-keep",      desc: "Questionnaire truth stays" },
    { key: "replace",   label: "Replace",        cls: "cc-res-replace",   desc: "Overwrite with proposed value" },
    { key: "merge",     label: "Merge",          cls: "cc-res-merge",     desc: "Enter merged value" },
    { key: "ambiguous", label: "Ambiguous",      cls: "cc-res-ambiguous", desc: "Flag — needs more info" },
    { key: "follow_up", label: "Follow-up",      cls: "cc-res-followup",  desc: "Keep current + ask later" }
  ];

  /* ───────────────────────────────────────────────────────────
     STATE
  ─────────────────────────────────────────────────────────── */

  var _ccState = null;
  function _ensureState() {
    if (!_ccState) {
      _ccState = {
        activeConflictId: null,
        resolutions: {},      // conflictId → { action, mergedValue?, note? }
        committed: []
      };
    }
    return _ccState;
  }
  function _cc() { return _ensureState(); }

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ───────────────────────────────────────────────────────────
     DATA — Pull conflicts from shadow review state
  ─────────────────────────────────────────────────────────── */

  function _getConflicts() {
    var sr = global.LorevoxShadowReview;
    if (!sr || !sr._getState) return [];
    var state = sr._getState();
    return (state && state.conflicts) ? state.conflicts : [];
  }

  function _getPendingConflicts() {
    var all = _getConflicts();
    var cc = _cc();
    return all.filter(function (c) {
      return !cc.resolutions[c.id] && cc.committed.indexOf(c.id) < 0;
    });
  }

  function _getResolvedConflicts() {
    var all = _getConflicts();
    var cc = _cc();
    return all.filter(function (c) {
      return !!cc.resolutions[c.id] || cc.committed.indexOf(c.id) >= 0;
    });
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — Left Pane (Conflict List)
  ─────────────────────────────────────────────────────────── */

  function _renderConflictList(conflicts) {
    var cc = _cc();
    if (!conflicts.length) {
      return '<div class="cc-empty">No conflicts detected.<br>'
        + '<span class="cc-empty-sub">All corrections are consistent with questionnaire truth.</span></div>';
    }

    var html = '<div class="cc-list-header">Conflicts (' + conflicts.length + ')</div>';
    conflicts.forEach(function (c) {
      var isActive = cc.activeConflictId === c.id;
      var isResolved = !!cc.resolutions[c.id];
      var cls = "cc-conflict-card" + (isActive ? " cc-active" : "") + (isResolved ? " cc-resolved" : "");
      var badge = isResolved ? '<span class="cc-badge cc-badge-resolved">RESOLVED</span>'
                             : '<span class="cc-badge cc-badge-pending">PENDING</span>';

      html += '<div class="' + cls + '" data-cc-id="' + _esc(c.id) + '">'
        + '<div class="cc-card-title">' + _esc(c.claimTitle || c.fieldPath || "Unknown") + '</div>'
        + '<div class="cc-card-field">' + _esc((c.fieldPath || "").replace(/\./g, " › ")) + '</div>'
        + badge
        + '</div>';
    });
    return html;
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — Center Pane (Comparison + Actions)
  ─────────────────────────────────────────────────────────── */

  function _renderCenterPane(conflict) {
    if (!conflict) {
      return '<div class="cc-empty">Select a conflict from the left panel to review.</div>';
    }

    var cc = _cc();
    var resolution = cc.resolutions[conflict.id] || null;

    var html = '<div class="cc-compare-header">'
      + '<span class="cc-compare-label">Field: </span>'
      + '<span class="cc-compare-path">' + _esc((conflict.fieldPath || "").replace(/\./g, " › ")) + '</span>'
      + '</div>';

    // Side-by-side comparison
    html += '<div class="cc-compare-grid">'
      + '<div class="cc-compare-box cc-compare-current">'
      +   '<div class="cc-compare-box-label">Current (Questionnaire)</div>'
      +   '<div class="cc-compare-box-value">' + _esc(conflict.existingValue || "—") + '</div>'
      +   '<div class="cc-compare-box-source">Source: Questionnaire (approved truth)</div>'
      + '</div>'
      + '<div class="cc-compare-vs">VS</div>'
      + '<div class="cc-compare-box cc-compare-proposed">'
      +   '<div class="cc-compare-box-label">Proposed (Correction)</div>'
      +   '<div class="cc-compare-box-value">' + _esc(conflict.proposedValue || "—") + '</div>'
      +   '<div class="cc-compare-box-source">Source: ' + _esc(conflict.sourceType || "Shadow Review") + '</div>'
      + '</div>'
      + '</div>';

    // Note from correction
    if (conflict.note) {
      html += '<div class="cc-note">'
        + '<span class="cc-note-label">Reviewer note:</span> '
        + _esc(conflict.note)
        + '</div>';
    }

    // Resolution actions
    html += '<div class="cc-actions-header">Resolution</div>';
    html += '<div class="cc-actions">';
    RESOLUTIONS.forEach(function (r) {
      var isActive = resolution && resolution.action === r.key;
      var cls = r.cls + (isActive ? " cc-res-active" : "");
      html += '<button class="cc-res-btn ' + cls + '" data-cc-action="' + r.key
        + '" data-cc-conflict="' + _esc(conflict.id) + '"'
        + ' title="' + _esc(r.desc) + '">'
        + _esc(r.label)
        + '</button>';
    });
    html += '</div>';

    // Merge input (shown when merge is selected)
    if (resolution && resolution.action === "merge") {
      html += '<div class="cc-merge-editor">'
        + '<div class="cc-editor-row">'
        +   '<span class="cc-editor-label">Merged value</span>'
        +   '<input type="text" class="cc-editor-input" data-cc-merge-value="' + _esc(conflict.id) + '"'
        +     ' value="' + _esc(resolution.mergedValue || "") + '"'
        +     ' placeholder="Enter the correct merged value…" />'
        + '</div>'
        + '</div>';
    }

    // Default callout: questionnaire always wins
    if (!resolution || resolution.action === "keep") {
      html += '<div class="cc-default-notice">'
        + '🛡️ Default: <strong>Questionnaire always wins.</strong> '
        + 'The current value will be preserved unless you explicitly choose Replace or Merge.'
        + '</div>';
    }

    return html;
  }

  /* ───────────────────────────────────────────────────────────
     RENDERING — Right Pane (Resolution Log)
  ─────────────────────────────────────────────────────────── */

  function _renderRightPane() {
    var cc = _cc();
    var all = _getConflicts();
    var resolvedCount = Object.keys(cc.resolutions).length;
    var committedCount = cc.committed.length;
    var totalCount = all.length;

    var html = '<div class="cc-right-header">'
      + '<span class="cc-right-stat">' + resolvedCount + ' resolved</span>'
      + '<span class="cc-right-stat">' + committedCount + ' committed</span>'
      + '<span class="cc-right-stat">' + (totalCount - resolvedCount - committedCount) + ' pending</span>'
      + '</div>';

    // Resolution summary by action
    var byAction = {};
    var rkeys = Object.keys(cc.resolutions);
    rkeys.forEach(function (cid) {
      var r = cc.resolutions[cid];
      if (!byAction[r.action]) byAction[r.action] = [];
      byAction[r.action].push(cid);
    });

    RESOLUTIONS.forEach(function (rDef) {
      var items = byAction[rDef.key];
      if (!items || !items.length) return;
      html += '<div class="cc-right-group">'
        + '<div class="cc-right-group-label ' + rDef.cls + '">'
        + _esc(rDef.label) + ' (' + items.length + ')</div>';
      items.forEach(function (cid) {
        var c = all.find(function (x) { return x.id === cid; });
        if (c) {
          html += '<div class="cc-right-item">'
            + _esc(c.claimTitle || c.fieldPath || cid)
            + '</div>';
        }
      });
      html += '</div>';
    });

    // Commit button
    if (resolvedCount > 0 && resolvedCount > committedCount) {
      html += '<button class="cc-commit-btn" id="ccCommitBtn">'
        + 'Commit ' + resolvedCount + ' Resolution' + (resolvedCount > 1 ? 's' : '')
        + '</button>';
    }

    return html;
  }

  /* ───────────────────────────────────────────────────────────
     MAIN RENDER
  ─────────────────────────────────────────────────────────── */

  function render(targetId) {
    _ensureState();
    var root = document.getElementById(targetId || ROOT_ID);
    if (!root) return;

    var conflicts = _getConflicts();
    var cc = _cc();

    // Find active conflict
    var activeConflict = null;
    if (cc.activeConflictId) {
      activeConflict = conflicts.find(function (c) { return c.id === cc.activeConflictId; }) || null;
    }
    // Auto-select first pending if nothing selected
    if (!activeConflict && conflicts.length > 0) {
      var pending = _getPendingConflicts();
      if (pending.length > 0) {
        activeConflict = pending[0];
        cc.activeConflictId = activeConflict.id;
      } else {
        activeConflict = conflicts[0];
        cc.activeConflictId = activeConflict.id;
      }
    }

    var html = '<div class="cc-panel">'
      + '<div class="cc-header">'
      +   '<span class="cc-header-title">⚠️ Conflict Console</span>'
      +   '<span class="cc-header-count">'
      +     conflicts.length + ' conflict' + (conflicts.length !== 1 ? 's' : '')
      +   '</span>'
      + '</div>'
      + '<div class="cc-body">'
      +   '<div class="cc-left">' + _renderConflictList(conflicts) + '</div>'
      +   '<div class="cc-center">' + _renderCenterPane(activeConflict) + '</div>'
      +   '<div class="cc-right">' + _renderRightPane() + '</div>'
      + '</div>'
      + '</div>';

    root.innerHTML = html;
    _bindEvents(root, conflicts);
  }

  /* ───────────────────────────────────────────────────────────
     EVENT BINDING
  ─────────────────────────────────────────────────────────── */

  function _bindEvents(root, conflicts) {
    var cc = _cc();

    // Conflict card selection
    root.querySelectorAll("[data-cc-id]").forEach(function (card) {
      card.addEventListener("click", function () {
        cc.activeConflictId = card.getAttribute("data-cc-id");
        render();
      });
    });

    // Resolution action buttons
    root.querySelectorAll("[data-cc-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = btn.getAttribute("data-cc-action");
        var conflictId = btn.getAttribute("data-cc-conflict");
        if (!conflictId) return;

        var existing = cc.resolutions[conflictId];

        // Toggle off if clicking same action
        if (existing && existing.action === action) {
          delete cc.resolutions[conflictId];
        } else {
          cc.resolutions[conflictId] = {
            action: action,
            mergedValue: (existing && existing.mergedValue) || "",
            note: ""
          };
        }
        render();
      });
    });

    // Merge value input — save on change
    root.querySelectorAll("[data-cc-merge-value]").forEach(function (input) {
      var conflictId = input.getAttribute("data-cc-merge-value");
      input.addEventListener("input", function () {
        var res = cc.resolutions[conflictId];
        if (res) {
          res.mergedValue = input.value;
        }
      });
      // Auto-focus
      input.focus();
    });

    // Commit button
    var commitBtn = root.querySelector("#ccCommitBtn");
    if (commitBtn) {
      commitBtn.addEventListener("click", function () {
        _commitConflictResolutions(conflicts);
      });
    }
  }

  /* ───────────────────────────────────────────────────────────
     COMMIT — Apply conflict resolutions
  ─────────────────────────────────────────────────────────── */

  async function _commitConflictResolutions(conflicts) {
    var cc = _cc();
    var resKeys = Object.keys(cc.resolutions);
    if (!resKeys.length) return;

    var committed = 0;
    var ps = global.LorevoxProjectionSync;
    var sr = global.LorevoxShadowReview;

    for (var i = 0; i < resKeys.length; i++) {
      var conflictId = resKeys[i];
      var resolution = cc.resolutions[conflictId];
      var conflict = conflicts.find(function (c) { return c.id === conflictId; });
      if (!conflict) continue;

      try {
        switch (resolution.action) {
          case "keep":
          case "follow_up":
            // Questionnaire wins — no write needed
            // Log that the correction was overruled
            if (sr && sr._logDisagreement) {
              sr._logDisagreement(
                conflict.claimId,
                conflict.existingValue,
                conflict.proposedValue,
                conflict.sourceType,
                "conflict_keep_current",
                resolution.note || ""
              );
            }
            committed++;
            break;

          case "replace":
            // Overwrite questionnaire with proposed value (human_edit authority)
            if (ps && ps.projectValue && conflict.fieldPath) {
              ps.projectValue(conflict.fieldPath, conflict.proposedValue, { source: "human_edit" });
              if (sr && sr._logDisagreement) {
                sr._logDisagreement(
                  conflict.claimId,
                  conflict.existingValue,
                  conflict.proposedValue,
                  conflict.sourceType,
                  "conflict_replace",
                  "Questionnaire truth overridden by reviewer"
                );
              }
            }
            committed++;
            break;

          case "merge":
            // Write the reviewer's merged value
            var mergedVal = (resolution.mergedValue || "").trim();
            if (mergedVal && ps && ps.projectValue && conflict.fieldPath) {
              ps.projectValue(conflict.fieldPath, mergedVal, { source: "human_edit" });
              if (sr && sr._logDisagreement) {
                sr._logDisagreement(
                  conflict.claimId,
                  conflict.existingValue,
                  mergedVal,
                  conflict.sourceType,
                  "conflict_merge",
                  "Merged: existing=" + conflict.existingValue + ", proposed=" + conflict.proposedValue
                );
              }
            }
            committed++;
            break;

          case "ambiguous":
            // Just flag — no write
            if (sr && sr._logDisagreement) {
              sr._logDisagreement(
                conflict.claimId,
                conflict.existingValue,
                conflict.proposedValue,
                conflict.sourceType,
                "conflict_ambiguous",
                "Flagged as ambiguous — needs more information"
              );
            }
            committed++;
            break;
        }

        // Update conflict object with resolution
        conflict.resolution = resolution.action;
      } catch (e) {
        console.warn("[conflict-console] commit error for " + conflictId, e);
      }
    }

    // Track committed and clear
    cc.committed = cc.committed.concat(resKeys);
    cc.resolutions = {};
    console.log("[conflict-console] Committed " + committed + "/" + resKeys.length + " conflict resolutions");

    render();
  }

  /* ───────────────────────────────────────────────────────────
     INIT
  ─────────────────────────────────────────────────────────── */

  function init(targetId) {
    render(targetId);
  }

  /* ───────────────────────────────────────────────────────────
     MODULE EXPORT
  ─────────────────────────────────────────────────────────── */

  global.LorevoxConflictConsole = {
    init: init,
    render: render,
    _getConflicts: _getConflicts,
    _getPendingConflicts: _getPendingConflicts,
    _commitConflictResolutions: _commitConflictResolutions,
    _ensureState: _ensureState
  };

})(typeof window !== "undefined" ? window : this);
