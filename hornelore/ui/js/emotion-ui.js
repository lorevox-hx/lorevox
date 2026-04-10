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
  if(emotionAware && state.interview.session_id && !cameraActive){
    // Symmetric start: turning on mid-session starts the engine immediately
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
    await LoreVoxEmotion.init({
      sessionId: state.interview.session_id,
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
    } else {
      console.warn("[camera] LoreVoxEmotion.start() returned false — camera did not start. Affect-aware mode disabled.");
      emotionAware = false;
      updateEmotionAwareBtn();
    }
  }catch(e){
    console.warn("[camera] Emotion engine threw on start:", e);
    emotionAware = false;
    cameraActive = false;
    updateEmotionAwareBtn();
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
