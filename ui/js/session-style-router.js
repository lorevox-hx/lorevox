/* ═══════════════════════════════════════════════════════════════
   session-style-router.js — WO-SESSION-STYLE-WIRING-01

   Operator picks a session style on the Operator tab; this module
   makes that choice actually drive Lori's behavior in the narrator
   room.  Phase 1 lands questionnaire_first as a real execution path;
   tier-2 styles (clear_direct / memory_exercise / companion) get
   prompt-composer directives in a follow-up slice.

   Hard product rule (locked 2026-04-24):
     If sessionStyle === "questionnaire_first":
       - BYPASS the v9 incomplete-narrator gate (Corky rule —
         questionnaire IS how an incomplete narrator becomes complete)
       - Drive identity intake via existing 3-step state machine
         (startIdentityOnboarding → handleIdentityPhaseAnswer)
       - After identity completes, walk Bio Builder questionnaire
         sections (Slice 2 — currently a friendly stub)

   Hard implementation rules:
     - No new backend endpoints
     - No new questionnaire schema (use bio-builder-questionnaire.js)
     - No trainer-only logic (trainer narrators have their own path)
     - No breakage of warm_storytelling default

   Load order: AFTER app.js + state.js (depends on state.session,
   startIdentityOnboarding, hasIdentityBasics74, getSessionStyle).
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const VALID_STYLES = [
    "questionnaire_first",
    "clear_direct",
    "warm_storytelling",
    // "memory_exercise" REMOVED 2026-04-25 — picker no-op, shelved.
    "companion",
  ];

  // Legacy coercion — narrators with saved sessionStyle="memory_exercise"
  // (from before the picker option was removed) get coerced to
  // warm_storytelling so they don't end up in dispatch limbo.
  const _LEGACY_REDIRECTS = { memory_exercise: "warm_storytelling" };

  /* ── Public dispatcher ─────────────────────────────────────────
     Called from lvNarratorRoomInit (WO-NARRATOR-ROOM-01) so every
     time the narrator room paints, the chosen style is re-applied.
     Idempotent — safe to call multiple times for the same narrator. */
  function lvSessionStyleEnter(style, personId) {
    // Apply legacy redirects first.
    if (typeof style === "string" && _LEGACY_REDIRECTS[style]) {
      console.warn("[session-style] legacy '" + style + "' coerced to '" +
        _LEGACY_REDIRECTS[style] + "' (memory_exercise picker removed 2026-04-25)");
      style = _LEGACY_REDIRECTS[style];
    }
    style = (typeof style === "string" && VALID_STYLES.includes(style))
      ? style
      : "warm_storytelling";

    if (!state || !state.session) return;
    state.session.sessionStyle = style;

    switch (style) {
      case "questionnaire_first":
        return _enterQuestionnaireFirst(personId);
      case "clear_direct":
      case "companion":
        // Tier-2 directives only — byte-stable with warm_storytelling
        // for routing purposes; Lori's prompt picks up the directive via
        // the runtime71 builder.
        console.log("[session-style] tier-2 style selected:", style);
        return;
      case "warm_storytelling":
      default:
        // No-op default.  Lori's standard interview behavior.
        return;
    }
  }
  window.lvSessionStyleEnter = lvSessionStyleEnter;

  /* ── Questionnaire-first lane ──────────────────────────────────
     Two segments:
       1. Identity intake (this Slice 1) — name → DOB → birthplace
          via existing startIdentityOnboarding state machine.
       2. Bio Builder section walk (Slice 2 — stubbed for now).

     We re-use the existing identity machine because it already drives
     the 3-step conversation in chat, parses fuzzy answers, and writes
     to state.profile.basics.  No new code path; we just kick it off
     when entering this lane on an incomplete narrator.
  ─────────────────────────────────────────────────────────────── */
  function _enterQuestionnaireFirst(personId) {
    const lane = "questionnaire_first";

    if (!state.session.questionnaireFirst) {
      state.session.questionnaireFirst = {
        active: true,
        segment: "identity",
        currentSection: null,
        currentField: null,
        askedKeys: [],
      };
    } else {
      state.session.questionnaireFirst.active = true;
    }

    // Decide which segment to enter.  If basics already complete,
    // skip identity and go straight to BB section walk.  hasIdentityBasics74
    // (app.js:2835) checks for name + dob + birthplace.
    const basicsComplete = (typeof hasIdentityBasics74 === "function")
      ? !!hasIdentityBasics74()
      : !!(state.profile && state.profile.basics &&
           state.profile.basics.dob &&
           (state.profile.basics.preferred || state.profile.basics.fullname));

    if (!basicsComplete) {
      state.session.questionnaireFirst.segment = "identity";
      console.log("[session-style] questionnaire_first → identity intake (Corky bypass active)");

      // Reset identity onboarding state and kick it off.  Existing machine
      // owns the full 3-step conversation; we just hand it the steering wheel.
      // Don't kick it off twice if it's already running mid-flow (e.g. operator
      // re-entered the narrator tab while answering "askDob").
      const phase = state.session && state.session.identityPhase;
      const inProgress = phase && phase !== "complete";
      if (!inProgress && typeof startIdentityOnboarding === "function") {
        try {
          startIdentityOnboarding();
        } catch (e) {
          console.warn("[session-style] startIdentityOnboarding threw:", e);
        }
      } else if (inProgress) {
        console.log("[session-style] identity onboarding already in progress (phase=" + phase + ") — leaving running");
      } else {
        console.warn("[session-style] startIdentityOnboarding not available — identity intake cannot start");
      }
    } else {
      // Identity already complete.  Go straight to section walk.
      state.session.questionnaireFirst.segment = "sections";
      console.log("[session-style] questionnaire_first → identity already complete, entering BB section walk");
      _enterBioBuilderSectionWalk(personId);
    }
  }

  /* ── Bio Builder section walk handoff ───────────────────────────
     WO-HORNELORE-SESSION-LOOP-01 ships the real loop; we just hand
     the steering wheel over to it.  The loop reads BB MINIMAL_SECTIONS,
     finds the next empty personal field, and asks Lori to ask it.
     If the loop module hasn't loaded yet for some reason, we fall back
     to a friendly bubble (defense-in-depth — should never fire in
     normal load order). */
  function _enterBioBuilderSectionWalk(personId) {
    // Mark segment so the harness can observe the lane state.
    if (state.session.questionnaireFirst) {
      state.session.questionnaireFirst.segment = "sections";
    }
    // Reset BB cache — narrator may have switched, blob could be stale.
    if (typeof window._lvSessionLoopResetBBCache === "function") {
      try { window._lvSessionLoopResetBBCache(); } catch (_) {}
    }
    // Real handoff.
    if (typeof window.lvSessionLoopOnTurn === "function") {
      try { window.lvSessionLoopOnTurn({ trigger: "identity_complete" }); }
      catch (e) { console.warn("[session-style] lvSessionLoopOnTurn threw:", e); return; }
      return;
    }
    // Fallback (should not happen if session-loop.js loads).
    if (typeof appendBubble === "function") {
      try {
        appendBubble("ai",
          "Your basics are saved. We can keep building your story from here.");
      } catch (_) {}
    }
  }

  /* ── Hook into lvNarratorRoomInit ──────────────────────────────
     WO-NARRATOR-ROOM-01 already exposes window.lvNarratorRoomInit.
     We wrap it so every entry to the narrator room re-applies the
     style.  Safe: lvNarratorRoomInit is idempotent. */
  function _installRoomInitHook() {
    if (typeof window.lvNarratorRoomInit !== "function") {
      // Room init function not yet defined — try again shortly.
      setTimeout(_installRoomInitHook, 200);
      return;
    }
    if (window.lvNarratorRoomInit._sessionStyleHooked) return;
    const original = window.lvNarratorRoomInit;
    window.lvNarratorRoomInit = function () {
      const out = original.apply(this, arguments);
      const style = (typeof getSessionStyle === "function")
        ? getSessionStyle() : (state && state.session && state.session.sessionStyle) || "warm_storytelling";
      const pid = state && state.person_id;
      try { lvSessionStyleEnter(style, pid); }
      catch (e) { console.warn("[session-style] lvSessionStyleEnter threw:", e); }
      return out;
    };
    window.lvNarratorRoomInit._sessionStyleHooked = true;
    console.log("[session-style] lvNarratorRoomInit hooked.");
  }

  // Run on load (or wait for app.js to define lvNarratorRoomInit).
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _installRoomInitHook);
  } else {
    _installRoomInitHook();
  }

  /* ── Diagnostic accessor for the harness ───────────────────────
     ui-health-check.js uses this to verify the dispatcher is wired
     without invoking it.  bypassWired is the static "is the v9 bypass
     branch present in lv80SwitchPerson" flag set in lorevox10.0.html
     at module load — separate from _lv80QuestionnaireFirstBypassFired
     which only flips after a real switch with style=questionnaire_first. */
  window.lvSessionStyleRouter = {
    enter: lvSessionStyleEnter,
    validStyles: VALID_STYLES.slice(),
    bypassWired: true,   // proves session-style-router is loaded; the actual
                         // bypass lives in lv80SwitchPerson and exposes its
                         // own _lv80QuestionnaireFirstBypassFired side-channel.
  };

  console.log("[Lorevox] session-style-router loaded.");
})();
