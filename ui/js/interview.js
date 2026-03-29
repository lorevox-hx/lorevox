/* ═══════════════════════════════════════════════════════════════
   interview.js — interview session: start, answer processing,
                  roadmap, memory triggers
   Lorevox v7.1
   Load order: NINTH
═══════════════════════════════════════════════════════════════ */

/* ── ROADMAP ─────────────────────────────────────────────────── */
/* v7.1: when timeline spine exists, show Life Periods instead of
   the legacy section checklist. Falls back gracefully if no seed. */
function renderRoadmap(){
  const w=document.getElementById("roadmapList"); if(!w) return;
  w.innerHTML="";

  const periods = getCurrentLifePeriods();

  if(periods.length){
    // v7.1 path — render life period spine
    const currentEra = getCurrentEra();
    periods.forEach(p=>{
      const isActive = currentEra === p.label;
      const d=document.createElement("div");
      d.className="roadmap-item"+(isActive?" active-section":"");
      const yearRange = p.start_year
        ? (p.end_year ? `${p.start_year}–${p.end_year}` : `${p.start_year}+`)
        : "";
      d.innerHTML=`
        <span class="rm-label truncate">
          <span class="rm-emoji">◌</span>
          ${esc(prettyEra(p.label))}
          ${yearRange?`<span style="color:#475569;font-size:9px;margin-left:4px">${yearRange}</span>`:""}
        </span>`;
      d.onclick=()=>{
        setEra(p.label);
        if(interviewMode==="chronological") setPass("pass2a");
        update71RuntimeUI();
        renderRoadmap();
        renderInterview();
        showTab("interview");
      };
      w.appendChild(d);
    });
    // default to first era if none selected
    if(!getCurrentEra() && periods[0]) setEra(periods[0].label);
    update71RuntimeUI();
    return;
  }

  // legacy path — section checklist (no timeline seed yet)
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

/* ── v7.1 era label prettifier ───────────────────────────────── */
function prettyEra(v){
  return v ? String(v).replaceAll("_"," ").replace(/\b\w/g, m=>m.toUpperCase()) : "";
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

/* ── MEMORY TRIGGERS / ERA SUPPORT ───────────────────────────── */
/* v7.1: when a timeline seed exists, show era-anchored support
   prompts instead of random world-event cards.
   Falls back to world-event cards for the legacy pre-seed path. */
function updateContextTriggers(){
  _syncEmotionSection();
  const el=document.getElementById("contextTriggers"); if(!el) return;

  // v7.1 path — era support prompts
  if(getTimelineSeedReady()){
    const era  = getCurrentEra();
    const mode = getCurrentMode();
    const ERA_PROMPTS = {
      early_childhood:  ["Think about home life — the kitchen, bedroom, yard, or street.", "Who was in the household then?", "Does this memory feel closer to home, neighborhood, or family?"],
      school_years:     ["Does this connect more to school, home, or neighborhood life?", "What teacher, class, or school routine comes back first?", "Were you still living in the same place then?"],
      adolescence:      ["Does this feel like school years or the start of independence?", "What music, friendships, or places anchor that period?", "Were you still living at home then?"],
      early_adulthood:  ["Were you on your own by then, or still closely tied to home?", "Was work, school, marriage, or moving the biggest change?", "What city or place defines that period most?"],
      midlife:          ["Does this connect more to work, caregiving, or family routines?", "Who depended on you most during that time?", "What did a normal day feel like then?"],
      later_life:       ["Does this feel tied to home, health, family, or reflection?", "What became more important to you during this chapter?", "What place best holds that period in memory?"],
    };
    const prompts = ERA_PROMPTS[era] || ["Lori can use age, place, and family anchors to guide this era gently."];
    const modeHint = mode === "recognition"
      ? `<div class="text-xs text-amber-300 mb-2">Recognition support — Lori will use easier anchoring prompts.</div>`
      : mode === "grounding"
        ? `<div class="text-xs text-emerald-400 mb-2">Grounding mode — Lori is pacing gently right now.</div>`
        : "";

    // v6 integration — era-aware draft context trigger cards
    let draftCards = "";
    if(typeof LorevoxBioBuilder !== "undefined"){
      let eraItems = null;
      // Try era-aware accessor first
      if(LorevoxBioBuilder._getDraftFamilyContextForEra && era){
        const eraCtx = LorevoxBioBuilder._getDraftFamilyContextForEra(null, era);
        if(eraCtx && (eraCtx.primary.length > 0 || eraCtx.secondary.length > 0)){
          eraItems = eraCtx.primary.concat(eraCtx.secondary);
        }
      }

      const _draftHints = [];
      if(eraItems){
        // v6 path: ranked era-relevant items
        eraItems.forEach(item=>{
          if(item.node && item.node.notes && /do\s*not\s*prompt/i.test(item.node.notes)) return;
          if(item.type === "ft_person") _draftHints.push(`Ask about ${item.role || "family member"}: ${esc(item.label)}`);
          else if(item.type === "lt_theme") _draftHints.push(`Explore theme: ${esc(item.label)}`);
          else if(item.type === "lt_place") _draftHints.push(`Places: ${esc(item.label)}`);
          else if(item.type === "lt_event") _draftHints.push(`Event: ${esc(item.label)}`);
        });
      } else if(LorevoxBioBuilder._getDraftFamilyContext){
        // v5 fallback: global context
        const ctx = LorevoxBioBuilder._getDraftFamilyContext();
        if(ctx){
          if(ctx.familyTree && ctx.familyTree.nodes){
            ctx.familyTree.nodes.forEach(n=>{
              if(n.role === "narrator") return;
              if(n.notes && /do\s*not\s*prompt/i.test(n.notes)) return;
              const label = n.displayName || n.preferredName || n.label || "";
              if(label) _draftHints.push(`Ask about ${n.role || "family member"}: ${esc(label)}`);
            });
          }
          if(ctx.lifeThreads && ctx.lifeThreads.nodes){
            ctx.lifeThreads.nodes.forEach(n=>{
              if(n.type !== "theme") return;
              const label = n.label || n.displayName || "";
              if(label) _draftHints.push(`Explore theme: ${esc(label)}`);
            });
          }
        }
      }

      if(_draftHints.length > 0){
        const eraLabel = eraItems ? " (era-matched)" : "";
        draftCards = `<div class="text-xs" style="color:#5eead4;margin-bottom:4px;margin-top:8px;">From Bio Builder draft${eraLabel}:</div>` +
          _draftHints.slice(0,4).map(h=>`<div class="event-card" style="margin:0;border-left:2px solid rgba(20,184,166,0.4);">${h}</div>`).join("");
      }
    }

    el.innerHTML = modeHint + `<div class="space-y-2 py-1">` +
      prompts.map(t=>`<div class="event-card" style="margin:0">${esc(t)}</div>`).join("") + draftCards + `</div>`;
    return;
  }

  // legacy path — world-event cards
  const birthYear=getBirthYear();
  const country=getCountry();
  if(!birthYear){ el.innerHTML=`<div class="py-1">Add date of birth on the Profile tab to see age-anchored prompts.</div>`; return; }
  const sec=INTERVIEW_ROADMAP[sectionIndex]; if(!sec){ el.innerHTML=""; return; }
  const relevant=ALL_EVENTS.filter(e=>{
    const age=e.year-birthYear; if(age<3||age>100) return false;
    if(!e.tags.includes(country)&&!e.tags.includes("global")) return false;
    return e.tags.some(t=>sec.tags.includes(t));
  }).slice(0,3);
  if(!relevant.length){ el.innerHTML=`<div class="py-1">No specific world events matched — ask freely.</div>`; return; }
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
/* v7.1: when a timeline seed exists, builds prompt from pass + era.
   Falls back to the session-engine-assigned prompt for legacy flow. */
function renderInterview(){
  document.getElementById("ivSession").textContent=state.interview.session_id||"—";
  document.getElementById("ivQid").textContent=state.interview.question_id||"—";

  // v7.1 — show pass-aware prompt when seed is ready
  if(getTimelineSeedReady()){
    document.getElementById("ivPrompt").textContent = build71InterviewPrompt();
  } else {
    document.getElementById("ivPrompt").textContent=state.interview.prompt||"Select a section and click Begin Section to start.";
    const s=INTERVIEW_ROADMAP[sectionIndex];
    if(s) document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
  }

  update71RuntimeUI();
  updateContextTriggers();
}

/* ── v7.1 — pass-aware prompt builder ───────────────────────── */
function build71InterviewPrompt(){
  const pass = getCurrentPass();
  const era  = getCurrentEra();
  const mode = getCurrentMode();
  const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname || "this person";

  var base;
  if(pass==="pass2a") base = _timelinePassPrompt(era, mode);
  else if(pass==="pass2b") base = _depthPassPrompt(era, mode, name);
  else base = "When were you born? And where were you born?";

  // v5 integration — enrich with Family Tree / Life Threads draft context
  var draftHint = _buildDraftContextHint(era);
  return draftHint ? base + " " + draftHint : base;
}

/* ── v6 — era-aware draft context hint for interview prompts ── */
/* Uses the era-aware accessor to produce ranked, era-relevant
   context hints. Falls back to global context if no era data.
   Never leaks private notes or "Do Not Prompt" flagged nodes.
   Returns empty string if no useful context is available. */
function _buildDraftContextHint(era){
  // Try era-aware accessor first (v6), fall back to global (v5)
  if(typeof LorevoxBioBuilder === "undefined") return "";

  var eraCtx = null;
  if(LorevoxBioBuilder._getDraftFamilyContextForEra && era){
    eraCtx = LorevoxBioBuilder._getDraftFamilyContextForEra(null, era);
  }

  if(eraCtx && (eraCtx.primary.length > 0 || eraCtx.secondary.length > 0)){
    // v6 path: era-ranked hints
    var hints = [];
    var people = [];
    var themes = [];
    var places = [];

    // Primary items first, then secondary, capped at 3 each
    var allItems = eraCtx.primary.concat(eraCtx.secondary);
    allItems.forEach(function(item){
      // Respect "Do Not Prompt"
      if(item.node && item.node.notes && /do\s*not\s*prompt/i.test(item.node.notes)) return;
      if(item.type === "ft_person" && people.length < 3) people.push(item.role + " " + item.label);
      else if(item.type === "lt_theme" && themes.length < 3) themes.push(item.label);
      else if(item.type === "lt_place" && places.length < 2) places.push(item.label);
    });

    if(people.length > 0) hints.push("(Family for this era: " + people.join(", ") + ".)");
    if(themes.length > 0) hints.push("(Themes: " + themes.join(", ") + ".)");
    if(places.length > 0) hints.push("(Places: " + places.join(", ") + ".)");
    if(hints.length > 0) return hints.join(" ");
  }

  // v5 fallback: global context
  if(!LorevoxBioBuilder._getDraftFamilyContext) return "";
  var ctx = LorevoxBioBuilder._getDraftFamilyContext();
  if(!ctx) return "";
  var hints = [];

  var ft = ctx.familyTree;
  if(ft && ft.nodes && ft.nodes.length > 1){
    var relNames = [];
    ft.nodes.forEach(function(n){
      if(n.role === "narrator") return;
      if(n.notes && /do\s*not\s*prompt/i.test(n.notes)) return;
      var label = n.displayName || n.preferredName || n.label || "";
      var role = n.role || "";
      if(label && role) relNames.push(role + " " + label);
    });
    if(relNames.length > 0){
      var sample = relNames.slice(0, 3);
      hints.push("(Family context: " + sample.join(", ") + (relNames.length > 3 ? ", and others" : "") + ".)");
    }
  }

  var lt = ctx.lifeThreads;
  if(lt && lt.nodes && lt.nodes.length > 0){
    var themes = [];
    lt.nodes.forEach(function(n){
      if(n.type !== "theme") return;
      var label = n.label || n.displayName || "";
      if(label) themes.push(label);
    });
    if(themes.length > 0){
      var sample = themes.slice(0, 3);
      hints.push("(Life themes: " + sample.join(", ") + (themes.length > 3 ? ", and more" : "") + ".)");
    }
  }

  return hints.join(" ");
}

function _timelinePassPrompt(era, mode){
  const base = {
    early_childhood:  "Let's begin near the beginning. What do you know about the place where you were born, and where you lived when you were very young?",
    school_years:     "Thinking about your school years, what town, school, or neighborhood feels most connected to that time?",
    adolescence:      "As you got older, what changed most in your life during those years — school, friends, family, work, or where you lived?",
    early_adulthood:  "What do you think of as the beginning of your adult life? Where were you living then?",
    midlife:          "What responsibilities, jobs, or family roles shaped your middle adult years the most?",
    later_life:       "What major transitions stand out most from your later adult years?",
  }[era] || "Let's continue building the life timeline.";

  if(mode==="recognition") return base + " You can answer with whichever option feels closest, even if you're not sure.";
  if(mode==="light")       return base + " We can keep this simple.";
  if(mode==="grounding")   return "We can go gently. What place from that part of life feels safest or easiest to begin with?";
  return base;
}

function _depthPassPrompt(era, mode, name){
  const base = {
    early_childhood:  "When you picture your earliest home, what room, smell, or sound comes back first?",
    school_years:     "What is one vivid memory from your school years that still feels close to you now?",
    adolescence:      "When you think about your teenage years, what place, person, or feeling stands out most clearly?",
    early_adulthood:  "What moment made early adult life start to feel real to you?",
    midlife:          "What scene best captures what those middle years felt like day to day?",
    later_life:       "Looking back on later life, what moments feel the most meaningful now?",
  }[era] || `Let's deepen the story around ${name}'s life.`;

  if(mode==="recognition") return base + " If it helps, you can start with a place, a person, or a routine.";
  if(mode==="light")       return base + " We can keep to one small memory.";
  if(mode==="grounding")   return "We can stay with this lightly, or move somewhere gentler for now.";
  return base;
}

/* ── v7.1 — mode button wiring (Chron=Pass2A, Thematic=Pass2B) ─ */
function setInterviewMode(mode){
  interviewMode = mode;
  const chronBtn=document.getElementById("modeChronBtn");
  const themeBtn=document.getElementById("modeThemeBtn");
  if(chronBtn) chronBtn.classList.toggle("active", mode==="chronological");
  if(themeBtn) themeBtn.classList.toggle("active", mode==="thematic");
  // v7.1 — wire to pass engine
  if(mode==="chronological") setPass("pass2a");
  else                       setPass("pass2b");
  update71RuntimeUI();
  renderRoadmap();
  renderInterview();
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
  // v6.3: DOB gate — nudge if date of birth is not yet in the profile
  if(!state.profile?.basics?.dob){
    sysBubble("💡 Tip: Add a date of birth on the Profile tab to unlock age-anchored memory triggers before we begin.");
  }

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
    // Reload any persisted segment decisions for this person
    _loadSegments();
    renderSensitiveReviewPanel();
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
  // Capture the answered question's ID BEFORE the response updates state.interview
  // (j.next_question will overwrite state.interview.question_id below)
  const answeredQuestionId = state.interview.question_id;
  try{
    const r=await fetch(API.IV_ANSWER,{method:"POST",headers:ctype(),body:JSON.stringify({
      session_id:state.interview.session_id,
      question_id:answeredQuestionId,
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
      // Pass session + question IDs so include/remove actions can reach the backend
      flagSensitiveSegment(
        sectionIndex,
        j.safety_category,
        text,
        state.interview.session_id,
        answeredQuestionId       // use the ID of the answered question, not the next
      );
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

  // v6.2: bilingual — prefix instruction when a non-English language is set
  const _lang=state.profile?.basics?.language||"";
  const _langPrefix=_lang?`[SYSTEM: Please ask the following question in ${_lang}.] `:"";

  let instruction;

  if(softenedMode){
    // Post-disclosure softened mode takes priority over affect nudges
    const turnsLeft = softenedUntilTurn - turnCount;
    if(turnsLeft <= 1){
      // Second+ softened question — add a gentle check-in
      instruction = `${_langPrefix}[SYSTEM: The person shared something difficult earlier in this session. Please ask the following question very gently and briefly. After the question, add a warm check-in: "How are you doing? We can keep going or take a break anytime." Do not pressure or probe. Question: "${state.interview.prompt}"]`;
    } else {
      // First softened question after disclosure
      instruction = `${_langPrefix}[SYSTEM: The person recently shared something difficult. Please ask the following question very gently and briefly — keep it short, no follow-up pressure, no probing. Question: "${state.interview.prompt}"]`;
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
    instruction = `${_langPrefix}[SYSTEM: Please ask this question now.${affectCtx} Question: "${state.interview.prompt}"]`;
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
