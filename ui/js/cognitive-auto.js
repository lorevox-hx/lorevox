/* Lori 7.1 Auto Cognitive Mode Detection
   Watches runtime hints and recent user text to choose open / recognition / light / grounding.
*/
if (typeof window.LORI71 === "undefined") window.LORI71 = {};

window.LORI71.CognitiveAuto = {
  uncertaintyRegex: /\b(i don't know|i do not know|not sure|i'?m not sure|maybe|can't remember|cannot remember|hard to remember|not really sure|i think)\b/i,

  inferSignals(text){
    const state = window.state || {};
    const runtime = state.runtime || {};
    const session = state.session || {};

    const msg = String(text || "").trim();
    const words = msg ? msg.split(/\s+/).length : 0;
    const uncertain = this.uncertaintyRegex.test(msg);
    const shortReply = words > 0 && words <= 4;
    const confusion = runtime.affectState === "confusion_hint";
    const distress = runtime.affectState === "distress_hint" || runtime.affectState === "dissociation_hint";
    const fatigue = Number(runtime.fatigueScore || 0) >= 60 || runtime.affectState === "fatigue_hint";

    return {
      uncertain,
      shortReply,
      confusion,
      distress,
      fatigue,
      words,
      currentPass: session.currentPass || "pass1",
      currentEra: session.currentEra || null,
    };
  },

  chooseMode(signals){
    if (signals.distress) return "grounding";
    if (signals.fatigue) return "light";
    if (signals.confusion || signals.uncertain || signals.shortReply) return "recognition";
    return "open";
  },

  applyMode(mode, reason){
    if (!window.state) return;
    if (!window.state.runtime) window.state.runtime = {};
    if (!window.state.session) window.state.session = {};

    window.state.runtime.cognitiveMode = mode;
    window.state.session.currentMode = mode;

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
    const mode = this.chooseMode(signals);

    let reason = "default_open";
    if (signals.distress) reason = "affect_distress_or_dissociation";
    else if (signals.fatigue) reason = "fatigue_high";
    else if (signals.confusion) reason = "affect_confusion";
    else if (signals.uncertain) reason = "uncertainty_language";
    else if (signals.shortReply) reason = "short_reply";

    this.applyMode(mode, reason);
    return { mode, reason, signals };
  }
};

/* Optional hook:
   call window.LORI71.CognitiveAuto.processUserTurn(userText)
   immediately before sending a chat turn / start_turn payload.
*/
