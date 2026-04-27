/* ═══════════════════════════════════════════════════════════════
   lori-kawa.js — Kawa River View helpers
   WO-KAWA-UI-01A
   Load order: after interview.js, before app.js
═══════════════════════════════════════════════════════════════ */

function _activePersonIdKawa(){
  return state?.person_id || null;
}

function _ensureKawa(){
  if (!state.kawa) {
    state.kawa = {
      mode: "river",
      segmentList: [],
      activeSegmentId: null,
      activeSegment: null,
      isLoading: false,
      isDirty: false,
      lastBuiltAt: null,
      questionContext: { lastAnchorId: null, lastPromptType: null },
      memoir: { overlayEnabled: true, organizationMode: "chronology_river" },
      metrics: { proposalsBuilt: 0, promptsShown: 0, confirmed: 0, edited: 0,
                 hybridPromptsShown: 0, kawaSegmentsUsedInMemoir: 0 }
    };
  }
  // WO-KAWA-02A: backfill new blocks if missing from 01A-era state
  if (!state.kawa.questionContext) state.kawa.questionContext = { lastAnchorId: null, lastPromptType: null };
  if (!state.kawa.memoir) state.kawa.memoir = { overlayEnabled: true, organizationMode: "chronology_river" };
  if (!state.kawa.metrics.hybridPromptsShown) state.kawa.metrics.hybridPromptsShown = 0;
  if (!state.kawa.metrics.kawaSegmentsUsedInMemoir) state.kawa.metrics.kawaSegmentsUsedInMemoir = 0;
  return state.kawa;
}

/* ── List / Select / Refresh ────────────────────────────────── */

async function kawaRefreshList(){
  const personId = _activePersonIdKawa();
  if (!personId) return;
  const kawa = _ensureKawa();
  kawa.isLoading = true;
  try {
    const data = await apiListKawaSegments(personId);
    kawa.segmentList = Array.isArray(data?.segments) ? data.segments : [];
    if (!kawa.activeSegmentId && kawa.segmentList.length) {
      kawa.activeSegmentId = kawa.segmentList[0].segment_id;
      kawa.activeSegment = kawa.segmentList[0];
    }
  } finally {
    kawa.isLoading = false;
    if (typeof renderKawaUI === "function") renderKawaUI();
  }
}

async function kawaSelectSegment(segmentId){
  const personId = _activePersonIdKawa();
  if (!personId || !segmentId) return;
  const kawa = _ensureKawa();
  kawa.isLoading = true;
  try {
    const data = await apiGetKawaSegment(personId, segmentId);
    kawa.activeSegmentId = segmentId;
    kawa.activeSegment = data?.segment || null;
    kawa.isDirty = false;
  } finally {
    kawa.isLoading = false;
    if (typeof renderKawaUI === "function") renderKawaUI();
  }
}

/* ── Timeline Anchor ────────────────────────────────────────── */

function _currentTimelineAnchorForKawa(){
  // Try to get the active chronology event from the accordion or timeline
  const active = state?.timeline?.activeEvent
              || state?.ui?.activeTimelineEvent
              || null;
  if (active) {
    return {
      type: "timeline_event",
      ref_id: active.id || active.event_id || active.ref_id || null,
      label: active.label || active.title || active.event || "Timeline event",
      year: active.year || active.startYear || null
    };
  }
  // Fallback: use the current interview era if available
  const era = state?.session?.currentEra;
  if (era) {
    return {
      type: "life_section",
      ref_id: `era_${era}`,
      label: era.replace(/_/g, " "),
      year: null
    };
  }
  return {
    type: "life_section",
    ref_id: `section_${Date.now()}`,
    label: "Current life section",
    year: null
  };
}

/* ── Build / Save / Confirm ─────────────────────────────────── */

async function kawaBuildFromCurrentAnchor(){
  const personId = _activePersonIdKawa();
  if (!personId) return;
  const kawa = _ensureKawa();
  kawa.isLoading = true;
  try {
    const data = await apiBuildKawaSegment(personId, _currentTimelineAnchorForKawa());
    kawa.activeSegment = data?.segment || null;
    kawa.activeSegmentId = data?.segment?.segment_id || null;
    kawa.lastBuiltAt = Date.now();
    kawa.metrics.proposalsBuilt += 1;
    kawa.isDirty = false;
    await kawaRefreshList();
  } finally {
    kawa.isLoading = false;
    if (typeof renderKawaUI === "function") renderKawaUI();
  }
}

