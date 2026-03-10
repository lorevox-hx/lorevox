/* ═══════════════════════════════════════════════════════════════
   app.js — init, people/profile, events, memoir, obituary,
            chat (WS/SSE), TTS, voice, layout toggles, utilities
   Lorevox v6.1
   Load order: LAST
═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
window.onload = async () => {
  checkStatus();
  connectWebSocket();
  await initSession();
  await refreshPeople();
  await refreshSessions();
  renderRoadmap();
  renderMemoirChapters();
  updateArchiveReadiness();
  document.addEventListener("keydown", e => { if(e.key==="Escape" && isFocusMode) toggleFocus(); });
  const saved = localStorage.getItem(LS_ACTIVE);
  if (saved) loadPerson(saved).catch(()=>{});
};

/* ═══════════════════════════════════════════════════════════════
   STATUS PILLS
═══════════════════════════════════════════════════════════════ */
async function checkStatus(){
  pill("pillChat", await ping(API.PING));
  pill("pillTts",  await ping(API.TTS_VOICES));
}
async function ping(url){
  try{ await fetch(url,{signal:AbortSignal.timeout(2500)}); return true; }catch{ return false; }
}
function pill(id,ok){
  const el=document.getElementById(id); if(!el) return;
  el.classList.remove("pill-off","on","err");
  el.classList.add(ok?"on":"err");
}

/* ═══════════════════════════════════════════════════════════════
   LORI STATUS
═══════════════════════════════════════════════════════════════ */
function setLoriState(s){
  const el=document.getElementById("loriStatus"); if(!el) return;
  el.className=`lori-status ${s}`;
  const labels={ready:"<div class='status-dot'></div> Ready",thinking:"<div class='status-dot'></div> Thinking",drafting:"<div class='status-dot'></div> Drafting",listening:"<div class='status-dot'></div> Listening"};
  el.innerHTML=labels[s]||`<div class='status-dot'></div> ${esc(s)}`;
}

/* ═══════════════════════════════════════════════════════════════
   LAYOUT TOGGLES
═══════════════════════════════════════════════════════════════ */
function toggleSidebar(){
  document.getElementById("gridLayout").classList.toggle("sb-closed");
}
function toggleChat(){
  document.getElementById("gridLayout").classList.toggle("chat-closed");
}
function toggleFocus(){
  isFocusMode=!isFocusMode;
  document.getElementById("gridLayout").classList.toggle("focus-mode",isFocusMode);
  document.getElementById("btnFocus").style.color=isFocusMode?"#7c9cff":"";
  const hint=document.getElementById("focusHint");
  if(isFocusMode){ hint.classList.add("show"); setTimeout(()=>hint.classList.remove("show"),2500); }
  else hint.classList.remove("show");
}
function toggleDevMode(){
  devMode=!devMode;
  document.querySelectorAll(".dev-only").forEach(el=>el.classList.toggle("hidden",!devMode));
  document.getElementById("btnDevMode").style.color=devMode?"#7c9cff":"";
}

/* ═══════════════════════════════════════════════════════════════
   PEOPLE
═══════════════════════════════════════════════════════════════ */
async function refreshPeople(){
  try{
    const r=await fetch(API.PEOPLE+"?limit=200");
    const j=await r.json();
    renderPeople(j.items||j.people||j||[]);
  }catch{ renderPeople([]); }
}
function renderPeople(items){
  const w=document.getElementById("peopleList"); w.innerHTML="";
  (items||[]).forEach(p=>{
    const pid=p.id||p.person_id||p.uuid; if(!pid) return;
    const name=p.display_name||p.name||pid;
    const d=document.createElement("div");
    d.className="sb-item"+(pid===state.person_id?" active":"");
    d.onclick=()=>loadPerson(pid);
    d.innerHTML=`<div class="font-bold text-white text-[12px] truncate">${esc(name)}</div>
      <div class="sb-meta mono">${esc(pid.slice(0,16))}</div>`;
    w.appendChild(d);
  });
  if(!(items||[]).length)
    w.innerHTML=`<div class="text-xs text-slate-500 px-2">No people yet. Fill Profile and click + New Person.</div>`;
}
async function createPersonFromForm(){
  const b=scrapeBasics();
  const display_name=b.fullname||b.preferred||"Unnamed";
  try{
    const r=await fetch(API.PEOPLE,{method:"POST",headers:ctype(),
      body:JSON.stringify({display_name,role:"subject",date_of_birth:b.dob||null,place_of_birth:b.pob||null})});
    const j=await r.json();
    const pid=j.id||j.person_id; if(!pid) throw new Error("no id");
    profileSaved=true;
    sysBubble(`✅ Created: ${display_name}`);
    await refreshPeople(); await loadPerson(pid);
  }catch{ sysBubble("⚠ Create failed — is the server running?"); }
}
async function loadPerson(pid){
  state.person_id=pid;
  document.getElementById("activePerson").textContent=`person_id: ${pid}`;
  localStorage.setItem(LS_ACTIVE,pid);
  try{
    const r=await fetch(API.PROFILE(pid)); if(!r.ok) throw new Error();
    const j=await r.json();
    state.profile=normalizeProfile(j.profile||j||{});
    profileSaved=true;
  }catch{
    state.profile={basics:{},kinship:[],pets:[]};
    profileSaved=false;
  }
  // Load persisted section progress
  const saved=localStorage.getItem(LS_DONE(pid));
  if(saved){ try{ sectionDone=JSON.parse(saved); }catch{} }
  else sectionDone=new Array(INTERVIEW_ROADMAP.length).fill(false);

  // Load persisted sensitive segment decisions for this person.
  // This ensures the Private Segments tab is populated immediately on person
  // select, not only after a new interview session starts.
  _loadSegments();

  hydrateProfileForm();
  updateProfileStatus();
  await refreshPeople();
  onDobChange();
  updateSidebar();
  renderEventsGrid();
  renderTimeline();
  updateContextTriggers();
  updateArchiveReadiness();
  updateObitIdentityCard(state.profile?.basics||{});
  // Update memoir source name
  const msn=document.getElementById("memoirSourceName");
  if(msn){ const n=state.profile?.basics?.preferred||state.profile?.basics?.fullname||"No person selected"; msn.textContent=n; }
}
function normalizeProfile(p){
  const b=p.basics||p.basic||p.identity||{};
  return {
    basics:{fullname:b.fullname||"",preferred:b.preferred||"",dob:b.dob||"",
            pob:b.pob||"",culture:b.culture||"",country:b.country||"us",
            pronouns:b.pronouns||"",phonetic:b.phonetic||"",
            language:b.language||""},  // v6.2 bilingual
    kinship:Array.isArray(p.kinship||p.family)?p.kinship||p.family:[],
    pets:Array.isArray(p.pets)?p.pets:[],
  };
}
async function saveProfile(){
  if(!state.person_id){ sysBubble("Select or create a person first."); return; }
  scrapeProfileForm();
  try{
    const r=await fetch(API.PROFILE(state.person_id),{method:"PUT",headers:ctype(),
      body:JSON.stringify({profile:{basics:state.profile.basics,kinship:state.profile.kinship,pets:state.profile.pets}})});
    if(!r.ok) throw new Error();
    profileSaved=true;
    sysBubble("💾 Profile saved.");
    updateProfileStatus();
    updateArchiveReadiness();
    if(state.chat?.conv_id){
      fetch(API.SESS_PUT,{method:"POST",headers:ctype(),body:JSON.stringify({
        conv_id:state.chat.conv_id,
        payload:{profile:state.profile,person_id:state.person_id}
      })}).catch(()=>{});
    }
    const b=state.profile.basics;
    fetch(API.PERSON(state.person_id),{method:"PATCH",headers:ctype(),body:JSON.stringify({
      display_name:b.preferred||b.fullname||undefined,
      date_of_birth:b.dob||undefined,
      place_of_birth:b.pob||undefined
    })}).catch(()=>{});
  }catch{ sysBubble("⚠ Save failed — is the server running?"); }
}

