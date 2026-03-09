/* ═══════════════════════════════════════════════════════════════
   interview.js — interview session: start, answer processing,
                  roadmap, memory triggers
   Lorevox v6.1
   Load order: NINTH
═══════════════════════════════════════════════════════════════ */

/* ── ROADMAP ─────────────────────────────────────────────────── */
function renderRoadmap(){
  const w=document.getElementById("roadmapList"); w.innerHTML="";
  // Filter: skip youth sections unless youthMode is on
  const visibleSections=INTERVIEW_ROADMAP.map((s,i)=>({s,i})).filter(({s})=>!s.youth||youthMode);

  if(interviewMode==="thematic"){
    THEMATIC_GROUPS.forEach(grp=>{
      const grpSections=visibleSections.filter(({s})=>grp.ids.includes(s.id));
      if(!grpSections.length) return;
      const hdr=document.createElement("div"); hdr.className="kin-group-row"; hdr.textContent=grp.label;
      w.appendChild(hdr);
      grpSections.forEach(({s,i})=>appendRoadmapItem(w,s,i));
    });
  } else {
    visibleSections.forEach(({s,i})=>appendRoadmapItem(w,s,i));
  }
  const s=INTERVIEW_ROADMAP[sectionIndex];
  if(s) document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
}

function appendRoadmapItem(w,s,i){
  const d=document.createElement("div");
  d.className="roadmap-item"+(i===sectionIndex?" active-section":"")+(sectionDone[i]?" done":"");
  const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!sectionDone[i];
  cb.style.flexShrink="0";
  cb.onclick=e=>{
    e.stopPropagation(); sectionDone[i]=cb.checked;
    if(sectionDone[i]&&i===sectionIndex&&i<INTERVIEW_ROADMAP.length-1) sectionIndex++;
    persistSectionDone(); renderRoadmap(); renderMemoirChapters(); updateSidebar();
  };
  const lbl=document.createElement("span");
  const hasSensitive=sensitiveSegments.some(seg=>seg.sectionIdx===i);
  const sensIcon=hasSensitive?`<span class="rm-sensitive-icon" title="Contains private segment">⊘</span>`:"";
  lbl.className="rm-label truncate"; lbl.innerHTML=`<span class="rm-emoji">${s.emoji}</span> ${esc(s.label)}${sensIcon}`;
  d.appendChild(cb); d.appendChild(lbl);
  d.onclick=e=>{
    if(e.target===cb) return;
    sectionIndex=i; sectionVisited[i]=true;
    renderRoadmap(); updateContextTriggers();
    showTab("interview");
    document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
  };
  w.appendChild(d);
}

function prevSection(){ sectionIndex=Math.max(0,sectionIndex-1); renderRoadmap(); updateContextTriggers(); }
function nextSection(){ sectionIndex=Math.min(INTERVIEW_ROADMAP.length-1,sectionIndex+1); renderRoadmap(); updateContextTriggers(); }
function persistSectionDone(){
  if(state.person_id) localStorage.setItem(LS_DONE(state.person_id), JSON.stringify(sectionDone));
}

/* ── EMOTION ENGINE SECTION SYNC ─────────────────────────────── */
// Keep LoreVoxEmotion in sync with the current interview section so that
// every affect event is tagged with the correct section_id.
function _syncEmotionSection(){
  if(typeof LoreVoxEmotion !== "undefined" && LoreVoxEmotion.isActive()){
    LoreVoxEmotion.setSection(INTERVIEW_ROADMAP[sectionIndex]?.id || null);
  }
}

/* ── AFFECT NUDGE HELPER ─────────────────────────────────────── */
// Returns a recent (≤60s), confident affect state for ivAskInChat nudges.
// Returns null if no useful signal is available.
function _latestAffect(){
  if(!sessionAffectLog.length) return null;
  const last=sessionAffectLog[sessionAffectLog.length-1];
  if(Date.now()-last.ts > 60000) return null;   // stale
  if(last.confidence < 0.65) return null;        // below threshold
  if(last.affect_state === "steady") return null; // no nudge needed for steady
  return last;
}

