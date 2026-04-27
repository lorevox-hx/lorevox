/* ═══════════════════════════════════════════════════════════════
   ui-health-check.js — Operator UI Health Check (WO-UI-TEST-LAB-01)

   Scripted in-browser preflight harness that lives inside the
   existing #lv10dBugPanel.  Ten categories of checks, each reporting
   PASS / WARN / FAIL / DISABLED / SKIP with a short detail string.

   Hard rules (locked at WO time):
     1. Tests are PURE OBSERVATIONS.  Never mutate state, never fire
        a real narrator switch, never POST a write to the archive.
        Operator running this mid-session must not break the session.
     2. Total runtime budget for runAll() < 3 seconds.  Async fetches
        use a 2s per-request timeout.
     3. DISABLED and SKIP are first-class statuses.  Photos disabled
        via flag → DISABLED, not FAIL.  Archive write checks with no
        active narrator → SKIP, not FAIL.
     4. No "Fix it" buttons.  Harness's job is to TELL the truth;
        fixing is human-in-the-loop.

   Load order: AFTER app.js (depends on state.* globals + lv80_/lv10d_
   functions + window.FacialConsent + window.lvShellShowTab).
═══════════════════════════════════════════════════════════════ */

window.lvUiHealthCheck = (function () {
  "use strict";

  // ── Status enums + categories ──────────────────────────────────
  const STATUS = Object.freeze({
    PASS:          "PASS",
    WARN:          "WARN",
    FAIL:          "FAIL",
    DISABLED:      "DISABLED",      // feature flag off
    NOT_INSTALLED: "NOT_INSTALLED", // route literally returns 404 (router not mounted)
    SKIP:          "SKIP",          // prerequisite missing (e.g. no narrator selected)
    INFO:          "INFO",          // recorded but doesn't count as pass/fail
  });

  // Map status → CSS class re-using existing .lv10d-bp-value classes.
  const _CSS = {
    PASS:          "ok",
    WARN:          "warn",
    FAIL:          "err",
    DISABLED:      "off",
    NOT_INSTALLED: "off",
    SKIP:          "off",
    INFO:          "off",
  };

  // Category keys + human-readable labels + check functions.
  // Order = display order.
  const _CATEGORIES = [
    { key: "startup",    label: "Startup",             fn: _check_startup        },
    { key: "operator",   label: "Operator Tab",        fn: _check_operator_tab   },
    { key: "switch",     label: "Narrator Switch",     fn: _check_narrator_switch},
    { key: "camera",     label: "Camera Consent",      fn: _check_camera_consent },
    { key: "mic",        label: "Mic / STT",           fn: _check_mic_stt        },
    { key: "scroll",     label: "Chat Scroll",         fn: _check_chat_scroll    },
    { key: "river",      label: "Memory River",        fn: _check_memory_river   },
    { key: "map",        label: "Life Map",            fn: _check_life_map       },
    { key: "memoir",     label: "Peek at Memoir",      fn: _check_peek_memoir    },
    { key: "media",      label: "Media Tab",           fn: _check_media_tab      },
    { key: "photos",     label: "Photos",              fn: _check_photos         },
    { key: "media_archive", label: "Document Archive", fn: _check_media_archive  },
    { key: "archive",    label: "Archive",             fn: _check_archive        },
    { key: "session",    label: "Session Style",       fn: _check_session_style  },
    { key: "navigation", label: "Navigation Recovery", fn: _check_navigation     },
    { key: "self",       label: "Harness Self-Check",  fn: _check_self           },
  ];

  // ── Internal state ─────────────────────────────────────────────
  const _state = {
    running: false,
    results: [],     // [{ category, name, status, detail }]
    lastRunTs: null,
    lastDurationMs: null,
  };

  // ── Helpers ────────────────────────────────────────────────────
  function _push(category, name, status, detail) {
    _state.results.push({
      category,
      name,
      status,
      detail: detail || "",
    });
  }

  async function _fetchJSON(url, timeoutMs) {
    timeoutMs = timeoutMs || 2000;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      let body = null;
      try { body = await res.json(); } catch (_) { body = null; }
      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      return { ok: false, status: 0, body: null, error: e && e.message || String(e) };
    } finally {
      clearTimeout(t);
    }
  }

  function _hasNarrator() {
    return !!(typeof state !== "undefined" && state && state.person_id);
  }

  function _hasConvId() {
    return !!(typeof state !== "undefined" && state && state.chat && state.chat.conv_id);
  }

  function _readGlobal(name) {
    try { return (typeof window[name] !== "undefined") ? window[name] : undefined; }
    catch (_) { return undefined; }
  }

  // ── Category: Startup ──────────────────────────────────────────
  async function _check_startup() {
    const cat = "startup";

    // Shell tabs initialized
    const activeTab = document.querySelector("#lvShellTabs .lv-shell-tab-active");
    if (activeTab) {
      const t = activeTab.dataset.tab;
      const ok = ["operator", "narrator", "media"].includes(t);
      _push(cat, "shell tabs initialized",
        ok ? STATUS.PASS : STATUS.FAIL,
        `data-tab=${t}`);
    } else {
      _push(cat, "shell tabs initialized", STATUS.FAIL,
        "#lvShellTabs missing — WO-UI-SHELL-01 not loaded");
    }

    // Warmup banner state aligns with LLM readiness
    const banner = document.getElementById("lv80WarmupBanner");
    const llmReady = (typeof isLlmReady === "function") ? isLlmReady() : null;
    if (banner) {
      const hidden = banner.classList.contains("hidden");
      if (llmReady === true && hidden) {
        _push(cat, "warmup banner hidden when ready", STATUS.PASS, "LLM ready");
      } else if (llmReady === true && !hidden) {
        _push(cat, "warmup banner hidden when ready", STATUS.WARN,
          "LLM ready but banner still showing");
      } else if (llmReady === false) {
        _push(cat, "warmup banner hidden when ready", STATUS.WARN,
          "LLM not yet ready — banner expected visible");
      } else {
        _push(cat, "warmup banner hidden when ready", STATUS.WARN,
          "isLlmReady() unavailable");
      }
    } else {
      _push(cat, "warmup banner element present", STATUS.FAIL,
        "#lv80WarmupBanner missing");
    }

    // Active narrator card present
    const card = document.getElementById("lv80ActiveNarratorCard");
    _push(cat, "active narrator card present in header",
      card ? STATUS.PASS : STATUS.FAIL,
      card ? "" : "#lv80ActiveNarratorCard missing");

    // Operator-tab session style picker present (4 styles since
    // memory_exercise dropped 2026-04-25).
    const radios = document.querySelectorAll('input[name="lvSessionStyle"]');
    _push(cat, "session style picker has 4 options",
      radios.length === 4 ? STATUS.PASS : STATUS.FAIL,
      `radio count=${radios.length}`);

    // No stale narrator pointer
    const saved = localStorage.getItem("lv_active_person_v55");
    const cache = (state && state.narratorUi && state.narratorUi.peopleCache) || [];
    if (saved) {
      const ids = cache.map(p => p.id || p.person_id);
      _push(cat, "active narrator pointer not stale",
        ids.includes(saved) ? STATUS.PASS : STATUS.WARN,
        ids.includes(saved) ? `saved=${saved.slice(0,8)}` : `saved=${saved.slice(0,8)} not in cache (${ids.length} narrators)`);
    } else {
      _push(cat, "active narrator pointer not stale", STATUS.PASS,
        "no saved pointer (clean state)");
    }
  }

  // ── Category: Operator Tab ─────────────────────────────────────
  // Verifies the Operator surface that gates every session: readiness card,
  // session-style picker (5 radios), Start button, Photo Session button,
  // and the launcher grid that was moved out of the header by WO-UI-SHELL-01.
  async function _check_operator_tab() {
    const cat = "operator";

    // Operator tab DOM exists
    const tab = document.getElementById("lvOperatorTab");
    _push(cat, "Operator tab panel present",
      tab ? STATUS.PASS : STATUS.FAIL,
      tab ? "" : "#lvOperatorTab missing — WO-UI-SHELL-01 broken");

    // Readiness card exists + is in a known state
    const ready = document.getElementById("lvOperatorReadiness");
    if (ready) {
      const ds = ready.getAttribute("data-ready") || "(none)";
      const known = ["ready","pending","error"].includes(ds);
      _push(cat, "Readiness card state is known",
        known ? STATUS.PASS : STATUS.WARN,
        `data-ready=${ds}`);
    } else {
      _push(cat, "Readiness card present", STATUS.FAIL,
        "#lvOperatorReadiness missing");
    }

    // Start Narrator Session button
    const startBtn = document.getElementById("lvOperatorStartBtn");
    if (startBtn) {
      const disabled = startBtn.disabled;
      _push(cat, "Start Narrator Session button present", STATUS.PASS,
        disabled ? "disabled (waiting for narrator + ready)" : "enabled");
    } else {
      _push(cat, "Start Narrator Session button present", STATUS.FAIL,
        "#lvOperatorStartBtn missing");
    }

    // Photo Session button
    const photoBtn = document.getElementById("lvOperatorPhotoBtn");
    _push(cat, "Start Photo Session button present",
      photoBtn ? STATUS.PASS : STATUS.FAIL,
      photoBtn ? "" : "#lvOperatorPhotoBtn missing");

    // 4 session style radios with the expected values (memory_exercise
    // dropped 2026-04-25 — picker no-op, shelved).
    const expectedStyles = ["questionnaire_first","clear_direct","warm_storytelling","companion"];
    const radios = Array.from(document.querySelectorAll('input[name="lvSessionStyle"]'));
    if (radios.length === 4) {
      const present = radios.map(r => r.value).sort();
      const want = expectedStyles.slice().sort();
      const match = present.length === want.length && present.every((v,i) => v === want[i]);
      _push(cat, "Session style picker has all 4 expected styles",
        match ? STATUS.PASS : STATUS.WARN,
        match ? "" : `present=${present.join(",")}`);
    } else {
      _push(cat, "Session style picker has all 4 expected styles", STATUS.FAIL,
        `radio count=${radios.length} (expected 4)`);
    }

    // Operator launcher grid populated (popovers moved out of header)
    const launchers = [
      "lv80BioBuilderBtn", "lv80LifeMapBtn", "lv80RiverBtn", "lv80PeekBtn",
      "wo10TranscriptBtn", "wo13ReviewBtn", "lv10dBugBtn",
    ];
    const found = launchers.filter(id => document.getElementById(id));
    _push(cat, "Operator launcher grid populated",
      found.length === launchers.length ? STATUS.PASS : STATUS.WARN,
      `${found.length}/${launchers.length} launchers found`);
  }

  // ── Category: Narrator Switch ──────────────────────────────────
  async function _check_narrator_switch() {
    const cat = "switch";

    // Narrator switcher popover present
    const sw = document.getElementById("lv80NarratorSwitcher");
    _push(cat, "narrator switcher popover present",
      sw ? STATUS.PASS : STATUS.FAIL,
      sw ? "" : "#lv80NarratorSwitcher missing");

    // Narrator list populated
    const list = document.getElementById("lv80NarratorList");
    if (list) {
      const n = list.children.length;
      _push(cat, "narrator switcher list populated",
        n > 0 ? STATUS.PASS : STATUS.WARN,
        `${n} narrators`);
    } else {
      _push(cat, "narrator switcher list populated", STATUS.FAIL,
        "#lv80NarratorList missing");
    }

    // sessionStyle is one of 4 valid values (memory_exercise dropped 2026-04-25)
    const validStyles = [
      "questionnaire_first", "clear_direct", "warm_storytelling", "companion",
    ];
    const ss = state && state.session && state.session.sessionStyle;
    _push(cat, "state.session.sessionStyle is valid",
      validStyles.includes(ss) ? STATUS.PASS : STATUS.FAIL,
      `value=${JSON.stringify(ss)}`);

    // sessionStyle persistence (in-memory matches localStorage on load)
    const lsStyle = localStorage.getItem("lorevox_session_style_v1");
    if (lsStyle) {
      _push(cat, "sessionStyle in-memory matches localStorage",
        lsStyle === ss ? STATUS.PASS : STATUS.WARN,
        `localStorage=${lsStyle} vs state=${ss}`);
    } else {
      _push(cat, "sessionStyle in-memory matches localStorage", STATUS.PASS,
        "no localStorage value (default applied)");
    }

    // Active narrator (informational)
    if (_hasNarrator()) {
      const name = document.getElementById("lv80ActiveNarratorName");
      _push(cat, "active narrator selected", STATUS.INFO,
        `${(name && name.textContent) || "—"} (${state.person_id.slice(0,8)})`);
    } else {
      _push(cat, "active narrator selected", STATUS.INFO,
        "no narrator selected");
    }
  }

  // ── Category: Camera Consent ───────────────────────────────────
  async function _check_camera_consent() {
    const cat = "camera";

    // FacialConsent loaded
    if (typeof window.FacialConsent !== "object" || window.FacialConsent === null) {
      _push(cat, "FacialConsent global loaded", STATUS.FAIL,
        "facial-consent.js not loaded — camera consent flow broken");
      return;
    }
    _push(cat, "FacialConsent global loaded", STATUS.PASS, "");

    // Consent recorded (informational)
    const granted = window.FacialConsent.isGranted();
    const declined = window.FacialConsent.isDeclined();
    _push(cat, "FacialConsent state",
      STATUS.INFO,
      `isGranted=${granted} isDeclined=${declined}`);

    // localStorage matches in-memory
    const lsConsent = localStorage.getItem("lorevox_facial_consent_granted");
    const lsBool = lsConsent === "true";
    if (lsConsent === null) {
      _push(cat, "consent localStorage matches in-memory",
        granted ? STATUS.WARN : STATUS.PASS,
        granted ? "in-memory granted but no localStorage value" : "no stored consent (clean state)");
    } else {
      _push(cat, "consent localStorage matches in-memory",
        lsBool === granted ? STATUS.PASS : STATUS.WARN,
        `ls=${lsConsent} memory=${granted}`);
    }

    // cameraActive global aligned with state.inputState.cameraActive
    const camGlobal = (typeof cameraActive !== "undefined") ? !!cameraActive : null;
    const camState = !!(state && state.inputState && state.inputState.cameraActive);
    if (camGlobal === null) {
      _push(cat, "cameraActive global ↔ state.inputState alignment", STATUS.WARN,
        "cameraActive global undefined");
    } else {
      _push(cat, "cameraActive global ↔ state.inputState alignment",
        camGlobal === camState ? STATUS.PASS : STATUS.FAIL,
        `global=${camGlobal} state=${camState}`);
    }

    // Critical: if camera is on, preview must be live (catches #145/#175/#190)
    if (camGlobal === true) {
      const preview = document.getElementById("lv74-cam-preview");
      const video   = document.getElementById("lv74-cam-video");
      const tracksLive = (() => {
        if (!video || !video.srcObject) return 0;
        try {
          return video.srcObject.getTracks().filter(t => t.readyState === "live").length;
        } catch (_) { return 0; }
      })();
      if (!preview) {
        _push(cat, "camera on → preview present", STATUS.FAIL,
          "cameraActive=true but #lv74-cam-preview missing — call window.lv74.showCameraPreview()");
      } else if (tracksLive < 1) {
        _push(cat, "camera on → preview has live track", STATUS.FAIL,
          `preview present but tracksLive=${tracksLive} — stream died, call stopEmotionEngine() then re-toggle`);
      } else {
        _push(cat, "camera on → preview has live track", STATUS.PASS,
          `tracksLive=${tracksLive}`);
      }
    } else {
      _push(cat, "camera on → preview has live track", STATUS.SKIP,
        "camera off (nothing to verify)");
    }

    // Auto-start one-shot flag is sane
    const autoFlag = window._lv80CamAutoStartedThisPageSession;
    if (typeof autoFlag === "undefined") {
      _push(cat, "auto-start one-shot flag",
        STATUS.INFO,
        "undefined (no narrator load yet this session)");
    } else {
      _push(cat, "auto-start one-shot flag", STATUS.INFO,
        `_lv80CamAutoStartedThisPageSession=${autoFlag}`);
    }
  }

  // ── Category: Mic / STT ────────────────────────────────────────
  async function _check_mic_stt() {
    const cat = "mic";

    // Web Speech API availability
    const speechApi = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (speechApi) {
      _push(cat, "Web Speech API available", STATUS.PASS,
        "browser STT path enabled");
    } else {
      _push(cat, "Web Speech API available", STATUS.WARN,
        "browser doesn't support Web Speech — typed fallback only");
    }

    // recognition global initialized (only after first mic toggle, so OK to be null pre-toggle)
    const rec = (typeof recognition !== "undefined") ? recognition : undefined;
    if (rec === null) {
      _push(cat, "recognition object initialized", STATUS.PASS,
        "null (initializes on first mic toggle)");
    } else if (rec === undefined) {
      _push(cat, "recognition object initialized", STATUS.WARN,
        "global undefined — STT module not loaded");
    } else {
      _push(cat, "recognition object initialized", STATUS.PASS,
        "recognition instance present");
    }

    // Mic button visual matches state.inputState
    const micBtn = document.getElementById("lv10dMicBtn");
    const micState = !!(state && state.inputState && state.inputState.micActive);
    if (micBtn) {
      const visual = micBtn.getAttribute("data-on") === "true";
      _push(cat, "mic button visual ↔ state.inputState",
        visual === micState ? STATUS.PASS : STATUS.WARN,
        `visual=${visual} state=${micState}`);
    } else {
      _push(cat, "mic button visual ↔ state.inputState", STATUS.WARN,
        "#lv10dMicBtn not present");
    }

    // listeningPaused is bool
    const lp = (typeof listeningPaused !== "undefined") ? listeningPaused : null;
    _push(cat, "listeningPaused state",
      typeof lp === "boolean" ? STATUS.PASS : STATUS.WARN,
      `value=${lp}`);

    // Hands-free scaffolding (state fields from WO-NARRATOR-ROOM-01)
    const hfFields = state && state.session && {
      handsFree: state.session.handsFree,
      micAutoRearm: state.session.micAutoRearm,
      loriSpeaking: state.session.loriSpeaking,
    };
    if (hfFields) {
      const allBool = ["handsFree","micAutoRearm","loriSpeaking"]
        .every(k => typeof hfFields[k] === "boolean");
      _push(cat, "hands-free state fields scaffolded",
        allBool ? STATUS.PASS : STATUS.WARN,
        JSON.stringify(hfFields));
    }

    // ── WO-AUDIO-READY-CHECK-01: preflight before audio capture ──
    // Catches morning frustration: mic permission denied, MediaRecorder
    // unavailable, non-secure context (HTTPS required for getUserMedia).
    const apf = await _audioPreflightProbe();
    _push(cat, "MediaRecorder API available (WO-AUDIO-READY-CHECK-01)",
      apf.media_recorder ? STATUS.PASS : STATUS.FAIL,
      apf.media_recorder
        ? "MediaRecorder defined — Chrome/Edge audio capture path available"
        : "MediaRecorder undefined — narrator audio capture WILL NOT work in this browser");
    _push(cat, "secure context for getUserMedia (WO-AUDIO-READY-CHECK-01)",
      apf.secure_context ? STATUS.PASS : STATUS.FAIL,
      apf.secure_context
        ? "isSecureContext=true (HTTPS or localhost)"
        : "isSecureContext=false — getUserMedia will reject; serve over https or localhost");
    _push(cat, "navigator.mediaDevices.getUserMedia present (WO-AUDIO-READY-CHECK-01)",
      apf.get_user_media ? STATUS.PASS : STATUS.FAIL,
      apf.get_user_media
        ? "getUserMedia available"
        : "getUserMedia missing — older browser?  audio capture impossible");
    let micStatus, micDetail;
    switch (apf.mic_permission) {
      case "granted": micStatus = STATUS.PASS;  micDetail = "operator already granted mic"; break;
      case "denied":  micStatus = STATUS.FAIL;  micDetail = "operator must re-grant mic from browser settings"; break;
      case "prompt":  micStatus = STATUS.INFO;  micDetail = "browser will prompt on first mic toggle"; break;
      default:        micStatus = STATUS.INFO;  micDetail = "permissions API didn't report state (browser may not support 'microphone' query)"; break;
    }
    _push(cat, "mic permission state (WO-AUDIO-READY-CHECK-01)", micStatus, micDetail);
    _push(cat, "audio preflight overall (WO-AUDIO-READY-CHECK-01)",
      apf.ready ? STATUS.PASS : STATUS.WARN,
      apf.ready ? "Mic ready ✓" : "Mic NOT ready: " + apf.detail);

    // ── WO-AUDIO-NARRATOR-ONLY-01: per-turn audio recorder ──────
    const nar = window.lvNarratorAudioRecorder;
    if (!nar || nar.loaded !== true) {
      _push(cat, "narrator-audio-recorder loaded (WO-AUDIO-NARRATOR-ONLY-01)",
        STATUS.FAIL,
        "window.lvNarratorAudioRecorder missing — Lori can't capture parent audio");
    } else {
      _push(cat, "narrator-audio-recorder loaded (WO-AUDIO-NARRATOR-ONLY-01)",
        STATUS.PASS,
        "available=" + nar.isAvailable() + " enabled=" + nar.isEnabled());

      // Check state.session.recordVoice (Save my voice toggle).
      const rv = state && state.session ? state.session.recordVoice : undefined;
      _push(cat, "Save my voice toggle (WO-AUDIO-NARRATOR-ONLY-01)",
        (rv === true || rv === false) ? STATUS.PASS : STATUS.INFO,
        "state.session.recordVoice=" + JSON.stringify(rv));

      // Recorder stats — segments_started/uploaded/lost.
      const st = nar.stats();
      const totalAttempted = (st.segments_started || 0);
      const totalLost = (st.segments_lost || 0);
      const totalUp = (st.segments_uploaded || 0);
      if (totalAttempted === 0) {
        _push(cat, "narrator-audio segment activity (WO-AUDIO-NARRATOR-ONLY-01)",
          STATUS.INFO,
          "no segments yet (state=" + st.state + ", ttsGate=" + st.ttsGateBlocked + ")");
      } else if (totalLost > 0 && totalLost / totalAttempted > 0.5) {
        _push(cat, "narrator-audio segment activity (WO-AUDIO-NARRATOR-ONLY-01)",
          STATUS.WARN,
          "started=" + totalAttempted + " uploaded=" + totalUp + " lost=" + totalLost +
          " — over 50% lost; check console for [narrator-audio] errors");
      } else {
        _push(cat, "narrator-audio segment activity (WO-AUDIO-NARRATOR-ONLY-01)",
          STATUS.PASS,
          "started=" + totalAttempted + " uploaded=" + totalUp + " lost=" + totalLost +
          " state=" + st.state);
      }

      // TTS gate observable.
      _push(cat, "narrator-audio TTS gate observable (WO-AUDIO-NARRATOR-ONLY-01)",
        typeof st.ttsGateBlocked === "boolean" ? STATUS.PASS : STATUS.WARN,
        "ttsGateBlocked=" + st.ttsGateBlocked + " — recorder drops segments when Lori speaks");

      // Save my voice UI toggle present
      const cb = document.getElementById("lvNarratorRecordVoice");
      if (cb) {
        _push(cat, "narrator-room Save my voice checkbox (WO-AUDIO-NARRATOR-ONLY-01)",
          STATUS.PASS,
          "checkbox present, checked=" + cb.checked);
      } else {
        _push(cat, "narrator-room Save my voice checkbox (WO-AUDIO-NARRATOR-ONLY-01)",
          STATUS.WARN,
          "#lvNarratorRecordVoice not present — narrator-room may not be loaded yet");
      }
    }

    // ── BUG-219: pre-mic draft preservation observable ──────────
    // The patch lives in app.js around startRecording/_wo8VoiceChunkUpdate/
    // _wo8FinalizeTurn.  We can't observe the closure variable directly,
    // but we can confirm the patched startRecording is in place by
    // checking its source for the BUG-219 marker comment.
    if (typeof startRecording === "function") {
      const src = startRecording.toString();
      if (/BUG-219/.test(src)) {
        _push(cat, "typed text preserved when mic toggles on (BUG-219)",
          STATUS.PASS,
          "startRecording wrapper carries BUG-219 marker — pre-mic draft snapshot wired");
      } else {
        _push(cat, "typed text preserved when mic toggles on (BUG-219)",
          STATUS.INFO,
          "startRecording present but BUG-219 marker not in toString output (likely OK if app.js is minified or wrapper hides it)");
      }
    } else {
      _push(cat, "typed text preserved when mic toggles on (BUG-219)",
        STATUS.WARN,
        "startRecording function not in scope — this should not happen");
    }
  }

  // ── Category: Chat Scroll ──────────────────────────────────────
  async function _check_chat_scroll() {
    const cat = "scroll";

    const inner = document.getElementById("crChatInner");
    if (!inner) {
      _push(cat, "#crChatInner scroll container present", STATUS.FAIL,
        "missing — narrator-room conversation column broken");
    } else {
      _push(cat, "#crChatInner scroll container present", STATUS.PASS, "");
      const ov = getComputedStyle(inner).overflowY;
      _push(cat, "#crChatInner overflow-y=auto",
        ov === "auto" ? STATUS.PASS : STATUS.WARN,
        `overflow-y=${ov}`);
    }

    // FocusCanvas scroll plumbing exposed
    const sclGlobal = typeof window._scrollToLatest;
    _push(cat, "window._scrollToLatest defined",
      sclGlobal === "function" ? STATUS.PASS : STATUS.FAIL,
      `typeof=${sclGlobal} (FocusCanvas scroll plumbing)`);

    // See New Message button present
    const seeNew = document.getElementById("seeNewMsgBtn");
    _push(cat, "#seeNewMsgBtn present",
      seeNew ? STATUS.PASS : STATUS.FAIL,
      seeNew ? "" : "missing — narrators won't see scroll-up new-message indicator");

    // chatMessages padding-bottom keeps last message clear of footer
    const chat = document.getElementById("chatMessages");
    if (chat) {
      const pb = parseInt(getComputedStyle(chat).paddingBottom, 10) || 0;
      _push(cat, "#chatMessages padding-bottom ≥ 100px",
        pb >= 100 ? STATUS.PASS : STATUS.WARN,
        `padding-bottom=${pb}px (footer-clear guarantee)`);
    } else {
      _push(cat, "#chatMessages present", STATUS.FAIL,
        "missing — chat bubble append target gone");
    }

    // lvNarratorScroll wrappers from WO-NARRATOR-ROOM-01
    _push(cat, "lvNarratorScrollToBottom wrapper",
      typeof window.lvNarratorScrollToBottom === "function" ? STATUS.PASS : STATUS.WARN,
      `typeof=${typeof window.lvNarratorScrollToBottom}`);
  }

  // ── Category: Memory River ─────────────────────────────────────
  async function _check_memory_river() {
    const cat = "river";

    const pop = document.getElementById("kawaRiverPopover");
    _push(cat, "Memory River popover present",
      pop ? STATUS.PASS : STATUS.FAIL,
      pop ? "" : "#kawaRiverPopover missing");

    const tab = document.querySelector('.lv-narrator-view-tab[data-view="river"]');
    _push(cat, "narrator-room Memory River view tab present",
      tab ? STATUS.PASS : STATUS.FAIL,
      tab ? "" : "narrator room missing river tab — WO-NARRATOR-ROOM-01 broken");

    const showFn = typeof window.lvNarratorShowView;
    _push(cat, "lvNarratorShowView available",
      showFn === "function" ? STATUS.PASS : STATUS.FAIL,
      `typeof=${showFn}`);

    const kawa = state && state.kawa;
    _push(cat, "state.kawa.segmentList array present",
      kawa && Array.isArray(kawa.segmentList) ? STATUS.PASS : STATUS.WARN,
      kawa ? `count=${(kawa.segmentList || []).length}` : "state.kawa missing");
  }

  // ── Category: Life Map ─────────────────────────────────────────
  async function _check_life_map() {
    const cat = "map";

    const pop = document.getElementById("lifeMapPopover");
    _push(cat, "Life Map popover present",
      pop ? STATUS.PASS : STATUS.FAIL,
      pop ? "" : "#lifeMapPopover missing");

    const tab = document.querySelector('.lv-narrator-view-tab[data-view="map"]');
    _push(cat, "narrator-room Life Map view tab present",
      tab ? STATUS.PASS : STATUS.FAIL, "");

    const launcher = document.getElementById("lv80LifeMapBtn");
    _push(cat, "operator launcher #lv80LifeMapBtn present",
      launcher ? STATUS.PASS : STATUS.FAIL, "");
  }

  // ── Category: Peek at Memoir ───────────────────────────────────
  async function _check_peek_memoir() {
    const cat = "memoir";

    const pop = document.getElementById("memoirScrollPopover");
    _push(cat, "Peek at Memoir popover present",
      pop ? STATUS.PASS : STATUS.FAIL,
      pop ? "" : "#memoirScrollPopover missing");

    const tab = document.querySelector('.lv-narrator-view-tab[data-view="memoir"]');
    _push(cat, "narrator-room Peek view tab present",
      tab ? STATUS.PASS : STATUS.FAIL, "");

    const launcher = document.getElementById("lv80PeekBtn");
    _push(cat, "operator launcher #lv80PeekBtn present",
      launcher ? STATUS.PASS : STATUS.FAIL, "");
  }

  // ── Category: Media Tab ────────────────────────────────────────
  // Verifies the Media tab + 3 launcher cards + the disabled-note state
  // matches the actual /api/photos/health response (catches the WO-UI-SHELL-01
  // class of bug where the note shows "enabled" while the flag is off).
  async function _check_media_tab() {
    const cat = "media";

    const tab = document.getElementById("lvMediaTab");
    _push(cat, "Media tab panel present",
      tab ? STATUS.PASS : STATUS.FAIL,
      tab ? "" : "#lvMediaTab missing — WO-UI-SHELL-01 broken");

    const tabBtn = document.getElementById("lvShellTabMedia");
    _push(cat, "Media tab nav button present",
      tabBtn ? STATUS.PASS : STATUS.FAIL,
      tabBtn ? "" : "#lvShellTabMedia missing");

    const cards = document.querySelectorAll(".lv-media-launch-card");
    _push(cat, "Media launcher cards present (3)",
      cards.length === 3 ? STATUS.PASS : STATUS.FAIL,
      `count=${cards.length}`);

    // Disabled-note state matches the photo health flag.  This is exactly
    // the regression the WO-UI-SHELL-01 preflight had — note showing
    // "enabled" because /api/photos returned 422 (route registered but
    // narrator_id missing) instead of 404.
    const note = document.getElementById("lvMediaDisabledNote");
    if (note) {
      const noteHidden = note.hidden;
      const h = await _fetchJSON("/api/photos/health");
      if (h.ok && h.body) {
        const featureOn = !!h.body.enabled;
        const expectHidden = featureOn;
        if (expectHidden === noteHidden) {
          _push(cat, "Disabled note state matches photo flag", STATUS.PASS,
            `note hidden=${noteHidden} flag enabled=${featureOn}`);
        } else {
          _push(cat, "Disabled note state matches photo flag", STATUS.WARN,
            `note hidden=${noteHidden} but flag enabled=${featureOn} — preflight stale until Media tab opened`);
        }
      } else {
        _push(cat, "Disabled note state matches photo flag", STATUS.SKIP,
          "could not reach /api/photos/health");
      }
    } else {
      _push(cat, "Disabled note element present", STATUS.WARN,
        "#lvMediaDisabledNote missing");
    }
  }

  // ── Category: Photos ───────────────────────────────────────────
  async function _check_photos() {
    const cat = "photos";

    const h = await _fetchJSON("/api/photos/health");
    if (h.status === 404) {
      _push(cat, "/api/photos/health installed", STATUS.NOT_INSTALLED,
        "router not mounted in main.py");
      return;
    }
    if (!h.ok || !h.body) {
      _push(cat, "/api/photos/health reachable", STATUS.FAIL,
        `status=${h.status} ${h.error || ""}`);
      return;
    }
    _push(cat, "/api/photos/health reachable", STATUS.PASS,
      `enabled=${h.body.enabled}`);

    if (!h.body.enabled) {
      _push(cat, "photo feature enabled", STATUS.DISABLED,
        "set LOREVOX_PHOTO_ENABLED=1 in .env + restart stack to use photo features");
      return;
    }
    _push(cat, "photo feature enabled", STATUS.PASS, "");

    if (!_hasNarrator()) {
      _push(cat, "narrator photo list reachable", STATUS.SKIP,
        "no narrator selected");
      return;
    }
    const list = await _fetchJSON(`/api/photos?narrator_id=${encodeURIComponent(state.person_id)}`);
    if (list.ok && list.body) {
      const n = (list.body.photos || []).length;
      _push(cat, "narrator photo list reachable", STATUS.PASS,
        `${n} photo(s) for ${state.person_id.slice(0,8)}`);
    } else {
      _push(cat, "narrator photo list reachable", STATUS.WARN,
        `status=${list.status} ${list.error || ""}`);
    }
  }

  // ── Category: Document Archive (WO-MEDIA-ARCHIVE-01) ───────────
  // Curator-side lane for PDFs / scanned documents / handwritten
  // notes / genealogy outlines / letters / certificates / clippings.
  // Distinct from Photo Intake (image-only memory prompts) and gated
  // behind its own flag (LOREVOX_MEDIA_ARCHIVE_ENABLED).
  //
  // Three checks:
  //   1. /api/media-archive/health route reachable (router mounted)
  //   2. /ui/media-archive.html page reachable (curator page exists)
  //   3. Operator launcher card present in Media tab (#lv80MediaArchiveBtn)
  async function _check_media_archive() {
    const cat = "media_archive";

    // 1) Health probe — surfaces 404 (router not mounted) vs disabled vs on
    const h = await _fetchJSON("/api/media-archive/health");
    if (h.status === 404) {
      _push(cat, "/api/media-archive/health installed", STATUS.NOT_INSTALLED,
        "router not mounted in main.py — WO-MEDIA-ARCHIVE-01 not deployed on this stack");
      return;
    }
    if (!h.ok || !h.body) {
      _push(cat, "/api/media-archive/health reachable", STATUS.FAIL,
        `status=${h.status} ${h.error || ""}`);
      return;
    }
    const storageRoot = h.body.storage_root || "(none)";
    _push(cat, "/api/media-archive/health reachable", STATUS.PASS,
      `enabled=${h.body.enabled} storage=${storageRoot}`);

    // Gate the rest behind enabled. When disabled, the LIST endpoint
    // returns 404 by design (each handler self-guards), so probing it
    // would just be noise.
    if (!h.body.enabled) {
      _push(cat, "media archive feature enabled", STATUS.DISABLED,
        "set LOREVOX_MEDIA_ARCHIVE_ENABLED=1 in .env + restart stack");
    } else {
      _push(cat, "media archive feature enabled", STATUS.PASS, "");

      // List endpoint reachable (no narrator filter — many archive
      // items aren't bound to a person at intake time, e.g. a
      // multi-family genealogy outline). 200 is the only PASS.
      const list = await _fetchJSON("/api/media-archive");
      if (list.ok && list.body) {
        _push(cat, "archive list endpoint reachable", STATUS.PASS,
          `${list.body.count || 0} item(s) total`);
      } else {
        _push(cat, "archive list endpoint reachable", STATUS.WARN,
          `status=${list.status} ${list.error || ""}`);
      }
    }

    // 2) Curator page reachable — the static-mount surface that
    // serves /ui/media-archive.html. We use HEAD so we only check
    // for 200 vs 404 without pulling the whole document.
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const res = await fetch("/ui/media-archive.html", { method: "HEAD", signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) {
        _push(cat, "/ui/media-archive.html page reachable", STATUS.PASS,
          `status=${res.status}`);
      } else {
        _push(cat, "/ui/media-archive.html page reachable", STATUS.FAIL,
          `status=${res.status} — page missing or static mount broken`);
      }
    } catch (e) {
      _push(cat, "/ui/media-archive.html page reachable", STATUS.WARN,
        `fetch threw: ${e && e.message || e}`);
    }

    // 3) Launcher card present in Media tab. The button is added by
    // lorevox10.0.html as part of the Media tab grid; if it's missing
    // the operator can't reach the curator page from the shell.
    const btn = document.getElementById("lv80MediaArchiveBtn");
    if (btn) {
      _push(cat, "Operator launcher card present (#lv80MediaArchiveBtn)", STATUS.PASS,
        "Document Archive card visible in Media tab");
    } else {
      _push(cat, "Operator launcher card present (#lv80MediaArchiveBtn)", STATUS.FAIL,
        "#lv80MediaArchiveBtn missing from Media tab — operator cannot launch curator page");
    }
  }

  // ── Category: Archive ──────────────────────────────────────────
  // Pure observation only — read /health + read existing session if any.
  // Write tests live in scripts/run_memory_archive_smoke.py.
  async function _check_archive() {
    const cat = "archive";

    const h = await _fetchJSON("/api/memory-archive/health");
    if (h.status === 404) {
      _push(cat, "/api/memory-archive/health installed", STATUS.NOT_INSTALLED,
        "router not mounted — WO-ARCHIVE-AUDIO-01 not deployed on this stack");
      return;
    }
    if (!h.ok || !h.body) {
      _push(cat, "/api/memory-archive/health reachable", STATUS.FAIL,
        `status=${h.status} ${h.error || ""}`);
      return;
    }
    _push(cat, "/api/memory-archive/health reachable", STATUS.PASS,
      `enabled=${h.body.enabled} cap=${h.body.max_mb_per_person}MB`);

    if (!h.body.enabled) {
      _push(cat, "archive feature enabled", STATUS.DISABLED,
        "set LOREVOX_ARCHIVE_ENABLED=1 in .env + restart stack");
      return;
    }
    _push(cat, "archive feature enabled", STATUS.PASS, "");

    if (!_hasNarrator()) {
      _push(cat, "active narrator for archive session", STATUS.SKIP,
        "no narrator selected");
      return;
    }
    if (!_hasConvId()) {
      _push(cat, "conv_id available for archive session", STATUS.SKIP,
        "no chat conv_id yet (start a chat to materialize)");
      return;
    }
    _push(cat, "active narrator + conv_id present", STATUS.PASS,
      `pid=${state.person_id.slice(0,8)} conv=${state.chat.conv_id.slice(0,8)}`);

    // Read-only probe — 200 means archive exists, 404 means not yet created (both fine)
    const sess = await _fetchJSON(
      `/api/memory-archive/session/${encodeURIComponent(state.chat.conv_id)}` +
      `?person_id=${encodeURIComponent(state.person_id)}`,
    );
    if (sess.status === 200) {
      const turns = (sess.body && sess.body.turns) || [];
      const audioLost = turns.filter(t => t.audio_lost === true).length;
      _push(cat, "archive session readable",
        STATUS.PASS,
        `${turns.length} turn(s)${audioLost ? `, ${audioLost} audio_lost` : ""}`);
    } else if (sess.status === 404) {
      _push(cat, "archive session readable", STATUS.PASS,
        "no archive session yet (created lazily on first turn)");
    } else {
      _push(cat, "archive session readable", STATUS.WARN,
        `status=${sess.status} ${sess.error || ""}`);
    }

    // ── WO-UI-HEALTH-CHECK-03: archive integrity + writer state ──
    // Surface counters from archive-writer so operator sees whether
    // text turns are actually flowing.

    // Writer module loaded
    const aw = window.lvArchiveWriter;
    if (!aw || aw.loaded !== true) {
      _push(cat, "archive-writer module loaded (WO-HC-03)", STATUS.FAIL,
        "window.lvArchiveWriter missing — text transcripts won't write");
    } else {
      _push(cat, "archive-writer module loaded (WO-HC-03)", STATUS.PASS,
        `enabled=${aw.isEnabled()} session_id=${(aw.sessionId() || "(none)").slice(0, 24)}`);

      // Stats — narrator + Lori writes flowing
      const st = aw.stats();
      const totalWrites = (st.narrator_writes || 0) + (st.lori_writes || 0);
      const failRate = totalWrites > 0 ? (st.fails / totalWrites) : 0;
      if (totalWrites === 0) {
        _push(cat, "archive transcript writes flowing (WO-HC-03)",
          STATUS.INFO,
          `no writes yet this session (narrator=${st.narrator_writes} lori=${st.lori_writes} fails=${st.fails})`);
      } else if (st.fails > 0 && failRate > 0.1) {
        _push(cat, "archive transcript writes flowing (WO-HC-03)",
          STATUS.WARN,
          `narrator=${st.narrator_writes} lori=${st.lori_writes} fails=${st.fails} (>10% failure rate)`);
      } else {
        _push(cat, "archive transcript writes flowing (WO-HC-03)",
          STATUS.PASS,
          `narrator=${st.narrator_writes} lori=${st.lori_writes} fails=${st.fails} skipped(disabled=${st.skipped_disabled || 0}, no_pid=${st.skipped_no_pid || 0})`);
      }

      // session_id sanity — should be non-empty + same shape across calls
      const sid = aw.sessionId();
      if (sid && typeof sid === "string" && sid.length >= 6) {
        _push(cat, "archive session_id stamped (WO-ARCHIVE-SESSION-BOUNDARY-01)",
          STATUS.PASS, `session_id=${sid.slice(0, 24)}…`);
      } else {
        _push(cat, "archive session_id stamped (WO-ARCHIVE-SESSION-BOUNDARY-01)",
          STATUS.FAIL, `session_id missing or malformed: ${JSON.stringify(sid)}`);
      }
    }

    // BUG-209: archive-writer auto-chain is now intentionally OFF —
    // backend chat_ws writes the canonical transcript.  Verify the
    // chain is OFF (not double-writing) AND that the manual hook is
    // still callable for future audio-attachment use.
    const oar = window.onAssistantReply;
    if (typeof oar !== "function") {
      _push(cat, "transcript writer wiring (BUG-209)",
        STATUS.FAIL, "onAssistantReply not defined — page may still be loading");
    } else if (oar._archiveWriterChained === true) {
      _push(cat, "transcript writer wiring (BUG-209)",
        STATUS.WARN, "auto-chain ENABLED — every turn will double-write to transcript.jsonl. Disable unless backend WS is off.");
    } else {
      const manual = (typeof window.lvArchiveOnNarratorTurn === "function") &&
                     (typeof window.lvArchiveOnLoriReply === "function");
      _push(cat, "transcript writer wiring (BUG-209)",
        manual ? STATUS.PASS : STATUS.WARN,
        manual
          ? "auto-chain OFF (backend WS is single source); manual hooks present for audio attachment"
          : "auto-chain OFF and manual hooks missing — audio attachment can't link to a turn");
    }

    // Export endpoint reachable (HEAD-equivalent via GET)
    if (typeof window.lvExportCurrentSessionArchive === "function") {
      _push(cat, "Export Current Session helper wired (WO-ARCHIVE-EXPORT-UX-01)",
        STATUS.PASS, "Bug Panel button is operational");
    } else {
      _push(cat, "Export Current Session helper wired (WO-ARCHIVE-EXPORT-UX-01)",
        STATUS.WARN, "lvExportCurrentSessionArchive not exposed — export button won't work");
    }
  }

  // ── WO-AUDIO-READY-CHECK-01 helper ──────────────────────────
  // Lightweight standalone preflight callable from header / Bug Panel.
  // Returns { ready: bool, mic: state, recorder: bool, https: bool, detail }.
  // Pure observation — never requests permission, never opens a stream.
  async function _audioPreflightProbe() {
    const result = {
      ready: false,
      mic_permission: "unknown",   // granted | denied | prompt | unknown
      media_recorder: false,
      secure_context: false,
      get_user_media: false,
      detail: "",
    };
    try {
      result.media_recorder = (typeof MediaRecorder !== "undefined");
      result.secure_context = !!window.isSecureContext;
      result.get_user_media = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      // Permissions API may be unavailable in some browsers; degrade gracefully.
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const p = await navigator.permissions.query({ name: "microphone" });
          result.mic_permission = p && p.state ? p.state : "unknown";
        } catch (_) { /* not all browsers support 'microphone' */ }
      }
      // "Ready" = all hard requirements met AND permission isn't denied.
      result.ready = !!(result.media_recorder && result.secure_context &&
                        result.get_user_media && result.mic_permission !== "denied");
      if (!result.media_recorder)  result.detail = "MediaRecorder unavailable (Chrome/Edge required)";
      else if (!result.get_user_media) result.detail = "navigator.mediaDevices.getUserMedia unavailable";
      else if (!result.secure_context) result.detail = "non-secure context (HTTPS required for getUserMedia)";
      else if (result.mic_permission === "denied") result.detail = "mic permission denied — operator must re-grant";
      else result.detail = "ready (mic_permission=" + result.mic_permission + ")";
    } catch (e) {
      result.detail = "preflight threw: " + (e && e.message || e);
    }
    return result;
  }
  // Expose for the Bug Panel button + the morning live build.
  window.lvAudioPreflight = _audioPreflightProbe;

  // ── Category: Session Style ────────────────────────────────────
  // Verifies WO-SESSION-STYLE-WIRING-01: state + persistence + dispatcher
  // wired + topbar reflects choice + questionnaire_first lane is real.
  async function _check_session_style() {
    const cat = "session";

    const valid = ["questionnaire_first","clear_direct","warm_storytelling","companion"];

    // 1. state.session.sessionStyle is one of 4 valid values (memory_exercise
    //    dropped 2026-04-25 — picker no-op, shelved for future product work).
    const ss = state && state.session && state.session.sessionStyle;
    _push(cat, "state.session.sessionStyle is one of 4 valid styles",
      valid.includes(ss) ? STATUS.PASS : STATUS.FAIL,
      `value=${JSON.stringify(ss)}`);

    // 2. localStorage persistence agreement (informational if unset)
    const ls = localStorage.getItem("lorevox_session_style_v1");
    if (ls) {
      _push(cat, "sessionStyle persists in localStorage matches state",
        ls === ss ? STATUS.PASS : STATUS.WARN,
        `ls=${ls} state=${ss}`);
    } else {
      _push(cat, "sessionStyle persists in localStorage matches state", STATUS.PASS,
        "no localStorage value yet (default applied)");
    }

    // 3. Dispatcher wired
    const dispatch = typeof window.lvSessionStyleEnter;
    _push(cat, "lvSessionStyleEnter dispatcher present",
      dispatch === "function" ? STATUS.PASS : STATUS.FAIL,
      `typeof=${dispatch} (session-style-router.js)`);

    // 4. Router accessor exposes valid styles (4 since memory_exercise
    //    dropped 2026-04-25).
    const router = window.lvSessionStyleRouter;
    if (router && Array.isArray(router.validStyles) && router.validStyles.length === 4) {
      _push(cat, "router.validStyles enumerates all 4 styles", STATUS.PASS,
        router.validStyles.join(","));
    } else {
      _push(cat, "router.validStyles enumerates all 4 styles", STATUS.FAIL,
        `validStyles=${JSON.stringify(router && router.validStyles)}`);
    }

    // 5. Narrator-room topbar pill reflects current style (only meaningful
    //    when the narrator room has been entered at least once; otherwise INFO).
    const pill = document.getElementById("lvNarratorRoomStyle");
    if (pill) {
      const txt = (pill.textContent || "").trim();
      const expectedLabels = {
        questionnaire_first: "Questionnaire first",
        clear_direct:        "Clear & direct",
        warm_storytelling:   "Warm storytelling",
        // memory_exercise dropped 2026-04-25 — kept here as legacy
        // fallback in case a saved sessionStyle slipped through the
        // session-style-router redirect.
        memory_exercise:     "Warm storytelling",
        companion:           "Companion",
      };
      const want = expectedLabels[ss];
      if (txt === "—" || txt === "") {
        _push(cat, "narrator-room topbar style label", STATUS.INFO,
          "narrator room not yet entered (label updates on lvNarratorRoomInit)");
      } else if (want && txt.toLowerCase() === want.toLowerCase()) {
        _push(cat, "narrator-room topbar style label",
          STATUS.PASS, `pill="${txt}" matches state ${ss}`);
      } else {
        _push(cat, "narrator-room topbar style label",
          STATUS.WARN, `pill="${txt}" but state=${ss} expected="${want}"`);
      }
    } else {
      _push(cat, "narrator-room topbar style label", STATUS.WARN,
        "#lvNarratorRoomStyle missing (narrator room not loaded)");
    }

    // 6. v9 incomplete-gate bypass for questionnaire_first.  We use a
    //    side-channel signal because some other module wraps lv80SwitchPerson
    //    (its toString returns the wrapper, not the original) so source
    //    introspection is unreliable.  Two-part check:
    //      a) lv80SwitchPerson exists at all
    //      b) router.bypassWired is true (session-style-router loaded)
    //      c) (informational) _lv80QuestionnaireFirstBypassFired is set
    //         after any narrator switch with style=questionnaire_first
    const fn = window.lv80SwitchPerson;
    if (typeof fn !== "function") {
      _push(cat, "lv80SwitchPerson available", STATUS.FAIL,
        "narrator-switch entry point missing");
    } else if (router && router.bypassWired === true) {
      _push(cat, "questionnaire_first incomplete-gate bypass wired",
        STATUS.PASS, "lv80SwitchPerson present + session-style-router loaded");
      // Informational: has the bypass branch fired this session?
      const fired = window._lv80QuestionnaireFirstBypassFired === true;
      _push(cat, "incomplete-gate bypass observed firing",
        fired ? STATUS.PASS : STATUS.INFO,
        fired ? "Corky-class bypass exercised this session"
              : "no questionnaire_first switch yet this session");
    } else {
      _push(cat, "questionnaire_first incomplete-gate bypass wired",
        STATUS.FAIL, "session-style-router.js not loaded (router.bypassWired missing)");
    }

    // 7. Questionnaire-first lane substate scaffolded (only when active).
    if (ss === "questionnaire_first") {
      const qf = state && state.session && state.session.questionnaireFirst;
      if (qf && typeof qf === "object") {
        _push(cat, "questionnaireFirst substate present", STATUS.PASS,
          `segment=${qf.segment} active=${qf.active}`);
      } else {
        _push(cat, "questionnaireFirst substate present", STATUS.INFO,
          "lane not yet entered (initializes on lvSessionStyleEnter)");
      }
    } else {
      _push(cat, "questionnaireFirst substate present", STATUS.SKIP,
        `current style is ${ss}, lane not in use`);
    }

    // 8. WO-HORNELORE-SESSION-LOOP-01: orchestrator wired
    _push(cat, "lvSessionLoopOnTurn dispatcher present",
      typeof window.lvSessionLoopOnTurn === "function" ? STATUS.PASS : STATUS.FAIL,
      `typeof=${typeof window.lvSessionLoopOnTurn} (session-loop.js)`);

    // 9. state.session.loop substate.  The dispatcher lazy-inits this
    //    on first call, so a missing substate at idle is INFO, not FAIL —
    //    only fail if the dispatcher is missing (caught by check #8 above).
    //    PASS once any narrator turn has fired the dispatcher and the
    //    askedKeys ledger is materialized.
    const loop = state && state.session && state.session.loop;
    if (loop && typeof loop === "object" && Array.isArray(loop.askedKeys)) {
      _push(cat, "state.session.loop substate materialized", STATUS.PASS,
        `askedKeys=${loop.askedKeys.length} lastTrigger=${loop.lastTrigger || "-"} lastAction=${loop.lastAction || "-"}`);
    } else if (typeof window.lvSessionLoopOnTurn === "function") {
      _push(cat, "state.session.loop substate materialized", STATUS.INFO,
        "dispatcher present but no turn yet — substate will lazy-init on first dispatch");
    } else {
      _push(cat, "state.session.loop substate materialized", STATUS.FAIL,
        "dispatcher missing AND substate missing — orchestrator can't run");
    }

    // 10. Tier-2 directive emitter present.  Post-BUG-218: the
    // capabilities-honesty preamble is included on EVERY style, so
    // warm_storytelling and questionnaire_first are no longer empty.
    // Expected shape:
    //   - cdDir contains "Ask one short" (clear_direct style suffix)
    //   - all directives contain "CAPABILITIES" (honesty preamble)
    const emitFn = typeof window._lvEmitStyleDirective;
    if (emitFn === "function") {
      const cdDir = window._lvEmitStyleDirective("clear_direct") || "";
      const wsDir = window._lvEmitStyleDirective("warm_storytelling") || "";
      const honestyPresent = /CAPABILITIES/i.test(cdDir) && /CAPABILITIES/i.test(wsDir);
      const styleSuffixPresent = /Ask one short/i.test(cdDir);
      // Post-WO-AUDIO-NARRATOR-ONLY-01: directive is now dynamic — should
      // reflect current state.session.recordVoice + recorder availability.
      // When recordVoice=true + recorder available: directive should say
      // "Yes, your voice is being saved" pattern.  When OFF: "No, audio
      // is currently not being captured".
      const audioOn = /your voice is being saved/i.test(wsDir);
      const audioOff = /audio is currently not being captured/i.test(wsDir);
      const dynamicCorrect = audioOn || audioOff;  // exactly one should be true
      if (honestyPresent && styleSuffixPresent && dynamicCorrect) {
        _push(cat, "tier-2 directives + dynamic BUG-218 honesty rule",
          STATUS.PASS,
          `cd len=${cdDir.length} ws len=${wsDir.length}; audio=${audioOn ? "ON" : (audioOff ? "OFF" : "?")}`);
      } else if (!honestyPresent) {
        _push(cat, "tier-2 directives + dynamic BUG-218 honesty rule",
          STATUS.WARN, "BUG-218 capabilities-honesty rule missing from directive");
      } else if (!dynamicCorrect) {
        _push(cat, "tier-2 directives + dynamic BUG-218 honesty rule",
          STATUS.WARN, "honesty rule present but audio-state language unclear — Lori may give vague answers");
      } else {
        _push(cat, "tier-2 directives + dynamic BUG-218 honesty rule",
          STATUS.WARN, `cd="${cdDir.slice(0,60)}..." ws="${wsDir.slice(0,60)}..."`);
      }
    } else {
      _push(cat, "tier-2 directives emit correctly + BUG-218 honesty rule",
        STATUS.FAIL, "_lvEmitStyleDirective not exposed");
    }

    // 11. Loop diagnostic accessor exposed
    _push(cat, "window.lvSessionLoop diagnostic accessor present",
      window.lvSessionLoop && window.lvSessionLoop.loaded === true
        ? STATUS.PASS : STATUS.FAIL,
      window.lvSessionLoop ? "loaded" : "missing");

    // 12. WO-01B: BB save ledger exists.  PASS if savedKeys is an
    //     array (lazy-init).  INFO if no saves have happened yet.
    if (loop && Array.isArray(loop.savedKeys)) {
      _push(cat, "loop.savedKeys ledger materialized (WO-01B)",
        STATUS.PASS,
        `${loop.savedKeys.length} field(s) saved this session: ${loop.savedKeys.slice(-3).join(",") || "(none yet)"}`);
    } else if (typeof window.lvSessionLoopOnTurn === "function") {
      _push(cat, "loop.savedKeys ledger materialized (WO-01B)",
        STATUS.INFO,
        "dispatcher present; ledger lazy-inits on first dispatch");
    } else {
      _push(cat, "loop.savedKeys ledger materialized (WO-01B)",
        STATUS.WARN,
        "loop substate missing");
    }

    // 13. WO-01B: BB PUT endpoint reachable from the page.  Lightweight
    //     OPTIONS-equivalent — a HEAD/GET on the GET form of the same
    //     endpoint.  Observation only, no PUT mutation.
    //     Skipped if no narrator selected (the GET endpoint requires
    //     person_id and would 422 without it).
    if (_hasNarrator()) {
      const ep = await _fetchJSON(`/api/bio-builder/questionnaire?person_id=${encodeURIComponent(state.person_id)}`);
      if (ep.ok) {
        _push(cat, "/api/bio-builder/questionnaire reachable",
          STATUS.PASS,
          `status=${ep.status} (BB save target endpoint live)`);
      } else if (ep.status === 404) {
        _push(cat, "/api/bio-builder/questionnaire reachable",
          STATUS.NOT_INSTALLED,
          "Bio Builder router not mounted");
      } else {
        _push(cat, "/api/bio-builder/questionnaire reachable",
          STATUS.WARN,
          `status=${ep.status} ${ep.error || ""}`);
      }
    } else {
      _push(cat, "/api/bio-builder/questionnaire reachable",
        STATUS.SKIP, "no narrator selected (probe requires person_id)");
    }

    // 14. WO-207: welcome-back suppression observable.  Set by
    //     lv80SwitchPerson when sessionStyle=questionnaire_first AND the
    //     v9-gate READY branch fires.  PASS if observed firing this session.
    const wbSuppressed = window._lv80WelcomeBackSuppressedForQF === true;
    _push(cat, "WO-13 welcome-back suppressed for questionnaire_first (#207)",
      wbSuppressed ? STATUS.PASS : STATUS.INFO,
      wbSuppressed
        ? "side-channel flag fired this session"
        : "no QF narrator-load this session yet");

    // 15. WO-206: camera one-shot gate dropped.  PASS if the global
    //     gate flag is not set (we removed the gating logic).
    const camOneShot = window._lv80CamAutoStartedThisPageSession;
    if (camOneShot === undefined) {
      _push(cat, "camera one-shot gate dropped (#206)",
        STATUS.PASS,
        "_lv80CamAutoStartedThisPageSession unset — auto-start fires per ready load");
    } else {
      _push(cat, "camera one-shot gate dropped (#206)",
        STATUS.WARN,
        `gate flag still defined: ${camOneShot} (regression?)`);
    }

    // ── BUG-208: Bio Builder narrator-scope checks ───────────────
    // Catches the cross-narrator contamination class.  Each check is
    // a pure read; nothing mutates state.

    // 16. bb.personId === state.person_id (the cardinal scope rule)
    const bb208 = state && state.bioBuilder;
    const stPid208 = state && state.person_id;
    if (!stPid208) {
      _push(cat, "BB person scope: bb.personId === state.person_id (BUG-208)",
        STATUS.SKIP, "no narrator selected yet");
    } else if (!bb208) {
      _push(cat, "BB person scope: bb.personId === state.person_id (BUG-208)",
        STATUS.INFO, "state.bioBuilder not yet initialized (no Bio Builder activity)");
    } else if (bb208.personId === stPid208) {
      _push(cat, "BB person scope: bb.personId === state.person_id (BUG-208)",
        STATUS.PASS, `pid=${stPid208.slice(0, 8)}`);
    } else {
      _push(cat, "BB person scope: bb.personId === state.person_id (BUG-208)",
        STATUS.FAIL,
        `state.person_id=${(stPid208 || "").slice(0, 8)} but bb.personId=${(bb208.personId || "null").toString().slice(0, 8)}`);
    }

    // 17. Questionnaire identity does NOT contradict the active profile.
    // If the active profile has fullName/dateOfBirth and bb.questionnaire.personal
    // also has them set, they should agree.  Mismatch = the Corky-shows-Christopher
    // class of contamination.
    if (!stPid208 || !bb208 || !bb208.questionnaire || !bb208.questionnaire.personal) {
      _push(cat, "BB questionnaire identity matches active profile (BUG-208)",
        STATUS.SKIP, "no narrator or no questionnaire personal block to validate");
    } else {
      const pp = bb208.questionnaire.personal || {};
      const profile = (state && state.profile && state.profile.basics) || {};
      const errs = [];
      const _norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
      if (pp.fullName && profile.fullName) {
        const a = _norm(pp.fullName);
        const b = _norm(profile.fullName);
        if (a && b && a !== b && !a.includes(b) && !b.includes(a)) {
          errs.push(`fullName mem="${pp.fullName.slice(0, 24)}" profile="${profile.fullName.slice(0, 24)}"`);
        }
      }
      if (pp.dateOfBirth && profile.dateOfBirth) {
        const a = _norm(pp.dateOfBirth);
        const b = _norm(profile.dateOfBirth);
        if (a && b && a !== b) {
          errs.push(`dob mem="${pp.dateOfBirth}" profile="${profile.dateOfBirth}"`);
        }
      }
      if (errs.length) {
        _push(cat, "BB questionnaire identity matches active profile (BUG-208)",
          STATUS.FAIL,
          `cross-narrator contamination suspected — ${errs.join("; ")}`);
      } else {
        _push(cat, "BB questionnaire identity matches active profile (BUG-208)",
          STATUS.PASS,
          "no fullName/DOB contradiction between bb.questionnaire.personal and profile.basics");
      }
    }

    // 18. localStorage QQ key for active narrator either matches active pid
    // or is absent.  Catches the case where a stale draft for narrator X
    // leaks into narrator Y's view because of restore-fallback logic.
    if (!stPid208) {
      _push(cat, "BB localStorage draft key scoped to active narrator (BUG-208)",
        STATUS.SKIP, "no narrator selected");
    } else {
      try {
        const otherDrafts = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf("lorevox_qq_draft_") === 0) {
            const draftPid = k.slice("lorevox_qq_draft_".length);
            if (draftPid && draftPid !== stPid208) otherDrafts.push(draftPid.slice(0, 8));
          }
        }
        // Other-narrator drafts existing is FINE (multi-narrator system) —
        // we only need to check that THIS narrator's view is clean.
        const myKey = "lorevox_qq_draft_" + stPid208;
        const myRaw = localStorage.getItem(myKey);
        let lsResolved = false;
        if (myRaw) {
          try {
            const parsed = JSON.parse(myRaw);
            const d = parsed && (parsed.d || parsed.data || parsed);
            const lsName = d && d.personal && d.personal.fullName;
            const profileName = state && state.profile && state.profile.basics && state.profile.basics.fullName;
            if (lsName && profileName) {
              const a = lsName.toLowerCase().trim();
              const b = profileName.toLowerCase().trim();
              if (a && b && a !== b && !a.includes(b) && !b.includes(a)) {
                _push(cat, "BB localStorage draft key scoped to active narrator (BUG-208)",
                  STATUS.FAIL,
                  `localStorage[${myKey.slice(-12)}] fullName="${lsName.slice(0, 30)}" but active profile fullName="${profileName.slice(0, 30)}"`);
                lsResolved = true;
              }
            }
            if (!lsResolved) {
              _push(cat, "BB localStorage draft key scoped to active narrator (BUG-208)",
                STATUS.PASS,
                `key matches active pid; ${otherDrafts.length} other-narrator draft(s) parked separately: [${otherDrafts.join(",")}]`);
            }
          } catch (e) {
            _push(cat, "BB localStorage draft key scoped to active narrator (BUG-208)",
              STATUS.WARN,
              `key exists but failed to parse: ${e && e.message || e}`);
          }
        } else {
          _push(cat, "BB localStorage draft key scoped to active narrator (BUG-208)",
            STATUS.PASS,
            `no draft yet for active pid (clean); ${otherDrafts.length} other-narrator draft(s) parked separately`);
        }
      } catch (e) {
        _push(cat, "BB localStorage draft key scoped to active narrator (BUG-208)",
          STATUS.WARN, `localStorage scan threw: ${e && e.message || e}`);
      }
    }

    // 19. Narrator-switch generation counter exposed (defends in-flight fetches).
    const coreMod = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
    if (coreMod && typeof coreMod._currentSwitchGen === "function") {
      _push(cat, "BB narrator-switch generation counter wired (BUG-208)",
        STATUS.PASS, `gen=${coreMod._currentSwitchGen()} (in-flight backend GETs check this on resolve)`);
    } else {
      _push(cat, "BB narrator-switch generation counter wired (BUG-208)",
        STATUS.FAIL,
        "LorevoxBioBuilderModules.core._currentSwitchGen missing — late backend responses can clobber active narrator's blob");
    }
  }

  // ── Category: Navigation Recovery ──────────────────────────────
  // Catches stranded-UI bug class:
  //   - shell tab attribute drifted to an invalid value
  //   - app shell unmounted (operator stuck at blank page)
  //   - multiple popovers open simultaneously (light-dismiss broken)
  //   - lvShellShowTab function gone (no way out of any tab)
  async function _check_navigation() {
    const cat = "navigation";

    // App shell still mounted
    const shell = document.getElementById("lv80Shell");
    _push(cat, "App shell mounted",
      shell ? STATUS.PASS : STATUS.FAIL,
      shell ? "" : "#lv80Shell missing — operator is stranded on a blank page");

    // body[data-shell-tab] is a known value
    const bodyTab = document.body && document.body.getAttribute("data-shell-tab");
    const valid = ["operator", "narrator", "media"];
    _push(cat, "body[data-shell-tab] is valid",
      valid.includes(bodyTab) ? STATUS.PASS : STATUS.WARN,
      `value=${bodyTab || "(unset)"}`);

    // Tab switcher function present
    _push(cat, "lvShellShowTab() available for tab navigation",
      typeof window.lvShellShowTab === "function" ? STATUS.PASS : STATUS.FAIL,
      typeof window.lvShellShowTab === "function" ? "" :
        "no way to switch tabs — operator stranded on whichever panel is active");

    // Currently-open popovers count.  More than one open simultaneously
    // is suspicious — Lorevox uses popover="auto" with light-dismiss,
    // so usually only one is open at a time.
    let openPopovers = [];
    try {
      const all = document.querySelectorAll('[popover]');
      all.forEach(el => {
        if (el.matches && el.matches(":popover-open")) {
          openPopovers.push(el.id || el.tagName);
        }
      });
    } catch (_) { /* :popover-open unsupported in old browsers */ }
    if (openPopovers.length === 0) {
      _push(cat, "popover state clean (no stuck overlays)", STATUS.PASS, "0 open");
    } else if (openPopovers.length === 1) {
      _push(cat, "popover state clean (no stuck overlays)", STATUS.PASS,
        `1 open (${openPopovers[0]}) — fine, light-dismiss available`);
    } else {
      _push(cat, "popover state clean (no stuck overlays)", STATUS.WARN,
        `${openPopovers.length} popovers open simultaneously: ${openPopovers.join(", ")}`);
    }

    // Take-a-break overlay state.  If hidden=false but break isn't active,
    // operator is stranded.
    const breakOverlay = document.getElementById("lvNarratorBreakOverlay");
    const breakActive  = !!(state && state.session && state.session.breakActive);
    if (breakOverlay) {
      const overlayShown = breakOverlay.hidden === false;
      if (overlayShown && !breakActive) {
        _push(cat, "Take-a-break overlay state aligned", STATUS.FAIL,
          "overlay is shown but state.session.breakActive=false — narrator stranded behind overlay");
      } else if (!overlayShown && breakActive) {
        _push(cat, "Take-a-break overlay state aligned", STATUS.WARN,
          "state.session.breakActive=true but overlay hidden — break button visual will mislead operator");
      } else {
        _push(cat, "Take-a-break overlay state aligned", STATUS.PASS,
          `overlay shown=${overlayShown} breakActive=${breakActive}`);
      }
    } else {
      _push(cat, "Take-a-break overlay element present", STATUS.WARN,
        "#lvNarratorBreakOverlay missing — narrator can't take a break");
    }
  }

  // ── Category: Harness Self-Check ───────────────────────────────
  // Confirms the harness itself is meeting its own contract.  Runs LAST
  // so it can observe its own runtime.
  async function _check_self() {
    const cat = "self";

    _push(cat, "harness loaded", STATUS.PASS,
      `window.lvUiHealthCheck (${Object.keys(window.lvUiHealthCheck).length} methods)`);

    // Runtime budget — stamped at the moment this check runs (NOT the final
    // total).  We approximate via the elapsed time since runStartTs which
    // runAll/runCategory set on _state.  Final stamp is in the topline.
    if (_state.runStartTs != null) {
      const elapsed = Math.round(((typeof performance !== "undefined") ? performance.now() : Date.now()) - _state.runStartTs);
      _push(cat, "runtime budget so far",
        elapsed < 3000 ? STATUS.PASS : STATUS.WARN,
        `${elapsed}ms (budget 3000ms)`);
    } else {
      _push(cat, "runtime budget so far", STATUS.SKIP, "runStartTs unset");
    }

    // Status enum vocabulary completeness — defensive check that all
    // statuses we use have a CSS class mapped.
    const used = new Set(_state.results.map(r => r.status));
    const unmapped = Array.from(used).filter(s => !_CSS[s]);
    _push(cat, "status enum has CSS mapping for every emitted status",
      unmapped.length === 0 ? STATUS.PASS : STATUS.WARN,
      unmapped.length === 0 ? `${used.size} status values seen` :
        `unmapped: ${unmapped.join(",")}`);
  }

  // ── Public API ─────────────────────────────────────────────────

  async function runAll() {
    if (_state.running) return;
    _state.running = true;
    _state.results = [];
    const t0 = (typeof performance !== "undefined") ? performance.now() : Date.now();
    _state.runStartTs = t0;
    try {
      for (const c of _CATEGORIES) {
        try { await c.fn(); }
        catch (e) {
          _push(c.key, "category check threw", STATUS.FAIL,
            `${e && e.name}: ${e && e.message || e}`);
        }
      }
    } finally {
      const t1 = (typeof performance !== "undefined") ? performance.now() : Date.now();
      _state.lastDurationMs = Math.round(t1 - t0);
      _state.lastRunTs = new Date().toISOString();
      _state.running = false;
      _render();
    }
    return _state.results.slice();
  }

  async function runCategory(catKey) {
    if (_state.running) return;
    const c = _CATEGORIES.find(x => x.key === catKey);
    if (!c) {
      console.warn("[ui-health-check] unknown category:", catKey);
      return;
    }
    _state.running = true;
    _state.results = [];
    const t0 = (typeof performance !== "undefined") ? performance.now() : Date.now();
    _state.runStartTs = t0;
    try { await c.fn(); }
    catch (e) {
      _push(c.key, "category check threw", STATUS.FAIL,
        `${e && e.name}: ${e && e.message || e}`);
    } finally {
      const t1 = (typeof performance !== "undefined") ? performance.now() : Date.now();
      _state.lastDurationMs = Math.round(t1 - t0);
      _state.lastRunTs = new Date().toISOString();
      _state.running = false;
      _render();
    }
    return _state.results.slice();
  }

  function _summary() {
    const buckets = { PASS: 0, WARN: 0, FAIL: 0, DISABLED: 0, SKIP: 0, INFO: 0 };
    _state.results.forEach(r => { buckets[r.status] = (buckets[r.status] || 0) + 1; });
    return buckets;
  }

  function _render() {
    const host = document.getElementById("lv10dBpUiHealthResults");
    if (!host) return;
    if (!_state.results.length) {
      host.innerHTML = '<div class="lv10d-bp-test-empty">No results yet — click a Run button.</div>';
      return;
    }
    const sum = _summary();
    const lines = [];
    lines.push(
      `<div class="lv10d-bp-test-summary">` +
      `<span class="lv10d-bp-value ok">${sum.PASS} PASS</span> · ` +
      `<span class="lv10d-bp-value warn">${sum.WARN} WARN</span> · ` +
      `<span class="lv10d-bp-value err">${sum.FAIL} FAIL</span> · ` +
      `<span class="lv10d-bp-value off">${sum.DISABLED} DISABLED</span> · ` +
      `<span class="lv10d-bp-value off">${sum.SKIP} SKIP</span>` +
      (sum.INFO ? ` · <span class="lv10d-bp-value off">${sum.INFO} INFO</span>` : "") +
      ` · <span class="lv10d-bp-test-duration">${_state.lastDurationMs}ms</span>` +
      `</div>`
    );

    // Group by category in display order.
    for (const c of _CATEGORIES) {
      const rows = _state.results.filter(r => r.category === c.key);
      if (!rows.length) continue;
      lines.push(`<div class="lv10d-bp-test-group-title">${c.label}</div>`);
      for (const r of rows) {
        const cls = _CSS[r.status] || "off";
        lines.push(
          `<div class="lv10d-bp-test-row">` +
          `<span class="lv10d-bp-value ${cls} lv10d-bp-test-status">${_escape(r.status)}</span>` +
          `<span class="lv10d-bp-test-name">${_escape(r.name)}</span>` +
          (r.detail
            ? `<span class="lv10d-bp-test-detail">${_escape(r.detail)}</span>`
            : ``) +
          `</div>`
        );
      }
    }
    host.innerHTML = lines.join("");
  }

  function _escape(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function copyReport() {
    const sum = _summary();
    const lines = [];
    lines.push(`Lorevox UI Health Check  ·  ${_state.lastRunTs || "(never run)"}`);
    lines.push("");
    lines.push(
      `Topline:  ${sum.PASS} PASS · ${sum.WARN} WARN · ${sum.FAIL} FAIL · ` +
      `${sum.DISABLED} DISABLED · ${sum.SKIP} SKIP · ${_state.lastDurationMs}ms`
    );
    lines.push("");
    for (const c of _CATEGORIES) {
      const rows = _state.results.filter(r => r.category === c.key);
      if (!rows.length) continue;
      lines.push(`[${c.label}]`);
      for (const r of rows) {
        const status = r.status.padEnd(8);
        lines.push(`  ${status}  ${r.name}` + (r.detail ? `   (${r.detail})` : ""));
      }
      lines.push("");
    }
    const text = lines.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => _flashCopyOk(true))
        .catch(() => _flashCopyOk(false, text));
    } else {
      _flashCopyOk(false, text);
    }
  }

  function _flashCopyOk(ok, fallbackText) {
    const host = document.getElementById("lv10dBpUiHealthResults");
    if (!host) return;
    const note = document.createElement("div");
    note.className = "lv10d-bp-test-copy-note";
    note.textContent = ok ? "Report copied to clipboard." :
      "Clipboard not available — see console for full text.";
    if (!ok && fallbackText) console.log("[ui-health-check] report:\n" + fallbackText);
    host.prepend(note);
    setTimeout(() => { try { note.remove(); } catch (_) {} }, 2200);
  }

  return {
    runAll: runAll,
    runCategory: runCategory,
    copyReport: copyReport,
    lastResults: () => _state.results.slice(),
    lastDurationMs: () => _state.lastDurationMs,
    lastRunTs: () => _state.lastRunTs,
  };
})();

console.log("[Lorevox] UI Health Check loaded — open Bug Panel to run.");
