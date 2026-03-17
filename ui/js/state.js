/* ═══════════════════════════════════════════════════════════════
   state.js — single source of truth for all application state
   Lorevox v7.1
   Load order: FIRST (before all other modules)
═══════════════════════════════════════════════════════════════ */

/* ── Core session state ── */
let state = {
  person_id: null,
  profile: {basics:{}, kinship:[], pets:[]},
  chat: {conv_id: null},
  interview: {session_id:null, question_id:null, prompt:null},

  /* ── v7.1 Timeline Spine ──────────────────────────────────────
     Initialized when DOB + birthplace are saved.
     periods: { label, start_year, end_year, places[], notes[] }[]
  ─────────────────────────────────────────────────────────────── */
  timeline: {
    seedReady: false,
    spine: null,       // { birth_date, birth_place, periods[] }
    memories: [],      // scene candidates from "Save as Memory"
  },

  /* ── v7.1 Session runtime ────────────────────────────────────
     Drives pass engine and prompt routing.
     currentPass : 'pass1' | 'pass2a' | 'pass2b'
     currentEra  : 'early_childhood' | 'school_years' | … | null
     currentMode : 'open' | 'recognition' | 'gentle' | 'grounding' | 'light'
  ─────────────────────────────────────────────────────────────── */
  session: {
    currentPass: "pass1",
    currentEra:  null,
    currentMode: "open",
  },

  /* ── v7.1 Runtime affect / cognitive signals ─────────────────
     Populated by the affect engine; read by the pass engine.
  ─────────────────────────────────────────────────────────────── */
  runtime: {
    affectState:      "neutral",   // latest smoothed affect label
    affectConfidence: 0,
    cognitiveMode:    null,        // null | 'recognition' | 'light'
    fatigueScore:     0,           // 0–100, estimated by session_vitals
  },
};

/* ── Interview progress ── */
let sectionIndex   = 0;
let sectionDone    = new Array(37).fill(false); // 37 = INTERVIEW_ROADMAP.length — will be reset after data.js loads
let sectionVisited = new Array(37).fill(false);

/* ── UI state ── */
let activeFilter   = "all";
let showWorldOnTL  = true;
let isFocusMode    = false;
let devMode        = false;
let interviewMode  = "chronological"; // 'chronological' | 'thematic'
let youthMode      = false;

/* ── Connection state ── */
let ws = null, wsReady = false, usingFallback = false;

/* ── Recording / TTS state ── */
let isRecording = false, recognition = null;
let ttsQueue = [], ttsBusy = false;

/* ── Chat state ── */
let lastAssistantText = "";
let currentAssistantBubble = null;

/* ── Interview capture state ── */
let captureState  = null;   // null | 'captured' | 'edited' | 'saved'

/* ── Obituary state ── */
let obitDraftType = null;
let obitHasEdits  = false;  // true once user hand-edits the obit textarea
let obitModalAction = null; // 'profile' | 'lori' — pending action after confirm

/* ── Profile state ── */
let profileSaved  = false;

/* ── v6.1 Track A — Safety state ── */
let softenedMode      = false;  // post-disclosure softened interview mode
let softenedUntilTurn = 0;      // expires after this turn index
let turnCount         = 0;      // interview turn counter (incremented per answer)
// { sectionIdx: number, category: string, excerpt: string }[]
let sensitiveSegments = [];
let pendingConfirmAction = null; // callback for confirm dialog

/* ── v6.1 Track B — Affect/emotion state ── */
let emotionAware   = false;  // user has opted in to affect-aware mode
let cameraActive   = false;  // camera + MediaPipe running
let showAffectArc  = false;  // timeline affect arc toggle
let permMicOn      = true;   // mic permission (default on)
let permCamOn      = false;  // camera permission (default off)
let permCardShown  = false;  // has the permission card been shown this session?
// Session affect events: { ts, section_id, affect_state, confidence }[]
let sessionAffectLog = [];

/* ═══════════════════════════════════════════════════════════════
   v7.1 — Timeline Spine localStorage helpers
   Key schema: lorevox.spine.<person_id>
═══════════════════════════════════════════════════════════════ */
const LS_SPINE = (pid) => `lorevox.spine.${pid}`;

function saveSpineLocal() {
  if (!state.person_id || !state.timeline?.spine) return;
  try { localStorage.setItem(LS_SPINE(state.person_id), JSON.stringify(state.timeline.spine)); }
  catch (_) {}
}

function loadSpineLocal(pid) {
  try {
    const raw = localStorage.getItem(LS_SPINE(pid));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

/* ── v7.1 — Getters used across modules ────────────────────── */
function getTimelineSeedReady() {
  return !!(state.profile?.basics?.dob && state.profile?.basics?.pob);
}

function getCurrentLifePeriods() {
  return state.timeline?.spine?.periods || [];
}

function getCurrentPass()  { return state.session?.currentPass  || "pass1"; }
function getCurrentEra()   { return state.session?.currentEra   || null;    }
function getCurrentMode()  { return state.session?.currentMode  || "open";  }

/* ── v7.1 — Pass / era / mode setters ──────────────────────── */
function setPass(p)  { if (state.session) state.session.currentPass = p; }
function setEra(e)   { if (state.session) state.session.currentEra  = e; }
function setMode(m)  { if (state.session) state.session.currentMode = m; }
