/* ═══════════════════════════════════════════════════════════════
   emotion-ui.js — affect-aware toggle, MediaPipe emotion engine,
                   affect arc renderer
   Lorevox v6.1 Track B
   Load order: SEVENTH

   Architecture notes:
   - Raw emotion → affect state mapping happens entirely in the browser
     via the external emotion.js module (LoreVoxEmotion).
   - Only the derived affect_state crosses to the backend.
   - No video, no landmarks, no raw emotion labels leave the browser.
═══════════════════════════════════════════════════════════════ */

/* ── AFFECT STATE COLOR PALETTE ──────────────────────────────── */
const AFFECT_STATE_COLORS = {
  steady:     "#475569",
  engaged:    "#6ee7a8",
  reflective: "#93c5fd",
  moved:      "#c6a7ff",
  distressed: "#f6c453",
  overwhelmed:"#ff9b6b",
};

/* ── EMOTION-AWARE MODE TOGGLE ───────────────────────────────── */
function toggleEmotionAware(){
  emotionAware=!emotionAware;
  updateEmotionAwareBtn();
  if(emotionAware && !cameraActive){
    // WO-CAM-FIX: Removed session_id gate — camera must start even when
    // narrator is resumed without a fresh interview session.
    startEmotionEngine();
  } else if(!emotionAware && cameraActive){
    stopEmotionEngine();
  }
}

function updateEmotionAwareBtn(){
  const btn=document.getElementById("emotionAwareBtn"); if(!btn) return;
  btn.classList.toggle("active", emotionAware);
  btn.innerHTML=`<span id="cameraDot" class="camera-dot${cameraActive?" ":" off"}"></span>
    Affect-aware: ${emotionAware?"On":"Off"}`;
}

/* ── MEDIAPIPE EMOTION ENGINE ────────────────────────────────── */
async function startEmotionEngine(){
  if(cameraActive) return;
  if(typeof LoreVoxEmotion === "undefined"){
    // emotion.js not loaded — skip silently
    return;
  }

  // v7.1: Require explicit facial expression consent before any camera use.
  // FacialConsent is defined in facial-consent.js — must be loaded first.
  if(typeof FacialConsent !== "undefined"){
    const granted = await FacialConsent.request();
    if(!granted){
      emotionAware = false;
      updateEmotionAwareBtn();
      console.log("[Lorevox] Camera not started — facial expression consent declined.");
      return;
    }
  } else {
    // facial-consent.js not loaded — block camera as safety precaution
    console.warn("[Lorevox] facial-consent.js not loaded — camera blocked.");
    emotionAware = false;
    updateEmotionAwareBtn();
    return;
  }

  try{
    // WO-CAM-FIX: session_id may be null during narrator-resume (no fresh
    // interview start). That's fine — sessionId is stored but not used by
    // the emotion engine. Pass whatever we have.
    await LoreVoxEmotion.init({
      sessionId: (state.interview && state.interview.session_id) || null,
      apiBase:   ORIGIN,
      onAffectState: onBrowserAffectEvent,
    });
    LoreVoxEmotion.setSection(INTERVIEW_ROADMAP[sectionIndex]?.id || null);
    // Step 3 fix: LoreVoxEmotion.start() returns false on failure (doesn't throw).
    // Must check the return value — NOT assume success from the absence of an exception.
    const started = await LoreVoxEmotion.start();
    if (started) {
      cameraActive=true;
      // WO-10G: Sync inputState truth model
      if (typeof state !== "undefined" && state.inputState) {
        state.inputState.cameraActive = true;
        state.inputState.cameraConsent = true;
      }
      updateEmotionAwareBtn();
      // Step 3 diagnostic — confirm srcObject is set after camera start.
      const videoEl = document.querySelector("video[playsinline]");
      if (videoEl && !videoEl.srcObject) {
        console.warn("[camera] Video element has no srcObject after start — stream may not have attached.");
      }
      // WO-CAM-FIX: Show the camera preview mirror (WO-01) now that camera is active.
      // camera-preview.js exposes window.lv74.showCameraPreview() but nothing was calling it
      // after camera start. Without this, cameraActive=true but previewVisible stays false.
      if (window.lv74 && typeof window.lv74.showCameraPreview === "function") {
        window.lv74.showCameraPreview();
        console.log("[WO-CAM-FIX] Camera preview mirror activated.");
      }
      // WO-06: Camera-to-mic awareness prompt.
      // If camera started but mic is not recording, gently remind the narrator
      // that voice input is available. Only once per session.
      if (!window._wo06MicNudgeShown && !isRecording && typeof sysBubble === "function") {
        window._wo06MicNudgeShown = true;
        setTimeout(function() {
          // Re-check — mic may have started in the meantime
          if (!isRecording && cameraActive) {
            sysBubble("💡 Camera is on — tap the microphone button when you're ready to talk.");
          }
        }, 3000);  // 3s delay: don't overwhelm narrator right after camera starts
      }
    } else {
      console.warn("[camera] LoreVoxEmotion.start() returned false — camera did not start. Affect-aware mode disabled.");
      emotionAware = false;
      updateEmotionAwareBtn();
      // WO-CAM-FIX: Show user-facing message instead of silent failure.
      // Check browser permission state to give a specific, actionable message.
      _wo_camfix_showPermissionHelp();
    }
  }catch(e){
    console.warn("[camera] Emotion engine threw on start:", e);
    emotionAware = false;
    cameraActive = false;
    updateEmotionAwareBtn();
    // WO-CAM-FIX: Also show permission help on thrown exceptions
    _wo_camfix_showPermissionHelp();
  }
}

