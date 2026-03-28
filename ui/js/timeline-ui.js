/* ═══════════════════════════════════════════════════════════════
   timeline-ui.js — timeline rendering (personal + world + affect arc)
   Lorevox v7.1
   Load order: EIGHTH

   v7.1 strategy:
   - When a timeline spine exists, render life periods as the PRIMARY story
   - World context becomes a SECONDARY optional overlay (not the lead)
   - Personal saved memories are pinned within life period bands
   - The existing renderTlRow() path remains for pre-seed fallback
═══════════════════════════════════════════════════════════════ */

async function renderTimeline(){
  const pane=document.getElementById("timelinePane"); if(!pane) return;
  const btn=document.getElementById("btnTLworld");
  if(btn) btn.textContent=showWorldOnTL?"World Context: On":"World Context: Off";
  const btnAffect=document.getElementById("btnTLaffect");
  if(btnAffect) btnAffect.textContent=`Affect Arc: ${showAffectArc?"On":"Off"}`;

  const birthYear=getBirthYear();
  const country=getCountry();

  // ── v7.1 path — life period spine is the primary story ──────
  const periods = getCurrentLifePeriods();
  if(periods.length && birthYear){
    // Fetch saved memories to enrich the spine (non-blocking)
    let personal=[];
    if(state.person_id){
      try{
        const r=await fetch(API.TIMELINE(state.person_id));
        if(r.ok){ const j=await r.json(); personal=j.items||j||[]; }
      }catch{}
    }

    let html="";

    // Timeline seed entry
    html+=`<div class="tl-section-header">Timeline Seed</div>`;
    html+=`<div class="tl-row">
      <div class="tl-year">${birthYear}</div>
      <div class="tl-dot" style="background:#ff9b6b"></div>
      <div class="tl-content">
        <div class="tl-title">Born</div>
        <div class="flex gap-2 mt-0.5 flex-wrap">
          <span class="tl-sub">${esc(state.profile?.basics?.pob||state.timeline?.spine?.birth_place||"")}</span>
          <span class="tl-badge-p">Seed</span>
        </div>
      </div>
    </div>`;

    // Life periods — primary story
    const currentEra = getCurrentEra();
    html+=`<div class="tl-section-header" style="margin-top:16px">Life Periods</div>`;
    html+=periods.map(p=>{
      const start=p.start_year||"—";
      const end=p.end_year||"Present";
      const places=(p.places||[]).join(", ");
      const notes=(p.notes||[]).join(" · ");
      const isActive=currentEra===p.label;
      // Saved memories for this period
      const periodMemories=personal.filter(m=>{
        const y=m.ts?parseInt(m.ts.split("-")[0]):null;
        if(!y) return false;
        return y>=p.start_year&&(p.end_year===null||y<=p.end_year);
      });
      let periodHtml=`<div class="tl-row" ${isActive?'style="border-left:2px solid rgba(99,102,241,.4);padding-left:6px;margin-left:-8px;"':''}>
        <div class="tl-year">${start}${p.end_year?`–${end}`:"+"}</div>
        <div class="tl-dot" style="background:${isActive?"#818cf8":"#ff9b6b"}"></div>
        <div class="tl-content">
          <div class="tl-title">${esc(prettyEra(p.label))}</div>
          <div class="flex gap-2 mt-0.5 flex-wrap">
            ${places?`<span class="tl-sub">${esc(places)}</span>`:""}
            ${notes?`<span class="tl-sub">${esc(notes)}</span>`:""}
            <span class="tl-badge-p">Life Period</span>
            ${isActive?'<span class="tl-badge-p" style="background:rgba(99,102,241,.12);color:#818cf8;border-color:rgba(99,102,241,.25)">Active</span>':""}
          </div>
        </div>
      </div>`;
      // Saved memories indented under this period
      periodHtml+=periodMemories.map(m=>`<div class="tl-row" style="margin-left:24px;opacity:.85">
        <div class="tl-year" style="font-size:10px">${m.ts?m.ts.split("-")[0]:""}</div>
        <div class="tl-dot" style="background:#34d399;width:6px;height:6px"></div>
        <div class="tl-content">
          <div class="tl-title" style="font-size:11px">${esc(m.title||"Memory")}</div>
          ${m.description?`<div class="tl-sub">${esc(m.description.slice(0,80))}${m.description.length>80?"…":""}</div>`:""}
        </div>
      </div>`).join("");
      return periodHtml;
    }).join("");

    // World context — secondary optional overlay
    if(showWorldOnTL&&birthYear){
      const worldRows=ALL_EVENTS.filter(e=>{
        const age=e.year-birthYear; if(age<5||age>100) return false;
        return e.tags.includes(country)||e.tags.includes("global");
      }).slice(0,12);
      if(worldRows.length){
        html+=`<div class="tl-section-header" style="margin-top:16px">World Context <span style="color:#475569;font-size:10px;font-weight:400;margin-left:6px">optional overlay</span></div>`;
        html+=worldRows.map(e=>`<div class="tl-row">
          <div class="tl-year">${e.year}</div>
          <div class="tl-dot" style="background:#7c9cff"></div>
          <div class="tl-content">
            <div class="tl-title">${esc(e.event)}</div>
            <div class="flex gap-2 mt-0.5">
              <span class="tl-sub">Age ${e.year-birthYear}</span>
              <span class="tl-badge-w">World</span>
            </div>
          </div>
        </div>`).join("");
      }
    }

    // Affect arc — optional overlay
    if(showAffectArc && sessionAffectLog.length){
      html+=`<div class="tl-section-header" style="margin-top:16px">Emotional Moments (${sessionAffectLog.length})</div>`;
      html+=renderAffectArc();
    } else if(showAffectArc && !sessionAffectLog.length){
      html+=`<div class="tl-section-header" style="margin-top:16px">Emotional Moments</div>
        <div class="text-xs text-slate-500 italic py-3">No affect events yet. Enable Affect-aware mode and start the interview.</div>`;
    }

    // Count bar
    const periodCount=periods.length;
    const memCount=personal.length+(birthYear?1:0);
    const countBar=document.getElementById("tlCountBar");
    if(countBar){
      countBar.classList.remove("hidden");
      countBar.textContent=`${periodCount} life period${periodCount!==1?"s":""} · ${memCount} saved memory${memCount!==1?"s":""}`;
    }
    pane.innerHTML=html;
    return;
  }

  // ── Legacy path — pre-seed, personal milestones + world events ─
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
    pane.innerHTML=`<div class="text-slate-500 text-sm py-4">${birthYear
      ?"Add DOB and birthplace on the Profile tab to initialize the life timeline, or use <strong style=\"color:#475569\">Save as Memory</strong> in the Interview tab to pin moments here."
      :"Select a person — the timeline will populate once a profile is loaded."}</div>`;
    return;
  }

  let html="";
  if(tlError){
    html+=`<div class="text-xs text-indigo-400/80 border border-amber-900/40 bg-amber-900/10 rounded-lg px-3 py-2 mb-3">
      ⚠ Timeline service unavailable — showing world context only.
    </div>`;
  }
  if(personalRows.length){
    html+=`<div class="tl-section-header">Personal Milestones (${personalRows.length})</div>`;
    html+=personalRows.map(renderTlRow).join("");
  }
  if(showWorldOnTL&&worldRows.length){
    html+=`<div class="tl-section-header" style="margin-top:16px">World Context (${worldRows.length})</div>`;
    html+=worldRows.map(renderTlRow).join("");
  }
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
