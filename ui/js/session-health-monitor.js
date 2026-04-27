/* ═══════════════════════════════════════════════════════════════
   session-health-monitor.js — WO-SESSION-HEALTH-MONITOR-01

   Calm operator-facing health view that sits on top of the existing
   UI Health Check (window.lvUiHealthCheck).  Bug Panel stays as the
   deep diagnostic tool; this layer answers ONE question for the
   operator: "Is this session ready, ready-with-notes, or hold?"

   Hard rules:
     - No backend changes.
     - Pure observations — never mutate session/narrator state.
     - Three states only: GREEN / AMBER / RED.
     - Lightweight refresh — no expensive checks every 30s.
     - Bug Panel deep diagnostics remain available unchanged.

   Public API (window.lvSessionHealthMonitor):
     runReadyCheck()  — full preflight; runs lvUiHealthCheck.runAll() then classifies
     runWrapUp()      — full check + export zip + operator log .md download
     getStatus()      — last cached classification
     start()          — begin background refresh interval
     stop()           — end background refresh interval

   Load order: AFTER ui-health-check.js + archive-writer.js.
═══════════════════════════════════════════════════════════════ */

window.lvSessionHealthMonitor = (function () {
  "use strict";

  // ── Classification rules (per WO-SESSION-HEALTH-MONITOR-01 spec) ──
  // Categories whose FAILs are blocking (RED).
  const _RED_CATEGORIES = new Set([
    "startup", "operator", "switch", "session", "archive",
    "mic",       // mic preflight FAIL is RED
  ]);
  // Specific check-name fragments that are blocking regardless of category.
  const _RED_NAME_FRAGMENTS = [
    /BB person scope/i,
    /BB questionnaire identity/i,
    /BB localStorage draft key/i,
    /BB narrator-switch generation/i,
    /transcript writer wiring/i,
    /archive feature enabled/i,
    /session_id stamped/i,
    /audio preflight overall/i,
  ];
  // Specific check-name fragments that are EXPLICITLY downgraded to AMBER
  // even if they FAIL (per spec "do not block on" list).
  const _DOWNGRADE_TO_AMBER_FRAGMENTS = [
    /Photos/i,
    /Memory River/i, /Life Map/i, /Peek at Memoir/i,
    /Media Tab/i, /Disabled note state/i,
    /hands-free state fields/i,
    /face mesh/i, /faceMesh/i, /emotion engine/i,
    /Take-a-break overlay/i,
  ];
  // Conditions that trigger AMBER on their own (not RED, not GREEN).
  const _AMBER_HINTS = [
    /no archive session yet/i,
    /no writes yet this session/i,
    /no narrator load yet this session/i,
    /no questionnaire_first switch yet/i,
    /lazy init/i, /preflight stale/i,
  ];

  // ── Cached state ─────────────────────────────────────────────────
  let _lastStatus = {
    status: "GREEN",
    reasons: [],
    details: [],
    ts: null,
    sourceResultsCount: 0,
    narrator: null,
    person_id: null,
    session_id: null,
  };
  let _refreshTimer = null;
  const _REFRESH_INTERVAL_MS = 30_000;

  // ── Helpers ─────────────────────────────────────────────────────
  function _now() { return new Date().toISOString(); }

  function _narratorName() {
    try {
      if (typeof state !== "undefined" && state.profile && state.profile.basics) {
        return state.profile.basics.preferredName || state.profile.basics.fullName ||
               state.profile.basics.preferred || state.profile.basics.fullname || null;
      }
    } catch (_) {}
    return null;
  }

  function _personId() {
    try { return (typeof state !== "undefined" && state.person_id) ? state.person_id : null; }
    catch (_) { return null; }
  }

  function _convId() {
    try { return (typeof state !== "undefined" && state.chat && state.chat.conv_id) ? state.chat.conv_id : null; }
    catch (_) { return null; }
  }

  function _matchesAny(text, patterns) {
    if (!text) return false;
    for (const p of patterns) {
      if (p.test(text)) return true;
    }
    return false;
  }

  function _classifyResult(r) {
    // Returns "RED" | "AMBER" | "GREEN" | "IGNORE" for a single harness row.
    if (!r) return "IGNORE";
    const status = r.status;
    const name = r.name || "";
    const cat = r.category || "";
    // PASS / SKIP / DISABLED / NOT_INSTALLED / INFO are all GREEN-equivalent
    // unless the spec says otherwise.
    if (status === "PASS") return "GREEN";
    // DISABLED / NOT_INSTALLED for Photos and similar feature-flagged things → AMBER, never RED.
    if (status === "DISABLED" || status === "NOT_INSTALLED") {
      if (_matchesAny(name, _DOWNGRADE_TO_AMBER_FRAGMENTS)) return "AMBER";
      // unknown disabled feature → AMBER, not RED
      return "AMBER";
    }
    if (status === "SKIP" || status === "INFO") {
      // these are observational; no narrator → AMBER
      if (/no narrator/i.test(r.detail || "") || /pick a narrator/i.test(r.detail || "")) return "AMBER";
      return "GREEN";
    }
    if (status === "WARN") {
      // WARN on AMBER-list categories → AMBER.  WARN elsewhere → AMBER (be permissive on WARN).
      return "AMBER";
    }
    if (status === "FAIL") {
      // FAIL — check if explicitly downgraded.
      if (_matchesAny(name, _DOWNGRADE_TO_AMBER_FRAGMENTS)) return "AMBER";
      // FAIL inside a RED category → RED.
      if (_RED_CATEGORIES.has(cat)) return "RED";
      // FAIL with a known RED name fragment → RED.
      if (_matchesAny(name, _RED_NAME_FRAGMENTS)) return "RED";
      // Otherwise FAIL is RED by default (spec leans cautious).
      return "RED";
    }
    return "GREEN";
  }

  function _classifyResults(results) {
    let red = [], amber = [], green = 0;
    (results || []).forEach((r) => {
      const cls = _classifyResult(r);
      if (cls === "RED") red.push(r);
      else if (cls === "AMBER") amber.push(r);
      else if (cls === "GREEN") green++;
    });
    let status = "GREEN";
    if (red.length > 0) status = "RED";
    else if (amber.length > 0) status = "AMBER";
    return { status, red, amber, greenCount: green };
  }

  function _summarizeReasons(red, amber, status) {
    // Return up to 3 short human-readable reasons for the card subtext.
    const reasons = [];
    const list = (status === "RED") ? red : amber;
    for (const r of list) {
      const short = (r.name || "").replace(/\(.*\)$/, "").trim();
      // Use detail when meaningful, else just the check name.
      const detail = (r.detail || "").trim();
      const short_detail = detail.length > 70 ? detail.slice(0, 67) + "..." : detail;
      reasons.push(short + (short_detail ? ": " + short_detail : ""));
      if (reasons.length >= 3) break;
    }
    return reasons;
  }

  // ── Pre-flight gates that the harness alone can't fully cover ──
  function _gateActiveNarrator() {
    const pid = _personId();
    if (!pid) {
      return { status: "RED", reason: "Choose a narrator first", detail: "no active person_id" };
    }
    return { status: "GREEN", reason: null, detail: "narrator selected: " + pid.slice(0, 8) };
  }

  function _gateBbScope() {
    try {
      const bb = (typeof state !== "undefined") ? state.bioBuilder : null;
      const stPid = _personId();
      if (!bb || !stPid) return { status: "GREEN", reason: null }; // covered by narrator gate
      if (bb.personId && bb.personId !== stPid) {
        return {
          status: "RED",
          reason: "Bio Builder scope mismatch",
          detail: "bb.personId=" + (bb.personId || "null").slice(0, 8) + " vs state.person_id=" + stPid.slice(0, 8),
        };
      }
    } catch (_) {}
    return { status: "GREEN", reason: null };
  }

  function _gateArchiveWriter() {
    const aw = window.lvArchiveWriter;
    if (!aw || aw.loaded !== true) {
      return {
        status: "RED",
        reason: "Archive writer not loaded",
        detail: "window.lvArchiveWriter missing — transcripts won't write",
      };
    }
    if (aw.isEnabled() === false) {
      return {
        status: "RED",
        reason: "Archive disabled",
        detail: "set LOREVOX_ARCHIVE_ENABLED=1 + restart",
      };
    }
    const stats = aw.stats();
    if (stats.fails && (stats.narrator_writes + stats.lori_writes) > 0) {
      const failRate = stats.fails / (stats.narrator_writes + stats.lori_writes);
      if (failRate > 0.1) {
        return {
          status: "RED",
          reason: "Archive write failures",
          detail: "fails=" + stats.fails + " of " + (stats.narrator_writes + stats.lori_writes) + " writes",
        };
      }
    }
    if ((stats.narrator_writes + stats.lori_writes) === 0) {
      return {
        status: "AMBER",
        reason: "No transcript turns yet",
        detail: "talk in the narrator session to start the transcript",
      };
    }
    return { status: "GREEN", reason: null };
  }

  // ── Core entry: full preflight ───────────────────────────────────
  async function runReadyCheck(opts) {
    const ts = _now();
    if (!window.lvUiHealthCheck) {
      const out = {
        status: "RED",
        reasons: ["UI Health Check not loaded"],
        details: ["window.lvUiHealthCheck missing — open the Bug Panel to verify ui-health-check.js loaded"],
        ts,
        sourceResultsCount: 0,
        narrator: _narratorName(),
        person_id: _personId(),
        session_id: _convId(),
      };
      _lastStatus = out;
      _renderCard(out);
      return out;
    }
    // Run the harness in full.  runAll() returns the results array directly.
    let results = [];
    try {
      const ret = await window.lvUiHealthCheck.runAll();
      if (Array.isArray(ret)) results = ret;
    } catch (e) {
      const out = {
        status: "RED",
        reasons: ["Health Check threw"],
        details: [String(e && e.message || e)],
        ts,
        sourceResultsCount: 0,
        narrator: _narratorName(),
        person_id: _personId(),
        session_id: _convId(),
      };
      _lastStatus = out;
      _renderCard(out);
      return out;
    }

    // Apply gates that combine with results.
    const gate1 = _gateActiveNarrator();
    const gate2 = _gateBbScope();
    const gate3 = _gateArchiveWriter();

    const cls = _classifyResults(results);

    // Promote gates into the classification.
    if (gate1.status === "RED") cls.red.push({ category: "gate", name: gate1.reason, detail: gate1.detail });
    if (gate2.status === "RED") cls.red.push({ category: "gate", name: gate2.reason, detail: gate2.detail });
    if (gate3.status === "RED") cls.red.push({ category: "gate", name: gate3.reason, detail: gate3.detail });
    if (gate3.status === "AMBER") cls.amber.push({ category: "gate", name: gate3.reason, detail: gate3.detail });

    // Recompute final status.
    let status = "GREEN";
    if (cls.red.length > 0) status = "RED";
    else if (cls.amber.length > 0) status = "AMBER";

    const reasons = _summarizeReasons(cls.red, cls.amber, status);
    const details = [
      "topline: " + cls.greenCount + " PASS · " + cls.amber.length + " AMBER · " + cls.red.length + " RED",
      "narrator: " + (_narratorName() || "(none)"),
      "person_id: " + ((_personId() || "(none)").slice(0, 8)),
      "conv_id: " + ((_convId() || "(none)").slice(0, 16)),
    ];

    const out = {
      status, reasons, details, ts,
      sourceResultsCount: results.length,
      narrator: _narratorName(),
      person_id: _personId(),
      session_id: _convId(),
      _red: cls.red.map((r) => ({ category: r.category, name: r.name, detail: r.detail })),
      _amber: cls.amber.map((r) => ({ category: r.category, name: r.name, detail: r.detail })),
    };
    _lastStatus = out;
    _renderCard(out);
    return out;
  }

  // ── Wrap-up: full check + export + operator log ─────────────────
  async function runWrapUp() {
    console.log("[shm] Wrap Up Session: starting…");
    const result = await runReadyCheck({ wrapUp: true });
    let exportFilename = null;
    let exportError = null;
    if (typeof window.lvExportCurrentSessionArchive === "function") {
      try {
        // The export helper does the download itself; we just need to know it ran.
        const beforeStat = (window.lvArchiveWriter && window.lvArchiveWriter.stats()) || null;
        await window.lvExportCurrentSessionArchive();
        // We don't get the filename back from the helper; reconstruct expected pattern.
        const pid = _personId();
        if (pid) {
          exportFilename = "lorevox_archive_" + pid.slice(0, 8) + "*.zip";
        }
      } catch (e) {
        exportError = String(e && e.message || e);
      }
    } else {
      exportError = "lvExportCurrentSessionArchive helper not available";
    }
    // Build operator log markdown.
    const md = _buildOperatorLog(result, { exportFilename, exportError });
    const fname = "OPERATOR-LOG-" + new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19) + ".md";
    _downloadText(md, fname, "text/markdown");
    console.log("[shm] Wrap Up Session: complete. Status=" + result.status + " export=" + (exportFilename || "(none)"));
    return { result, exportFilename, exportError, operatorLog: fname };
  }

  function _buildOperatorLog(result, extra) {
    const lines = [];
    lines.push("# Operator Log");
    lines.push("");
    lines.push("- timestamp: " + result.ts);
    lines.push("- narrator: " + (result.narrator || "(none)"));
    lines.push("- person_id: " + (result.person_id || "(none)"));
    lines.push("- session_id (conv_id): " + (result.session_id || "(none)"));
    lines.push("- session_style: " + ((typeof state !== "undefined" && state.session && state.session.sessionStyle) || "(none)"));
    lines.push("- health status: **" + result.status + "**");
    lines.push("");
    lines.push("## Health summary");
    lines.push("");
    if (result.details && result.details.length) {
      result.details.forEach((d) => lines.push("- " + d));
    }
    lines.push("");
    if (result._red && result._red.length) {
      lines.push("## RED — must fix before next session");
      lines.push("");
      result._red.forEach((r) => {
        lines.push("- **" + (r.name || "(unknown)") + "** (" + (r.category || "?") + ") — " + (r.detail || ""));
      });
      lines.push("");
    }
    if (result._amber && result._amber.length) {
      lines.push("## AMBER — notes / non-blocking");
      lines.push("");
      result._amber.forEach((r) => {
        lines.push("- **" + (r.name || "(unknown)") + "** (" + (r.category || "?") + ") — " + (r.detail || ""));
      });
      lines.push("");
    }
    lines.push("## Archive export");
    lines.push("");
    if (extra && extra.exportFilename) {
      lines.push("- triggered: yes");
      lines.push("- expected pattern: `" + extra.exportFilename + "`");
      lines.push("- look in your browser's download folder");
    } else if (extra && extra.exportError) {
      lines.push("- triggered: failed");
      lines.push("- error: " + extra.exportError);
    }
    lines.push("");
    lines.push("## Next recommended action");
    lines.push("");
    if (result.status === "GREEN") {
      lines.push("- All gates green. Proceed with next test session or parent session.");
    } else if (result.status === "AMBER") {
      lines.push("- Ready with notes. Review the AMBER items above; non-blocking but worth knowing.");
    } else {
      lines.push("- HOLD. Resolve RED items above before running another session.");
    }
    return lines.join("\n");
  }

  function _downloadText(text, filename, mimeType) {
    try {
      const blob = new Blob([text], { type: mimeType || "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 5000);
      return true;
    } catch (e) {
      console.warn("[shm] _downloadText failed:", e);
      return false;
    }
  }

  // ── Render the Operator-tab card ────────────────────────────────
  function _renderCard(s) {
    if (!s) s = _lastStatus;
    const card = document.getElementById("lvSessionHealthCard");
    if (!card) return;
    card.setAttribute("data-status", s.status);
    const labelEl = document.getElementById("lvSessionHealthLabel");
    const subEl = document.getElementById("lvSessionHealthSub");
    const tsEl = document.getElementById("lvSessionHealthTs");
    if (labelEl) {
      labelEl.textContent = (s.status === "GREEN") ? "Ready"
        : (s.status === "AMBER") ? "Ready with notes"
        : "Hold";
    }
    if (subEl) {
      const tail = (s.reasons && s.reasons.length) ? s.reasons.join(" · ") : "";
      const baseLine = (s.status === "GREEN") ? "All gates green for this narrator."
        : (s.status === "AMBER") ? "Notes (non-blocking):"
        : "Resolve before next session:";
      subEl.textContent = tail ? (baseLine + " " + tail) : baseLine;
    }
    if (tsEl) {
      tsEl.textContent = "Last check: " + (s.ts ? s.ts.slice(11, 19) : "—");
    }
    // Update the small live pill in the operator header (if present).
    const pill = document.getElementById("lvSessionHealthPill");
    if (pill) {
      pill.setAttribute("data-status", s.status);
      pill.textContent = "Session: " + s.status;
      pill.title = (s.reasons || []).join("; ") || s.status;
    }
  }

  // ── Lightweight live-pill refresh (no full harness) ─────────────
  function _liveRefresh() {
    try {
      // Fast checks only — no fetches.
      const stPid = _personId();
      if (!stPid) {
        _renderCard({
          status: "AMBER",
          reasons: ["No active narrator"],
          details: [], ts: _now(),
          sourceResultsCount: 0, narrator: null, person_id: null, session_id: null,
        });
        return;
      }
      // Bb scope quick check
      const bbCheck = _gateBbScope();
      if (bbCheck.status === "RED") {
        _renderCard({
          status: "RED",
          reasons: [bbCheck.reason + " — " + (bbCheck.detail || "")],
          details: [], ts: _now(),
          sourceResultsCount: 0, narrator: _narratorName(), person_id: stPid, session_id: _convId(),
        });
        return;
      }
      // Archive writer quick check
      const awCheck = _gateArchiveWriter();
      if (awCheck.status === "RED") {
        _renderCard({
          status: "RED",
          reasons: [awCheck.reason + " — " + (awCheck.detail || "")],
          details: [], ts: _now(),
          sourceResultsCount: 0, narrator: _narratorName(), person_id: stPid, session_id: _convId(),
        });
        return;
      }
      // Otherwise inherit the last full-check status if recent (<5 min); else show AMBER "stale".
      const lastTs = _lastStatus.ts ? Date.parse(_lastStatus.ts) : 0;
      const ageMs = Date.now() - lastTs;
      if (lastTs && ageMs < 5 * 60_000) {
        // Just re-render the cached status (timestamp stays)
        _renderCard(_lastStatus);
      } else {
        _renderCard({
          status: "AMBER",
          reasons: ["Health check stale — run Ready for Session"],
          details: [], ts: _now(),
          sourceResultsCount: 0, narrator: _narratorName(), person_id: stPid, session_id: _convId(),
        });
      }
    } catch (e) {
      console.warn("[shm] _liveRefresh threw:", e);
    }
  }

  function start() {
    if (_refreshTimer) return;
    _refreshTimer = setInterval(_liveRefresh, _REFRESH_INTERVAL_MS);
    _liveRefresh();
    console.log("[shm] live refresh started (every " + _REFRESH_INTERVAL_MS + "ms)");
  }

  function stop() {
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
      console.log("[shm] live refresh stopped");
    }
  }

  function getStatus() { return Object.assign({}, _lastStatus); }

  // Auto-start on DOM ready
  function _autoStart() {
    try { _liveRefresh(); } catch (_) {}
    start();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _autoStart);
  } else {
    setTimeout(_autoStart, 0);
  }

  console.log("[Lorevox] Session Health Monitor loaded.");

  return {
    runReadyCheck:   runReadyCheck,
    runWrapUp:       runWrapUp,
    getStatus:       getStatus,
    start:           start,
    stop:            stop,
    _liveRefresh:    _liveRefresh,
    loaded:          true,
  };
})();
