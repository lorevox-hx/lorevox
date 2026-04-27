/* ═══════════════════════════════════════════════════════════════
   archive-writer.js — WO-ARCHIVE-INTEGRATION-01

   Writes every text turn (both narrator + Lori) to the memory archive
   via /api/memory-archive/turn so the operator can pull a zip after
   each session and proof the transcript for truth.

   This is the data-acquisition pipeline for parents-using-by-next-week:
     - Each session → transcript.jsonl + transcript.txt on disk
     - Operator pulls zip via /api/memory-archive/people/{pid}/export
     - Proofs the transcript, marks corrections
     - Corrections feed back as labeled training data

   Hard rules:
     - Lori audio is NEVER captured here (text-only writer).
       Audio capture is WO-AUDIO-NARRATOR-ONLY-01.
     - Lori turns ALWAYS pass audio_ref=null (defense-in-depth;
       backend also enforces).
     - Best-effort fire-and-forget — never blocks chat, never re-throws.
     - If archive is disabled or unreachable, writer goes silent
       (no FAIL bubbles, no operator-facing errors).
     - One archive session per conv_id, lazy-created on first turn.

   Hooks:
     - lvArchiveOnNarratorTurn(text) — fired from sendUserMessage
     - lvArchiveOnLoriReply(text)    — chained into onAssistantReply

   Load order: AFTER api.js (needs API constants), AFTER state.js
   (needs state.person_id + state.chat.conv_id), AFTER app.js (needs
   onAssistantReply to chain).
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────
  // _enabled: tri-state.  null = unprobed, true/false = answer.
  // We probe lazily on first turn rather than at page load to avoid
  // blasting health checks before they're useful.
  let _enabled = null;
  // Set of conv_ids that have had session/start fired this page load.
  const _startedConvIds = new Set();
  // Per-conv_id sequence counter so transcript.jsonl rows have
  // monotonic seq even if two narrators are switched mid-session.
  const _seqCounters = {};
  // Counters for harness observability.
  const _stats = { narrator_writes: 0, lori_writes: 0, fails: 0, skipped_disabled: 0, skipped_no_pid: 0 };

  // ── WO-SOFT-TRANSCRIPT-REVIEW-CUE-01 ──────────────────────────
  // After this many narrator turns this session, surface a non-blocking
  // bottom-right toast offering to review what's been captured.  Helps
  // older-adult narrators feel "I can see what's happening."  Single fire.
  const _REVIEW_CUE_THRESHOLD = 4;
  let _reviewCueFired = false;
  function _maybeFireReviewCue() {
    if (_reviewCueFired) return;
    if ((_stats.narrator_writes || 0) < _REVIEW_CUE_THRESHOLD) return;
    _reviewCueFired = true;
    try {
      const existing = document.getElementById("lvTranscriptReviewCue");
      if (existing) existing.remove();
      const pill = document.createElement("div");
      pill.id = "lvTranscriptReviewCue";
      pill.setAttribute("role", "status");
      pill.setAttribute("aria-live", "polite");
      pill.style.cssText =
        "position:fixed;bottom:18px;right:18px;z-index:9000;" +
        "background:#1e293b;color:#e2e8f0;border:1px solid #475569;" +
        "border-radius:10px;padding:10px 14px;max-width:300px;" +
        "box-shadow:0 6px 24px rgba(0,0,0,0.25);font-size:13px;line-height:1.4;" +
        "display:flex;flex-direction:column;gap:6px;";
      pill.innerHTML =
        '<div style="font-weight:600;color:#cbd5e1;">Want to review what we\u2019ve captured so far?</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button id="lvCueExportBtn" style="background:#0ea5e9;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;">Export now</button>' +
          '<button id="lvCueDismissBtn" style="background:transparent;color:#94a3b8;border:1px solid #475569;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;">Not now</button>' +
        '</div>';
      document.body.appendChild(pill);
      const _close = function () { try { pill.remove(); } catch (_) {} };
      const eb = pill.querySelector("#lvCueExportBtn");
      const db = pill.querySelector("#lvCueDismissBtn");
      if (eb) eb.onclick = function () {
        _close();
        try { window.lvExportCurrentSessionArchive && window.lvExportCurrentSessionArchive(); } catch (_) {}
      };
      if (db) db.onclick = _close;
      // Auto-dismiss after 14s if untouched.
      setTimeout(_close, 14000);
      console.log("[archive-writer] transcript review cue fired (narrator_writes=" + _stats.narrator_writes + ")");
    } catch (e) {
      console.warn("[archive-writer] review cue surface failed:", e);
    }
  }

  // ── WO-ARCHIVE-SESSION-BOUNDARY-01 ────────────────────────────
  // One session_id per page load.  Stamped on every transcript line
  // (via meta.session_id) so a parent's session is one cleanly-bounded
  // chunk across all narrator-switch turns.  Distinct from conv_id
  // (which the backend uses as the archive-session key) and from the
  // narrator's person_id.  Allows post-hoc grouping of transcripts by
  // app-run rather than by chat thread.
  function _genSessionId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return "s_" + Date.now().toString(36) + "_" + crypto.randomUUID().slice(0, 8);
      }
    } catch (_) {}
    return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }
  const _sessionId = _genSessionId();
  console.log("[archive-writer] session_id=" + _sessionId);

  // ── Helpers ────────────────────────────────────────────────────
  function _getApiBase() {
    if (typeof API !== "undefined" && API.MEMORY_ARCHIVE_HEALTH) return null; // use API.* directly
    // Fallback: same-origin
    return "";
  }

  async function _probeEnabled() {
    if (_enabled !== null) return _enabled;
    try {
      const url = (typeof API !== "undefined" && API.MEMORY_ARCHIVE_HEALTH)
        ? API.MEMORY_ARCHIVE_HEALTH
        : "/api/memory-archive/health";
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) {
        _enabled = false;
        console.log("[archive-writer] disabled (health probe non-ok):", res.status);
        return _enabled;
      }
      const j = await res.json();
      _enabled = !!(j && j.enabled);
      console.log("[archive-writer] " + (_enabled ? "enabled" : "disabled (flag off)") +
        ` (cap=${j && j.max_mb_per_person}MB)`);
    } catch (e) {
      _enabled = false;
      console.log("[archive-writer] disabled (health probe threw):", e && e.message || e);
    }
    return _enabled;
  }

  function _currentConvId() {
    return (state && state.chat && state.chat.conv_id) || null;
  }

  function _currentPersonId() {
    return (state && state.person_id) || null;
  }

  async function _ensureSessionStarted(personId, convId) {
    const key = `${personId}::${convId}`;
    if (_startedConvIds.has(key)) return true;
    const url = (typeof API !== "undefined" && API.MEMORY_ARCHIVE_START)
      ? API.MEMORY_ARCHIVE_START
      : "/api/memory-archive/session/start";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id:     personId,
          conv_id:       convId,
          session_style: (state.session && state.session.sessionStyle) || "warm_storytelling",
          audio_enabled: true,   // text writer only; audio WO sets actual blobs
          ensure_chat_session: true,
          // WO-ARCHIVE-SESSION-BOUNDARY-01: hand session_id to the backend
          // so meta.json carries it.  Backend may ignore unknown fields
          // (existing behavior) — we keep it harmless if not consumed.
          session_id:    _sessionId,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        _startedConvIds.add(key);
        return true;
      }
      console.log("[archive-writer] session/start non-ok:", res.status);
      return false;
    } catch (e) {
      console.log("[archive-writer] session/start threw:", e && e.message || e);
      return false;
    }
  }

  function _nextSeq(convId) {
    _seqCounters[convId] = (_seqCounters[convId] || 0) + 1;
    return _seqCounters[convId];
  }

  function _genTurnId() {
    // Reuse browser crypto if available; fall back to pseudo-uuid.
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  async function _writeTurn(role, text, opts) {
    if (!text || typeof text !== "string" || !text.trim()) return false;

    const personId = _currentPersonId();
    if (!personId) { _stats.skipped_no_pid++; return false; }

    const enabled = await _probeEnabled();
    if (!enabled) { _stats.skipped_disabled++; return false; }

    const convId = _currentConvId();
    if (!convId) { _stats.skipped_no_pid++; return false; }

    const sessionOk = await _ensureSessionStarted(personId, convId);
    if (!sessionOk) { _stats.fails++; return false; }

    const url = (typeof API !== "undefined" && API.MEMORY_ARCHIVE_TURN)
      ? API.MEMORY_ARCHIVE_TURN
      : "/api/memory-archive/turn";

    const turn_id = (opts && opts.turn_id) || _genTurnId();
    const seq = _nextSeq(convId);

    // Lori turns: force audio_ref=null at the client too (server enforces, but
    // client redundancy keeps the contract obvious in network tab).
    const audio_ref = (role === "narrator" || role === "user") ? (opts && opts.audio_ref) || null : null;

    // WO-TRANSCRIPT-TAGGING-01 + WO-ARCHIVE-SESSION-BOUNDARY-01:
    // Stamp every turn with rich filterable metadata so post-hoc
    // analysis can slice by identity-phase, BB field, session-style,
    // and session-boundary without needing to scrape the api.log.
    const _sess = (state && state.session) || {};
    const _loop = (_sess.loop) || {};
    // bb_field is meaningful only on the narrator turn that ANSWERED
    // a BB ask — i.e. the field that was asked last turn.  Present on
    // narrator role; null for Lori.
    const bb_field = (role === "narrator" || role === "user") &&
      _loop.currentSection && _loop.currentField
        ? `${_loop.currentSection}.${_loop.currentField}`
        : null;
    const richMeta = {
      session_id:     _sessionId,                       // WO-ARCHIVE-SESSION-BOUNDARY-01
      session_style:  _sess.sessionStyle || null,
      assistant_role: _sess.assistantRole || null,
      identity_phase: _sess.identityPhase || null,      // askName | complete | etc.
      bb_field:       bb_field,                         // sectionId.fieldId or null
      timestamp:      new Date().toISOString(),         // client-side; server may add its own
      // Optional context for cross-narrator audits
      writer_role:    role,
    };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: personId,
          conv_id:   convId,
          turn_id,
          seq,
          role,
          content:   text,
          audio_ref,
          confirmed: role === "narrator" || role === "user",
          meta:      richMeta,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        if (role === "lori" || role === "assistant") _stats.lori_writes++;
        else {
          _stats.narrator_writes++;
          // WO-SOFT-TRANSCRIPT-REVIEW-CUE-01: gentle review nudge once per session.
          try { _maybeFireReviewCue(); } catch (_) {}
        }
        return true;
      }
      _stats.fails++;
      console.log(`[archive-writer] turn write ${role} non-ok:`, res.status);
      return false;
    } catch (e) {
      _stats.fails++;
      console.log(`[archive-writer] turn write ${role} threw:`, e && e.message || e);
      return false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  async function lvArchiveOnNarratorTurn(text) {
    return _writeTurn("narrator", text);
  }
  window.lvArchiveOnNarratorTurn = lvArchiveOnNarratorTurn;

  async function lvArchiveOnLoriReply(text) {
    return _writeTurn("lori", text);
  }
  window.lvArchiveOnLoriReply = lvArchiveOnLoriReply;

  /* Diagnostic accessor for the harness. */
  window.lvArchiveWriter = {
    onNarratorTurn: lvArchiveOnNarratorTurn,
    onLoriReply:    lvArchiveOnLoriReply,
    stats:          () => Object.assign({}, _stats),
    isEnabled:      () => _enabled,
    startedConvIds: () => Array.from(_startedConvIds),
    sessionId:      () => _sessionId,            // WO-ARCHIVE-SESSION-BOUNDARY-01
    loaded:         true,
  };

  /* ── WO-ARCHIVE-EXPORT-UX-01 ────────────────────────────────────
     One-click "Export Current Session" — downloads a zip of the
     active narrator's full archive (transcript.txt + transcript.jsonl
     + meta.json + audio/).  Triggered from the Bug Panel button.

     Implementation: GET MEMORY_ARCHIVE_EXPORT(pid) returning a zip
     with Content-Disposition: attachment.  Browser handles the save.
     We use fetch + blob + anchor trick (rather than window.open) so
     the user stays in the current tab.

     Updates a small status line (#lv10dBpExportStatus) in the Bug
     Panel as it works — operator sees readable progress.
  ─────────────────────────────────────────────────────────────── */
  async function lvExportCurrentSessionArchive() {
    const status = document.getElementById("lv10dBpExportStatus");
    function _stat(msg) { if (status) status.textContent = msg; console.log("[archive-export]", msg); }

    const personId = _currentPersonId();
    if (!personId) { _stat("⚠ no narrator selected — pick a narrator first"); return false; }

    const enabled = await _probeEnabled();
    if (!enabled) { _stat("⚠ archive disabled (LOREVOX_ARCHIVE_ENABLED off?) — check api health"); return false; }

    const url = (typeof API !== "undefined" && API.MEMORY_ARCHIVE_EXPORT)
      ? API.MEMORY_ARCHIVE_EXPORT(personId)
      : `/api/memory-archive/people/${encodeURIComponent(personId)}/export`;

    _stat("requesting export zip…");
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      _stat("✗ export fetch threw: " + (e && e.message || e));
      return false;
    }
    if (!res.ok) {
      _stat(`✗ export non-ok: status=${res.status} ${res.statusText || ""}`);
      return false;
    }
    let blob;
    try {
      blob = await res.blob();
    } catch (e) {
      _stat("✗ export blob read threw: " + (e && e.message || e));
      return false;
    }
    // Filename — prefer Content-Disposition, fall back to pid+timestamp.
    let filename = "lorevox_archive_" + personId.slice(0, 8) + "_" +
      new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".zip";
    try {
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/);
      if (m && m[1]) filename = m[1];
    } catch (_) {}

    // Trigger download via hidden anchor.
    try {
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after the browser starts the download (small delay).
      setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (_) {} }, 5000);
      _stat(`✓ saved ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
      return true;
    } catch (e) {
      _stat("✗ download trigger threw: " + (e && e.message || e));
      return false;
    }
  }
  window.lvExportCurrentSessionArchive = lvExportCurrentSessionArchive;

  // ── BUG-209: Auto-chain DISABLED ──────────────────────────────
  // Why: the backend chat_ws handler ALREADY writes both narrator +
  // assistant turns into the same memory archive (visible as rows with
  // meta.ws=true).  When archive-writer also fired via this auto-chain
  // and via the inline call in app.js sendUserMessage, every turn ended
  // up in transcript.jsonl twice — once as user/assistant (backend) and
  // once as narrator/lori (frontend).  Confirmed via Chris's morning
  // export 2026-04-25 12:46:44Z (session switch_moec2vfc_m84n).
  //
  // Fix: stop double-writing.  Keep lvArchiveOnNarratorTurn /
  // lvArchiveOnLoriReply callable for the audio-attachment use case
  // (WO-AUDIO-NARRATOR-ONLY-01 will need a deliberate per-turn write
  // that pairs with the audio segment), but do not chain them
  // automatically.  Backend WS is the single source of truth for the
  // text transcript.
  //
  // Re-enabling: if the backend WS path is ever turned off and the
  // memory-archive-only path becomes the sole writer, set
  // window._lvArchiveAutoChain = true BEFORE archive-writer.js loads
  // (or call _wireAssistantReplyChain() manually post-load).
  function _wireAssistantReplyChain() {
    if (typeof window.onAssistantReply !== "function") {
      setTimeout(_wireAssistantReplyChain, 200);
      return;
    }
    if (window.onAssistantReply._archiveWriterChained) return;
    const original = window.onAssistantReply;
    window.onAssistantReply = function (text) {
      try { lvArchiveOnLoriReply(text); } catch (_) {}
      return original.apply(this, arguments);
    };
    window.onAssistantReply._archiveWriterChained = true;
    console.log("[archive-writer] onAssistantReply chained (auto-chain explicitly enabled).");
  }
  // Expose the chainer for explicit opt-in.  Default = NOT wired.
  window._lvArchiveWireAutoChain = _wireAssistantReplyChain;
  if (window._lvArchiveAutoChain === true) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _wireAssistantReplyChain);
    } else {
      _wireAssistantReplyChain();
    }
  } else {
    console.log("[archive-writer] auto-chain DISABLED (BUG-209: backend chat_ws is sole transcript writer). " +
      "Manual hooks lvArchiveOnNarratorTurn / lvArchiveOnLoriReply remain callable for audio attachment.");
  }

  console.log("[Lorevox] archive-writer loaded.");
})();