/* ── Profile status badge ── */
function updateProfileStatus(){
  const el=document.getElementById("profileStatusBadge"); if(!el) return;
  if(!state.person_id){
    el.className="profile-status none"; el.textContent="No person selected"; return;
  }
  const name=state.profile?.basics?.preferred||state.profile?.basics?.fullname;
  if(profileSaved){
    el.className="profile-status connected";
    el.textContent=(name?`${name} — `:"")+"Profile connected";
  } else {
    el.className="profile-status unsaved";
    el.textContent="Profile not yet saved";
  }
}

/* ── Archive Readiness ── */
function updateArchiveReadiness(){
  const el=document.getElementById("readinessChecks"); if(!el) return;
  const b=state.profile?.basics||{};
  const checks=[
    {label:"Date of birth added",  ok:!!b.dob},
    {label:"Birthplace added",     ok:!!b.pob},
    {label:"Pronouns set",         ok:!!b.pronouns},
    {label:"Family started",       ok:(state.profile?.kinship||[]).length>0},
    {label:"Pets added",           ok:(state.profile?.pets||[]).length>0},
    {label:"Profile saved",        ok:profileSaved},
  ];
  el.innerHTML=checks.map(c=>`
    <div class="readiness-item${c.ok?" ok":""}">
      <div class="readiness-dot ${c.ok?"ok":"miss"}"></div>
      <span>${c.label}</span>
      ${c.ok?'<span style="color:#4ade80;font-size:10px;margin-left:auto">✓</span>':''}
    </div>`).join("");
  if(!document.getElementById("pane-obituary")?.classList.contains("hidden"))
    updateObitIdentityCard(b);
}

function hydrateProfileForm(){
  const b=state.profile.basics||{};
  setv("bio_fullname",b.fullname); setv("bio_preferred",b.preferred);
  setv("bio_dob",b.dob);          setv("bio_pob",b.pob);
  setv("bio_culture",b.culture||""); setv("bio_phonetic",b.phonetic||"");
  const sel=document.getElementById("bio_country");
  if(sel && b.country) sel.value=b.country;
  const langSel=document.getElementById("bio_language");  // v6.2
  if(langSel && b.language) langSel.value=b.language;
  const proSel=document.getElementById("bio_pronouns");
  if(proSel && b.pronouns){
    const known=["","she/her","he/him","they/them"];
    if(known.includes(b.pronouns)){ proSel.value=b.pronouns; }
    else{ proSel.value="custom"; setv("bio_pronouns_custom",b.pronouns);
      const w=document.getElementById("bio_pronouns_custom_wrap"); if(w) w.classList.remove("hidden"); }
  }
  const kt=document.getElementById("tblKinship"); kt.innerHTML="";
  (state.profile.kinship||[]).forEach(k=>addKinRow(k.relation||"Sibling",k));
  if(!(state.profile.kinship||[]).length) addKin("Mother");
  const pt=document.getElementById("tblPets"); pt.innerHTML="";
  if((state.profile.pets||[]).length){
    (state.profile.pets||[]).forEach(p=>addPetRow(p));
  } else {
    pt.innerHTML=`<div class="text-xs text-slate-500 italic">Pets are powerful memory anchors — favorite stories often surface here.</div>`;
  }
}
function scrapeBasics(){
  const proSel=document.getElementById("bio_pronouns");
  const pronouns=(proSel?.value==="custom"?getv("bio_pronouns_custom"):proSel?.value)||"";
  const langSel=document.getElementById("bio_language");
  return {
    fullname:getv("bio_fullname"),preferred:getv("bio_preferred"),
    dob:getv("bio_dob"),pob:getv("bio_pob"),
    culture:getv("bio_culture"),country:document.getElementById("bio_country").value,
    pronouns,phonetic:getv("bio_phonetic"),
    language:langSel?langSel.value:""  // v6.2 bilingual
  };
}
function onPronounsChange(){
  const v=document.getElementById("bio_pronouns")?.value;
  const wrap=document.getElementById("bio_pronouns_custom_wrap");
  if(wrap) wrap.classList.toggle("hidden",v!=="custom");
}
function scrapeProfileForm(){
  state.profile.basics=scrapeBasics();
  const kin=[]; document.querySelectorAll("#tblKinship .kinrow").forEach(row=>{
    const name=row.querySelector('[data-k="name"]').value.trim();
    const relation=row.querySelector('[data-k="relation"]').value;
    const pob=row.querySelector('[data-k="pob"]').value.trim();
    const occ=row.querySelector('[data-k="occ"]').value.trim();
    const deceased=row.querySelector('[data-k="deceased"]').checked;
    if(name) kin.push({name,relation,pob,occupation:occ,deceased});
  }); state.profile.kinship=kin;
  const pets=[]; document.querySelectorAll("#tblPets .petrow").forEach(row=>{
    const name=row.querySelector('[data-p="name"]').value.trim();
    if(name) pets.push({
      name,species:row.querySelector('[data-p="species"]').value.trim(),
      from:row.querySelector('[data-p="from"]').value.trim(),
      to:row.querySelector('[data-p="to"]').value.trim(),
      notes:row.querySelector('[data-p="notes"]').value.trim(),
      memory:row.querySelector('[data-p="memory"]')?.value.trim()||"",
    });
  }); state.profile.pets=pets;
}

