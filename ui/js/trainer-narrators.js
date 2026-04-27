/* trainer-narrators.js — WO-11 / WO-11D / WO-11E Trainer Narrators
   WO-11 TRAINER MODE REPAIR:
     - Canonical style names: "questionnaire" | "structured" | "storyteller"
     - state.trainerNarrators is the single source of truth and now carries
       full trainer meta (style, title, promptHint, templateName)
     - start() accepts a meta object {style, title, promptHint, templateName}
       OR the legacy (personId, style) signature for back-compat
     - _steps() is style-aware: three branches with user-facing copy
     - finish() captures meta locally BEFORE clearing active so the handoff
       receives the trainer flavor it needs
     - Exposes window.LorevoxTrainerNarrators

   WO-11D TRAINER CHOOSER REFRESH:
     - Replaced celebrity-forward labels with user-facing choices:
       Questionnaire First / Clear & Direct / Warm Storytelling
     - Shared Lori explanation block across all trainers
     - Examples use normal life-history complexity (preferred names,
       pronouns, multiple marriages, blended families)
     - Internal keys preserved for handoff compatibility

   WO-11E TRAINER TTS NARRATION + SPOKEN GUIDANCE:
     - Lori reads each trainer step aloud automatically
     - Spoken navigation guidance at end of each step
     - Replay button and speaking indicator in panel
     - Stop narration on Back/Next/Skip/Start Interview
     - TTS failure fallback — trainer still works visually
     - All narration goes through enqueueTts (no chat bubbles)
     - Preserves WO-11C modal isolation

   WO-11B history kept: trainers remain UI-only launcher actions.
   They never create person records or bind narrator metadata via preload.
*/
(function () {
  "use strict";
  function _el(id) { return document.getElementById(id); }

  function _ensureTrainerState() {
    if (typeof state === "undefined") return null;
    if (!state.trainerNarrators) {
      state.trainerNarrators = {
        active: false,
        style: null,            // "questionnaire" | "structured" | "storyteller"
        title: null,
        promptHint: null,
        templateName: null,
        stepIndex: 0,
        completed: false,
        completedStyle: null,
        // WO-11E: Narration state
        _wo11eNarrating: false,  // true while trainer TTS is in progress
        _wo11eStopped: false     // true when user manually stopped narration
      };
    }
    return state.trainerNarrators;
  }

  function _normalizeStyle(s) {
    // WO-11D: Three canonical styles.
    // Legacy "story" maps to "storyteller" for back-compat.
    if (s === "questionnaire") return "questionnaire";
    if (s === "structured") return "structured";
    if (s === "storyteller" || s === "story") return "storyteller";
    return "structured";
  }

  // WO-11D: User-facing display names (never show internal keys)
  var _STYLE_DISPLAY = {
    questionnaire: { name: "Questionnaire First",  sub: "Start with the basics, step by step." },
    structured:    { name: "Clear & Direct",        sub: "Short answers. One fact at a time." },
    storyteller:   { name: "Warm Storytelling",     sub: "Tell it with detail, feeling, and scene." }
  };

  function _reset() {
    var s = _ensureTrainerState();
    if (!s) return;
    _wo11eStopNarration(); // WO-11E: stop any playing narration
    s.active = false;
    s.style = null;
    s.title = null;
    s.promptHint = null;
    s.templateName = null;
    s.stepIndex = 0;
    s.completed = false;
    s.completedStyle = null;
    s._wo11eNarrating = false;
    s._wo11eStopped = false;
    // WO-CR-01: Re-show chronology accordion after trainer reset
    if (typeof crInitAccordion === "function") {
      try { crInitAccordion(); } catch (_) {}
    }
    _renderPanel();
  }

  // ── WO-11D: Shared Lori explanation (used by all three trainers) ──
  var _SHARED_LORI_INTRO = [
    "Hi\u2026 I\u2019m Lori.",
    "Lorevox is a place to save and organize your life story \u2014 in your own words, at your own pace.",
    "I\u2019ll ask questions, listen, and help shape what you share into a growing life story.",
    "There\u2019s no test and no perfect way to answer. Brief answers are fine. Fuller stories are welcome too.",
    "Real lives are welcome here \u2014 preferred names, pronouns, multiple marriages, blended families, all of it. Complexity is normal, and I can handle it.",
    "Use Back, Next, or Skip at any time."
  ];

  // ── WO-11D: Style-aware step content ──────────────────────────
  function _steps(style) {
    var canonical = _normalizeStyle(style);

    if (canonical === "questionnaire") {
      return [
        {
          id: "about_lorevox",
          lori: _SHARED_LORI_INTRO.concat([
            "This is a gentle, step-by-step way to begin.",
            "We\u2019ll start with the basics \u2014 names, dates, places, relationships, and other important life details.",
            "You don\u2019t have to tell the whole story at once."
          ]),
          question: "Here are some examples of simple answers to get started.",
          simpleLabel: "Basic fact",
          simple: "My full legal name is Margaret Louise Carter, but everyone calls me Maggie.",
          storyLabel: "A little more detail",
          story: "I was born in Spokane, Washington, in 1939. My mother\u2019s family had been there for two generations."
        },
        {
          id: "how_lori_works",
          lori: [
            "I\u2019ll ask one question at a time, starting simple.",
            "Names, dates, places \u2014 then we\u2019ll build from there.",
            "If something is complicated, just say so. I\u2019ll follow your lead."
          ],
          question: "You can share as much or as little as you\u2019d like.",
          simpleLabel: "Short and clear",
          simple: "I use they and them pronouns.",
          storyLabel: "With a bit of context",
          story: "I was married twice. My first marriage ended young, and I later married David. My son is from my first marriage, and my younger daughter is from my second."
        },
        {
          id: "try_your_way",
          lori: [
            "That\u2019s all there is to it.",
            "Short facts are perfect. More detail is welcome anytime.",
            "Now you\u2019re ready to begin \u2014 your own life, your own words.",
            "Tap Start Interview to begin, or Skip if you\u2019d rather jump right in."
          ],
          question: "When you answer Lori, simple facts are all you need to start.",
          simpleLabel: "Simple fact",
          simple: "I was born in Spokane, Washington.",
          storyLabel: "With a bit more",
          story: "I was born in Spokane in the spring of 1939. My father worked at the aluminum plant, and we lived in a small house on the north side of town."
        }
      ];
    }

    if (canonical === "storyteller") {
      return [
        {
          id: "about_lorevox",
          lori: _SHARED_LORI_INTRO.concat([
            "This path is good for fuller answers.",
            "You can include people, feelings, atmosphere, and detail.",
            "You don\u2019t need to be polished \u2014 just tell it in your own way."
          ]),
          question: "Let me show you what a storytelling answer can sound like.",
          simpleLabel: "Short answer",
          simple: "I remember holidays being complicated after our family changed.",
          storyLabel: "Storytelling answer",
          story: "After my second marriage, the holidays took on a different shape \u2014 my children from the first marriage, his boys from his side, all of us trying to figure out where everyone belonged, and somehow making a kind of family out of it anyway."
        },
        {
          id: "how_lori_works",
          lori: [
            "I usually ask one gentle question at a time.",
            "We move through your life slowly \u2014 and you\u2019re welcome to take the long way around.",
            "Tell me what you remember, the way you remember it. The wandering is where the gold is."
          ],
          question: "Here\u2019s how a name can become a story.",
          simpleLabel: "Short answer",
          simple: "My full name is Margaret Louise Carter, but I\u2019ve always gone by Maggie.",
          storyLabel: "Storytelling answer",
          story: "My name is Margaret Louise Carter \u2014 Margaret after my grandmother who came over from Norway, Louise because my mother just liked the sound of it. But nobody has ever called me Margaret. I\u2019ve been Maggie since before I could walk, and that\u2019s the name that feels like mine."
        },
        {
          id: "try_your_way",
          lori: [
            "Both kinds of answers are welcome here.",
            "But if you can, lean into the telling.",
            "Let the colors and the people and the feelings come along.",
            "Now you give it a try \u2014 your own life, your own voice.",
            "Tap Start Interview to begin, or Skip if you\u2019d rather jump right in."
          ],
          question: "When you answer Lori, you can be brief, or you can really paint the scene.",
          simpleLabel: "Short answer",
          simple: "I remember playing outside behind our house.",
          storyLabel: "Storytelling answer",
          story: "I remember playing out behind the old house \u2014 the grass was tall enough that it whispered when the wind moved through it, my brother had a stick he called his sword, and the whole afternoon felt like it would never end and like every grown-up in the world had forgotten to come find us, which was just exactly right."
        }
      ];
    }

    // Default: structured — short, anchored, factual
    return [
      {
        id: "about_lorevox",
        lori: _SHARED_LORI_INTRO.concat([
          "This path is good for short, clear answers.",
          "One fact at a time is enough.",
          "Names, dates, places, and simple descriptions are all welcome."
        ]),
        question: "Let me show you two ways someone might answer.",
        simpleLabel: "Short answer",
        simple: "I was born in Spokane, Washington, in 1939.",
        storyLabel: "Clear answer",
        story: "My full name is Margaret Louise Carter, but I\u2019ve always gone by Maggie. I use she and her pronouns."
      },
      {
        id: "how_lori_works",
        lori: [
          "I usually ask gentle questions one at a time.",
          "We move through life step by step, starting at the beginning.",
          "A clear answer gives me the key facts: the time, the place, and the people."
        ],
        question: "Here\u2019s an example with a little more detail.",
        simpleLabel: "Short answer",
        simple: "I was married twice.",
        storyLabel: "Clear answer",
        story: "I was married twice. My first marriage ended young, and I later married David. My son is from my first marriage, and my younger daughter is from my second."
      },
      {
        id: "try_your_way",
        lori: [
          "Both ways are good.",
          "A short answer gives clear facts.",
          "A fuller answer adds the time, the place, and the people \u2014 enough to hold the moment.",
          "Now you can do it your way.",
          "Tap Start Interview to begin, or Skip if you\u2019d rather jump right in."
        ],
        question: "When you answer Lori, you can be brief, or you can add a little context.",
        simpleLabel: "Short answer",
        simple: "I remember playing outside behind our house.",
        storyLabel: "Clear answer",
        story: "When I was about six, around 1945, I used to play in the yard behind our house on Maple Street \u2014 my brother was usually there, and the neighbors\u2019 dog would come over and watch us."
      }
    ];
  }

  function _getCurrentStep() {
    var s = _ensureTrainerState();
    if (!s) return null;
    var steps = _steps(s.style);
    return steps[s.stepIndex] || null;
  }

  // ═══════════════════════════════════════════════════════════════
  // WO-11E: Trainer Narration Orchestration
  // WO-11E-HL: Read-along highlighting + button pulse
  // ═══════════════════════════════════════════════════════════════

  // Approximate Coqui VITS p335 reading rate: ~13 chars/sec (~140 WPM).
  // Used for highlight timing — not perfect sync, just a visual guide.
  // WO-11E-HL: Highlight timing — no fixed startup delay.
  // The sequencer waits for the real playback-started signal from drainTts.
  var _WO11E_CHARS_PER_SEC  = 9.8;  // calibrated for Coqui p335 "warm" voice on RTX 5080
  var _WO11E_SECTION_GAP    = 0.6;  // breath gap between sections
  var _wo11eHighlightTimers = [];    // active setTimeout IDs for sequencer

  /** Build narration text AND a section map for read-along highlighting.
   *  Returns { text: String, sections: [{selector, charCount, type}] } */
  function _wo11eBuildNarration(step, stepIndex, totalSteps) {
    var parts = [];
    var sections = [];

    // ── 5 large sections for robust highlight sync ──
    // Per-line highlighting drifts. These big blocks each last 10-20s
    // so a few seconds of timing error is invisible.

    // 1. ALL lori lines as one block
    var loriText = step.lori.join(" ");
    step.lori.forEach(function (line) { parts.push(line); });
    sections.push({
      selector: '[data-wo11e-idx="lori-block"]',
      text: loriText,
      type: "block"
    });

    // 2. Question line
    if (step.question) {
      parts.push(step.question);
      sections.push({
        selector: '[data-wo11e-idx="question"]',
        text: step.question,
        type: "question"
      });
    }

    // 3. Simple example
    var simText = "";
    if (step.simple) {
      var simLabel = (step.simpleLabel || "short answer").toLowerCase();
      simText = "A " + simLabel + " might sound like this: " + step.simple;
      parts.push(simText);
      sections.push({
        selector: '[data-wo11e-idx="example-simple"]',
        text: simText,
        type: "example"
      });
    }

    // 4. Story example
    var stoText = "";
    if (step.story) {
      var stoLabel = (step.storyLabel || "fuller answer").toLowerCase();
      stoText = "Or, " + stoLabel + ": " + step.story;
      parts.push(stoText);
      sections.push({
        selector: '[data-wo11e-idx="example-story"]',
        text: stoText,
        type: "example"
      });
    }

    // 5. Navigation guidance (pulse buttons)
    var guidance;
    if (stepIndex >= totalSteps - 1) {
      guidance = "Tap Start Interview when you\u2019re ready. Or tap Back if you want to hear that again.";
    } else if (stepIndex === 0) {
      guidance = "Tap Next to continue. Or tap Skip if you\u2019d rather begin the interview now.";
    } else {
      guidance = "Tap Next to continue. Tap Back if you want to hear that again. Or Skip to begin your interview.";
    }
    parts.push(guidance);
    sections.push({
      selector: null,
      text: guidance,
      type: "guidance"
    });

    return { text: parts.join(" "), sections: sections };
  }

  // ── Read-along highlight sequencer ──────────────────────────────

  /** Remove .wo11e-reading from all trainer elements and .wo11e-btn-pulse from buttons. */
  function _wo11eClearActiveHighlight() {
    var root = _el("lv80TrainerPanel");
    if (!root) return;
    var active = root.querySelectorAll(".wo11e-reading");
    for (var i = 0; i < active.length; i++) {
      active[i].classList.remove("wo11e-reading");
    }
    var pulsing = root.querySelectorAll(".wo11e-btn-pulse");
    for (var j = 0; j < pulsing.length; j++) {
      pulsing[j].classList.remove("wo11e-btn-pulse");
    }
  }

  /** Cancel all pending highlight timers and clear visual state. */
  function _wo11eCancelHighlights() {
    for (var i = 0; i < _wo11eHighlightTimers.length; i++) {
      clearTimeout(_wo11eHighlightTimers[i]);
    }
    _wo11eHighlightTimers = [];
    _wo11eClearActiveHighlight();
  }

  /** Activate highlight for a section. For guidance sections, pulse buttons instead. */
  function _wo11eActivateHighlight(section) {
    var root = _el("lv80TrainerPanel");
    if (!root) return;

    _wo11eClearActiveHighlight();

    if (section.type === "guidance") {
      // Pulse all trainer buttons
      var btns = root.querySelectorAll(".lv80-trainer-btn");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.add("wo11e-btn-pulse");
      }
      return;
    }

    if (section.selector) {
      var el = root.querySelector(section.selector);
      if (el) {
        el.classList.add("wo11e-reading");
        // Auto-focus scroll — keep active highlight centered for weak vision
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
      }
    }
  }

  /** Start the highlight sequencer — waits for actual audio playback to begin.
   *  Registers a callback on window._wo11eTtsPlaybackStarted that drainTts
   *  fires the instant the first WAV chunk starts playing. No guessing. */
  function _wo11eStartHighlightSequence(sections) {
    _wo11eCancelHighlights();

    // Highlight line 1 immediately as a visual cue that narration is coming
    if (sections.length > 0 && sections[0].selector) {
      _wo11eActivateHighlight(sections[0]);
      console.log("[WO-11E-HL] Pre-highlight first section while TTS generates");
    }

    // Register callback — drainTts fires this when src.start(0) succeeds
    window._wo11eTtsPlaybackStarted = function () {
      console.log("[WO-11E-HL] Audio playback started — launching highlight sequence");
      _wo11eRunSequence(sections);
    };
  }

  /** Punctuation-aware duration estimate for a text section.
   *  Accounts for natural speech pauses at sentence ends and mid-clause breaks.
   *  Formula: (chars / speed) + (periods * 0.6s) + (commas/dashes * 0.3s) */
  function _wo11eEstimateDuration(text) {
    var baseSec = text.length / _WO11E_CHARS_PER_SEC;
    // Count full-stop punctuation (. ? !)
    var stops = (text.match(/[.?!]/g) || []).length;
    // Count mid-clause pauses (, — ; :)
    var pauses = (text.match(/[,;:\u2014]/g) || []).length;
    return baseSec + (stops * 0.6) + (pauses * 0.3);
  }

  /** Run the timed highlight sequence (called when audio actually starts). */
  function _wo11eRunSequence(sections) {
    // Clear any pre-highlight
    _wo11eCancelHighlights();

    var cumTimeMs = 0; // no startup delay — audio is already playing

    sections.forEach(function (sec) {
      var t = cumTimeMs;
      var timer = setTimeout(function () {
        _wo11eActivateHighlight(sec);
        console.log("[WO-11E-HL] Highlight →", sec.type,
          sec.selector || "(buttons)", "at", Math.round(t / 100) / 10 + "s");
      }, t);
      _wo11eHighlightTimers.push(timer);

      cumTimeMs += (_wo11eEstimateDuration(sec.text || "") + _WO11E_SECTION_GAP) * 1000;
    });

    // Final timer: clear last highlight after it finishes
    var finalTimer = setTimeout(function () {
      _wo11eClearActiveHighlight();
    }, cumTimeMs);
    _wo11eHighlightTimers.push(finalTimer);

    console.log("[WO-11E-HL] Highlight sequence running — " +
      sections.length + " sections, estimated " +
      Math.round(cumTimeMs / 100) / 10 + "s total");
  }

  // ── Narration control ──────────────────────────────────────────

  /** Start narration for the current trainer step.
   *  Stops any previous narration, builds text, starts TTS + highlight sequencer. */
  function _wo11eNarrateStep() {
    var s = _ensureTrainerState();
    if (!s || !s.active) return;

    var step = _getCurrentStep();
    if (!step) return;

    var totalSteps = _steps(s.style).length;
    var narration = _wo11eBuildNarration(step, s.stepIndex, totalSteps);

    // Mark as narrating
    s._wo11eNarrating = true;
    s._wo11eStopped = false;
    console.log("[WO-11E] Trainer narration requested — step:", s.stepIndex,
      "id:", step.id, "textLen:", narration.text.length,
      "sections:", narration.sections.length);

    // Update speaking indicator
    _wo11eShowSpeakingIndicator(true);

    // Set completion callback before enqueueing
    window._wo11eTtsFinishedCallback = function () {
      console.log("[WO-11E] Trainer narration finished — step:", s.stepIndex);
      s._wo11eNarrating = false;
      _wo11eShowSpeakingIndicator(false);
      _wo11eCancelHighlights(); // Clean up any remaining highlights
    };

    // Call TTS (no chat bubble — just audio)
    if (typeof enqueueTts === "function") {
      try {
        enqueueTts(narration.text);
        // WO-11E-HL: Start highlight sequencer alongside TTS
        _wo11eStartHighlightSequence(narration.sections);
        console.log("[WO-11E] Trainer narration started — step:", s.stepIndex);
      } catch (e) {
        console.warn("[WO-11E] TTS unavailable — trainer continues visually", e);
        s._wo11eNarrating = false;
        _wo11eShowSpeakingIndicator(false);
        _wo11eShowTtsFallback();
      }
    } else {
      // TTS function not available — fallback
      console.warn("[WO-11E] enqueueTts not found — TTS unavailable");
      s._wo11eNarrating = false;
      _wo11eShowSpeakingIndicator(false);
      _wo11eShowTtsFallback();
    }
  }

  /** Stop any in-progress trainer narration + highlight sequence. */
  function _wo11eStopNarration() {
    var s = _ensureTrainerState();
    if (s) {
      s._wo11eNarrating = false;
      s._wo11eStopped = true;
    }
    // Clear TTS callbacks so they don't fire stale
    window._wo11eTtsFinishedCallback = null;
    window._wo11eTtsPlaybackStarted = null; // WO-11E-HL: cancel pending sequence launch
    // Stop TTS playback
    if (typeof window._wo11eStopTts === "function") {
      window._wo11eStopTts();
      console.log("[WO-11E] Trainer narration stopped");
    }
    _wo11eShowSpeakingIndicator(false);
    _wo11eCancelHighlights(); // WO-11E-HL: Cancel read-along highlights
  }

  /** Show or hide the "Lori is reading..." indicator in the trainer panel. */
  function _wo11eShowSpeakingIndicator(visible) {
    var el = _el("wo11eTrainerSpeaking");
    if (el) el.style.display = visible ? "flex" : "none";
  }

  /** Show a subtle fallback message when TTS is unavailable. */
  function _wo11eShowTtsFallback() {
    var el = _el("wo11eTrainerSpeaking");
    if (el) {
      el.textContent = "Voice guidance unavailable \u2014 you can follow the steps on screen.";
      el.style.display = "flex";
      // Auto-hide after 6 seconds
      setTimeout(function () {
        if (el.textContent.indexOf("unavailable") >= 0) {
          el.style.display = "none";
        }
      }, 6000);
    }
  }

  // ═══════════════════════════════════════════════════════════════

  function _renderPanel() {
    var root = _el("lv80TrainerPanel");
    if (!root) return;
    var s = _ensureTrainerState();
    if (!s || !s.active) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    var step = _getCurrentStep();
    if (!step) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    // WO-11D: User-facing eyebrow and title from display map
    var display = _STYLE_DISPLAY[s.style] || _STYLE_DISPLAY.structured;
    var eyebrow = display.name + " \u2014 " + display.sub;

    // WO-11E-HL: Each lori line gets a data-wo11e-idx for highlight targeting
    var loriHtml = step.lori.map(function (line, i) {
      return '<div class="lv80-trainer-lori-line" data-wo11e-idx="lori-' + i + '">' + _esc(line) + '</div>';
    }).join("");
    var totalSteps = _steps(s.style).length;
    var isLastStep = s.stepIndex >= totalSteps - 1;
    root.hidden = false;
    root.innerHTML =
      '<div class="lv80-trainer-shell">' +
        // WO-11E: Speaking indicator (hidden by default)
        '<div id="wo11eTrainerSpeaking" class="lv80-trainer-speaking" style="display:none;">' +
          '<span class="lv80-trainer-speaking-dot"></span> Lori is reading this step\u2026' +
        '</div>' +
        '<div class="lv80-trainer-eyebrow">' + _esc(eyebrow) + '</div>' +
        '<div class="lv80-trainer-title">Getting Started with Lori</div>' +
        '<div class="lv80-trainer-copy" data-wo11e-idx="lori-block">' + loriHtml + '</div>' +
        '<div class="lv80-trainer-question" data-wo11e-idx="question">' + _esc(step.question) + '</div>' +
        '<div class="lv80-trainer-examples">' +
          '<div class="lv80-trainer-example-card" data-wo11e-idx="example-simple">' +
            '<div class="lv80-trainer-example-label">' + _esc(step.simpleLabel) + '</div>' +
            '<div class="lv80-trainer-example-text">' + _esc(step.simple) + '</div>' +
          '</div>' +
          '<div class="lv80-trainer-example-card" data-wo11e-idx="example-story">' +
            '<div class="lv80-trainer-example-label">' + _esc(step.storyLabel) + '</div>' +
            '<div class="lv80-trainer-example-text">' + _esc(step.story) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lv80-trainer-actions">' +
          (s.stepIndex > 0 ? '<button class="lv80-trainer-btn secondary" onclick="LorevoxTrainerNarrators.prev()">Back</button>' : '') +
          '<button class="lv80-trainer-btn" onclick="LorevoxTrainerNarrators.next()">' +
            (isLastStep ? 'Start Interview' : 'Next') +
          '</button>' +
          '<button class="lv80-trainer-btn secondary" onclick="LorevoxTrainerNarrators.skip()">Skip</button>' +
          // WO-11E: Replay button
          '<button class="lv80-trainer-btn secondary lv80-trainer-replay-btn" onclick="LorevoxTrainerNarrators.replay()" title="Replay this step">' +
            '\u25B6 Replay' +
          '</button>' +
        '</div>' +
      '</div>';
    console.log("[WO-11E] Trainer step rendered — index:", s.stepIndex, "id:", step.id);
    // WO-10J: Ensure trainer panel is visible after any re-render
    setTimeout(function() { root.scrollIntoView({behavior: "smooth", block: "start"}); }, 50);
  }

  function _esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // WO-11: meta-aware start. Accepts either:
  //   start({style, title, promptHint, templateName})    <- new canonical
  //   start(personId, style)                              <- legacy back-compat
  function start(metaOrPersonId, maybeStyle) {
    var s = _ensureTrainerState();
    if (!s) return;
    var meta;
    if (metaOrPersonId && typeof metaOrPersonId === "object") {
      meta = metaOrPersonId;
    } else {
      // Legacy signature: ignore personId, treat second arg as style
      meta = { style: maybeStyle };
    }
    s.active         = true;
    s.style          = _normalizeStyle(meta.style);
    s.title          = meta.title || null;
    s.promptHint     = meta.promptHint || null;
    s.templateName   = meta.templateName || null;
    s.stepIndex      = 0;
    s.completed      = false;
    s.completedStyle = null;
    s._wo11eNarrating = false;
    s._wo11eStopped   = false;
    console.log("[WO-11D] Trainer started — style:", s.style,
      "display:", (_STYLE_DISPLAY[s.style] || {}).name);
    // WO-CR-01: Hide chronology accordion during trainer mode
    if (typeof crHideAccordion === "function") {
      try { crHideAccordion(); } catch (_) {}
    }
    _renderPanel();
    // WO-11E: Auto-narrate the first step
    // Small delay to let the panel render and scroll into view first
    setTimeout(function () { _wo11eNarrateStep(); }, 200);
  }

  function next() {
    var s = _ensureTrainerState();
    if (!s || !s.active) return;
    // WO-11E: Stop current narration before step change
    _wo11eStopNarration();
    console.log("[WO-11E] Trainer narration stopped on Next");
    var total = _steps(s.style).length;
    if (s.stepIndex < total - 1) {
      s.stepIndex += 1;
      _renderPanel();
      // WO-11E: Auto-narrate the new step
      setTimeout(function () { _wo11eNarrateStep(); }, 200);
      return;
    }
    finish();
  }

  function prev() {
    var s = _ensureTrainerState();
    if (!s || !s.active) return;
    // WO-11E: Stop current narration before step change
    _wo11eStopNarration();
    console.log("[WO-11E] Trainer narration stopped on Back");
    s.stepIndex = Math.max(0, s.stepIndex - 1);
    _renderPanel();
    // WO-11E: Auto-narrate the step from the beginning
    setTimeout(function () { _wo11eNarrateStep(); }, 200);
  }

  function skip() {
    // WO-11E: Stop narration before exit
    _wo11eStopNarration();
    console.log("[WO-11E] Trainer narration stopped on Skip");
    finish();
  }

  // WO-11E: Replay current step narration
  function replay() {
    var s = _ensureTrainerState();
    if (!s || !s.active) return;
    _wo11eStopNarration();
    console.log("[WO-11E] Replay clicked — restarting narration for step:", s.stepIndex);
    setTimeout(function () { _wo11eNarrateStep(); }, 150);
  }

  // WO-11: capture meta locally BEFORE clearing active=false so the handoff
  // call still has the trainer flavor. The previous implementation set
  // style=null first and then called lv80StartTrainerInterview() with no
  // information, which is why both trainers collapsed identically.
  function finish() {
    var s = _ensureTrainerState();
    if (!s) return;

    // WO-11E: Stop any in-progress narration before exit
    _wo11eStopNarration();
    console.log("[WO-11E] Trainer narration stopped on finish/Start Interview");

    var capturedMeta = {
      style:        s.style,
      title:        s.title,
      promptHint:   s.promptHint,
      templateName: s.templateName
    };

    s.active         = false;
    s.completed      = true;
    s.completedStyle = capturedMeta.style;
    s._wo11eNarrating = false;
    // Note: style/title/promptHint are NOT cleared here. They persist on the
    // object until the next start() or reset() so any UI surface that wants
    // to show "you're in storyteller mode" can still read them.

    // WO-CR-01: Re-show chronology accordion after trainer mode ends
    if (typeof crInitAccordion === "function") {
      try { crInitAccordion(); } catch (_) {}
    }

    _renderPanel();

    // WO-11: trainer-aware handoff. Pass the captured meta so the start
    // function can flavor the intro bubble and inject a one-shot system hint.
    if (typeof window.lv80StartTrainerInterview === "function") {
      try {
        window.lv80StartTrainerInterview(capturedMeta);
      } catch (e) {
        console.warn("[WO-11] trainer handoff failed", e);
      }
    }
  }

  function isActive() {
    var s = _ensureTrainerState();
    return !!(s && s.active);
  }

  // WO-11B: removed bindNarratorMeta/getNarratorMeta — trainers are UI-only
  window.LorevoxTrainerNarrators = {
    start: start,
    next: next,
    prev: prev,
    skip: skip,
    finish: finish,
    isActive: isActive,
    render: _renderPanel,
    reset: _reset,
    replay: replay  // WO-11E
  };
})();
