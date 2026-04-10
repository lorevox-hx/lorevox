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

  /* ── v8 Narrator UI state ─────────────────────────────────── */
  narratorUi: {
    switcherOpen: false,
    pendingSwitchTo: null,
    activeLabel: null,
    peopleCache: [],
    grouped: {
      real: [],
      test: [],
      archived: []
    }
  },

  /* ── v9 Narrator open gating ─────────────────────────────── */
  narratorOpen: {
    loadingPid: null,      // pid currently being loaded, null if idle
    openStatus: "idle",    // "idle" | "loading" | "ready" | "incomplete" | "error"
    incompletePid: null,   // pid that was classified incomplete
    openError: null,       // error message if load failed
  },

  /* ── v8 Narrator delete workflow ──────────────────────────── */
  narratorDelete: {
    targetId: null,
    targetLabel: null,
    confirmText: "",
    step: 0,
    backup: null,
    undoExpiresAt: null
  },

  interview: {
    session_id:    null,
    question_id:   null,
    prompt:        null,
    /* v7.2 — Paired interview mode */
    paired:        false,   // true when a second participant (spouse / caregiver) is present
    pairedSpeaker: null,    // name or label for the second participant
  },

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
     currentMode : 'open' | 'recognition' | 'grounding' | 'light' | 'alongside'
  ─────────────────────────────────────────────────────────────── */
  session: {
    currentPass: "pass1",
    currentEra:  null,
    currentMode: "open",
    /* v7.2 — Sustained confusion tracking (persisted within session) */
    confusionTurnCount: 0,  // increments on confused turns, decrements on clear turns
    /* v7.4A — Real visual affect bridge target.
       Written by AffectBridge74.consume(); read by buildRuntime71().
       gazeOnScreen is optional in 7.4A — null is valid throughout this phase. */
    visualSignals: {
      affectState:     null,   // string: steady|engaged|reflective|moved|distressed|overwhelmed
      confidence:      0,      // float 0–1
      gazeOnScreen:    null,   // bool|null — optional; present for forward compat
      blendConfidence: 0,      // float 0–1
      timestamp:       null,   // ms epoch; used for 8s stale check in buildRuntime71()
    },

    /* v7.4B — Baseline calibration (populated during onboarding warm-up).
       Coarse session-normal affect summary only; no full facial normalization in 7.4B. */
    affectBaseline: {
      active:      false,  // currently collecting baseline samples
      established: false,  // directives only fire when true
      startedAt:   null,   // ms epoch
      samples:     [],     // cleared after finalization
      summary:     null,   // { neutralAffect, sampleCount, capturedAt }
    },

    /* v7.4B — Onboarding state */
    onboarding: {
      complete:            false,
      cameraForPacing:     false,   // consent to pacing camera (independent of photo)
      profilePhotoEnabled: false,   // consent to profile photo (independent of pacing)
      questionsAsked:      false,   // user had opportunity to ask questions
      profilePhotoCaptured:false,
      ttsPace:             "normal",// normal | slow
    },

    /* v7.4D — Assistant role: controls which directive block prompt_composer injects.
       'interviewer' : default oral-history interview mode
       'onboarding'  : identity collection (name/DOB/birthplace)
       'helper'      : user asked a product-use question; suppress interview, answer directly
       'safety'      : safety companion mode                                        */
    assistantRole: "interviewer",

    /* WO-10C — Cognitive Support Mode: narrator-scoped flag.
       When true, the entire stack shifts to dementia-safe companion behavior:
       extended silence thresholds, invitational (not interrogative) prompts,
       single-thread memory context, no correction, no observation language.
       Set per narrator via operator controls; persists for the session. */
    cognitiveSupportMode: false,

    /* v10 — Memoir Question Strategy: session-level tracking */
    memoirStrategy: {
      askedPaths:      [],   // recently asked field paths (capped at 30)
      askedKinds:      [],   // recently asked questionKind values (capped at 15)
      askedEras:       [],   // recently targeted eras (capped at 10)
      lastQuestionTs:  null, // timestamp of last question
      consecutiveSameEra: 0, // count of consecutive questions in same era
    },

    /* v7.4D Phase 6B — Identity-first onboarding state machine.
       null  = not yet started (new user before first message, OR returning user with profile)
       'askName' → 'askDob' → 'askBirthplace' → 'resolving' → 'complete'
       getIdentityPhase74() interprets null as "complete" when hasIdentityBasics74() is true,
       and as "incomplete" when the profile has no basics — so null is safe for both paths.
       Step 3: removed the duplicate `identityPhase: "incomplete"` that was shadowing this. */
    identityPhase: null,
    identityCapture: { name: null, dob: null, birthplace: null },
  },

  /* ── v7.1 Runtime affect / cognitive signals ─────────────────
     Populated by the affect engine; read by the pass engine.
  ─────────────────────────────────────────────────────────────── */
  runtime: {
    affectState:      "neutral",   // latest smoothed affect label
    affectConfidence: 0,
    cognitiveMode:    null,        // null | 'open' | 'recognition' | 'grounding' | 'light' | 'alongside'
    fatigueScore:     0,           // 0–100, estimated by session_vitals
  },

  /* ── WO-11 Trainer Narrators ──────────────────────────────────── */
  trainerNarrators: {
    active: false,
    personId: null,
    style: null,          // structured | storyteller
    stepIndex: 0,
    completed: false
  },

  narratorTrainerMeta: {},

  /* ── WO-10D Input State — single source of truth for mic/camera ─── */
  inputState: {
    micActive:     false,   // true when recognition is running
    micPaused:     false,   // true when WO-8 or WO-11B pause is active
    cameraActive:  false,   // true when emotion engine is running
    cameraConsent: false,   // true after user granted facial consent
  },

  /* ── WO-10H Narrator Turn-Claim ─────────────────────────────────
     Explicit state machine for narrator floor-claim contract.
     States: idle | awaiting_tts_end | armed_for_narrator | recording | paused | timeout_check
     ─────────────────────────────────────────────────────────────── */
  narratorTurn: {
    state:             "idle",    // current turn state
    claimTimestamp:     null,     // when narrator claimed the floor (ms epoch)
    timeoutDeadline:    null,     // when timeout check-in should fire (ms epoch)
    interruptionBlock:  null,     // reason interruptions are blocked: "narrator_claimed_turn" | null
    ttsFinishedAt:      null,     // when TTS finished (ms epoch) — null while speaking
    checkInFired:       false,    // true after one gentle check-in has been sent
  },

  /* ── v8 Interview Projection ────────────────────────────────────
     Live state for conversational template intake.
     Lori asks Bio Builder questionnaire questions during interview;
     answers project into this object, then sync to Bio Builder.

     Keying:
       Non-repeatable: "personal.fullName", "earlyMemories.firstMemory"
       Repeatable:     "parents[0].firstName", "siblings[1].relation"

     Each field entry:
       value      : string — current projected value
       source     : "interview" | "preload" | "human_edit" | "profile_hydrate"
       turnId     : string|null — interview turn that produced this value
       confidence : float 0–1 — extraction confidence
       locked     : bool — true when human-edited; AI cannot overwrite
       ts         : number — ms epoch of last update
       history    : array — prior { value, source, turnId, confidence, ts }

     Sync rules (enforced by projection-sync.js):
       1. prefill_if_blank — write to BB field only if currently empty
       2. candidate_only   — never write directly; create candidate entry
       3. suggest_only     — queue suggestion; user must accept

     Lifecycle:
       - Reset on narrator switch (same as bioBuilder state)
       - Persisted to localStorage as lorevox_proj_draft_<pid>
       - Hydrated from localStorage on narrator load
  ─────────────────────────────────────────────────────────────── */
  interviewProjection: {
    personId: null,
    fields: {},           // { "section.field": { value, source, turnId, confidence, locked, ts, history[] } }
    pendingSuggestions: [],// { fieldPath, value, confidence, turnId, ts } — for suggest_only fields
    syncLog: [],          // { fieldPath, action, fromValue, toValue, ts } — audit trail, capped at 200
  },
};

