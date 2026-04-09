/* ═══════════════════════════════════════════════════════════════
   interview.js — interview session: start, answer processing,
                  roadmap, memory triggers
   Lorevox v7.1
   Load order: NINTH
═══════════════════════════════════════════════════════════════ */

/* ── ROADMAP ─────────────────────────────────────────────────── */
/* v7.1: when timeline spine exists, show Life Periods instead of
   the legacy section checklist. Falls back gracefully if no seed. */
function renderRoadmap(){
  const w=document.getElementById("roadmapList"); if(!w) return;
  w.innerHTML="";

  const periods = getCurrentLifePeriods();

  if(periods.length){
    // v7.1 path — render life period spine
    const currentEra = getCurrentEra();
    periods.forEach(p=>{
      const isActive = currentEra === p.label;
      const d=document.createElement("div");
      d.className="roadmap-item"+(isActive?" active-section":"");
      const yearRange = p.start_year
        ? (p.end_year ? `${p.start_year}–${p.end_year}` : `${p.start_year}+`)
        : "";
      d.innerHTML=`
        <span class="rm-label truncate">
          <span class="rm-emoji">◌</span>
          ${esc(prettyEra(p.label))}
          ${yearRange?`<span style="color:#475569;font-size:9px;margin-left:4px">${yearRange}</span>`:""}
        </span>`;
      d.onclick=()=>{
        setEra(p.label);
        if(interviewMode==="chronological") setPass("pass2a");
        update71RuntimeUI();
        renderRoadmap();
        renderInterview();
        showTab("interview");
      };
      w.appendChild(d);
    });
    // default to first era if none selected
    if(!getCurrentEra() && periods[0]) setEra(periods[0].label);
    update71RuntimeUI();
    return;
  }

  // legacy path — section checklist (no timeline seed yet)
  const visibleSections=INTERVIEW_ROADMAP.map((s,i)=>({s,i})).filter(({s})=>!s.youth||youthMode);
  if(interviewMode==="thematic"){
    THEMATIC_GROUPS.forEach(grp=>{
      const grpSections=visibleSections.filter(({s})=>grp.ids.includes(s.id));
      if(!grpSections.length) return;
      const hdr=document.createElement("div"); hdr.className="kin-group-row"; hdr.textContent=grp.label;
      w.appendChild(hdr);
      grpSections.forEach(({s,i})=>appendRoadmapItem(w,s,i));
    });
  } else {
    visibleSections.forEach(({s,i})=>appendRoadmapItem(w,s,i));
  }
  const s=INTERVIEW_ROADMAP[sectionIndex];
  if(s) document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
}

/* ── v7.1 era label prettifier ───────────────────────────────── */
function prettyEra(v){
  return v ? String(v).replaceAll("_"," ").replace(/\b\w/g, m=>m.toUpperCase()) : "";
}

function appendRoadmapItem(w,s,i){
  const d=document.createElement("div");
  d.className="roadmap-item"+(i===sectionIndex?" active-section":"")+(sectionDone[i]?" done":"");
  const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=!!sectionDone[i];
  cb.style.flexShrink="0";
  cb.onclick=e=>{
    e.stopPropagation(); sectionDone[i]=cb.checked;
    if(sectionDone[i]&&i===sectionIndex&&i<INTERVIEW_ROADMAP.length-1) sectionIndex++;
    persistSectionDone(); renderRoadmap(); renderMemoirChapters(); updateSidebar();
  };
  const lbl=document.createElement("span");
  const hasSensitive=sensitiveSegments.some(seg=>seg.sectionIdx===i);
  const sensIcon=hasSensitive?`<span class="rm-sensitive-icon" title="Contains private segment">⊘</span>`:"";
  lbl.className="rm-label truncate"; lbl.innerHTML=`<span class="rm-emoji">${s.emoji}</span> ${esc(s.label)}${sensIcon}`;
  d.appendChild(cb); d.appendChild(lbl);
  d.onclick=e=>{
    if(e.target===cb) return;
    sectionIndex=i; sectionVisited[i]=true;
    renderRoadmap(); updateContextTriggers();
    showTab("interview");
    document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
  };
  w.appendChild(d);
}

function prevSection(){ sectionIndex=Math.max(0,sectionIndex-1); renderRoadmap(); updateContextTriggers(); }
function nextSection(){ sectionIndex=Math.min(INTERVIEW_ROADMAP.length-1,sectionIndex+1); renderRoadmap(); updateContextTriggers(); }
function persistSectionDone(){
  if(state.person_id) localStorage.setItem(LS_DONE(state.person_id), JSON.stringify(sectionDone));
}

/* ── EMOTION ENGINE SECTION SYNC ─────────────────────────────── */
// Keep LoreVoxEmotion in sync with the current interview section so that
// every affect event is tagged with the correct section_id.
function _syncEmotionSection(){
  if(typeof LoreVoxEmotion !== "undefined" && LoreVoxEmotion.isActive()){
    LoreVoxEmotion.setSection(INTERVIEW_ROADMAP[sectionIndex]?.id || null);
  }
}

/* ── AFFECT NUDGE HELPER ─────────────────────────────────────── */
// Returns a recent (≤60s), confident affect state for ivAskInChat nudges.
// Returns null if no useful signal is available.
function _latestAffect(){
  if(!sessionAffectLog.length) return null;
  const last=sessionAffectLog[sessionAffectLog.length-1];
  if(Date.now()-last.ts > 60000) return null;   // stale
  if(last.confidence < 0.65) return null;        // below threshold
  if(last.affect_state === "steady") return null; // no nudge needed for steady
  return last;
}

/* ── MEMORY TRIGGERS / ERA SUPPORT ───────────────────────────── */
/* v7.1: when a timeline seed exists, show era-anchored support
   prompts instead of random world-event cards.
   Falls back to world-event cards for the legacy pre-seed path. */
