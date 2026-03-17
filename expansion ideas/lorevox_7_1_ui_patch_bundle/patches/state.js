/* ═══════════════════════════════════════════════════════════════
   state.js — Lorevox 7.1 review state model
   Purpose: extend the v6.x shell with timeline spine + pass engine state
═══════════════════════════════════════════════════════════════ */

let state = {
  person_id: null,
  profile: { basics: {}, kinship: [], pets: [] },
  chat: { conv_id: null },
  interview: { session_id: null, question_id: null, prompt: null },

  // 7.1 additions
  timeline: {
    seedReady: false,
    spine: null,           // { birth_date, birth_place, periods: [...] }
    memories: [],          // future scene/memory pins
  },

  session: {
    currentPass: "pass1",  // pass1 | pass2a | pass2b
    currentEra: null,      // early_childhood | school_years | ...
    currentMode: "open",   // open | recognition | grounding | light
  },

  runtime: {
    affectState: "neutral",
    affectConfidence: 0,
    cognitiveMode: "open",
  },
};

let sectionIndex   = 0;
let sectionDone    = new Array(37).fill(false);
let sectionVisited = new Array(37).fill(false);

let activeFilter   = "all";
let showWorldOnTL  = true;
let isFocusMode    = false;
let devMode        = false;
let interviewMode  = "chronological"; // chronological => pass2a, thematic => pass2b
let youthMode      = false;

let ws = null, wsReady = false, usingFallback = false;
let isRecording = false, recognition = null;
let ttsQueue = [], ttsBusy = false;
let lastAssistantText = "";
let currentAssistantBubble = null;
let captureState  = null;
let obitDraftType = null;
let obitHasEdits  = false;
let obitModalAction = null;
let profileSaved  = false;

let softenedMode      = false;
let softenedUntilTurn = 0;
let turnCount         = 0;
let sensitiveSegments = [];
let pendingConfirmAction = null;

let emotionAware   = false;
let cameraActive   = false;
let showAffectArc  = false;
let permMicOn      = true;
let permCamOn      = false;
let permCardShown  = false;
let sessionAffectLog = [];

/* ── 7.1 local persistence ───────────────────────────────────── */
function LS_TIMELINE(pid){ return `lorevox.timeline.${pid}`; }

function saveTimelineSpineLocal(){
  if(!state.person_id || !state.timeline?.spine) return;
  localStorage.setItem(LS_TIMELINE(state.person_id), JSON.stringify(state.timeline.spine));
}

function loadTimelineSpineLocal(pid){
  try{
    const raw = localStorage.getItem(LS_TIMELINE(pid));
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

/* ── 7.1 pass / era helpers ──────────────────────────────────── */
function setInterviewPass(passName){
  state.session.currentPass = passName;
  updateInterviewStateBadges();
}

function setInterviewEra(eraLabel){
  state.session.currentEra = eraLabel;
  updateInterviewStateBadges();
}

function setInterviewMode71(modeLabel){
  state.session.currentMode = modeLabel;
  updateInterviewStateBadges();
}

function getCurrentLifePeriods(){
  return state.timeline?.spine?.periods || [];
}

function getTimelineSeedReady(){
  return !!(state.profile?.basics?.dob && state.profile?.basics?.pob);
}

function updateInterviewStateBadges(){
  const label = document.getElementById("ivSectionLabel");
  if(!label) return;
  const pass = state.session.currentPass || "pass1";
  const era  = state.session.currentEra || "No era selected";
  const mode = state.session.currentMode || "open";
  const passTitle =
    pass === "pass2a" ? "Pass 2A — Timeline Spine" :
    pass === "pass2b" ? "Pass 2B — Narrative Depth" :
    "Pass 1 — Timeline Seed";
  label.textContent = `${passTitle} · Era: ${prettyEraLabel(era)} · Mode: ${prettyModeLabel(mode)}`;
}

function prettyEraLabel(v){
  if(!v) return "Not set";
  return String(v).replaceAll("_"," ").replace(/\b\w/g, m => m.toUpperCase());
}

function prettyModeLabel(v){
  if(!v) return "Open";
  return String(v).replace(/\b\w/g, m => m.toUpperCase());
}
