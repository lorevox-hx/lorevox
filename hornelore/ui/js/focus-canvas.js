/**
 * focus-canvas.js — Lorevox 9.0 Phase N + N.1
 * ─────────────────────────────────────────────
 * Morphing Focus Canvas for older-adult voice and text capture.
 *
 * Phase N: Core canvas overlay with scrim, voice/text modes, large controls.
 * Phase N.1: Context-aware chat bridge — last-reply eyebrow, anchor-bottom
 *   scrolling, narrator identity labels, visual dialogue separation.
 *
 * Hooks into existing app.js functions: toggleMic(), sendUserMessage(),
 * appendBubble(), and state.js getters: getCurrentEra(), state.person_id,
 * state.narratorUi.activeLabel.
 *
 * Exposed on window.FocusCanvas for shell integration.
 */
(function () {
  "use strict";

  // ── DOM refs (resolved lazily) ────────────────────────────────
  var _el = function (id) { return document.getElementById(id); };

  // ── State ─────────────────────────────────────────────────────
  var _open = false;
  var _mode = "idle";          // idle | listening | typing | processing | done
  var _inputText = "";
  var _interimText = "";
  var _doneCards = [];
  var _originalOnResult = null;
  var _originalOnEnd = null;

  // ── Memory type (hybrid capture model) ─────────────────────────
  var _memoryType = "memory"; // memory | story | person | place | feeling

  var _HELPER_TEXT = {
    memory:  "Share a memory from this time in your life.",
    story:   "Tell a story — something that happened, how it unfolded.",
    person:  "Describe someone important — who they were, what they meant to you.",
    place:   "Describe a place — where it was, what it felt like to be there.",
    feeling: "Share how you felt — an emotion, a mood, a moment of clarity."
  };

  // ── N.1-02: Anchor-bottom scroll state ────────────────────────
  var _autoScroll = true;
  var _scrollPauseByUser = false;
  var _newMsgBtnEl = null;

  // ── Open / Close ──────────────────────────────────────────────

  function open(trigger) {
    console.log("[FocusCanvas] open() called, trigger:", trigger);
    if (_open) { console.log("[FocusCanvas] already open — returning"); return; }
    _open = true;
    _inputText = "";
    _interimText = "";
    _doneCards = [];

    var canvas = _el("fcCanvas");
    var scrim = _el("fcScrim");
    if (!canvas || !scrim) { console.warn("[FocusCanvas] DOM missing — canvas:", !!canvas, "scrim:", !!scrim); return; }

    // Populate context labels
    _updateContextLabels();

    // N.1-01: Populate last-reply eyebrow
    _populateLastReply();

    // Clear prior content
    _el("fcTranscript").textContent = "";
    _el("fcInterim").textContent = "";
    _el("fcTextarea").value = "";
    _el("fcPostCapture").innerHTML = "";
    _el("fcPostCapture").classList.add("fc-hidden");
    _el("fcConfirmMsg").classList.add("fc-hidden");

    // Show
    scrim.classList.add("fc-active");
    canvas.classList.add("fc-active");
    document.body.classList.add("fc-body-locked");

    // Determine mode from trigger
    if (trigger === "mic") {
      _setMode("listening");
      _startListening();
    } else {
      _setMode("typing");
      setTimeout(function () {
        var ta = _el("fcTextarea");
        if (ta) ta.focus();
      }, 300);
    }
  }

  function close() {
    if (!_open) return;
    _open = false;

    _stopListening();

    var canvas = _el("fcCanvas");
    var scrim = _el("fcScrim");

    // Exit animation: shrink toward bottom
    if (canvas) {
      canvas.classList.add("fc-closing");
      canvas.classList.remove("fc-active");
    }
    if (scrim) {
      scrim.classList.remove("fc-active");
    }

    setTimeout(function () {
      if (canvas) canvas.classList.remove("fc-closing");
      document.body.classList.remove("fc-body-locked");
      _setMode("idle");
    }, 400);
  }

  // ── Mode management ───────────────────────────────────────────

  function _setMode(m) {
    _mode = m;
    var canvas = _el("fcCanvas");
    if (!canvas) return;

    // Remove all mode classes
    canvas.classList.remove("fc-mode-idle", "fc-mode-listening", "fc-mode-typing", "fc-mode-processing", "fc-mode-done");
    canvas.classList.add("fc-mode-" + m);

    // Toggle visibility of sections
    var txArea = _el("fcTypingArea");
    var lArea  = _el("fcListeningArea");
    var doneArea = _el("fcDoneArea");

    if (txArea) txArea.classList.toggle("fc-hidden", m !== "typing");
    if (lArea)  lArea.classList.toggle("fc-hidden", m === "typing" || m === "done");
    if (doneArea) doneArea.classList.toggle("fc-hidden", m !== "done");

    // Update mic glow
    var micBtn = _el("fcMicBtn");
    if (micBtn) {
      micBtn.classList.toggle("fc-mic-active", m === "listening");
    }

    // Update action buttons
    var saveBtn = _el("fcSaveBtn");
    var doneBtn = _el("fcDoneBtn");
    if (saveBtn) saveBtn.classList.toggle("fc-hidden", m !== "typing");
    if (doneBtn) doneBtn.classList.toggle("fc-hidden", m !== "listening");
  }

  // ── Context labels ────────────────────────────────────────────

  function _updateContextLabels() {
    var narratorLabel = _el("fcNarratorLabel");
    var eraLabel = _el("fcEraLabel");

    // Narrator name — check multiple sources
    var name = "";
    if (typeof state !== "undefined") {
      // 1. activeLabel (set by narrator switcher UI)
      if (state.narratorUi && state.narratorUi.activeLabel) {
        name = state.narratorUi.activeLabel;
      }
      // 2. peopleCache display_name
      if (!name && state.person_id && state.narratorUi && state.narratorUi.peopleCache) {
        var match = state.narratorUi.peopleCache.find(function (p) {
          return (p.id || p.personId) === state.person_id;
        });
        if (match) name = match.display_name || match.name || match.fullName || "";
      }
      // 3. identity capture (during onboarding)
      if (!name && state.session && state.session.identityCapture && state.session.identityCapture.name) {
        name = state.session.identityCapture.name;
      }
    }
    if (!name) name = "Your narrator";
    if (narratorLabel) narratorLabel.textContent = name;

    // Era
    var era = "General";
    if (typeof getCurrentEra === "function") {
      var e = getCurrentEra();
      if (e) era = e;
    } else if (typeof state !== "undefined" && state.session && state.session.currentEra) {
      era = state.session.currentEra;
    }
    if (eraLabel) eraLabel.textContent = era;
  }

  // ── N.1-01: Last-reply eyebrow ──────────────────────────────────

  function _populateLastReply() {
    var panel = _el("fcLastReply");
    var textEl = _el("fcLastReplyText");
    if (!panel || !textEl) return;

    // Find last Lori bubble in main chat
    var chatMsgs = document.getElementById("chatMessages");
    if (!chatMsgs) { panel.classList.add("fc-hidden"); return; }

    var aiBubbles = chatMsgs.querySelectorAll(".bubble-ai .bubble-body");
    if (!aiBubbles.length) { panel.classList.add("fc-hidden"); return; }

    var lastBody = aiBubbles[aiBubbles.length - 1];
    var txt = (lastBody.textContent || "").trim();
    if (!txt) { panel.classList.add("fc-hidden"); return; }

    textEl.textContent = txt;
    panel.classList.remove("fc-hidden");
  }

  // ── N.1-02: Anchor-bottom scroll management ──────────────────

  /**
   * Replaces the instant scrollTop jump in appendBubble with smooth
   * behavior, and pauses auto-scroll when the user scrolls up.
   */
  function _initScrollManagement() {
    var chatWrap = document.getElementById("lv80ChatWrap");
    if (!chatWrap || chatWrap._n1ScrollInit) return;
    chatWrap._n1ScrollInit = true;

    _newMsgBtnEl = document.getElementById("seeNewMsgBtn");

    // Detect user-initiated upward scroll
    var _lastScrollTop = chatWrap.scrollTop;
    var _programmaticScroll = false;

    chatWrap.addEventListener("scroll", function () {
      if (_programmaticScroll) return;
      var atBottom = (chatWrap.scrollTop + chatWrap.clientHeight >= chatWrap.scrollHeight - 40);
      if (atBottom) {
        _autoScroll = true;
        _scrollPauseByUser = false;
        if (_newMsgBtnEl) _newMsgBtnEl.classList.add("fc-hidden");
      } else if (chatWrap.scrollTop < _lastScrollTop) {
        // User scrolled up
        _autoScroll = false;
        _scrollPauseByUser = true;
      }
      _lastScrollTop = chatWrap.scrollTop;
    });

    // Expose a smooth-scroll function that appendBubble will call
    window._scrollChatToBottom = function () {
      if (!_autoScroll) {
        // User is scrolled up — show "See New Message" button
        if (_newMsgBtnEl) _newMsgBtnEl.classList.remove("fc-hidden");
        return;
      }
      _programmaticScroll = true;
      chatWrap.scrollTo({ top: chatWrap.scrollHeight, behavior: "smooth" });
      setTimeout(function () { _programmaticScroll = false; }, 500);
    };

    // Click handler for "See New Message" button
    window._scrollToLatest = function () {
      _autoScroll = true;
      _scrollPauseByUser = false;
      if (_newMsgBtnEl) _newMsgBtnEl.classList.add("fc-hidden");
      _programmaticScroll = true;
      chatWrap.scrollTo({ top: chatWrap.scrollHeight, behavior: "smooth" });
      setTimeout(function () { _programmaticScroll = false; }, 500);
    };
  }

  // ── Voice / Listening ─────────────────────────────────────────

  function _startListening() {
    console.log("[FocusCanvas] _startListening() — window.isRecording:", window.isRecording, "typeof toggleRecording:", typeof toggleRecording);
    // Use the existing app.js recognition engine
    if (typeof window.isRecording !== "undefined" && !window.isRecording) {
      // Intercept recognition results to feed into our canvas
      _hookRecognition();
      if (typeof toggleRecording === "function") {
        toggleRecording();
        console.log("[FocusCanvas] toggleRecording() called — isRecording now:", window.isRecording);
      }
    } else {
      console.warn("[FocusCanvas] _startListening skipped — isRecording:", window.isRecording, "(undefined means bridge missing)");
    }
  }

  function _stopListening() {
    if (typeof window.isRecording !== "undefined" && window.isRecording) {
      if (typeof stopRecording === "function") {
        stopRecording();
      }
    }
    _unhookRecognition();
  }

  function _hookRecognition() {
    // Wait for recognition to exist, then intercept onresult
    var attempts = 0;
    console.log("[FocusCanvas] _hookRecognition — polling for window.recognition...");
    var interval = setInterval(function () {
      attempts++;
      if (window.recognition) {
        clearInterval(interval);
        console.log("[FocusCanvas] recognition found after", attempts, "attempts — hooking onresult");
        _originalOnResult = window.recognition.onresult;
        _originalOnEnd = window.recognition.onend;

        window.recognition.onresult = function (e) {
          _handleRecognitionResult(e);
          // Also call original so chatInput still gets updated
          if (_originalOnResult) _originalOnResult.call(window.recognition, e);
        };
      }
      if (attempts > 30) {
        clearInterval(interval);
        console.warn("[FocusCanvas] gave up waiting for window.recognition after 30 attempts");
      }
    }, 100);
  }

  function _unhookRecognition() {
    if (window.recognition && _originalOnResult) {
      window.recognition.onresult = _originalOnResult;
      _originalOnResult = null;
    }
    if (window.recognition && _originalOnEnd) {
      window.recognition.onend = _originalOnEnd;
      _originalOnEnd = null;
    }
  }

  function _handleRecognitionResult(e) {
    var final = "";
    var interim = "";
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var t = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        final += t;
      } else {
        interim += t;
      }
    }

    if (final) {
      _inputText += (_inputText ? " " : "") + final.trim();
      var txEl = _el("fcTranscript");
      if (txEl) txEl.textContent = _inputText;
    }

    var intEl = _el("fcInterim");
    if (intEl) intEl.textContent = interim;
  }

  // ── Actions ───────────────────────────────────────────────────

  function _onDone() {
    // Gather text from either voice or typing
    var text = "";
    if (_mode === "listening") {
      _stopListening();
      text = _inputText.trim();
    } else if (_mode === "typing") {
      var ta = _el("fcTextarea");
      text = ta ? ta.value.trim() : "";
    }

    console.log("[FocusCanvas] _onDone — mode:", _mode, "text length:", text.length, "text:", text.slice(0, 80));

    if (!text) {
      // Nothing to save — just close
      console.warn("[FocusCanvas] _onDone — no text captured, closing");
      close();
      return;
    }

    _setMode("processing");

    // Feed text into the normal chat pipeline
    var chatInput = _el("chatInput");
    if (chatInput) {
      chatInput.value = text;
      console.log("[FocusCanvas] chatInput.value set to:", text.slice(0, 80));
    }

    // Brief processing animation, then send
    setTimeout(function () {
      if (typeof sendUserMessage === "function") {
        console.log("[FocusCanvas] calling sendUserMessage()");
        sendUserMessage();
      } else {
        console.error("[FocusCanvas] sendUserMessage not found!");
      }

      // Show done state
      _setMode("done");
      _showConfirmation(text);

      // Auto-close after showing confirmation
      setTimeout(function () {
        close();
      }, 2500);
    }, 600);
  }

  function _showConfirmation(text) {
    var eraLabel = "your story";
    if (typeof getCurrentEra === "function") {
      var e = getCurrentEra();
      if (e) eraLabel = e;
    }

    var msg = _el("fcConfirmMsg");
    if (msg) {
      msg.textContent = "Got it. Added to " + eraLabel + ".";
      msg.classList.remove("fc-hidden");
    }

    // Show post-capture cards if QC pipeline is available
    _showPostCaptureCards(text);
  }

  function _showPostCaptureCards(text) {
    var postEl = _el("fcPostCapture");
    if (!postEl) return;

    // Try to get status from QC pipeline
    var qcMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules._qcPipeline;
    if (!qcMod) {
      // Show simple "New Fact" card
      postEl.innerHTML = '<div class="fc-card fc-card-new">New Fact</div>';
      postEl.classList.remove("fc-hidden");
      return;
    }

    // Show a simple status card
    postEl.innerHTML = '<div class="fc-card fc-card-new">New Fact</div>';
    postEl.classList.remove("fc-hidden");
  }

  // ── Typing mode handlers ──────────────────────────────────────

  function _onTextareaKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _onDone();
    }
  }

  function _onTextareaInput() {
    var ta = _el("fcTextarea");
    if (ta) {
      // Auto-resize
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 300) + "px";
    }
  }

  // ── Switch between voice and typing within canvas ─────────────

  function _switchToTyping() {
    if (_mode === "listening") {
      _stopListening();
      // Transfer any voice text to textarea
      var ta = _el("fcTextarea");
      if (ta) ta.value = _inputText;
    }
    _setMode("typing");
    setTimeout(function () {
      var ta = _el("fcTextarea");
      if (ta) ta.focus();
    }, 100);
  }

  function _switchToVoice() {
    if (_mode === "typing") {
      var ta = _el("fcTextarea");
      if (ta) _inputText = ta.value;
    }
    _setMode("listening");
    _startListening();
  }

  // ── Memory type chip handling ──────────────────────────────────

  function _setMemoryType(type) {
    if (!_HELPER_TEXT[type]) return;
    _memoryType = type;
    // Update active chip
    var chips = document.querySelectorAll("#fcMemoryChips .fc-chip");
    for (var i = 0; i < chips.length; i++) {
      var chip = chips[i];
      if (chip.dataset.type === type) {
        chip.classList.add("fc-chip-active");
      } else {
        chip.classList.remove("fc-chip-active");
      }
    }
    // Update helper text
    var helper = _el("fcHelperText");
    if (helper) helper.textContent = _HELPER_TEXT[type];
    // Update placeholder
    var ta = _el("fcTextarea");
    if (ta) {
      var placeholders = {
        memory: "Share your memory...",
        story: "Tell the story...",
        person: "Tell me about this person...",
        place: "Describe this place...",
        feeling: "Share how you felt..."
      };
      ta.placeholder = placeholders[type] || "Share your story...";
    }
    console.log("[FocusCanvas] Memory type set:", type);
  }

  function _updateEraLabel(era) {
    var eraLabel = _el("fcEraLabel");
    if (eraLabel && era) eraLabel.textContent = era;
  }

  // ── Public API ────────────────────────────────────────────────

  window.FocusCanvas = {
    open: open,
    close: close,
    isOpen: function () { return _open; },
    getMode: function () { return _mode; },
    getMemoryType: function () { return _memoryType; },
    setMemoryType: _setMemoryType,
    updateEraLabel: _updateEraLabel,
    // Internal handlers exposed for HTML onclick
    _onDone: _onDone,
    _switchToTyping: _switchToTyping,
    _switchToVoice: _switchToVoice,
    _onTextareaKeydown: _onTextareaKeydown,
    _onTextareaInput: _onTextareaInput
  };

  // ── Intercept original input controls ─────────────────────────
  // After DOM ready, override the footer mic/input to open Focus Canvas instead

  function _installHooks() {
    // N.1-02: Initialize scroll management on chat wrap
    _initScrollManagement();

    // Intercept mic button
    var mic = _el("btnMic");
    if (mic) {
      mic.onclick = function () {
        if (_open) return;
        open("mic");
      };
    }

    // Intercept chat input focus
    var chatInput = _el("chatInput");
    if (chatInput) {
      chatInput.addEventListener("focus", function () {
        if (_open) return;
        // Open canvas if a narrator is active (person_id set) or during onboarding
        // (peopleCache has entries even before person_id is formally set)
        if (typeof state !== "undefined") {
          var hasNarrator = state.person_id ||
            (state.narratorUi && state.narratorUi.peopleCache && state.narratorUi.peopleCache.length > 0);
          if (hasNarrator) {
            open("text");
            chatInput.blur();
          }
        }
      });
    }
  }

  // Install hooks after all scripts load
  if (document.readyState === "complete") {
    _installHooks();
  } else {
    window.addEventListener("load", function () {
      // Delay slightly to ensure app.js onload completes first
      setTimeout(_installHooks, 500);
    });
  }

})();
