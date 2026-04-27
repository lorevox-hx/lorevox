/* ═══════════════════════════════════════════════════════════════
   photo-elicit.js — WO-LORI-PHOTO-SHARED-01 §14 + WO-10C

   Narrator-facing photo session. Hard constraints:
     - WO-10C silence ladder: 120s / 300s / 600s.
     - Protected silence: no auto-interruption before 120s.
     - Re-entry bypasses confidence gating.
     - Single-thread context: one active photo at a time.
     - Visual-as-patience: never spin / flash "waiting".
     - Never correct a narrator's fact.

   Route: photo-elicit.html?narrator_id=<id>
     (Phase 1 routing; auth deferred.)

   Talks to:
     POST /api/photos/sessions
     POST /api/photos/sessions/{id}/show-next
     POST /api/photos/shows/{id}/memory
     POST /api/photos/sessions/{id}/end
     GET  /api/people/{id}   (narrator display label — best-effort)

   TranscriptGuard integration (WO-STT-LIVE-02): each memory POST
   includes transcript_source, transcript_confidence, and fragile
   flags when the frontend has them. Fragile flags do NOT trigger
   any correction UI in Phase 1 — recorded for Phase 2 review only.
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var ORIGIN = window.LOREVOX_API || "http://localhost:8000";

  // WO-10C silence ladder (ms).
  var T_SILENCE_FOLLOWUP = 120 * 1000;   // 120s: gentle follow-up
  var T_SILENCE_REENTRY  = 300 * 1000;   // 300s: invitational re-entry
  var T_SILENCE_WINDDOWN = 600 * 1000;   // 600s: end session + exit screen

  // URL params — narrator_id is the only Phase 1 route parameter.
  var params = new URLSearchParams(location.search);
  var narratorId = (params.get("narrator_id") || "").trim();

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    shell:            $("peShell"),
    narratorLabel:    $("peNarratorLabel"),
    photoWrap:        $("pePhotoWrap"),
    photoPlaceholder: $("pePhotoPlaceholder"),
    prompt:           $("pePrompt"),
    transcript:       $("peTranscript"),
    micRow:           $("peMicRow"),
    micBtn:           $("peMicBtn"),
    micHint:          $("peMicHint"),
    capture:          $("peCaptureBtn"),
    followup:         $("peFollowupBtn"),
    zeroRecall:       $("peZeroRecallBtn"),
    distress:         $("peDistressBtn"),
    status:           $("peStatus"),
    windDown:         $("peWindDown"),
    closeBtn:         $("peCloseBtn"),
  };

  // Session state
  var photoSessionId = null;
  var currentShow    = null;  // { show_id, photo, prompt_text }
  var sessionEnded   = false;
  var gentleFollowups = [];   // loaded from photo_gentle_followups.json

  // WO-10C silence timers (cleared on any narrator activity).
  var silenceTimers = { followup: 0, reentry: 0, winddown: 0 };
  function _clearSilenceTimers() {
    if (silenceTimers.followup) clearTimeout(silenceTimers.followup);
    if (silenceTimers.reentry)  clearTimeout(silenceTimers.reentry);
    if (silenceTimers.winddown) clearTimeout(silenceTimers.winddown);
    silenceTimers = { followup: 0, reentry: 0, winddown: 0 };
  }
  function _armSilenceTimers() {
    _clearSilenceTimers();
    if (sessionEnded) return;
    silenceTimers.followup = setTimeout(_onFollowup120,  T_SILENCE_FOLLOWUP);
    silenceTimers.reentry  = setTimeout(_onReentry300,   T_SILENCE_REENTRY);
    silenceTimers.winddown = setTimeout(_onWindDown600,  T_SILENCE_WINDDOWN);
  }
  function _nudgeActivity() {
    // Narrator did something observable — reset the silence ladder.
    if (!sessionEnded && currentShow) _armSilenceTimers();
  }

  function setStatus(msg, level) {
    el.status.textContent = msg || "";
    el.status.className = "pe-status" + (level ? " " + level : "");
  }

  // ── Narrator label (best-effort, non-blocking) ──────────────
  function loadNarratorLabel() {
    if (!narratorId) { el.narratorLabel.textContent = "(no narrator)"; return; }
    fetch(ORIGIN + "/api/people/" + encodeURIComponent(narratorId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) {
        if (!p) return;
        el.narratorLabel.textContent = p.display_name || p.name || narratorId;
      })
      .catch(function () { /* quietly skip — page keeps working */ });
  }

  // ── Gentle follow-up library (no network needed for button) ─
  function loadGentleFollowups() {
    fetch("data/prompts/photo_gentle_followups.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (body) {
        if (body && Array.isArray(body.followups)) {
          gentleFollowups = body.followups.slice();
        }
      });
    // Default fallback list — keeps the button useful offline.
    if (!gentleFollowups.length) {
      gentleFollowups = [
        "What part of this picture catches your eye first?",
        "What do you remember feeling in this moment?",
        "Who do you think of when you look at this?",
        "It is okay if you do not remember. What do you notice in the picture?",
      ];
    }
  }

  function pickFollowup() {
    if (!gentleFollowups.length) return "What do you remember when you look at this?";
    var i = Math.floor(Math.random() * gentleFollowups.length);
    return gentleFollowups[i];
  }

  // ── Session lifecycle ───────────────────────────────────────
  function startSession() {
    if (!narratorId) {
      el.prompt.textContent = "This page needs a narrator_id in the URL (e.g. ?narrator_id=kent).";
      return;
    }
    fetch(ORIGIN + "/api/photos/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrator_id: narratorId }),
    })
    .then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
      return r.json();
    })
    .then(function (sess) {
      photoSessionId = sess.id || sess.photo_session_id || null;
      if (!photoSessionId) throw new Error("session response missing id");
      return showNext();
    })
    .catch(function (e) {
      el.prompt.textContent = "We couldn't start the session right now. " + (e && e.message ? e.message : "");
      el.prompt.classList.add("quiet");
      setStatus("Session start failed.", "err");
    });
  }

  function showNext() {
    if (!photoSessionId || sessionEnded) return;
    el.prompt.textContent = "Finding a photo to share…";
    el.prompt.classList.add("quiet");
    fetch(ORIGIN + "/api/photos/sessions/" + encodeURIComponent(photoSessionId) + "/show-next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    .then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
      return r.json();
    })
    .then(function (body) {
      if (!body || !body.photo) {
        // No eligible photo — soft wind-down.
        currentShow = null;
        el.photoWrap.className = "pe-photo-wrap empty";
        el.photoWrap.innerHTML = "<span>We've looked at all the photos ready for today.</span>";
        el.prompt.classList.remove("quiet");
        el.prompt.textContent = "Thank you for spending this time together.";
        _clearSilenceTimers();
        return;
      }
      currentShow = { show_id: body.show_id, photo: body.photo, prompt_text: body.prompt_text || "" };
      renderPhoto(body.photo);
      el.prompt.classList.remove("quiet");
      el.prompt.textContent = body.prompt_text || "Tell me what you remember when you look at this.";
      el.transcript.value = "";
      if (window.TranscriptGuard && TranscriptGuard.clearStagedTranscript) {
        TranscriptGuard.clearStagedTranscript();
      }
      setStatus("");
      _armSilenceTimers();
    })
    .catch(function (e) {
      el.prompt.classList.remove("quiet");
      el.prompt.textContent = "Let's pause for a moment.";
      setStatus("Couldn't load next photo: " + (e && e.message ? e.message : "unknown"), "err");
    });
  }

  function renderPhoto(photo) {
    el.photoWrap.innerHTML = "";
    el.photoWrap.className = "pe-photo-wrap";
    var src = photo.media_url || photo.thumbnail_url;
    if (!src) {
      el.photoWrap.classList.add("empty");
      el.photoWrap.textContent = "(photo unavailable)";
      return;
    }
    var img = document.createElement("img");
    img.alt = "";
    img.src = src;
    el.photoWrap.appendChild(img);
  }

  // ── WO-10C silence-ladder handlers ──────────────────────────
  function _onFollowup120() {
    if (sessionEnded || !currentShow) return;
    el.prompt.textContent = pickFollowup();
    el.prompt.classList.remove("quiet");
    // Re-entry prompts bypass confidence gating — nothing else to do.
  }

  function _onReentry300() {
    if (sessionEnded || !currentShow) return;
    el.prompt.textContent = "Take all the time you need. When you're ready, we can keep going.";
    el.prompt.classList.add("quiet");
  }

  function _onWindDown600() {
    if (sessionEnded) return;
    // Session wind-down: end the session server-side + reveal exit screen.
    endSession({ reason: "auto_winddown" });
  }

  // ── Memory POST ─────────────────────────────────────────────
  function postMemory(memoryType, transcriptText) {
    if (!currentShow || !currentShow.show_id) return Promise.resolve(null);
    var payload = {
      transcript: typeof transcriptText === "string" ? transcriptText : "",
      memory_type: memoryType,
    };
    // Transcript-guard metadata (WO-STT-LIVE-02) — non-fatal if absent.
    if (window.TranscriptGuard && TranscriptGuard.buildExtractionPayloadFields) {
      try {
        var guard = TranscriptGuard.buildExtractionPayloadFields(transcriptText);
        if (guard && Object.keys(guard).length) {
          if (guard.transcript_source)                       payload.transcript_source     = guard.transcript_source;
          if (typeof guard.transcript_confidence === "number") payload.transcript_confidence = guard.transcript_confidence;
          if (Array.isArray(guard.fragile_fact_flags) && guard.fragile_fact_flags.length) {
            payload.transcript_guard_flags = guard.fragile_fact_flags;
          }
        }
      } catch (_) { /* swallow — never break the session on guard misshape */ }
    }

    return fetch(ORIGIN + "/api/photos/shows/" + encodeURIComponent(currentShow.show_id) + "/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    .then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ("HTTP " + r.status)); });
      return r.json();
    });
  }

  // ── Action buttons ──────────────────────────────────────────
  el.capture.addEventListener("click", function () {
    _nudgeActivity();
    // Stage typed input so TranscriptGuard can tag flags / source.
    var text = (el.transcript.value || "").trim();
    if (window.TranscriptGuard && TranscriptGuard.markTypedInput) {
      // If speech already staged something, markTypedInput may be
      // skipped — reconcileForSend inside buildExtractionPayloadFields
      // handles the 30s staleness fallback.
      TranscriptGuard.markTypedInput(text, {});
    }
    if (!text) { setStatus("Type or speak a story first — or choose a different button.", "warn"); return; }
    el.capture.disabled = true;
    setStatus("Saving…");
    postMemory("episodic_story", text)
      .then(function () { setStatus("Thank you. Saved.", "ok"); return showNext(); })
      .catch(function (e) { setStatus("Couldn't save: " + (e && e.message ? e.message : "unknown"), "err"); })
      .finally(function () { el.capture.disabled = false; });
  });

  el.followup.addEventListener("click", function () {
    _nudgeActivity();
    el.prompt.classList.remove("quiet");
    el.prompt.textContent = pickFollowup();
    // No network round-trip per spec.
  });

  el.zeroRecall.addEventListener("click", function () {
    _nudgeActivity();
    el.zeroRecall.disabled = true;
    setStatus("Okay.");
    postMemory("zero_recall", "")
      .then(function () { setStatus("That's okay.", "ok"); return showNext(); })
      .catch(function (e) { setStatus("Couldn't save: " + (e && e.message ? e.message : "unknown"), "err"); })
      .finally(function () { el.zeroRecall.disabled = false; });
  });

  el.distress.addEventListener("click", function () {
    _nudgeActivity();
    el.distress.disabled = true;
    setStatus("Taking a break.");
    postMemory("distress_abort", "")
      .then(function () { return endSession({ reason: "distress_abort" }); })
      .catch(function (e) {
        // Even on network failure we want to exit to the soft screen.
        setStatus("Saved locally; ending session.", "warn");
        return endSession({ reason: "distress_abort_offline" });
      });
  });

  el.closeBtn.addEventListener("click", function () {
    // Phase 1: best available close = blank the page. Router has no
    // return URL wired; curator would re-launch with a new narrator_id.
    window.location.href = "about:blank";
  });

  function endSession(opts) {
    if (sessionEnded) return Promise.resolve(null);
    sessionEnded = true;
    _clearSilenceTimers();
    // Reveal exit screen immediately — WO-10C "visual-as-patience"
    // says we never spin while the /end call is in-flight.
    el.windDown.style.display = "block";
    el.photoWrap.style.display = "none";
    el.prompt.style.display = "none";
    var caps = document.getElementsByClassName("pe-capture");
    for (var i = 0; i < caps.length; i++) caps[i].style.display = "none";
    var acts = document.getElementsByClassName("pe-actions");
    for (var j = 0; j < acts.length; j++) acts[j].style.display = "none";

    if (!photoSessionId) return Promise.resolve(null);
    return fetch(ORIGIN + "/api/photos/sessions/" + encodeURIComponent(photoSessionId) + "/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts || {}),
    })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });
  }

  // ── Activity listeners — any narrator action resets timers ──
  el.transcript.addEventListener("input", _nudgeActivity);
  el.transcript.addEventListener("focus", _nudgeActivity);

  // ── Web Speech (mic) integration ────────────────────────────
  var recognition = null;
  var micOn = false;

  (function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      el.micRow.classList.add("blocked");
      el.micBtn.textContent = "🎙  Mic: unavailable";
      el.micBtn.disabled = true;
      el.micHint.textContent = "Speech input isn't available — just type your story.";
      return;
    }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = (navigator.language || "en-US");

    recognition.onresult = function (e) {
      _nudgeActivity();
      // Stream final pieces into the transcript textarea AND stage to
      // TranscriptGuard for payload metadata.
      var finalBits = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r && r.isFinal && r[0] && typeof r[0].transcript === "string") {
          finalBits += r[0].transcript;
        }
      }
      if (finalBits) {
        el.transcript.value = (el.transcript.value ? el.transcript.value + " " : "") + finalBits.trim();
      }
      if (window.TranscriptGuard && TranscriptGuard.populateFromRecognition) {
        try { TranscriptGuard.populateFromRecognition(e, {}); } catch (_) {}
      }
    };
    recognition.onerror = function () {
      el.micRow.className = "pe-mic-row blocked";
      el.micBtn.textContent = "🎙  Mic: off";
      micOn = false;
    };
    recognition.onend = function () {
      if (micOn) {
        // Chrome auto-stops after silence; restart to keep the "on"
        // affordance honest. Ignore failures silently.
        try { recognition.start(); } catch (_) {}
      }
    };
  })();

  el.micBtn.addEventListener("click", function () {
    if (!recognition) return;
    if (!micOn) {
      try { recognition.start(); } catch (_) {}
      micOn = true;
      el.micBtn.textContent = "🎙  Mic: on";
      el.micBtn.classList.add("on");
      el.micRow.className = "pe-mic-row listening";
      el.micHint.textContent = "Listening. Take your time.";
    } else {
      micOn = false;
      try { recognition.stop(); } catch (_) {}
      el.micBtn.textContent = "🎙  Mic: off";
      el.micBtn.classList.remove("on");
      el.micRow.className = "pe-mic-row off";
      el.micHint.textContent = "Tap to speak, or just type.";
    }
    _nudgeActivity();
  });

  // ── End-of-tab safety: finalize on page hide ────────────────
  window.addEventListener("pagehide", function () {
    // Best-effort: don't spin — just send the end call.
    if (!sessionEnded && photoSessionId) {
      try {
        var blob = new Blob([JSON.stringify({ reason: "pagehide" })], { type: "application/json" });
        navigator.sendBeacon(
          ORIGIN + "/api/photos/sessions/" + encodeURIComponent(photoSessionId) + "/end",
          blob
        );
      } catch (_) {}
    }
  });

  // ── Bootstrap ───────────────────────────────────────────────
  loadGentleFollowups();
  loadNarratorLabel();
  startSession();
})();
