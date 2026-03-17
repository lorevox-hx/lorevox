/* ═══════════════════════════════════════════════════════════════
   timeline-ui.js — Lorevox 7.1 review timeline rendering
   Purpose: make Timeline the visible output of Pass 2A
═══════════════════════════════════════════════════════════════ */

async function renderTimeline(){
  const pane=document.getElementById("timelinePane");
  if(!pane) return;

  const btn=document.getElementById("btnTLworld");
  if(btn) btn.textContent = showWorldOnTL ? "World Context: On" : "World Context: Off";

  const btnAffect=document.getElementById("btnTLaffect");
  if(btnAffect) btnAffect.textContent = `Affect Arc: ${showAffectArc ? "On" : "Off"}`;

  const basics = state.profile?.basics || {};
  const birthYear = getBirthYear ? getBirthYear() : (basics.dob ? parseInt(String(basics.dob).slice(0,4)) : null);
  const periods = state.timeline?.spine?.periods || [];

  if(!birthYear || !state.timeline?.spine){
    pane.innerHTML = `<div class="text-slate-500 text-sm py-4">Add date of birth and birthplace on the Profile tab to initialize the life timeline.</div>`;
    return;
  }

  let html = "";
  html += `<div class="tl-section-header">Timeline Seed</div>`;
  html += `
    <div class="tl-row">
      <div class="tl-year">${birthYear}</div>
      <div class="tl-dot" style="background:#ff9b6b"></div>
      <div class="tl-content">
        <div class="tl-title">Born</div>
        <div class="flex gap-2 mt-0.5">
          <span class="tl-sub">${esc(basics.pob || state.timeline.spine.birth_place || "")}</span>
          <span class="tl-badge-p">Seed</span>
        </div>
      </div>
    </div>
  `;

  html += `<div class="tl-section-header" style="margin-top:16px">Life Periods</div>`;
  html += periods.map(renderPeriodRow).join("");

  if(showWorldOnTL && birthYear){
    const country = getCountry ? getCountry() : "us";
    const worldRows = (typeof ALL_EVENTS !== "undefined" ? ALL_EVENTS : [])
      .filter(e => {
        const age=e.year-birthYear;
        if(age < 5 || age > 100) return false;
        return (e.tags||[]).includes(country) || (e.tags||[]).includes("global");
      })
      .slice(0, 12);

    if(worldRows.length){
      html += `<div class="tl-section-header" style="margin-top:16px">World Context</div>`;
      html += worldRows.map(e => `
        <div class="tl-row">
          <div class="tl-year">${e.year}</div>
          <div class="tl-dot" style="background:#7c9cff"></div>
          <div class="tl-content">
            <div class="tl-title">${esc(e.event)}</div>
            <div class="flex gap-2 mt-0.5">
              <span class="tl-sub">Age ${e.year-birthYear}</span>
              <span class="tl-badge-w">World</span>
            </div>
          </div>
        </div>
      `).join("");
    }
  }

  if(showAffectArc && sessionAffectLog?.length){
    html += `<div class="tl-section-header" style="margin-top:16px">Emotional Moments</div>`;
    html += renderAffectArc ? renderAffectArc() : `<div class="text-xs text-slate-500 italic py-3">Affect arc renderer not available.</div>`;
  }

  pane.innerHTML = html;
}

function renderPeriodRow(period){
  const start = period.start_year || "—";
  const end   = period.end_year || "Present";
  const places = (period.places || []).join(", ");
  const notes  = (period.notes || []).join(" · ");
  return `
    <div class="tl-row">
      <div class="tl-year">${start}${period.end_year ? `–${end}` : "+"}</div>
      <div class="tl-dot" style="background:#ff9b6b"></div>
      <div class="tl-content">
        <div class="tl-title">${esc(prettyEraLabel(period.label))}</div>
        <div class="flex gap-2 mt-0.5 flex-wrap">
          ${places ? `<span class="tl-sub">${esc(places)}</span>` : ""}
          ${notes ? `<span class="tl-sub">${esc(notes)}</span>` : ""}
          <span class="tl-badge-p">Life Period</span>
        </div>
      </div>
    </div>
  `;
}