function updateContextTriggers(){
  _syncEmotionSection();
  const el=document.getElementById("contextTriggers"); if(!el) return;

  // v7.1 path — era support prompts
  if(getTimelineSeedReady()){
    const era  = getCurrentEra();
    const mode = getCurrentMode();
    const ERA_PROMPTS = {
      early_childhood:  ["Think about home life — the kitchen, bedroom, yard, or street.", "Who was in the household then?", "Does this memory feel closer to home, neighborhood, or family?"],
      school_years:     ["Does this connect more to school, home, or neighborhood life?", "What teacher, class, or school routine comes back first?", "Were you still living in the same place then?"],
      adolescence:      ["Does this feel like school years or the start of independence?", "What music, friendships, or places anchor that period?", "Were you still living at home then?"],
      early_adulthood:  ["Were you on your own by then, or still closely tied to home?", "Was work, school, marriage, or moving the biggest change?", "What city or place defines that period most?"],
      midlife:          ["Does this connect more to work, caregiving, or family routines?", "Who depended on you most during that time?", "What did a normal day feel like then?"],
      later_life:       ["Does this feel tied to home, health, family, or reflection?", "What became more important to you during this chapter?", "What place best holds that period in memory?"],
    };
    const prompts = ERA_PROMPTS[era] || ["Lori can use age, place, and family anchors to guide this era gently."];
    const modeHint = mode === "recognition"
      ? `<div class="text-xs text-amber-300 mb-2">Recognition support — Lori will use easier anchoring prompts.</div>`
      : mode === "grounding"
        ? `<div class="text-xs text-emerald-400 mb-2">Grounding mode — Lori is pacing gently right now.</div>`
        : "";

    // v6 integration — era-aware draft context trigger cards
    let draftCards = "";
    if(typeof LorevoxBioBuilder !== "undefined"){
      let eraItems = null;
      // Try era-aware accessor first
      if(LorevoxBioBuilder._getDraftFamilyContextForEra && era){
        const eraCtx = LorevoxBioBuilder._getDraftFamilyContextForEra(null, era);
        if(eraCtx && (eraCtx.primary.length > 0 || eraCtx.secondary.length > 0)){
          eraItems = eraCtx.primary.concat(eraCtx.secondary);
        }
      }

      const _draftHints = [];
      if(eraItems){
        // v6 path: ranked era-relevant items
        eraItems.forEach(item=>{
          if(item.node && item.node.notes && /do\s*not\s*prompt/i.test(item.node.notes)) return;
          if(item.type === "ft_person") _draftHints.push(`Ask about ${item.role || "family member"}: ${esc(item.label)}`);
          else if(item.type === "lt_theme") _draftHints.push(`Explore theme: ${esc(item.label)}`);
          else if(item.type === "lt_place") _draftHints.push(`Places: ${esc(item.label)}`);
          else if(item.type === "lt_event") _draftHints.push(`Event: ${esc(item.label)}`);
        });
      } else if(LorevoxBioBuilder._getDraftFamilyContext){
        // v5 fallback: global context
        const ctx = LorevoxBioBuilder._getDraftFamilyContext();
        if(ctx){
          if(ctx.familyTree && ctx.familyTree.nodes){
            ctx.familyTree.nodes.forEach(n=>{
              if(n.role === "narrator") return;
              if(n.notes && /do\s*not\s*prompt/i.test(n.notes)) return;
              const label = n.displayName || n.preferredName || n.label || "";
              if(label) _draftHints.push(`Ask about ${n.role || "family member"}: ${esc(label)}`);
            });
          }
          if(ctx.lifeThreads && ctx.lifeThreads.nodes){
            ctx.lifeThreads.nodes.forEach(n=>{
              if(n.type !== "theme") return;
              const label = n.label || n.displayName || "";
              if(label) _draftHints.push(`Explore theme: ${esc(label)}`);
            });
          }
        }
      }

      if(_draftHints.length > 0){
        const eraLabel = eraItems ? " (era-matched)" : "";
        draftCards = `<div class="text-xs" style="color:#5eead4;margin-bottom:4px;margin-top:8px;">From Bio Builder draft${eraLabel}:</div>` +
          _draftHints.slice(0,4).map(h=>`<div class="event-card" style="margin:0;border-left:2px solid rgba(20,184,166,0.4);">${h}</div>`).join("");
      }
    }

    el.innerHTML = modeHint + `<div class="space-y-2 py-1">` +
      prompts.map(t=>`<div class="event-card" style="margin:0">${esc(t)}</div>`).join("") + draftCards + `</div>`;
    return;
  }

  // legacy path — world-event cards
  const birthYear=getBirthYear();
  const country=getCountry();
  if(!birthYear){ el.innerHTML=`<div class="py-1">Add date of birth on the Profile tab to see age-anchored prompts.</div>`; return; }
  const sec=INTERVIEW_ROADMAP[sectionIndex]; if(!sec){ el.innerHTML=""; return; }
  const relevant=ALL_EVENTS.filter(e=>{
    const age=e.year-birthYear; if(age<3||age>100) return false;
    if(!e.tags.includes(country)&&!e.tags.includes("global")) return false;
    return e.tags.some(t=>sec.tags.includes(t));
  }).slice(0,3);
  if(!relevant.length){ el.innerHTML=`<div class="py-1">No specific world events matched — ask freely.</div>`; return; }
  el.innerHTML=`<div class="space-y-2 py-1">`+relevant.map(e=>{
    const age=e.year-birthYear;
    return `<div class="event-card" style="margin:0" onclick='fireEventPrompt(${JSON.stringify(e)},${age})'>
      <span class="event-year">${e.year}</span>
      <span class="event-text">${esc(e.event)}</span>
      <span class="event-age-badge">Age ${age}</span>
    </div>`;
  }).join("")+`</div>`;
}

/* ── INTERVIEW SESSION RENDERING ─────────────────────────────── */
/* v7.1: when a timeline seed exists, builds prompt from pass + era.
   Falls back to the session-engine-assigned prompt for legacy flow. */
function renderInterview(){
  // WO-11: suppress interview rendering while trainer coaching flow is active
  if (window.LorevoxTrainerNarrators && window.LorevoxTrainerNarrators.isActive()) {
    return;
  }
  document.getElementById("ivSession").textContent=state.interview.session_id||"—";
  document.getElementById("ivQid").textContent=state.interview.question_id||"—";

  // v7.1 — show pass-aware prompt when seed is ready
  if(getTimelineSeedReady()){
    document.getElementById("ivPrompt").textContent = build71InterviewPrompt();
  } else {
    document.getElementById("ivPrompt").textContent=state.interview.prompt||"Select a section and click Begin Section to start.";
    const s=INTERVIEW_ROADMAP[sectionIndex];
    if(s) document.getElementById("ivSectionLabel").textContent=`${s.emoji} ${s.label}`;
  }

  update71RuntimeUI();
  updateContextTriggers();
}

/* ═══════════════════════════════════════════════════════════════
   v10 — MEMOIR QUESTION STRATEGY LAYER
   Decides what Lori should ask next based on:
   - background suppression (skip known identity facts)
   - memoir hooks (use known facts to ask deeper)
   - thin-zone detection (target weak memoir areas)
   - session memory (avoid repetitive prompts)
═══════════════════════════════════════════════════════════════ */

// ── Session memory helpers ───────────────────────────────────

function _memoirStrategyState() {
  if (!state?.session?.memoirStrategy) {
    if (state?.session) {
      state.session.memoirStrategy = {
        askedPaths: [], askedKinds: [], askedEras: [],
        lastQuestionTs: null, consecutiveSameEra: 0
      };
    }
  }
  return state?.session?.memoirStrategy || null;
}

function _recordAsked(path, kind, era) {
  var ms = _memoirStrategyState();
  if (!ms) return;
  if (path) {
    ms.askedPaths.push(path);
    if (ms.askedPaths.length > 30) ms.askedPaths.shift();
  }
  if (kind) {
    ms.askedKinds.push(kind);
    if (ms.askedKinds.length > 15) ms.askedKinds.shift();
  }
  if (era) {
    if (ms.askedEras.length > 0 && ms.askedEras[ms.askedEras.length - 1] === era) {
      ms.consecutiveSameEra++;
    } else {
      ms.consecutiveSameEra = 1;
    }
    ms.askedEras.push(era);
    if (ms.askedEras.length > 10) ms.askedEras.shift();
  }
  ms.lastQuestionTs = Date.now();
}

