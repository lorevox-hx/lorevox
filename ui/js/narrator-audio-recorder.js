/* ═══════════════════════════════════════════════════════════════
   narrator-audio-recorder.js — WO-AUDIO-NARRATOR-ONLY-01

   Per-turn webm audio capture for narrator turns ONLY.  Lori's TTS
   audio is NEVER captured (defense-in-depth: TTS gate stops in-progress
   segment + backend rejects role=lori|assistant with 400).

   Locked product rules (per spec):
     1. Narrator audio captured per turn.  Uploaded after send.
     2. Lori audio NEVER captured.  Three guards:
        (a) MediaRecorder STOPS when isLoriSpeaking flips true
        (b) Backend /api/memory-archive/audio rejects role=lori|assistant
        (c) 700ms post-TTS buffer before re-arm
     3. Audio file = audio/<turn_id>.webm in the per-narrator archive.
     4. Operator setting state.session.recordVoice (default true).
        OFF → recorder is a no-op.
     5. Best-effort upload — failures log + leave audio_ref=null.
     6. Chrome-only Phase 1.  Safari/iOS = transcript only, harness
        reports DISABLED with copy "narrator audio capture requires
        Chrome/Edge."

   Public API (window.lvNarratorAudioRecorder):
     start()           — arm + begin a new segment (idempotent if mid-segment)
     stop(turn_id)     — finalize current segment + upload under turn_id
     gate(loriSpeaking) — TTS gate hook from app.js isLoriSpeaking transitions
     stats()           — { segments_started, segments_uploaded, segments_lost,
                          last_turn_id, state, ttsGateBlocked }
     isAvailable()     — MediaRecorder + getUserMedia present
     isEnabled()       — state.session.recordVoice && isAvailable()

   Load order: AFTER api.js (for API.MEMORY_ARCHIVE_AUDIO) +
   archive-writer.js (for stats coordination is OK but not required).
═══════════════════════════════════════════════════════════════ */

