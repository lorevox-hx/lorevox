/* ═══════════════════════════════════════════════════════════════
   interview.js — Lorevox 7.1 review interview logic
   Purpose: convert section-first interview behavior into pass-aware behavior
═══════════════════════════════════════════════════════════════ */

/* ── 7.1 Life Period roadmap rendering ───────────────────────── */
function renderRoadmap(){
  const w = document.getElementById("roadmapList");
  if(!w) return;
  w.innerHTML = "";

  // rename the sidebar heading if present
  const titles = document.querySelectorAll(".sb-section-title");
  titles.forEach(el => {
    if(el.textContent && el.textContent.trim() === "Interview Roadmap"){
      el.textContent = "Life Periods";
    }
  });

  const periods = getCurrentLifePeriods();
  if(periods.length){
    periods.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "roadmap-item" + (state.session.currentEra === p.label ? " active-section" : "");
      d.innerHTML = `
        <span class="rm-label truncate">
          <span class="rm-emoji">◌</span>
          ${esc(prettyEraLabel(p.label))}
        </span>
      `;
      d.onclick = () => {
        setInterviewEra(p.label);
        if(interviewMode === "chronological") setInterviewPass("pass2a");
        showTab("interview");
      };
      w.appendChild(d);
    });

    // if no era selected yet, default to the first period
    if(!state.session.currentEra && periods[0]){
      setInterviewEra(periods[0].label);
    }
    updateInterviewStateBadges();
    return;
  }

  // fallback to legacy roadmap if no timeline seed exists yet
  const visibleSections = INTERVIEW_ROADMAP
    .map((s, i) => ({s, i}))
    .filter(({s}) => !s.youth || youthMode);

  visibleSections.forEach(({s, i}) => appendRoadmapItem(w, s, i));

  const s = INTERVIEW_ROADMAP[sectionIndex];
  if(s) document.getElementById("ivSectionLabel").textContent = `${s.emoji} ${s.label}`;
}

function appendRoadmapItem(w,s,i){
  const d=document.createElement("div");
  d.className="roadmap-item"+(i===sectionIndex?" active-section":"")+(sectionDone[i]?" done":"");
  d.innerHTML=`<span class="rm-label truncate"><span class="rm-emoji">${s.emoji}</span> ${esc(s.label)}</span>`;
  d.onclick=()=>{
    sectionIndex=i;
    sectionVisited[i]=true;
    renderRoadmap();
    updateContextTriggers();
    showTab("interview");
    document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
  };
  w.appendChild(d);
}

function setInterviewMode(mode){
  interviewMode = mode;
  const chronBtn=document.getElementById("modeChronBtn");
  const themeBtn=document.getElementById("modeThemeBtn");
  if(chronBtn) chronBtn.classList.toggle("active", mode==="chronological");
  if(themeBtn) themeBtn.classList.toggle("active", mode==="thematic");

  if(mode === "chronological"){
    setInterviewPass("pass2a");
  }else{
    setInterviewPass("pass2b");
  }
  renderRoadmap();
  renderInterview();
}

/* ── 7.1 prompt header + prompt generation ───────────────────── */
function renderInterview(){
  const promptEl = document.getElementById("ivPrompt");
  if(!promptEl) return;

  updateInterviewStateBadges();

  // use timeline-driven prompting if the seed exists
  if(getTimelineSeedReady() && state.timeline?.spine){
    promptEl.textContent = build71Prompt();
  } else {
    promptEl.textContent = state.interview.prompt || "Start by adding date of birth and birthplace on the Profile tab so Lori can build a timeline seed.";
  }

  const sessionEl = document.getElementById("ivSession");
  const qidEl = document.getElementById("ivQid");
  if(sessionEl) sessionEl.textContent = state.interview.session_id || "—";
  if(qidEl) qidEl.textContent = state.interview.question_id || "—";

  updateContextTriggers();
}

function build71Prompt(){
  const pass = state.session.currentPass;
  const era = state.session.currentEra;
  const basics = state.profile?.basics || {};
  const preferred = basics.preferred || basics.fullname || "this person";

  if(pass === "pass2a"){
    return buildTimelinePassPrompt(preferred, era);
  }
  if(pass === "pass2b"){
    return buildNarrativeDepthPrompt(preferred, era);
  }
  return "When were you born? And where were you born?";
}

function buildTimelinePassPrompt(name, era){
  const map = {
    early_childhood: "Let's begin near the beginning. What do you know about the place where you were born, and where you lived when you were very young?",
    school_years: "Thinking about your school years, what town, home, or neighborhood feels most connected to that time?",
    adolescence: "As you got older, what changed most in your life during those years — school, friends, family, work, or where you lived?",
    early_adulthood: "What do you think of as the beginning of your adult life? Where were you living, and what made that period feel different?",
    midlife: "What responsibilities, jobs, or family roles shaped your middle adult years the most?",
    later_life: "What major transitions stand out most from your later adult years?"
  };
  return map[era] || `Let's continue building ${name}'s life timeline.`;
}

function buildNarrativeDepthPrompt(name, era){
  const map = {
    early_childhood: "When you picture your earliest home, what room, smell, or sound comes back first?",
    school_years: "What is one vivid memory from your school years that still feels close to you now?",
    adolescence: "When you think about your teenage years, what place, person, or feeling stands out most clearly?",
    early_adulthood: "What moment made early adult life start to feel real to you?",
    midlife: "What scene best captures what those middle years felt like day to day?",
    later_life: "Looking back on later life, what moments feel the most meaningful now?"
  };
  return map[era] || `Let's deepen the story around ${name}'s life.`;
}

/* ── 7.1 contextual era support ──────────────────────────────── */
function updateContextTriggers(){
  const el=document.getElementById("contextTriggers");
  if(!el) return;

  if(!getTimelineSeedReady()){
    el.innerHTML=`<div class="py-1">Set a date of birth and birthplace on the Profile tab so Lori can build a timeline seed and show age-anchored prompts.</div>`;
    return;
  }

  const era = state.session.currentEra;
  const prompts = {
    early_childhood: [
      "Think about the home itself — the kitchen, bedroom, yard, or street.",
      "Would this memory fit better with home life, neighborhood life, or family gatherings?",
      "Who was in the household then?"
    ],
    school_years: [
      "Does this feel more connected to school, home, or friends?",
      "Were you still living in the same place then?",
      "What teacher, class, or school routine comes back first?"
    ],
    adolescence: [
      "Does this feel more like your school years or the start of independence?",
      "What music, fashion, or friendships anchor that period for you?",
      "Were you still living at home then?"
    ],
    early_adulthood: [
      "Were you on your own by then, or still closely tied to home?",
      "Was work, school, marriage, or moving the biggest change?",
      "What city or place defines that period most?"
    ],
    midlife: [
      "Does this memory connect more to work, raising family, or a move?",
      "Who depended on you most during that period?",
      "What did a normal day feel like then?"
    ],
    later_life: [
      "Does this feel like a transition in health, family, home, or meaning?",
      "What became more important to you during this chapter?",
      "What place best holds that period in memory?"
    ]
  };

  const list = prompts[era] || ["Lori can use age, place, and family anchors to guide this era gently."];
  el.innerHTML = `<div class="space-y-2 py-1">` + list.map(t => `<div class="event-card" style="margin:0">${esc(t)}</div>`).join("") + `</div>`;
}