function _wasRecentlyAsked(path) {
  var ms = _memoirStrategyState();
  return ms ? ms.askedPaths.indexOf(path) >= 0 : false;
}

function _kindOverused(kind) {
  var ms = _memoirStrategyState();
  if (!ms) return false;
  var recent = ms.askedKinds.slice(-5);
  var count = recent.filter(function (k) { return k === kind; }).length;
  return count >= 3; // same kind asked 3+ of last 5 times = overused
}

function _stuckInEra() {
  var ms = _memoirStrategyState();
  return ms ? ms.consecutiveSameEra >= 4 : false;
}

// ── Thin-zone detection ──────────────────────────────────────

function lv80DetectThinZones(era) {
  var qq = (state?.bioBuilder?.questionnaire) || {};
  var thinZones = [];

  // Define memoir zone → questionnaire section mapping with depth checks
  var zones = [
    { id: "early_childhood", label: "Early Childhood", sections: ["earlyMemories"], fields: ["firstMemory", "favoriteToy", "significantEvent"] },
    { id: "formative_family", label: "Family & Roots", sections: ["parents", "grandparents", "siblings"], repeatable: true,
      hookFields: { parents: ["occupation", "notableLifeEvents"], grandparents: ["memorableStories", "culturalBackground"], siblings: ["sharedExperiences", "memories", "uniqueCharacteristics"] } },
    { id: "education_career", label: "Education & Career", sections: ["education"], fields: ["schooling", "higherEducation", "earlyCareer", "careerProgression"] },
    { id: "relationships", label: "Relationships", sections: ["spouse", "marriage", "children"], repeatable: true,
      hookFields: { spouse: ["narrative"], marriage: ["proposalStory", "weddingDetails"], children: ["narrative"] } },
    { id: "later_life", label: "Later Years", sections: ["laterYears"], fields: ["retirement", "lifeLessons", "adviceForFutureGenerations"] },
    { id: "identity", label: "Identity & Interests", sections: ["hobbies"], fields: ["hobbies", "personalChallenges", "worldEvents", "travel"] },
  ];

  for (var i = 0; i < zones.length; i++) {
    var zone = zones[i];
    var structureCount = 0;
    var narrativeDepth = 0;

    for (var j = 0; j < zone.sections.length; j++) {
      var sec = zone.sections[j];
      var data = qq[sec];
      if (!data) continue;

      if (zone.repeatable && Array.isArray(data)) {
        structureCount += data.length;
        // Check hook fields for narrative depth
        var hf = zone.hookFields && zone.hookFields[sec] || [];
        for (var k = 0; k < data.length; k++) {
          for (var h = 0; h < hf.length; h++) {
            var val = data[k][hf[h]];
            if (val && String(val).trim().length > 30) narrativeDepth++;
          }
        }
      } else if (typeof data === "object" && !Array.isArray(data)) {
        var fields = zone.fields || Object.keys(data);
        for (var f = 0; f < fields.length; f++) {
          var v = data[fields[f]];
          if (v && String(v).trim()) {
            structureCount++;
            if (String(v).trim().length > 50) narrativeDepth++;
          }
        }
      }
    }

    // Thin = has structure but lacks narrative depth
    if (structureCount > 0 && narrativeDepth < Math.max(1, Math.floor(structureCount * 0.3))) {
      thinZones.push({ id: zone.id, label: zone.label, structure: structureCount, depth: narrativeDepth });
    }
  }

  // If era is specified, prioritize zones that match it
  if (era) {
    var eraZoneMap = {
      "early_childhood": ["early_childhood", "formative_family"],
      "school_years": ["formative_family", "education_career"],
      "adolescence": ["education_career", "identity"],
      "early_adulthood": ["education_career", "relationships"],
      "midlife": ["relationships", "identity"],
      "later_life": ["later_life", "identity"]
    };
    var preferred = eraZoneMap[era] || [];
    thinZones.sort(function (a, b) {
      var aP = preferred.indexOf(a.id) >= 0 ? 0 : 1;
      var bP = preferred.indexOf(b.id) >= 0 ? 0 : 1;
      return aP - bP;
    });
  }

  return thinZones;
}

// ── Preload-aware prompt enrichment ──────────────────────────

function _buildHookPrompt(config, path) {
  if (!config || !config.hookPrompt) return null;
  // Get existing value from questionnaire or projection
  var value = null;
  var parsed = LorevoxProjectionMap.parsePath(path);
  if (parsed) {
    var qq = state?.bioBuilder?.questionnaire || {};
    if (parsed.index !== null) {
      // Repeatable field
      var entries = qq[parsed.section];
      if (Array.isArray(entries) && entries[parsed.index]) {
        value = entries[parsed.index][parsed.field];
      }
    } else {
      // Direct field
      var sec = qq[parsed.section];
      if (sec) value = sec[parsed.field];
    }
  }
  if (!value) {
    var proj = state?.interviewProjection?.fields || {};
    if (proj[path] && proj[path].value) value = proj[path].value;
  }
  if (!value || !String(value).trim()) return null;
  // Substitute {value} in hookPrompt
  var prompt = config.hookPrompt.replace(/\{value\}/g, String(value).trim());
  // Also substitute {ref} if present (for repeatable person references)
  if (parsed && parsed.index !== null) {
    var qq2 = state?.bioBuilder?.questionnaire || {};
    var entries2 = qq2[parsed.section];
    if (Array.isArray(entries2) && entries2[parsed.index]) {
      var ref = entries2[parsed.index].firstName || entries2[parsed.index].relation || "this person";
      prompt = prompt.replace(/\{ref\}/g, ref);
    }
  }
  return prompt;
}

// ── Main strategy scorer ─────────────────────────────────────

