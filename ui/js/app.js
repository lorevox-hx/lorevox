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
  update71RuntimeUI();   // v7.1 — paint runtime badges on first load
  document.addEventListener("keydown", e => { if(e.key==="Escape" && isFocusMode) toggleFocus(); });
  // Step 3 (Task 6 audit): identityPhase starts as null in state.js.
  // getIdentityPhase74() handles null by checking hasIdentityBasics74():
  //   • returning user (has profile basics) → "complete" → correct pass routing
  //   • new user (no profile)               → "incomplete" → identity gate
  // The original `=== undefined` check was dead code (state.js uses null, not undefined).
  // No functional guard needed; null is the correct initial value for both paths.

  const saved = localStorage.getItem(LS_ACTIVE);
  if(saved){
    // Returning user — load their profile and skip onboarding.
    loadPerson(saved).catch(()=>{});
  } else {
    // v7.4D — Phase 6: no person selected yet.
    // Let Lori lead by starting the identity-first onboarding flow.
    // A small delay gives the WS connection time to establish so Lori's
    // first message goes out via the streaming path.
    setTimeout(startIdentityOnboarding, 800);
  }

  // Step 3 — log device context block on every session start for diagnostics.
  const _dc = {
    date:     new Intl.DateTimeFormat("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" }).format(new Date()),
    time:     new Intl.DateTimeFormat("en-US", { hour:"numeric", minute:"2-digit", hour12:true }).format(new Date()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  console.log("[device_context]", _dc);
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
   LORI STATUS  (v7.1 — state propagation patch)
═══════════════════════════════════════════════════════════════ */

/**
 * Normalize an incoming state label into canonical runtime values.
 * Everything in `runtime` is what prompt_composer.py will actually see.
 */
// Transitional UI-only states — badge updates only, never touch state.runtime
const _UI_ONLY_STATES = new Set(["thinking","drafting","listening"]);

function normalizeLoriState(input) {
  const raw = String(input || "").trim().toLowerCase();
  // Semantic runtime states — these propagate to the backend
  const map = {
    ready:       { badge:"Ready",        affectState:"neutral",       affectConfidence:0,    cognitiveMode:"open",        fatigueScore:0  },
    open:        { badge:"Open",         affectState:"neutral",       affectConfidence:0,    cognitiveMode:"open",        fatigueScore:0  },
    recognition: { badge:"recognition",  affectState:"confusion_hint",affectConfidence:0.65, cognitiveMode:"recognition", fatigueScore:Math.max(Number(state?.runtime?.fatigueScore||0),20) },
    grounding:   { badge:"grounding",    affectState:"distress_hint", affectConfidence:0.8,  cognitiveMode:"grounding",   fatigueScore:Math.max(Number(state?.runtime?.fatigueScore||0),40) },
    /* v7.2 — alongside: sustained confusion / fragmentation; reflection-only, no structured questions */
    alongside:   { badge:"alongside",   affectState:"distress_hint", affectConfidence:0.85, cognitiveMode:"alongside",   fatigueScore:Math.max(Number(state?.runtime?.fatigueScore||0),30) },
    light:       { badge:"light",        affectState:"fatigue_hint",  affectConfidence:0.6,  cognitiveMode:"light",       fatigueScore:Math.max(Number(state?.runtime?.fatigueScore||0),60) },
    high_fatigue:{ badge:"high_fatigue", affectState:"fatigue_hint",  affectConfidence:0.9,  cognitiveMode:"light",       fatigueScore:80 },
  };
  return map[raw] || null; // null = badge-only (transitional or unknown)
}

/**
 * Build the runtime71 block from live state.
 * This is the single source of truth for both ws.send() payloads.
 */
function buildRuntime71() {
  const current_pass = (typeof getCurrentPass==="function"?getCurrentPass():null)||state.session?.currentPass||"pass1";
  const current_era  = (typeof getCurrentEra==="function"?getCurrentEra():null)||state.session?.currentEra||null;
  const current_mode = (typeof getCurrentMode==="function"?getCurrentMode():null)||state.session?.currentMode||"open";

  // v7.4A — prefer real visual signal when fresh; fall back to synthetic affect.
  // Behavioral invariant: stale (>8s) or absent signal → visual_signals = null.
  // prompt_composer.py must treat null identically to camera-off.
  const vs                  = (state.session && state.session.visualSignals) || null;
  const baselineEstablished = !!(state.session && state.session.affectBaseline && state.session.affectBaseline.established);

  const hasFreshLiveAffect = !!(
    vs && vs.affectState && vs.timestamp && (Date.now() - vs.timestamp < 8000)
  );

  const affect_state      = hasFreshLiveAffect ? vs.affectState           : (state.runtime?.affectState||"neutral");
  const affect_confidence = hasFreshLiveAffect ? Number(vs.confidence||0) : Number(state.runtime?.affectConfidence||0);

  const visual_signals = hasFreshLiveAffect ? {
    affect_state:         vs.affectState,
    affect_confidence:    Number(vs.confidence||0),
    gaze_on_screen:       (vs.gazeOnScreen !== undefined) ? vs.gazeOnScreen : null,
    baseline_established: baselineEstablished,
    signal_age_ms:        Date.now() - vs.timestamp,
  } : null;

  return {
    current_pass,
    current_era,
    current_mode,
    affect_state,
    affect_confidence,
    cognitive_mode:  state.runtime?.cognitiveMode||null,
    fatigue_score:   Number(state.runtime?.fatigueScore||0),
    /* v7.2 — paired interview metadata */
    paired:          !!(state.interview?.paired),
    paired_speaker:  state.interview?.pairedSpeaker||null,
    /* v7.4A — real visual signal block; null = camera off or stale */
    visual_signals,
    /* v7.4D — assistant role for prompt routing */
    assistant_role:  getAssistantRole(),
    /* v7.4D Phase 6B — identity gating fields for prompt_composer.py */
    identity_complete: hasIdentityBasics74(),
    identity_phase:    getIdentityPhase74(),
    effective_pass:    getEffectivePass74(),
    /* v7.4E — speaker anchor: persists the user's name so Lori never drifts
       into confusing the speaker with a person mentioned in conversation */
    speaker_name: state.session?.speakerName || state.session?.identityCapture?.name || null,
    /* v7.4E — profile basics: DOB and birthplace for Pass 1 profile-seed context */
    dob: state.profile?.basics?.dob || state.session?.identityCapture?.dob || null,
    pob: state.profile?.basics?.pob || state.session?.identityCapture?.birthplace || null,
    /* v7.4E — profile seed tracking: what seed questions have been answered */
    profile_seed: state.session?.profileSeed || null,
    /* Step 3 — device context: local date, time, timezone.
       Gives Lori reliable temporal grounding on every turn.
       date/time are re-evaluated each call so they stay current. */
    device_context: {
      date:     new Intl.DateTimeFormat("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" }).format(new Date()),
      time:     new Intl.DateTimeFormat("en-US", { hour:"numeric", minute:"2-digit", hour12:true }).format(new Date()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    /* Step 3 — optional location context (city/region only, consent-gated).
       null when user has not opted in or location was unavailable.
       prompt_composer.py must never assume location is present. */
    location_context: state.session?.locationContext || null,
    /* Meaning Engine — memoir context for narrative-aware interview guidance.
       memoir_state: current panel state (empty | threads | draft).
       arc_roles_present: which narrative arc parts have been captured this session.
         prompt_composer.py uses this to identify narrative gaps and shape questions.
       Reads from the memoir panel DOM. Falls back gracefully if panel is not mounted. */
    memoir_context: (function() {
      try {
        const mState = (typeof _memoirState !== "undefined") ? _memoirState : "empty";
        const content = document.getElementById("memoirScrollContent");
        const arcRoles = content
          ? [...new Set(
              Array.from(content.querySelectorAll("mark.new-fact[data-narrative-role]"))
                .map(m => m.dataset.narrativeRole).filter(Boolean)
            )]
          : [];
        const meaningTags = content
          ? [...new Set(
              Array.from(content.querySelectorAll("mark.new-fact[data-meaning-tags]"))
                .flatMap(m => (m.dataset.meaningTags || "").split(",").map(t => t.trim()).filter(Boolean))
            )]
          : [];
        return { state: mState, arc_roles_present: arcRoles, meaning_tags_present: meaningTags };
      } catch (_) {
        return { state: "empty", arc_roles_present: [], meaning_tags_present: [] };
      }
    })(),
    /* Media Builder — photo count for Lori's contextual awareness.
       window._lv80MediaCount is updated by the gallery on every load/upload/delete. */
    media_count: (window._lv80MediaCount || 0),
  };
}

/**
 * Set Lori's operational state.
 * Propagates to state.runtime (→ prompt_composer) AND updates the UI badge.
 */
function setLoriState(s){
  const norm = normalizeLoriState(s);

  // Only semantic states update state.runtime.
  // Transitional states (thinking / drafting / listening) are badge-only
  // and must NEVER overwrite runtime values set by the user or affect engine.
  if (norm !== null) {
    if (!state.runtime) state.runtime = {};
    if (!state.session) state.session = {};
    state.runtime.affectState      = norm.affectState;
    state.runtime.affectConfidence = norm.affectConfidence;
    state.runtime.cognitiveMode    = norm.cognitiveMode;
    state.runtime.fatigueScore     = norm.fatigueScore;
    state.session.currentMode      = norm.cognitiveMode;
  }

  // UI badge
  const el=document.getElementById("loriStatus"); if(!el) return;
  el.className=`lori-status ${s}`;
  const builtIn={ready:"<div class='status-dot'></div> Ready",thinking:"<div class='status-dot'></div> Thinking",drafting:"<div class='status-dot'></div> Drafting",listening:"<div class='status-dot'></div> Listening"};
  const badgeLabel = norm ? norm.badge : s.charAt(0).toUpperCase()+s.slice(1);
  el.innerHTML=builtIn[s]||`<div class='status-dot'></div> ${badgeLabel}`;

  // Refresh any 7.1 UI elements
  if (typeof update71RuntimeUI==="function") update71RuntimeUI();
  if (window.LORI71?.updateBadges)           window.LORI71.updateBadges();
  if (window.LORI71?.updateDebugOverlay)     window.LORI71.updateDebugOverlay();

  console.log("[Lori 7.1] setLoriState →", s, "| runtime =", {
    affectState:      state.runtime.affectState,
    affectConfidence: state.runtime.affectConfidence,
    cognitiveMode:    state.runtime.cognitiveMode,
    fatigueScore:     state.runtime.fatigueScore,
  });
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
  // Toggle body class (used by lori73.css to control dev-only visibility)
  document.body.classList.toggle("lv73-dev-mode", devMode);
  // Also toggle hidden class for JS-controlled show/hide
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
    const items=j.items||j.people||j||[];
    renderPeople(items);
    // v8: cache for narrator card UI
    if (state?.narratorUi) {
      state.narratorUi.peopleCache = items;
    }
    // Cache for offline fallback
    try{ localStorage.setItem("lorevox_offline_people",JSON.stringify(items)); }catch{}
  }catch{
    // Offline fallback — read from localStorage cache
    try{
      const cached=localStorage.getItem("lorevox_offline_people");
      if(cached){ renderPeople(JSON.parse(cached)); return; }
    }catch{}
    renderPeople([]);
  }
}
function renderPeople(items){
  const w=document.getElementById("peopleList"); w.innerHTML="";
  // Filter to active narrators if lorevox_draft_pids is set
  const _aPids=JSON.parse(localStorage.getItem("lorevox_draft_pids")||"[]");
  const _items=_aPids.length>0?(items||[]).filter(p=>_aPids.includes(p.id||p.person_id)):items;
  (_items||[]).forEach(p=>{
    const pid=p.id||p.person_id||p.uuid; if(!pid) return;
    const name=p.display_name||p.name||pid;
    const d=document.createElement("div");
    d.className="sb-item"+(pid===state.person_id?" active":"");
    d.onclick=()=>loadPerson(pid);
    d.innerHTML=`<div class="font-bold text-white truncate" style="font-size:15px">${esc(name)}</div>
      <div class="sb-meta mono dev-only">${esc(pid.slice(0,16))}</div>`;
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
let _loadGeneration=0;
async function loadPerson(pid){
  const gen=++_loadGeneration;
  state.person_id=pid;
  document.getElementById("activePerson").textContent=`person_id: ${pid}`;
  localStorage.setItem(LS_ACTIVE,pid);
  // v7.4D ISSUE-16: update the always-visible active person indicator in the Lori dock.
  // The display_name is not available yet (profile loads below); update again after.
  _updateDockActivePerson();
  try{
    const r=await fetch(API.PROFILE(pid)); if(!r.ok) throw new Error();
    const j=await r.json();
    // Guard: only assign if this is still the active load (prevents race on rapid switch)
    if(gen!==_loadGeneration) return;
    state.profile=normalizeProfile(j.profile||j||{});
    profileSaved=true;
    // Cache for offline fallback
    try{ localStorage.setItem("lorevox_offline_profile_"+pid,JSON.stringify(state.profile)); }catch{}
  }catch{
    // Guard: bail if superseded
    if(gen!==_loadGeneration) return;
    // Offline fallback — read from localStorage cache
    try{
      const cached=localStorage.getItem("lorevox_offline_profile_"+pid);
      if(cached){ state.profile=normalizeProfile(JSON.parse(cached)); profileSaved=true; }
      else{ state.profile={basics:{},kinship:[],pets:[]}; profileSaved=false; }
    }catch{
      state.profile={basics:{},kinship:[],pets:[]};
      profileSaved=false;
    }
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
  _updateDockActivePerson(); // v7.4D ISSUE-16: update with real name now that profile is loaded
  await refreshPeople();
  onDobChange();
  updateSidebar();
  renderEventsGrid();
  // v7.1 — restore persisted timeline spine before rendering
  const _cachedSpine = loadSpineLocal(pid);
  if (_cachedSpine) {
    state.timeline.spine    = _cachedSpine;
    state.timeline.seedReady = true;
    if (!state.session.currentEra && _cachedSpine.periods?.length) {
      setEra(_cachedSpine.periods[0].label);
    }
    if (state.session.currentPass === "pass1") setPass("pass2a");
  }
  renderTimeline();
  updateContextTriggers();
  updateArchiveReadiness();
  updateObitIdentityCard(state.profile?.basics||{});
  // Update memoir source name
  const msn=document.getElementById("memoirSourceName");
  if(msn){ const n=state.profile?.basics?.preferred||state.profile?.basics?.fullname||"No person selected"; msn.textContent=n; }
  // Life Map — refresh after person load (view layer only, no state mutation)
  window.LorevoxLifeMap?.refresh();
  // Bio Builder — refresh per-narrator state when person switches
  window.LorevoxBioBuilder?.refresh();
}

/* ═══════════════════════════════════════════════════════════════
   v8 NARRATOR SWITCH SAFETY
   Central narrator switch with hard reset + hydration.
   Works even when Bio Builder popover is closed.
═══════════════════════════════════════════════════════════════ */
async function lvxSwitchNarratorSafe(pid){
  if (!pid) return;
  if (pid === state.person_id) return;

  // hard clear narrator-scoped UI before profile hydration
  if (window.LorevoxBioBuilder?.onNarratorSwitch) {
    window.LorevoxBioBuilder.onNarratorSwitch(pid);
  }

  // clear narrator-scoped visible UI
  try {
    document.getElementById("chatMessages").innerHTML = "";
  } catch (_) {}

  if (typeof _memoirClearContent === "function") _memoirClearContent();

  await loadPerson(pid);

  // run a second hydration after profile is loaded
  if (window.LorevoxBioBuilder?.onNarratorSwitch) {
    window.LorevoxBioBuilder.onNarratorSwitch(pid);
  }

  if (window.LorevoxBioBuilder?.refresh) window.LorevoxBioBuilder.refresh();
  if (window.LorevoxLifeMap?.render)     window.LorevoxLifeMap.render(true);
}

/* ═══════════════════════════════════════════════════════════════
   v8 NARRATOR DELETE FLOW
   Multi-step delete with backup + undo window.
═══════════════════════════════════════════════════════════════ */
function lvxBuildNarratorBackup(person){
  return {
    person,
    profile: JSON.parse(JSON.stringify(state.profile || {})),
    bioBuilder: JSON.parse(JSON.stringify(state.bioBuilder || {})),
    timestamp: Date.now()
  };
}

async function lvxGetDeleteInventory(pid){
  try{
    const r = await fetch(API.PERSON_INVENTORY(pid));
    if (!r.ok) return null;
    return await r.json();
  }catch(e){
    console.warn("[Lorevox] inventory fetch failed", e);
    return null;
  }
}

async function lvxStageDeleteNarrator(pid){
  const people = state?.narratorUi?.peopleCache || [];
  const person = people.find(p => (p.id||p.person_id||p.uuid) === pid);
  if (!person) return;

  // Fetch dependency inventory from backend
  const inv = await lvxGetDeleteInventory(pid);

  state.narratorDelete.targetId = pid;
  state.narratorDelete.targetLabel = person.display_name || person.name || pid;
  state.narratorDelete.confirmText = "";
  state.narratorDelete.step = 1;
  state.narratorDelete.backup = lvxBuildNarratorBackup(person);
  state.narratorDelete.inventory = inv ? inv.counts : null;
  window.lv80OpenDeleteDialog?.();
}

async function lvxDeleteNarratorConfirmed(){
  const pid = state?.narratorDelete?.targetId;
  if (!pid) return;
  if (state.narratorDelete.confirmText !== "DELETE") return;

  // Phase 2: use backend soft delete (preserves data, allows restore)
  try{
    const r = await fetch(API.PERSON(pid) + "?mode=soft", { method:"DELETE" });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.warn("[Lorevox] soft delete failed:", r.status, err);
    }
  }catch(e){
    console.warn("[Lorevox] delete narrator failed", e);
  }

  // Store deleted person_id for undo (backend restore uses original ID)
  state.narratorDelete.deletedPid = pid;

  // clear active pointer if needed
  if (state.person_id === pid) {
    state.person_id = null;
    localStorage.removeItem(LS_ACTIVE);
  }

  await refreshPeople();
  window.lv80CloseDeleteDialog?.();
  window.lv80ShowUndoDelete?.();
}

async function lvxUndoDeleteNarrator(){
  // Phase 2: use backend restore endpoint (no duplicate creation)
  const pid = state?.narratorDelete?.deletedPid;
  if (!pid) return;

  try{
    const r = await fetch(API.PERSON_RESTORE(pid), { method:"POST" });
    if (r.ok) {
      await refreshPeople();
      // Narrator is back — switch to it if nothing else is active
      if (!state.person_id) await lvxSwitchNarratorSafe(pid);
    } else {
      const err = await r.json().catch(() => ({}));
      console.warn("[Lorevox] restore failed:", r.status, err);
      // If undo_expired or other error, notify user
      if (err.detail) alert("Restore failed: " + err.detail);
    }
  }catch(e){
    console.warn("[Lorevox] undo narrator restore failed", e);
  }

  state.narratorDelete.deletedPid = null;
}

function normalizeProfile(p){
  const b=p.basics||p.basic||p.identity||{};
  return {
    basics:{fullname:b.fullname||"",preferred:b.preferred||"",dob:b.dob||"",
            pob:b.pob||"",culture:b.culture||"",country:b.country||"us",
            pronouns:b.pronouns||"",phonetic:b.phonetic||"",
            language:b.language||"",                           // v6.2 bilingual
            legalFirstName:b.legalFirstName||"",               // v8.0
            legalMiddleName:b.legalMiddleName||"",             // v8.0
            legalLastName:b.legalLastName||"",                 // v8.0
            timeOfBirth:b.timeOfBirth||"",                     // v8.0
            timeOfBirthDisplay:b.timeOfBirthDisplay||"",       // v8.0
            birthOrder:b.birthOrder||"",                       // v8.0
            birthOrderCustom:b.birthOrderCustom||"",           // v8.0
            zodiacSign:b.zodiacSign||"",                       // v8.0
            placeOfBirthRaw:b.placeOfBirthRaw||"",             // v8.0
            placeOfBirthNormalized:b.placeOfBirthNormalized||""},// v8.0
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
    // v7.1 — initialize timeline spine when DOB + birthplace are present
    if (getTimelineSeedReady()) {
      initTimelineSpine();
    }
    updateArchiveReadiness();
    // Life Map — refresh after profile save so spine changes are reflected
    window.LorevoxLifeMap?.refresh();
    // Bio Builder — refresh if open (no truth mutation; staging layer only)
    window.LorevoxBioBuilder?.refresh();
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

/* ── v8.0: Bio Builder → Profile sync bridge ── */
/**
 * Applies Bio Builder personal-section data to state.profile.basics
 * WITHOUT auto-promotion. Caller must explicitly invoke this.
 * Returns true if any field was updated, false otherwise.
 */
function applyBioBuilderPersonalToProfile(){
  if(!window.LorevoxBioBuilder?.buildCanonicalBasicsFromBioBuilder) return false;
  const canonical=window.LorevoxBioBuilder.buildCanonicalBasicsFromBioBuilder();
  if(!canonical) return false;
  if(!state.profile) state.profile=normalizeProfile({});
  const b=state.profile.basics;
  let changed=false;
  // Map bio builder → profile basics (only overwrite if bio builder has a value)
  const map={fullname:"fullname",preferred:"preferred",dob:"dob",pob:"pob",
             legalFirstName:"legalFirstName",legalMiddleName:"legalMiddleName",
             legalLastName:"legalLastName",
             timeOfBirth:"timeOfBirth",timeOfBirthDisplay:"timeOfBirthDisplay",
             birthOrder:"birthOrder",birthOrderCustom:"birthOrderCustom",
             zodiacSign:"zodiacSign",
             placeOfBirthRaw:"placeOfBirthRaw",placeOfBirthNormalized:"placeOfBirthNormalized"};
  for(const [bbKey,profKey] of Object.entries(map)){
    if(canonical[bbKey] && canonical[bbKey]!==b[profKey]){
      b[profKey]=canonical[bbKey]; changed=true;
    }
  }
  if(changed){
    // Hydrate hidden inputs so next scrapeBasics picks them up
    hydrateProfileForm();
  }
  return changed;
}

/* ── v7.4D ISSUE-16: Active person dock indicator ── */
function _updateDockActivePerson(){
  const el = document.getElementById("dockActivePerson");
  if(!el) return;
  const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname;
  if(state.person_id && name){
    el.textContent = `📘 ${name}`;
    el.style.display = "";
  } else if(state.person_id){
    el.textContent = "📘 Person loaded";
    el.style.display = "";
  } else {
    el.style.display = "none";
  }
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
  const seedReady = getTimelineSeedReady();
  const spineReady = !!state.timeline?.spine;
  const checks=[
    // v7.1 — timeline seed checks come first
    {label:"Date of birth added",        ok:!!b.dob},
    {label:"Birthplace added",            ok:!!b.pob},
    {label:"Timeline seed ready",         ok:seedReady},
    {label:"Pass 2A available",           ok:spineReady},
    // existing checks
    {label:"Pronouns set",                ok:!!b.pronouns},
    {label:"Family started",              ok:(state.profile?.kinship||[]).length>0},
    {label:"Profile saved",               ok:profileSaved},
  ];
  el.innerHTML=checks.map(c=>`
    <div class="readiness-item${c.ok?" ok":""}">
      <div class="readiness-dot ${c.ok?"ok":"miss"}"></div>
      <span>${c.label}</span>
      ${c.ok?'<span style="color:#4ade80;font-size:10px;margin-left:auto">✓</span>':''}
    </div>`).join("");
  // v7.1 — update Pass 2A badge if present
  const pass2aBadge = document.getElementById("pass2aAvailBadge");
  if (pass2aBadge) {
    pass2aBadge.className = spineReady ? "seed-badge" : "seed-badge pending";
    pass2aBadge.textContent = spineReady ? "Pass 2A — ready" : "Pass 2A — not ready";
  }
  if(!document.getElementById("pane-obituary")?.classList.contains("hidden"))
    updateObitIdentityCard(b);
}

function hydrateProfileForm(){
  const b=state.profile.basics||{};
  setv("bio_fullname",b.fullname); setv("bio_preferred",b.preferred);
  setv("bio_dob",b.dob);          setv("bio_pob",b.pob);
  setv("bio_culture",b.culture||""); setv("bio_phonetic",b.phonetic||"");
  // v8.0 bio builder extended fields
  setv("bio_legalFirstName",b.legalFirstName||"");
  setv("bio_legalMiddleName",b.legalMiddleName||"");
  setv("bio_legalLastName",b.legalLastName||"");
  setv("bio_timeOfBirth",b.timeOfBirth||"");
  setv("bio_timeOfBirthDisplay",b.timeOfBirthDisplay||"");
  setv("bio_birthOrder",b.birthOrder||"");
  setv("bio_birthOrderCustom",b.birthOrderCustom||"");
  setv("bio_zodiacSign",b.zodiacSign||"");
  setv("bio_placeOfBirthRaw",b.placeOfBirthRaw||"");
  setv("bio_placeOfBirthNormalized",b.placeOfBirthNormalized||"");
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
    language:langSel?langSel.value:"",                         // v6.2 bilingual
    legalFirstName:getv("bio_legalFirstName")||"",              // v8.0
    legalMiddleName:getv("bio_legalMiddleName")||"",            // v8.0
    legalLastName:getv("bio_legalLastName")||"",                // v8.0
    timeOfBirth:getv("bio_timeOfBirth")||"",                    // v8.0
    timeOfBirthDisplay:getv("bio_timeOfBirthDisplay")||"",      // v8.0
    birthOrder:getv("bio_birthOrder")||"",                      // v8.0
    birthOrderCustom:getv("bio_birthOrderCustom")||"",          // v8.0
    zodiacSign:getv("bio_zodiacSign")||"",                      // v8.0
    placeOfBirthRaw:getv("bio_placeOfBirthRaw")||"",            // v8.0
    placeOfBirthNormalized:getv("bio_placeOfBirthNormalized")||"" // v8.0
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
  if(!dob){ if(gb) gb.classList.add("hidden"); if(ad) ad.classList.add("hidden"); return; }
  const y=parseInt(dob.split("-")[0]); if(isNaN(y)) return;
  const age=new Date().getFullYear()-y;
  const gen=detectGeneration(y);
  if(gen && gb){ gb.textContent=gen.name; gb.classList.remove("hidden"); }
  if(ad){ ad.textContent=`~${age} years old`; ad.classList.remove("hidden"); }
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
      ${["Mother","Father","Sister","Brother","Half-sister","Half-brother","Stepsister","Stepbrother","Sibling","Spouse","Partner","Child","Step-parent","Step-child","Adoptive parent","Adoptive mother","Adoptive father","Adopted child","Grandparent","Grandmother","Grandfather","Grandchild","Nephew","Niece","Cousin","Aunt","Uncle","Former spouse","Guardian","Chosen family","Other"]
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
   PHASE 6B — IDENTITY GATING HELPERS
   These three functions let buildRuntime71() emit an effective_pass
   that the backend can use to gate Pass 1 directives until identity
   is fully established.  This stops the "empathy → abrupt DOB ask"
   pattern seen in Tests 7 & 8.
═══════════════════════════════════════════════════════════════ */

/** True once name + DOB + birthplace are all non-empty in profile basics. */
function hasIdentityBasics74() {
  if (typeof state === "undefined") return false;
  const b = state.profile?.basics || {};
  const name = (b.preferred || b.fullname || b.name || "").trim();
  const dob  = (b.dob || "").trim();
  const pob  = (b.pob || b.birthplace || "").trim();
  return !!(name && dob && pob);
}

/**
 * Returns the onboarding sub-phase string, or:
 *   "complete"   — identity fully established
 *   "incomplete" — identity not yet established (no active sub-phase)
 */
function getIdentityPhase74() {
  if (typeof state === "undefined") return "unknown";
  const p = state.session?.identityPhase;
  if (p) return p;
  return hasIdentityBasics74() ? "complete" : "incomplete";
}

/**
 * Returns "identity" while identity is not complete, otherwise returns
 * the current interview pass (defaulting to "pass1").
 * Used by buildRuntime71() to emit the effective_pass field.
 */
function getEffectivePass74() {
  if (typeof state === "undefined") return "identity";
  const phase = getIdentityPhase74();
  if (phase && phase !== "complete") return "identity";
  if (!hasIdentityBasics74()) return "identity";
  return state.session?.currentPass || "pass1";
}

/* ═══════════════════════════════════════════════════════════════
   IDENTITY-FIRST ONBOARDING  (v7.4D — Phase 6)
   State machine: null → askName → askDob → askBirthplace
                  → resolving → complete
   Lori leads. No forms. The archive builds from what the user says.
═══════════════════════════════════════════════════════════════ */

/**
 * Kick off identity onboarding.
 * Sets Lori to 'onboarding' role and sends the first greeting via Lori's
 * voice so the user experiences it as a natural conversation, not a form.
 */
function startIdentityOnboarding(){
  // Step 3 diagnostic — confirms auto-start fired; visible in DevTools.
  console.log("[onboarding] startIdentityOnboarding() — new user path, phase=askName");
  state.session.identityPhase   = "askName";
  state.session.identityCapture = { name: null, dob: null, birthplace: null };
  // v7.4E — profile seed tracking: records which of the 10 seed questions have been answered.
  // Keys map to the 10 profile-seed questions in the Pass 1 directive.
  // null = not yet asked; true = answered (from any source — explicit or conversational).
  state.session.profileSeed = {
    childhood_home: null,
    siblings:       null,
    parents_work:   null,
    heritage:       null,
    education:      null,
    military:       null,
    career:         null,
    partner:        null,
    children:       null,
    life_stage:     null,
  };
  setAssistantRole("onboarding");
  // v7.4E — Tell Lori to briefly explain WHY she needs the three anchors before asking.
  // This sets expectations, builds trust, and gets more accurate answers.
  sendSystemPrompt(
    "[SYSTEM: Begin the identity onboarding sequence. " +
    "Introduce yourself as Lori. " +
    "You may briefly share what your name means — Lorevox: 'Lore' means stories and oral tradition, " +
    "'Vox' is Latin for voice, so Lorevox means the voice of your stories. Lori is your nickname from that. " +
    "Explain that your purpose is to help them build a Life Archive — a lasting record of their life story " +
    "told in their own voice. " +
    "Then explain you need just three things to get started: their name, their date of birth, and where they were born. " +
    "These three anchors let you build a personal life timeline so you can guide the conversation " +
    "in the right order and ask the most meaningful questions. " +
    "Tell them you will ask for each one separately — it will only take a moment. " +
    "Then ask for their preferred name. " +
    "Keep the whole message warm, brief, and conversational. Two to four sentences at most. " +
    "Do not lecture. Do not list. Make it feel like the beginning of a real conversation.]"
  );
}

/**
 * Extract a plausible date of birth from a free-text answer.
 * Accepts: "December 24 1962", "12/24/1962", "1962-12-24",
 *          "born in '62", "December 1962", "just 1962".
 * Returns an ISO date string "YYYY-MM-DD" or null.
 */
function _parseDob(text){
  const t = text.trim();
  // Full ISO or US date
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if(m) return `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  // Month name forms: "December 24, 1962" / "24 December 1962"
  const MONTHS = {january:"01",february:"02",march:"03",april:"04",may:"05",
    june:"06",july:"07",august:"08",september:"09",october:"10",november:"11",december:"12"};
  const lower = t.toLowerCase();
  for(const [name,num] of Object.entries(MONTHS)){
    const re1 = new RegExp(name+"\\s+(\\d{1,2})[,\\s]+(\\d{4})");
    const re2 = new RegExp("(\\d{1,2})\\s+"+name+"[,\\s]+(\\d{4})");
    const re3 = new RegExp(name+"[,\\s]+(\\d{4})");
    let mm;
    if((mm=lower.match(re1))) return `${mm[2]}-${num}-${mm[1].padStart(2,"0")}`;
    if((mm=lower.match(re2))) return `${mm[2]}-${num}-${mm[1].padStart(2,"0")}`;
    if((mm=lower.match(re3))) return `${mm[1]}-${num}-01`;  // partial date — day unknown
  }
  // Short year forms: "born in '62", "born 1962", just "1962"
  // Apostrophe-short form first: '62 → 1962, '38 → 1938 (years 00–29 = 2000s, 30–99 = 1900s)
  m = t.match(/'(\d{2})\b/);
  if(m){ const y=parseInt(m[1]); return `${y<30?2000+y:1900+y}-01-01`; }
  m = t.match(/\b(19\d{2}|20[0-2]\d)\b/);
  if(m) return `${m[1]}-01-01`;
  return null;
}

/**
 * Advance the identity state machine based on the user's reply.
 * Called at the TOP of sendUserMessage() before anything else.
 * Returns true when the machine is active and consumed the message.
 */
async function _advanceIdentityPhase(text){
  const phase = state.session?.identityPhase;
  if(!phase || phase === "complete") return false;
  if(phase === "resolving") return true; // waiting for API — swallow input

  if(phase === "askName"){
    // v7.4D BUG-FIX: Do not extract a name from an emotional or non-name response.
    // Common-word guard: single-word replies that are NOT valid names.
    const _NOT_A_NAME = new Set([
      "that","it","i","the","a","an","this","there","here","yes","no","yeah","nope",
      "okay","ok","well","so","hi","hello","hey","oh","ah","uh","um","my","mine",
      "what","when","where","why","how","who","which","they","we","you","he","she",
      "just","not","but","and","or","if","then","was","were","is","am","are",
      "had","have","has","did","do","does","would","could","should","will","can",
    ]);
    // Emotional-content guard: message looks like a statement, not a name
    const _EMOTIONAL_MARKERS = /\b(hard|difficult|sad|scared|lost|hurt|pain|grief|suffered|struggling|terrible|awful|horrible|tough|heartbroken|afraid|worried|anxious|miss|missed|died|death|trauma|abuse|alone|lonely|crying|tears|broke|broken|never|always|sometimes|really|very|so much)\b/i;

    // v7.4E — Structured name extraction: try "my [adj] name is X", "call me X",
    // "I go by X" patterns BEFORE falling back to first-word extraction.
    // This handles long sentences like "My special name is Chris or guch by my wife".
    // We extract only the FIRST name after the pattern — before any "or/and/by/from".
    const _namePatterns = [
      /\bmy\s+(?:\w+\s+)*name\s+is\s+([A-Za-z][a-z'-]+)/i,     // "my name is X", "my special name is X"
      /\bcall\s+me\s+([A-Za-z][a-z'-]+)/i,                       // "call me X"
      /\bi(?:'m|\s+am)\s+(?:called\s+)?([A-Za-z][a-z'-]+)/i,    // "I'm X", "I am X", "I am called X"
      /\bi\s+go\s+by\s+([A-Za-z][a-z'-]+)/i,                    // "I go by X"
      /\byou\s+can\s+call\s+me\s+([A-Za-z][a-z'-]+)/i,          // "you can call me X"
      /\bprefer(?:red)?\s+(?:name\s+is\s+|to\s+be\s+called\s+)?([A-Za-z][a-z'-]+)/i, // "preferred name is X"
    ];
    let patternName = null;
    if (!_EMOTIONAL_MARKERS.test(text)) {
      for (const pat of _namePatterns) {
        const m = text.match(pat);
        if (m && m[1] && !_NOT_A_NAME.has(m[1].toLowerCase()) && m[1].length >= 2) {
          patternName = m[1];
          // Capitalize first letter
          patternName = patternName.charAt(0).toUpperCase() + patternName.slice(1);
          break;
        }
      }
    }

    const words = text.trim().split(/\s+/);
    const isEmotional = _EMOTIONAL_MARKERS.test(text);
    const isLongSentence = words.length > 4;

    let name = null;
    if (patternName) {
      // Structured extraction succeeded — use it even for long sentences
      name = patternName;
    } else {
      // Fallback: first-word extraction (works for short direct answers like "Christopher")
      const candidate = words[0].replace(/[^a-zA-Z'\-]/g, "").trim();
      const isCommonWord = _NOT_A_NAME.has(candidate.toLowerCase());
      if (isEmotional || isLongSentence || isCommonWord || !candidate) {
        // Not a name answer — let it flow through to the LLM (IDENTITY MODE directive handles it)
        return false;
      }
      name = candidate;
    }
    state.session.identityCapture.name = name;
    state.session.speakerName = name;  // v7.4E — persist for runtime71 anchor
    state.session.identityPhase = "askDob";
    // Lori acknowledges and asks for DOB
    sendSystemPrompt(
      `[SYSTEM: SPEAKER IDENTITY — The person you are interviewing is named "${name}". ` +
      `You are Lori, the interviewer. These are two different people. ` +
      `If anyone named "Lori" appears in their story, that is a different person — not you. ` +
      `Use "${name}" when addressing or referring to the speaker. ` +
      `Now: acknowledge their name warmly (use it once). ` +
      `Then ask for their date of birth — explain it helps place their story in time. One question only.]`
    );
    return true;
  }

  if(phase === "askDob"){
    const dob = _parseDob(text);
    state.session.identityCapture.dob = dob;  // may be null if unrecognised
    state.session.identityPhase = "askBirthplace";
    sendSystemPrompt(
      `[SYSTEM: The user gave their date of birth as "${text.trim()}". ` +
      `${dob ? "You have parsed it as "+dob+"." : "The date wasn't entirely clear but that's okay — continue."} ` +
      `Acknowledge naturally (brief, warm). ` +
      `Then ask where they were born — town, city, or region, whatever they remember. ` +
      `One question only.]`
    );
    return true;
  }

  if(phase === "askBirthplace"){
    const birthplace = text.trim();
    state.session.identityCapture.birthplace = birthplace;
    state.session.identityPhase = "resolving";
    // Create the person record now that we have the three anchors
    await _resolveOrCreatePerson();
    return true;
  }

  return false;
}

/**
 * Create a new person in the backend using the three captured identity anchors,
 * then load them so the app is in a ready state.
 * Sets identityPhase to "complete" when done.
 */
async function _resolveOrCreatePerson(){
  const ic   = state.session.identityCapture;
  const name = ic.name || "Unnamed";
  const dob  = ic.dob  || null;
  const pob  = ic.birthplace || null;

  // Patch state.profile so the form reflects what Lori captured
  if(!state.profile) state.profile = {basics:{}, kinship:[], pets:[]};
  state.profile.basics.preferred  = name;
  state.profile.basics.fullname   = name;
  if(dob) state.profile.basics.dob = dob;
  if(pob) state.profile.basics.pob = pob;
  hydrateProfileForm();

  let pid = null;
  try{
    const r = await fetch(API.PEOPLE, {
      method: "POST",
      headers: ctype(),
      body: JSON.stringify({
        display_name: name,
        role:         "subject",
        date_of_birth: dob  || null,
        place_of_birth: pob || null,
      }),
    });
    const j = await r.json();
    pid = j.id || j.person_id;
  }catch(e){
    console.warn("[identity] create person failed:", e);
  }

  state.session.identityPhase = "complete";
  setAssistantRole("interviewer");
  // v7.5 hook — lets lori7.5.html update capture UI without modifying this file.
  if (typeof window._onIdentityComplete === "function") {
    window._onIdentityComplete({ name, dob, pob: pob || ic.birthplace });
  }

  if(pid){
    await loadPerson(pid);
    // v7.4D BUG-B1: loadPerson fetches the server profile (still empty at this point)
    // and overwrites state.profile.basics. Re-apply the captured identity anchors
    // before saveProfile() so the correct values are persisted.
    if(ic.name)      { state.profile.basics.preferred = ic.name; state.profile.basics.fullname = ic.name; }
    if(ic.dob)         state.profile.basics.dob = ic.dob;
    if(ic.birthplace)  state.profile.basics.pob = ic.birthplace;
    hydrateProfileForm();
    _updateDockActivePerson();
    // Save the profile so DOB + birthplace persist
    await saveProfile();
    sendSystemPrompt(
      `[SYSTEM: You have successfully captured ${name}'s identity. ` +
      `They were born in ${pob || "an unspecified location"}. ` +
      `Acknowledge their birthplace warmly (one sentence — mention it by name). ` +
      `Then transition naturally into the memoir interview by asking one open, inviting ` +
      `question about their earliest memory or childhood. Two sentences total. ` +
      `Do not mention any technical steps or form saving.]`
    );
  } else {
    // Backend unavailable — still set up local state
    sysBubble(`Welcome, ${name}! (Profile saved locally — connect the server to persist it.)`);
    sendSystemPrompt(
      `[SYSTEM: The user's name is ${name}. ` +
      `Acknowledge you're ready to begin their memoir, then ask your first interview question.]`
    );
  }
}

/* ═══════════════════════════════════════════════════════════════
   CHAT — WS primary, SSE fallback
═══════════════════════════════════════════════════════════════ */
function onChatKey(e){ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendUserMessage(); } }

// v7.4D — Help-intent keywords. Any of these in the user's message switches Lori
// to helper mode for that response. She answers the product question directly and
// does not continue the interview until the helper exchange is resolved.
const _HELP_KEYWORDS = [
  "how do i","how do you","how can i","how should i",
  "where do i","where is the","where can i",
  "what does this","what is this","what does the",
  "why didn't","why doesn't","why can't","why won't","why isn't",
  "help me use","help me with","help me understand",
  "i don't understand","i can't find","i'm confused",
  "how to save","how to create","how to start","how to use",
  "what tab","which tab","what button","which button",
  "how does lori","what is lori",
];

function _isHelpIntent(text){
  const t=text.toLowerCase();
  return _HELP_KEYWORDS.some(k=>t.includes(k));
}

async function sendUserMessage(){
  unlockAudio();
  const text=getv("chatInput").trim(); if(!text) return;
  // v7.4D — Phase 7: capture for post-reply fact extraction.
  _lastUserTurn = text;
  // v7.4D — stop recording immediately on send so we don't capture background
  // audio or Lori's incoming response. Mic stays off; user re-enables when ready.
  if(isRecording) stopRecording();

  // v7.4D — Phase 6: identity-first onboarding state machine.
  // Route through identity extractor. If _advanceIdentityPhase returns true,
  // the message was handled (phase advanced, system prompt injected) — return.
  // If it returns false, the message was emotional/non-answer content —
  // fall through to the normal LLM flow so IDENTITY MODE directive can respond.
  let _bubbleAlreadyAdded = false;
  if(state.session?.identityPhase && state.session.identityPhase !== "complete"){
    setv("chatInput",""); appendBubble("user",text);
    _bubbleAlreadyAdded = true;
    const _handled = await _advanceIdentityPhase(text);
    if(_handled) return;
    // Not handled — fall through to normal chat path with IDENTITY MODE active.
  }

  // v7.4D — helper-mode detection. If the user appears to be asking how to use
  // the app, switch Lori to helper role for this turn. The role resets to
  // "interviewer" in onAssistantReply() after Lori's response lands.
  if(_isHelpIntent(text) && getAssistantRole()==="interviewer"){
    setAssistantRole("helper");
  }

  if(!_bubbleAlreadyAdded){ setv("chatInput",""); appendBubble("user",text); }
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
    // v7.1: capture runtime71 BEFORE setLoriState("thinking") so transitional
    // badge updates never wipe semantic state (fatigue, cognitive mode, etc.)
    const _rt71 = buildRuntime71();
    setLoriState("thinking");
    currentAssistantBubble=null;
    // v7.1 — auto cognitive mode detection before send
    try {
      if (window.LORI71 && window.LORI71.CognitiveAuto) {
        const _caResult = window.LORI71.CognitiveAuto.processUserTurn(text||"");
        console.log("[Lori 7.1] cognitive auto:", _caResult.mode, "("+_caResult.reason+")");
      }
    } catch(e) {}
    console.log("[Lori 7.1] runtime71 → model:", JSON.stringify(_rt71, null, 2));
    ws.send(JSON.stringify({type:"start_turn",session_id:state.chat.conv_id||"default",
      message:payload,params:{person_id:state.person_id,temperature:0.7,max_new_tokens:512,runtime71:_rt71}}));
    // Safety timeout: if no response within 30s, unstick the UI
    setTimeout(()=>{
      if(!currentAssistantBubble){
        // No bubble created yet means no tokens arrived at all
        const _errBubble = appendBubble("ai","Chat service unavailable — start or restart the Lorevox AI backend to enable responses.");
        setLoriState("ready");
      }
    }, 30000);
    return;
  }
  await streamSse(payload);
}

async function sendSystemPrompt(instruction){
  const bubble=appendBubble("ai","…");
  if(ws&&wsReady&&!usingFallback){
    const _rt71sys = buildRuntime71(); // capture before thinking resets badge
    setLoriState("thinking");
    currentAssistantBubble=bubble;
    console.log("[Lori 7.1] runtime71 (sys) → model:", JSON.stringify(_rt71sys, null, 2));
    ws.send(JSON.stringify({type:"start_turn",session_id:state.chat.conv_id||"default",
      message:instruction,params:{person_id:state.person_id,temperature:0.7,max_new_tokens:512,runtime71:_rt71sys}}));
    // Safety timeout: if no response within 30s, unstick the UI
    setTimeout(()=>{
      if(currentAssistantBubble===bubble && _bubbleBody(bubble)?.textContent==="…"){
        console.warn("[sendSystemPrompt] 30s timeout — no response from backend");
        _bubbleBody(bubble).textContent="Chat service unavailable — start or restart the Lorevox AI backend to enable responses.";
        setLoriState("ready");
        currentAssistantBubble=null;
      }
    }, 30000);
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
  // v6.3: disambiguation and birthplace rules baked into every system prompt
  const _rules=`

IMPORTANT INTERVIEW RULES:
1. DATE DISAMBIGUATION — When someone uses numbers to describe family members (e.g. "my brothers were 60 and 61", "born in '38 and '40", "she's 68"), do NOT assume these are current ages. If the person was born in a year that makes the numbers plausible as birth years (e.g. speaker born 1962, says "brothers 60 and 61" → likely birth years 1960 and 1961), treat them as birth years. When genuinely ambiguous, ask once: "Just to confirm — do you mean they were born in 1960 and 1961, or that they are currently 60 and 61 years old?" Never record an assumed age as fact without confirmation.
2. BIRTHPLACE vs. CHILDHOOD — If the person says they moved away from their birthplace in infancy or very early childhood (before age 4), do NOT ask for memories from the birthplace. Their meaningful early memories will be from where they were raised. Ask about the place they grew up in, not where they were born.
3. BIRTH YEARS — Always distinguish between a birth year and a current age. When collecting data for siblings, children, or parents, explicitly note whether a number is a birth year or an age.`;
  const sys=`You are Lori, a warm oral historian and memoir biographer working for Lorevox.${_langNote}${_rules} PROFILE_JSON: ${JSON.stringify({person_id:state.person_id,profile:state.profile})}`;
  const body={messages:[{role:"system",content:sys},{role:"user",content:text}],
    temp:0.7,max_new:512,conv_id:state.chat.conv_id||"default"};
  let full="";
  try{
    const res=await fetch(API.CHAT_SSE,{method:"POST",headers:ctype(),body:JSON.stringify(body)});
    if(!res.ok) throw new Error("SSE error "+res.status);
    const reader=res.body.getReader(); const dec=new TextDecoder();
    setLoriState("drafting");
    let _sseError = null;
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      for(const line of dec.decode(value,{stream:true}).split("\n")){
        if(!line.trim()) continue;
        try{
          const d=JSON.parse(line.replace(/^data:\s*/,""));
          if(d.error){
            // Backend sent an error (CUDA_OOM, generation_error, etc.)
            _sseError = d;
            console.error("[SSE] backend error:", d.error, d.message);
          } else if(d.delta||d.text){
            full+=(d.delta||d.text); _bubbleBody(bubble).textContent=full;
            document.getElementById("chatMessages").scrollTop=99999;
          }
        }catch{}
      }
    }
    if(_sseError && !full){
      // Error with no generated text — show user-friendly message
      if(_sseError.error==="CUDA_OOM"){
        _bubbleBody(bubble).textContent="GPU memory was full. VRAM has been freed — try sending your message again.";
      } else {
        _bubbleBody(bubble).textContent="Chat error: " + (_sseError.message||"unknown backend error") + ". Try again.";
      }
    } else {
      onAssistantReply(full);
      if(full && !text.startsWith("[SYSTEM:")){
        setv("ivAnswer",full);
        captureState="captured";
        renderCaptureChip();
      }
      if(obitDraftType==="lori_pending"){ setObitDraftType("lori"); }
    }
    setLoriState("ready");
  }catch(err){
    console.error("[SSE] streamSse failed:", err);
    _bubbleBody(bubble).textContent="Chat service unavailable — start the Lorevox backend to enable AI responses.";
    setLoriState("ready");
  }
}

function onAssistantReply(text){
  if(!text) return;
  lastAssistantText=text;
  document.getElementById("lastAssistantPanel").textContent=text;
  enqueueTts(text);
  // v7.4D — after one helper exchange, return Lori to interviewer role.
  // This means the next user message will go back to normal interview mode
  // unless another help intent is detected.
  // NOTE: do NOT reset 'onboarding' — _advanceIdentityPhase manages that role.
  if(getAssistantRole()==="helper"){
    setAssistantRole("interviewer");
  }
  // v7.4D — Phase 7: fire-and-forget fact extraction after each real turn.
  // Only runs when a person is loaded and onboarding is complete.
  if(state.person_id && (!state.session?.identityPhase || state.session.identityPhase==="complete")){
    _extractAndPostFacts(_lastUserTurn, text).catch(()=>{});
  }
}

/* ═══════════════════════════════════════════════════════════════
   PHASE 7 — FACT EXTRACTION  (v7.4D)
   Pattern-based extraction from user turns. Runs client-side so
   it never blocks the LLM or the chat. Results are posted to
   /api/facts/add and are immediately available in the Facts tab.
   The user never sees this happening — it just works.
═══════════════════════════════════════════════════════════════ */

// ── Meaning signal patterns (Phase A — meaning infrastructure) ─────────────
// These are probabilistic — over-tagging is worse than under-tagging.
// Patterns detect signal categories; they do not attempt semantic parsing.

const _LV80_STAKES_RX = /\b(almost lost|had to leave|no choice|had no choice|everything (was |at )risk|couldn'?t afford|going to lose|things got bad|had to decide|there was no (way|choice)|we were going to|forced to|had to get out|at stake|couldn'?t go on|had to fight|had no other)\b/i;

const _LV80_VULNERABILITY_RX = /\b(divorced|divorce|estranged|estrangement|all alone|left me|she left|he left|they left|never came back|didn'?t know how to tell|never told (him|her)|fell apart|broke apart|no one (was there|cared)|nobody (was there|cared)|I was alone|felt abandoned|she (was gone|left us)|he (was gone|left us)|never talked about it)\b/i;

const _LV80_TURNING_POINT_RX = /\b(changed (my|our|everything|it all)|never the same|from that (day|moment|point) on|that was when|everything changed|changed (forever|my life)|after that (everything|nothing|it all)|that'?s when (I|we|it all|everything))\b/i;

const _LV80_IDENTITY_RX = /\b(I became|I was no longer|that'?s when I became|I realized (who|what) I (was|am)|found (myself|my place)|I stopped being|I started to become|I (was|am) (a different|a new) person|had to become|became the person)\b/i;

const _LV80_LOSS_RX = /\b(passed away|died|lost (my|her|him|them|our)|death of|the day (she|he|they) (died|left|passed)|never saw (her|him|them) again|gone forever|I lost (my|her|him|them)|we lost)\b/i;

const _LV80_BELONGING_RX = /\b(finally felt|belonged|my people|felt at home|fit in|first time I (felt|belonged|fit)|found my place|where I belonged|felt like I (was )?home|felt like I belonged)\b/i;

const _LV80_REFLECTION_RX = /\b(I know now|looking back|in retrospect|I understand now|I realize now|now I (see|understand|know)|I can see now|all these years later|I'?ve come to (understand|realize|see|know)|what I know now|thinking back|from this distance|with hindsight|years later I)\b/i;

function _lv80DetectMeaningTags(text) {
  const tags = [];
  if (_LV80_STAKES_RX.test(text))        tags.push("stakes");
  if (_LV80_VULNERABILITY_RX.test(text)) tags.push("vulnerability");
  if (_LV80_TURNING_POINT_RX.test(text)) tags.push("turning_point");
  if (_LV80_IDENTITY_RX.test(text))      tags.push("identity");
  if (_LV80_LOSS_RX.test(text))          tags.push("loss");
  if (_LV80_BELONGING_RX.test(text))     tags.push("belonging");
  return tags;
}

// Map meaning signals and fact_type to a narrative role.
// Text-based signals take priority over structural fact_type defaults.
function _lv80DetectNarrativeRole(text, factType) {
  if (_LV80_REFLECTION_RX.test(text))    return "reflection";
  if (_LV80_TURNING_POINT_RX.test(text)) return "climax";
  if (_LV80_STAKES_RX.test(text))        return "escalation";
  if (_LV80_LOSS_RX.test(text))          return "climax";
  switch (factType) {
    case "birth":               return "setup";
    case "family_relationship": return "setup";
    case "education":           return "setup";
    case "employment_start":    return "setup";
    case "marriage":            return "inciting";
    case "residence":           return "inciting";
    case "employment_end":      return "resolution";
    case "death":               return "climax";
    default:                    return null;
  }
}

// Phase B — dual persona: separate "you then" (experience) from "you now" (reflection).
// A turn with reflection language gets reflection field populated; experience left null.
// A turn without reflection language gets experience populated; reflection left null.
function _lv80DetectDualPersona(text) {
  const isReflection = _LV80_REFLECTION_RX.test(text);
  return {
    experience: isReflection ? null : text.slice(0, 300),
    reflection: isReflection ? text.slice(0, 300) : null,
  };
}

/**
 * Extract atomic facts from a single exchange (user turn + Lori's reply).
 * Returns an array of fact objects ready to POST to /api/facts/add.
 * Each fact includes meaning_tags, narrative_role, experience, and reflection
 * fields (Meaning Engine Phase A+B).
 */
function _extractFacts(userText, loriText){
  const facts = [];
  const src   = (userText||"").trim();
  const t     = src.toLowerCase();
  const pid   = state.person_id;
  if(!pid || !src) return facts;

  const sid = state.chat?.conv_id || null;

  const _f = (statement, fact_type, date_text="", date_normalized="", confidence=0.7) => {
    const meaning_tags   = _lv80DetectMeaningTags(src);
    const narrative_role = _lv80DetectNarrativeRole(src, fact_type);
    const persona        = _lv80DetectDualPersona(src);
    return {
      person_id: pid, statement, fact_type,
      date_text, date_normalized, confidence,
      status: "extracted", inferred: false,
      session_id: sid,
      meaning_tags,
      narrative_role,
      experience: persona.experience,
      reflection: persona.reflection,
      meta: { source: "chat_extraction", user_turn: src.slice(0,200) },
    };
  };

  // ── Birthplace ───────────────────────────────────────────────
  // Capture "City" or "City, Country" format.
  // Pattern A: "born/grew up ... in/at/near City[, Country]"
  // Pattern B: "I'm/I am from City[, Country]" (no in/at/near needed)
  let m;
  const _PLACE_CAP = /([A-Z][^,.!?]{1,35}(?:,\s*[A-Z][^,.!?]{1,30})?)/;
  m = src.match(new RegExp(
    String.raw`\b(?:born|grew up)[^.!?]{0,8}(?:in|at|near)\s+` + _PLACE_CAP.source, "i"
  ));
  if(!m) m = src.match(new RegExp(
    String.raw`\bI(?:'m| am)\s+(?:originally\s+)?from\s+` + _PLACE_CAP.source, "i"
  ));
  if(!m) m = src.match(new RegExp(
    String.raw`\boriginally\s+from\s+` + _PLACE_CAP.source, "i"
  ));
  if(m){ const place = m[1].trim(); facts.push(_f(`Born or raised in ${place}`, "birth", place, "", 0.75)); }

  // ── Date of birth ─────────────────────────────────────────────
  m = src.match(/\b(?:born on|born)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:[,\s]+\d{4})?|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
  if(m){
    const dob = _parseDob(m[1]) || m[1];
    facts.push(_f(`Date of birth: ${m[1].trim()}`, "birth", m[1].trim(), dob, 0.85));
  }

  // ── Marriage ─────────────────────────────────────────────────
  m = src.match(/\b(?:married|got married to|my (?:husband|wife|spouse) is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if(m) facts.push(_f(`Married ${m[1].trim()}`, "marriage", "", "", 0.7));

  // ── Children ─────────────────────────────────────────────────
  m = src.match(/\b(?:my (?:son|daughter|child|kids?|children|boy|girl))[^.!?]{0,20}(?:name(?:d|s)?|is|are|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if(m) facts.push(_f(`Child named ${m[1].trim()}`, "family_relationship", "", "", 0.65));

  // ── Employment ────────────────────────────────────────────────
  m = src.match(/\b(?:worked (?:at|for)|worked as|(?:a |an )?(?:job|career) (?:at|with)|employed (?:at|by)|I was (?:a|an|the))\s+([^.!?,]{3,60})/i);
  if(m) facts.push(_f(`Worked: ${m[1].trim()}`, "employment_start", "", "", 0.65));

  m = src.match(/\bI(?:'ve)? (?:been |)(?:retired|retiring|left)\s+(?:from\s+)?([^.!?,]{3,60})/i);
  if(m) facts.push(_f(`Retired or left: ${m[1].trim()}`, "employment_end", "", "", 0.65));

  // ── Education ────────────────────────────────────────────────
  m = src.match(/\b(?:graduated from|went to|attended|studied at)\s+([A-Z][^.!?,]{3,60})/i);
  if(m) facts.push(_f(`Education: ${m[1].trim()}`, "education", "", "", 0.65));

  // ── Residence / moves ─────────────────────────────────────────
  // Gap G-01 fix: added "settled in|ended up in|made.*home in" to catch narrator idioms
  // like "I settled in San Diego in 1980" which were previously missed.
  m = src.match(/\b(?:moved to|we moved to|living in|lived in|grew up in|settled in|ended up in|made (?:my|our) home in)\s+([A-Z][^.!?,]{2,60})/i);
  if(m) facts.push(_f(`Residence: ${m[1].trim()}`, "residence", "", "", 0.6));

  // ── Death (family member) ────────────────────────────────────
  m = src.match(/\b(?:my\s+(?:mother|father|mom|dad|sister|brother|wife|husband|spouse|son|daughter|grandpa|grandma|grandfather|grandmother))[^.!?]{0,30}(?:passed away|died|passed|is gone)\b/i);
  if(m) facts.push(_f(`Family loss: ${m[0].trim()}`, "death", "", "", 0.7));

  // Deduplicate by statement (simple string equality)
  const seen = new Set();
  return facts.filter(f=>{ if(seen.has(f.statement)) return false; seen.add(f.statement); return true; });
}

/**
 * Fire-and-forget: extract facts from a turn and POST each one to /api/facts/add.
 * Failures are silently ignored — this should never break the UI.
 */
async function _extractAndPostFacts(userText, loriText){
  if(!state.person_id) return;
  const facts = _extractFacts(userText, loriText);
  if(!facts.length) return;
  for(const f of facts){
    try{
      await fetch(API.FACTS_ADD, {
        method:"POST", headers: ctype(), body: JSON.stringify(f),
      });
    }catch{ /* silently ignore network errors */ }
  }
  if(facts.length){
    console.log(`[facts] extracted ${facts.length} fact(s) from turn.`);
    // v7.4D ISSUE-15: quietly refresh the archive readiness panel so the user
    // sees the archive growing without any disruptive notification.
    if(typeof updateArchiveReadiness === "function") updateArchiveReadiness();
  }
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
// v7.4D — helper: get the .bubble-body child of a bubble element.
// Needed because appendBubble now nests label + body inside the bubble div.
function _bubbleBody(el){ return el?.querySelector(".bubble-body")||el; }

function handleWsMessage(j){
  if(j.type==="token"||j.type==="delta"){
    if(!currentAssistantBubble){
      currentAssistantBubble=appendBubble("ai","");
      setLoriState("drafting");
    }
    _bubbleBody(currentAssistantBubble).textContent+=(j.delta||j.token||"");
    document.getElementById("chatMessages").scrollTop=99999;
  }
  if(j.type==="error"){
    // Backend sent an error (e.g. model load failure, CUDA OOM)
    console.error("[WS] backend error:", j.message);
    const _isOOM = (j.message||"").toLowerCase().includes("out of memory") ||
                   (j.message||"").includes("CUDA_OOM");
    if(currentAssistantBubble){
      if(_isOOM){
        _bubbleBody(currentAssistantBubble).textContent=
          "GPU memory was full. VRAM has been freed — try sending your message again.";
      } else {
        _bubbleBody(currentAssistantBubble).textContent=
          "Chat error: " + (j.message||"unknown") + ". Try again.";
      }
    } else {
      // No bubble yet — create one for the error
      currentAssistantBubble = appendBubble("ai", _isOOM
        ? "GPU memory was full. VRAM has been freed — try sending your message again."
        : "Chat error: " + (j.message||"unknown") + ". Try again.");
    }
  }
  if(j.type==="done"){
    const text=j.final_text||(_bubbleBody(currentAssistantBubble)?.textContent||"");
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
  // v7.4D — speaker label: every turn gets a clear "You" or "Lori" header.
  // sys bubbles (status messages) skip the label.
  if(role==="user"||role==="ai"){
    const label=document.createElement("div");
    label.className="bubble-speaker";
    label.textContent=(role==="user")?"You":"Lori";
    d.appendChild(label);
  }
  const body=document.createElement("div");
  body.className="bubble-body";
  body.textContent=text;
  d.appendChild(body);
  w.appendChild(d); w.scrollTop=w.scrollHeight;
  return d;
}
function sysBubble(text){ return appendBubble("sys",text); }
function clearChat(){ document.getElementById("chatMessages").innerHTML=""; }

/* ═══════════════════════════════════════════════════════════════
   TTS
═══════════════════════════════════════════════════════════════ */

// Chrome blocks audio until a real user gesture has occurred.
// We keep ONE persistent Audio element, unlock it on first gesture,
// then reuse it for every TTS chunk — the element stays whitelisted.
let _ttsAudio = null;
let _audioUnlocked = false;

// v7.4D — STT/TTS feedback-loop guard.
// True while Lori's TTS is actively playing. Recognition results and
// auto-restarts are suppressed whenever this flag is set.
let isLoriSpeaking = false;

function unlockAudio(){
  if(_audioUnlocked) return;
  _audioUnlocked = true;
  _ttsAudio = new Audio();
  // Play silence immediately inside the gesture handler to whitelist the element.
  const silence = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  _ttsAudio.src = silence;
  _ttsAudio.play().catch(()=>{});
}

// Strip markdown formatting so TTS doesn't read "asterisk asterisk" etc.
function _stripMarkdownForTts(text){
  return text
    .replace(/#{1,6}\s+/g, "")                       // ## headings
    .replace(/\*\*(.+?)\*\*/g, "$1")                  // **bold**
    .replace(/\*(.+?)\*/g, "$1")                      // *italic*
    .replace(/__(.+?)__/g, "$1")                      // __bold__
    .replace(/_(.+?)_/g, "$1")                        // _italic_
    .replace(/`{1,3}[^`\n]*`{1,3}/g, "")             // `code`
    .replace(/^\s*[-*+]\s+/gm, "")                    // - bullet items
    .replace(/^\s*\d+\.\s+/gm, "")                    // 1. numbered list
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")          // [text](url)
    .replace(/\n{2,}/g, ". ")                         // paragraph break → brief pause
    .replace(/\n/g, " ")                              // single newline → space
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Split cleaned text into ≤400-char chunks at sentence boundaries.
function _splitIntoTtsChunks(text, maxLen=400){
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks = [];
  let current = "";
  for(const s of sentences){
    if((current+s).length > maxLen){
      if(current.trim()) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if(current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, maxLen)];
}

function enqueueTts(text){
  const cleaned = _stripMarkdownForTts(text);
  _splitIntoTtsChunks(cleaned).forEach(c => ttsQueue.push(c));
  if(!ttsBusy) drainTts();
}
async function drainTts(){
  ttsBusy=true;
  // v7.4D — stop mic and mark Lori as speaking before any audio plays.
  // This prevents the STT engine from transcribing Lori's own voice.
  isLoriSpeaking=true;
  if(isRecording) stopRecording();
  try {
    while(ttsQueue.length){
      const chunk=ttsQueue.shift();
      try{
        const r=await fetch(TTS_ORIG+"/api/tts/speak_stream",{method:"POST",headers:ctype(),
          body:JSON.stringify({text:chunk,voice:"p335"})});
        if(!r.ok) continue;
        // Server returns NDJSON: {"wav_b64":"<base64 WAV>"}
        const ndjson = await r.text();
        for(const line of ndjson.split("\n")){
          const t=line.trim(); if(!t) continue;
          let obj; try{ obj=JSON.parse(t); }catch{ continue; }
          if(!obj.wav_b64) continue;
          const raw=atob(obj.wav_b64);
          const bytes=new Uint8Array(raw.length);
          for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
          const blob=new Blob([bytes],{type:"audio/wav"});
          const url=URL.createObjectURL(blob);
          const a=_ttsAudio||new Audio();
          a.src=url;
          await new Promise(res=>{ a.onended=a.onerror=res; a.play().catch(res); });
          URL.revokeObjectURL(url);
        }
      }catch{}
    }
  } finally {
    // Step 3 hardening — always clear both flags on exit, even if an unexpected
    // exception escapes the inner loop. Without this, isLoriSpeaking could be
    // stuck true permanently, silently suppressing all STT forever.
    isLoriSpeaking=false;
    ttsBusy=false;
  }
}

/* ═══════════════════════════════════════════════════════════════
   VOICE INPUT
   ─────────────────────────────────────────────────────────────
   STT/TTS FEEDBACK-LOOP GUARD CONTRACT (v7.4D / Step 3 hardened)
   ─────────────────────────────────────────────────────────────
   Problem: the Web Speech API can transcribe Lori's own TTS audio
   through the speaker, producing feedback-loop ghost transcripts.

   Guard: isLoriSpeaking (bool, declared in TTS section above)
   ├─ Set TRUE  — immediately before drainTts() starts any audio.
   ├─ Set FALSE — in a finally{} block after all audio is drained,
   │              guaranteeing it is cleared even if an exception
   │              escapes the inner chunk loop.
   ├─ recognition.onresult — returns early (discards result) when
   │  isLoriSpeaking is true. Emits console.warn for diagnostics.
   └─ recognition.onend   — only auto-restarts when
      isRecording === true AND isLoriSpeaking === false.

   Invariant: isLoriSpeaking must NEVER be left stuck at true.
   The finally{} block in drainTts() is the enforced safety net.
═══════════════════════════════════════════════════════════════ */
function toggleRecording(){ unlockAudio(); isRecording?stopRecording():startRecording(); }
// HTML button calls toggleMic() — alias to toggleRecording.
function toggleMic(){ toggleRecording(); }
// Normalise spoken punctuation words produced by Web Speech API.
// Runs on each final transcript chunk before appending to the input box.
function _normalisePunctuation(t){
  return t
    .replace(/\bperiod\b/gi,            ".")
    .replace(/\bfull stop\b/gi,         ".")
    .replace(/\bcomma\b/gi,             ",")
    .replace(/\bquestion mark\b/gi,     "?")
    .replace(/\bexclamation (point|mark)\b/gi, "!")
    .replace(/\bsemicolon\b/gi,         ";")
    .replace(/\bcolon\b/gi,             ":")
    .replace(/\bdash\b/gi,              " — ")
    .replace(/\bhyphen\b/gi,            "-")
    .replace(/\bellipsis\b/gi,          "...")
    .replace(/\bdot dot dot\b/gi,       "...")
    .replace(/\bnew (line|paragraph)\b/gi, "\n")
    .replace(/\bopen (paren|parenthesis)\b/gi,  "(")
    .replace(/\bclose (paren|parenthesis)\b/gi, ")")
    .replace(/\bopen quote\b/gi,        "\u201C")
    .replace(/\bclose quote\b/gi,       "\u201D")
    // Tidy up any double-spaces left by replacements
    .replace(/ {2,}/g, " ")
    .trim();
}

// v7.4D — Voice send commands. Any of these exact phrases (case-insensitive,
// trimmed) will trigger Send instead of being typed into the input box.
const _SEND_COMMANDS = new Set(["send","send it","okay send","ok send","go ahead","send message"]);

function _ensureRecognition(){
  if(recognition) return recognition;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ sysBubble("Voice input not supported in this browser."); return null; }
  recognition=new SR(); recognition.continuous=true; recognition.interimResults=true;
  recognition.onresult=e=>{
    // v7.4D — if Lori is speaking, discard all recognition results entirely.
    // This is the primary guard against self-transcription.
    if(isLoriSpeaking){
      // Step 3 diagnostic — visible in DevTools during testing.
      console.warn("[STT guard] Recognition fired while isLoriSpeaking=true — result discarded.");
      return;
    }
    let fin=""; for(let i=e.resultIndex;i<e.results.length;i++) if(e.results[i].isFinal) fin+=e.results[i][0].transcript;
    if(!fin) return;
    const trimmed=fin.trim().toLowerCase();
    // v7.4D — check for voice send command before appending to input.
    if(_SEND_COMMANDS.has(trimmed)){
      stopRecording();
      sendUserMessage();
      return;
    }
    setv("chatInput",getv("chatInput")+_normalisePunctuation(fin));
  };
  // v7.4D — only auto-restart if user explicitly left mic on AND Lori is not speaking.
  // This prevents the engine from restarting mid-TTS and catching Lori's audio.
  recognition.onend=()=>{ if(isRecording && !isLoriSpeaking){ recognition.start(); } };
  return recognition;
}
function startRecording(){
  const r=_ensureRecognition(); if(!r) return;
  r.start(); isRecording=true;
  document.getElementById("btnMic").textContent="🔴";
  setLoriState("listening");
}
function stopRecording(){
  isRecording=false;
  if(recognition){ try{ recognition.stop(); }catch(e){} }
  document.getElementById("btnMic").textContent="🎤";
  setLoriState("ready");
}

/* ═══════════════════════════════════════════════════════════════
   v7.1 — TIMELINE SPINE INITIALIZER
   Called from saveProfile() when DOB + birthplace are present.
   Builds the life-period scaffold from date of birth.
═══════════════════════════════════════════════════════════════ */
const TIMELINE_ORDER = [
  "early_childhood",
  "school_years",
  "adolescence",
  "early_adulthood",
  "midlife",
  "later_life",
];

const ERA_AGE_MAP = {
  early_childhood:  { start: 0,  end: 5  },
  school_years:     { start: 6,  end: 12 },
  adolescence:      { start: 13, end: 18 },
  early_adulthood:  { start: 19, end: 30 },
  midlife:          { start: 31, end: 55 },
  later_life:       { start: 56, end: null },
};

function initTimelineSpine() {
  const b = state.profile?.basics || {};
  if (!b.dob || !b.pob) return;
  const birthYear = parseInt(String(b.dob).slice(0, 4), 10);
  if (Number.isNaN(birthYear)) return;

  const periods = TIMELINE_ORDER.map(label => {
    const ages = ERA_AGE_MAP[label];
    return {
      label,
      start_year: birthYear + ages.start,
      end_year:   ages.end !== null ? birthYear + ages.end : null,
      is_approximate: true,
      places: label === "early_childhood" ? [b.pob] : [],
      people: [],
      notes:  label === "early_childhood" ? [`Born in ${b.pob}`] : [],
    };
  });

  state.timeline.spine     = { birth_date: b.dob, birth_place: b.pob, periods };
  state.timeline.seedReady = true;
  saveSpineLocal();

  // Advance pass engine to Pass 2A and default to first era
  setPass("pass2a");
  if (!getCurrentEra()) setEra(periods[0].label);
  setMode("open");

  // Sync UI
  update71RuntimeUI();
  renderRoadmap();
  renderTimeline();
  updateArchiveReadiness();
  sysBubble("◉ Timeline spine initialized — Pass 2A (Timeline Walk) ready.");
}

/* ── v7.1 — update all runtime badge elements in the UI ──── */
function update71RuntimeUI() {
  const PASS_LABELS = {
    pass1:  "Pass 1",
    pass2a: "Pass 2A",
    pass2b: "Pass 2B",
  };
  const prettyEra  = (v) => v ? String(v).replaceAll("_"," ").replace(/\b\w/g, m => m.toUpperCase()) : "No era";
  const prettyMode = (v) => v ? String(v).replace(/\b\w/g, m => m.toUpperCase()) : "Open";

  const pass = getCurrentPass();
  const era  = getCurrentEra();
  const mode = getCurrentMode();
  const passLabel = PASS_LABELS[pass] || pass;
  const eraLabel  = prettyEra(era);
  const modeLabel = prettyMode(mode);

  // Top bar runtime pills (lori7.1.html)
  const setT = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setT("topPassPill",  passLabel);
  setT("topEraPill",   eraLabel);
  setT("topModePill",  modeLabel);
  // Interview tab header
  setT("ivPassLabel",  `${passLabel}${pass === "pass2a" ? " — Timeline Spine" : pass === "pass2b" ? " — Narrative Depth" : " — Profile Seed"}`);
  setT("ivEraLabel",   eraLabel);
  setT("ivModeLabel",  modeLabel);
  setT("ivSectionLabel", `${passLabel} · Era: ${eraLabel} · Mode: ${modeLabel}`);
  // Lori panel state strip
  setT("loriPassPill", passLabel);
  setT("loriEraPill",  eraLabel);
  setT("loriModePill", modeLabel);

  // Seed badges
  const spineReady = !!state.timeline?.spine;
  const seedBadge  = document.getElementById("timelineSeedBadge71");
  if (seedBadge) {
    seedBadge.className   = spineReady ? "seed-badge" : "seed-badge pending";
    seedBadge.textContent = spineReady ? "◉ Timeline spine ready — Pass 2A available" : "◎ Profile seed in progress — complete identity anchors";
  }
  // Summary seed indicator
  const sumSeed = document.getElementById("summarySeed");
  if (sumSeed) sumSeed.classList.toggle("hidden", !spineReady);
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

/* ═══════════════════════════════════════════════════════════════
   v7.4B — Onboarding helpers
   Call startOnboarding74() once at session start (or on first person load)
   to run the scripted warm-up before entering normal interview flow.
   These functions are defined here but not wired to auto-startup yet;
   add the call site when the 7.3 shell flow is ready to change.
═══════════════════════════════════════════════════════════════ */

function startOnboarding74() {
  if (typeof state === "undefined") return;
  if (!state.session) state.session = {};

  if (!state.session.onboarding) {
    state.session.onboarding = {
      complete: false,
      cameraForPacing: false,
      profilePhotoEnabled: false,
      questionsAsked: false,
      profilePhotoCaptured: false,
      ttsPace: "normal",
    };
  }

  state.session.currentMode = "open";

  appendLoriOnboardingMessage("Hello. I'm Lori. I'm here to help you tell your story, at your pace. We can talk, type, pause, skip something, or come back later. Nothing has to be perfect.");
  appendLoriOnboardingMessage("You can speak to me and I can listen and turn your words into text. I can also speak my replies aloud, and everything I say will stay visible on screen. If typing feels easier, that works too.");
  appendLoriOnboardingMessage("As we go, I'll help build your profile, timeline, and a draft of your story with you. You can review and edit those at any time.");
  appendLoriOnboardingMessage("If you'd like, I can also use your camera in two optional ways. First, I can take a profile photo. Second, I can use a short warm-up moment to adjust to your lighting and expressions so I pace the conversation more gently.");
  appendLoriOnboardingMessage("The camera is optional. If you turn it on, it stays on this device. I don't save video, and I don't need the camera to continue.");
  appendLoriOnboardingMessage("Before we begin, do you have any questions about how I work, or would you like me to explain anything again?");

  state.session.onboarding.questionsAsked = true;
}

function appendLoriOnboardingMessage(text) {
  const host = document.getElementById("chatMessages");
  if (!host) return;

  const msg = document.createElement("div");
  msg.className = "msg lori";
  msg.textContent = text;
  host.appendChild(msg);
  host.scrollTop = host.scrollHeight;

  const last = document.getElementById("lastAssistantPanel");
  if (last) last.textContent = text;
}

async function beginCameraConsent74(opts = {}) {
  if (typeof state === "undefined" || !state.session?.onboarding) return false;

  state.session.onboarding.cameraForPacing = !!opts.cameraForPacing;
  state.session.onboarding.profilePhotoEnabled = !!opts.profilePhotoEnabled;

  if (!state.session.onboarding.cameraForPacing) {
    return false;
  }

  // Let existing emotion-ui / FacialConsent path remain authoritative
  emotionAware = true;
  updateEmotionAwareBtn();

  await startEmotionEngine();

  if (window.AffectBridge74 && cameraActive) {
    window.AffectBridge74.beginBaselineWindow();
  }

  // Show draggable camera preview so the user can see what the camera sees
  if (cameraActive && window.lv74 && window.lv74.showCameraPreview) {
    window.lv74.showCameraPreview();
  }

  appendLoriOnboardingMessage("Thank you. Let's take a short moment to get comfortable. You don't need to do anything special — just look toward the screen naturally if that feels comfortable.");
  appendLoriOnboardingMessage("Is this a good time to begin?");
  appendLoriOnboardingMessage("How would you like me to address you?");
  appendLoriOnboardingMessage("Would you like me to speak more slowly, or is this pace comfortable?");

  return !!cameraActive;
}

function finalizeOnboarding74() {
  if (typeof state === "undefined" || !state.session?.onboarding) return;

  if (window.AffectBridge74) {
    window.AffectBridge74.finalizeBaseline();
  }

  state.session.onboarding.complete = true;

  appendLoriOnboardingMessage("Whenever you're ready, we can begin at the beginning. I'll start by helping place your story in time.");
}
