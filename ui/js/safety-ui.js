/* ═══════════════════════════════════════════════════════════════
   safety-ui.js — safety overlay, resource cards, sensitive segments,
                  confirm dialog
   Lorevox v6.1 Track A
   Load order: FIFTH
═══════════════════════════════════════════════════════════════ */

/* ── RESOURCE CARD DATA ──────────────────────────────────────── */
const RESOURCE_CARDS_ALL = [
  {name:"Crisis & Suicide Prevention", contact:"988 — call or text",
   categories:["suicidal_ideation","distress"]},
  {name:"RAINN Sexual Assault Hotline", contact:"1-800-656-4673",
   categories:["sexual_abuse","child_abuse"]},
  {name:"National Domestic Violence Hotline", contact:"1-800-799-7233",
   categories:["domestic_abuse","physical_abuse"]},
  {name:"Eldercare / Caregiver Abuse Hotline", contact:"1-800-677-1116",
   categories:["caregiver_abuse"]},
];

function getResourcesForCategory(cat){
  const primary=RESOURCE_CARDS_ALL.filter(c=>c.categories.includes(cat));
  // Always include 988 for suicidal ideation; always fall back to something
  if(!primary.length) return RESOURCE_CARDS_ALL.slice(0,2);
  // Include 988 alongside any other resources if not already present
  const has988=primary.some(c=>c.contact.includes("988"));
  if(!has988 && cat!=="caregiver_abuse"){
    return [RESOURCE_CARDS_ALL[0], ...primary];
  }
  return primary;
}

/* ── SAFETY OVERLAY ──────────────────────────────────────────── */
function showSafetyOverlay(category, backendResources){
  const overlay=document.getElementById("safetyOverlay");
  const cardsCont=document.getElementById("safetyResourceCards");
  overlay.classList.remove("hidden");

  // Use backend resources if provided, else fall back to local
  const cards = (backendResources && backendResources.length)
    ? backendResources
    : getResourcesForCategory(category||"distress");

  cardsCont.innerHTML=cards.map(c=>`
    <div class="resource-card">
      <div class="resource-card-name">${esc(c.name||c.resource_name||"")}</div>
      <div class="resource-card-contact">${esc(c.contact||c.phone||"")}</div>
    </div>`).join("");
}

function dismissSafetyOverlay(choice){
  document.getElementById("safetyOverlay").classList.add("hidden");
  document.getElementById("safetyExpandedPanel").classList.add("hidden");

  if(choice==="continue"){
    softenedMode=true;
    softenedUntilTurn=turnCount+3;
    sysBubble("Lori will take it gently for the next few questions.");
  } else if(choice==="break"){
    sysBubble("We can pause here. Your session is saved. Come back whenever you're ready.");
  } else if(choice==="close"){
    sysBubble("Session saved. Take your time — Lorevox will be here when you're ready.");
  }
}

function expandSupportOptions(){
  const panel=document.getElementById("safetyExpandedPanel");
  panel.classList.toggle("hidden");
}

/* ── SENSITIVE SEGMENT FLAGGING ──────────────────────────────── */
function flagSensitiveSegment(sectionIdx, category, excerpt){
  // Avoid duplicates for same section + category
  const exists=sensitiveSegments.find(s=>s.sectionIdx===sectionIdx&&s.category===category);
  if(!exists){
    sensitiveSegments.push({sectionIdx, category, excerpt: excerpt||""});
    renderRoadmap(); // refresh sensitive icon
    renderSensitiveReviewPanel();
  }
}

function renderSensitiveReviewPanel(){
  const list=document.getElementById("sensitiveReviewList"); if(!list) return;
  if(!sensitiveSegments.length){
    list.innerHTML=`<div class="text-sm text-slate-500 text-center py-8 italic">
      No private segments yet. Sensitive disclosures will appear here after the interview.
    </div>`;
    return;
  }
  list.innerHTML=sensitiveSegments.map((seg,i)=>{
    const section=INTERVIEW_ROADMAP[seg.sectionIdx];
    const sLabel=section?`${section.emoji} ${section.label}`:`Section ${seg.sectionIdx}`;
    const categoryLabel=seg.category.replace(/_/g," ");
    const excerptHtml=seg.excerpt
      ?`<div class="sensitive-quote">"${esc(seg.excerpt.slice(0,200))}${seg.excerpt.length>200?"…":""}"</div>`
      :"";
    return `<div class="sensitive-segment-row" id="sensSeg_${i}">
      <div class="flex items-center gap-2 mb-1">
        <span class="sensitive-badge">⊘ Private</span>
        <span class="excluded-badge">Excluded from memoir</span>
        <span class="text-xs text-slate-500 ml-auto">${esc(sLabel)}</span>
      </div>
      <div class="text-xs text-slate-500 mb-1" style="text-transform:capitalize">${esc(categoryLabel)}</div>
      ${excerptHtml}
      <div class="sensitive-controls">
        <button class="btn-include" onclick="includeSensitiveSegment(${i})">Include in writing</button>
        <button class="btn-remove-seg" onclick="confirmRemoveSegment(${i})">Remove this segment</button>
      </div>
    </div>`;
  }).join("");
}

function includeSensitiveSegment(i){
  const seg=sensitiveSegments[i]; if(!seg) return;
  openConfirmDialog(
    "Include this segment?",
    "This will include this part of your story in your memoir draft. You can remove it again at any time.",
    "Include",
    "#2563eb",
    ()=>{
      seg.includedInMemoir=true;
      sysBubble("✓ Segment marked for inclusion in your memoir draft.");
      renderSensitiveReviewPanel();
    }
  );
}

function confirmRemoveSegment(i){
  openConfirmDialog(
    "Remove this segment?",
    "This will permanently remove this part of the session. This cannot be undone.",
    "Remove",
    "#b91c1c",
    ()=>{
      sensitiveSegments.splice(i,1);
      renderRoadmap();
      renderSensitiveReviewPanel();
      sysBubble("Segment removed from your session.");
    }
  );
}

/* ── CONFIRM DIALOG ──────────────────────────────────────────── */
function openConfirmDialog(title, body, okLabel, okColor, onConfirm){
  document.getElementById("confirmDialogTitle").textContent=title;
  document.getElementById("confirmDialogBody").textContent=body;
  const btn=document.getElementById("confirmDialogOk");
  btn.textContent=okLabel;
  btn.style.background=okColor; btn.style.borderColor=okColor;
  pendingConfirmAction=onConfirm;
  document.getElementById("confirmDialog").classList.remove("hidden");
}

function closeConfirmDialog(){
  document.getElementById("confirmDialog").classList.add("hidden");
  pendingConfirmAction=null;
}

// Wire confirm button on DOM ready
document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("confirmDialogOk")?.addEventListener("click",()=>{
    if(pendingConfirmAction) pendingConfirmAction();
    closeConfirmDialog();
  });
});