function lv80ScoreMemoirPromptCandidates(era, pass) {
  if (typeof LorevoxProjectionMap === "undefined") return [];
  if (!state?.bioBuilder) return [];
  if (pass === "pass1") return [];

  var projFields = state.interviewProjection ? state.interviewProjection.fields : {};
  var bbQQ = state.bioBuilder.questionnaire || {};
  var hasIdentity = !!(state.profile?.basics?.dob && state.profile?.basics?.pob);
  var candidates = [];

  // Get all fields from the projection map
  var fieldMap = LorevoxProjectionMap.FIELD_MAP;
  Object.keys(fieldMap).forEach(function (path) {
    var config = fieldMap[path];

    // Skip identity fields if already captured
    if (!hasIdentity && config.priority === 1) { /* include — still need identity */ }
    else if (config.priority === 1 && hasIdentity && config.skipIfPreloaded) return;

    // Skip auto-derived and non-askable
    if (config.autoDerive) return;
    if (!config.conversational) return;

    // Check era relevance
    if (config.eraTags && config.eraTags.length > 0 && era && config.eraTags.indexOf(era) < 0) return;

    // Check if already answered
    var isAnswered = false;
    if (projFields[path] && projFields[path].value) isAnswered = true;
    var parsed = LorevoxProjectionMap.parsePath(path);
    if (parsed && bbQQ[parsed.section]) {
      var existing = bbQQ[parsed.section][parsed.field];
      if (existing && String(existing).trim()) isAnswered = true;
    }

    // Score the candidate
    var score = config.memoirWeight || 3;
    var prompt = null;

    if (isAnswered) {
      // Already answered — only include if it's a hook with a hookPrompt
      if (config.memoirClass === "hook" && config.hookPrompt) {
        prompt = _buildHookPrompt(config, path);
        if (prompt) {
          score += 3; // Hooks on answered fields get bonus
        } else {
          return; // No value to build hook from
        }
      } else {
        return; // Background or thin_zone already answered = skip
      }
    } else {
      // Unanswered — use conversational prompt
      prompt = config.conversational;

      // Background fields with skipIfPreloaded: lower their score drastically
      if (config.memoirClass === "background" && config.skipIfPreloaded) {
        score = 1;
      }
    }

    // Penalties
    if (_wasRecentlyAsked(path)) score -= 5;
    if (config.questionKind && _kindOverused(config.questionKind)) score -= 2;

    // Thin-zone bonus
    var thinZones = lv80DetectThinZones(era);
    for (var t = 0; t < thinZones.length; t++) {
      // If this field's section relates to a thin zone, boost it
      if (parsed && thinZones[t].id.indexOf(parsed.section) >= 0) {
        score += 2;
        break;
      }
    }

    if (score > 0 && prompt) {
      candidates.push({
        path: path,
        config: config,
        prompt: prompt,
        score: score,
        isHook: isAnswered && config.memoirClass === "hook",
        questionKind: config.questionKind || "fact"
      });
    }
  });

  // Sort by score descending
  candidates.sort(function (a, b) { return b.score - a.score; });
  return candidates;
}

// ── Top-level selector ───────────────────────────────────────

function lv80SelectBestMemoirQuestion(era, pass) {
  var candidates = lv80ScoreMemoirPromptCandidates(era, pass);
  if (candidates.length === 0) return null;

  // Pick top candidate
  var best = candidates[0];

  // Record in session memory
  _recordAsked(best.path, best.questionKind, era);

  // Track for projection
  if (state.interviewProjection) {
    if (!best.isHook) {
      state.interviewProjection._currentTargetPath = best.path;
    } else {
      // Hook questions use known data — don't target for overwrite
      state.interviewProjection._currentTargetPath = null;
    }
  }

  console.log("[memoir-strategy] Selected:", best.path,
    "score:", best.score,
    "kind:", best.questionKind,
    "isHook:", best.isHook,
    "era:", era);

  return best;
}

/* ── v7.1 — pass-aware prompt builder ───────────────────────── */
function build71InterviewPrompt(){
  const pass = getCurrentPass();
  const era  = getCurrentEra();
  const mode = getCurrentMode();
  const name = state.profile?.basics?.preferred || state.profile?.basics?.fullname || "this person";

  // v10: Try memoir strategy layer first
  var memoirQ = lv80SelectBestMemoirQuestion(era, pass);
  if (memoirQ) {
    var base = memoirQ.prompt;
    var draftHint = _buildDraftContextHint(era);
    return draftHint ? base + " " + draftHint : base;
  }

  // v8: Fall back to projection-based question selection
  var projectionQ = _getNextProjectionQuestion(era, pass);
  if (projectionQ) {
    var base = projectionQ;
    var draftHint = _buildDraftContextHint(era);
    return draftHint ? base + " " + draftHint : base;
  }

  var base;
  if(pass==="pass2a") base = _timelinePassPrompt(era, mode);
  else if(pass==="pass2b") base = _depthPassPrompt(era, mode, name);
  else base = "When were you born? And where were you born?";

  // v5 integration — enrich with Family Tree / Life Threads draft context
  var draftHint = _buildDraftContextHint(era);
  return draftHint ? base + " " + draftHint : base;
}

/* ── v8 — Projection-aware question selection ──────────────────
   Consults the projection map for the next unanswered questionnaire
   field relevant to the current era. Returns a conversational
   question string, or null if nothing to ask. Skips identity fields
   that were already captured during onboarding.
─────────────────────────────────────────────────────────────── */
function _getNextProjectionQuestion(era, pass) {
  if (typeof LorevoxProjectionMap === "undefined") return null;
  if (typeof LorevoxProjectionSync === "undefined") return null;
  if (!state.bioBuilder) return null;

  // In pass1 (identity onboarding), don't inject template questions
  if (pass === "pass1") return null;

  var projFields = state.interviewProjection ? state.interviewProjection.fields : {};
  var bbQQ = state.bioBuilder.questionnaire || {};

  // Check if identity basics already captured
  var hasIdentity = !!(state.profile?.basics?.dob && state.profile?.basics?.pob);

  var unanswered = LorevoxProjectionMap.getUnansweredForEra(
    era, projFields, bbQQ,
    { limit: 3, includeIdentity: !hasIdentity }
  );

  if (unanswered.length === 0) {
    // Try repeatable sections for this era
    return _getNextRepeatableQuestion(era, projFields, bbQQ);
  }

  // Use the highest-priority unanswered question
  var next = unanswered[0];

  // Track which projection field this prompt targets (for answer extraction)
  state.interviewProjection._currentTargetPath = next.path;

  return next.config.conversational;
}

/* ── v8 — Repeatable section question selection ─────────────── */
function _getNextRepeatableQuestion(era, projFields, bbQQ) {
  if (typeof LorevoxProjectionMap === "undefined") return null;

  var repeatableSections = ["parents", "grandparents", "siblings"];
  for (var i = 0; i < repeatableSections.length; i++) {
    var section = repeatableSections[i];
    var tpl = LorevoxProjectionMap.REPEATABLE_TEMPLATES[section];
    if (!tpl) continue;

    // Check era relevance
    if (era && tpl.eraTags.indexOf(era) < 0) continue;

    // Check if section has any entries in BB yet
    var entries = bbQQ[section];
    var hasEntries = Array.isArray(entries) && entries.length > 0;

    // Check if we already explored this section via projection
    var explored = false;
    Object.keys(projFields).forEach(function (k) {
      if (k.indexOf(section + "[") === 0) explored = true;
    });

    if (!hasEntries && !explored) {
      state.interviewProjection._currentTargetSection = section;
      state.interviewProjection._currentTargetPath = null;
      return tpl.entryPrompt;
    }
  }
  return null;
}

/* ── v6 — era-aware draft context hint for interview prompts ── */
/* Uses the era-aware accessor to produce ranked, era-relevant
   context hints. Falls back to global context if no era data.
   Never leaks private notes or "Do Not Prompt" flagged nodes.
   Returns empty string if no useful context is available. */
