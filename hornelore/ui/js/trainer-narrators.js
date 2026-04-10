/* trainer-narrators.js — WO-11 Trainer Narrators (WO-11B stabilized)
   Shatner + Dolly coaching flow for narrator onboarding.
   Load order: after state.js, before app.js/interview.js use.
   Exposes: window.LorevoxTrainerNarrators

   WO-11B: Trainers are UI-only launcher actions.
   They never create person records or bind narrator metadata.
*/
(function () {
  "use strict";
  function _el(id) { return document.getElementById(id); }
  function _ensureTrainerState() {
    if (typeof state === "undefined") return null;
    if (!state.trainerNarrators) {
      state.trainerNarrators = {
        active: false,
        personId: null,
        style: null,          // structured | story
        stepIndex: 0,
        completed: false
      };
    }
    return state.trainerNarrators;
  }
  function _reset() {
    var s = _ensureTrainerState();
    if (!s) return;
    s.active = false;
    s.personId = null;
    s.style = null;
    s.stepIndex = 0;
    s.completed = false;
    _renderPanel();
  }
  function _steps() {
    return [
      {
        id: "about_lorevox",
        lori: [
          "Hi\u2026 I\u2019m Lori.",
          "I\u2019m here to help you tell your life story.",
          "Lorevox is a place where your memories can be saved, organized, and turned into a story \u2014 in your own words.",
          "There\u2019s no test, and there are no right or wrong answers.",
          "Even small pieces matter."
        ],
        question: "Let me show you two ways someone might answer.",
        simpleLabel: "Short answer",
        simple: "I was born in Bismarck, North Dakota.",
        storyLabel: "Story answer",
        story: "I was born in Bismarck, North Dakota \u2014 and when I think of that place, I picture the weather, the town, and the way people talked about where we came from."
      },
      {
        id: "how_lori_works",
        lori: [
          "I usually ask gentle questions one at a time.",
          "We move through life step by step, starting at the beginning.",
          "You can answer simply, or you can tell more of a story."
        ],
        question: "Here\u2019s a name example.",
        simpleLabel: "Short answer",
        simple: "My name is Christopher Todd Horne.",
        storyLabel: "Story answer",
        story: "My name is Christopher Todd Horne, though most people call me Chris, and that\u2019s the name people have known me by for years."
      },
      {
        id: "try_your_way",
        lori: [
          "Both ways are good.",
          "A short answer gives clear facts.",
          "A story answer adds feeling and detail.",
          "Now you can do it your way."
        ],
        question: "When you answer Lori, you can be brief, or you can tell the story around it.",
        simpleLabel: "Short answer",
        simple: "I remember playing outside behind our house.",
        storyLabel: "Story answer",
        story: "I remember playing outside behind our house when I was little \u2014 just the feeling of being there, the yard, the air, and the sense that the whole world was that one place."
      }
    ];
  }
  function _getCurrentStep() {
    var s = _ensureTrainerState();
    if (!s) return null;
    var steps = _steps();
    return steps[s.stepIndex] || null;
  }
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
    var styleLabel = s.style === "structured"
      ? "Shatner Trainer \u2014 Short, clear answers"
      : "Dolly Trainer \u2014 Warm, storytelling answers";
    var loriHtml = step.lori.map(function (line) {
      return '<div class="lv80-trainer-lori-line">' + _esc(line) + '</div>';
    }).join("");
    root.hidden = false;
    root.innerHTML =
      '<div class="lv80-trainer-shell">' +
        '<div class="lv80-trainer-eyebrow">' + _esc(styleLabel) + '</div>' +
        '<div class="lv80-trainer-title">Lori Trainer</div>' +
        '<div class="lv80-trainer-copy">' + loriHtml + '</div>' +
        '<div class="lv80-trainer-question">' + _esc(step.question) + '</div>' +
        '<div class="lv80-trainer-examples">' +
          '<div class="lv80-trainer-example-card">' +
            '<div class="lv80-trainer-example-label">' + _esc(step.simpleLabel) + '</div>' +
            '<div class="lv80-trainer-example-text">' + _esc(step.simple) + '</div>' +
          '</div>' +
          '<div class="lv80-trainer-example-card">' +
            '<div class="lv80-trainer-example-label">' + _esc(step.storyLabel) + '</div>' +
            '<div class="lv80-trainer-example-text">' + _esc(step.story) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lv80-trainer-actions">' +
          (s.stepIndex > 0 ? '<button class="lv80-trainer-btn secondary" onclick="LorevoxTrainerNarrators.prev()">Back</button>' : '') +
          '<button class="lv80-trainer-btn" onclick="LorevoxTrainerNarrators.next()">' +
            (s.stepIndex >= _steps().length - 1 ? 'Start Interview' : 'Next') +
          '</button>' +
          '<button class="lv80-trainer-btn secondary" onclick="LorevoxTrainerNarrators.skip()">Skip</button>' +
        '</div>' +
      '</div>';
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
  function start(personId, style) {
    var s = _ensureTrainerState();
    if (!s) return;
    s.active = true;
    s.personId = personId || null;
    s.style = style || "structured";
    s.stepIndex = 0;
    s.completed = false;
    _renderPanel();
  }
  function next() {
    var s = _ensureTrainerState();
    if (!s || !s.active) return;
    if (s.stepIndex < _steps().length - 1) {
      s.stepIndex += 1;
      _renderPanel();
      return;
    }
    finish();
  }
  function prev() {
    var s = _ensureTrainerState();
    if (!s || !s.active) return;
    s.stepIndex = Math.max(0, s.stepIndex - 1);
    _renderPanel();
  }
  function skip() {
    finish();
  }
  function finish() {
    var s = _ensureTrainerState();
    if (!s) return;
    s.active = false;
    s.personId = null;
    s.style = null;
    s.completed = true;
    _renderPanel();

    // WO-11B: hard reset trainer/capture state
    if (typeof window.lv80ClearTrainerAndCaptureState === "function") {
      window.lv80ClearTrainerAndCaptureState();
    }

    if (typeof window.lv80StartTrainerInterview === "function") {
      window.lv80StartTrainerInterview();
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
    reset: _reset
  };
})();
