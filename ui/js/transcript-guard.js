/* ═══════════════════════════════════════════════════════════════
   transcript-guard.js — WO-STT-LIVE-02 (#99)

   STT-agnostic transcript safety layer for Lorevox.

   Purpose
   -------
   The live STT authority today is the browser Web Speech API
   (Chrome → Google). This module does NOT care which engine
   produced the text — it classifies the transcript for fragility,
   writes it into state.lastTranscript, and exposes helpers that
   interview.js uses when building the /api/extract-fields payload.

   Three contracts
   ---------------
   1. Fragile-fact classifier (frontend mirror of extract.py's
      _is_fragile_field, but works on NL text not fieldPath).
      `classifyFragileFacts(text) -> string[]` returns flags like
      "mentions_dob", "mentions_name", "mentions_parent", etc.
      Byte-stable: same input always yields the same output.

   2. State writers — populateFromRecognition / markTypedInput /
      markBackendWhisper update state.lastTranscript with source,
      confidence, normalized/raw text, turn id, timestamp, and
      derived fragile_fact_flags + confirmation_required booleans.

   3. Payload builder — `buildExtractionPayloadFields()` returns the
      six request fields (transcript_source, transcript_confidence,
      raw_transcript, normalized_transcript, fragile_fact_flags,
      confirmation_required) or `{}` when no transcript is staged
      (byte-stable with pre-WO-STT-LIVE-02 callers).

   Self-gating: if nothing ever populates state.lastTranscript, the
   payload builder returns an empty object, the POST body looks
   exactly like today, and the backend behaves byte-stable because
   every added pydantic field defaults to None.

   Load order: after state.js, before interview.js and app.js.
═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // Confidence below which a spoken turn is flagged for confirmation
  // regardless of whether fragile-fact keywords appear. Keep
  // conservative; Web Speech usually reports ≥0.8 on clean audio.
  var LOW_CONF_THRESHOLD = 0.6;

  // Transcript staleness cap. If nothing has been typed or spoken in
  // this many ms, fall through to "typed" regardless of what
  // lastTranscript claims. Prevents a stale spoken capture from
  // incorrectly tagging a later hand-typed send.
  var STALE_MS = 30 * 1000;

  // ── Fragile-fact NL patterns ──────────────────────────────────
  // Each entry is { flag, re } — flag is the string we add to
  // fragile_fact_flags, re is a RegExp that triggers it.
  //
  // Patterns are intentionally loose (recall-over-precision). False
  // positives route fragile writes to suggest_only — annoying but
  // safe. False negatives would silently let a misheard name/DOB
  // prefill; that's the failure mode this whole WO exists to prevent.
  var FRAGILE_PATTERNS = [
    // Birthdate cues — year + "born", bare 4-digit year in identity
    // sections is also a strong enough signal. Include month names.
    { flag: "mentions_dob", re: /\b(born|birthday|date of birth|d\.?o\.?b\.?)\b/i },
    { flag: "mentions_dob", re: /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?(,?\s*\d{2,4})?/i },
    { flag: "mentions_dob", re: /\b\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})\b/ },
    { flag: "mentions_dob", re: /\b(19|20)\d{2}\b/ },

    // Name cues — "my name is", "call me", "I go by", "last name"
    { flag: "mentions_name",        re: /\b(my name is|i am called|call me|i go by)\b/i },
    { flag: "mentions_name",        re: /\b(last name|first name|maiden name|middle name)\b/i },
    // Capitalised self-introduction — kept case-sensitive so generic
    // "i'm happy" / "I'm tired" don't false-positive.
    { flag: "mentions_name",        re: /\bI'?m\s+[A-Z][a-z]+/ },

    // Birthplace cues
    { flag: "mentions_birthplace",  re: /\b(born in|born at|hometown|home town|grew up in|from\s+[A-Z][a-z]+)\b/i },

    // Family identity cues — parent
    { flag: "mentions_parent",      re: /\b(my (mother|father|mom|dad|mum|papa|mama|parents?|stepmother|stepfather))\b/i },

    // Spouse
    { flag: "mentions_spouse",      re: /\b(my (wife|husband|spouse|partner|fiancé|fiancée|fiance|fiancee))\b/i },
    { flag: "mentions_spouse",      re: /\b(we got married|we were married|my (ex-)?(wife|husband))\b/i },

    // Sibling
    { flag: "mentions_sibling",     re: /\b(my (brother|sister|siblings?|sis|bro|half-brother|half-sister|stepbrother|stepsister))\b/i },

    // Child
    { flag: "mentions_child",       re: /\b(my (son|daughter|child|children|kids?|boy|girl|twins?))\b/i },
  ];

  /**
   * Classify a chunk of natural language for fragile-fact cues.
   * Returns an array of unique flag strings (order-preserved).
   * @param {string} text
   * @returns {string[]}
   */
  function classifyFragileFacts(text) {
    if (!text || typeof text !== "string") return [];
    var flags = [];
    var seen = Object.create(null);
    for (var i = 0; i < FRAGILE_PATTERNS.length; i++) {
      var p = FRAGILE_PATTERNS[i];
      if (p.re.test(text) && !seen[p.flag]) {
        seen[p.flag] = true;
        flags.push(p.flag);
      }
    }
    return flags;
  }

  /**
   * Decide whether a staged transcript should force a confirmation
   * round-trip on fragile fields. Pure function; no side effects.
   * @param {{source:string, confidence:?number, fragile_fact_flags:string[]}} t
   * @returns {boolean}
   */
  function shouldConfirm(t) {
    if (!t) return false;
    if (t.source === "typed") return false;          // hand-typed is user-authored
    if (typeof t.confidence === "number" && t.confidence < LOW_CONF_THRESHOLD) {
      return true;
    }
    if (Array.isArray(t.fragile_fact_flags) && t.fragile_fact_flags.length > 0) {
      return true;
    }
    return false;
  }

  // ── state.lastTranscript writers ──────────────────────────────

  function _now() { return Date.now(); }

  function _safeState() {
    // state.js declares `state` with `let`, so it may not be on window.
    // Access via the global `state` binding directly (same pattern as
    // focus-canvas.js and the rest of the ui/js codebase).
    try { return (typeof state !== "undefined") ? state : null; } catch (_) { return null; }
  }

  function _stageTranscript(fields) {
    var s = _safeState();
    if (!s || !s.lastTranscript) return;
    var lt = s.lastTranscript;
    lt.raw_text              = fields.raw_text || "";
    lt.normalized_text       = fields.normalized_text || "";
    lt.source                = fields.source || null;
    lt.is_final              = !!fields.is_final;
    lt.confidence            = (typeof fields.confidence === "number") ? fields.confidence : null;
    lt.fragile_fact_flags    = Array.isArray(fields.fragile_fact_flags) ? fields.fragile_fact_flags : [];
    lt.confirmation_required = !!fields.confirmation_required;
    lt.confirmation_prompt   = fields.confirmation_prompt || null;
    lt.turn_id               = fields.turn_id || null;
    lt.ts                    = _now();
  }

  /**
   * Populate state.lastTranscript from a Web Speech SpeechRecognitionEvent.
   * Called from inside recognition.onresult in app.js.
   * @param {SpeechRecognitionEvent} e
   * @param {{normalize:Function,turnId:?string}} opts
   */
  function populateFromRecognition(e, opts) {
    opts = opts || {};
    if (!e || !e.results) return;
    // Collect the final + interim tail so we expose what's in-flight.
    var rawFinal = "";
    var confFinal = null;
    var isFinal = false;
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var r = e.results[i];
      if (r && r.isFinal) {
        isFinal = true;
        if (r[0] && typeof r[0].transcript === "string") rawFinal += r[0].transcript;
        if (r[0] && typeof r[0].confidence === "number") {
          // Average by keeping the lowest — most conservative.
          confFinal = (confFinal === null) ? r[0].confidence : Math.min(confFinal, r[0].confidence);
        }
      }
    }
    if (!isFinal || !rawFinal) return;  // nothing to stage yet

    var normalized = (typeof opts.normalize === "function")
      ? opts.normalize(rawFinal) : rawFinal;
    var flags = classifyFragileFacts(normalized);
    var staged = {
      raw_text:            rawFinal,
      normalized_text:     normalized,
      source:              "web_speech",
      is_final:            true,
      confidence:          confFinal,
      fragile_fact_flags:  flags,
      turn_id:             opts.turnId || null,
    };
    staged.confirmation_required = shouldConfirm(staged);
    _stageTranscript(staged);
  }

  /**
   * Stage a transcript that came from backend Whisper (not live today,
   * but WO-STT-LIVE-03 will wire this). `result` is the parsed
   * backend response `{ok, text, confidence?}`.
   */
  function markBackendWhisper(result, opts) {
    opts = opts || {};
    if (!result || !result.text) return;
    var normalized = result.text;
    var flags = classifyFragileFacts(normalized);
    var staged = {
      raw_text:            result.text,
      normalized_text:     normalized,
      source:              "backend_whisper",
      is_final:            true,
      confidence:          (typeof result.confidence === "number") ? result.confidence : null,
      fragile_fact_flags:  flags,
      turn_id:             opts.turnId || null,
    };
    staged.confirmation_required = shouldConfirm(staged);
    _stageTranscript(staged);
  }

  /**
   * Stage a transcript that the user hand-typed. Typed input is
   * never confirmation_required — the user owns what they wrote.
   * Fragile-fact flags are still computed (purely for logs /
   * analytics); they do not trigger UX gating.
   */
  function markTypedInput(text, opts) {
    opts = opts || {};
    var flags = classifyFragileFacts(text || "");
    _stageTranscript({
      raw_text:             text || "",
      normalized_text:      text || "",
      source:               "typed",
      is_final:             true,
      confidence:           null,
      fragile_fact_flags:   flags,
      confirmation_required:false,
      turn_id:              opts.turnId || null,
    });
  }

  /**
   * Reconcile state.lastTranscript against the current send text.
   * Returns the transcript metadata that should accompany the
   * outgoing /api/extract-fields payload. Rules:
   *   1. No staged transcript → return null (payload builder emits {}).
   *   2. Staged transcript is stale (>STALE_MS old) → treat as typed.
   *   3. Staged normalized_text is not a substring of sendText → user
   *      hand-edited or typed fresh → treat as typed (no confidence,
   *      no confirmation gating). Flags re-classified from sendText.
   *   4. Match → return the staged object unchanged.
   *
   * @param {string} sendText — current #chatInput value at send time
   * @returns {object|null}
   */
  function reconcileForSend(sendText) {
    var s = _safeState();
    if (!s || !s.lastTranscript) return null;
    var lt = s.lastTranscript;
    if (!lt.source || !lt.ts) return null;
    var age = _now() - lt.ts;
    if (age > STALE_MS) {
      return {
        source:               "typed",
        confidence:           null,
        raw_text:             sendText || "",
        normalized_text:      sendText || "",
        fragile_fact_flags:   classifyFragileFacts(sendText || ""),
        confirmation_required:false,
      };
    }
    var needle = (lt.normalized_text || "").trim().toLowerCase();
    var hay    = (sendText || "").trim().toLowerCase();
    if (needle && hay.indexOf(needle) === -1) {
      return {
        source:               "typed",
        confidence:           null,
        raw_text:             sendText || "",
        normalized_text:      sendText || "",
        fragile_fact_flags:   classifyFragileFacts(sendText || ""),
        confirmation_required:false,
      };
    }
    // Full or prefix match — use staged transcript. Re-classify flags
    // from the full sendText so edits that append fragile content
    // (e.g. user spoke name, then typed DOB) still get the DOB flag.
    var flags = classifyFragileFacts(sendText || lt.normalized_text || "");
    var out = {
      source:               lt.source,
      confidence:           lt.confidence,
      raw_text:             lt.raw_text || sendText || "",
      normalized_text:      sendText || lt.normalized_text || "",
      fragile_fact_flags:   flags,
    };
    out.confirmation_required = shouldConfirm(out);
    return out;
  }

  /**
   * Build the 6 payload fields for /api/extract-fields. Returns {}
   * when nothing is staged (byte-stable with pre-WO-STT-LIVE-02 callers).
   * `sendText` is optional; when provided we reconcile against it,
   * otherwise we surface the staged transcript verbatim.
   * @param {string=} sendText
   * @returns {object}
   */
  function buildExtractionPayloadFields(sendText) {
    var t = (typeof sendText === "string") ? reconcileForSend(sendText) : null;
    if (!t) {
      var s = _safeState();
      if (!s || !s.lastTranscript || !s.lastTranscript.source) return {};
      t = {
        source:               s.lastTranscript.source,
        confidence:           s.lastTranscript.confidence,
        raw_text:             s.lastTranscript.raw_text,
        normalized_text:      s.lastTranscript.normalized_text,
        fragile_fact_flags:   s.lastTranscript.fragile_fact_flags || [],
        confirmation_required:!!s.lastTranscript.confirmation_required,
      };
    }
    return {
      transcript_source:      t.source || null,
      transcript_confidence:  (typeof t.confidence === "number") ? t.confidence : null,
      raw_transcript:         t.raw_text || null,
      normalized_transcript:  t.normalized_text || null,
      fragile_fact_flags:     Array.isArray(t.fragile_fact_flags) ? t.fragile_fact_flags.slice() : [],
      confirmation_required:  !!t.confirmation_required,
    };
  }

  /**
   * Build a human-readable confirmation prompt for a single
   * clarification_required entry returned by the backend.
   * Callers (interview.js) can override or suppress this; we just
   * provide a sensible default so minimum-viable UX wiring exists.
   */
  function buildConfirmationPrompt(entry) {
    if (!entry) return "";
    var label = entry.label || entry.fieldPath || "that";
    var val   = entry.value || "(nothing)";
    return "We heard " + JSON.stringify(val) + " for " + label + " — is that right?";
  }

  /**
   * Clear the staged transcript. Called after a successful send +
   * extraction round-trip so subsequent sends don't re-attribute to
   * the now-consumed capture.
   */
  function clearStagedTranscript() {
    var s = _safeState();
    if (!s || !s.lastTranscript) return;
    s.lastTranscript.raw_text              = "";
    s.lastTranscript.normalized_text       = "";
    s.lastTranscript.source                = null;
    s.lastTranscript.is_final              = false;
    s.lastTranscript.confidence            = null;
    s.lastTranscript.fragile_fact_flags    = [];
    s.lastTranscript.confirmation_required = false;
    s.lastTranscript.confirmation_prompt   = null;
    s.lastTranscript.turn_id               = null;
    s.lastTranscript.ts                    = 0;
  }

  // Public surface.
  window.TranscriptGuard = {
    LOW_CONF_THRESHOLD:          LOW_CONF_THRESHOLD,
    STALE_MS:                    STALE_MS,
    classifyFragileFacts:        classifyFragileFacts,
    shouldConfirm:               shouldConfirm,
    populateFromRecognition:     populateFromRecognition,
    markBackendWhisper:          markBackendWhisper,
    markTypedInput:              markTypedInput,
    reconcileForSend:            reconcileForSend,
    buildExtractionPayloadFields:buildExtractionPayloadFields,
    buildConfirmationPrompt:     buildConfirmationPrompt,
    clearStagedTranscript:       clearStagedTranscript,
  };
})();
