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
  if(!emotionAware && cameraActive) stopEmotionEngine();
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
  try{
    await LoreVoxEmotion.init({
      sessionId: state.interview.session_id,
      sectionId: INTERVIEW_ROADMAP[sectionIndex]?.id || null,
      onAffectEvent: onBrowserAffectEvent,
    });
    await LoreVoxEmotion.start();
    cameraActive=true;
    updateEmotionAwareBtn();
  }catch(e){
    console.warn("LoreVox: emotion engine could not start", e);
  }
}

function stopEmotionEngine(){
  if(typeof LoreVoxEmotion !== "undefined") LoreVoxEmotion.stop();
  cameraActive=false;
  updateEmotionAwareBtn();
}

// Called by emotion.js when an affect event fires
function onBrowserAffectEvent(event){
  // event = { affect_state, confidence, duration_ms }
  sessionAffectLog.push({
    ts: Date.now(),
    section_id: INTERVIEW_ROADMAP[sectionIndex]?.id || null,
    affect_state: event.affect_state,
    confidence: event.confidence,
  });
  // Post to backend (fire-and-forget)
  if(state.interview.session_id){
    fetch(API.IV_AFFECT_EVENT, {
      method:"POST", headers:ctype(),
      body:JSON.stringify({
        session_id: state.interview.session_id,
        timestamp: Date.now()/1000,
        section_id: INTERVIEW_ROADMAP[sectionIndex]?.id || null,
        affect_state: event.affect_state,
        confidence: event.confidence,
        duration_ms: event.duration_ms || 2000,
        source: "camera",
      }),
    }).catch(()=>{});
  }
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
