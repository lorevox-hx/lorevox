/* ═══════════════════════════════════════════════════════════════
   app.js — init, people/profile, events, memoir, obituary,
            chat (WS/SSE), TTS, voice, layout toggles, utilities
   Lorevox v6.1
   Load order: LAST
═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   CHAT READINESS GATE — Phase Q.4
   Ensures Lori never speaks before the LLM is actually loaded and warm.
   The gate blocks onboarding, system prompts, and user chat sends
   until /api/warmup confirms the model can generate tokens.
═══════════════════════════════════════════════════════════════ */
let _llmReady = false;
let _llmWarmupPolling = false;

/* ── WO-9: Startup race fix — queue system prompts until model ready ── */
let _wo9QueuedSystemPrompt = null;

function wo9SendOrQueueSystemPrompt(prompt) {
  if (!_llmReady) {
    _wo9QueuedSystemPrompt = prompt;
    console.log("[WO-9] Queued system prompt until model ready. Length:", prompt.length);
    return false;
  }
  sendSystemPrompt(prompt);
  return true;
}

function wo9DrainQueuedSystemPrompt() {
  if (_wo9QueuedSystemPrompt && _llmReady) {
    const prompt = _wo9QueuedSystemPrompt;
    _wo9QueuedSystemPrompt = null;
    console.log("[WO-9] Draining queued system prompt.");
    sendSystemPrompt(prompt);
  }
}
window.wo9SendOrQueueSystemPrompt = wo9SendOrQueueSystemPrompt;
window.wo9DrainQueuedSystemPrompt = wo9DrainQueuedSystemPrompt;

/* ── Hornelore operator mode flag ───────────────────────────── */
window.HORNELORE_OPERATOR_MODE = window.HORNELORE_OPERATOR_MODE || false;

/* ── Hornelore: deleted-narrator skip list ──────────────────── */
function _horneloreGetDeletedLabels() {
  try {
    return JSON.parse(localStorage.getItem("hornelore_deleted_labels") || "[]");
  } catch (_) {
    return [];
  }
}

function _horneloreMarkDeletedNarrator(label) {
  if (!label) return;
  try {
    var arr = _horneloreGetDeletedLabels();
    if (arr.indexOf(label) < 0) arr.push(label);
    localStorage.setItem("hornelore_deleted_labels", JSON.stringify(arr));
  } catch (_) {}
}

function _horneloreClearDeletedNarrator(label) {
  if (!label) return;
  try {
    var arr = _horneloreGetDeletedLabels().filter(function(x) { return x !== label; });
    localStorage.setItem("hornelore_deleted_labels", JSON.stringify(arr));
  } catch (_) {}
}

// Expose for operator UI
window._horneloreMarkDeletedNarrator  = _horneloreMarkDeletedNarrator;
window._horneloreClearDeletedNarrator = _horneloreClearDeletedNarrator;
window._horneloreGetDeletedLabels     = _horneloreGetDeletedLabels;

/** True once the model has completed warmup and can generate. */
function isLlmReady() { return _llmReady; }
// Expose for tests and console inspection
window.isLlmReady = isLlmReady;

/** Allow tests to force the readiness flag (e.g., for offline/headless testing). */
function _forceModelReady() {
  _llmReady = true;
  _setWarmupBanner(false);
  pill("pillChat", true);
  const ci = document.getElementById("chatInput");
  if (ci) { ci.disabled = false; ci.placeholder = "Type or speak…"; }
  const sendBtn = document.getElementById("lv80SendBtn");
  if (sendBtn) sendBtn.disabled = false;
  console.log("[readiness] _forceModelReady — gate forced open.");
}
window._forceModelReady = _forceModelReady;