/* ── DOB / Generation ── */
function onDobChange(){
  const dob=getv("bio_dob")||state.profile?.basics?.dob||"";
  const gb=document.getElementById("genBadge");
  const ad=document.getElementById("ageDisplay");
  if(!dob){ gb.classList.add("hidden"); ad.classList.add("hidden"); return; }
  const y=parseInt(dob.split("-")[0]); if(isNaN(y)) return;
  const age=new Date().getFullYear()-y;
  const gen=detectGeneration(y);
  if(gen){ gb.textContent=gen.name; gb.classList.remove("hidden"); }
  ad.textContent=`~${age} years old`; ad.classList.remove("hidden");
  renderEventsGrid(); updateContextTriggers(); updateSidebar();
  updateArchiveReadiness();
}
function onCountryChange(){
  if(state.profile?.basics) state.profile.basics.country=document.getElementById("bio_country").value;
  renderEventsGrid();
}
function detectGeneration(y){
  if(y>=1928&&y<=1945) return{name:"Silent Generation"};
  if(y>=1946&&y<=1964) return{name:"Baby Boomer"};
  if(y>=1965&&y<=1980) return{name:"Generation X"};
  if(y>=1981&&y<=1996) return{name:"Millennial"};
  if(y>=1997&&y<=2012) return{name:"Generation Z"};
  return null;
}
function getBirthYear(){
  const dob=getv("bio_dob")||state.profile?.basics?.dob||"";
  return dob?parseInt(dob.split("-")[0]):null;
}
function getCountry(){
  return document.getElementById("bio_country")?.value||state.profile?.basics?.country||"us";
}

/* ── Sidebar summary ── */
function updateSidebar(){
  const name=state.profile?.basics?.preferred||state.profile?.basics?.fullname;
  if(!name){ document.getElementById("activeSummary").classList.add("hidden"); return; }
  document.getElementById("activeSummary").classList.remove("hidden");
  document.getElementById("summaryName").textContent=name;
  const dob=state.profile?.basics?.dob;
  const gen=dob?detectGeneration(parseInt(dob.split("-")[0])):null;
  document.getElementById("summaryGen").textContent=gen?gen.name:"";
  const done=sectionDone.filter(Boolean).length;
  document.getElementById("summaryProg").textContent=`${done}/${INTERVIEW_ROADMAP.length} sections`;
}

/* ── Demo fill ── */
function demoFill(){
  setv("bio_fullname","Christopher Todd Horne"); setv("bio_preferred","Chris");
  setv("bio_dob","1962-12-24"); setv("bio_pob","Williston, North Dakota");
  setv("bio_culture","American / Northern European");
  document.getElementById("bio_country").value="us";
  onDobChange();
  if(!document.querySelectorAll("#tblKinship .kinrow").length) addKin("Mother");
}

/* ═══════════════════════════════════════════════════════════════
   KINSHIP & PETS
═══════════════════════════════════════════════════════════════ */
function addKin(kind){ addKinRow(kind,{}); }
function addKinRow(kind,data){
  const t=document.getElementById("tblKinship");
  const d=document.createElement("div"); d.className="kinrow flex-row";
  d.innerHTML=`
    <input class="input-ghost" style="min-width:110px;flex:1" data-k="name" placeholder="Name" value="${escAttr(data.name||"")}">
    <select class="input-ghost" style="min-width:100px" data-k="relation">
      ${["Mother","Father","Sibling","Spouse","Partner","Child","Step-parent","Step-child","Adoptive parent","Adopted child","Grandparent","Grandchild","Former spouse","Guardian","Chosen family","Other"]
        .map(x=>`<option ${(data.relation||kind)===x?"selected":""}>${x}</option>`).join("")}
    </select>
    <input class="input-ghost" style="flex:1;min-width:90px" data-k="pob" placeholder="Birthplace" value="${escAttr(data.pob||"")}">
    <input class="input-ghost" style="flex:1;min-width:90px" data-k="occ" placeholder="Occupation" value="${escAttr(data.occupation||"")}">
    <label class="text-xs text-slate-400 flex items-center gap-1 whitespace-nowrap flex-shrink-0 font-semibold">
      <input type="checkbox" data-k="deceased" ${data.deceased?"checked":""}>
      <span style="color:${data.deceased?"#f87171":"inherit"}">Deceased</span>
    </label>
    <button class="text-red-400 hover:text-red-300 text-sm flex-shrink-0" onclick="this.closest('.kinrow').remove();updateArchiveReadiness()">✕</button>`;
  t.appendChild(d);
  updateArchiveReadiness();
}
function addPet(){ addPetRow({}); }
function addPetRow(data){
  const t=document.getElementById("tblPets");
  const ph=t.querySelector('.italic'); if(ph) ph.remove();
  const d=document.createElement("div"); d.className="petrow flex-row";
  d.innerHTML=`<span class="text-lg flex-shrink-0">🐾</span>
    <input class="input-ghost" style="min-width:100px;flex:1" data-p="name"    placeholder="Pet name"    value="${escAttr(data.name||"")}">
    <input class="input-ghost" style="min-width:110px;flex:1" data-p="species" placeholder="Species/breed" value="${escAttr(data.species||"")}">
    <input class="input-ghost" style="width:70px"             data-p="from"   placeholder="Year got"    value="${escAttr(data.from||"")}">
    <input class="input-ghost" style="width:70px"             data-p="to"     placeholder="Year lost"   value="${escAttr(data.to||"")}">
    <div style="flex:2;min-width:130px"><div class="text-xs text-slate-600 mb-0.5">Best remembered for</div><input class="input-ghost" style="width:100%" data-p="notes" placeholder="A story, habit, or detail that captures who they were." value="${escAttr(data.notes||"")}"></div>
    <div style="flex:2;min-width:130px"><div class="text-xs text-slate-600 mb-0.5">Favorite memory</div><input class="input-ghost" style="width:100%" data-p="memory" placeholder="A moment, place, or routine you shared." value="${escAttr(data.memory||"")}"></div>
    <button class="text-red-400 hover:text-red-300 text-sm flex-shrink-0" onclick="this.closest('.petrow').remove();updateArchiveReadiness()">✕</button>`;
  t.appendChild(d);
  updateArchiveReadiness();
}

