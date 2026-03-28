/* ═══════════════════════════════════════════════════════════════
   tabs.js — tab switching, accordion, interview mode toggles
   Lorevox v6.1
   Load order: FOURTH
═══════════════════════════════════════════════════════════════ */

/* ── ACCORDION ───────────────────────────────────────────────── */
function toggleAccordion(id){
  const body=document.getElementById(id);
  const key=id.replace("acc","");
  const arr=document.getElementById("arr"+key);
  body.classList.toggle("open");
  if(arr) arr.classList.toggle("open");
}

/* ── TABS ────────────────────────────────────────────────────── */
function showTab(id){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('pane-'+id).classList.remove('hidden');
  document.getElementById('tab-'+id).classList.add('active');
  if(id==='events')   renderEventsGrid();
  if(id==='timeline') renderTimeline();
  if(id==='lifemap')  window.LorevoxLifeMap?.render(true);
  if(id==='memoir')   renderMemoirChapters();
  if(id==='obituary'){
    // Auto-fill only if user hasn't made manual edits OR if the draft is empty.
    // Prevents tab-switching from silently overwriting hand-edited memorial text.
    const draft=document.getElementById("obituaryOutput")?.value||"";
    if(!obitHasEdits||!draft.trim()) _buildObituaryImpl();
    else updateObitIdentityCard(state.profile?.basics||{});
  }
  // v6.1: review tab and camera section tracker
  if(id==="review") renderSensitiveReviewPanel();
  if(id==="interview" && cameraActive && typeof LoreVoxEmotion !== "undefined"){
    LoreVoxEmotion.setSection(INTERVIEW_ROADMAP[sectionIndex]?.id||null);
  }
}

/* ── INTERVIEW MODE TOGGLES ──────────────────────────────────── */
function setInterviewMode(mode){
  interviewMode=mode;
  document.getElementById("modeChronBtn")?.classList.toggle("active",mode==="chronological");
  document.getElementById("modeThemeBtn")?.classList.toggle("active",mode==="thematic");
  renderRoadmap();
}

function toggleYouthSections(){
  youthMode=!youthMode;
  const btn=document.getElementById("youthModeBtn");
  if(btn){ btn.textContent=youthMode?"Youth Mode: On":"Youth Mode: Off";
    btn.classList.toggle("youth-on",youthMode); }
  // Apply Vibrant theme when Youth Mode is on, revert to Reflective when off
  document.body.classList.toggle("theme-vibrant", youthMode);
  renderRoadmap(); renderMemoirChapters();
}