/** Show/hide the warmup banner overlay. */
function _setWarmupBanner(visible, message) {
  const banner = document.getElementById("lv80WarmupBanner");
  if (!banner) return;
  if (visible) {
    banner.querySelector(".warmup-msg").textContent = message || "Lorevox is warming up…";
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

/**
 * Poll /api/warmup until the model is loaded and can generate.
 * Resolves when ready. Shows UI feedback during the wait.
 */
async function pollModelReady() {
  if (_llmReady) return;
  if (_llmWarmupPolling) return; // prevent duplicate poll loops
  _llmWarmupPolling = true;

  const POLL_INTERVAL = 5000;  // 5s between attempts
  const MAX_WAIT      = 300000; // 5 minutes max
  const startedAt     = Date.now();

  _setWarmupBanner(true, "Lorevox is warming up — model loading…");
  pill("pillChat", false);

  // Disable chat input during warmup
  const ci = document.getElementById("chatInput");
  if (ci) { ci.disabled = true; ci.placeholder = "Model loading — chat will be available shortly…"; }
  const sendBtn = document.getElementById("lv80SendBtn");
  if (sendBtn) sendBtn.disabled = true;

  while (!_llmReady && (Date.now() - startedAt) < MAX_WAIT) {
    try {
      const res = await fetch(API.WARMUP, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Hello", max_new_tokens: 4 }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.ok) {
          _llmReady = true;
          console.log("[readiness] Model warm and ready.", j.latency ? `Latency: ${j.latency}s` : "");
          break;
        }
      } else if (res.status === 507) {
        // CUDA OOM — fatal, stop polling
        console.error("[readiness] CUDA OOM during warmup — model cannot load.");
        _setWarmupBanner(true, "GPU memory error — please restart the backend.");
        _llmWarmupPolling = false;
        return;
      }
    } catch (e) {
      // Network error or timeout — backend not up yet, keep polling
      console.log("[readiness] Warmup poll failed (backend likely still loading):", e.message || e);
    }

    // Update banner with elapsed time
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    _setWarmupBanner(true, `Lorevox is warming up — model loading… (${elapsed}s)`);

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  _llmWarmupPolling = false;

  if (_llmReady) {
    _setWarmupBanner(false);
    pill("pillChat", true);
    // Re-enable chat input
    if (ci) { ci.disabled = false; ci.placeholder = "Type or speak…"; }
    if (sendBtn) sendBtn.disabled = false;
    // Fire deferred startup actions
    _onModelReady();
  } else {
    console.warn("[readiness] Model did not become ready within 5 minutes.");
    _setWarmupBanner(true, "Model warmup timed out — please check the backend.");
  }
}

/** Called once when model transitions to ready. Triggers deferred onboarding/narrator flow. */
function _onModelReady() {
  console.log("[readiness] _onModelReady — firing deferred startup.");
  // WO-9: Drain any system prompt that was queued during startup race
  wo9DrainQueuedSystemPrompt();
  // v9: Startup neutrality — always open narrator selector on ready.
  console.log("[readiness] v9 — startup neutral. Opening narrator selector.");
  setTimeout(() => {
    if (typeof lv80OpenNarratorSwitcher === "function") lv80OpenNarratorSwitcher();
  }, 400);
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
window.onload = async () => {
  // WO-11B: hard reset trainer/capture state on startup to prevent contamination
  if (typeof window.lv80ClearTrainerAndCaptureState === "function") {
    window.lv80ClearTrainerAndCaptureState();
  }
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

  // v8.1 STARTUP NEUTRALITY: Always open to blank narrator selector.
  // The user must explicitly choose a narrator or create a new one.
  // Backend is still the authority — we validate and clean stale pointers,
  // but we never auto-load a narrator on startup.
  const saved = localStorage.getItem(LS_ACTIVE);
  const backendPeople = state?.narratorUi?.peopleCache || [];
  const backendPids = backendPeople.map(p => p.id || p.person_id || p.uuid);

  // Clean up stale narrator pointer if it no longer exists in backend
  if (saved && !backendPids.includes(saved)) {
    console.warn("[startup] Stale active narrator detected:", saved, "— not in backend list. Clearing.");
    _invalidateStaleNarrator(saved);
  }

  // v8.1: Always enter blank state — user picks their narrator from the selector.
  _enforceBlankStartupState();
  console.log("[startup] v8.1 — blank state enforced. User must select a narrator.");

  // Phase Q.4: READINESS GATE — defer onboarding/narrator-selection until
  // the LLM is actually loaded and warm. This prevents trust-breaking behavior
  // where Lori speaks with raw-model identity before the fine-tuned model is ready.
  // _onModelReady() will fire the appropriate startup flow once warm.
  pollModelReady();

  // Step 3 — log device context block on every session start for diagnostics.
  const _dc = {
    date:     new Intl.DateTimeFormat("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" }).format(new Date()),
    time:     new Intl.DateTimeFormat("en-US", { hour:"numeric", minute:"2-digit", hour12:true }).format(new Date()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  console.log("[device_context]", _dc);
};

/* ═══════════════════════════════════════════════════════════════
   v8.0 STARTUP NEUTRALITY HELPERS
═══════════════════════════════════════════════════════════════ */
/**
 * Invalidate all cached state for a narrator that no longer exists in the backend.
 * This prevents ghost narrators from surviving across deletions and restarts.
 */
function _invalidateStaleNarrator(stalePid) {
  try { localStorage.removeItem(LS_ACTIVE); } catch(_) {}
  try { localStorage.removeItem("lorevox_offline_profile_" + stalePid); } catch(_) {}
  try { localStorage.removeItem("lorevox_proj_draft_" + stalePid); } catch(_) {}
  try { localStorage.removeItem("lorevox_qq_draft_" + stalePid); } catch(_) {}
  try { localStorage.removeItem("lorevox.spine." + stalePid); } catch(_) {}
  try { localStorage.removeItem(LS_DONE(stalePid)); } catch(_) {}
  try { localStorage.removeItem(LS_SEGS(stalePid)); } catch(_) {}
  try { localStorage.removeItem("lorevox_offline_people"); } catch(_) {}
  console.log("[startup] Invalidated stale narrator cache:", stalePid);
}

/**
 * Force a clean blank startup state when backend has zero narrators.
 * Clears all narrator-scoped state so the UI renders a true blank slate.
 */
function _enforceBlankStartupState() {
  // Clear global narrator pointer
  state.person_id = null;
  try { localStorage.removeItem(LS_ACTIVE); } catch(_) {}

  // Clear profile/projection/questionnaire in-memory state
  state.profile = { basics: {}, kinship: [], pets: [] };
  if (state.interviewProjection) {
    state.interviewProjection.personId = null;
    state.interviewProjection.fields = {};
    state.interviewProjection.pendingSuggestions = [];
    state.interviewProjection.syncLog = [];
  }

  // Clear identity phase state
  if (state.session) {
    state.session.identityPhase = null;
    state.session.identityCapture = { name: null, dob: null, birthplace: null };
  }

  // Invalidate any stale offline people cache
  try { localStorage.removeItem("lorevox_offline_people"); } catch(_) {}

  // v8.0 FIX: Also scan for and remove orphaned narrator-scoped keys
  // that point to narrators no longer in the backend.
  // NOTE: lorevox.spine.* keys are intentionally PRESERVED here so that
  // loadPerson → loadSpineLocal can restore the timeline after reload.
  // Spine cleanup for deleted/stale narrators is handled by
  // _invalidateStaleNarrator() and the narrator-delete flow.
  try {
    const keys = Object.keys(localStorage);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.startsWith("lorevox_offline_profile_") ||
          k.startsWith("lorevox_proj_draft_") ||
          k.startsWith("lorevox_qq_draft_") ||
          k.startsWith("lv_done_") ||
          k.startsWith("lv_segs_") ||
          // FIX-9: Also clean up FT draft, LT draft, deleted narrator backup, and draft PIDs
          k.startsWith("lorevox_ft_draft_") ||
          k.startsWith("lorevox_lt_draft_") ||
          k.startsWith("lorevox_deleted_narrator_backup") ||
          k === "lorevox_draft_pids") {
        localStorage.removeItem(k);
      }
    }
  } catch(_) {}

  // Update header to blank state
  if (typeof lv80UpdateActiveNarratorCard === "function") {
    lv80UpdateActiveNarratorCard();
  }

  console.log("[startup] Enforced blank startup state — no active narrator.");
}

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

  // WO-10G: cameraActive must be true for visual signals to be considered.
  // Prevents stale signals leaking through the 8s window after camera off.
  const hasFreshLiveAffect = !!(
    cameraActive && vs && vs.affectState && vs.timestamp && (Date.now() - vs.timestamp < 8000)
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
    /* WO-S3: Projection family snapshot — injects parent/sibling names + occupations.
       Phase G: Read from in-memory canonical state (loaded from backend), NOT directly
       from localStorage. Falls back to localStorage only if in-memory is empty. */
    projection_family: (function() {
      try {
        const pid = state.session?.personId || state.currentPersonId || state.person_id;
        if (!pid) return null;
        // Phase G: prefer in-memory projection (backend-loaded)
        let fields = null;
        const iProj = state.interviewProjection;
        if (iProj && iProj.personId === pid && iProj.fields && Object.keys(iProj.fields).length > 0) {
          fields = iProj.fields;
        }
        // Fallback to localStorage transient draft if in-memory empty
        if (!fields) {
          const raw = localStorage.getItem("lorevox_proj_draft_" + pid);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          fields = (parsed && parsed.d && parsed.d.fields) || (parsed && parsed.fields) || parsed || {};
        }
        // Helper: projection fields are {value:"...", source:"...", ...} envelopes
        const v = (f) => { const e = fields[f]; return (e && typeof e === "object" ? e.value : e) || ""; };
        const fam = { parents: [], siblings: [] };
        // Collect parents — dedup by (name, relation) to avoid accumulation
        const seenParents = new Set();
        for (let i = 0; i < 10; i++) {
          const fn = v("parents[" + i + "].firstName");
          const ln = v("parents[" + i + "].lastName");
          const rel = v("parents[" + i + "].relation");
          const occ = v("parents[" + i + "].occupation");
          if (fn || ln) {
            const name = (fn + " " + ln).trim();
            const key = (name + "|" + rel).toLowerCase();
            if (!seenParents.has(key)) {
              seenParents.add(key);
              fam.parents.push({ name: name, relation: rel, occupation: occ });
            }
          }
        }
        // Collect siblings — dedup by (name, relation)
        const seenSiblings = new Set();
        for (let i = 0; i < 20; i++) {
          const fn = v("siblings[" + i + "].firstName");
          const ln = v("siblings[" + i + "].lastName");
          const rel = v("siblings[" + i + "].relation");
          if (fn || ln) {
            const name = (fn + " " + ln).trim();
            const key = (name + "|" + rel).toLowerCase();
            if (!seenSiblings.has(key)) {
              seenSiblings.add(key);
              fam.siblings.push({ name: name, relation: rel });
            }
          }
        }
        return (fam.parents.length || fam.siblings.length) ? fam : null;
      } catch (_) { return null; }
    })(),
    /* WO-9: person_id for backend conversation memory context builder */
    person_id: state.person_id || null,
    /* WO-10: conversation state for adaptive memory context */
    conversation_state: _wo10DetectConversationState(),
    /* WO-10C: cognitive support mode — narrator-scoped dementia-safe flag.
       When true, backend shifts to extended silence, invitational prompts,
       single-thread context, no correction, no observation language. */
    cognitive_support_mode: !!(state.session?.cognitiveSupportMode),
  };
}

/**
 * WO-10 Phase 5: Lightweight conversation state detection.
 * Returns: storytelling | answering | reflecting | correcting | searching_memory | emotional_pause | null
 */
let _wo10LastUserText = "";
function _wo10DetectConversationState() {
  const text = _wo10LastUserText || "";
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  const len = lower.length;

  let result = null;

  // Correcting: "no, actually...", "I meant...", "let me correct..."
  if (/^(no[,.]?\s+(actually|wait|that'?s not|i meant)|let me correct|i should clarify|that'?s wrong)/i.test(lower)) {
    result = "correcting";
  }
  // Emotional pause: very short after long, or explicit emotional markers
  else if (len < 20 && /\b(yeah|mmm|hmm|oh|sigh)\b/i.test(lower)) {
    result = "emotional_pause";
  }
  else if (/\b(hard to talk about|still miss|tears|crying|breaks my heart)\b/i.test(lower)) {
    result = "emotional_pause";
  }
  // Searching memory: "I'm trying to remember...", "let me think..."
  else if (/\b(trying to remember|let me think|i can'?t recall|what was|where was)\b/i.test(lower)) {
    result = "searching_memory";
  }
  // Reflecting: thoughtful, measured responses with qualifiers
  else if (/\b(looking back|in hindsight|when i think about|i realize now|i suppose)\b/i.test(lower)) {
    result = "reflecting";
  }
  // Storytelling: long narrative (>200 chars with conjunctions and temporal markers)
  else if (len > 200 && /\b(and then|so we|after that|the next|one day|that was when)\b/i.test(lower)) {
    result = "storytelling";
  }
  // Answering: short-to-medium direct responses
  else if (len < 200) {
    result = "answering";
  }
  // Default for longer text
  else {
    result = "storytelling";
  }

  // WO-10B: Expose state for no-interruption engine
  _wo10bCurrentConversationState = result;
  window._wo10bCurrentConversationState = result;
  return result;
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
    let items=j.items||j.people||j||[];
    // WO-11B: filter to Hornelore family only
    if (typeof _horneloreFilterVisiblePeople === "function") {
      items = _horneloreFilterVisiblePeople(items);
    }
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
  // FIX-2: Clear stale narrator state from header before creating new narrator.
  // Without this, the header card briefly shows the previous narrator's DOB/POB.
  state.profile = { basics: {}, kinship: [], pets: [] };
  if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();
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
  const _prevPersonId = state.person_id;
  state.person_id=pid;
  document.getElementById("activePerson").textContent=`person_id: ${pid}`;
  localStorage.setItem(LS_ACTIVE,pid);
  // WO-2: Send sync_session to backend when person changes
  if(ws && wsReady && pid !== _prevPersonId){
    ws.send(JSON.stringify({type:"sync_session",person_id:pid,
      old_conv_id:state.chat?.conv_id||""}));
    const ci=document.getElementById("chatInput");
    if(ci){ ci.disabled=true; ci.placeholder="Syncing session…"; }
  }
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

  // v8: auto-initialize interview projection from localStorage
  // This fixes the bug where projection state is empty after reload
  // despite data existing in localStorage under lorevox_proj_draft_<pid>.
  if (typeof _ivResetProjectionForNarrator === "function") {
    _ivResetProjectionForNarrator(pid);
  }

  // FIX-8: Seed identity projection fields from profile for narrators created
  // via "+New" (which bypass the identity onboarding phase). Without this,
  // narrator-2+ would have empty identity fields in the projection even though
  // the profile has fullName, preferredName, dateOfBirth, placeOfBirth.
  if (typeof LorevoxProjectionSync !== "undefined" && state.interviewProjection) {
    var basics = state.profile?.basics || {};
    var projFields = state.interviewProjection.fields || {};
    var identityMap = {
      "personal.fullName": basics.fullname || basics.fullName || "",
      "personal.preferredName": basics.preferred || basics.preferredName || "",
      "personal.dateOfBirth": basics.dob || basics.dateOfBirth || "",
      "personal.placeOfBirth": basics.pob || basics.placeOfBirth || ""
    };
    Object.keys(identityMap).forEach(function(fp) {
      var val = identityMap[fp];
      var existingVal = projFields[fp] ? projFields[fp].value : null;
      // Seed if empty OR if existing value doesn't match profile (stale cross-narrator data)
      if (val && (!existingVal || existingVal !== val)) {
        LorevoxProjectionSync.projectValue(fp, val, {
          source: "profile_seed",
          confidence: 1.0,
          turnId: "profile-init-" + pid.slice(0, 8)
        });
      }
    });
  }

  // v8.0 FIX: Ensure header card reflects loaded narrator immediately.
  // This fixes the header showing "Choose a narrator" when a valid narrator
  // is loaded, and ensures DOB/POB appear in the header on page reload.
  if (typeof lv80UpdateActiveNarratorCard === "function") {
    lv80UpdateActiveNarratorCard();
  }
}

/* ═══════════════════════════════════════════════════════════════
   v8 NARRATOR SWITCH SAFETY
   Central narrator switch with hard reset + hydration.
   Works even when Bio Builder popover is closed.
═══════════════════════════════════════════════════════════════ */
async function lvxSwitchNarratorSafe(pid){
  if (!pid) return;
  if (pid === state.person_id) return;

  // WO-11B: hard reset trainer/capture state before any narrator switch
  if (typeof window.lv80ClearTrainerAndCaptureState === "function") {
    window.lv80ClearTrainerAndCaptureState();
  }

  // ── v9.0 HARD RESET on narrator switch ──────────────────────
  // Purge ALL narrator-scoped state so nothing bleeds across narrators.

  // 1. Clear conversation session — this is the #1 source of context bleed.
  //    The backend loads turn history by conv_id; if we reuse it, Lori sees
  //    the OLD narrator's entire conversation.
  // v9.0 FIX: Generate a FRESH conv_id instead of null.
  // null falls back to "default" which is shared by ALL narrators.
  state.chat.conv_id = "switch_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,6);

  // 2. Clear interview session — prevents stale interview questions
  state.interview = state.interview || {};
  state.interview.session_id  = null;
  state.interview.question_id = null;
  state.interview.plan_id     = null;

  // 3. Clear identity onboarding state
  state.session.identityPhase   = null;
  state.session.identityCapture = { name: null, dob: null, birthplace: null };
  state.session.speakerName     = null;
  state.session.assistantRole   = "interviewer";

  // 4. Clear runtime signals that are narrator-specific
  state.session.currentPass = "pass1";
  state.session.currentEra  = null;
  state.session.currentMode = "open";
  state.session.confusionTurnCount = 0;

  // 5. Clear in-memory text state
  lastAssistantText = "";
  currentAssistantBubble = null;
  _lastUserTurn = "";

  // hard clear narrator-scoped UI before profile hydration
  if (window.LorevoxBioBuilder?.onNarratorSwitch) {
    window.LorevoxBioBuilder.onNarratorSwitch(pid);
  }

  // v8: reset interview projection for incoming narrator
  if (typeof _ivResetProjectionForNarrator === "function") {
    _ivResetProjectionForNarrator(pid);
  }

  // clear narrator-scoped visible UI
  try {
    document.getElementById("chatMessages").innerHTML = "";
  } catch (_) {}

  if (typeof _memoirClearContent === "function") _memoirClearContent();

  console.log("[narrator-switch] Hard reset complete — loading new narrator:", pid);
  await loadPerson(pid);

  // Phase G: hydrate canonical state from backend state-snapshot
  // This ensures backend authority overrides any stale localStorage data
  try {
    const snapResp = await fetch(API.NARRATOR_STATE(pid));
    if (snapResp.ok) {
      const snap = await snapResp.json();
      console.log("[app] Phase G: narrator state snapshot loaded for " + pid);
      // Backend questionnaire overwrites in-memory if non-empty
      if (snap.questionnaire && Object.keys(snap.questionnaire).length > 0) {
        const bb = state.bioBuilder;
        if (bb) {
          bb.questionnaire = snap.questionnaire;
          try { localStorage.setItem("lorevox_qq_draft_" + pid, JSON.stringify({ v: 1, d: snap.questionnaire })); } catch(_){}
        }
      }
      // Backend projection overwrites in-memory if non-empty
      if (snap.projection && snap.projection.fields && Object.keys(snap.projection.fields).length > 0) {
        const iProj = state.interviewProjection;
        if (iProj) {
          iProj.fields = snap.projection.fields;
          iProj.pendingSuggestions = snap.projection.pendingSuggestions || [];
        }
      }
    }
  } catch (e) {
    console.warn("[app] Phase G: state-snapshot fetch failed (proceeding with local data)", e);
  }

  // run a second hydration after profile is loaded
  if (window.LorevoxBioBuilder?.onNarratorSwitch) {
    window.LorevoxBioBuilder.onNarratorSwitch(pid);
  }

  if (window.LorevoxBioBuilder?.refresh) window.LorevoxBioBuilder.refresh();
  if (window.LorevoxLifeMap?.render)     window.LorevoxLifeMap.render(true);

  // WO-8: Load transcript history and fire resume prompt
  if (typeof wo8OnNarratorReady === "function") {
    wo8OnNarratorReady(pid).catch(e => console.log("[WO-8] narrator ready hook failed:", e.message));
  }
}

/* ═══════════════════════════════════════════════════════════════
   v9 NARRATOR OPEN GATING — readiness classification
   Returns "ready" | "incomplete" | "missing" | "new"
   Single source of truth for narrator conversation-readiness.
═══════════════════════════════════════════════════════════════ */
function getNarratorOpenState(pid) {
  if (!pid) return "new";
  if (!state.person_id || state.person_id !== pid) return "missing";

  const basics = state.profile?.basics || {};
  const hasName = !!(basics.preferred || basics.fullname);
  const hasDob  = !!basics.dob;

  if (hasName && hasDob) return "ready";
  return "incomplete";
}

/* Expose globally for lori9.0.html */
window.getNarratorOpenState = getNarratorOpenState;

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

  // Hornelore: remember deleted label so auto-seed does not immediately recreate
  if (state.narratorDelete && state.narratorDelete.targetLabel) {
    _horneloreMarkDeletedNarrator(state.narratorDelete.targetLabel);
  }

  // clear active pointer if needed
  if (state.person_id === pid) {
    state.person_id = null;
    localStorage.removeItem(LS_ACTIVE);
  }

  // v8.0 FIX: Clean up ALL offline caches for deleted narrator to prevent ghost narrators
  // Phase 5: Added ft_draft and lt_draft cleanup, plus sources_draft
  try {
    localStorage.removeItem("lorevox_offline_profile_" + pid);
    localStorage.removeItem("lorevox_proj_draft_" + pid);
    localStorage.removeItem("lorevox_qq_draft_" + pid);
    localStorage.removeItem("lorevox_ft_draft_" + pid);
    localStorage.removeItem("lorevox_lt_draft_" + pid);
    localStorage.removeItem("lorevox_sources_draft_" + pid);
    localStorage.removeItem("lorevox.spine." + pid);
    localStorage.removeItem(LS_DONE(pid));
    localStorage.removeItem(LS_SEGS(pid));
  } catch(_) {}
  // Phase 5: Also clear from bio-builder-core draft index
  try {
    var bbCore = window.LorevoxBioBuilderModules && window.LorevoxBioBuilderModules.core;
    if (bbCore && bbCore._clearDrafts) bbCore._clearDrafts(pid);
  } catch(_) {}
  // Refresh the offline people cache
  try { localStorage.removeItem("lorevox_offline_people"); } catch(_) {}
  // Phase 5.2: Verify no orphaned narrator-scoped draft keys remain
  try {
    var _orphanCheck = ["lorevox_offline_profile_","lorevox_proj_draft_","lorevox_qq_draft_",
      "lorevox_ft_draft_","lorevox_lt_draft_","lorevox_sources_draft_","lorevox.spine."];
    var _orphans = _orphanCheck.filter(function(prefix) { return localStorage.getItem(prefix + pid) !== null; });
    if (_orphans.length) {
      console.warn("[narrator-delete] Orphaned keys found after cleanup:", _orphans.map(function(p){return p+pid;}));
    } else {
      console.log("[narrator-delete] Cleanup verified — no orphaned draft keys for pid=" + pid.slice(0,8));
    }
  } catch(_) {}

  // v8.0 FIX: Update header to blank state if deleted narrator was active
  if (typeof lv80UpdateActiveNarratorCard === "function") {
    lv80UpdateActiveNarratorCard();
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
      ${["Mother","Father","Stepmother","Stepfather","Sister","Brother","Half-sister","Half-brother","Stepsister","Stepbrother","Adoptive sister","Adoptive brother","Sibling","Spouse","Partner","Child","Step-parent","Step-child","Adoptive parent","Adoptive mother","Adoptive father","Adopted child","Grandparent","Grandmother","Grandfather","Grandparent-guardian","Grandchild","Nephew","Niece","Cousin","Aunt","Uncle","Former spouse","Guardian","Chosen family","Other"]
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

    // v8.0 FIX: Immediately project name into profile and projection state
    if(!state.profile) state.profile = {basics:{}, kinship:[], pets:[]};
    state.profile.basics.preferred = name;
    state.profile.basics.fullname  = name;
    if (typeof LorevoxProjectionSync !== "undefined" && state.interviewProjection) {
      LorevoxProjectionSync.projectValue("personal.fullName", name, {
        source: "interview", turnId: "identity-name", confidence: 0.95
      });
      LorevoxProjectionSync.projectValue("personal.preferredName", name, {
        source: "interview", turnId: "identity-name", confidence: 0.95
      });
    }
    // v8.0 FIX: Update narrator header card immediately
    if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();

    // v9.0 FIX: Check if the user also provided DOB in the same message.
    // e.g. "tom and i was born july 3 1942" — extract both, skip the DOB question.
    const _embeddedDob = _parseDob(text);
    if (_embeddedDob) {
      state.session.identityCapture.dob = _embeddedDob;
      state.session.identityPhase = "askBirthplace";
      if(!state.profile) state.profile = {basics:{}, kinship:[], pets:[]};
      state.profile.basics.dob = _embeddedDob;
      if (typeof LorevoxProjectionSync !== "undefined" && state.interviewProjection) {
        LorevoxProjectionSync.projectValue("personal.dateOfBirth", _embeddedDob, {
          source: "interview", turnId: "identity-dob", confidence: 0.9
        });
      }
      if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();
      // Check for embedded birthplace too: "born july 3 1942 in Rugby ND"
      const _pobInName = text.match(/\bin\s+([A-Z][a-zA-Z\s,]+?)(?:\.|$)/i);
      if (_pobInName && _pobInName[1] && _pobInName[1].trim().length >= 3) {
        state.session.identityCapture._embeddedPob = _pobInName[1].trim().replace(/[,.\s]+$/, "");
      }
      console.log("[identity] Name + DOB extracted from single message:", name, _embeddedDob);
      sendSystemPrompt(
        `[SYSTEM: SPEAKER IDENTITY — The person is named "${name}", born ${_embeddedDob}. ` +
        `You are Lori, the interviewer. Use "${name}" when addressing the speaker. ` +
        `Acknowledge their name and date of birth warmly. ` +
        `Then ask where they were born — town, city, or region. One question only.]`
      );
      return true;
    }

    // No embedded DOB — ask for it separately
    state.session.identityPhase = "askDob";
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

    // v8.0 FIX: Immediately project DOB into profile and projection state
    if (dob) {
      if(!state.profile) state.profile = {basics:{}, kinship:[], pets:[]};
      state.profile.basics.dob = dob;
      if (typeof LorevoxProjectionSync !== "undefined" && state.interviewProjection) {
        LorevoxProjectionSync.projectValue("personal.dateOfBirth", dob, {
          source: "interview", turnId: "identity-dob", confidence: 0.95
        });
      }
      // v8.0 FIX: Update narrator header card with DOB
      if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();
    }

    // v8.0 FIX: Check if POB is embedded in the DOB answer (e.g. "born July 26 1943 in Dartford")
    const _pobFromDob = text.match(/\bin\s+([A-Z][a-zA-Z\s,]+?)(?:\.|$)/i);
    if (_pobFromDob && _pobFromDob[1]) {
      const embeddedPob = _pobFromDob[1].trim().replace(/[,.\s]+$/, "");
      if (embeddedPob.length >= 3) {
        state.session.identityCapture._embeddedPob = embeddedPob;
      }
    }
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
    // v8.0 FIX: Extract place from the answer instead of using the raw text.
    let birthplace = text.trim();

    // BEST SOURCE: If the DOB answer already contained a place ("born in Dartford"),
    // prefer that extracted value over anything in this answer.
    if (state.session.identityCapture._embeddedPob) {
      birthplace = state.session.identityCapture._embeddedPob;
    } else {
      // Try structured extraction: "in X", "from X"
      const _placePatterns = [
        /\b(?:born|grew up|raised|from|lived)\s+(?:in|at|near)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,?\s+(?:and|my|I|we|the|where|when|\d))/i,
      ];
      for (const pat of _placePatterns) {
        const m = text.match(pat);
        if (m && m[1] && m[1].trim().length >= 3 && m[1].trim().length < 80) {
          birthplace = m[1].trim().replace(/[,.\s]+$/, "");
          break;
        }
      }

      // If still a long narrative, truncate to first clause
      if (birthplace.length > 80) {
        const firstClause = text.split(/[.!?,]/)[0].trim();
        if (firstClause.length < 80) birthplace = firstClause;
      }
    }

    state.session.identityCapture.birthplace = birthplace;

    // v8.0 FIX: Immediately project POB into profile and projection state
    if(!state.profile) state.profile = {basics:{}, kinship:[], pets:[]};
    state.profile.basics.pob = birthplace;
    if (typeof LorevoxProjectionSync !== "undefined" && state.interviewProjection) {
      LorevoxProjectionSync.projectValue("personal.placeOfBirth", birthplace, {
        source: "interview", turnId: "identity-pob", confidence: 0.9
      });
    }
    // v8.0 FIX: Update narrator header card with POB
    if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();

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
    // v8.0 FIX: If a person_id already exists in state, PATCH the existing
    // person instead of creating a duplicate. This prevents person duplication
    // when the identity gate runs on an already-selected narrator.
    if (state.person_id) {
      pid = state.person_id;
      const patchResp = await fetch(API.PERSON(pid), {
        method: "PATCH",
        headers: ctype(),
        body: JSON.stringify({
          display_name:   name,
          date_of_birth:  dob  || undefined,
          place_of_birth: pob  || undefined,
        }),
      });
      if (!patchResp.ok) console.warn("[identity] PATCH failed:", patchResp.status);
      else console.log("[identity] Patched existing person:", pid);
    } else {
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
      if (!r.ok) {
        console.error("[identity] POST /api/people failed:", r.status, await r.text().catch(()=>""));
        sysBubble("Could not save narrator to the server — please check the API backend.");
      } else {
        const j = await r.json();
        pid = j.id || j.person_id;
        console.log("[identity] Created new person:", pid);
      }
    }
  }catch(e){
    console.error("[identity] create/patch person failed:", e);
    sysBubble("Could not reach the server to save this narrator. The API may be down.");
  }

  state.session.identityPhase = "complete";
  setAssistantRole("interviewer");

  // v8.1: Mark this device as onboarded so future startups skip the welcome flow
  // and go straight to the narrator selector instead.
  try { localStorage.setItem("lorevox_device_onboarded", "1"); } catch(_) {}

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
    // v8.0 FIX: Update header AFTER re-applying identity anchors.
    // loadPerson() called lv80UpdateActiveNarratorCard() with the empty server profile,
    // so we must call it again now that basics are re-applied.
    if (typeof lv80UpdateActiveNarratorCard === "function") lv80UpdateActiveNarratorCard();
    // Save the profile so DOB + birthplace persist
    await saveProfile();
    // v8.1: After identity capture, explain mic/camera options before starting the interview.
    // This is the natural moment to ask — Lori has just met the user and is about to begin.
    sendSystemPrompt(
      `[SYSTEM: You have successfully captured ${name}'s identity. ` +
      `They were born in ${pob || "an unspecified location"}. ` +
      `Acknowledge their birthplace warmly (one sentence — mention it by name). ` +
      `Then, before starting the interview, briefly explain two things: ` +
      `1) They can speak to you using the microphone button, or type — whichever feels more comfortable. ` +
      `You can also speak your replies aloud. ` +
      `2) The camera is completely optional — if they turn it on, you can use it to read their ` +
      `expressions and pace the conversation more gently. The camera stays on this device and ` +
      `you never save video. They can turn it on or off anytime using the settings gear icon. ` +
      `Keep this explanation warm and brief — two to three sentences, not a list. ` +
      `Then ask if they have any questions, or if they're ready to begin. ` +
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
  // Phase Q.4: Block user sends while model is still warming up
  if (!_llmReady) {
    appendBubble("ai", "Lorevox is still warming up — please wait a moment for the model to finish loading.");
    return;
  }
  // v7.4D — Phase 7: capture for post-reply fact extraction.
  _lastUserTurn = text;
  // WO-10: Update conversation state detector
  _wo10LastUserText = text;
  // v7.4D — stop recording immediately on send so we don't capture background
  // audio or Lori's incoming response. Mic stays off; user re-enables when ready.
  if(isRecording) stopRecording();
  // WO-10H: Release narrator turn-claim on Send
  if (typeof wo10hReleaseTurn === "function") wo10hReleaseTurn("send_submitted");

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

  // v8.0 / WO-deferred — queue free-form extraction instead of firing immediately.
  // Extraction will flush after Lori finishes responding (WS done / SSE complete).
  if(!state.interview.session_id && typeof _extractAndProjectMultiField === "function"){
    state.interviewProjection = state.interviewProjection || {};
    state.interviewProjection._pendingExtraction = {
      answerText: text,
      turnId: "turn-" + Date.now(),
      queuedAt: Date.now(),
      source: "sendUserMessage.freeform"
    };
    console.log("[extract][queue] deferred free-form extraction queued");
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
    const _llmT = (window._lv10dLlmParams && window._lv10dLlmParams.temperature) || 0.7;
    const _llmM = (window._lv10dLlmParams && window._lv10dLlmParams.max_new_tokens) || 512;
    ws.send(JSON.stringify({type:"start_turn",session_id:state.chat.conv_id||"default",
      message:payload,params:{person_id:state.person_id,temperature:_llmT,max_new_tokens:_llmM,runtime71:_rt71}}));
    // Safety timeout: if no response within 30s, unstick the UI
    // WO-S3: Guard against stacked unavailable messages — only show once
    const _sendTimestamp = Date.now();
    setTimeout(()=>{
      if(!currentAssistantBubble){
        // Prevent stacked error messages: check if a recent error bubble already exists
        const chatLog = document.getElementById("chatLog");
        const lastBubble = chatLog && chatLog.lastElementChild;
        const isRecentError = lastBubble && lastBubble.textContent &&
          lastBubble.textContent.includes("Chat service unavailable") &&
          (Date.now() - _sendTimestamp) < 35000;
        if (!isRecentError) {
          appendBubble("ai","Chat service unavailable — start or restart the Lorevox AI backend to enable responses.");
        }
        setLoriState("ready");
      }
    }, 30000);
    return;
  }
  await streamSse(payload);
}

async function sendSystemPrompt(instruction){
  // Phase Q.4: Block system prompts (onboarding, interview) while model is warming
  if (!_llmReady) {
    console.warn("[readiness] sendSystemPrompt blocked — model not ready yet.");
    return;
  }
  const bubble=appendBubble("ai","…");
  if(ws&&wsReady&&!usingFallback){
    const _rt71sys = buildRuntime71(); // capture before thinking resets badge
    setLoriState("thinking");
    currentAssistantBubble=bubble;
    console.log("[Lori 7.1] runtime71 (sys) → model:", JSON.stringify(_rt71sys, null, 2));
    const _llmTs = (window._lv10dLlmParams && window._lv10dLlmParams.temperature) || 0.7;
    const _llmMs = (window._lv10dLlmParams && window._lv10dLlmParams.max_new_tokens) || 512;
    ws.send(JSON.stringify({type:"start_turn",session_id:state.chat.conv_id||"default",
      message:instruction,params:{person_id:state.person_id,temperature:_llmTs,max_new_tokens:_llmMs,runtime71:_rt71sys}}));
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
  // Phase 6A: Per-turn timing/lifecycle log
  var _turnId = Date.now().toString(36);
  var _t0 = performance.now();
  var _tFirstToken = 0, _tLastToken = 0;
  console.log("[chat-turn:" + _turnId + "] user_send", { textLen: text.length, ts: new Date().toISOString() });
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
            if(!_tFirstToken) { _tFirstToken = performance.now(); console.log("[chat-turn:" + _turnId + "] first_token", { ms: Math.round(_tFirstToken - _t0) }); }
            _tLastToken = performance.now();
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
    // Phase 6A: log final token timing
    console.log("[chat-turn:" + _turnId + "] final_token", { ms: Math.round(_tLastToken - _t0), responseLen: full.length });
    setLoriState("ready");

    // WO-deferred: Flush queued extraction now that SSE stream is complete
    // Phase 6B.1: Make extraction failure non-fatal to the conversation
    if (typeof _runDeferredInterviewExtraction === "function") {
      var _tExtStart = performance.now();
      console.log("[chat-turn:" + _turnId + "] extraction_start");
      try {
        await _runDeferredInterviewExtraction();
        console.log("[chat-turn:" + _turnId + "] extraction_finish", { ms: Math.round(performance.now() - _tExtStart) });
      } catch(e) {
        // Phase 6B.1: Extraction failure is non-fatal — log and continue
        console.warn("[chat-turn:" + _turnId + "] extraction_failed (non-fatal)", { error: String(e), ms: Math.round(performance.now() - _tExtStart) });
      }
    }
  }catch(err){
    // Phase 6A: log websocket/fetch error
    console.error("[chat-turn:" + _turnId + "] ws_error", { error: String(err), ms: Math.round(performance.now() - _t0) });
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

  // WO-9: Chunk long user turns before extraction for better coverage
  const chunks = (typeof _wo8ChunkText === "function" && userText && userText.length > 1200)
    ? _wo8ChunkText(userText, 1200) : [userText];

  const allFacts = [];
  for (let i = 0; i < chunks.length; i++) {
    const facts = _extractFacts(chunks[i], i === chunks.length - 1 ? loriText : "");
    allFacts.push(...facts);
  }

  // WO-9: Deduplicate facts by path+value
  const seen = new Set();
  const dedupedFacts = [];
  for (const f of allFacts) {
    const key = (f.path || "") + "::" + JSON.stringify(f.value ?? null);
    if (!seen.has(key)) { seen.add(key); dedupedFacts.push(f); }
  }

  if(!dedupedFacts.length) return;
  for(const f of dedupedFacts){
    try{
      await fetch(API.FACTS_ADD, {
        method:"POST", headers: ctype(), body: JSON.stringify(f),
      });
    }catch{ /* silently ignore network errors */ }
  }
  if(dedupedFacts.length){
    console.log(`[facts] extracted ${dedupedFacts.length} fact(s) from ${chunks.length} chunk(s).`);
    if(typeof updateArchiveReadiness === "function") updateArchiveReadiness();
  }
}

/* ═══════════════════════════════════════════════════════════════
   WEBSOCKET
═══════════════════════════════════════════════════════════════ */
function connectWebSocket(){
  try{
    ws=new WebSocket(API.CHAT_WS);
    ws.onopen=()=>{
      wsReady=true; usingFallback=false; pill("pillWs",true);
      // WO-2: Send sync_session packet immediately on connect
      if(state.person_id){
        ws.send(JSON.stringify({type:"sync_session",person_id:state.person_id,
          old_conv_id:state.chat?.conv_id||""}));
        // Lock chat input until session_verified
        const ci=document.getElementById("chatInput");
        if(ci){ ci.disabled=true; ci.placeholder="Syncing session…"; }
      }
    };
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

    // WO-deferred: Flush queued extraction now that Lori has finished
    if (typeof _runDeferredInterviewExtraction === "function") {
      Promise.resolve(_runDeferredInterviewExtraction()).catch(function(err) {
        console.log("[extract] deferred flush after WS done failed:", err);
      });
    }
  }
  if(j.type==="session_verified"){
    // WO-2: Unlock chat input after session handshake confirmed
    const ci=document.getElementById("chatInput");
    if(ci){ ci.disabled=false; ci.placeholder="Type a message…"; }
    console.log("[WO-2] Session verified for person_id:", j.person_id);
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
  // v7.4D+N.1-03 — speaker label with narrator identity resolution.
  // sys bubbles (status messages) skip the label.
  if(role==="user"||role==="ai"){
    const label=document.createElement("div");
    label.className="bubble-speaker";
    if(role==="ai"){
      label.textContent="Lori";
    } else {
      // N.1-03: Resolve narrator display name from multiple sources
      let uName="";
      if(typeof state!=="undefined"){
        if(state.narratorUi && state.narratorUi.activeLabel) uName=state.narratorUi.activeLabel;
        if(!uName && state.person_id && state.narratorUi && state.narratorUi.peopleCache){
          const m=state.narratorUi.peopleCache.find(p=>(p.id||p.personId)===state.person_id);
          if(m) uName=m.display_name||m.name||m.fullName||"";
        }
        if(!uName && state.session && state.session.identityCapture && state.session.identityCapture.name){
          uName=state.session.identityCapture.name;
        }
      }
      label.textContent=uName||"You";
    }
    d.appendChild(label);
  }
  const body=document.createElement("div");
  body.className="bubble-body";
  body.textContent=text;
  d.appendChild(body);
  w.appendChild(d);
  // N.1-02: Use smooth scroll via FocusCanvas scroll manager if available, else fallback
  if(typeof window._scrollChatToBottom==="function"){
    window._scrollChatToBottom();
  } else {
    w.scrollTop=w.scrollHeight;
  }
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

  // WO-10K: Canonical Web Audio API unlock pattern — create AudioContext,
  // resume it, and play a 1-sample silent buffer via BufferSource. This is
  // the most reliable way to satisfy Chrome's autoplay policy and works
  // even in hidden/background tabs (which break HTMLAudioElement.play()).
  try {
    const ctx = window._lvAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    window._lvAudioCtx = ctx;
    if (ctx.state === "suspended") ctx.resume().catch(()=>{});
    // Play a 1-sample silent buffer to fully whitelist the context.
    const silentBuf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = silentBuf;
    src.connect(ctx.destination);
    src.start(0);
    _audioUnlocked = true;
    console.log("[TTS] AudioContext unlocked via user gesture (state: " + ctx.state + ")");
  } catch(e){
    console.warn("[TTS] AudioContext unlock failed: " + (e && e.message || e));
  }

  // Also keep a persistent HTMLAudioElement as fallback path.
  try {
    _ttsAudio = new Audio();
    _ttsAudio.preload = "auto";
  } catch(_){}
}

// WO-10K: Global first-interaction listener — unlock audio on ANY user click/tap/key.
// This ensures TTS works even if the user's first action isn't Send or Mic.
(function(){
  function _globalUnlock(){
    unlockAudio();
    document.removeEventListener("click", _globalUnlock, true);
    document.removeEventListener("touchstart", _globalUnlock, true);
    document.removeEventListener("keydown", _globalUnlock, true);
  }
  document.addEventListener("click", _globalUnlock, true);
  document.addEventListener("touchstart", _globalUnlock, true);
  document.addEventListener("keydown", _globalUnlock, true);
})();

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

          // WO-10K: Use Web Audio API (AudioContext + BufferSource) instead of
          // HTMLAudioElement. HTMLAudioElement.play() hangs on blob URLs in hidden
          // tabs and has flaky autoplay whitelisting. AudioContext is already
          // running (unlocked by first user gesture) and has reliable onended.
          let playedViaWebAudio = false;
          if (window._lvAudioCtx) {
            try {
              if (window._lvAudioCtx.state === "suspended") {
                try { await window._lvAudioCtx.resume(); } catch(_){}
              }
              // decodeAudioData mutates the buffer, so pass a copy
              const audioBuffer = await window._lvAudioCtx.decodeAudioData(bytes.buffer.slice(0));
              await new Promise(res => {
                const src = window._lvAudioCtx.createBufferSource();
                src.buffer = audioBuffer;
                src.connect(window._lvAudioCtx.destination);
                // Safety timeout: duration + 2s margin
                const safetyMs = Math.ceil(audioBuffer.duration * 1000) + 2000;
                const _playTimeout = setTimeout(() => {
                  console.warn("[TTS] WebAudio playback timed out after " + safetyMs + "ms — forcing continue");
                  try { src.stop(); } catch(_){}
                  res();
                }, safetyMs);
                src.onended = () => { clearTimeout(_playTimeout); res(); };
                try { src.start(0); } catch(e) {
                  clearTimeout(_playTimeout);
                  console.warn("[TTS] WebAudio start failed: " + e.message);
                  res();
                }
              });
              playedViaWebAudio = true;
            } catch(e) {
              console.warn("[TTS] WebAudio decode/play failed, falling back to HTMLAudio: " + (e && e.message || e));
            }
          }

          // Fallback: HTMLAudioElement (only if WebAudio path didn't run)
          if (!playedViaWebAudio) {
            const blob=new Blob([bytes],{type:"audio/wav"});
            const url=URL.createObjectURL(blob);
            const a=_ttsAudio||new Audio();
            a.src=url;
            if(!_audioUnlocked){
              console.warn("[TTS] Audio not unlocked yet — skipping chunk (waiting for user gesture)");
              URL.revokeObjectURL(url);
              continue;
            }
            // WO-10J/K: Timeout safeguard — prevents isLoriSpeaking from getting
            // stuck if audio.play() hangs for any reason (network, decode, edge case).
            await new Promise(res=>{
              const _playTimeout=setTimeout(()=>{
                console.warn("[TTS] HTMLAudio playback timed out after 15s — forcing continue");
                try{ a.pause(); a.currentTime=0; }catch(_){}
                res();
              }, 15000);
              const _done=()=>{ clearTimeout(_playTimeout); res(); };
              a.onended=_done;
              a.onerror=_done;
              a.play().catch(_done);
            });
            URL.revokeObjectURL(url);
          }
        }
      }catch{}
    }
  } finally {
    // Step 3 hardening — always clear both flags on exit, even if an unexpected
    // exception escapes the inner loop. Without this, isLoriSpeaking could be
    // stuck true permanently, silently suppressing all STT forever.
    isLoriSpeaking=false;
    ttsBusy=false;

    // WO-10H: Record TTS finish time and transition narrator turn-claim if pending.
    if (state.narratorTurn) {
      state.narratorTurn.ttsFinishedAt = Date.now();
      if (state.narratorTurn.state === "awaiting_tts_end") {
        _wo10hTransitionToArmed();
      }
    }
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
function toggleRecording(){
  unlockAudio();
  // WO-10H: If Lori is still speaking TTS, claim next turn instead of starting immediately.
  if (isLoriSpeaking && !isRecording) {
    _wo10hClaimTurn();
    return;
  }
  isRecording?stopRecording():startRecording();
}
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
// WO-9: Voice send shortcut disabled by default — elderly narrators trigger it accidentally.
// Set window._wo9VoiceSendEnabled = true in console or config to re-enable.
let _wo9VoiceSendEnabled = window._wo9VoiceSendEnabled || false;

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
    // WO-9: Only if voice send is explicitly enabled
    if(_wo9VoiceSendEnabled && _SEND_COMMANDS.has(trimmed)){
      stopRecording();
      sendUserMessage();
      return;
    }
    setv("chatInput",getv("chatInput")+_normalisePunctuation(fin));
  };
  // v7.4D — only auto-restart if user explicitly left mic on AND Lori is not speaking.
  // This prevents the engine from restarting mid-TTS and catching Lori's audio.
  recognition.onend=()=>{ if(isRecording && !isLoriSpeaking){ try{ recognition.start(); }catch(e){ console.warn("[STT] auto-restart failed:",e.message); } } };
  // v8.0 — error handler: surface recognition failures to the user.
  recognition.onerror=e=>{
    console.error("[STT] recognition error:",e.error,e.message);
    if(e.error==="not-allowed"){
      stopRecording();
      sysBubble("🎤 Microphone access was denied. Please allow microphone in your browser settings and try again.");
    } else if(e.error==="no-speech"){
      // Benign — no speech detected, recognition will auto-restart via onend
      console.log("[STT] no speech detected — waiting…");
    } else if(e.error==="network"){
      stopRecording();
      sysBubble("🎤 Speech recognition requires an internet connection (Chrome sends audio to Google's servers). Please check your connection.");
    } else if(e.error==="service-not-allowed"){
      stopRecording();
      sysBubble("🎤 Speech recognition service is not available. This may happen on non-HTTPS pages or in some browser configurations.");
    } else if(e.error==="aborted"){
      // User or code called stop() — normal, no action needed
    } else {
      sysBubble("🎤 Speech recognition error: "+e.error);
    }
  };
  return recognition;
}
function startRecording(){
  const r=_ensureRecognition(); if(!r) return;
  try{
    r.start(); isRecording=true;
    _setMicVisual(true);
    setLoriState("listening");
    console.log("[STT] recognition started");
  }catch(e){
    console.error("[STT] start() failed:",e.message);
    // "already started" — just update state
    if(e.message&&e.message.includes("already started")){
      isRecording=true; _setMicVisual(true); setLoriState("listening");
    } else {
      sysBubble("🎤 Could not start voice input: "+e.message);
    }
  }
}
function stopRecording(){
  isRecording=false;
  if(recognition){ try{ recognition.stop(); }catch(e){} }
  _setMicVisual(false);
  setLoriState("ready");
}
// v8.0 — mic button visual state. Adds/removes a CSS class instead of
// replacing innerHTML (which destroyed the SVG icon).
function _setMicVisual(active){
  const btn=document.getElementById("btnMic");
  if(!btn) return;
  if(active){
    btn.classList.add("mic-active");
    btn.title="Microphone is on — click to stop";
  } else {
    btn.classList.remove("mic-active");
    btn.title="Click to toggle microphone";
  }
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
   WO-8 — TRANSCRIPT HISTORY, THREAD ANCHOR, VOICE TURN
           IMPROVEMENTS, AND RESUME LOGIC
   Kent Interaction Fixes: Voice Continuity, Transcript History,
   Resume, and Long-Turn Reliability.
═══════════════════════════════════════════════════════════════ */

/* ── WO-8 Phase 2: Transcript History ────────────────────────── */

/**
 * Load and display archived transcript history when a narrator is opened.
 * Replaces the blank chat area with prior conversation turns.
 * Each turn shows speaker label and timestamp.
 */
async function wo8LoadTranscriptHistory(pid) {
  if (!pid) return;
  try {
    const url = API.TRANSCRIPT_HISTORY(pid, "");
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.log("[WO-8] No transcript history for", pid); return; }
    const data = await res.json();
    const events = data.events || [];
    if (!events.length) { console.log("[WO-8] Transcript empty for", pid); return; }

    const chatEl = document.getElementById("chatMessages");
    if (!chatEl) return;

    // Clear existing bubbles before loading history
    chatEl.innerHTML = "";

    // Add session divider
    const divider = document.createElement("div");
    divider.className = "wo8-session-divider";
    divider.innerHTML = '<span class="wo8-divider-label">Prior conversation</span>';
    chatEl.appendChild(divider);

    // Render each archived turn (WO-9: filter/collapse system messages)
    events.forEach(ev => {
      const role = (ev.role || "").toLowerCase();
      const content = (ev.content || "").trim();
      if (!content) return;

      // WO-9: Classify system messages and skip internal ones
      const isSystemMsg = content.startsWith("[SYSTEM:") || role === "system";
      if (isSystemMsg) {
        // Skip internal system prompts — don't show to narrator
        // But log for debugging
        console.log("[WO-9] Skipping system message in transcript render:", content.slice(0, 60));
        return;
      }

      const bubbleRole = role === "assistant" ? "ai" : role === "user" ? "user" : "sys";
      const bubble = appendBubble(bubbleRole, content);

      // Add timestamp badge if available
      if (ev.ts && bubble) {
        try {
          const dt = new Date(ev.ts);
          const timeStr = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          const dateStr = dt.toLocaleDateString([], { month: "short", day: "numeric" });
          const tsBadge = document.createElement("div");
          tsBadge.className = "wo8-timestamp";
          tsBadge.textContent = `${dateStr} ${timeStr}`;
          bubble.appendChild(tsBadge);
        } catch (_) {}
      }
    });

    // Add a separator before new conversation
    const newDiv = document.createElement("div");
    newDiv.className = "wo8-session-divider";
    newDiv.innerHTML = '<span class="wo8-divider-label">Continuing</span>';
    chatEl.appendChild(newDiv);

    // Scroll to bottom
    if (typeof window._scrollChatToBottom === "function") {
      window._scrollChatToBottom();
    } else {
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    console.log("[WO-8] Loaded", events.length, "transcript events for", pid.slice(0, 8));
  } catch (e) {
    console.log("[WO-8] Transcript history load failed:", e.message);
  }
}

/**
 * Export transcript for current narrator.
 * Opens download link for .txt or .json format.
 */
function wo8ExportTranscript(format, allSessions) {
  const pid = state.person_id;
  if (!pid) { sysBubble("No narrator selected."); return; }
  let url;
  if (allSessions) {
    // WO-9: Export all sessions combined
    url = format === "json"
      ? API.TRANSCRIPT_EXPORT_ALL_JSON(pid)
      : API.TRANSCRIPT_EXPORT_ALL_TXT(pid);
  } else {
    url = format === "json"
      ? API.TRANSCRIPT_EXPORT_JSON(pid, "")
      : API.TRANSCRIPT_EXPORT_TXT(pid, "");
  }
  window.open(url, "_blank");
}
window.wo8ExportTranscript = wo8ExportTranscript;

/* ═══════════════════════════════════════════════════════════════
   WO-10 Phase 6: Transcript Viewer
   Phase 7: Resume Preview
   Phase 8: Session Timeline
   Rendered in #wo10TranscriptPopover tabs.
═══════════════════════════════════════════════════════════════ */

let _wo10ShowSystem = false;

function wo10SwitchTab(tabName) {
  document.querySelectorAll(".wo10-tab").forEach(t => t.classList.toggle("active", t.dataset.wo10Tab === tabName));
  document.getElementById("wo10TabTranscript").style.display = tabName === "transcript" ? "" : "none";
  document.getElementById("wo10TabResume").style.display = tabName === "resume" ? "" : "none";
  document.getElementById("wo10TabTimeline").style.display = tabName === "timeline" ? "" : "none";
  // Load data on tab switch
  if (tabName === "transcript") wo10LoadTranscriptViewer();
  if (tabName === "resume") wo10LoadResumePreview();
  if (tabName === "timeline") wo10LoadSessionTimeline();
}
window.wo10SwitchTab = wo10SwitchTab;

function wo10ToggleSystemMessages() {
  _wo10ShowSystem = !_wo10ShowSystem;
  const btn = document.getElementById("wo10ToggleSystem");
  if (btn) btn.textContent = _wo10ShowSystem ? "Hide System" : "Show System";
  document.querySelectorAll(".wo10-event.system").forEach(el => {
    el.classList.toggle("show-system", _wo10ShowSystem);
  });
}
window.wo10ToggleSystemMessages = wo10ToggleSystemMessages;

function wo10ClassifyEvent(evt) {
  const text = String(evt?.content || "");
  const role = (evt?.role || "").toLowerCase();
  if (text.startsWith("[SYSTEM:") || role === "system") return "system";
  if (role === "assistant") return "lori";
  return "narrator";
}

async function wo10LoadTranscriptViewer() {
  const pid = state.person_id;
  const container = document.getElementById("wo10TranscriptContent");
  if (!container || !pid) {
    if (container) container.innerHTML = '<p style="color:#64748b">No narrator selected.</p>';
    return;
  }
  container.innerHTML = '<p style="color:#64748b">Loading transcript...</p>';

  try {
    // Load sessions list first
    const sessRes = await fetch(API.TRANSCRIPT_SESSIONS(pid), { signal: AbortSignal.timeout(8000) });
    if (!sessRes.ok) throw new Error("No sessions");
    const sessData = await sessRes.json();
    const sessions = (sessData.sessions || []).sort((a, b) => (a.started_at || "").localeCompare(b.started_at || ""));

    // Load last 2 sessions for display
    const recentSessions = sessions.slice(-2);
    let html = "";

    for (const sess of recentSessions) {
      const sid = sess.session_id;
      const evtRes = await fetch(API.TRANSCRIPT_HISTORY(pid, sid), { signal: AbortSignal.timeout(8000) });
      if (!evtRes.ok) continue;
      const evtData = await evtRes.json();
      const events = evtData.events || [];

      // Session divider
      const dateStr = sess.started_at ? new Date(sess.started_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";
      html += `<div class="wo10-divider">${sess.title || "Session"} ${dateStr ? " — " + dateStr : ""}</div>`;

      for (const evt of events) {
        const cls = wo10ClassifyEvent(evt);
        const roleName = cls === "narrator" ? (state.profile?.basics?.preferred || "Narrator")
          : cls === "lori" ? "Lori" : "System";
        let tsStr = "";
        if (evt.ts) {
          try { tsStr = new Date(evt.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
          catch (_) {}
        }
        const content = (evt.content || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html += `<div class="wo10-event ${cls}${_wo10ShowSystem && cls === "system" ? " show-system" : ""}">`;
        html += `<div class="wo10-event-role">${roleName}${tsStr ? `<span class="wo10-event-ts">${tsStr}</span>` : ""}</div>`;
        html += `<div class="wo10-event-text">${content}</div></div>`;
      }
    }

    container.innerHTML = html || '<p style="color:#64748b">No transcript events found.</p>';
  } catch (e) {
    container.innerHTML = `<p style="color:#f87171">Failed to load transcript: ${e.message}</p>`;
  }
}

async function wo10LoadResumePreview() {
  const pid = state.person_id;
  const container = document.getElementById("wo10ResumeContent");
  if (!container || !pid) {
    if (container) container.innerHTML = '<p style="color:#64748b">No narrator selected.</p>';
    return;
  }
  container.innerHTML = '<p style="color:#64748b">Loading resume preview...</p>';

  try {
    const res = await fetch(API.RESUME_PREVIEW(pid), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("No preview data");
    const data = await res.json();

    const conf = data.confidence || {};
    const confLevel = conf.level || "low";
    const confScore = ((conf.score || 0) * 100).toFixed(0);
    const thread = data.selected_thread;
    const threads = data.all_threads || [];
    const scoredItems = data.scored_items || [];
    const recentTurns = data.recent_turns || [];
    const narName = state.profile?.basics?.preferred || "Narrator";

    let html = "";

    // Confidence card
    html += '<div class="wo10-resume-card">';
    html += `<div class="wo10-resume-label">Resume Confidence</div>`;
    html += `<span class="wo10-confidence ${confLevel}">${confLevel.toUpperCase()} (${confScore}%)</span>`;
    if (conf.reasons) {
      html += `<div style="margin-top:8px;font-size:12px;color:#64748b">${conf.reasons.join(", ")}</div>`;
    }
    html += '</div>';

    // Selected thread
    if (thread) {
      html += '<div class="wo10-resume-card">';
      html += '<div class="wo10-resume-label">Selected Thread</div>';
      html += `<div class="wo10-resume-value">${thread.topic_label || "General"}</div>`;
      if (thread.subtopic_label) html += `<div style="font-size:12px;color:#94a3b8">Subtopic: ${thread.subtopic_label}</div>`;
      if (thread.related_era) html += `<div style="font-size:12px;color:#94a3b8">Era: ${thread.related_era}</div>`;
      if (thread.summary) html += `<div style="margin-top:6px;font-size:13px;color:#e2e8f0">${thread.summary.slice(0, 250)}</div>`;
      html += '</div>';
    }

    // All threads (with override buttons)
    if (threads.length > 0) {
      html += '<div class="wo10-resume-card">';
      html += '<div class="wo10-resume-label">Active Threads</div>';
      for (const t of threads) {
        const isSelected = thread && t.thread_id === thread.thread_id;
        html += `<span class="wo10-thread-chip ${t.status || 'active'}"`;
        html += ` onclick="wo10SelectThread('${t.thread_id}')"`;
        html += ` title="${t.summary ? t.summary.slice(0, 100) : ''}"`;
        html += `>${isSelected ? "▶ " : ""}${t.topic_label || "?"} (${(t.score || 0).toFixed(1)})</span>`;
      }
      html += '</div>';
    }

    // Key memory items
    if (scoredItems.length > 0) {
      html += '<div class="wo10-resume-card">';
      html += '<div class="wo10-resume-label">Key Memory</div>';
      for (const item of scoredItems.slice(0, 6)) {
        const kind = item.kind || "fact";
        html += `<div style="font-size:13px;margin-bottom:4px;color:#e2e8f0">[${kind}] ${(item.text || "").slice(0, 120)}</div>`;
      }
      html += '</div>';
    }

    // Recent turns
    if (recentTurns.length > 0) {
      html += '<div class="wo10-resume-card">';
      html += '<div class="wo10-resume-label">Recent Exchange</div>';
      for (const t of recentTurns) {
        const role = (t.role || "").toLowerCase() === "user" ? narName : "Lori";
        html += `<div style="font-size:13px;margin-bottom:4px"><strong>${role}:</strong> ${(t.content || "").slice(0, 150)}</div>`;
      }
      html += '</div>';
    }

    // Operator controls
    html += '<div style="margin-top:16px">';
    html += '<button class="wo10-btn primary" onclick="wo10UseResume(\'use\')">Use This Resume</button>';
    html += '<button class="wo10-btn" onclick="wo10UseResume(\'continue\')">Continue Last Topic</button>';
    html += '<button class="wo10-btn" onclick="wo10UseResume(\'fresh\')">Start Fresh Gently</button>';
    html += '</div>';

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p style="color:#f87171">Failed to load resume preview: ${e.message}</p>`;
  }
}

function wo10SelectThread(threadId) {
  state.wo10 = state.wo10 || {};
  state.wo10.manualResumeThreadId = threadId;
  console.log("[WO-10] Operator selected thread:", threadId);
  // Refresh preview
  wo10LoadResumePreview();
}
window.wo10SelectThread = wo10SelectThread;

function wo10UseResume(action) {
  const pid = state.person_id;
  if (!pid) return;
  const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname || "the narrator";

  let prompt = "";
  if (action === "use") {
    // Build and send the resume prompt immediately
    _wo9BuildResumePrompt(pid).then(p => {
      if (p && _llmReady) sendSystemPrompt(p);
      else if (p) wo9SendOrQueueSystemPrompt(p);
    });
    console.log("[WO-10] Operator: use selected resume");
  } else if (action === "continue") {
    prompt = `[SYSTEM: ${name} is returning. Continue from whatever topic was active last time. Welcome them warmly and ask ONE follow-up question.]`;
    if (_llmReady) sendSystemPrompt(prompt); else wo9SendOrQueueSystemPrompt(prompt);
    console.log("[WO-10] Operator: continue last topic");
  } else if (action === "fresh") {
    prompt = `[SYSTEM: ${name} is returning. Start fresh gently — ask where they'd like to begin today without assuming any topic. Be warm and open.]`;
    if (_llmReady) sendSystemPrompt(prompt); else wo9SendOrQueueSystemPrompt(prompt);
    console.log("[WO-10] Operator: start fresh");
  }

  // Close the popover
  try { document.getElementById("wo10TranscriptPopover")?.hidePopover(); } catch (_) {}
}
window.wo10UseResume = wo10UseResume;

async function wo10LoadSessionTimeline() {
  const pid = state.person_id;
  const container = document.getElementById("wo10TimelineContent");
  if (!container || !pid) {
    if (container) container.innerHTML = '<p style="color:#64748b">No narrator selected.</p>';
    return;
  }
  container.innerHTML = '<p style="color:#64748b">Loading timeline...</p>';

  try {
    const res = await fetch(API.SESSION_TIMELINE(pid), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("No timeline data");
    const data = await res.json();
    const sessions = data.sessions || [];

    if (!sessions.length) {
      container.innerHTML = '<p style="color:#64748b">No sessions yet.</p>';
      return;
    }

    let html = '<div style="font-size:12px;color:#64748b;margin-bottom:12px">Session history and dominant threads</div>';
    for (const s of sessions) {
      const dateStr = s.started_at ? new Date(s.started_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "?";
      const topic = s.topic_label || "(no topic detected)";
      const era = s.active_era ? ` [${s.active_era.replace(/_/g, " ")}]` : "";
      html += `<div class="wo10-timeline-row">`;
      html += `<div class="wo10-timeline-date">${dateStr}</div>`;
      html += `<div class="wo10-timeline-topic">${topic}${era}</div>`;
      html += `<div class="wo10-timeline-turns">${s.turn_count || 0} turns</div>`;
      html += `</div>`;
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p style="color:#f87171">Failed to load timeline: ${e.message}</p>`;
  }
}

// Auto-load transcript when popover opens
(function() {
  const pop = document.getElementById("wo10TranscriptPopover");
  if (pop) {
    pop.addEventListener("toggle", (e) => {
      if (e.newState === "open") wo10LoadTranscriptViewer();
    });
  }
})();

/* ── WO-8 Phase 3: Voice Turn Improvements ───────────────────── */

/**
 * WO-10B: Transcript growth tracker for no-interruption engine.
 * Updated every time we get a final speech recognition result.
 * lv80FireCheckIn() checks this to avoid interrupting active speech.
 */
let _wo10bLastTranscriptGrowthTs = 0;
window._wo10bLastTranscriptGrowthTs = 0;  // expose for idle guard

/**
 * WO-10B: Conversation state tracker for no-interruption engine.
 * Updated after each narrator turn finalization.
 */
let _wo10bCurrentConversationState = null;
window._wo10bCurrentConversationState = null;  // expose for idle guard

/**
 * WO-8 voice turn state.
 * Tracks long-turn capture mode with operator controls.
 */
let _wo8VoicePaused = false;
let _wo8VoiceTurnChunks = [];  // accumulate speech chunks for the current turn
let _wo8VoiceTurnStart = null;
let _wo8LongTurnMode = false;  // true when narrator is in extended speech

/**
 * WO-8: Enhanced recognition result handler that accumulates speech
 * chunks without auto-sending, allowing long natural pauses.
 * The narrator must explicitly end their turn (Done button or voice command).
 */
function _wo8HandleRecognitionResult(e) {
  // Guard: if Lori is speaking, discard
  if (isLoriSpeaking) {
    console.warn("[WO-8 STT] Recognition while Lori speaking — discarded.");
    return;
  }
  // Guard: if paused
  if (_wo8VoicePaused) return;

  let fin = "";
  let interim = "";
  for (let i = e.resultIndex; i < e.results.length; i++) {
    if (e.results[i].isFinal) {
      fin += e.results[i][0].transcript;
    } else {
      interim += e.results[i][0].transcript;
    }
  }

  // Update interim display
  const statusEl = document.getElementById("wo8VoiceStatus");
  if (statusEl && interim) {
    statusEl.textContent = interim;
    statusEl.className = "wo8-voice-status wo8-listening";
  }

  if (!fin) return;

  // WO-10B: Stamp transcript growth — narrator is actively speaking
  _wo10bLastTranscriptGrowthTs = Date.now();
  window._wo10bLastTranscriptGrowthTs = _wo10bLastTranscriptGrowthTs;

  const normalized = _normalisePunctuation(fin);
  const trimmed = normalized.trim().toLowerCase();

  // Check for voice commands — WO-9: only if explicitly enabled
  if (_wo9VoiceSendEnabled && _SEND_COMMANDS.has(trimmed)) {
    _wo8FinalizeTurn();
    return;
  }

  // Accumulate the chunk
  _wo8VoiceTurnChunks.push({
    text: normalized,
    ts: Date.now(),
  });
  if (!_wo8VoiceTurnStart) _wo8VoiceTurnStart = Date.now();
  _wo8LongTurnMode = true;

  // Update the chat input with accumulated text
  const fullText = _wo8VoiceTurnChunks.map(c => c.text).join(" ");
  setv("chatInput", fullText);

  // Update the live transcript scroll area
  const transcriptEl = document.getElementById("wo8LiveTranscript");
  if (transcriptEl) {
    transcriptEl.textContent = fullText;
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  // Clear interim display
  if (statusEl) {
    statusEl.textContent = "Listening…";
    statusEl.className = "wo8-voice-status wo8-listening";
  }

  console.log("[WO-8] Voice chunk accumulated. Total chunks:", _wo8VoiceTurnChunks.length,
    "Total chars:", fullText.length);
}

/**
 * WO-8: Finalize the voice turn — send the accumulated text.
 */
function _wo8FinalizeTurn() {
  if (!_wo8VoiceTurnChunks.length) return;

  const fullText = _wo8VoiceTurnChunks.map(c => c.text).join(" ");
  setv("chatInput", fullText);

  // Stop recording before sending
  if (isRecording) stopRecording();

  // Reset turn state
  _wo8VoiceTurnChunks = [];
  _wo8VoiceTurnStart = null;
  _wo8LongTurnMode = false;

  // Clear live transcript
  const transcriptEl = document.getElementById("wo8LiveTranscript");
  if (transcriptEl) transcriptEl.textContent = "";

  // Update status
  const statusEl = document.getElementById("wo8VoiceStatus");
  if (statusEl) {
    statusEl.textContent = "Processing…";
    statusEl.className = "wo8-voice-status wo8-processing";
  }

  // Send
  sendUserMessage();
}
window._wo8FinalizeTurn = _wo8FinalizeTurn;

/**
 * WO-8: Pause voice capture without ending the turn.
 */
function wo8PauseListening() {
  _wo8VoicePaused = true;
  window._wo8VoicePaused = true;           // expose for lv80FireCheckIn guard
  if (recognition) { try { recognition.stop(); } catch (_) {} }
  // WO-8 fix: suppress Lori's idle nudge timer while paused
  if (typeof lv80ClearIdle === "function") lv80ClearIdle();
  console.log("[WO-8] Paused — mic stopped, idle nudge suppressed.");
  const statusEl = document.getElementById("wo8VoiceStatus");
  if (statusEl) {
    statusEl.textContent = "Paused";
    statusEl.className = "wo8-voice-status wo8-paused";
  }
  _updateWo8Controls();
}
window.wo8PauseListening = wo8PauseListening;

/**
 * WO-8: Resume voice capture after pause.
 */
function wo8ResumeListening() {
  _wo8VoicePaused = false;
  window._wo8VoicePaused = false;          // sync window flag
  if (!isRecording) startRecording();
  else { try { recognition.start(); } catch (_) {} }
  // WO-8 fix: re-arm Lori's idle nudge timer on resume
  if (typeof lv80ArmIdle === "function") lv80ArmIdle("resume_from_pause");
  console.log("[WO-8] Resumed — mic active, idle nudge re-armed.");
  const statusEl = document.getElementById("wo8VoiceStatus");
  if (statusEl) {
    statusEl.textContent = "Listening…";
    statusEl.className = "wo8-voice-status wo8-listening";
  }
  _updateWo8Controls();
}
window.wo8ResumeListening = wo8ResumeListening;

/**
 * WO-8: Send now button — end turn immediately.
 */
function wo8SendNow() {
  _wo8FinalizeTurn();
}
window.wo8SendNow = wo8SendNow;

/**
 * WO-8: Update visibility of voice controls.
 */
function _updateWo8Controls() {
  const pauseBtn = document.getElementById("wo8PauseBtn");
  const resumeBtn = document.getElementById("wo8ResumeBtn");
  const sendBtn = document.getElementById("wo8SendNowBtn");

  if (pauseBtn) pauseBtn.classList.toggle("hidden", _wo8VoicePaused || !isRecording);
  if (resumeBtn) resumeBtn.classList.toggle("hidden", !_wo8VoicePaused);
  if (sendBtn) sendBtn.classList.toggle("hidden", !_wo8VoiceTurnChunks.length);
}

/* ── WO-8 Phase 4: Chunked extraction for long turns ─────────── */

/**
 * WO-8: Chunk a long text into extraction-friendly segments.
 * Each chunk is roughly sentence-bounded and under maxLen tokens.
 */
function _wo8ChunkText(text, maxLen) {
  maxLen = maxLen || 1500; // ~1500 chars per chunk
  if (text.length <= maxLen) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = "";

  for (const s of sentences) {
    if ((current + s).length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/* ── WO-8 Phase 5: Thread Anchor & Resume ────────────────────── */

/**
 * WO-8: Save the current thread anchor after each meaningful exchange.
 * Called from onAssistantReply when a real conversation turn completes.
 */
async function _wo8SaveThreadAnchor(userText, loriText) {
  const pid = state.person_id;
  if (!pid) return;

  // Build a topic summary from the last exchange
  const combined = (userText || "").slice(0, 500) + " " + (loriText || "").slice(0, 500);

  // Simple topic extraction — look for era/subject signals
  let topicLabel = "";
  let topicSummary = "";

  // Try to detect the active topic from the user's words
  const topicPatterns = [
    { rx: /\b(army|military|service|enlist|deploy|stationed)\b/i, label: "Military service" },
    { rx: /\b(leav|left|moved|moving|went)\s+(home|away|out)\b/i, label: "Leaving home" },
    { rx: /\b(school|college|university|graduate|diploma)\b/i, label: "Education" },
    { rx: /\b(married|wedding|wife|husband|spouse|partner)\b/i, label: "Marriage & family" },
    { rx: /\b(job|work|career|hired|company|boss|retire)\b/i, label: "Career" },
    { rx: /\b(child|kids|son|daughter|baby|born|pregnant)\b/i, label: "Children & family" },
    { rx: /\b(church|faith|god|religion|pray)\b/i, label: "Faith & spirituality" },
    { rx: /\b(sick|hospital|health|surgery|doctor|cancer|heart)\b/i, label: "Health" },
    { rx: /\b(farm|ranch|land|crop|cattle|harvest)\b/i, label: "Farm & rural life" },
    { rx: /\b(brother|sister|sibling|twin)\b/i, label: "Siblings" },
    { rx: /\b(mom|mother|dad|father|parent|grandma|grandpa)\b/i, label: "Parents & family" },
    { rx: /\b(passed away|died|death|funeral|burial|cemetery)\b/i, label: "Loss & grief" },
  ];

  for (const p of topicPatterns) {
    if (p.rx.test(combined)) {
      topicLabel = p.label;
      break;
    }
  }

  // Build a brief summary from the user's turn
  topicSummary = (userText || "").slice(0, 300);

  const activeEra = getCurrentEra() || "";

  // WO-9: Extract continuation keywords from the exchange
  const words = combined.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 4);
  const wordFreq = {};
  words.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });
  const continuationKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(e => e[0]);

  try {
    await fetch(API.THREAD_ANCHOR_PUT, {
      method: "POST",
      headers: ctype(),
      body: JSON.stringify({
        person_id: pid,
        session_id: state.chat?.conv_id || "",
        topic_label: topicLabel,
        topic_summary: topicSummary,
        active_era: activeEra,
        last_narrator_turns: [userText || ""],
        // WO-9 stronger continuity fields
        subtopic_label: "",
        continuation_keywords: continuationKeywords,
        last_meaningful_user_turn: (userText || "").slice(0, 500),
        last_meaningful_assistant_turn: (loriText || "").slice(0, 500),
      }),
    });
    console.log("[WO-9] Thread anchor saved:", topicLabel || "(general)", "era:", activeEra || "(none)",
      "keywords:", continuationKeywords.slice(0, 5).join(", "));
  } catch (e) {
    console.log("[WO-9] Thread anchor save failed:", e.message);
  }

  // WO-9: Save rolling summary after each exchange
  _wo9SaveRollingSummary(userText, loriText, topicLabel).catch(() => {});
  // WO-10: Update multi-thread tracker via rolling summary endpoint
  _wo10UpdateThreads(topicLabel, activeEra, userText, loriText).catch(() => {});
}

/**
 * WO-9: Save rolling summary after each meaningful exchange.
 * Accumulates key facts, tracks emotional tone and open threads.
 */
async function _wo9SaveRollingSummary(userText, loriText, topicLabel) {
  const pid = state.person_id;
  if (!pid) return;

  // Load existing summary to merge
  let existing = {};
  try {
    const resp = await fetch(API.ROLLING_SUMMARY_GET(pid));
    if (resp.ok) {
      const data = await resp.json();
      existing = data.summary || {};
    }
  } catch (_) { /* first time, no summary yet */ }

  // Accumulate key facts from user text (simple extraction: sentences with proper nouns, dates, names)
  const prevFacts = existing.key_facts_mentioned || [];
  const newFacts = [];
  if (userText) {
    // Extract sentences that contain dates, names, or specific details
    const sentences = userText.match(/[^.!?]+[.!?]+/g) || [userText];
    for (const s of sentences) {
      const trimmed = s.trim();
      if (trimmed.length > 20 && trimmed.length < 300) {
        // Look for factual content: dates, proper nouns, numbers
        if (/\b(19|20)\d{2}\b/.test(trimmed) || /\b[A-Z][a-z]+\b/.test(trimmed) || /\d+/.test(trimmed)) {
          newFacts.push(trimmed);
        }
      }
    }
  }
  const allFacts = [...prevFacts, ...newFacts].slice(-50);

  // Detect emotional tone
  let tone = existing.emotional_tone || "neutral";
  if (userText) {
    const lower = userText.toLowerCase();
    if (/\b(sad|cried|crying|tears|miss|grief|lost)\b/.test(lower)) tone = "reflective/emotional";
    else if (/\b(funny|laugh|hilarious|joke|grin)\b/.test(lower)) tone = "lighthearted";
    else if (/\b(proud|accomplish|achieve|medal|honor)\b/.test(lower)) tone = "proud";
    else if (/\b(angry|mad|furious|upset|unfair)\b/.test(lower)) tone = "frustrated";
    else tone = "engaged";
  }

  // Track the last question Lori asked
  let lastQuestion = existing.last_question_asked || "";
  if (loriText) {
    const questions = loriText.match(/[^.!]+\?/g);
    if (questions && questions.length > 0) {
      lastQuestion = questions[questions.length - 1].trim();
    }
  }

  // Open threads — topics mentioned but not fully explored
  const openThreads = existing.open_threads || [];
  if (topicLabel && !openThreads.includes(topicLabel)) {
    openThreads.push(topicLabel);
  }

  try {
    await fetch(API.ROLLING_SUMMARY_PUT, {
      method: "POST",
      headers: ctype(),
      body: JSON.stringify({
        person_id: pid,
        topic_thread: topicLabel || existing.topic_thread || "",
        key_facts_mentioned: allFacts,
        emotional_tone: tone,
        last_question_asked: lastQuestion,
        narrator_preferences: existing.narrator_preferences || [],
        open_threads: openThreads.slice(-10),
      }),
    });
    console.log("[WO-9] Rolling summary saved, facts:", allFacts.length, "tone:", tone);
  } catch (e) {
    console.log("[WO-9] Rolling summary save failed:", e.message);
  }
}

/**
 * WO-10: Update multi-thread tracker.
 * Calls the backend update_active_threads via rolling summary update.
 * Thread tracking is done server-side in archive.py.
 */
async function _wo10UpdateThreads(topicLabel, era, userText, loriText) {
  const pid = state.person_id;
  if (!pid || !topicLabel) return;
  try {
    // WO-10B: Preserve more of long turns (500 chars instead of 300)
    // so backend thread scoring can assess narrative richness
    await fetch(API.UPDATE_THREADS, {
      method: "POST",
      headers: ctype(),
      body: JSON.stringify({
        person_id: pid,
        topic_label: topicLabel,
        era: era || "",
        user_text: (userText || "").slice(0, 500),
        lori_text: (loriText || "").slice(0, 500),
      }),
    });
    console.log("[WO-10] Thread update sent for:", topicLabel);
  } catch (e) {
    console.log("[WO-10] Thread update failed:", e.message);
  }
}

/**
 * WO-9: Build resume system prompt from archive memory.
 * Uses: thread anchor + rolling summary + recent archive turns.
 * Falls back to WO-8 minimal anchor if rolling summary is unavailable.
 * Returns null if no anchor exists (first session).
 */
async function _wo9BuildResumePrompt(pid) {
  if (!pid) return null;
  try {
    // Fetch all three memory sources in parallel
    const [anchorRes, summaryRes, turnsRes] = await Promise.all([
      fetch(API.THREAD_ANCHOR_GET(pid, ""), { signal: AbortSignal.timeout(5000) }),
      fetch(API.ROLLING_SUMMARY_GET(pid), { signal: AbortSignal.timeout(5000) }).catch(() => null),
      fetch(API.RECENT_TURNS(pid, "", 4), { signal: AbortSignal.timeout(5000) }).catch(() => null),
    ]);

    // Parse anchor (required)
    if (!anchorRes.ok) return null;
    const anchorData = await anchorRes.json();
    const anchor = anchorData.anchor;
    if (!anchor || !anchor.topic_summary) return null;

    // Parse rolling summary (optional)
    let summary = {};
    if (summaryRes && summaryRes.ok) {
      const sData = await summaryRes.json();
      summary = sData.summary || {};
    }

    // Parse recent turns (optional)
    let recentTurns = [];
    if (turnsRes && turnsRes.ok) {
      const tData = await turnsRes.json();
      recentTurns = tData.turns || [];
    }

    const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname || "the narrator";
    const topicLabel = anchor.topic_label || "your conversation";
    const era = anchor.active_era || "";

    let resumeText = `[SYSTEM: RESUME SESSION — ${name} is returning to continue their interview.\n`;

    // Thread anchor context
    resumeText += `Last topic: "${topicLabel}".\n`;
    if (anchor.subtopic_label) {
      resumeText += `Subtopic: "${anchor.subtopic_label}".\n`;
    }
    if (era) {
      resumeText += `Active era: "${era.replace(/_/g, " ")}".\n`;
    }

    // WO-9: Include last meaningful exchange from anchor
    if (anchor.last_meaningful_user_turn) {
      resumeText += `\nLast exchange:\n`;
      resumeText += `  ${name}: "${anchor.last_meaningful_user_turn.slice(0, 300)}"\n`;
      if (anchor.last_meaningful_assistant_turn) {
        resumeText += `  Lori: "${anchor.last_meaningful_assistant_turn.slice(0, 300)}"\n`;
      }
    }

    // WO-9: Rolling summary context
    if (summary.emotional_tone) {
      resumeText += `\nNarrator mood: ${summary.emotional_tone}.\n`;
    }
    if (summary.key_facts_mentioned && summary.key_facts_mentioned.length > 0) {
      const recentFacts = summary.key_facts_mentioned.slice(-5);
      resumeText += `Key facts from recent conversation: ${recentFacts.join("; ").slice(0, 400)}.\n`;
    }
    if (summary.open_threads && summary.open_threads.length > 0) {
      resumeText += `Open threads to explore: ${summary.open_threads.join(", ")}.\n`;
    }
    if (summary.last_question_asked) {
      resumeText += `Your last question to ${name}: "${summary.last_question_asked.slice(0, 200)}"\n`;
    }

    // WO-9: Recent archive turns for richer context
    if (recentTurns.length > 0) {
      resumeText += `\nRecent conversation excerpt:\n`;
      for (const t of recentTurns.slice(-4)) {
        const role = (t.role || "").toLowerCase();
        const label = role === "user" ? name : "Lori";
        resumeText += `  ${label}: "${(t.content || "").slice(0, 150)}"\n`;
      }
    }

    // Continuation keywords for context
    if (anchor.continuation_keywords && anchor.continuation_keywords.length > 0) {
      resumeText += `\nContext keywords: ${anchor.continuation_keywords.join(", ")}.\n`;
    }

    resumeText += `\nContinue from this topic — do NOT restart with generic identity questions about birthplace or childhood `;
    resumeText += `unless "${topicLabel}" was specifically about those topics. `;
    resumeText += `Welcome them back warmly and naturally, referencing what they were telling you last time. `;
    resumeText += `Ask ONE follow-up question that continues the thread.]`;

    console.log("[WO-9] Resume prompt built from archive memory:",
      "topic:", topicLabel, "era:", era,
      "summary:", !!summary.topic_thread, "turns:", recentTurns.length);
    return resumeText;
  } catch (e) {
    console.log("[WO-9] Resume prompt build failed:", e.message);
    return null;
  }
}

/**
 * WO-11: Start normal interview after trainer coaching flow completes.
 * Called by LorevoxTrainerNarrators.finish() when user clicks "Start Interview" or "Skip".
 */
window.lv80StartTrainerInterview = async function () {
  try {
    const basics = state.profile?.basics || {};
    const name = basics.preferred || basics.fullname || state.session?.identityCapture?.name || "there";
    const intro = "Now let\u2019s begin for real. I\u2019ll ask one gentle question at a time, and you can answer simply or tell more of the story.";

    if (typeof appendBubble === "function") {
      appendBubble("assistant", intro);
    }

    if (typeof setAssistantRole === "function") {
      setAssistantRole("interviewer");
    }

    if (typeof renderRoadmap === "function") renderRoadmap();
    if (typeof renderInterview === "function") renderInterview();
    if (typeof update71RuntimeUI === "function") update71RuntimeUI();
  } catch (e) {
    console.warn("[WO-11] unable to start trainer interview", e);
  }
};

/**
 * WO-11B: Hard reset helper for trainer/capture state.
 * Clears trainer flow, listening state, mic UI, and pending capture.
 * Called on: startup, narrator switch, trainer finish, trainer skip.
 */
window.lv80ClearTrainerAndCaptureState = function () {
  try {
    if (window.LorevoxTrainerNarrators) {
      window.LorevoxTrainerNarrators.reset();
    }
  } catch (_) {}

  try {
    listeningPaused = false;
  } catch (_) {}

  try {
    if (typeof recognition !== "undefined" && recognition) {
      recognition.onend = recognition.onend || null;
      recognition.stop();
    }
  } catch (_) {}

  try {
    isRecording = false;
  } catch (_) {}

  try {
    const mic = document.getElementById("btnMic");
    if (mic) mic.classList.remove("mic-active");
  } catch (_) {}

  try {
    const pauseBtn = document.getElementById("btnPause");
    if (pauseBtn) {
      pauseBtn.classList.remove("paused");
      pauseBtn.textContent = "Pause";
    }
  } catch (_) {}
};

/**
 * WO-11B: Pause/Resume listening toggle.
 * Pause stops speech recognition immediately and prevents auto-restart.
 * Resume returns to ready state — capture does not auto-restart.
 */
window.lv80TogglePauseListening = function () {
  try {
    const pauseBtn = document.getElementById("btnPause");

    if (!listeningPaused) {
      listeningPaused = true;

      try {
        if (typeof recognition !== "undefined" && recognition) {
          recognition.stop();
        }
      } catch (_) {}

      isRecording = false;

      const mic = document.getElementById("btnMic");
      if (mic) mic.classList.remove("mic-active");

      if (pauseBtn) {
        pauseBtn.classList.add("paused");
        pauseBtn.textContent = "Resume";
      }

      console.log("[WO-11B] listening paused");
      return;
    }

    listeningPaused = false;

    if (pauseBtn) {
      pauseBtn.classList.remove("paused");
      pauseBtn.textContent = "Pause";
    }

    console.log("[WO-11B] listening resumed");
  } catch (e) {
    console.warn("[WO-11B] pause toggle failed", e);
  }
};

/**
 * WO-8: Fire resume system prompt when narrator is opened.
 * Hooks into the narrator load flow after identity is confirmed ready.
 */
async function wo8OnNarratorReady(pid) {
  if (!pid) return;

  // Phase 2: Load transcript history
  await wo8LoadTranscriptHistory(pid);

  // WO-9/WO-10B/WO-10C: Resume flow — gated by operator mode, confidence, and CSM
  if (hasIdentityBasics74()) {

    // WO-10C: Cognitive Support Mode — replace ALL resume with gentle re-entry.
    // Never interrogative, never assume they remember where they left off.
    // The re-entry is a warm invitation, not a conversation resume.
    if (typeof getCognitiveSupportMode === "function" && getCognitiveSupportMode()) {
      const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname || "";
      const greeting = name ? `${name}, ` : "";
      const reentryPrompt = `[SYSTEM: COGNITIVE SUPPORT MODE RE-ENTRY. ${greeting}is here. `
        + "This narrator has cognitive difficulty. Do NOT ask where you left off. Do NOT reference previous sessions. "
        + "Do NOT ask 'Do you remember?' Welcome them with pure warmth — as if this is a fresh, gentle visit. "
        + "Example: 'Hello " + (name || "there") + ", it's so good to see you. I'm Lori, and I'm here to keep you company.' "
        + "One or two short, warm sentences. Then wait. Let them lead. Do not ask a question.]";
      console.log("[WO-10C] Cognitive support mode — gentle re-entry, no resume.");
      setTimeout(() => {
        if (_llmReady) sendSystemPrompt(reentryPrompt);
        else wo9SendOrQueueSystemPrompt(reentryPrompt);
      }, 1200); // slightly longer delay — no rush
      return;
    }

    // WO-10B: If operator mode is ON, show Resume Preview instead of auto-resuming
    if (window.HORNELORE_OPERATOR_MODE) {
      console.log("[WO-10B] Operator mode ON — showing Resume Preview, blocking auto-resume.");
      // Open the transcript popover to Resume Preview tab
      try {
        const pop = document.getElementById("wo10TranscriptPopover");
        if (pop && typeof pop.showPopover === "function") pop.showPopover();
        // Switch to Resume Preview tab
        if (typeof wo10SwitchTab === "function") wo10SwitchTab("resume");
      } catch (_) {}
      // Load the resume preview data
      if (typeof wo10LoadResumePreview === "function") wo10LoadResumePreview();
      // DO NOT auto-send — operator must click Use/Continue/Fresh
      return;
    }

    // WO-10B: Operator mode OFF — check resume confidence before auto-resume
    const resumePrompt = await _wo9BuildResumePrompt(pid);
    if (resumePrompt) {
      // Fetch confidence level to decide auto-resume behavior
      let confLevel = "medium";
      try {
        // WO-10K: API.RESUME_PREVIEW is a function, not a string — call it properly
        const r = await fetch(API.RESUME_PREVIEW(pid));
        if (r.ok) {
          const data = await r.json();
          confLevel = (data.confidence && data.confidence.level) || "medium";
        }
      } catch (_) {}

      if (confLevel === "high") {
        // HIGH confidence: auto-resume directly
        console.log("[WO-10B] High confidence — auto-resuming.");
        setTimeout(() => {
          if (_llmReady) sendSystemPrompt(resumePrompt);
          else wo9SendOrQueueSystemPrompt(resumePrompt);
        }, 800);
      } else if (confLevel === "medium") {
        // MEDIUM confidence: use soft confirm prompt instead of strong resume
        const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname || "the narrator";
        const softPrompt = `[SYSTEM: ${name} is returning. You have some context from last time but are not fully sure where you left off. Welcome them warmly and gently check: "Last time I think we were talking about... shall we pick up there, or would you like to go somewhere else?" One sentence only.]`;
        console.log("[WO-10B] Medium confidence — soft confirm resume.");
        setTimeout(() => {
          if (_llmReady) sendSystemPrompt(softPrompt);
          else wo9SendOrQueueSystemPrompt(softPrompt);
        }, 800);
      } else {
        // LOW confidence: gentle bridge, no assumption about topic
        const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname || "the narrator";
        const bridgePrompt = `[SYSTEM: ${name} is returning. You do not have strong context from last time. Welcome them warmly and ask an open question like "What's on your mind today?" or "Where would you like to start?" Do NOT assume any specific topic. One sentence only.]`;
        console.log("[WO-10B] Low confidence — gentle bridge.");
        setTimeout(() => {
          if (_llmReady) sendSystemPrompt(bridgePrompt);
          else wo9SendOrQueueSystemPrompt(bridgePrompt);
        }, 800);
      }
    }
  }
}
window.wo8OnNarratorReady = wo8OnNarratorReady;

/* ── WO-8 Phase 6: Anti-drift for identity extraction ────────── */

/**
 * WO-8: Check if a system prompt is drifting toward identity grounding
 * when the active thread is elsewhere.
 * Returns the corrected prompt if drift is detected, null otherwise.
 */
function _wo8CheckContinuityDrift(prompt) {
  if (!prompt) return null;
  // If we have no thread anchor, no drift detection needed
  if (!state._wo8LastTopicLabel) return null;

  const lowerPrompt = prompt.toLowerCase();
  const identityPatterns = /\b(birthplace|born in|hometown|grew up in|childhood home|where.*born|stanley|north dakota|fargo)\b/i;
  const topicLabel = state._wo8LastTopicLabel || "";

  // If prompt is pulling toward identity AND the last topic was different
  if (identityPatterns.test(lowerPrompt) && topicLabel &&
      !topicLabel.toLowerCase().includes("childhood") &&
      !topicLabel.toLowerCase().includes("birth")) {
    console.log("[WO-8] Continuity drift detected — suppressing identity grounding in favor of:", topicLabel);
    return true; // Signal drift — caller should prefer thread-based question
  }
  return null;
}

/* ── WO-8: Inject into existing hooks ────────────────────────── */

// Store the original onAssistantReply to chain our hook
const _wo8OrigOnAssistantReply = onAssistantReply;
onAssistantReply = function(text) {
  // Call original
  _wo8OrigOnAssistantReply(text);

  // WO-8: Save thread anchor after each real reply
  if (text && state.person_id && _lastUserTurn) {
    _wo8SaveThreadAnchor(_lastUserTurn, text).catch(() => {});
  }

  // WO-8: Update voice status
  const statusEl = document.getElementById("wo8VoiceStatus");
  if (statusEl && statusEl.className.includes("wo8-processing")) {
    statusEl.textContent = "Ready";
    statusEl.className = "wo8-voice-status wo8-ready";
  }
};

// Store topic label in state for drift detection
state._wo8LastTopicLabel = "";

/* ── WO-8: Override recognition result for enhanced long-turn mode ── */

/**
 * WO-8: Install enhanced recognition handler.
 * Call after _ensureRecognition() to replace the default onresult.
 */
function _wo8InstallEnhancedVoice() {
  if (!recognition) return;

  // Save original for fallback
  const origOnResult = recognition.onresult;

  recognition.onresult = function(e) {
    // If in long-turn mode (mic is on and chunks are accumulating), use WO-8 handler
    if (_wo8LongTurnMode || _wo8VoiceTurnChunks.length > 0) {
      _wo8HandleRecognitionResult(e);
      return;
    }
    // Otherwise, use the WO-8 handler for all voice input (it also handles send commands)
    _wo8HandleRecognitionResult(e);
  };

  // Enhanced onend: don't auto-restart if paused
  recognition.onend = function() {
    if (isRecording && !isLoriSpeaking && !_wo8VoicePaused) {
      try { recognition.start(); } catch (e) {
        console.warn("[WO-8 STT] auto-restart failed:", e.message);
      }
    }
  };

  console.log("[WO-8] Enhanced voice handlers installed.");
}

// Patch startRecording to install enhanced handlers
const _wo8OrigStartRecording = startRecording;
startRecording = function() {
  _wo8VoiceTurnChunks = [];
  _wo8VoiceTurnStart = null;
  _wo8LongTurnMode = false;
  _wo8VoicePaused = false;
  _wo8OrigStartRecording();
  // Install enhanced handlers after recognition is created
  setTimeout(() => _wo8InstallEnhancedVoice(), 100);
  _updateWo8Controls();
  // Update status display
  const statusEl = document.getElementById("wo8VoiceStatus");
  if (statusEl) {
    statusEl.textContent = "Listening…";
    statusEl.className = "wo8-voice-status wo8-listening";
  }
};

// Patch stopRecording to clean up
const _wo8OrigStopRecording = stopRecording;
stopRecording = function() {
  _wo8OrigStopRecording();
  _wo8VoicePaused = false;
  _updateWo8Controls();
  const statusEl = document.getElementById("wo8VoiceStatus");
  if (statusEl) {
    statusEl.textContent = "Mic off";
    statusEl.className = "wo8-voice-status";
  }
};

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

/* ═══════════════════════════════════════════════════════════════
   WO-10H: Narrator Turn-Claim Contract
   Explicit state machine for respectful narrator floor-claiming.
   States: idle → awaiting_tts_end → armed_for_narrator → recording → idle
═══════════════════════════════════════════════════════════════ */

const WO10H_SILENT_WAIT_MS   = 45000;   // 0-45s: silent wait
const WO10H_VISUAL_CUE_MS    = 45000;   // 45-60s: subtle visual cue
const WO10H_CHECKIN_MS        = 60000;   // 60s: one gentle check-in

let _wo10hTimeoutTimer    = null;
let _wo10hVisualCueTimer  = null;

/** Narrator claims the next turn while Lori TTS is still speaking. */
function _wo10hClaimTurn() {
  if (!state.narratorTurn) return;
  state.narratorTurn.state            = "awaiting_tts_end";
  state.narratorTurn.claimTimestamp    = Date.now();
  state.narratorTurn.interruptionBlock = "narrator_claimed_turn";
  state.narratorTurn.checkInFired      = false;
  state.narratorTurn.timeoutDeadline   = null;

  // Suppress idle nudges while narrator owns the floor
  if (typeof lv80ClearIdle === "function") lv80ClearIdle();

  console.log("[WO-10H] Narrator claimed turn — awaiting TTS end.");
  _wo10hSyncUI();
}
window._wo10hClaimTurn = _wo10hClaimTurn;

/** Transition from awaiting_tts_end → armed_for_narrator. Called from drainTts finally. */
function _wo10hTransitionToArmed() {
  if (!state.narratorTurn) return;
  state.narratorTurn.state            = "armed_for_narrator";
  state.narratorTurn.ttsFinishedAt    = Date.now();
  state.narratorTurn.interruptionBlock = "narrator_claimed_turn";
  state.narratorTurn.timeoutDeadline   = Date.now() + WO10H_CHECKIN_MS;

  // Suppress all idle/nudge timers — narrator owns the floor
  if (typeof lv80ClearIdle === "function") lv80ClearIdle();

  console.log("[WO-10H] TTS finished — narrator armed. Starting capture.");

  // Start recording now that TTS is done
  if (!isRecording && !_wo8VoicePaused && !listeningPaused) {
    startRecording();
    state.narratorTurn.state = "recording";
  }

  // Arm timeout timers
  _wo10hArmTimeout();
  _wo10hSyncUI();
}
window._wo10hTransitionToArmed = _wo10hTransitionToArmed;

/** Arm the staged timeout: visual cue at 45s, gentle check-in at 60s. */
function _wo10hArmTimeout() {
  _wo10hClearTimeout();
  if (!state.narratorTurn) return;

  // Visual cue at 45s
  _wo10hVisualCueTimer = setTimeout(function () {
    if (state.narratorTurn.state === "idle") return;
    // Show subtle visual cue
    const cue = document.getElementById("lv80IdleCue");
    if (cue) cue.classList.add("visible");
    console.log("[WO-10H] Visual cue — narrator still has floor.");
  }, WO10H_VISUAL_CUE_MS);

  // Gentle check-in at 60s — fires only once
  _wo10hTimeoutTimer = setTimeout(function () {
    if (state.narratorTurn.state === "idle") return;
    if (state.narratorTurn.checkInFired) return;

    state.narratorTurn.state = "timeout_check";
    state.narratorTurn.checkInFired = true;

    console.log("[WO-10H] Timeout check-in — one gentle prompt.");

    // Send one soft, non-intrusive check-in
    if (typeof sendSystemPrompt === "function") {
      sendSystemPrompt("[SYSTEM: The narrator claimed the floor but has not submitted yet. This is normal — they may be thinking or typing. Offer ONE very gentle, non-intrusive presence statement. Say something like: 'Take your time. I'm here when you're ready.' Do NOT ask a new question. Do NOT give a memory nudge. Do NOT comment on the silence. One short sentence maximum.]");
    }

    // Return to armed state after check-in — do NOT clear the claim
    state.narratorTurn.state = "armed_for_narrator";
    _wo10hSyncUI();
  }, WO10H_CHECKIN_MS);
}

function _wo10hClearTimeout() {
  if (_wo10hTimeoutTimer) { clearTimeout(_wo10hTimeoutTimer); _wo10hTimeoutTimer = null; }
  if (_wo10hVisualCueTimer) { clearTimeout(_wo10hVisualCueTimer); _wo10hVisualCueTimer = null; }
  const cue = document.getElementById("lv80IdleCue");
  if (cue) cue.classList.remove("visible");
}

/** Clear narrator turn-claim and return to idle. Called on Send, Cancel, or explicit reset. */
function wo10hReleaseTurn(reason) {
  if (!state.narratorTurn) return;
  const prev = state.narratorTurn.state;
  state.narratorTurn.state            = "idle";
  state.narratorTurn.claimTimestamp    = null;
  state.narratorTurn.timeoutDeadline   = null;
  state.narratorTurn.interruptionBlock = null;
  state.narratorTurn.checkInFired      = false;
  _wo10hClearTimeout();

  if (prev !== "idle") {
    console.log("[WO-10H] Turn released:", reason || "unknown");
  }
  _wo10hSyncUI();
}
window.wo10hReleaseTurn = wo10hReleaseTurn;

/** Cancel a pending claim (e.g. narrator decides not to speak). */
function wo10hCancelClaim() {
  if (isRecording) stopRecording();
  wo10hReleaseTurn("narrator_cancelled");
}
window.wo10hCancelClaim = wo10hCancelClaim;

/** Check if narrator turn interruption blocking is active. Used by idle/nudge guards. */
function wo10hIsNarratorTurnActive() {
  return state.narratorTurn && state.narratorTurn.state !== "idle";
}
window.wo10hIsNarratorTurnActive = wo10hIsNarratorTurnActive;

/** Called when narrator shows activity (typing, speaking) — re-arm timeout. */
function _wo10hOnNarratorActivity() {
  if (!state.narratorTurn || state.narratorTurn.state === "idle") return;
  // Reset timeout deadlines since narrator is active
  state.narratorTurn.timeoutDeadline = Date.now() + WO10H_CHECKIN_MS;
  _wo10hArmTimeout();
}
window._wo10hOnNarratorActivity = _wo10hOnNarratorActivity;

/** Sync header controls and Bug Panel UI for turn state. */
function _wo10hSyncUI() {
  // Sync header mic button to show claim state
  const micBtn = document.getElementById("lv10dMicBtn");
  const micLabel = document.getElementById("lv10dMicLabel");
  if (micBtn && state.narratorTurn) {
    if (state.narratorTurn.state === "awaiting_tts_end") {
      micBtn.classList.remove("active", "paused");
      micBtn.classList.add("paused"); // yellow = waiting
      if (micLabel) micLabel.textContent = "Mic (Claiming…)";
    } else if (state.narratorTurn.state === "armed_for_narrator" || state.narratorTurn.state === "recording") {
      micBtn.classList.remove("paused");
      micBtn.classList.add("active");
      if (micLabel) micLabel.textContent = "Mic (Your Turn)";
    }
  }
}
window._wo10hSyncUI = _wo10hSyncUI;

/* ═══════════════════════════════════════════════════════════════
   WO-10D: Header Input Controls + Bug Panel
   Persistent header Mic / Camera toggles wired to real functions.
   Bug Panel with live diagnostics, LLM tuning (WO-10E), route checks.
═══════════════════════════════════════════════════════════════ */

/* ── WO-10D: LLM tuning parameters (WO-10E) ── */
window._lv10dLlmParams = { temperature: 0.7, max_new_tokens: 512 };

function lv10dSetLlmParam(key, value) {
  window._lv10dLlmParams[key] = Number(value);
  console.log("[WO-10E] LLM param set:", key, "=", Number(value));
}
window.lv10dSetLlmParam = lv10dSetLlmParam;

/* ── WO-10D: Header Mic toggle ──
   Wires to real wo8PauseListening / wo8ResumeListening when WO-8 voice
   is active, otherwise uses toggleRecording / stopRecording. */
function lv10dToggleMic() {
  // If WO-8 voice is paused, resume it
  if (_wo8VoicePaused || listeningPaused) {
    if (typeof wo8ResumeListening === "function") wo8ResumeListening();
    // Also clear WO-11B pause
    listeningPaused = false;
    const pauseBtn = document.getElementById("btnPause");
    if (pauseBtn) { pauseBtn.classList.remove("paused"); pauseBtn.textContent = "Pause"; }
    lv10dSyncHeaderControls();
    return;
  }
  // If mic is active, pause/stop it
  if (isRecording) {
    if (typeof wo8PauseListening === "function") wo8PauseListening();
    lv10dSyncHeaderControls();
    return;
  }
  // Mic is off — start recording
  if (typeof startRecording === "function") startRecording();
  lv10dSyncHeaderControls();
}
window.lv10dToggleMic = lv10dToggleMic;

/* ── WO-10D: Header Camera toggle ──
   Camera ON must go through consent path. Camera OFF calls stopEmotionEngine. */
function lv10dToggleCamera() {
  if (cameraActive) {
    if (typeof stopEmotionEngine === "function") stopEmotionEngine();
    lv10dSyncHeaderControls();
    return;
  }
  // Camera ON — must go through consent
  if (typeof beginCameraConsent74 === "function") {
    beginCameraConsent74({ cameraForPacing: true, profilePhotoEnabled: false }).then(function () {
      lv10dSyncHeaderControls();
    });
  } else if (typeof startEmotionEngine === "function") {
    startEmotionEngine().then(function () {
      lv10dSyncHeaderControls();
    });
  }
}
window.lv10dToggleCamera = lv10dToggleCamera;

/* ── WO-10D: Sync header control visuals from real state ── */
function lv10dSyncHeaderControls() {
  const micBtn = document.getElementById("lv10dMicBtn");
  const camBtn = document.getElementById("lv10dCamBtn");
  const micLabel = document.getElementById("lv10dMicLabel");
  const camLabel = document.getElementById("lv10dCamLabel");

  if (micBtn) {
    micBtn.classList.remove("active", "paused");
    if (_wo8VoicePaused || listeningPaused) {
      micBtn.classList.add("paused");
      if (micLabel) micLabel.textContent = "Mic (Paused)";
    } else if (isRecording) {
      micBtn.classList.add("active");
      if (micLabel) micLabel.textContent = "Mic (On)";
    } else {
      if (micLabel) micLabel.textContent = "Mic";
    }
  }

  if (camBtn) {
    camBtn.classList.remove("active", "paused");
    if (cameraActive) {
      camBtn.classList.add("active");
      if (camLabel) camLabel.textContent = "Cam (On)";
    } else {
      if (camLabel) camLabel.textContent = "Cam";
    }
  }

  // Also sync inputState for Bug Panel
  if (state.inputState) {
    state.inputState.micActive = !!isRecording;
    state.inputState.micPaused = !!(_wo8VoicePaused || listeningPaused);
    state.inputState.cameraActive = !!cameraActive;
    state.inputState.cameraConsent = !!(state.session?.onboarding?.cameraForPacing);
  }
}
window.lv10dSyncHeaderControls = lv10dSyncHeaderControls;

/* ── WO-10D: Bug Panel refresh ── */
let _lv10dBugPanelTimer = null;

function lv10dRefreshBugPanel() {
  const panel = document.getElementById("lv10dBugPanel");
  if (!panel) return;

  // Sync header controls first
  lv10dSyncHeaderControls();

  const _v = (id, text, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = "lv10d-bp-value" + (cls ? " " + cls : "");
  };

  // Session
  const narratorName = document.getElementById("lv80ActiveNarratorName");
  _v("lv10dBpNarrator", narratorName?.textContent || "—");
  _v("lv10dBpPid", state.person_id || "—", state.person_id ? "" : "off");
  _v("lv10dBpMode", getCurrentMode());
  _v("lv10dBpPassEra", getCurrentPass() + " / " + (getCurrentEra() || "—"));
  _v("lv10dBpRole", getAssistantRole());
  _v("lv10dBpLlmReady", _llmReady ? "Yes" : "No", _llmReady ? "ok" : "err");

  // Inputs
  _v("lv10dBpMic", isRecording ? "ON" : "OFF", isRecording ? "ok" : "off");
  _v("lv10dBpPaused", listeningPaused ? "YES" : "no", listeningPaused ? "warn" : "");
  _v("lv10dBpWo8Paused", _wo8VoicePaused ? "YES" : "no", _wo8VoicePaused ? "warn" : "");
  _v("lv10dBpCam", cameraActive ? "ON" : "OFF", cameraActive ? "ok" : "off");
  _v("lv10dBpEmotion", emotionAware ? "ON" : "OFF", emotionAware ? "ok" : "off");

  // Affect / visual signals
  const vs = state.session?.visualSignals;
  const hasFresh = !!(vs?.affectState && vs?.timestamp && (Date.now() - vs.timestamp < 8000));
  _v("lv10dBpAffect", hasFresh ? vs.affectState + " (" + (vs.confidence * 100).toFixed(0) + "%)" : (state.runtime?.affectState || "neutral"), hasFresh ? "ok" : "off");
  _v("lv10dBpSignalAge", vs?.timestamp ? ((Date.now() - vs.timestamp) / 1000).toFixed(1) + "s" : "—", hasFresh ? "" : (vs?.timestamp ? "warn" : "off"));

  // WO-10H: Narrator turn-state
  const nt = state.narratorTurn;
  if (nt) {
    const turnCls = nt.state === "idle" ? "off" : (nt.state === "awaiting_tts_end" ? "warn" : "ok");
    _v("lv10dBpTurnState", nt.state, turnCls);
    _v("lv10dBpTtsActive", isLoriSpeaking ? "YES" : "no", isLoriSpeaking ? "warn" : "");
    _v("lv10dBpTtsFinished", nt.ttsFinishedAt ? new Date(nt.ttsFinishedAt).toLocaleTimeString() : "—", nt.ttsFinishedAt ? "" : "off");
    _v("lv10dBpTurnClaimed", nt.claimTimestamp ? ((Date.now() - nt.claimTimestamp) / 1000).toFixed(1) + "s ago" : "no", nt.claimTimestamp ? "ok" : "off");
    _v("lv10dBpInterruptBlock", nt.interruptionBlock || "none", nt.interruptionBlock ? "warn" : "");
    _v("lv10dBpTimeoutAt", nt.timeoutDeadline ? ((nt.timeoutDeadline - Date.now()) / 1000).toFixed(0) + "s" : "—", nt.timeoutDeadline ? (nt.timeoutDeadline < Date.now() ? "err" : "warn") : "off");
  }

  // Memory — check asynchronously
  _v("lv10dBpRollingSummary", "—", "off");
  _v("lv10dBpRecentTurns", "—", "off");
  if (state.person_id) {
    const pid = state.person_id;
    // Rolling summary check
    fetch(ORIGIN + "/api/transcript/rolling-summary?person_id=" + pid, { method: "GET" })
      .then(r => { _v("lv10dBpRollingSummary", r.ok ? "OK (" + r.status + ")" : "ERR " + r.status, r.ok ? "ok" : "err"); })
      .catch(() => { _v("lv10dBpRollingSummary", "UNREACHABLE", "err"); });
    // Recent turns check
    fetch(ORIGIN + "/api/transcript/recent-turns?person_id=" + pid + "&session_id=default&limit=1", { method: "GET" })
      .then(r => { _v("lv10dBpRecentTurns", r.ok ? "OK (" + r.status + ")" : "ERR " + r.status, r.ok ? "ok" : "err"); })
      .catch(() => { _v("lv10dBpRecentTurns", "UNREACHABLE", "err"); });
  }

  // Services
  _v("lv10dBpWs", (ws && wsReady) ? "Connected" : (usingFallback ? "Fallback (SSE)" : "Disconnected"), (ws && wsReady) ? "ok" : "err");
  // WO-10K: Use real health routes — /api/ping for API, /api/health for TTS
  fetch(ORIGIN + "/api/ping", { method: "GET", signal: AbortSignal.timeout(3000) })
    .then(r => { _v("lv10dBpApi", r.ok ? "OK" : "ERR " + r.status, r.ok ? "ok" : "err"); })
    .catch(() => { _v("lv10dBpApi", "DOWN", "err"); });
  fetch(TTS_ORIG + "/api/health", { method: "GET", signal: AbortSignal.timeout(3000) })
    .then(r => { _v("lv10dBpTts", r.ok ? "OK" : "ERR " + r.status, r.ok ? "ok" : "err"); })
    .catch(() => { _v("lv10dBpTts", "DOWN", "err"); });

  // Warnings
  const warnings = [];
  if (!_llmReady) warnings.push("LLM not ready — model still warming up");
  if (!(ws && wsReady)) warnings.push("WebSocket disconnected");
  if (vs?.timestamp && (Date.now() - vs.timestamp >= 8000) && cameraActive) warnings.push("Visual signal stale (>8s) — camera may have frozen");
  if (cameraActive && !emotionAware) warnings.push("Camera active but emotionAware is false — state inconsistency");
  if (listeningPaused && isRecording) warnings.push("Mic recording while listening is paused — state conflict");
  if (nt && nt.state === "awaiting_tts_end" && !isLoriSpeaking) warnings.push("Turn state stuck in awaiting_tts_end but TTS is not active");
  if (nt && nt.state !== "idle" && nt.checkInFired) warnings.push("Check-in already fired for this claimed turn");

  const warnList = document.getElementById("lv10dBpWarnings");
  if (warnList) {
    if (warnings.length === 0) {
      warnList.innerHTML = '<li style="color:#4ade80;">No warnings</li>';
    } else {
      warnList.innerHTML = warnings.map(w => '<li>' + w.replace(/</g, '&lt;') + '</li>').join("");
    }
  }
}
window.lv10dRefreshBugPanel = lv10dRefreshBugPanel;

/* ── WO-10D: Route health check ── */
async function lv10dCheckRoutes() {
  const routes = [
    { label: "ping",            url: ORIGIN + "/api/ping" },
    { label: "rolling-summary", url: ORIGIN + "/api/transcript/rolling-summary?person_id=" + (state.person_id || "test") },
    { label: "recent-turns",   url: ORIGIN + "/api/transcript/recent-turns?person_id=" + (state.person_id || "test") + "&session_id=default&limit=1" },
    { label: "history",        url: ORIGIN + "/api/transcript/history?person_id=" + (state.person_id || "test") },
    { label: "sessions",       url: ORIGIN + "/api/transcript/sessions?person_id=" + (state.person_id || "test") },
    { label: "thread-anchor",  url: ORIGIN + "/api/transcript/thread-anchor?person_id=" + (state.person_id || "test") },
  ];
  const results = [];
  for (const r of routes) {
    try {
      const resp = await fetch(r.url, { method: "GET", signal: AbortSignal.timeout(5000) });
      results.push(r.label + ": " + resp.status + (resp.ok ? " OK" : " FAIL"));
    } catch (e) {
      results.push(r.label + ": UNREACHABLE");
    }
  }
  console.log("[WO-10D] Route check:\n" + results.join("\n"));
  alert("Route Check Results:\n\n" + results.join("\n"));
}
window.lv10dCheckRoutes = lv10dCheckRoutes;

/* ── WO-10D: Copy diagnostics to clipboard ── */
function lv10dCopyDiag() {
  const diag = {
    ts: new Date().toISOString(),
    narrator: document.getElementById("lv80ActiveNarratorName")?.textContent || null,
    person_id: state.person_id,
    mode: getCurrentMode(),
    pass: getCurrentPass(),
    era: getCurrentEra(),
    role: getAssistantRole(),
    llmReady: _llmReady,
    mic: { recording: isRecording, paused: listeningPaused, wo8Paused: _wo8VoicePaused },
    camera: { active: cameraActive, emotionAware: emotionAware },
    visualSignals: state.session?.visualSignals || null,
    ws: { connected: !!(ws && wsReady), fallback: usingFallback },
    llmParams: window._lv10dLlmParams,
  };
  const text = JSON.stringify(diag, null, 2);
  navigator.clipboard.writeText(text).then(() => {
    console.log("[WO-10D] Diagnostics copied to clipboard.");
    alert("Diagnostics copied to clipboard.");
  }).catch(() => {
    console.log("[WO-10D] Diagnostics:\n" + text);
    alert("Copy failed — see console for diagnostics.");
  });
}
window.lv10dCopyDiag = lv10dCopyDiag;

/* ── WO-10D: Auto-refresh Bug Panel while open ── */
(function () {
  const panel = document.getElementById("lv10dBugPanel");
  if (!panel) return;
  panel.addEventListener("toggle", function (e) {
    if (panel.matches(":popover-open")) {
      lv10dRefreshBugPanel();
      _lv10dBugPanelTimer = setInterval(lv10dRefreshBugPanel, 2000);
    } else {
      if (_lv10dBugPanelTimer) { clearInterval(_lv10dBugPanelTimer); _lv10dBugPanelTimer = null; }
    }
  });
})();

/* ── WO-10D: Periodic header control sync (every 1s) ── */
setInterval(lv10dSyncHeaderControls, 1000);