/* ── v8 Debug: expose projection state globally for console inspection ── */
window.__proj = state.interviewProjection;

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
let listeningPaused = false; // WO-11B: explicit pause/resume control
let ttsQueue = [], ttsBusy = false;

/* ── Chat state ── */
let lastAssistantText = "";
let currentAssistantBubble = null;
// v7.4D — Phase 7: last user turn text, captured for post-reply fact extraction.
let _lastUserTurn = "";

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
let permLocOn      = false;  // location permission (default off — Step 3: optional, consent-gated)
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

/* v7.4D — Assistant role getters/setters */
function getAssistantRole() { return state.session?.assistantRole || "interviewer"; }
function setAssistantRole(r){ if (state.session) state.session.assistantRole = r; }

/* WO-10C — Cognitive Support Mode getter/setter */
function getCognitiveSupportMode() { return !!(state.session?.cognitiveSupportMode); }
function setCognitiveSupportMode(on) { if (state.session) state.session.cognitiveSupportMode = !!on; }

/* ── v7.1 — Pass / era / mode setters ──────────────────────── */
function setPass(p)  { if (state.session) state.session.currentPass = p; }
function setEra(e)   { if (state.session) state.session.currentEra  = e; }
function setMode(m)  { if (state.session) state.session.currentMode = m; }