/* ═══════════════════════════════════════════════════════════════
   WORLD EVENTS — Memory Triggers
═══════════════════════════════════════════════════════════════ */
function setEvtFilter(f,el){
  activeFilter=f;
  document.querySelectorAll(".filter-chip").forEach(c=>c.classList.toggle("active",c.dataset.f===f));
  renderEventsGrid();
}
function fireCustomPrompt(){
  const txt=(getv("evtCustomPrompt")||"").trim(); if(!txt) return;
  setv("chatInput",`Tell me about: ${txt}. Does this bring up any memories or feelings?`);
  document.getElementById("chatInput").focus();
  showTab("interview");
  sysBubble(`💡 Custom prompt loaded — press Send to ask Lori.`);
}
function renderEventsGrid(){
  const birthYear=getBirthYear();
  const country=getCountry();
  const secondary=document.getElementById("evtSecondaryCountry")?.value||"";
  const container=document.getElementById("eventsGrid"); if(!container) return;
  const strip=document.getElementById("evtContextStrip");

  const countryMatch=(e)=>{
    if(country==="global") return e.tags.includes("global");
    const primaryMatch=e.tags.includes(country)||e.tags.includes("global");
    if(!secondary) return primaryMatch;
    const secMatch=secondary==="global"?e.tags.includes("global"):e.tags.includes(secondary)||e.tags.includes("global");
    return primaryMatch||secMatch;
  };

  const events=ALL_EVENTS.filter(e=>{
    if(!countryMatch(e)) return false;
    if(activeFilter!=="all"&&!e.tags.includes(activeFilter)) return false;
    if(birthYear){ const age=e.year-birthYear; return age>=5&&age<=100; }
    return true;
  });

  const sparseNote=document.getElementById("evtSparseNote");
  if(sparseNote && birthYear){
    const age=new Date().getFullYear()-birthYear;
    if(age<30 && events.length<12){
      sparseNote.textContent=`Fewer triggers appear for younger ages — this list reflects memories from childhood through today. As more life events unfold, this list will grow.`;
      sparseNote.classList.remove("hidden");
    } else { sparseNote.classList.add("hidden"); }
  }

  if(strip){
    const countryLabels={us:"United States",uk:"United Kingdom",canada:"Canada",
      mexico:"Mexico",australia:"Australia",global:"Global"};
    const cLabel=countryLabels[country]||country;
    const filterLabel=activeFilter==="all"?"All events":activeFilter;
    if(birthYear||state.person_id){
      strip.classList.remove("hidden");
      const name=state.profile?.basics?.preferred||state.profile?.basics?.fullname;
      const gen=birthYear?detectGeneration(birthYear):null;
      strip.innerHTML=`
        ${name?`<span class="context-strip-item">For <span>${esc(name)}</span></span>`:``}
        ${birthYear?`<span class="context-strip-item">Born <span>${birthYear}</span></span>`:`<span class="context-strip-item text-slate-600">No DOB set</span>`}
        ${gen?`<span class="context-strip-item"><span>${esc(gen.name)}</span></span>`:""}
        ${birthYear?`<span class="context-strip-item">Ages <span>5–${Math.min(100,new Date().getFullYear()-birthYear)}</span></span>`:""}
        <span class="context-strip-item">Country <span>${esc(cLabel)}</span></span>
        ${secondary?`<span class="context-strip-item">+ Lens <span>${esc(secondary)}</span></span>`:""}
        <span class="context-strip-item">Filter <span>${esc(filterLabel)}</span></span>
        <span class="context-strip-item"><span>${events.length}</span> events shown</span>`;
    } else {
      strip.classList.add("hidden");
    }
  }

  const hint=document.getElementById("evtAgeHint");
  if(hint){
    if(birthYear){
      const maxAge=Math.min(100,new Date().getFullYear()-birthYear);
      hint.textContent=`Showing events from ages 5–${maxAge} (${birthYear} to present)`;
    } else {
      hint.textContent="Add a date of birth on the Profile tab to filter events to this person's lifetime.";
    }
  }

  if(!events.length){
    container.innerHTML=`<div class="text-sm text-slate-500 text-center py-6">No events match this filter. Try "All" or change the country on the Profile tab.</div>`;
    return;
  }
  container.innerHTML="";
  events.forEach(e=>{
    const age=birthYear?e.year-birthYear:null;
    const div=document.createElement("div"); div.className="event-card";
    div.onclick=()=>fireEventPrompt(e,age);
    div.innerHTML=`
      <div class="event-year">${e.year}</div>
      <div class="event-text">${esc(e.event)}
        <div class="mt-1">${e.tags.map(t=>`<span class="event-tag">${t}</span>`).join("")}</div>
        <div class="event-hint">Ask Lori about this moment</div>
      </div>
      ${age!==null?`<div class="event-age-badge">Age ${age}</div>`:""}`;
    container.appendChild(div);
  });
}
function fireEventPrompt(evt,age){
  const ageStr=age!==null?`when you were about ${age} years old`:"";
  let q;
  if(evt.tags.includes("war"))             q=`In ${evt.year}, ${evt.event}. You were ${ageStr}. Did this affect your family or people around you?`;
  else if(evt.tags.includes("technology")) q=`In ${evt.year}, ${evt.event}. You were ${ageStr}. Do you remember when this first came into your life?`;
  else if(evt.tags.includes("music")||evt.tags.includes("culture")) q=`In ${evt.year} — ${evt.event}. You were ${ageStr}. Do you have any memories from that time?`;
  else if(evt.tags.includes("cars"))       q=`In ${evt.year}, ${evt.event}. You were ${ageStr}. How did cars and transportation fit into your life around then?`;
  else q=`In ${evt.year} — ${evt.event}. You were ${ageStr}. Do you remember hearing about this or experiencing its effects?`;
  setv("chatInput",q);
  document.getElementById("chatInput").focus();
  showTab("interview");
}