function _buildDraftContextHint(era){
  // Try era-aware accessor first (v6), fall back to global (v5)
  if(typeof LorevoxBioBuilder === "undefined") return "";

  var eraCtx = null;
  if(LorevoxBioBuilder._getDraftFamilyContextForEra && era){
    eraCtx = LorevoxBioBuilder._getDraftFamilyContextForEra(null, era);
  }

  if(eraCtx && (eraCtx.primary.length > 0 || eraCtx.secondary.length > 0)){
    // v6 path: era-ranked hints
    var hints = [];
    var people = [];
    var themes = [];
    var places = [];

    // Primary items first, then secondary, capped at 3 each
    var allItems = eraCtx.primary.concat(eraCtx.secondary);
    allItems.forEach(function(item){
      // Respect "Do Not Prompt"
      if(item.node && item.node.notes && /do\s*not\s*prompt/i.test(item.node.notes)) return;
      if(item.type === "ft_person" && people.length < 3) people.push(item.role + " " + item.label);
      else if(item.type === "lt_theme" && themes.length < 3) themes.push(item.label);
      else if(item.type === "lt_place" && places.length < 2) places.push(item.label);
    });

    if(people.length > 0) hints.push("(Family for this era: " + people.join(", ") + ".)");
    if(themes.length > 0) hints.push("(Themes: " + themes.join(", ") + ".)");
    if(places.length > 0) hints.push("(Places: " + places.join(", ") + ".)");
    if(hints.length > 0) return hints.join(" ");
  }

  // v5 fallback: global context
  if(!LorevoxBioBuilder._getDraftFamilyContext) return "";
  var ctx = LorevoxBioBuilder._getDraftFamilyContext();
  if(!ctx) return "";
  var hints = [];

  var ft = ctx.familyTree;
  if(ft && ft.nodes && ft.nodes.length > 1){
    var relNames = [];
    ft.nodes.forEach(function(n){
      if(n.role === "narrator") return;
      if(n.notes && /do\s*not\s*prompt/i.test(n.notes)) return;
      var label = n.displayName || n.preferredName || n.label || "";
      var role = n.role || "";
      if(label && role) relNames.push(role + " " + label);
    });
    if(relNames.length > 0){
      var sample = relNames.slice(0, 3);
      hints.push("(Family context: " + sample.join(", ") + (relNames.length > 3 ? ", and others" : "") + ".)");
    }
  }

  var lt = ctx.lifeThreads;
  if(lt && lt.nodes && lt.nodes.length > 0){
    var themes = [];
    lt.nodes.forEach(function(n){
      if(n.type !== "theme") return;
      var label = n.label || n.displayName || "";
      if(label) themes.push(label);
    });
    if(themes.length > 0){
      var sample = themes.slice(0, 3);
      hints.push("(Life themes: " + sample.join(", ") + (themes.length > 3 ? ", and more" : "") + ".)");
    }
  }

  return hints.join(" ");
}

function _timelinePassPrompt(era, mode){
  const base = {
    early_childhood:  "Let's begin near the beginning. What do you know about the place where you were born, and where you lived when you were very young?",
    school_years:     "Thinking about your school years, what town, school, or neighborhood feels most connected to that time?",
    adolescence:      "As you got older, what changed most in your life during those years — school, friends, family, work, or where you lived?",
    early_adulthood:  "What do you think of as the beginning of your adult life? Where were you living then?",
    midlife:          "What responsibilities, jobs, or family roles shaped your middle adult years the most?",
    later_life:       "What major transitions stand out most from your later adult years?",
  }[era] || "Let's continue building the life timeline.";

  if(mode==="recognition") return base + " You can answer with whichever option feels closest, even if you're not sure.";
  if(mode==="light")       return base + " We can keep this simple.";
  if(mode==="grounding")   return "We can go gently. What place from that part of life feels safest or easiest to begin with?";
  return base;
}

function _depthPassPrompt(era, mode, name){
  const base = {
    early_childhood:  "When you picture your earliest home, what room, smell, or sound comes back first?",
    school_years:     "What is one vivid memory from your school years that still feels close to you now?",
    adolescence:      "When you think about your teenage years, what place, person, or feeling stands out most clearly?",
    early_adulthood:  "What moment made early adult life start to feel real to you?",
    midlife:          "What scene best captures what those middle years felt like day to day?",
    later_life:       "Looking back on later life, what moments feel the most meaningful now?",
  }[era] || `Let's deepen the story around ${name}'s life.`;

  if(mode==="recognition") return base + " If it helps, you can start with a place, a person, or a routine.";
  if(mode==="light")       return base + " We can keep to one small memory.";
  if(mode==="grounding")   return "We can stay with this lightly, or move somewhere gentler for now.";
  return base;
}

/* ── v7.1 — mode button wiring (Chron=Pass2A, Thematic=Pass2B) ─ */
function setInterviewMode(mode){
  interviewMode = mode;
  const chronBtn=document.getElementById("modeChronBtn");
  const themeBtn=document.getElementById("modeThemeBtn");
  if(chronBtn) chronBtn.classList.toggle("active", mode==="chronological");
  if(themeBtn) themeBtn.classList.toggle("active", mode==="thematic");
  // v7.1 — wire to pass engine
  if(mode==="chronological") setPass("pass2a");
  else                       setPass("pass2b");
  update71RuntimeUI();
  renderRoadmap();
  renderInterview();
}

/* ── INTERVIEW START ─────────────────────────────────────────── */
async function ivStart(){
  if(!state.person_id){ sysBubble("Select or create a person first."); return; }

  // v8.0: The old permCard is hidden (display:none shim) in lori8.0.html.
  // Permissions (mic, camera, location) are now managed via the
  // lv80SettingsPopover opened from the gear icon.  On first interview
  // start we show a brief nudge about the settings, then proceed directly.
  if(!permCardShown){
    permCardShown=true;
    // Gentle reminder — don't block the interview on it
    if(typeof sysBubble==="function"){
      sysBubble("💡 Tip: Open Settings (⚙️) to enable voice input, camera, or location sharing.");
    }
  }
  await _ivStartActual();
}

async function _ivStartActual(){
  // v6.3: DOB gate — nudge if date of birth is not yet in the profile
  if(!state.profile?.basics?.dob){
    sysBubble("💡 Tip: Add a date of birth on the Profile tab to unlock age-anchored memory triggers before we begin.");
  }

  try{
    const r=await fetch(API.IV_START,{method:"POST",headers:ctype(),
      body:JSON.stringify({person_id:state.person_id, plan_id:"default"})});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j=await r.json();
    state.interview={
      session_id:j.session_id,
      question_id:j.question?.id||null,
      prompt:j.question?.prompt||null
    };
    renderInterview();
    // Reload any persisted segment decisions for this person
    _loadSegments();
    renderSensitiveReviewPanel();
    if(j.question?.prompt){
      sendSystemPrompt(`[SYSTEM: You are now in an interview. Please ask this first question warmly: "${j.question.prompt}"]`);
    }
    sysBubble("▶ Interview section started.");
    showTab("interview");

    // Start camera if user opted in
    if(permCamOn && emotionAware) startEmotionEngine();
  }catch{
    sysBubble("⚠ Interview service unavailable — chat freely with Lori to capture memories.");
  }
}