/* ── MEMORY TRIGGERS ─────────────────────────────────────────── */
function updateContextTriggers(){
  _syncEmotionSection(); // keep emotion engine in sync with current section
  const el=document.getElementById("contextTriggers"); if(!el) return;
  const birthYear=getBirthYear();
  const country=getCountry();
  if(!birthYear){ el.innerHTML=`<div class="py-1">Set a date of birth on the Profile tab to see age-anchored triggers.</div>`; return; }
  const sec=INTERVIEW_ROADMAP[sectionIndex]; if(!sec){ el.innerHTML=""; return; }
  const relevant=ALL_EVENTS.filter(e=>{
    const age=e.year-birthYear; if(age<3||age>100) return false;
    if(!e.tags.includes(country)&&!e.tags.includes("global")) return false;
    return e.tags.some(t=>sec.tags.includes(t));
  }).slice(0,3);
  if(!relevant.length){ el.innerHTML=`<div class="py-1">No specific world events matched for this section — ask freely.</div>`; return; }
  el.innerHTML=`<div class="space-y-2 py-1">`+relevant.map(e=>{
    const age=e.year-birthYear;
    return `<div class="event-card" style="margin:0" onclick='fireEventPrompt(${JSON.stringify(e)},${age})'>
      <span class="event-year">${e.year}</span>
      <span class="event-text">${esc(e.event)}</span>
      <span class="event-age-badge">Age ${age}</span>
    </div>`;
  }).join("")+`</div>`;
}

/* ── INTERVIEW SESSION RENDERING ─────────────────────────────── */
function renderInterview(){
  document.getElementById("ivSession").textContent=state.interview.session_id||"—";
  document.getElementById("ivQid").textContent=state.interview.question_id||"—";
  document.getElementById("ivPrompt").textContent=state.interview.prompt||"Select a section and click Begin Section to start.";
  const s=INTERVIEW_ROADMAP[sectionIndex];
  if(s) document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
  updateContextTriggers();
}

/* ── INTERVIEW START ─────────────────────────────────────────── */
async function ivStart(){
  if(!state.person_id){ sysBubble("Select or create a person first."); return; }

  // v6.1: Show permission card on first interview start of the session
  if(!permCardShown){
    document.getElementById("permCard").classList.remove("hidden");
    permCardShown=true;
    return; // actual start happens in confirmPermCard()
  }
  await _ivStartActual();
}

async function _ivStartActual(){
  try{
    const r=await fetch(API.IV_START,{method:"POST",headers:ctype(),
      body:JSON.stringify({person_id:state.person_id, plan_id:"default"})});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j=await r.json();
    state.interview={
      session_id:j.session_id,
      question_id:j.question?.id||null,
      prompt:j.question?.prompt||null
    };
    renderInterview();
    if(j.question?.prompt){
      sendSystemPrompt(`[SYSTEM: You are now in an interview. Please ask this first question warmly: "${j.question.prompt}"]`);
    }
    sysBubble("▶ Interview section started.");
    showTab("interview");

    // Start camera if user opted in
    if(permCamOn && emotionAware) startEmotionEngine();
  }catch{
    sysBubble("⚠ Interview service unavailable — chat freely with Lori to capture memories.");
  }
}

/* ── INTERVIEW ANSWER PROCESSING ─────────────────────────────── */
async function processInterviewAnswer(text, skipped=false){
  if(!state.interview.session_id||!state.interview.question_id) return null;
  try{
    const r=await fetch(API.IV_ANSWER,{method:"POST",headers:ctype(),body:JSON.stringify({
      session_id:state.interview.session_id,
      question_id:state.interview.question_id,
      answer:text, skipped
    })});
    const j=await r.json();
    if(j.next_question){
      state.interview.question_id=j.next_question.id;
      state.interview.prompt=j.next_question.prompt;
    }
    if(j.summary_section_id){
      // Translate backend plan ID → UI roadmap ID (they use different naming conventions)
      const uiId=PLAN_ID_MAP[j.summary_section_id]||j.summary_section_id;
      const idx=INTERVIEW_ROADMAP.findIndex(s=>s.id===uiId);
      if(idx>=0){ sectionDone[idx]=true; sectionIndex=Math.min(idx+1,INTERVIEW_ROADMAP.length-1);
        persistSectionDone(); renderRoadmap(); renderMemoirChapters(); updateSidebar(); }
    }
    if(j.generated_summary) appendOutput("📝 Section Summary — "+(j.summary_section_title||""), j.generated_summary);
    if(j.final_memoir)      appendOutput("📖 Memoir Draft", j.final_memoir);

    // v6.1 Track A: Handle safety trigger from backend
    turnCount++;
    if(j.safety_triggered && j.safety_category){
      const resources = j.safety_resources || [];
      flagSensitiveSegment(sectionIndex, j.safety_category, text);
      showSafetyOverlay(j.safety_category, resources);
    }
    if(j.interview_softened){
      softenedMode=true;
      softenedUntilTurn=turnCount+3;
    }
    // Auto-expire softened mode
    if(softenedMode && turnCount >= softenedUntilTurn){
      softenedMode=false;
    }

    renderInterview();
    return j;
  }catch{ return null; }
}