/* ═══════════════════════════════════════════════════════════════
   MEMOIR DRAFT
═══════════════════════════════════════════════════════════════ */
function renderMemoirChapters(){
  const w=document.getElementById("memoirChapterList"); if(!w) return;
  const framing=document.getElementById("memoirFraming")?.value||"chronological";
  let showSections;
  if(framing==="early-life"){
    showSections=INTERVIEW_ROADMAP.map((s,i)=>({s,i})).filter(({s})=>MEMOIR_EARLY_LIFE.includes(s.id));
  } else if(framing==="family-legacy"){
    showSections=INTERVIEW_ROADMAP.map((s,i)=>({s,i})).filter(({s})=>MEMOIR_FAMILY_LEGACY.includes(s.id)||["origins","marriage","children","faith","legacy"].includes(s.id));
  } else if(framing==="thematic"){
    const order=MEMOIR_THEMATIC_ORDER;
    showSections=INTERVIEW_ROADMAP.map((s,i)=>({s,i})).filter(({s})=>!s.youth||youthMode)
      .sort((a,b)=>{ const ai=order.indexOf(a.s.id); const bi=order.indexOf(b.s.id); return (ai<0?999:ai)-(bi<0?999:bi); });
  } else {
    showSections=INTERVIEW_ROADMAP.map((s,i)=>({s,i})).filter(({s})=>!s.youth||youthMode);
  }
  const doneCount=sectionDone.filter(Boolean).length;
  const pct=Math.round(doneCount/INTERVIEW_ROADMAP.length*100);
  const cov=document.getElementById("memoirCoverage");
  const fill=document.getElementById("memoirProgressFill");
  if(cov) cov.textContent=`Interview coverage: ${doneCount} of ${INTERVIEW_ROADMAP.length} sections complete`;
  if(fill) fill.style.width=pct+"%";
  w.innerHTML=showSections.map(({s,i},n)=>{
    let cls,lbl;
    if(sectionDone[i]){cls="ready";lbl="Ready for draft";}
    else if(sectionVisited[i]){cls="in-progress";lbl="In progress";}
    else{cls="empty";lbl="Not started";}
    const thinNote=!sectionDone[i]?`<div class="text-xs text-slate-700 mt-0.5" style="font-size:9px">Limited source material — complete this section for a fuller draft.</div>`:"";
    return `<div class="chapter-row" onclick="jumpToSection(${i})" title="Go to this interview section">
      <span class="chapter-num">${n+1}</span>
      <div class="flex-1"><span class="chapter-label">${s.emoji} ${s.label}</span>${thinNote}</div>
      <span class="chapter-status ${cls}">${lbl}</span>
    </div>`;
  }).join("");
}
function jumpToSection(i){ sectionIndex=i; sectionVisited[i]=true; renderRoadmap(); updateContextTriggers(); showTab("interview"); }
function generateMemoirOutline(){
  const name=state.profile?.basics?.fullname||"the subject";
  const dob=state.profile?.basics?.dob||"";
  const visibleRoadmap=INTERVIEW_ROADMAP.filter(s=>!s.youth||youthMode);
  const done=visibleRoadmap.filter(s=>sectionDone[INTERVIEW_ROADMAP.indexOf(s)]).map(s=>s.label);
  let txt=`MEMOIR OUTLINE\n${name}${dob?" · Born "+dob:""}\n\n`;
  visibleRoadmap.forEach((s,n)=>{ const i=INTERVIEW_ROADMAP.indexOf(s); txt+=`  ${n+1}. ${s.label} ${sectionDone[i]?"✓":""}\n`; });
  txt+=`\nCompleted: ${done.length}/${visibleRoadmap.length}`;
  document.getElementById("memoirDraftOutput").value=txt;
}
function generateMemoirDraft(){
  const name=state.profile?.basics?.preferred||state.profile?.basics?.fullname||"this person";
  const done=INTERVIEW_ROADMAP.filter((_,i)=>sectionDone[i]).map(s=>s.label);
  if(!done.length){ sysBubble("Complete at least one interview section first."); return; }
  const framing=document.getElementById("memoirFraming")?.value||"chronological";
  const framingInstructions={
    "chronological":"Write flowing narrative prose, chapter by chapter in chronological order, in the style of a thoughtful family memoir.",
    "thematic":"Organize the memoir by theme rather than chronology — group memories around identity, family, work, and legacy. Each chapter explores a theme across different life periods.",
    "early-life":"Write this as an early-life journal — warm, personal, and focused on childhood through young adulthood. Use a voice that feels like a personal diary or coming-of-age story.",
    "family-legacy":"Write this as a family legacy narrative — address it to future generations. Focus on values, family patterns, heritage, and what this person would want their descendants to know.",
  };
  const style=framingInstructions[framing]||framingInstructions["chronological"];
  const pronouns=state.profile?.basics?.pronouns||"";
  const pronNote=pronouns?` Use ${pronouns} pronouns.`:"";
  const prompt=`Please write a memoir draft for ${name}.${pronNote} Completed interview sections: ${done.join(", ")}. ${style} Ground every detail in the collected interview answers. Do not invent facts.`;
  setv("chatInput",prompt); document.getElementById("chatInput").focus();
  sysBubble("Memoir prompt loaded — press Send to have Lori write the draft.");
}
function copyMemoirDraft(){ nav_copy(document.getElementById("memoirDraftOutput").value); sysBubble("↳ Draft copied."); }
function clearMemoirDraft(){ document.getElementById("memoirDraftOutput").value=""; }

