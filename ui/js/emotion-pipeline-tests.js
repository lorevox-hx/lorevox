/* ═══════════════════════════════════════════════════════════════
   emotion-pipeline-tests.js — WO-05 Emotion Pipeline Test Coverage
   Lorevox 1.0

   Runs in-browser via the Bug Panel's "Run Tests" button.
   Tests the complete affect pipeline end-to-end:
     1. LoreVoxEmotion module existence and API surface
     2. Affect state constants and mapping completeness
     3. FacialConsent gate behavior
     4. AffectBridge74 integration
     5. Camera preview (WO-01) integration
     6. Bug Panel diagnostic field accuracy
     7. Consent persistence (WO-02)

   Usage: Call window.runEmotionPipelineTests() from console or Bug Panel.
═══════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  const EXPECTED_AFFECT_STATES = ["steady", "engaged", "reflective", "moved", "distressed", "overwhelmed"];

  let _results = [];
  let _pass = 0;
  let _fail = 0;

  function _assert(name, condition, detail) {
    if (condition) {
      _pass++;
      _results.push({ name, status: "PASS", detail: detail || "" });
    } else {
      _fail++;
      _results.push({ name, status: "FAIL", detail: detail || "Assertion failed" });
    }
  }

  function _section(label) {
    _results.push({ name: "── " + label + " ──", status: "SECTION", detail: "" });
  }

  /* ── Test Suites ───────────────────────────────────────────── */

  function testLoreVoxEmotionAPI() {
    _section("LoreVoxEmotion Module");

    _assert("LoreVoxEmotion exists on window",
      typeof window.LoreVoxEmotion !== "undefined");

    _assert("LoreVoxEmotion.init is a function",
      typeof window.LoreVoxEmotion?.init === "function");

    _assert("LoreVoxEmotion.start is a function",
      typeof window.LoreVoxEmotion?.start === "function");

    _assert("LoreVoxEmotion.stop is a function",
      typeof window.LoreVoxEmotion?.stop === "function");

    _assert("LoreVoxEmotion.setSection is a function",
      typeof window.LoreVoxEmotion?.setSection === "function");

    _assert("LoreVoxEmotion.isActive is a function",
      typeof window.LoreVoxEmotion?.isActive === "function");

    _assert("LoreVoxEmotion.getLastAffectState is a function",
      typeof window.LoreVoxEmotion?.getLastAffectState === "function");

    _assert("LoreVoxEmotion.AFFECT_STATES array present",
      Array.isArray(window.LoreVoxEmotion?.AFFECT_STATES));
  }

  function testAffectStateConstants() {
    _section("Affect State Constants");

    const states = window.LoreVoxEmotion?.AFFECT_STATES || [];

    _assert("AFFECT_STATES has 6 entries",
      states.length === 6,
      "Got " + states.length);

    EXPECTED_AFFECT_STATES.forEach(function (s) {
      _assert("AFFECT_STATES contains '" + s + "'",
        states.indexOf(s) !== -1);
    });

    // Check color palette matches
    if (typeof AFFECT_STATE_COLORS !== "undefined") {
      EXPECTED_AFFECT_STATES.forEach(function (s) {
        _assert("AFFECT_STATE_COLORS has color for '" + s + "'",
          !!AFFECT_STATE_COLORS[s],
          AFFECT_STATE_COLORS[s] || "missing");
      });
    } else {
      _assert("AFFECT_STATE_COLORS global exists", false, "Not defined");
    }
  }

  function testFacialConsent() {
    _section("FacialConsent Gate");

    _assert("FacialConsent exists on window",
      typeof window.FacialConsent !== "undefined");

    _assert("FacialConsent.isGranted is a function",
      typeof window.FacialConsent?.isGranted === "function");

    _assert("FacialConsent.isDeclined is a function",
      typeof window.FacialConsent?.isDeclined === "function");

    _assert("FacialConsent.request is a function",
      typeof window.FacialConsent?.request === "function");

    _assert("FacialConsent.reset is a function",
      typeof window.FacialConsent?.reset === "function");

    _assert("FacialConsent.revokeStored is a function (WO-02)",
      typeof window.FacialConsent?.revokeStored === "function");

    // State consistency
    const granted = window.FacialConsent?.isGranted();
    const declined = window.FacialConsent?.isDeclined();
    _assert("Consent not both granted AND declined",
      !(granted && declined),
      "granted=" + granted + " declined=" + declined);

    // localStorage persistence check (WO-02)
    var stored = false;
    try { stored = localStorage.getItem("lorevox_facial_consent_granted") === "true"; } catch (_) {}
    if (granted) {
      _assert("WO-02: Granted consent is persisted in localStorage",
        stored,
        "localStorage=" + stored);
    }
  }

  function testAffectBridge() {
    _section("AffectBridge74 Integration");

    _assert("AffectBridge74 exists on window",
      typeof window.AffectBridge74 !== "undefined");

    if (typeof window.AffectBridge74 !== "undefined") {
      _assert("AffectBridge74.consume is a function",
        typeof window.AffectBridge74.consume === "function");

      _assert("AffectBridge74.beginBaselineWindow is a function",
        typeof window.AffectBridge74.beginBaselineWindow === "function");

      _assert("AffectBridge74.finalizeBaseline is a function",
        typeof window.AffectBridge74.finalizeBaseline === "function");
    }
  }

  function testCameraPreview() {
    _section("Camera Preview (WO-01)");

    _assert("window.lv74 namespace exists",
      typeof window.lv74 !== "undefined");

    _assert("window.lv74.showCameraPreview is a function",
      typeof window.lv74?.showCameraPreview === "function");

    // Test DOM creation
    window.lv74.showCameraPreview();
    var preview = document.getElementById("lv74-cam-preview");
    var video = document.getElementById("lv74-cam-video");
    var bar = document.getElementById("lv74-cam-preview-bar");
    var close = document.getElementById("lv74-cam-close");
    var reopen = document.getElementById("lv74-cam-reopen");

    _assert("Preview container created",
      !!preview);

    _assert("Video element created",
      !!video);

    _assert("Preview bar created",
      !!bar);

    _assert("Close button created",
      !!close);

    _assert("Reopen pill created",
      !!reopen);

    // Check CSS mirror transform
    if (video) {
      var transform = getComputedStyle(video).transform;
      _assert("Video has mirror transform (scaleX -1)",
        transform && transform.indexOf("-1") !== -1,
        "transform=" + transform);
    }

    // Test close/reopen cycle
    if (close) close.click();
    _assert("Close hides preview",
      preview && preview.classList.contains("lv74-preview-hidden"));
    _assert("Close shows reopen pill",
      reopen && reopen.classList.contains("lv74-reopen-visible"));

    if (reopen) reopen.click();
    _assert("Reopen restores preview",
      preview && !preview.classList.contains("lv74-preview-hidden"));
    _assert("Reopen hides pill",
      reopen && !reopen.classList.contains("lv74-reopen-visible"));

    // Clean up test DOM
    if (preview) preview.remove();
    if (reopen) reopen.remove();
  }

  function testStateModel() {
    _section("State Model (Affect/Input)");

    _assert("state object exists",
      typeof state !== "undefined");

    _assert("state.inputState exists",
      typeof state !== "undefined" && !!state.inputState);

    if (state.inputState) {
      _assert("state.inputState.cameraActive is boolean",
        typeof state.inputState.cameraActive === "boolean");

      _assert("state.inputState.cameraConsent is boolean",
        typeof state.inputState.cameraConsent === "boolean");

      _assert("state.inputState.micActive is boolean",
        typeof state.inputState.micActive === "boolean");
    }

    _assert("emotionAware global is boolean",
      typeof emotionAware === "boolean");

    _assert("cameraActive global is boolean",
      typeof cameraActive === "boolean");

    // WO-02: Check defaults
    _assert("WO-02: emotionAware defaults to true",
      emotionAware === true,
      "emotionAware=" + emotionAware);

    _assert("WO-02: permCamOn defaults to true",
      typeof permCamOn !== "undefined" && permCamOn === true,
      "permCamOn=" + (typeof permCamOn !== "undefined" ? permCamOn : "undefined"));
  }

  function testEmotionUIFunctions() {
    _section("Emotion UI Functions");

    _assert("toggleEmotionAware is a function",
      typeof toggleEmotionAware === "function");

    _assert("updateEmotionAwareBtn is a function",
      typeof updateEmotionAwareBtn === "function");

    _assert("startEmotionEngine is a function",
      typeof startEmotionEngine === "function");

    _assert("stopEmotionEngine is a function",
      typeof stopEmotionEngine === "function");

    _assert("onBrowserAffectEvent is a function",
      typeof onBrowserAffectEvent === "function");

    _assert("renderAffectArc is a function",
      typeof renderAffectArc === "function");
  }

  function testMicVisualSync() {
    _section("Mic Visual State (WO-03)");

    _assert("_setMicVisual is a function",
      typeof _setMicVisual === "function");

    var label = document.getElementById("btnMicLabel");
    _assert("btnMicLabel element exists in DOM",
      !!label);

    // Test off state
    _setMicVisual(false);
    label = document.getElementById("btnMicLabel");
    if (label) {
      _assert("WO-03: MIC OFF label shows when inactive",
        label.textContent === "MIC OFF",
        "text=" + label.textContent);

      _assert("WO-03: Label not red when inactive",
        !label.classList.contains("mic-label-active"));
    }

    // Test on state
    _setMicVisual(true);
    label = document.getElementById("btnMicLabel");
    if (label) {
      _assert("WO-03: LISTENING label shows when active",
        label.textContent === "LISTENING",
        "text=" + label.textContent);

      _assert("WO-03: Label is red when active",
        label.classList.contains("mic-label-active"));
    }

    // Reset
    _setMicVisual(false);
  }

  function testBugPanelFields() {
    _section("Bug Panel Diagnostic Fields (WO-04)");

    var fields = [
      "lv10dBpCamPreview",
      "lv10dBpFacialConsent",
      "lv10dBpConsentStored",
      "lv10dBpSttEngine"
    ];

    fields.forEach(function (id) {
      _assert("WO-04: Bug Panel field '" + id + "' exists in DOM",
        !!document.getElementById(id));
    });
  }

  /* ── Runner ────────────────────────────────────────────────── */

  function runAll() {
    _results = [];
    _pass = 0;
    _fail = 0;

    testLoreVoxEmotionAPI();
    testAffectStateConstants();
    testFacialConsent();
    testAffectBridge();
    testCameraPreview();
    testStateModel();
    testEmotionUIFunctions();
    testMicVisualSync();
    testBugPanelFields();

    // Summary
    var summary = "WO-05 Emotion Pipeline Tests: " + _pass + " passed, " + _fail + " failed, " + (_pass + _fail) + " total";
    console.log("[WO-05] " + summary);
    _results.forEach(function (r) {
      if (r.status === "SECTION") {
        console.log("[WO-05] " + r.name);
      } else {
        var icon = r.status === "PASS" ? "✓" : "✗";
        console.log("[WO-05]   " + icon + " " + r.name + (r.detail ? " — " + r.detail : ""));
      }
    });

    return { pass: _pass, fail: _fail, total: _pass + _fail, results: _results };
  }

  // Expose globally
  global.runEmotionPipelineTests = runAll;

})(typeof window !== "undefined" ? window : global);