function kawaMarkDirty(){
  const kawa = _ensureKawa();
  kawa.isDirty = true;
  if (typeof renderKawaUI === "function") renderKawaUI();
}

function _bindKawaField(path, value){
  const seg = state?.kawa?.activeSegment;
  if (!seg) return;
  const parts = path.split(".");
  let cur = seg;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  kawaMarkDirty();
}

async function kawaSaveActive(confirmFlag = false){
  const personId = _activePersonIdKawa();
  const kawa = _ensureKawa();
  const seg = kawa.activeSegment;
  if (!personId || !seg) return;

  const payload = {
    person_id: personId,
    segment_id: seg.segment_id,
    anchor: seg.anchor,
    kawa: seg.kawa,
    narrator_note: seg.narrator_note || null,
    narrator_quote: seg.narrator_quote || null,
    confirmed: !!confirmFlag,
    session_id: state?.interview?.session_id || null
  };

  const data = await apiSaveKawaSegment(payload);
  kawa.activeSegment = data?.segment || seg;
  kawa.activeSegmentId = kawa.activeSegment?.segment_id || seg.segment_id;
  kawa.isDirty = false;
  if (confirmFlag) kawa.metrics.confirmed += 1;
  await kawaRefreshList();
  if (typeof renderKawaUI === "function") renderKawaUI();
}

/* ── Confirmation Prompt ────────────────────────────────────── */

function formatKawaConfirmationPrompt(seg){
  if (!seg?.kawa) return "";
  const flow = seg.kawa?.water?.flow_state || "unclear";
  const rocks = (seg.kawa?.rocks || []).map(x => x.label).filter(Boolean).join(", ") || "none yet";
  const driftwood = (seg.kawa?.driftwood || []).map(x => x.label).filter(Boolean).join(", ") || "none yet";
  const spaces = (seg.kawa?.spaces || []).map(x => x.label).filter(Boolean).join(", ") || "none yet";
  const banks = Object.values(seg.kawa?.banks || {}).flat().filter(Boolean).join(", ") || "none yet";
  return `Looking at this period, I've been imagining your life like a river. `
    + `It feels like the flow was ${flow}. `
    + `I've placed some rocks—things that stayed put and felt heavy, like ${rocks}. `
    + `I also see some driftwood—the things and people you held onto, like ${driftwood}. `
    + `The banks shaping your path seemed to be ${banks}, `
    + `but even then, I see spaces for you like ${spaces}. `
    + `Does that feel right to you, or should we move some of these stones around?`;
}

/* ── Kawa Reflection Offer Logic ────────────────────────────── */

function shouldOfferKawaReflection(anchor){
  if (!anchor) return false;
  const label = String(anchor.label || "").toLowerCase();
  return [
    "marriage","divorce","move","retirement","first job","loss","death",
    "caregiving","graduation","military","health","birth","relocation"
  ].some(x => label.includes(x));
}


/* ═══════════════════════════════════════════════════════════════
   WO-KAWA-02A — Hybrid follow-up logic
   Used by interview.js to inject Kawa-aware questions during
   hybrid and kawa_reflection modes.
═══════════════════════════════════════════════════════════════ */

function getConfirmedKawaSegmentForAnchor(anchor){
  const segs = state?.kawa?.segmentList || [];
  const refId = anchor?.ref_id || anchor?.id || null;
  return segs.find(seg =>
    seg?.anchor?.ref_id === refId &&
    seg?.provenance?.confirmed === true
  ) || null;
}