/* ═══════════════════════════════════════════════════════════════
   OBITUARY DRAFT
═══════════════════════════════════════════════════════════════ */
function buildObituary(){
  const draft=document.getElementById("obituaryOutput")?.value||"";
  if(obitHasEdits && draft.trim()){
    obitModalAction="profile";
    document.getElementById("obitLockModal").classList.remove("hidden");
    return;
  }
  _buildObituaryImpl();
}
function generateObitChat(){
  const draft=document.getElementById("obituaryOutput")?.value||"";
  if(obitHasEdits && draft.trim()){
    obitModalAction="lori";
    document.getElementById("obitLockModal").classList.remove("hidden");
    return;
  }
  _generateObitChatImpl();
}
function closeObitModal(){
  document.getElementById("obitLockModal").classList.add("hidden");
  obitModalAction=null;
}
function confirmObitModal(){
  const action=obitModalAction;
  closeObitModal();
  obitHasEdits=false;
  if(action==="profile") _buildObituaryImpl();
  else                   _generateObitChatImpl();
}
function _buildObituaryImpl(){
  const b=state.profile?.basics||{};
  const kin=state.profile?.kinship||[];
  if(b.fullname) setv("obit_name",b.fullname);
  if(b.dob)      setv("obit_dob",b.dob);
  if(b.pob)      setv("obit_pob",b.pob);
  if(b.dob){ const y=parseInt(b.dob.split("-")[0]);
    if(!isNaN(y)) setv("obit_age",`${new Date().getFullYear()-y} (living)`); }
  const dod=getv("obit_dod");
  const isLiving=!dod;
  const banner=document.getElementById("obitLivingBanner");
  if(banner) banner.classList.toggle("hidden",!isLiving);
  const heading=document.getElementById("obitHeading");
  if(heading) heading.textContent=isLiving?"Life Summary / Archive":"Obituary Draft";
  const living=(arr,rel)=>kin.filter(k=>k.relation===rel&&!k.deceased).map(k=>k.name);
  const spouse=living(kin,"Spouse").concat(living(kin,"Partner"));
  const children=living(kin,"Child").concat(living(kin,"Step-child")).concat(living(kin,"Adopted child"));
  const siblings=living(kin,"Sibling");
  let surv="";
  if(spouse.length)   surv+=spouse.join(" and ");
  if(children.length) surv+=(surv?"; their children ":"children ")+children.join(", ");
  if(siblings.length) surv+=(surv?"; and siblings ":"siblings ")+siblings.join(", ");
  if(surv) setv("obit_survivors",`${b.preferred||b.fullname||"The deceased"} is survived by ${surv}.`);
  updateObitIdentityCard(b);
  setObitDraftType("auto");
  generateObituaryText();
}
function previewFamilyMapSurvivors(){
  const kin=state.profile?.kinship||[];
  const prev=document.getElementById("obitFamilyPreview");
  if(!prev) return;
  const lines=kin.map(k=>{
    const dec=k.deceased?"(deceased)":"(living)";
    return `${k.name||"—"} · ${k.relation} ${dec}`;
  });
  if(!lines.length){ prev.textContent="No family members added to the Family Map yet."; }
  else { prev.textContent="Family Map: "+lines.join(" · "); }
  prev.classList.remove("hidden");
}
function updateObitIdentityCard(b){
  const el=document.getElementById("obitIdentityItems"); if(!el) return;
  const checks=[
    {label:"Name set",      ok:!!(b.fullname||b.preferred)},
    {label:"Pronouns set",  ok:!!b.pronouns},
    {label:"Date of birth", ok:!!b.dob},
    {label:"Family map",    ok:(state.profile?.kinship||[]).length>0},
    {label:"Culture/roots", ok:!!b.culture},
  ];
  el.innerHTML=`<div class="flex flex-wrap gap-3">`+checks.map(c=>
    `<div class="identity-card-item">
       <div class="identity-card-dot ${c.ok?"ok":"miss"}"></div>
       <span style="color:${c.ok?"#94a3b8":"#475569"}">${c.label}</span>
     </div>`).join("")+`</div>`;
}
function generateObituaryText(){
  const name=getv("obit_name")||"[Name]";
  const age=getv("obit_age"); const dob=getv("obit_dob");
  const dod=getv("obit_dod"); const pob=getv("obit_pob");
  const pod=getv("obit_pod"); const career=getv("obit_career");
  const surv=getv("obit_survivors");
  const tone=document.getElementById("obitTone")?.value||"traditional";
  const fmt=(d)=>{ try{ return new Date(d).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}); }catch{return d;} };
  let txt="";
  if(tone==="concise"){
    txt=name; if(age) txt+=`, age ${age.replace(" (living)","")}`;
    txt+=dod?` — died ${fmt(dod)}.\n`:" — Life Story Archive.\n";
    if(pob||dob) txt+=`Born${dob?" "+fmt(dob):""}${pob?" in "+pob:""}.\n`;
    if(career) txt+=`${career}\n`;
    if(surv) txt+=`${surv}`;
  } else if(tone==="warm"){
    txt=`${name} lived a life full of love and purpose`;
    if(age) txt+=`, and at ${age.replace(" (living)","")} years`;
    txt+=dod?`, passed from this world on ${fmt(dod)}.\n\n`:`, continues to share their story.\n\n`;
    if(pob||dob) txt+=`Born${dob?" "+fmt(dob):""}${pob?" in the heart of "+pob:""}, their journey began with the family and community that would shape everything to come.\n\n`;
    if(career) txt+=`${career}\n\n`;
    if(surv) txt+=`${surv}\n\n`;
    txt+=`Their memory is a gift to all who knew them.`;
  } else if(tone==="family"){
    const first=name.split(" ")[0];
    txt=`${first} was one of a kind.`;
    if(pob||dob) txt+=` Born${dob?" "+fmt(dob):""}${pob?" in "+pob:""}, ${first} grew up to become someone their family will always be proud of.\n\n`;
    else txt+="\n\n";
    if(career) txt+=`${career}\n\n`;
    if(surv) txt+=`${surv}\n\n`;
    txt+=`We'll keep telling the stories.`;
  } else {
    txt=name; if(age) txt+=`, ${age},`;
    if(pod) txt+=dod?` of ${pod},`:` of ${pod}`;
    txt+=dod?` passed away ${fmt(dod)}.`:" — Life Story Archive."; txt+="\n\n";
    if(pob||dob) txt+=`Born${dob?" "+fmt(dob):""}${pob?" in "+pob:""}, ${name.split(" ")[0]} lived a life of purpose and meaning.\n\n`;
    if(career) txt+=`${career}\n\n`;
    if(surv) txt+=`${surv}\n\n`;
    txt+=`A celebration of life will be announced by the family.`;
  }
  document.getElementById("obituaryOutput").value=txt;
}
function _generateObitChatImpl(){
  const b=state.profile?.basics||{};
  const name=b.fullname||"this person";
  const tone=document.getElementById("obitTone")?.value||"traditional";
  const dod=getv("obit_dod");
  const isLiving=!dod;
  const pronounNote=b.pronouns?` Use ${b.pronouns} pronouns.`:"";
  const livingNote=isLiving?" This person is living — write a Life Summary rather than an obituary. Avoid death-framing.":"";
  const faith=getv("obit_faith"); const service=getv("obit_service");
  const vigil=getv("obit_vigil"); const memorial=getv("obit_memorial");
  const bilingual=getv("obit_bilingual");
  const culturalParts=[faith&&`Faith: ${faith}`,service&&`Service: ${service}`,
    vigil&&`Vigil/rosary: ${vigil}`,memorial&&`Memorial: ${memorial}`,bilingual&&`Bilingual note: ${bilingual}`].filter(Boolean);
  const culturalNote=culturalParts.length?` Cultural/memorial details: ${culturalParts.join("; ")}.`:"";
  const prompt=`Please write a ${tone} ${isLiving?"life summary":"obituary"} for ${name}.${pronounNote}${livingNote}${culturalNote} Use the profile data, family map, career history, and interview highlights. Write in a ${tone} style — include birth, career, family, and a closing tribute.`;
  setv("chatInput",prompt); document.getElementById("chatInput").focus();
  sysBubble("Obituary prompt loaded — press Send to have Lori write it.");
  obitDraftType="lori_pending";
}
function setObitDraftType(t){
  obitDraftType=t;
  const el=document.getElementById("obitDraftIndicator"); if(!el) return;
  if(!t){ el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  if(t==="lori")        { el.className="draft-indicator lori";   el.textContent="✨ Written with Lori"; }
  else if(t==="edited") { el.className="draft-indicator edited";  el.textContent="✎ Edited by hand"; }
  else                  { el.className="draft-indicator auto";    el.textContent="Filled from Profile"; }
}
function resetObitFromFacts(){ obitHasEdits=false; _buildObituaryImpl(); }
function copyObituary(){ nav_copy(document.getElementById("obituaryOutput").value); sysBubble("↳ Obituary copied."); }

/* ═══════════════════════════════════════════════════════════════
   SESSION INIT
═══════════════════════════════════════════════════════════════ */
async function initSession(){
  try{
    const r=await fetch(API.SESS_NEW,{method:"POST",headers:ctype(),
      body:JSON.stringify({title:"Lorevox v5.5"})});
    const j=await r.json();
    state.chat.conv_id=j.conv_id||j.session_id||null;
    document.getElementById("chatSessionLabel").textContent=state.chat.conv_id||"Local session";
  }catch{ state.chat.conv_id=null; document.getElementById("chatSessionLabel").textContent="Offline mode"; }
}
async function refreshSessions(){
  try{
    const r=await fetch(API.SESS_LIST+"?limit=12"); if(!r.ok) return;
    const j=await r.json();
    const sl=document.getElementById("sessionsList"); if(!sl) return; sl.innerHTML="";
    (j.items||j.sessions||[]).slice(0,8).forEach(s=>{
      const d=document.createElement("div"); d.className="sb-item";
      d.onclick=()=>loadSession(s.conv_id||s.id);
      d.innerHTML=`<div class="text-xs text-slate-300 truncate">${esc(s.title||s.conv_id||"Session")}</div>`;
      sl.appendChild(d);
    });
  }catch{}
}
async function loadSession(cid){
  try{
    const r=await fetch(API.SESS_TURNS(cid)); const j=await r.json();
    document.getElementById("chatMessages").innerHTML="";
    (j.items||j.turns||[]).forEach(m=>appendBubble(m.role==="assistant"?"ai":m.role==="user"?"user":"sys",m.content||""));
    state.chat.conv_id=cid;
    document.getElementById("chatSessionLabel").textContent=cid;
  }catch{ sysBubble("Could not load session."); }
}

/* ═══════════════════════════════════════════════════════════════
   CHAT — WS primary, SSE fallback
═══════════════════════════════════════════════════════════════ */
function onChatKey(e){ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendUserMessage(); } }