window.lvNarratorAudioRecorder = (function () {
  "use strict";

  // ── Private state ─────────────────────────────────────────────
  let _stream = null;            // MediaStream (mic), cached
  let _recorder = null;          // current MediaRecorder
  let _chunks = [];              // current segment's blob chunks
  let _state = "idle";           // idle | armed | recording | uploading | error | tts_blocked
  let _ttsGateBlocked = false;
  let _ttsBufferTimer = null;    // 700ms post-TTS buffer timer
  const _stats = {
    segments_started:  0,
    segments_uploaded: 0,
    segments_lost:     0,
    last_turn_id:      null,
    state:             "idle",
    ttsGateBlocked:    false,
    last_error:        null,
  };
  const _TTS_BUFFER_MS = 700;     // post-TTS wait before re-arm
  const _UPLOAD_TIMEOUT_MS = 60_000;  // 60s for blob upload
  const _MIME_PREFERENCE = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  // ── Helpers ───────────────────────────────────────────────────
  function _now() { return new Date().toISOString(); }

  function _setState(newState) {
    _state = newState;
    _stats.state = newState;
    _stats.ttsGateBlocked = _ttsGateBlocked;
  }

  function isAvailable() {
    return (typeof MediaRecorder !== "undefined") &&
           !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function isEnabled() {
    if (!isAvailable()) return false;
    if (typeof state === "undefined") return false;
    if (!state.session) return false;
    // Default true unless operator explicitly opted out.
    return state.session.recordVoice !== false;
  }

  function _pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) {
      return _MIME_PREFERENCE[0];
    }
    for (const m of _MIME_PREFERENCE) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return _MIME_PREFERENCE[0];
  }

  async function _acquireStream() {
    if (_stream) return _stream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia unavailable");
    }
    _stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
      },
      video: false,
    });
    return _stream;
  }

  function _releaseStream() {
    if (_stream) {
      try { _stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      _stream = null;
    }
  }

  function _newRecorder(stream) {
    const mime = _pickMime();
    const opts = MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)
      ? { mimeType: mime }
      : {};
    const rec = new MediaRecorder(stream, opts);
    _chunks = [];
    rec.ondataavailable = function (ev) {
      if (ev.data && ev.data.size > 0) _chunks.push(ev.data);
    };
    rec.onerror = function (ev) {
      _stats.last_error = String((ev && ev.error && ev.error.message) || ev || "unknown");
      console.warn("[narrator-audio] recorder error:", _stats.last_error);
      _setState("error");
    };
    return rec;
  }

  function _genTurnId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function _currentPersonId() {
    return (typeof state !== "undefined" && state.person_id) ? state.person_id : null;
  }
  function _currentConvId() {
    return (typeof state !== "undefined" && state.chat && state.chat.conv_id) ? state.chat.conv_id : null;
  }

  // ── Public: start a new segment ──────────────────────────────
  async function start() {
    if (!isEnabled()) {
      console.log("[narrator-audio] start: skip (recordVoice=false or MediaRecorder unavailable)");
      return false;
    }
    if (_ttsGateBlocked) {
      console.log("[narrator-audio] start: BLOCKED (Lori speaking)");
      return false;
    }
    if (_state === "recording" || _state === "armed") {
      console.log("[narrator-audio] start: already in state=" + _state);
      return true;
    }
    try {
      const s = await _acquireStream();
      _recorder = _newRecorder(s);
      _recorder.start();
      _setState("recording");
      _stats.segments_started++;
      console.log("[narrator-audio] segment START (mime=" + (_recorder.mimeType || "?") + ")");
      return true;
    } catch (e) {
      _stats.last_error = String(e && e.message || e);
      _setState("error");
      console.warn("[narrator-audio] start failed:", _stats.last_error);
      // Common case: NotAllowedError = mic permission denied
      return false;
    }
  }

  // ── Public: stop + upload ─────────────────────────────────────
  async function stop(turn_id) {
    const tid = turn_id || _genTurnId();
    if (!_recorder || _state !== "recording") {
      // Nothing to stop, but if recordVoice is on we still want a clean
      // transition to idle so the next start() works.
      if (_state !== "tts_blocked") _setState("idle");
      return false;
    }
    _stats.last_turn_id = tid;
    return await new Promise((resolve) => {
      const recorder = _recorder;
      // onstop fires after final ondataavailable, so all chunks are present.
      recorder.onstop = async function () {
        _setState("uploading");
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(_chunks, { type: mime });
        _chunks = [];
        _recorder = null;
        // Only upload if blob is non-trivial (avoid 0-byte garbage).
        if (blob.size < 200) {
          console.log("[narrator-audio] segment too small to upload (" + blob.size + " bytes); discarding tid=" + tid);
          _stats.segments_lost++;
          _setState("idle");
          return resolve(false);
        }
        const ok = await _uploadSegment(blob, tid);
        if (ok) _stats.segments_uploaded++;
        else _stats.segments_lost++;
        _setState("idle");
        resolve(ok);
      };
      try {
        recorder.stop();
        console.log("[narrator-audio] segment STOP (tid=" + tid.slice(0, 8) + ")");
      } catch (e) {
        console.warn("[narrator-audio] stop threw:", e && e.message || e);
        _stats.last_error = String(e && e.message || e);
        _stats.segments_lost++;
        _recorder = null;
        _chunks = [];
        _setState("idle");
        resolve(false);
      }
    });
  }

  async function _uploadSegment(blob, turn_id) {
    const personId = _currentPersonId();
    const convId = _currentConvId();
    if (!personId || !convId) {
      console.warn("[narrator-audio] upload SKIPPED — missing pid or conv_id");
      return false;
    }
    const url = (typeof API !== "undefined" && API.MEMORY_ARCHIVE_AUDIO)
      ? API.MEMORY_ARCHIVE_AUDIO
      : "/api/memory-archive/audio";
    try {
      const fd = new FormData();
      fd.append("person_id", personId);
      fd.append("conv_id",   convId);
      fd.append("turn_id",   turn_id);
      fd.append("role",      "narrator");
      // Filename hint for the backend / UI.
      const filename = turn_id.slice(0, 24) + ".webm";
      fd.append("file",      blob, filename);

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), _UPLOAD_TIMEOUT_MS);
      const res = await fetch(url, { method: "POST", body: fd, signal: ctrl.signal });
      clearTimeout(t);

      if (res.ok) {
        console.log("[narrator-audio] uploaded tid=" + turn_id.slice(0, 8) +
          " size=" + (blob.size / 1024).toFixed(1) + "KB → 200");
        return true;
      }
      // 413 = quota cap, 400 = role rejection, 4xx/5xx = other.
      const detail = await (async () => { try { return await res.text(); } catch (_) { return ""; } })();
      console.warn("[narrator-audio] upload FAIL status=" + res.status +
        " tid=" + turn_id.slice(0, 8) + " detail=" + detail.slice(0, 120));
      _stats.last_error = "http " + res.status;
      return false;
    } catch (e) {
      _stats.last_error = String(e && e.message || e);
      console.warn("[narrator-audio] upload threw:", _stats.last_error);
      return false;
    }
  }

  // ── Public: TTS gate ──────────────────────────────────────────
  // Called from app.js when isLoriSpeaking flips.  When true: stop in-progress
  // segment WITHOUT uploading (Lori-audio defense).  When false: wait 700ms
  // before allowing re-arm (covers the audible-but-flag-cleared edge).
  function gate(loriSpeaking) {
    _ttsGateBlocked = !!loriSpeaking;
    _stats.ttsGateBlocked = _ttsGateBlocked;
    if (loriSpeaking) {
      // Cancel any pending re-arm timer
      if (_ttsBufferTimer) { clearTimeout(_ttsBufferTimer); _ttsBufferTimer = null; }
      // Drop in-progress segment: stop recorder, discard chunks, do NOT upload.
      if (_recorder && _state === "recording") {
        try { _recorder.onstop = null; _recorder.stop(); } catch (_) {}
        _recorder = null;
        _chunks = [];
        _stats.segments_lost++;
        console.log("[narrator-audio] TTS gate ACTIVE — in-progress segment dropped (Lori-audio defense)");
      }
      _setState("tts_blocked");
    } else {
      // Lori finished speaking.  Wait 700ms before clearing the gate so the
      // 700ms post-TTS buffer covers the audible-but-flag-cleared edge.
      if (_ttsBufferTimer) clearTimeout(_ttsBufferTimer);
      _ttsBufferTimer = setTimeout(function () {
        _ttsGateBlocked = false;
        _stats.ttsGateBlocked = false;
        if (_state === "tts_blocked") _setState("idle");
        console.log("[narrator-audio] TTS gate CLEARED (700ms post-TTS buffer expired)");
        _ttsBufferTimer = null;
      }, _TTS_BUFFER_MS);
    }
  }

  // ── Diagnostic accessors ──────────────────────────────────────
  function stats() { return Object.assign({}, _stats); }

  // ── Cleanup hook (e.g., on page hide / narrator switch) ──────
  function cleanup() {
    if (_recorder) {
      try { _recorder.onstop = null; _recorder.stop(); } catch (_) {}
      _recorder = null;
    }
    _chunks = [];
    if (_ttsBufferTimer) { clearTimeout(_ttsBufferTimer); _ttsBufferTimer = null; }
    _releaseStream();
    _setState("idle");
    _ttsGateBlocked = false;
  }

  // Auto-cleanup on page unload to release mic access.
  try {
    window.addEventListener("pagehide", cleanup, { once: false });
  } catch (_) {}

  console.log("[Lorevox] narrator-audio-recorder loaded (available=" + isAvailable() + ")");

  return {
    start:       start,
    stop:        stop,
    gate:        gate,
    stats:       stats,
    isAvailable: isAvailable,
    isEnabled:   isEnabled,
    cleanup:     cleanup,
    loaded:      true,
  };
})();