/* ── WO-CAM-FIX: User-facing camera permission help ────────────
   When the camera fails to start (permission denied, hardware missing,
   etc.), show a clear, gentle, actionable message instead of silently
   disabling affect-aware mode. For elderly narrators, a confusing silent
   failure is far worse than a clear explanation.
   ────────────────────────────────────────────────────────────── */
async function _wo_camfix_showPermissionHelp() {
  var reason = "unknown";
  try {
    var perm = await navigator.permissions.query({ name: "camera" });
    reason = perm.state; // "denied", "prompt", "granted"
  } catch (_) { /* permissions API not available */ }

  var msg;
  if (reason === "denied") {
    msg = "Camera is blocked by your browser. To fix this:\n\n" +
          "1. Click the lock icon (or camera icon) in the address bar\n" +
          "2. Find 'Camera' and change it to 'Allow'\n" +
          "3. Reload this page\n\n" +
          "The camera lets Lori see when you're thinking or feeling something — " +
          "but everything still works fine without it.";
  } else if (reason === "prompt") {
    msg = "The camera needs your permission to start. " +
          "If you see a popup asking to allow camera access, please click 'Allow'. " +
          "You can try again by clicking the Cam button above.";
  } else {
    msg = "The camera couldn't start. This might mean:\n\n" +
          "• No camera is connected\n" +
          "• Another program is using the camera\n" +
          "• The browser blocked camera access\n\n" +
          "Everything still works fine without it — you can talk to Lori using the microphone.";
  }

  // Show via sysBubble if available (gentle in-chat message),
  // otherwise fall back to alert for visibility
  if (typeof sysBubble === "function") {
    sysBubble("📷 " + msg.split("\n")[0].replace(/\n/g, " "));
    // Also log the full message for Bug Panel / diagnostics
    console.warn("[WO-CAM-FIX] Camera permission help shown. Reason: " + reason);
    console.warn("[WO-CAM-FIX] Full message:\n" + msg);
  } else {
    alert(msg);
  }
}

function stopEmotionEngine(){
  if(typeof LoreVoxEmotion !== "undefined") LoreVoxEmotion.stop();
  cameraActive=false;
  updateEmotionAwareBtn();

  // WO-10G: Hard-clear visual signals when camera turns off.
  // Prevents stale affect data from persisting in state and leaking into
  // buildRuntime71() even after the 8s threshold (race window).
  if (typeof state !== "undefined" && state.session && state.session.visualSignals) {
    state.session.visualSignals.affectState     = null;
    state.session.visualSignals.confidence      = 0;
    state.session.visualSignals.gazeOnScreen    = null;
    state.session.visualSignals.blendConfidence = 0;
    state.session.visualSignals.timestamp       = null;
  }

  // WO-10G: Sync inputState truth model
  if (typeof state !== "undefined" && state.inputState) {
    state.inputState.cameraActive = false;
  }

  console.log("[WO-10G] Camera stopped — visual signals cleared.");
}

// Called by emotion.js when affect state changes.
// event = { affectState, confidence, durationMs }  ← camelCase from emotion.js
// Responsibilities here: update local session log + refresh arc.
// Backend posting is handled by emotion.js (postAffectEvent via apiBase) for
// sustained events, so we do NOT duplicate the POST here.
function onBrowserAffectEvent(event){
  const section_id = INTERVIEW_ROADMAP[sectionIndex]?.id || null;

  // Keep local session log for arc renderer (unchanged)
  sessionAffectLog.push({
    ts:           Date.now(),
    section_id,
    affect_state: event.affectState,
    confidence:   event.confidence,
  });

  // v7.4A — authoritative affect bridge
  // Writes into state.session.visualSignals for buildRuntime71() to consume.
  // gazeOnScreen is null in 7.4A (optional; populated in a later phase).
  if (window.AffectBridge74) {
    window.AffectBridge74.consume(event, {
      gazeOnScreen:    null,
      blendConfidence: event.confidence,
    });
  }

  // Redraw affect arc in timeline if it's visible
  if(showAffectArc) renderTimeline();
}

/* ── AFFECT ARC RENDERER (TIMELINE) ─────────────────────────── */
function renderAffectArc(){
  if(!sessionAffectLog.length) return "";
  // Group by section
  const bySection = {};
  sessionAffectLog.forEach(e=>{
    const key=e.section_id||"unknown";
    if(!bySection[key]) bySection[key]=[];
    bySection[key].push(e);
  });

  let html="";
  Object.entries(bySection).forEach(([secId, events])=>{
    const section=INTERVIEW_ROADMAP.find(s=>s.id===secId);
    const secLabel=section?`${section.emoji} ${section.label}`:secId;
    const dots=events.map(e=>{
      const col=AFFECT_STATE_COLORS[e.affect_state]||"#475569";
      return `<span class="affect-dot ${e.affect_state}" title="${e.affect_state} (${Math.round(e.confidence*100)}%)"
        style="background:${col};display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 2px;"></span>`;
    }).join("");
    html+=`<div class="tl-affect-row">
      <span class="text-slate-600">${esc(secLabel)}</span>
      <span>${dots}</span>
    </div>`;
  });
  return html;
}