/* ── INTERVIEW ANSWER PROCESSING ─────────────────────────────── */
async function processInterviewAnswer(text, skipped=false){
  if(!state.interview.session_id||!state.interview.question_id) return null;
  // Capture the answered question's ID BEFORE the response updates state.interview
  // (j.next_question will overwrite state.interview.question_id below)
  const answeredQuestionId = state.interview.question_id;

  // v8 projection: attempt to project the answer into the targeted field
  // WO-deferred: immediate single-field projection, but queue multi-field extraction
  // to run AFTER Lori finishes responding (avoids GPU contention).
  if (!skipped && text && text.trim()) {
    const clean = text.trim();
    _projectAnswerToField(clean, answeredQuestionId);

    // Queue extraction instead of firing immediately
    state.interviewProjection = state.interviewProjection || {};
    state.interviewProjection._pendingExtraction = {
      answerText: clean,
      turnId: answeredQuestionId,
      queuedAt: Date.now(),
      source: "processInterviewAnswer"
    };
    console.log("[extract][queue] deferred interview extraction", {
      turnId: answeredQuestionId
    });
  }
  try{
    const r=await fetch(API.IV_ANSWER,{method:"POST",headers:ctype(),body:JSON.stringify({
      session_id:state.interview.session_id,
      question_id:answeredQuestionId,
      answer:text, skipped
    })});
    const j=await r.json();
    if(j.next_question){
      state.interview.question_id=j.next_question.id;
      state.interview.prompt=j.next_question.prompt;
    }
    if(j.summary_section_id){
      // Translate backend plan ID → UI roadmap ID (they use different naming conventions)
      const uiId=PLAN_ID_MAP[j.summary_section_id]||j.summary_section_id;
      const idx=INTERVIEW_ROADMAP.findIndex(s=>s.id===uiId);
      if(idx>=0){ sectionDone[idx]=true; sectionIndex=Math.min(idx+1,INTERVIEW_ROADMAP.length-1);
        persistSectionDone(); renderRoadmap(); renderMemoirChapters(); updateSidebar(); }
    }
    if(j.generated_summary) appendOutput("📝 Section Summary — "+(j.summary_section_title||""), j.generated_summary);
    if(j.final_memoir)      appendOutput("📖 Memoir Draft", j.final_memoir);

    // v6.1 Track A: Handle safety trigger from backend
    turnCount++;
    if(j.safety_triggered && j.safety_category){
      const resources = j.safety_resources || [];
      // Pass session + question IDs so include/remove actions can reach the backend
      flagSensitiveSegment(
        sectionIndex,
        j.safety_category,
        text,
        state.interview.session_id,
        answeredQuestionId       // use the ID of the answered question, not the next
      );
      showSafetyOverlay(j.safety_category, resources);
    }
    if(j.interview_softened){
      softenedMode=true;
      softenedUntilTurn=turnCount+3;
    }
    // Auto-expire softened mode
    if(softenedMode && turnCount >= softenedUntilTurn){
      softenedMode=false;
    }

    renderInterview();
    return j;
  }catch{ return null; }
}

/* ── INTERVIEW CONTROLS ──────────────────────────────────────── */
async function ivAskInChat(){
  if(!state.interview.prompt){ sysBubble("Start an interview section first."); return; }

  // v6.2: bilingual — prefix instruction when a non-English language is set
  const _lang=state.profile?.basics?.language||"";
  const _langPrefix=_lang?`[SYSTEM: Please ask the following question in ${_lang}.] `:"";

  let instruction;

  if(softenedMode){
    // Post-disclosure softened mode takes priority over affect nudges
    const turnsLeft = softenedUntilTurn - turnCount;
    if(turnsLeft <= 1){
      // Second+ softened question — add a gentle check-in
      instruction = `${_langPrefix}[SYSTEM: The person shared something difficult earlier in this session. Please ask the following question very gently and briefly. After the question, add a warm check-in: "How are you doing? We can keep going or take a break anytime." Do not pressure or probe. Question: "${state.interview.prompt}"]`;
    } else {
      // First softened question after disclosure
      instruction = `${_langPrefix}[SYSTEM: The person recently shared something difficult. Please ask the following question very gently and briefly — keep it short, no follow-up pressure, no probing. Question: "${state.interview.prompt}"]`;
    }
  } else {
    // v6.1 Track B: check for a recent affect signal and nudge Lori's tone
    const affect = _latestAffect();
    let affectCtx = "";
    if(affect){
      if(affect.affect_state === "moved"){
        affectCtx = " The person appears moved — take a gentle, unhurried tone and give them space.";
      } else if(affect.affect_state === "reflective"){
        affectCtx = " The person seems reflective — keep the question short and leave room for them to think.";
      } else if(affect.affect_state === "distressed" || affect.affect_state === "overwhelmed"){
        affectCtx = " The person seems unsettled — check in first: \"We can slow down if you'd like.\" then ask gently.";
      } else if(affect.affect_state === "engaged"){
        affectCtx = " The person seems engaged — you can open this up warmly and invite them to share more.";
      }
    }
    instruction = `${_langPrefix}[SYSTEM: Please ask this question now.${affectCtx} Question: "${state.interview.prompt}"]`;
  }

  await sendSystemPrompt(instruction);
}

async function ivSkip(){ await processInterviewAnswer("",true); sysBubble("⤼ Skipped for now."); }

async function ivSaveAndNext(){
  const ans=getv("ivAnswer").trim(); if(!ans){ sysBubble("Type an answer first."); return; }
  const result=await processInterviewAnswer(ans);
  if(result!==null){ captureState="saved"; renderCaptureChip();
    setTimeout(()=>{ setv("ivAnswer",""); captureState=null; renderCaptureChip(); },600); }
}

async function ivSaveAsMemory(){
  const ans=getv("ivAnswer").trim(); if(!ans){ sysBubble("Type something to save as a memory."); return; }
  if(!state.person_id){ sysBubble("Select a person first."); return; }
  const s=INTERVIEW_ROADMAP[sectionIndex];
  const title=s?`${s.label} — memory`:"Memory";
  try{
    await fetch(API.TL_ADD,{method:"POST",headers:ctype(),body:JSON.stringify({
      person_id:state.person_id,title,description:ans,ts:new Date().toISOString().split("T")[0],
      kind:"personal"})});
    captureState="saved"; renderCaptureChip();
    sysBubble("📁 Saved as memory to Timeline.");
    renderTimeline();
  }catch{ sysBubble("⚠ Could not reach timeline service — memory not saved."); }
}

function onIvAnswerEdit(){
  if(captureState==="captured") captureState="edited";
  renderCaptureChip();
}