/* ── INTERVIEW CONTROLS ──────────────────────────────────────── */
async function ivAskInChat(){
  if(!state.interview.prompt){ sysBubble("Start an interview section first."); return; }

  let instruction;

  if(softenedMode){
    // Post-disclosure softened mode takes priority over affect nudges
    const turnsLeft = softenedUntilTurn - turnCount;
    if(turnsLeft <= 1){
      // Second+ softened question — add a gentle check-in
      instruction = `[SYSTEM: The person shared something difficult earlier in this session. Please ask the following question very gently and briefly. After the question, add a warm check-in: "How are you doing? We can keep going or take a break anytime." Do not pressure or probe. Question: "${state.interview.prompt}"]`;
    } else {
      // First softened question after disclosure
      instruction = `[SYSTEM: The person recently shared something difficult. Please ask the following question very gently and briefly — keep it short, no follow-up pressure, no probing. Question: "${state.interview.prompt}"]`;
    }
  } else {
    // v6.1 Track B: check for a recent affect signal and nudge Lori's tone
    const affect = _latestAffect();
    let affectCtx = "";
    if(affect){
      if(affect.affect_state === "moved"){
        affectCtx = " The person appears moved — take a gentle, unhurried tone and give them space.";
      } else if(affect.affect_state === "reflective"){
        affectCtx = " The person seems reflective — keep the question short and leave room for them to think.";
      } else if(affect.affect_state === "distressed" || affect.affect_state === "overwhelmed"){
        affectCtx = " The person seems unsettled — check in first: \"We can slow down if you'd like.\" then ask gently.";
      } else if(affect.affect_state === "engaged"){
        affectCtx = " The person seems engaged — you can open this up warmly and invite them to share more.";
      }
    }
    instruction = `[SYSTEM: Please ask this question now.${affectCtx} Question: "${state.interview.prompt}"]`;
  }

  await sendSystemPrompt(instruction);
}

async function ivSkip(){ await processInterviewAnswer("",true); sysBubble("⤼ Skipped for now."); }

async function ivSaveAndNext(){
  const ans=getv("ivAnswer").trim(); if(!ans){ sysBubble("Type an answer first."); return; }
  const result=await processInterviewAnswer(ans);
  if(result!==null){ captureState="saved"; renderCaptureChip();
    setTimeout(()=>{ setv("ivAnswer",""); captureState=null; renderCaptureChip(); },600); }
}

async function ivSaveAsMemory(){
  const ans=getv("ivAnswer").trim(); if(!ans){ sysBubble("Type something to save as a memory."); return; }
  if(!state.person_id){ sysBubble("Select a person first."); return; }
  const s=INTERVIEW_ROADMAP[sectionIndex];
  const title=s?`${s.label} — memory`:"Memory";
  try{
    await fetch(API.TL_ADD,{method:"POST",headers:ctype(),body:JSON.stringify({
      person_id:state.person_id,title,description:ans,ts:new Date().toISOString().split("T")[0],
      kind:"personal"})});
    captureState="saved"; renderCaptureChip();
    sysBubble("📁 Saved as memory to Timeline.");
    renderTimeline();
  }catch{ sysBubble("⚠ Could not reach timeline service — memory not saved."); }
}

function onIvAnswerEdit(){
  if(captureState==="captured") captureState="edited";
  renderCaptureChip();
}

function renderCaptureChip(){
  const el=document.getElementById("captureChip"); if(!el) return;
  if(!captureState){ el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  if(captureState==="captured"){
    el.className="capture-chip captured"; el.textContent="✓ Captured from Lori";
  } else if(captureState==="saved"){
    el.className="capture-chip saved"; el.textContent="📁 Saved to archive";
  } else {
    el.className="capture-chip edited"; el.textContent="✎ Edited by hand";
  }
}