function shouldOfferKawaReflectionForAnchor(anchor){
  const session = state?.session || {};
  const mode = session.kawaMode || "chronological";
  if (mode === "chronological") return false;
  if (!anchor) return false;
  if ((session.kawaPromptCooldown || 0) > 0) return false;

  if (mode === "kawa_reflection") return true;

  // hybrid mode: trigger on high-meaning anchors or confirmed segments
  const label = String(anchor.label || "").toLowerCase();
  const triggerWords = [
    "marriage","divorce","move","retirement","death","loss","caregiving",
    "graduation","first job","military","health","diagnosis","birth"
  ];

  if (triggerWords.some(x => label.includes(x))) return true;
  if (getConfirmedKawaSegmentForAnchor(anchor)) return true;

  return false;
}

function chooseKawaPromptType(anchor, seg){
  // If we have a confirmed segment, pick the richest construct
  if (seg?.kawa?.rocks?.length) return "rocks";
  if (seg?.kawa?.spaces?.length) return "spaces";
  if (seg?.kawa?.driftwood?.length) return "driftwood";
  // Check routing examples for this anchor type
  const label = String(anchor?.label || "").toLowerCase();
  const routing = window.KAWA_PROMPTS?.prompt_routing_examples || {};
  for (const [key, constructs] of Object.entries(routing)) {
    if (label.includes(key) && constructs.length) return constructs[0];
  }
  return "flow";
}

function buildKawaFollowup(anchor){
  const seg = getConfirmedKawaSegmentForAnchor(anchor);
  const kind = chooseKawaPromptType(anchor, seg);
  const prompts = window.KAWA_PROMPTS?.kawa_hybrid_followups?.[kind] || [];
  const text = prompts[Math.floor(Math.random() * prompts.length)]
            || "How was the water moving for you then?";
  const kawa = _ensureKawa();
  kawa.metrics.hybridPromptsShown += 1;
  kawa.metrics.promptsShown += 1;
  kawa.questionContext.lastAnchorId = anchor?.ref_id || null;
  kawa.questionContext.lastPromptType = kind;
  state.session.kawaPromptCooldown = 3;
  state.session.lastKawaSegmentId = seg?.segment_id || null;
  return text;
}

function tickKawaPromptCooldown(){
  if ((state?.session?.kawaPromptCooldown || 0) > 0) {
    state.session.kawaPromptCooldown -= 1;
  }
}


/* ═══════════════════════════════════════════════════════════════
   WO-KAWA-02A — Memoir overlay helpers
   Used by app.js memoir rendering to inject Kawa river context
   into chronology chapters or build river-organized memoirs.
═══════════════════════════════════════════════════════════════ */

function buildKawaOverlayText(segment){
  if (!segment?.kawa) return "";
  const t = window.KAWA_PROMPTS?.kawa_memoir_templates || {};
  const bits = [];
  const flow = segment?.kawa?.water?.flow_state || null;
  const rocks = (segment?.kawa?.rocks || []).map(x => x.label).filter(Boolean).join(", ");
  const driftwood = (segment?.kawa?.driftwood || []).map(x => x.label).filter(Boolean).join(", ");
  const banks = [
    ...(segment?.kawa?.banks?.social || []),
    ...(segment?.kawa?.banks?.physical || []),
    ...(segment?.kawa?.banks?.cultural || []),
    ...(segment?.kawa?.banks?.institutional || [])
  ].filter(Boolean).join(", ");
  const spaces = (segment?.kawa?.spaces || []).map(x => x.label).filter(Boolean).join(", ");

  if (flow && t.flow_sentence) bits.push(t.flow_sentence.replace("{{flow}}", flow));
  if (rocks && t.rocks_sentence) bits.push(t.rocks_sentence.replace("{{rocks}}", rocks));
  if (driftwood && t.driftwood_sentence) bits.push(t.driftwood_sentence.replace("{{driftwood}}", driftwood));
  if (banks && t.banks_sentence) bits.push(t.banks_sentence.replace("{{banks}}", banks));
  if (spaces && t.spaces_sentence) bits.push(t.spaces_sentence.replace("{{spaces}}", spaces));

  if (!bits.length) return "";
  _ensureKawa().metrics.kawaSegmentsUsedInMemoir += 1;
  return `${t.chronology_river_intro || ""}${bits.join(" ")}`;
}

function getMemoirMode(){
  return state?.session?.memoirMode || state?.kawa?.memoir?.organizationMode || "chronology";
}
