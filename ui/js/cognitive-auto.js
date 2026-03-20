/* Lori 7.1 / 7.2 / 7.4C Auto Cognitive Mode Detection
   Watches runtime hints and recent user text to choose:
     open | recognition | light | grounding | alongside

   v7.2 additions:
   - alongside mode: sustained confusion escalation via state.session.confusionTurnCount
   - tightened uncertainty regex (removed healthy hedging: 'i think', 'maybe')
   - shortReply now requires >= 2 words AND >= 12 chars (prevents "Yes" / "No" from firing)

   v7.4C additions:
   - visual signal fusion via state.session.visualSignals
   - visual signals may ACCELERATE a transition but do not CAUSE one alone
   - text retains veto authority — clear verbal input overrides a mild visual signal
   - visual fusion only activates when affectBaseline.established = true
   - distress/overwhelm require sustained high-confidence visual signal (>= 2 consecutive)
*/
if (typeof window.LORI71 === "undefined") window.LORI71 = {};

window.LORI71.CognitiveAuto = {

  /* Memory-difficulty language — disorientation signals only.
     Deliberately excludes 'i think' and 'maybe' (healthy epistemic hedging). */
  uncertaintyRegex: /\b(i don't know|i do not know|not sure|i'?m not sure|can't remember|cannot remember|hard to remember|not really sure)\b/i,

  /* Turns of sustained confusion before escalating to alongside.
     3 turns ≈ ~3–4 minutes of an interview session. */
  ALONGSIDE_THRESHOLD: 3,

  inferSignals(text){
    const state   = window.state || {};
    const runtime = state.runtime  || {};
    const session = state.session  || {};

    const msg      = String(text || "").trim();
    const words    = msg ? msg.split(/\s+/).length : 0;
    const uncertain = this.uncertaintyRegex.test(msg);

    /* v7.2 fix: require >= 2 words AND >= 12 chars.
       Prevents single-word clear answers ("Yes", "No", "Sure") from triggering. */
    const shortReply = words >= 2 && words <= 4 && msg.length >= 12;

    // Text-derived signals (primary authority)
    const confusion = runtime.affectState === "confusion_hint";
    const distress  = runtime.affectState === "distress_hint" || runtime.affectState === "dissociation_hint";
    const fatigue   = Number(runtime.fatigueScore || 0) >= 60 || runtime.affectState === "fatigue_hint";

    /* v7.2 — read sustained confusion counter from session state */
    const confusionTurnCount = Number(session.confusionTurnCount || 0);

    /* v7.4C — visual signal fusion (conservative)
       Policy: visual can ACCELERATE a transition but not CAUSE one alone.
       Text retains veto: explicit positive verbal statement overrides mild visual inference.
       Only activates when baseline is established (prevents false positives on aging face). */
    const vs         = session.visualSignals || {};
    const baseline   = session.affectBaseline || {};
    const signalFresh = !!(vs.timestamp && (Date.now() - vs.timestamp < 8000));
    const baselineOk  = !!baseline.established;

    let visualDistress  = false;
    let visualFatigue   = false;
    let visualConfusion = false;

    if (baselineOk && signalFresh) {
      if (vs.affectState === "distressed" && Number(vs.confidence || 0) > 0.75) {
        visualDistress = true;
      }
      if (vs.affectState === "overwhelmed" && Number(vs.confidence || 0) > 0.80) {
        visualDistress = true;
        visualFatigue  = true;
      }
      if (["reflective", "moved"].includes(vs.affectState) && vs.gazeOnScreen === false) {
        visualConfusion = confusionTurnCount > 1;
      }
    }

    // text retains veto power on mild visual-only inference
    const explicitPositive = /\b(i'm fine|i am fine|let's keep going|keep going|i'm okay|i am okay)\b/i.test(msg);

    return {
      uncertain,
      shortReply,
      confusion: confusion || (!explicitPositive && visualConfusion),
      distress:  distress  || (!explicitPositive && visualDistress),
      fatigue:   fatigue   || (!explicitPositive && visualFatigue),
      words,
      confusionTurnCount,
      currentPass: session.currentPass || "pass1",
      currentEra:  session.currentEra  || null,
      baselineOk,
      signalFresh,
      visualAffectState: vs.affectState || null,
    };
  },

  chooseMode(signals){
    // Emotional distress always takes priority
    if (signals.distress) return "grounding";
    // Fatigue is orthogonal to confusion — serve it before escalation check
    if (signals.fatigue)  return "light";

    // v7.2 — sustained confusion escalates to alongside
    if (signals.confusionTurnCount >= this.ALONGSIDE_THRESHOLD) return "alongside";

    // Single-turn uncertainty → recognition (offer concrete anchors)
    if (signals.confusion || signals.uncertain || signals.shortReply) return "recognition";

    return "open";
  },

  applyMode(mode, reason){
    if (!window.state) return;
    if (!window.state.runtime) window.state.runtime = {};
    if (!window.state.session) window.state.session = {};

    window.state.runtime.cognitiveMode  = mode;
    window.state.session.currentMode    = mode;

    if (!window.state.runtime.cognitiveReasonLog) window.state.runtime.cognitiveReasonLog = [];
    window.state.runtime.cognitiveReasonLog.push({
      at: Date.now(),
      mode,
      reason,
    });
    window.state.runtime.cognitiveReasonLog = window.state.runtime.cognitiveReasonLog.slice(-10);

    if (window.LORI71 && typeof window.LORI71.updateDebugOverlay === "function") {
      window.LORI71.updateDebugOverlay();
    }
    if (window.LORI71 && typeof window.LORI71.updateBadges === "function") {
      window.LORI71.updateBadges();
    }
  },

  processUserTurn(text){
    const signals = this.inferSignals(text);
    const mode    = this.chooseMode(signals);

    /* v7.2 — maintain sustained confusion counter in session state.
       Increments on confused/uncertain turns; decrements on genuinely clear turns.
       Stored in state.session so it survives within the session (not a loose global). */
    if (window.state && window.state.session) {
      const isConfused = signals.confusion || signals.uncertain || signals.shortReply;
      if (isConfused) {
        window.state.session.confusionTurnCount =
          (window.state.session.confusionTurnCount || 0) + 1;
      } else if (!isConfused && !signals.distress && !signals.fatigue) {
        /* Decrement on any genuinely clear turn — regardless of current mode.
           This allows gradual recovery through alongside → recognition → open
           rather than locking the narrator in alongside indefinitely. */
        window.state.session.confusionTurnCount =
          Math.max(0, (window.state.session.confusionTurnCount || 0) - 1);
      }
      // distress (grounding) and fatigue (light) turns leave the confusion counter unchanged
    }

    let reason = "default_open";
    if (signals.distress)                                     reason = "affect_distress_or_dissociation";
    else if (signals.fatigue)                                 reason = "fatigue_high";
    else if (signals.confusionTurnCount >= this.ALONGSIDE_THRESHOLD) reason = "sustained_confusion_alongside";
    else if (signals.confusion)                               reason = "affect_confusion";
    else if (signals.uncertain)                               reason = "uncertainty_language";
    else if (signals.shortReply)                              reason = "short_reply";

    this.applyMode(mode, reason);
    return { mode, reason, signals };
  }
};

/* Optional hook:
   call window.LORI71.CognitiveAuto.processUserTurn(userText)
   immediately before sending a chat turn / start_turn payload.
   CognitiveAuto writes mode into state.runtime.cognitiveMode and state.session.currentMode,
   which are then picked up by buildRuntime71() → WebSocket → prompt_composer.py.
*/
