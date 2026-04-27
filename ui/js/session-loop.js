/* ═══════════════════════════════════════════════════════════════
   session-loop.js — WO-HORNELORE-SESSION-LOOP-01

   Post-identity conversation orchestrator.  After identityPhase is
   "complete", this dispatcher fires once per narrator turn and decides
   what Lori does next based on state.session.sessionStyle.

   Locked product rule (2026-04-24):
     "After identity is complete, the session NEVER dead-ends.
      Lori always has a next step, defined by the operator's sessionStyle."

   Style behavior summary (Phase 1):
     questionnaire_first → walk Bio Builder MINIMAL_SECTIONS personal
                           fields one at a time (preferredName, birthOrder,
                           timeOfBirth — the three not already captured by
                           identity intake), save each answer via PUT to
                           /api/bio-builder/questionnaire, then offer to
                           switch to warm_storytelling when out of fields.
                           Repeatable sections (parents/siblings) deferred
                           to Phase 2.
     clear_direct        → walk + tier-2 directive (set in runtime71)
     warm_storytelling   → no-op (existing default Lori behavior)
     memory_exercise     → tier-2 directive only (no walk)
     companion           → tier-2 directive only (no walk)

   Hard rules:
     - No new backend route — uses existing /api/bio-builder/questionnaire
     - No new questionnaire schema — reads bio-builder-questionnaire.js
       MINIMAL_SECTIONS at runtime
     - Reuses existing identity state machine — handoff happens when
       _advanceIdentityPhase flips identityPhase → "complete"
     - Kawa / Chronology stay PASSIVE — read only, no mutation
     - Repeatable BB sections (parents, siblings, grandparents) DEFERRED

   Load order: AFTER state.js, app.js, bio-builder-questionnaire.js,
   session-style-router.js (we depend on getSessionStyle, sendSystemPrompt,
   appendBubble, API constants).
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const ASKED_CAP = 60;

  // Cache the BB blob briefly so consecutive fast turns don't re-fetch.
  // Invalidated on narrator switch (lvSessionStyleEnter resets it).
  let _bbCache = { pid: null, blob: null, ts: 0 };
  const BB_CACHE_TTL_MS = 5_000;

  /* ── Public dispatcher ─────────────────────────────────────────
     Called from:
       - session-style-router.js when identityPhase first hits "complete"
         (trigger: "identity_complete")
       - app.js after each narrator turn lands once identity is complete
         (trigger: "narrator_turn", text: <user message>)
       - operator skip affordances (trigger: "operator_skip")

     Idempotent — multiple calls in the same turn are safe (the
     askedKeys ledger prevents duplicate field asks). */
  async function lvSessionLoopOnTurn(event) {
    if (!state || !state.session) return;
    if (!state.session.loop) {
      state.session.loop = {
        currentSection: null, currentField: null,
        askedKeys: [], savedKeys: [], lastTrigger: null, lastAction: null,
        tellingStoryOnce: false,
        // PATCH 6 (WO-SESSION-INTENT-STABILITY-01): handoff tracker.
        // Replaces the prior mechanism of mutating state.session.sessionStyle
        // to suppress repeated handoff prompts after the QF walk exhausts.
        activeIntent: null,
      };
    }
    // WO-01B: belt-and-suspenders for sessions with a stale state.js
    // that initialized loop without savedKeys.
    if (!Array.isArray(state.session.loop.savedKeys)) {
      state.session.loop.savedKeys = [];
    }
    // PATCH 6: belt-and-suspenders for sessions whose loop predates
    // activeIntent — landed 2026-04-25.  Default null preserves prior
    // behavior; the early-return guard in _routeQuestionnaireFirst only
    // fires once activeIntent is explicitly set to "people_who_shaped_you".
    if (typeof state.session.loop.activeIntent === "undefined") {
      state.session.loop.activeIntent = null;
    }
    event = event || {};
    state.session.loop.lastTrigger = event.trigger || "unknown";

    // PATCH 6: identity_complete is the canonical "fresh session start"
    // signal — fires after v9 identity intake, before the first BB walk
    // turn.  Reset activeIntent so a returning narrator (or operator
    // re-picking questionnaire_first) can walk again.  Without this,
    // the post-handoff early-return would permanently suppress the
    // walk for any narrator who completed it once.
    if (event.trigger === "identity_complete") {
      state.session.loop.activeIntent = null;
    }

    const style = (typeof getSessionStyle === "function")
      ? getSessionStyle()
      : (state.session.sessionStyle || "warm_storytelling");

    console.log("[session-loop] dispatch:",
      JSON.stringify({ style, trigger: event.trigger,
        section: state.session.loop.currentSection,
        field:   state.session.loop.currentField }));

    // Single-turn override: narrator said "tell a story instead" last
    // turn.  Route THIS turn through warm_storytelling, then resume the
    // walk on the next narrator turn.
    if (state.session.loop.tellingStoryOnce) {
      state.session.loop.tellingStoryOnce = false;
      state.session.loop.lastAction = "single_turn_override:warm_storytelling";
      console.log("[session-loop] single-turn warm-storytelling override");
      return;
    }

    switch (style) {
      case "questionnaire_first": return _routeQuestionnaireFirst(event);
      case "clear_direct":        return _routeClearDirect(event);
      // memory_exercise REMOVED 2026-04-25 — picker option dropped after
      // live test showed it was a no-op (prompt suffix only, no real
      // routing). Legacy redirect in session-style-router coerces any
      // saved value to warm_storytelling on load, so this case can't
      // realistically be hit. If it is hit (stale state), fall through
      // to warm_storytelling default.
      case "companion":           return _routeCompanion(event);
      case "warm_storytelling":
      default:                    return _routeWarmStorytelling(event);
    }
  }
  window.lvSessionLoopOnTurn = lvSessionLoopOnTurn;

  /* ── Style: questionnaire_first ────────────────────────────────
     Walk MINIMAL_SECTIONS personal fields one at a time.  Identity
     intake already captured fullName + dateOfBirth + placeOfBirth, so
     the walk asks the remaining personal fields (preferredName,
     birthOrder, timeOfBirth) and then hits the deferred parents
     section, at which point we offer to switch to warm storytelling.

     WO-01B: On narrator_turn, the previously-asked field's answer gets
     PUT to /api/bio-builder/questionnaire BEFORE we look for the next
     empty field — turns the loop from "asks questions" into "actually
     builds the record".
  ─────────────────────────────────────────────────────────────── */
  async function _routeQuestionnaireFirst(event) {
    const loop = state.session.loop;

    // PATCH 6 (WO-SESSION-INTENT-STABILITY-01): once the personal-basics
    // walk has handed off to the "people who shaped you" branch, do NOT
    // re-fire the handoff prompt on every subsequent narrator_turn.
    // Earlier code mutated state.session.sessionStyle to "warm_storytelling"
    // as the suppression mechanism, but that broke operator-selected mode
    // authority (localStorage stayed questionnaire_first while in-memory
    // flipped — confirmed AMBER in 2026-04-25T19:18 operator log).
    // Now we use loop.activeIntent as the suppression flag and let the
    // base LLM stack drive subsequent turns without an overlay directive.
    if (loop && loop.activeIntent === "people_who_shaped_you") {
      loop.lastAction = "no_op:post_handoff (questionnaire_first)";
      return;
    }

    // BUG-212: digression detector.  When the narrator's reply is a
    // long-form story rather than an answer to the asked structured
    // field, do NOT save it to that field (would pollute the scalar)
    // and do NOT fire the next-field SYSTEM_QF prompt this turn.
    // Live evidence: Jake (test session 119bf732) said "I turn the
    // camera on for you that elbow Woods was a fun place on the river
    // too bad they had to ruin it and flood it" — Lori then dismissed
    // it with "That's a nice detail, but I didn't ask about time of
    // birth earlier" because the loop fired SYSTEM_QF timeOfBirth
    // immediately after.  Violates WO-10C (no correction, listen-first).
    function _isDigressionAnswer(text, fieldId) {
      if (!text || typeof text !== "string") return false;
      const t = text.trim();
      const wc = t.split(/\s+/).filter(Boolean).length;
      // BUG-222: refusal / repetition cues — short replies that aren't
      // narrative but also aren't valid answers.  Live evidence: Corky
      // BB Time of Birth field showed "i told you more than once that
      // information" — 8 words, well below longForm threshold, no
      // STORY_CUES match, so the prior detector let it through and it
      // was saved verbatim to the structured time field.
      const REFUSAL_CUES = /\b(told you (more than|already|before|that)|already (said|told|answered)|same as before|asked already|like i (said|told)|repeating myself|i don't (want|wanna) (to )?(say|answer|talk))\b/i;
      if (REFUSAL_CUES.test(t)) return true;
      // Hard length cutoff: anything > 120 chars or > 18 words is a
      // narrative, regardless of field.  Older-adult narrators give
      // succinct answers to structured Qs; long replies are stories.
      const longForm = (t.length > 120) || (wc > 18);
      // Memory markers — phrases that signal the narrator went into
      // narrative mode rather than answering.
      const STORY_CUES = /\b(too bad|fun place|great place|loved|hated|i miss|i remember|back then|growing up|reminds me|wish|story|kids|that was|those days|when i was)\b/i;
      const hasStoryCue = STORY_CUES.test(t);
      // Field-shape mismatch: most BB fields expect short tokens.
      // birthOrder = oldest/youngest/middle/etc; timeOfBirth = morning/etc.
      const SHORT_FIELDS = ["birthOrder", "timeOfBirth", "preferredName"];
      const fieldExpectsShort = SHORT_FIELDS.includes(fieldId);
      // A short field with a long reply is a clear digression.
      // A long field (placeOfBirth, fullName, dateOfBirth) tolerates
      // longer answers; we still bail on extreme length + story cues.
      if (fieldExpectsShort && (longForm || hasStoryCue)) return true;
      if (longForm && hasStoryCue) return true;
      // Extra-long across the board.
      if (t.length > 200 || wc > 30) return true;
      return false;
    }

    // BUG-227: Multi-field identity rescue inside the QF walk.
    //
    // When a narrator's BB blob is polluted from earlier sessions
    // (live evidence 2026-04-25T21:13: pid 3fc781ae had garbage in
    // fullName/preferredName/dateOfBirth/placeOfBirth from prior tests),
    // the QF walk skips past those "filled" fields and asks only the
    // remaining empty one (timeOfBirth in the live case). The narrator's
    // re-introduction ("My name is Melanie ... born in Lima Peru
    // December 20 1972") then gets ignored or saved as a single-field
    // answer to whatever the QF walk happened to be asking.
    //
    // Fix: every narrator_turn during QF, run the canonical identity
    // extractors against the FULL utterance. If the input contains
    // identity-shaped facts (name + DOB + POB, or any subset), overwrite
    // the polluted fields and skip the asked-field save for THIS turn.
    // This makes the narrator's intro authoritative.
    if (event && event.trigger === "narrator_turn" &&
        typeof event.text === "string" && event.text.trim() &&
        typeof window._extractIdentityFieldsFromUtterance === "function") {
      try {
        const _identity = window._extractIdentityFieldsFromUtterance(event.text);
        // BUG-230 + BUG-234: rescue requires SELF-INTRO signals, not just
        // multi-field extraction.
        // Live evidence 2026-04-25T22:48 (BUG-230): narrator answered
        //   "Sarah" → birthplace parser matched fallback → single-field
        //   rescue wrote pob=Sarah. Fixed by requiring 2+ fields.
        // Live evidence 2026-04-25T23:55 (BUG-234): break case "My son
        //   Michael was born in Denver in 1982" extracted dob+pob (2
        //   fields, BUG-230 passed) → rescue overwrote real DOB+POB
        //   with the SON's data. The 2-field guard is necessary but
        //   not sufficient.
        // True self-intro signal: either an explicit name pattern
        // matched ("My name is X" / "I'm X" / "Call me X") OR a
        // first-person birth claim ("I was born", "I'm born", "I am born").
        // Third-person references ("my son was born", "she was born",
        // "they grew up in") don't satisfy either and must not trigger.
        const _hasName = !!(_identity && _identity.name);
        const _firstPersonBirth = /\b(?:i|i'?m|i\s+was|i\s+am)\s+(?:was\s+)?born\b/i.test(event.text);
        // BUG-234 hardening: even with first-person + dob/pob, the narrator
        // may be CORRECTING themselves ("I think I was born in 1953 actually")
        // or hedging ("maybe", "actually", "wait"). Per spec, conflicting
        // identity claims must be flagged or ignored — NOT silently overwritten.
        // For tonight, treat correction/hedging language as a hard block. The
        // existing identity stands; operator can confirm-and-update via the
        // BB Personal section if narrator's correction is real.
        const _narratorCorrectingSelf = /\b(?:actually|wait|let\s+me\s+correct|i\s+meant|correction|i\s+was\s+wrong|hmm,?\s+(?:actually|wait))\b/i.test(event.text);
        const _fieldCount = (_identity && _identity.name ? 1 : 0)
          + (_identity && _identity.dob ? 1 : 0)
          + (_identity && _identity.pob ? 1 : 0);
        // Fire rescue only when:
        //   (a) name pattern matched (proves it's a self-intro), AND >=1 other field, OR
        //   (b) first-person birth claim AND >=1 of dob/pob (no name yet, but speaker
        //       is clearly talking about themselves)
        // AND narrator is not signaling self-correction.
        const _hasIdentitySignal =
          !_narratorCorrectingSelf &&
          ((_hasName && _fieldCount >= 2) ||
           (_firstPersonBirth && (_identity.dob || _identity.pob)));
        if (_hasIdentitySignal) {
          // Update state.profile.basics first — runtime71 reads from here.
          if (!state.profile) state.profile = { basics: {}, kinship: [], pets: [] };
          if (!state.profile.basics) state.profile.basics = {};
          let _wrote = [];
          if (_identity.name) {
            state.profile.basics.fullname  = _identity.name;
            state.profile.basics.preferred = _identity.name;
            state.session.speakerName      = _identity.name;
            _wrote.push("name=" + _identity.name);
          }
          if (_identity.dob) {
            state.profile.basics.dob = _identity.dob;
            _wrote.push("dob=" + _identity.dob);
          }
          if (_identity.pob) {
            state.profile.basics.pob = _identity.pob;
            _wrote.push("pob=" + _identity.pob);
          }
          // Project to the canonical projection layer so subsequent reads see it.
          if (typeof LorevoxProjectionSync !== "undefined" && state.interviewProjection) {
            try {
              if (_identity.name) {
                LorevoxProjectionSync.projectValue("personal.fullName", _identity.name,
                  { source: "interview", turnId: "qf-identity-rescue", confidence: 0.9 });
                LorevoxProjectionSync.projectValue("personal.preferredName", _identity.name,
                  { source: "interview", turnId: "qf-identity-rescue", confidence: 0.9 });
              }
              if (_identity.dob) {
                LorevoxProjectionSync.projectValue("personal.dateOfBirth", _identity.dob,
                  { source: "interview", turnId: "qf-identity-rescue", confidence: 0.9 });
              }
              if (_identity.pob) {
                LorevoxProjectionSync.projectValue("personal.placeOfBirth", _identity.pob,
                  { source: "interview", turnId: "qf-identity-rescue", confidence: 0.9 });
              }
            } catch (e) { console.warn("[session-loop] BUG-227 projection write threw:", e); }
          }
          // Mirror to BB questionnaire.personal — overwrite policy in
          // BUG-227 differs from lvBbSyncIdentity's idempotent behavior:
          // here we need to OVERWRITE polluted fields, not fill empties.
          await _overwriteBbPersonal(state.person_id, _identity);
          // Update the active narrator card for visible feedback.
          if (typeof lv80UpdateActiveNarratorCard === "function") {
            try { lv80UpdateActiveNarratorCard(); } catch (_) {}
          }
          console.log("[session-loop] BUG-227: identity rescue — wrote " + _wrote.join(", "));

          // If the input was clearly an INTRO (name + at least one of
          // dob/pob present), the user wasn't answering the asked field
          // — they were re-introducing themselves. Skip the asked-field
          // save AND skip the next-field prompt this turn so Lori
          // acknowledges naturally instead of robotically asking the
          // next field.
          const _isFullIntro = !!(_identity.name && (_identity.dob || _identity.pob));
          if (_isFullIntro) {
            loop.tellingStoryOnce = true;
            loop.lastAction = "bug227_identity_rescue_intro";
            // Tell Lori to acknowledge the corrected identity warmly
            // and ask one open question. Do not re-ask any of the
            // identity fields.
            const greetName = _identity.name || state.profile.basics.preferred || "";
            const dobStr = _identity.dob ? `, born ${_identity.dob}` : "";
            const pobStr = _identity.pob ? ` in ${_identity.pob}` : "";
            const directive = "[SYSTEM_QF: BUG-227 IDENTITY RESCUE — the narrator just " +
              "re-introduced themselves with name" +
              (_identity.dob ? " + date of birth" : "") +
              (_identity.pob ? " + birthplace" : "") + ". " +
              "Their identity is: " + greetName + dobStr + pobStr + ". " +
              "Their previous BB record had stale or incorrect data; that is now overwritten. " +
              "Acknowledge them warmly using their name. Do NOT ask for any of: name, " +
              "date of birth, birthplace — those are captured. Ask ONE open question " +
              "that invites a memory or sense of place. Two sentences max.]";
            try {
              if (typeof sendSystemPrompt === "function") sendSystemPrompt(directive);
            } catch (e) { console.warn("[session-loop] BUG-227 directive send threw:", e); }
            return;
          }
          // Partial identity (just one field): fall through to the
          // normal asked-field save logic. The extracted field is now
          // captured in BB; the asked-field save will overwrite if
          // they're the same field, or co-exist if different.
        }
      } catch (e) {
        console.warn("[session-loop] BUG-227 identity rescue threw (non-fatal):", e);
      }
    }

    // WO-01B: Save the answer to the field we asked last turn (if any).
    // Only fires on narrator_turn (not identity_complete which is the
    // first call where currentField is null).
    if (event && event.trigger === "narrator_turn" &&
        loop.currentSection && loop.currentField &&
        typeof event.text === "string" && event.text.trim()) {
      // BUG-212: digression check BEFORE save.
      if (_isDigressionAnswer(event.text, loop.currentField)) {
        const askedKey = `${loop.currentSection}.${loop.currentField}`;
        loop.lastAction = `digression_skip_save_${askedKey}`;
        loop.tellingStoryOnce = true;   // suppress next turn's QF too
        console.log(`[session-loop] BUG-212: digression detected on ${askedKey} ` +
          `(${event.text.length}c / ${event.text.trim().split(/\s+/).length}w). ` +
          `Skipping save + skipping next-field prompt. Letting Lori respond naturally.`);
        // Don't ask "what was your story you wanted to tell?" — just
        // let warm_storytelling drive THIS turn (Lori will respond to
        // whatever the narrator just said in her natural reflective voice).
        return;
      }
      await _saveBBAnswer(state.person_id, loop.currentSection,
                          loop.currentField, event.text.trim());
      // Cache is invalidated inside _saveBBAnswer so the next
      // _getQuestionnaireBlob call re-fetches the freshly-PUT blob.
    }

    // Fetch (or reuse cached) BB questionnaire blob for this narrator.
    const blob = await _getQuestionnaireBlob(state.person_id);

    // Find the next personal-section field that's empty AND not asked yet.
    const next = _findNextEmptyPersonalField(blob, loop.askedKeys);

    if (!next) {
      // WO-01C: No more non-repeatable personal fields → name what's
      // coming so the narrator doesn't dead-end on a vague bubble.
      // Repeatable sections (parents/siblings/grandparents/residences)
      // are still deferred to Phase 2 of the loop, but we explicitly
      // offer the next obvious branches so Lori has a real handoff.
      console.log("[session-loop] questionnaire_first: minimal personal fields exhausted; repeatable sections deferred (Phase 2)");
      loop.lastAction = "deferred:repeatable_sections (Phase 2)";

      // Pull whatever we have for warmth (preferredName / fullName).
      const blobNow = await _getQuestionnaireBlob(state.person_id);
      const personal = (blobNow && blobNow.personal) || {};
      const greetName = (personal.preferredName || personal.fullName || "").trim();

      // Use a system prompt so Lori delivers the handoff in her voice
      // (warm, brief), rather than dropping a hard-coded UI bubble.
      const handoffPrompt = "[SYSTEM_QF: questionnaire_first lane — " +
        "the personal-basics walk is COMPLETE. Lori must now offer " +
        "the narrator a clear next branch in two or three sentences. " +
        "Acknowledge what we just covered briefly. Then say something " +
        "like: 'we can talk about the people who shaped you next — your " +
        "parents, your siblings, the people you grew up around — or you " +
        "can pick a memory you'd like to share, your call.' " +
        "Do NOT lecture. Do NOT list. Do NOT promise to build a database. " +
        "Just warmly hand off the conversation. " +
        (greetName ? `You may use the name "${greetName}" once if it lands naturally. ` : "") +
        "Two to three sentences total.]";

      if (typeof sendSystemPrompt === "function") {
        try { sendSystemPrompt(handoffPrompt); } catch (e) {
          console.warn("[session-loop] handoff sendSystemPrompt threw:", e);
          _appendLoriBubble(
            "Your basics are saved. We can talk about the people who " +
            "shaped you — your parents, your siblings, the people you " +
            "grew up around — or you can pick a memory you'd like to " +
            "share, your call."
          );
        }
      } else {
        _appendLoriBubble(
          "Your basics are saved. We can talk about the people who " +
          "shaped you — your parents, your siblings, the people you " +
          "grew up around — or you can pick a memory you'd like to " +
          "share, your call."
        );
      }

      // PATCH 6 (WO-SESSION-INTENT-STABILITY-01): track handoff via
      // loop.activeIntent instead of mutating state.session.sessionStyle.
      // Operator-selected sessionStyle (localStorage) stays authoritative;
      // the early-return at top of _routeQuestionnaireFirst uses
      // activeIntent === "people_who_shaped_you" to suppress repeated
      // handoff prompts on subsequent turns.  Live drift evidence:
      // 2026-04-25T19:18 operator log AMBER on
      // `localStorage=questionnaire_first vs state=warm_storytelling`.
      loop.activeIntent = "people_who_shaped_you";
      loop.lastAction   = "handoff:people_who_shaped_you";
      console.log("[session-loop] handoff fired — activeIntent=people_who_shaped_you (sessionStyle UNCHANGED)");
      return;
    }

    // Ask the next field.
    const askedKey = `${next.sectionId}.${next.fieldId}`;
    loop.currentSection = next.sectionId;
    loop.currentField   = next.fieldId;
    loop.askedKeys.push(askedKey);
    if (loop.askedKeys.length > ASKED_CAP) {
      loop.askedKeys = loop.askedKeys.slice(-ASKED_CAP);
    }
    loop.lastAction = `ask_${askedKey}`;
    console.log("[session-loop] asking BB field:", askedKey);

    // System prompt directive — Lori asks the question warmly + briefly.
    const prompt = _buildFieldPrompt(next);
    if (typeof sendSystemPrompt === "function") {
      try { sendSystemPrompt(prompt); } catch (e) {
        console.warn("[session-loop] sendSystemPrompt threw:", e);
      }
    } else {
      // Fallback — render the prompt directly as a Lori bubble.
      _appendLoriBubble(prompt);
    }
  }

  /* ── Style: clear_direct ───────────────────────────────────────
     Same MINIMAL_SECTIONS walk as questionnaire_first, but the tier-2
     directive (set in runtime71 by buildRuntime71's session_style_directive
     field) tells Lori to keep prompts short.  In Phase 1 we route the
     walk identically; the directive lands via the runtime payload path. */
  async function _routeClearDirect(event) {
    return _routeQuestionnaireFirst(event);
  }

  // _routeMemoryExercise REMOVED 2026-04-25 — picker dropped after live
  // test showed it was a no-op. Legacy redirects in session-style-router
  // coerce any saved memory_exercise to warm_storytelling on load.

  /* ── Style: companion ──────────────────────────────────────────
     Tier-2 directive only.  No question-asking; Lori reflects + listens. */
  function _routeCompanion(event) {
    state.session.loop.lastAction = "directive_only:companion";
    console.log("[session-loop] companion: directive-only, no walk");
  }

  /* ── Style: warm_storytelling ──────────────────────────────────
     Existing default Lori behavior.  No-op here — existing prompt
     composer + phase-aware question composer drive the conversation. */
  function _routeWarmStorytelling(event) {
    state.session.loop.lastAction = "no_op:warm_storytelling";
  }

  /* ── BUG-218: Capabilities honesty rule (always included) ──
     History:
       - 2026-04-25 morning: BUG-218 filed when Lori claimed "Yes I am
         saving the audio" while audio capture wasn't built. Initial fix
         hardcoded "text-only" to keep Lori from over-claiming.
       - 2026-04-25 afternoon: WO-AUDIO-NARRATOR-ONLY-01 shipped — audio
         IS now captured per-turn when state.session.recordVoice is true.
         Verified via export zip with 7 .webm files (Test B passed).
         Hardcoded "text-only" rule is now the OPPOSITE of reality.
     Updated rule: dynamic based on state.session.recordVoice + the
     audio recorder's actual readiness.  Reflects truth at all times.
     Video is still NOT captured.  Only narrator's voice, never Lori's. */
  function _capabilitiesHonesty() {
    const recordVoice = !!(typeof state !== "undefined" &&
                            state.session && state.session.recordVoice !== false);
    const recorderAvail = !!(typeof window !== "undefined" &&
                             window.lvNarratorAudioRecorder &&
                             typeof window.lvNarratorAudioRecorder.isAvailable === "function" &&
                             window.lvNarratorAudioRecorder.isAvailable());
    const audioActive = recordVoice && recorderAvail;
    const audioPart = audioActive
      ? "AND your voice as audio recordings per turn (only your voice, never Lori's)"
      : "ONLY (audio recording is currently OFF — either Save my voice is unchecked or the browser doesn't support recording)";
    return (
      "CAPABILITIES (must be honest, never overstate): " +
      "Right now this session captures the typed text and speech-to-text " +
      "transcript of our conversation, " + audioPart + ". " +
      "Video recording, image saving, photo analysis, and any other " +
      "capability not explicitly listed are NOT active. " +
      "If the narrator asks whether their voice or audio is being recorded, " +
      "answer based on the toggle state: " +
      (audioActive
        ? "\"Yes, your voice is being saved this session — your voice only, never mine.\""
        : "\"No, audio is currently not being captured. Only the text of our conversation is saved.\"") +
      " If asked about video, always say no. " +
      "NEVER claim capabilities that aren't listed above. " +
      "If unsure what's saved, default to \"text only\" rather than promising more."
    );
  }

  /* ── Tier-2 directive helper ───────────────────────────────────
     Called by buildRuntime71 (app.js) to set runtime71.session_style_directive.
     The backend prompt_composer reads this field and appends to the
     directive block.  Always includes the BUG-218 capabilities-honesty
     rule; style-specific suffix appended for tier-2 styles. */
  function _emitStyleDirective(style) {
    let styleSuffix = "";
    switch (style) {
      case "clear_direct":
        styleSuffix = "Ask one short question at a time. Avoid open-ended " +
                      "exploration. Acknowledge briefly, then move on.";
        break;
      // memory_exercise REMOVED 2026-04-25 — picker option dropped after
      // live test (Lori didn't follow the directive strongly enough; the
      // suffix got diluted in the long capabilities-honesty preamble).
      // The dementia-safe behaviors now live exclusively in WO-10C
      // cognitive support mode, which has its own posture-side activation
      // path. Tier-2 prompt suffix is gone; if anyone re-introduces
      // memory_exercise as a session style later, route it through
      // cognitive_support_mode flag in runtime71 instead.
      case "companion":
        styleSuffix = "Don't probe for facts. Listen. Reflect feelings. Speak less " +
                      "than the narrator does.";
        break;
      case "questionnaire_first":
      case "warm_storytelling":
      default:
        styleSuffix = "";
        break;
    }
    // BUG-218: capabilities-honesty rule is always included; style suffix
    // (if any) follows.  No-op styles still receive the honesty preamble.
    // Honesty rule is computed per-call so it reflects current recordVoice
    // + recorder availability (post-WO-AUDIO-NARRATOR-ONLY-01).
    const capabilities = _capabilitiesHonesty();
    return styleSuffix
      ? capabilities + " " + styleSuffix
      : capabilities;
  }
  // Exposed so buildRuntime71 in app.js can read it.
  window._lvEmitStyleDirective = _emitStyleDirective;

  /* ── Bio Builder helpers ───────────────────────────────────────
     Read the questionnaire blob, find next empty personal field,
     compose the warm Lori prompt, and (later — Phase 2) PUT answers. */

  async function _getQuestionnaireBlob(personId) {
    if (!personId) return {};
    const now = Date.now();
    if (_bbCache.pid === personId && _bbCache.blob &&
        (now - _bbCache.ts) < BB_CACHE_TTL_MS) {
      return _bbCache.blob;
    }
    try {
      const url = (typeof API !== "undefined" && API.BB_QQ_GET)
        ? API.BB_QQ_GET(personId)
        : `/api/bio-builder/questionnaire?person_id=${encodeURIComponent(personId)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        console.warn("[session-loop] BB questionnaire fetch failed:", res.status);
        return {};
      }
      const data = await res.json();
      // BUG-208: reject backend payload if echoed person_id doesn't match
      // the one we requested.  Defends against mid-flight narrator swap and
      // any backend caching surprise.  Do NOT cache or return the blob.
      if (data && data.person_id && data.person_id !== personId) {
        console.warn("[bb-drift] BB GET response REJECTED: requested=" +
          personId.slice(0, 8) + " response.person_id=" +
          (data.person_id || "").slice(0, 8) + " — refusing to merge");
        return {};
      }
      // Backend returns the questionnaire under various keys; defensively
      // unwrap.  The PUT shape is { questionnaire: {...} } so the GET
      // typically mirrors that.
      const blob = data && (data.questionnaire || data.payload || data) || {};
      _bbCache = { pid: personId, blob, ts: now };
      return blob;
    } catch (e) {
      console.warn("[session-loop] BB questionnaire fetch threw:", e);
      return {};
    }
  }

  /* Invalidate the BB cache on narrator switch — exposed so
     session-style-router can reset on lvSessionStyleEnter entry. */
  function _resetBBCache() {
    _bbCache = { pid: null, blob: null, ts: 0 };
  }
  window._lvSessionLoopResetBBCache = _resetBBCache;

  /* ── BUG-227: BB personal-section overwrite helper ─────────────
     Used by the QF identity rescue path. Unlike _saveBBAnswer which
     saves a single field, this helper writes name + DOB + POB
     atomically and OVERWRITES whatever was there (vs lvBbSyncIdentity
     which only fills empty fields). Polluted blobs from prior test
     sessions need explicit overwrite, not idempotent fill.

     Persists via the canonical PUT /api/bio-builder/questionnaire path
     after merging into the fresh backend-fetched blob.
     Includes the same BUG-208 narrator-scope guards as _saveBBAnswer.
  ─────────────────────────────────────────────────────────────── */
  async function _overwriteBbPersonal(personId, identity) {
    if (!personId || !identity) return;
    const stPid = (typeof state !== "undefined") ? state.person_id : null;
    const bb    = (typeof state !== "undefined") ? state.bioBuilder : null;
    const bbPid = bb && bb.personId;
    if (stPid !== personId || (bbPid && bbPid !== personId)) {
      console.warn("[bb-drift] _overwriteBbPersonal SKIPPED: " +
        "personId=" + (personId || "").slice(0, 8) +
        " state.person_id=" + ((stPid || "").slice(0, 8) || "null") +
        " bb.personId=" + ((bbPid || "").slice(0, 8) || "null") +
        " — refusing identity-rescue overwrite under wrong narrator");
      return;
    }

    // Fetch fresh blob (same path _saveBBAnswer uses) to avoid stomping
    // unrelated sections that may have been edited elsewhere.
    let blob = null;
    try {
      blob = await _getQuestionnaireBlob(personId);
    } catch (e) {
      console.warn("[session-loop] BUG-227 _getQuestionnaireBlob threw:", e);
    }
    if (!blob || typeof blob !== "object") blob = {};
    if (!blob.personal || typeof blob.personal !== "object") blob.personal = {};

    // Overwrite the polluted fields. We OVERWRITE rather than fill-empty
    // because the polluted data is wrong; the new identity is correct.
    if (identity.name) {
      blob.personal.fullName      = identity.name;
      blob.personal.preferredName = identity.name;
    }
    if (identity.dob) {
      blob.personal.dateOfBirth = identity.dob;
    }
    if (identity.pob) {
      blob.personal.placeOfBirth = identity.pob;
    }

    // Mirror to in-memory bb.questionnaire so the BB UI re-renders cleanly.
    try {
      if (state.bioBuilder && state.bioBuilder.personId === personId) {
        if (!state.bioBuilder.questionnaire) state.bioBuilder.questionnaire = {};
        state.bioBuilder.questionnaire.personal = blob.personal;
      }
    } catch (_) {}

    // PUT to backend.
    const putUrl = (typeof API !== "undefined" && API.BB_QQ_PUT)
      ? API.BB_QQ_PUT
      : "/api/bio-builder/questionnaire";
    try {
      const r = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: personId,
          questionnaire: blob,
          source: "bug227_identity_rescue",
        }),
      });
      if (!r.ok) {
        console.warn("[session-loop] BUG-227 backend PUT failed:", r.status);
      } else {
        console.log("[session-loop] BUG-227: BB personal section overwritten for " + personId.slice(0, 8));
        // Invalidate the local blob cache so next read sees the fresh write.
        _resetBBCache();
      }
    } catch (e) {
      console.warn("[session-loop] BUG-227 backend PUT threw:", e);
    }
  }

  /* ── WO-01B: BB save helper ────────────────────────────────────
     PUT a single answer into the existing /api/bio-builder/questionnaire
     endpoint.  The endpoint expects the WHOLE questionnaire blob, so we
     fetch fresh, merge, and PUT.  Best-effort: failures are logged but
     don't block the walk.  Tracked in state.session.loop.savedKeys for
     harness observability and to prevent double-saves on idempotent
     re-dispatch.  Lightly normalizes a few specific fields (dateOfBirth,
     timeOfBirth) using the helpers exposed by bio-builder-questionnaire.js
     when present; otherwise saves raw. */
  async function _saveBBAnswer(personId, sectionId, fieldId, answer) {
    if (!personId || !sectionId || !fieldId || !answer) return;
    if (!state.session.loop) return;
    if (!Array.isArray(state.session.loop.savedKeys)) {
      state.session.loop.savedKeys = [];
    }
    const savedKey = `${sectionId}.${fieldId}`;

    // BUG-208: hard pid scope guard.  Three things must agree before we
    // touch anything: the pid we were called with, state.person_id, and
    // state.bioBuilder.personId.  If any disagree, halt the loop, do NOT
    // save the answer, and log [bb-drift] so the harness can surface it.
    const stPid  = (typeof state !== "undefined") ? state.person_id : null;
    const bb     = (typeof state !== "undefined") ? state.bioBuilder : null;
    const bbPid  = bb && bb.personId;
    if (stPid !== personId || (bbPid && bbPid !== personId)) {
      console.warn("[bb-drift] _saveBBAnswer SKIPPED: " +
        "personId=" + (personId || "").slice(0, 8) +
        " state.person_id=" + ((stPid || "").slice(0, 8) || "null") +
        " bb.personId=" + ((bbPid || "").slice(0, 8) || "null") +
        " — refusing to save " + savedKey + " under wrong narrator");
      // Stop the loop to prevent further mis-saves until next dispatch.
      if (state.session.loop) {
        state.session.loop.lastAction = "halted_pid_drift:" + savedKey;
      }
      return;
    }

    // Light per-field normalization — lean on helpers if loaded.
    let normalized = answer;
    try {
      if (fieldId === "dateOfBirth" && typeof window.normalizeDobInput === "function") {
        normalized = window.normalizeDobInput(answer) || answer;
      } else if (fieldId === "timeOfBirth" && typeof window.normalizeTimeInput === "function") {
        normalized = window.normalizeTimeInput(answer) || answer;
      } else if (fieldId === "placeOfBirth" && typeof window.normalizePlaceInput === "function") {
        normalized = window.normalizePlaceInput(answer) || answer;
      }
    } catch (_) { /* keep raw on any normalization throw */ }

    // Fetch the freshest blob (bypass cache so we don't merge stale state).
    _resetBBCache();
    const blob = await _getQuestionnaireBlob(personId);
    if (!blob || typeof blob !== "object") {
      console.warn("[session-loop] _saveBBAnswer: BB blob unavailable; skipping save for", savedKey);
      return;
    }
    // BUG-208: re-check pid after the network await — state.person_id and
    // bb.personId may have moved during the in-flight fetch.  This is the
    // "save Christopher's answer to Corky" race that started the bug.
    const stPid2 = (typeof state !== "undefined") ? state.person_id : null;
    const bb2    = (typeof state !== "undefined") ? state.bioBuilder : null;
    const bbPid2 = bb2 && bb2.personId;
    if (stPid2 !== personId || (bbPid2 && bbPid2 !== personId)) {
      console.warn("[bb-drift] _saveBBAnswer ABORTED post-fetch: narrator switched during BB GET. " +
        "Refusing to PUT " + savedKey + " (was=" + (personId || "").slice(0, 8) +
        " now state=" + ((stPid2 || "").slice(0, 8) || "null") +
        " bb=" + ((bbPid2 || "").slice(0, 8) || "null") + ")");
      if (state.session.loop) {
        state.session.loop.lastAction = "halted_pid_drift_postfetch:" + savedKey;
      }
      return;
    }
    if (!blob[sectionId] || typeof blob[sectionId] !== "object") {
      blob[sectionId] = {};
    }
    blob[sectionId][fieldId] = normalized;

    const url = (typeof API !== "undefined" && API.BB_QQ_PUT)
      ? API.BB_QQ_PUT
      : "/api/bio-builder/questionnaire";

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person_id: personId,
          questionnaire: blob,
          source: "session_loop",
          version: 1,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        if (!state.session.loop.savedKeys.includes(savedKey)) {
          state.session.loop.savedKeys.push(savedKey);
        }
        state.session.loop.lastAction = `saved_${savedKey}`;
        console.log(`[session-loop] saved BB answer: ${savedKey} = ${JSON.stringify(normalized).slice(0, 80)}`);
        // Invalidate cache so the next read sees the freshly-PUT blob.
        _resetBBCache();
      } else {
        console.warn(`[session-loop] save_failed ${savedKey}: status=${res.status}`);
      }
    } catch (e) {
      console.warn(`[session-loop] save_failed ${savedKey}: ${e && e.message || e}`);
    }
  }

  function _findNextEmptyPersonalField(blob, askedKeys) {
    // Phase 1 walks ONLY the personal section's non-repeatable fields.
    // Repeatable sections (parents/siblings) deferred to Phase 2.
    const SECTIONS = (typeof window.MINIMAL_SECTIONS !== "undefined")
      ? window.MINIMAL_SECTIONS
      : null;
    // bio-builder-questionnaire.js doesn't expose MINIMAL_SECTIONS on
    // window; it's an inner var.  Hardcode the personal-section field
    // order here (mirrors bio-builder-questionnaire.js:425-430).
    const personalFields = [
      { id: "fullName",      label: "full name" },
      { id: "preferredName", label: "preferred name" },
      { id: "birthOrder",    label: "birth order" },
      { id: "dateOfBirth",   label: "date of birth" },
      { id: "timeOfBirth",   label: "time of birth" },
      { id: "placeOfBirth",  label: "place of birth" },
    ];

    const personalBlob = (blob && blob.personal) || {};
    const askedSet = new Set(askedKeys || []);

    for (const f of personalFields) {
      const key = `personal.${f.id}`;
      if (askedSet.has(key)) continue;
      const v = personalBlob[f.id];
      if (v == null || (typeof v === "string" && v.trim() === "")) {
        return { sectionId: "personal", fieldId: f.id, label: f.label };
      }
    }
    return null;
  }

  function _buildFieldPrompt(next) {
    // Compose a warm Lori system prompt that asks ONE structured question
    // about the next field.  Keep it brief and conversational — the
    // narrator just finished identity intake and needs gentle continuity.
    const map = {
      preferredName:
        "Ask warmly: 'What would you like me to call you?  Some people prefer a nickname or a shorter version of their name.'  Keep it to one or two sentences.  No lecture.",
      birthOrder:
        "Ask conversationally: 'Were you the oldest, the youngest, somewhere in the middle?  Or were you an only child?'  Keep it brief and warm.  No lecture.",
      timeOfBirth:
        "Ask gently: 'Do you happen to know what time of day you were born — morning, afternoon, night?  It's totally fine if not.'  Keep it brief.  No lecture.",
      dateOfBirth:
        "Ask warmly: 'What's your date of birth?'  One short sentence.  No lecture.",
      placeOfBirth:
        "Ask warmly: 'Where were you born?  Town and state are perfect, country if you'd like.'  One short sentence.  No lecture.",
      fullName:
        "Ask warmly: 'What's your full name?'  One short sentence.  No lecture.",
    };
    const fieldPrompt = map[next.fieldId] ||
      `Ask the narrator one short, warm question about their ${next.label}.  Keep it conversational.  No lecture.`;
    return `[SYSTEM_QF: questionnaire_first lane — next field is ${next.sectionId}.${next.fieldId}.  ${fieldPrompt}]`;
  }

  function _appendLoriBubble(text) {
    if (typeof appendBubble === "function") {
      try { appendBubble("ai", text); } catch (_) {}
    } else if (typeof appendAssistantBubble === "function") {
      try { appendAssistantBubble(text); } catch (_) {}
    }
  }

  /* ── Diagnostic accessor for the harness ───────────────────────
     ui-health-check.js reads this to verify the loop is wired
     without invoking it. */
  window.lvSessionLoop = {
    onTurn: lvSessionLoopOnTurn,
    emitDirective: _emitStyleDirective,
    findNextField: _findNextEmptyPersonalField,
    resetBBCache: _resetBBCache,
    loaded: true,
  };

  console.log("[Lorevox] session-loop loaded.");
})();
