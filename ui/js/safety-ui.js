/* ═══════════════════════════════════════════════════════════════
   safety-ui.js — safety overlay, resource cards, sensitive segments,
                  confirm dialog
   Lorevox v6.2 Track A
   Load order: FIFTH
═══════════════════════════════════════════════════════════════ */

/* ── MODULE STATE ────────────────────────────────────────────── */
// Stores the resource cards currently shown in the overlay so they
// can be surfaced in chat when the person takes a break or closes.
let _currentSafetyResources = [];

// v6.2 Segment sort / filter state
let _segFilter = "all";   // "all" | "included" | "excluded"
let _segSort   = "section"; // "section" | "category"

/* ── RESOURCE CARD DATA ──────────────────────────────────────── */
const RESOURCE_CARDS_ALL = [
  {name:"Crisis & Suicide Prevention", contact:"988 — call or text",
   categories:["suicidal_ideation","distress","distress_call"]},
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

/* ── TAP-TO-CALL HELPER ──────────────────────────────────────── */
// Converts a contact string ("988 — call or text", "1-800-656-4673")
// into a tel: URI for tap-to-call on mobile, null if no digits found.
function _resourceHref(contact){
  const digits=(contact||"").replace(/[^\d]/g,"");
  if(!digits) return null;
  if(digits.length<=3) return `tel:${digits}`;           // 988 → tel:988
  const stripped=digits.startsWith("1")&&digits.length>10 ? digits.slice(1) : digits;
  return `tel:+1${stripped}`;
}

/* ── RESOURCE CARD HTML ──────────────────────────────────────── */
function _buildResourceCardHtml(cards){
  return cards.map(c=>{
    const name=esc(c.name||c.resource_name||"");
    const contact=esc(c.contact||c.phone||"");
    const href=_resourceHref(c.contact||c.phone||"");
    // Use <a> for tap-to-call on mobile; falls back gracefully on desktop
    return href
      ? `<a class="resource-card" href="${href}">
           <div class="resource-card-name">${name}</div>
           <div class="resource-card-contact">📞 ${contact}</div>
         </a>`
      : `<div class="resource-card">
           <div class="resource-card-name">${name}</div>
           <div class="resource-card-contact">${contact}</div>
         </div>`;
  }).join("");
}

/* ── MINOR DETECTION ─────────────────────────────────────────── */
// Returns true if the active person's birth year puts them under 18.
// getBirthYear() is defined in app.js (load order: ELEVENTH).
function _isMinor(){
  if(typeof getBirthYear !== "function") return false;
  const birthYear=getBirthYear();
  if(!birthYear) return false;
  return (new Date().getFullYear() - birthYear) < 18;
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

  // Cache for use when the overlay is dismissed
  _currentSafetyResources=cards;

  cardsCont.innerHTML=_buildResourceCardHtml(cards);

  // v6.2: age-specific message for minors (Emily Santos use case)
  const msgEl=document.getElementById("safetyLoriMessage");
  if(msgEl && _isMinor()){
    msgEl.textContent=
      "Thank you for sharing that. You do not have to keep going right now. "
      +"It's okay to talk to a trusted adult — a parent, school counselor, or another "
      +"person you trust — about what you're feeling. We can pause here whenever you need.";
  } else if(msgEl){
    msgEl.textContent=
      "Thank you for telling me. What you shared matters. You do not have to keep going right now. "
      +"We can pause, keep talking, or look at support options.";
  }
}

function _appendResourcesToBubble(intro){
  // Surfaces cached resources into the chat panel after overlay closes
  if(!_currentSafetyResources || !_currentSafetyResources.length) return;
  const lines=_currentSafetyResources.map(c=>{
    const name=c.name||c.resource_name||"";
    const contact=c.contact||c.phone||"";
    return `${name}: ${contact}`;
  });
  sysBubble(`${intro}\n\n${lines.join("\n")}`);
}

function dismissSafetyOverlay(choice){
  document.getElementById("safetyOverlay").classList.add("hidden");
  document.getElementById("safetyExpandedPanel").classList.add("hidden");

  if(choice==="continue"){
    softenedMode=true;
    softenedUntilTurn=turnCount+3;
    sysBubble("Lori will take it gently for the next few questions.");
  } else if(choice==="break"){
    // Surface resources in chat so they remain accessible after overlay closes
    _appendResourcesToBubble("Support resources — available whenever you need them:");
    sysBubble("We can pause here. Your progress is saved. Come back whenever you're ready.");
  } else if(choice==="close"){
    // Surface resources in chat before closing
    _appendResourcesToBubble("Support resources:");
    sysBubble("Session saved. Take your time — Lorevox will be here when you're ready.");
  }
}

function expandSupportOptions(){
  const panel=document.getElementById("safetyExpandedPanel");
  panel.classList.toggle("hidden");
}

/* ── SEGMENT PERSISTENCE HELPERS ────────────────────────────── */
// Saves the current sensitiveSegments array to localStorage for the
// active person, so decisions survive page reload.
function _persistSegments(){
  if(state.person_id){
    localStorage.setItem(LS_SEGS(state.person_id), JSON.stringify(sensitiveSegments));
  }
}

// Loads persisted segment decisions for the active person.
// Call this when a new person is selected or a session starts.
function _loadSegments(){
  if(!state.person_id) return;
  try{
    const raw=localStorage.getItem(LS_SEGS(state.person_id));
    if(raw) sensitiveSegments=JSON.parse(raw);
  }catch(e){
    console.warn("LoreVox: could not load persisted segments", e);
  }
}

/* ── SENSITIVE SEGMENT FLAGGING ──────────────────────────────── */
// sessionId and questionId are optional; used for backend persistence
// of include/exclude decisions when the API is available.
function flagSensitiveSegment(sectionIdx, category, excerpt, sessionId, questionId){
  // Avoid duplicates for same section + category
  const exists=sensitiveSegments.find(s=>s.sectionIdx===sectionIdx&&s.category===category);
  if(!exists){
    sensitiveSegments.push({
      sectionIdx,
      category,
      excerpt:   excerpt||"",
      sessionId: sessionId||null,
      questionId:questionId||null,
      includedInMemoir: false,
    });
    renderRoadmap();
    renderSensitiveReviewPanel();
    _persistSegments();
  }
}

/* ── SEGMENT SORT / FILTER HELPERS ──────────────────────────── */
function setSegFilter(f){ _segFilter=f; renderSensitiveReviewPanel(); }
function setSegSort(s){   _segSort=s;   renderSensitiveReviewPanel(); }

function renderSensitiveReviewPanel(){
  const list=document.getElementById("sensitiveReviewList"); if(!list) return;
  if(!sensitiveSegments.length){
    list.innerHTML=`<div class="text-sm text-slate-500 text-center py-8 italic">
      No private segments yet. Sensitive disclosures will appear here after the interview.
    </div>`;
    return;
  }

  // Build indexed array, apply filter
  let items=sensitiveSegments.map((seg,i)=>({seg,i}));
  if(_segFilter==="included") items=items.filter(({seg})=>seg.includedInMemoir);
  else if(_segFilter==="excluded") items=items.filter(({seg})=>!seg.includedInMemoir);

  // Apply sort
  if(_segSort==="category"){
    items.sort((a,b)=>(a.seg.category||"").localeCompare(b.seg.category||""));
  } else {
    items.sort((a,b)=>a.seg.sectionIdx-b.seg.sectionIdx);
  }

  // Sort/filter toolbar
  const filterBtns=["all","included","excluded"].map(f=>
    `<button class="seg-filter-btn${_segFilter===f?" active":""}" onclick="setSegFilter('${f}')">`
    +{all:"All",included:"In memoir",excluded:"Excluded"}[f]+`</button>`
  ).join("");
  const sortBtns=["section","category"].map(s=>
    `<button class="seg-filter-btn${_segSort===s?" active":""}" onclick="setSegSort('${s}')">`
    +{section:"By section",category:"By type"}[s]+`</button>`
  ).join("");

  const toolbar=`<div class="seg-toolbar">
    <div class="seg-toolbar-group">${filterBtns}</div>
    <div class="seg-toolbar-group">${sortBtns}</div>
  </div>`;

  const noMatch=items.length===0
    ?`<div class="text-sm text-slate-500 text-center py-4 italic">No segments match this filter.</div>`
    :"";

  const rows=items.map(({seg,i})=>{
    const section=INTERVIEW_ROADMAP[seg.sectionIdx];
    const sLabel=section?`${section.emoji} ${section.label}`:`Section ${seg.sectionIdx}`;
    const categoryLabel=seg.category.replace(/_/g," ");
    const excerptHtml=seg.excerpt
      ?`<div class="sensitive-quote">"${esc(seg.excerpt.slice(0,200))}${seg.excerpt.length>200?"…":""}"</div>`
      :"";
    const includedBadge=seg.includedInMemoir
      ?`<span class="included-badge">Included in memoir</span>`
      :`<span class="excluded-badge">Excluded from memoir</span>`;
    return `<div class="sensitive-segment-row" id="sensSeg_${i}">
      <div class="flex items-center gap-2 mb-1">
        <span class="sensitive-badge">⊘ Private</span>
        ${includedBadge}
        <span class="text-xs text-slate-500 ml-auto">${esc(sLabel)}</span>
      </div>
      <div class="text-xs text-slate-500 mb-1" style="text-transform:capitalize">${esc(categoryLabel)}</div>
      ${excerptHtml}
      <div class="sensitive-controls">
        <button class="btn-include" onclick="includeSensitiveSegment(${i})">
          ${seg.includedInMemoir ? "Remove from memoir" : "Include in writing"}
        </button>
        <button class="btn-remove-seg" onclick="confirmRemoveSegment(${i})">Remove this segment</button>
      </div>
    </div>`;
  }).join("");

  list.innerHTML=toolbar+noMatch+rows;
}

function includeSensitiveSegment(i){
  const seg=sensitiveSegments[i]; if(!seg) return;
  const willInclude=!seg.includedInMemoir;
  openConfirmDialog(
    willInclude ? "Include this segment?" : "Remove from memoir?",
    willInclude
      ? "This will include this part of your story in your memoir draft. You can remove it again at any time."
      : "This will remove this segment from your memoir draft. It remains in your private archive.",
    willInclude ? "Include" : "Remove from memoir",
    "#2563eb",
    async ()=>{
      seg.includedInMemoir=willInclude;
      sysBubble(willInclude
        ? "✓ Segment marked for inclusion in your memoir draft."
        : "✓ Segment removed from memoir draft — still in your private archive.");
      renderSensitiveReviewPanel();
      _persistSegments();
      // Backend update — best-effort, fails silently if endpoint not available
      if(seg.sessionId && seg.questionId){
        try{
          await fetch(API.IV_SEG_UPDATE,{method:"POST",headers:ctype(),body:JSON.stringify({
            session_id: seg.sessionId,
            question_id: seg.questionId,
            include_in_memoir: seg.includedInMemoir,
          })});
        }catch{}
      }
    }
  );
}

function confirmRemoveSegment(i){
  openConfirmDialog(
    "Remove this segment?",
    "This will permanently remove this part of the session. This cannot be undone.",
    "Remove",
    "#b91c1c",
    async ()=>{
      const seg=sensitiveSegments[i];
      sensitiveSegments.splice(i,1);
      renderRoadmap();
      renderSensitiveReviewPanel();
      _persistSegments();
      sysBubble("Segment removed from your session.");
      // Backend delete — best-effort, fails silently if endpoint not available
      if(seg && seg.sessionId && seg.questionId){
        try{
          await fetch(API.IV_SEG_DELETE,{method:"POST",headers:ctype(),body:JSON.stringify({
            session_id: seg.sessionId,
            question_id: seg.questionId,
          })});
        }catch{}
      }
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