async function sendUserMessage(){
  const text=getv("chatInput").trim(); if(!text) return;
  setv("chatInput",""); appendBubble("user",text);
  let systemInstruction="";

  if(state.interview.session_id&&state.interview.question_id){
    try{
      const j=await processInterviewAnswer(text,false);
      if(j){
        if(j.done){
          systemInstruction="[SYSTEM: The interview section is now complete. Warmly acknowledge the user's final answer and congratulate them.]";
        } else if(j.next_question?.prompt){
          const noSummary=(j.generated_summary||(j.followups_inserted||0)>0)
            ?"A summary was generated and saved to Section Notes. Do NOT repeat it in chat. ":"";
          systemInstruction=`[SYSTEM: ${noSummary}Acknowledge the answer naturally in 1–2 sentences, then ask the next question exactly as written: "${j.next_question.prompt}"]`;
        }
      }
    }catch{}
  }

  const payload=systemInstruction?`${text}\n\n${systemInstruction}`:text;

  if(ws&&wsReady&&!usingFallback){
    setLoriState("thinking");
    currentAssistantBubble=null;
    ws.send(JSON.stringify({type:"start_turn",session_id:state.chat.conv_id||"default",
      message:payload,params:{person_id:state.person_id,temperature:0.7,max_new_tokens:512}}));
    return;
  }
  await streamSse(payload);
}

async function sendSystemPrompt(instruction){
  const bubble=appendBubble("ai","…");
  if(ws&&wsReady&&!usingFallback){
    setLoriState("thinking");
    currentAssistantBubble=bubble;
    ws.send(JSON.stringify({type:"start_turn",session_id:state.chat.conv_id||"default",
      message:instruction,params:{person_id:state.person_id,temperature:0.7,max_new_tokens:512}}));
    return;
  }
  await streamSse(instruction,bubble);
}

