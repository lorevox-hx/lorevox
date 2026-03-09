/* ═══════════════════════════════════════════════════════════════
   timeline-ui.js — timeline rendering (personal + world + affect arc)
   Lorevox v6.1
   Load order: EIGHTH
═══════════════════════════════════════════════════════════════ */

async function renderTimeline(){
  const pane=document.getElementById("timelinePane"); if(!pane) return;
  const btn=document.getElementById("btnTLworld");
  if(btn) btn.textContent=showWorldOnTL?"World Context: On":"World Context: Off";

  const birthYear=getBirthYear();
  const country=getCountry();
  let personal=[];
  let tlError=false;

  if(state.person_id){
    try{
      const r=await fetch(API.TIMELINE(state.person_id));
      if(r.ok){ const j=await r.json(); personal=j.items||j||[]; }
      else tlError=true;
    }catch{ tlError=true; }
  }

  const personalRows=personal.map(e=>({
    year:e.ts?parseInt(e.ts.split("-")[0]):null,
    title:e.title||"Event",sub:e.location_name||"",type:"personal"
  })).filter(r=>r.year);
  if(birthYear) personalRows.push({year:birthYear,title:"Born",sub:state.profile?.basics?.pob||"",type:"personal"});
  personalRows.sort((a,b)=>a.year-b.year);

  let worldRows=[];
  if(showWorldOnTL&&birthYear){
    ALL_EVENTS.filter(e=>{
      const age=e.year-birthYear; if(age<5||age>100) return false;
      return e.tags.includes(country)||e.tags.includes("global");
    }).forEach(e=>worldRows.push({year:e.year,title:e.event,sub:`Age ${e.year-birthYear}`,type:"world"}));
    worldRows.sort((a,b)=>a.year-b.year);
  }

  // v6.1: update affect arc toggle button label
  const btnAffect=document.getElementById("btnTLaffect");
  if(btnAffect) btnAffect.textContent=`Affect Arc: ${showAffectArc?"On":"Off"}`;

  const countBar=document.getElementById("tlCountBar");
  if(countBar){
    if(personalRows.length||worldRows.length){
      countBar.classList.remove("hidden");
      countBar.textContent=`${personalRows.length} personal event${personalRows.length!==1?"s":""} · ${worldRows.length} world context event${worldRows.length!==1?"s":""}`;
    } else {
      countBar.classList.add("hidden");
    }
  }

  if(!personalRows.length&&!worldRows.length){
    const age=birthYear?new Date().getFullYear()-birthYear:null;
    const youngMsg=age&&age<30?
      `Start by saving school memories, family moments, friendship shifts, or identity milestones using <strong style="color:#475569">Save as Memory</strong> in the Interview tab.`:
      `Complete interview sections or use <strong style="color:#475569">Save as Memory</strong> in the Interview tab to pin moments here.`;
    pane.innerHTML=`<div class="text-slate-500 text-sm py-4">${birthYear?"No timeline events yet. "+youngMsg:"Select a person — the timeline will populate from interview milestones and world events."}</div>`;
    return;
  }

  let html="";
  // Error banner
  if(tlError){
    html+=`<div class="text-xs text-indigo-400/80 border border-amber-900/40 bg-amber-900/10 rounded-lg px-3 py-2 mb-3">
      ⚠ Timeline service unavailable — showing world context only.
    </div>`;
  }
  // Personal milestones
  if(personalRows.length){
    html+=`<div class="tl-section-header">Personal Milestones (${personalRows.length})</div>`;
    html+=personalRows.map(renderTlRow).join("");
  }
  // World context
  if(showWorldOnTL&&worldRows.length){
    html+=`<div class="tl-section-header" style="margin-top:16px">World Context (${worldRows.length})</div>`;
    html+=worldRows.map(renderTlRow).join("");
  }
  // v6.1 Affect arc
  if(showAffectArc && sessionAffectLog.length){
    html+=`<div class="tl-section-header" style="margin-top:16px">Emotional Moments (${sessionAffectLog.length})</div>`;
    html+=renderAffectArc();
  } else if(showAffectArc && !sessionAffectLog.length){
    html+=`<div class="tl-section-header" style="margin-top:16px">Emotional Moments</div>
      <div class="text-xs text-slate-500 italic py-3">No affect events recorded yet. Enable Affect-aware mode and start the interview.</div>`;
  }
  pane.innerHTML=html;
}

function renderTlRow(r){
  return `<div class="tl-row">
    <div class="tl-year">${r.year}</div>
    <div class="tl-dot" style="background:${r.type==='world'?'#7c9cff':'#ff9b6b'}"></div>
    <div class="tl-content">
      <div class="tl-title">${esc(r.title)}</div>
      <div class="flex gap-2 mt-0.5">
        ${r.sub?`<span class="tl-sub">${esc(r.sub)}</span>`:""}
        <span class="${r.type==='world'?'tl-badge-w':'tl-badge-p'}">${r.type==='world'?'World':'Personal'}</span>
      </div>
    </div>
  </div>`;
}