function renderCaptureChip(){
  const el=document.getElementById("captureChip"); if(!el) return;
  if(!captureState){ el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  if(captureState==="captured"){
    el.className="capture-chip captured"; el.textContent="✓ Captured from Lori";
  } else if(captureState==="saved"){
    el.className="capture-chip saved"; el.textContent="📁 Saved to archive";
  } else {
    el.className="capture-chip edited"; el.textContent="✎ Edited by hand";
  }
}

/* ═══════════════════════════════════════════════════════════════
   v8 — Interview Projection: Answer → Field Extraction
   Attempts to project the user's answer text into the targeted
   projection field. Uses the target path set by _getNextProjectionQuestion()
   or _getNextRepeatableQuestion(). For simple identity fields, the answer
   text is used directly. For narrative fields, the full answer is stored.
   For repeatable sections, the answer seeds a new candidate entry.
═══════════════════════════════════════════════════════════════ */

function _projectAnswerToField(answerText, turnId) {
  if (typeof LorevoxProjectionSync === "undefined") return;
  if (typeof LorevoxProjectionMap === "undefined") return;
  if (!state.interviewProjection) return;

  var targetPath    = state.interviewProjection._currentTargetPath || null;
  var targetSection = state.interviewProjection._currentTargetSection || null;

  // Save for multi-field extractor (consumed after async call)
  state.interviewProjection._lastTargetPath = targetPath;
  state.interviewProjection._lastTargetSection = targetSection;

  // Clean up tracking state
  state.interviewProjection._currentTargetPath = null;
  state.interviewProjection._currentTargetSection = null;

  if (targetPath) {
    // Direct field projection — answer maps to a specific questionnaire field
    var config = LorevoxProjectionMap.getFieldConfig(targetPath);
    var value = answerText;

    // Apply normalization helpers if available
    if (config && config.inputHelper) {
      if (config.inputHelper === "normalizeDob" && typeof normalizeDobInput === "function") {
        value = normalizeDobInput(value);
      } else if (config.inputHelper === "normalizePlace" && typeof normalizePlaceInput === "function") {
        value = normalizePlaceInput(value);
      } else if (config.inputHelper === "normalizeTime" && typeof normalizeTimeOfBirthInput === "function") {
        value = normalizeTimeOfBirthInput(value);
      }
    }

    LorevoxProjectionSync.projectValue(targetPath, value, {
      source: "interview",
      turnId: turnId,
      confidence: 0.85
    });

    // Auto-derive zodiac if we just projected a DOB
    if (targetPath === "personal.dateOfBirth" && typeof deriveZodiacFromDob === "function") {
      var zodiac = deriveZodiacFromDob(value);
      if (zodiac) {
        LorevoxProjectionSync.projectValue("personal.zodiacSign", zodiac, {
          source: "interview",
          turnId: turnId,
          confidence: 1.0
        });
      }
    }

    console.log("[interview] Projected answer → " + targetPath);

  } else if (targetSection) {
    // Repeatable section — seed a new candidate entry from the answer
    // The answer likely contains a name or description; we project it as
    // the first field of a new entry (usually firstName for people sections)
    var tpl = LorevoxProjectionMap.REPEATABLE_TEMPLATES[targetSection];
    if (!tpl) return;

    // Determine next index
    var bb = state.bioBuilder;
    var existingEntries = (bb && bb.questionnaire && Array.isArray(bb.questionnaire[targetSection]))
      ? bb.questionnaire[targetSection].length : 0;
    var projEntries = 0;
    Object.keys(state.interviewProjection.fields).forEach(function (k) {
      if (k.indexOf(targetSection + "[") === 0) {
        var m = k.match(/\[(\d+)\]/);
        if (m) projEntries = Math.max(projEntries, parseInt(m[1], 10) + 1);
      }
    });
    var nextIdx = Math.max(existingEntries, projEntries);

    // Try to extract a name from the answer (simple heuristic: first few words)
    var words = answerText.split(/\s+/);
    var nameGuess = words.slice(0, 3).join(" "); // rough first-name extraction

    var firstNamePath = LorevoxProjectionMap.buildRepeatablePath(targetSection, nextIdx, "firstName");
    LorevoxProjectionSync.projectValue(firstNamePath, nameGuess, {
      source: "interview",
      turnId: turnId,
      confidence: 0.6  // lower confidence for heuristic extraction
    });

    console.log("[interview] Seeded repeatable entry → " + targetSection + "[" + nextIdx + "]");
  }
}

/* ═══════════════════════════════════════════════════════════════
   WO-deferred: Deferred extraction runner
   Flushes queued extraction AFTER Lori finishes responding.
   Called from app.js WS done / SSE completion paths.
═══════════════════════════════════════════════════════════════ */

async function _runDeferredInterviewExtraction() {
  var pending = state && state.interviewProjection && state.interviewProjection._pendingExtraction;
  if (!pending || !pending.answerText) return;

  // Ensure at least 1s has elapsed since queueing to let chat/TTS settle
  var ageMs = Date.now() - (pending.queuedAt || 0);
  if (ageMs < 1000) {
    await new Promise(function(r) { setTimeout(r, 1000 - ageMs); });
  }

  // Re-read the queue — a newer turn may have replaced this one
  var current = state && state.interviewProjection && state.interviewProjection._pendingExtraction;
  if (!current || current.turnId !== pending.turnId) {
    console.log("[extract][stale] deferred extraction superseded by newer turn");
    return;
  }

  // Extra dedup: if _extractAndProjectMultiField already ran for this turnId, skip
  if (current.turnId === _lastExtractionTurnId) {
    console.log("[extract][dedup] deferred extraction already ran for turnId=" + current.turnId);
    state.interviewProjection._pendingExtraction = null;
    return;
  }

  console.log("[extract][run] deferred extraction firing", {
    turnId: current.turnId,
    source: current.source,
    ageMs: Date.now() - current.queuedAt
  });

  try {
    _extractAndProjectMultiField(current.answerText, current.turnId);
  } catch (e) {
    console.log("[extract][run] deferred extraction error:", e);
  } finally {
    // Clear only if still the same turn (don't clobber a newer queue entry)
    if (state && state.interviewProjection &&
        state.interviewProjection._pendingExtraction &&
        state.interviewProjection._pendingExtraction.turnId === current.turnId) {
      state.interviewProjection._pendingExtraction = null;
      console.log("[extract][flush-complete] turnId=" + current.turnId);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   v8.1 — Backend Multi-Field Extraction
   Calls /api/extract-fields to decompose a compound answer into
   multiple field projections. Runs async and non-blocking.
   Falls back gracefully if the backend is unreachable.
═══════════════════════════════════════════════════════════════ */

// FIX-7: Track last extraction turnId to prevent double-firing per user message.
var _lastExtractionTurnId = null;
var _lastExtractionTimestamp = 0;

function _extractAndProjectMultiField(answerText, turnId) {
  if (typeof LorevoxProjectionSync === "undefined") return;
  if (typeof LorevoxProjectionMap === "undefined") return;
  if (!state.interviewProjection) return;
  if (!state.person_id) return;

  // FIX-7: Dedup — skip if we already extracted for this turnId.
  if (turnId && turnId === _lastExtractionTurnId) {
    console.log("[extract] Skipping duplicate extraction for turnId: " + turnId);
    return;
  }
  // FIX-7b: Timestamp cooldown — skip if extraction fired within the last 1s.
  // This catches double-fires from interview + free-form paths which use different turnId formats.
  var now = Date.now();
  if (now - _lastExtractionTimestamp < 1000) {
    console.log("[extract] Skipping rapid-fire duplicate extraction (cooldown)");
    return;
  }
  _lastExtractionTurnId = turnId;
  _lastExtractionTimestamp = now;

  var targetPath = state.interviewProjection._lastTargetPath || null;
  var targetSection = state.interviewProjection._lastTargetSection || null;

  // WO-9: Chunk long answers before sending to backend
  var chunks = (typeof _wo8ChunkText === "function" && answerText && answerText.length > 1200)
    ? _wo8ChunkText(answerText, 1200) : [answerText];
  if (chunks.length > 1) {
    console.log("[extract][WO-9] Chunked answer into " + chunks.length + " segments for backend extraction");
  }

  var allItems = [];
  var extractMethod = "";
  var chunkPromises = chunks.map(function (chunk, ci) {
    var payload = {
      person_id: state.person_id,
      session_id: state.interview.session_id || null,
      answer: chunk,
      current_section: targetSection || null,
      current_target_path: targetPath || null
    };
    return fetch((window.LOREVOX_API || "http://localhost:8000") + "/api/extract-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function (resp) {
      if (!resp.ok) throw new Error("extract-fields returned " + resp.status);
      return resp.json();
    })
    .then(function (data) {
      if (data.items && data.items.length > 0) {
        allItems = allItems.concat(data.items);
        if (!extractMethod) extractMethod = data.method || "";
        console.log("[extract] Chunk " + (ci + 1) + "/" + chunks.length + ": " + data.items.length + " items");
      }
    });
  });

  Promise.all(chunkPromises)
  .then(function () {
    // WO-9: Deduplicate items across chunks (same fieldPath + value = skip)
    var seen = {};
    var data = { items: [], method: extractMethod };
    for (var i = 0; i < allItems.length; i++) {
      var key = (allItems[i].fieldPath || "") + "::" + (allItems[i].value || "");
      if (!seen[key]) {
        seen[key] = true;
        data.items.push(allItems[i]);
      }
    }

    if (!data.items || data.items.length === 0) {
      console.log("[extract] No additional fields extracted (method: " + data.method + ")");
      return;
    }
    console.log("[extract] Backend returned " + data.items.length + " items via " + data.method + (chunks.length > 1 ? " (" + chunks.length + " chunks)" : ""));

    // Track repeatable section indices for grouping
    var repeatableCounters = {};
    // v8.0 FIX: Track which fields have been seen at each index to detect
    // when a new person starts (duplicate field = new entry).
    var repeatableFieldsSeen = {};  // "section" → Set of field names seen at current index
    // FIX-4: Track repeatableGroup→index mapping from backend grouping.
    // When the backend provides repeatableGroup tags, use them for index assignment
    // instead of relying solely on duplicate-field detection.
    var groupToIndex = {};

    data.items.forEach(function (item) {
      var fieldPath = item.fieldPath;
      var writeMode = item.writeMode;

      // For repeatable sections, resolve the path with a proper index.
      // Backend returns generic paths like "parents.firstName" (no index).
      // parsePath("parents.firstName") returns {section, index: null, field}
      // which needs an index assigned for repeatable sections.
      var parsed = LorevoxProjectionMap.parsePath(fieldPath);
      var needsIndex = !parsed
        || (parsed && parsed.index === null && LorevoxProjectionMap.REPEATABLE_TEMPLATES[parsed.section]);

      if (needsIndex) {
        var parts = fieldPath.split(".");
        var section = parsed ? parsed.section : parts[0];
        var field = parsed ? parsed.field : parts[1];
        if (section && field && LorevoxProjectionMap.REPEATABLE_TEMPLATES[section]) {

          // Determine the right index for this entry
          // v8.0 FIX: use `=== undefined` instead of `!` to avoid JS falsy-zero bug.
          if (repeatableCounters[section] === undefined) {
            // Find the next available index
            var bb = state.bioBuilder;
            var existingEntries = (bb && bb.questionnaire && Array.isArray(bb.questionnaire[section]))
              ? bb.questionnaire[section].length : 0;
            var projEntries = 0;
            Object.keys(state.interviewProjection.fields).forEach(function (k) {
              if (k.indexOf(section + "[") === 0) {
                var m = k.match(/\[(\d+)\]/);
                if (m) projEntries = Math.max(projEntries, parseInt(m[1], 10) + 1);
              }
            });
            repeatableCounters[section] = Math.max(existingEntries, projEntries);
            repeatableFieldsSeen[section] = new Set();
          }

          // FIX-4: Use backend repeatableGroup for index assignment when available.
          // This ensures all fields for the same person share the same index,
          // even when items arrive in non-contiguous order (e.g. occupations after all names).
          if (item.repeatableGroup) {
            if (groupToIndex[item.repeatableGroup] === undefined) {
              // First field in this group — assign current counter
              // Check if we need to bump (duplicate field in same section without group)
              if (repeatableFieldsSeen[section] && repeatableFieldsSeen[section].has(field)) {
                repeatableCounters[section]++;
                repeatableFieldsSeen[section] = new Set();
                console.log("[extract] New " + section + " entry detected via group (duplicate " + field + ") — index now " + repeatableCounters[section]);
              }
              groupToIndex[item.repeatableGroup] = repeatableCounters[section];
            }
            // Use the group's assigned index
            var groupIdx = groupToIndex[item.repeatableGroup];
            if (!repeatableFieldsSeen[section]) repeatableFieldsSeen[section] = new Set();
            repeatableFieldsSeen[section].add(field);
            fieldPath = LorevoxProjectionMap.buildRepeatablePath(section, groupIdx, field);
          } else {
            // Legacy path: duplicate-field detection for ungrouped items
            if (repeatableFieldsSeen[section] && repeatableFieldsSeen[section].has(field)) {
              repeatableCounters[section]++;
              repeatableFieldsSeen[section] = new Set();
              console.log("[extract] New " + section + " entry detected (duplicate " + field + ") — index now " + repeatableCounters[section]);
            }
            if (!repeatableFieldsSeen[section]) repeatableFieldsSeen[section] = new Set();
            repeatableFieldsSeen[section].add(field);
            fieldPath = LorevoxProjectionMap.buildRepeatablePath(section, repeatableCounters[section], field);
          }
        }
      }

      // Skip if the simple extractor already projected this exact path
      var existing = state.interviewProjection.fields[fieldPath];
      if (existing && existing.turnId === turnId && existing.value === item.value) {
        console.log("[extract] Skipping duplicate: " + fieldPath);
        return;
      }

      // Project through the sync layer — all write-mode rules still apply
      var projected = LorevoxProjectionSync.projectValue(fieldPath, item.value, {
        source: "backend_extract",
        turnId: turnId,
        confidence: item.confidence || 0.8
      });

      if (projected) {
        console.log("[extract] ✓ Projected: " + fieldPath + " = " + item.value.substring(0, 50));
      }
    });

    // Force persist after batch
    if (typeof LorevoxProjectionSync.forcePersist === "function") {
      LorevoxProjectionSync.forcePersist();
    }
  })
  .catch(function (err) {
    // Non-fatal: backend extraction is supplementary
    console.warn("[extract] Backend extraction unavailable:", err.message);
  });
}


/* ── v8 — Wire projection reset into narrator switch ─────────── */
/* Called from app.js lvxSwitchNarratorSafe() alongside the
   bio-builder-core narrator reset. */
function _ivResetProjectionForNarrator(newPid) {
  if (typeof LorevoxProjectionSync !== "undefined") {
    LorevoxProjectionSync.resetForNarrator(newPid);
  }
}