async function streamSse(text,overrideBubble=null){
  setLoriState("thinking");
  const bubble=overrideBubble||appendBubble("ai","…");
  // v6.2: inject language instruction when profile specifies a non-English preference
  const _lang=state.profile?.basics?.language||"";
  const _langNote=_lang?` Please communicate in ${_lang} throughout this session.`:"";
  const sys=`You are Lori, a warm oral historian and memoir biographer working for Lorevox.${_langNote} PROFILE_JSON: ${JSON.stringify({person_id:state.person_id,profile:state.profile})}`;
  const body={messages:[{role:"system",content:sys},{role:"user",content:text}],
    temp:0.7,max_new:512,conv_id:state.chat.conv_id||"default"};
  let full="";
  try{
    const res=await fetch(API.CHAT_SSE,{method:"POST",headers:ctype(),body:JSON.stringify(body)});
    if(!res.ok) throw new Error("SSE error "+res.status);
    const reader=res.body.getReader(); const dec=new TextDecoder();
    setLoriState("drafting");
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      for(const line of dec.decode(value,{stream:true}).split("\n")){
        if(!line.trim()) continue;
        try{
          const d=JSON.parse(line.replace(/^data:\s*/,""));
          if(d.delta||d.text){ full+=(d.delta||d.text); bubble.textContent=full;
            document.getElementById("chatMessages").scrollTop=99999; }
        }catch{}
      }
    }
    onAssistantReply(full);
    if(full && !text.startsWith("[SYSTEM:")){
      setv("ivAnswer",full);
      captureState="captured";
      renderCaptureChip();
    }
    if(obitDraftType==="lori_pending"){ setObitDraftType("lori"); }
    setLoriState("ready");
  }catch(err){
    bubble.textContent="Chat service unavailable — start the Lorevox backend to enable AI responses.";
    setLoriState("ready");
  }
}

function onAssistantReply(text){
  if(!text) return;
  lastAssistantText=text;
  document.getElementById("lastAssistantPanel").textContent=text;
  enqueueTts(text);
}

/* ═══════════════════════════════════════════════════════════════
   WEBSOCKET
═══════════════════════════════════════════════════════════════ */
function connectWebSocket(){
  try{
    ws=new WebSocket(API.CHAT_WS);
    ws.onopen=()=>{ wsReady=true; usingFallback=false; pill("pillWs",true); };
    ws.onclose=()=>{ wsReady=false; ws=null; pill("pillWs",false);
      usingFallback=true; setTimeout(connectWebSocket,4000); };
    ws.onerror=()=>{ wsReady=false; pill("pillWs",false); };
    ws.onmessage=e=>{ try{ handleWsMessage(JSON.parse(e.data)); }catch{} };
  }catch{ usingFallback=true; }
}
function handleWsMessage(j){
  if(j.type==="token"||j.type==="delta"){
    if(!currentAssistantBubble){
      currentAssistantBubble=appendBubble("ai","");
      setLoriState("drafting");
    }
    currentAssistantBubble.textContent+=(j.delta||j.token||"");
    document.getElementById("chatMessages").scrollTop=99999;
  }
  if(j.type==="done"){
    const text=j.final_text||(currentAssistantBubble?.textContent||"");
    onAssistantReply(text);
    if(text){
      setv("ivAnswer",text);
      captureState="captured";
      renderCaptureChip();
    }
    if(obitDraftType==="lori_pending") setObitDraftType("lori");
    setLoriState("ready");
    currentAssistantBubble=null;
  }
  if(j.type==="status") pill("pillWs", j.state==="connected"||j.state==="generating");
}

/* ═══════════════════════════════════════════════════════════════
   CHAT DISPLAY
═══════════════════════════════════════════════════════════════ */
function appendBubble(role,text){
  const w=document.getElementById("chatMessages");
  const d=document.createElement("div");
  d.className=`bubble bubble-${role}`;
  d.textContent=text;
  w.appendChild(d); w.scrollTop=w.scrollHeight;
  return d;
}
function sysBubble(text){ return appendBubble("sys",text); }
function clearChat(){ document.getElementById("chatMessages").innerHTML=""; }

/* ═══════════════════════════════════════════════════════════════
   TTS
═══════════════════════════════════════════════════════════════ */
function enqueueTts(text){ ttsQueue.push(text); if(!ttsBusy) drainTts(); }
async function drainTts(){
  ttsBusy=true;
  while(ttsQueue.length){
    const chunk=ttsQueue.shift();
    try{
      const r=await fetch(TTS_ORIG+"/api/tts/speak_stream",{method:"POST",headers:ctype(),
        body:JSON.stringify({text:chunk.slice(0,400),voice:"p335"})});
      if(!r.ok) continue;
      const url=URL.createObjectURL(await r.blob());
      await new Promise(res=>{ const a=new Audio(url); a.onended=a.onerror=res; a.play().catch(res); });
    }catch{}
  }
  ttsBusy=false;
}

/* ═══════════════════════════════════════════════════════════════
   VOICE INPUT
═══════════════════════════════════════════════════════════════ */
function toggleRecording(){ isRecording?stopRecording():startRecording(); }
function startRecording(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ sysBubble("Voice input not supported in this browser."); return; }
  recognition=new SR(); recognition.continuous=true; recognition.interimResults=true;
  recognition.onresult=e=>{
    let fin=""; for(let i=e.resultIndex;i<e.results.length;i++) if(e.results[i].isFinal) fin+=e.results[i][0].transcript;
    if(fin) setv("chatInput",getv("chatInput")+fin);
  };
  recognition.start(); isRecording=true;
  document.getElementById("btnMic").textContent="🔴";
  setLoriState("listening");
}
function stopRecording(){
  if(recognition) recognition.stop(); isRecording=false;
  document.getElementById("btnMic").textContent="🎤";
  setLoriState("ready");
}

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
function getv(id){ const el=document.getElementById(id); return el?el.value:""; }
function setv(id,v){ const el=document.getElementById(id); if(el&&v!==undefined) el.value=v||""; }
function esc(s){ const d=document.createElement("div"); d.textContent=String(s||""); return d.innerHTML; }
function escAttr(s){ return String(s||"").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function ctype(){ return {"Content-Type":"application/json"}; }
function nav_copy(t){ navigator.clipboard.writeText(t).catch(()=>{}); }
function appendOutput(label,text){
  const p=document.getElementById("outputPane"); if(!p) return;
  p.value+=`\n\n──── ${label} ────\n${text}`; p.scrollTop=p.scrollHeight;
  const b=document.getElementById("accDraft");
  if(b&&!b.classList.contains("open")) toggleAccordion("accDraft");
}
function copyDraftOutput(){ nav_copy(getv("outputPane")); sysBubble("↳ Notes copied."); }
