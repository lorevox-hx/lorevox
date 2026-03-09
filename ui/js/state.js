/* ═══════════════════════════════════════════════════════════════
   state.js — single source of truth for all application state
   Lorevox v6.1
   Load order: FIRST (before all other modules)
═══════════════════════════════════════════════════════════════ */

/* ── Core session state ── */
let state = {
  person_id: null,
  profile: {basics:{}, kinship:[], pets:[]},
  chat: {conv_id: null},
  interview: {session_id:null, question_id:null, prompt:null},
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
