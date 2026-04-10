/* ═══════════════════════════════════════════════════════════════
   test-harness.js — WO-10H: Repeatable LLM Tuning Test Harness
   28-field extraction scorecard, 4 narrator samples, auto-scoring,
   comparison table, golden baseline, safe cleanup.
   Load order: AFTER app.js
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── TEST PERSON ID NAMESPACE ──────────────────────────────── */
  const TEST_PID_PREFIX = "__test_harness_";
  const TEST_PID = TEST_PID_PREFIX + "narrator_001";

  /* ── 28-FIELD SCORING RUBRIC ────────────────────────────────── */
  const RUBRIC_28 = [
    // A. Identity (5 fields)
    { id: 1,  cat: "Identity",     field: "Full Name",        expected: "Christopher Todd Horne" },
    { id: 2,  cat: "Identity",     field: "Date of Birth",    expected: "December 24, 1962" },
    { id: 3,  cat: "Identity",     field: "Birthplace",       expected: "Williston, North Dakota" },
    { id: 4,  cat: "Identity",     field: "Birth Order",      expected: "third child" },
    { id: 5,  cat: "Identity",     field: "Gender",           expected: "male" },
    // B. Parents (4 fields)
    { id: 6,  cat: "Parents",      field: "Father Name",      expected: "Kent James Horne" },
    { id: 7,  cat: "Parents",      field: "Mother Name",      expected: "Janice Josephine Zarr Horne" },
    { id: 8,  cat: "Parents",      field: "Father Occupation", expected: "construction" },
    { id: 9,  cat: "Parents",      field: "Mother Role",      expected: "homemaker" },
    // C. Siblings (2 fields)
    { id: 10, cat: "Siblings",     field: "Sibling Names",    expected: "Vince, Jay" },
    { id: 11, cat: "Siblings",     field: "Sibling Count",    expected: "2" },
    // D. Education (2 fields)
    { id: 12, cat: "Education",    field: "School Name",      expected: "Bismarck High School" },
    { id: 13, cat: "Education",    field: "Graduation Year",  expected: "1981" },
    // E. Career (3 fields)
    { id: 14, cat: "Career",       field: "Profession",       expected: "occupational therapist" },
    { id: 15, cat: "Career",       field: "Work Setting",     expected: "schools" },
    { id: 16, cat: "Career",       field: "Work Location",    expected: "Las Vegas, NM" },
    // F. Relationships (4 fields)
    { id: 17, cat: "Relationships", field: "First Spouse",    expected: "Louise LaPlante" },
    { id: 18, cat: "Relationships", field: "Second Spouse",   expected: "Melanie Zollner" },
    { id: 19, cat: "Relationships", field: "Marriage Dates",  expected: "1991, 2010" },
    { id: 20, cat: "Relationships", field: "Divorce",         expected: "2008" },
    // G. Children (2 fields)
    { id: 21, cat: "Children",     field: "Children Names",   expected: "Gretchen, Amelia, Cole" },
    { id: 22, cat: "Children",     field: "Children Count",   expected: "3" },
    // H. Life Events (3 fields)
    { id: 23, cat: "Life Events",  field: "Major Travel",     expected: "France 2025" },
    { id: 24, cat: "Life Events",  field: "Retirement",       expected: "January 1, 2026" },
    { id: 25, cat: "Life Events",  field: "Residence Context", expected: "North Dakota" },
    // I. Narrative / Reflection (3 fields)
    { id: 26, cat: "Narrative",    field: "Life Lesson",      expected: "value relationships" },
    { id: 27, cat: "Narrative",    field: "Personal Challenge", expected: "family strain" },
    { id: 28, cat: "Narrative",    field: "Theme",            expected: "resilience" },
  ];

  /* ── SAMPLE-SPECIFIC EXPECTED SCORES ───────────────────────── */
  const SAMPLE_EXPECTATIONS = {
    clean:      { min: 24, max: 28, label: "Excellent if 24+, Good if 18+" },
    messy:      { min: 22, max: 26, label: "Good if 22+, Acceptable if 16+" },
    emotional:  { min: 18, max: 24, label: "Good if 18+, Acceptable if 14+" },
    fragmented: { min: 12, max: 18, label: "Good if 12+, Acceptable if 8+" },
  };

  /* ── 4 TEST NARRATOR SAMPLES ────────────────────────────────── */
  const SAMPLES = {
    clean: `My name is Christopher Todd Horne. I was born on December 24, 1962, in Williston, North Dakota, early in the morning around 5:30 AM. I was the third child in my family and the youngest son.

My parents were Kent James Horne and Janice Josephine Zarr Horne. My father was born in Stanley, North Dakota, and worked in construction and heavy equipment operations for much of his life. My mother was born in Spokane, Washington, and was very focused on family, music, and creating a stable home environment. They were married in 1959 in Bismarck, North Dakota, and built their life around family and hard work.

I have two older brothers, Vince and Jay. Vince was born in 1960 in Germany when my father was stationed there, and Jay was born in 1961 in Bismarck, North Dakota. Growing up, the three of us spent a lot of time together, especially outdoors. I remember long winters, playing in the snow, and summers where we were constantly outside riding bikes or exploring.

We lived primarily in North Dakota during my early childhood, and those early years were shaped by a strong sense of community. Neighbors knew each other, and family gatherings were common. One of my earliest memories is sitting in church listening to my mother play the organ. Music was always present in our home.

I attended school in Bismarck and eventually graduated from Bismarck High School in May of 1981. I was not always the most academically focused student, but I valued relationships and the experiences I had during those years. Friends, sports, and just being part of a community were important to me.

After high school, I moved into adulthood and began working various jobs while figuring out what I wanted to do long-term. Over time, I found my path in occupational therapy. I eventually became a licensed occupational therapist and worked primarily in school settings in Las Vegas, New Mexico. That career became a major part of my identity, working with children and families and helping them develop skills to succeed.

On April 13, 1991, I married Louise LaPlante. Louise had a strong family background, with her father William Arsene LaPlante having served in the United States Navy and been a prisoner of war in Japan during World War II. Louise and I had three children together: Gretchen, Amelia, and Cole. Each of them was born in Las Vegas, New Mexico.

Gretchen was born on October 4, 1991. Amelia was born on August 5, 1994. Cole was born on April 10, 2002. Being a father was one of the most meaningful parts of my life. I tried to be present and supportive, although like any family, we had our challenges and periods of difficulty.

Louise and I were married until 2008, when we divorced. That period was difficult and marked a major transition in my life. After some time, I met Melanie Zollner, who would later become my second wife. Melanie was born in Peru on December 20, 1973, and became a college professor. She brought her own family into our lives, including two daughters and eventually grandchildren.

Melanie and I were married on December 22, 2010. Our life together has included blending families, navigating complex relationships, and building something new. Her daughters visit frequently, and their children have become an important part of our daily life, especially in recent years.

Throughout my life, relationships have been both a source of strength and challenge. My relationship with my daughter Gretchen, in particular, has gone through periods of strain. There have been times of distance and difficulty, especially as she moved to Austin, Texas, and went through her own life transitions. At the same time, I have maintained closer relationships with my other children and extended family.

My parents are still living and are now in their mid-80s. Maintaining a connection with them has become increasingly important as they age. I have also stayed connected with my brothers and their families, including my nieces Caitlin and Callie.

Travel has also been a meaningful part of my life. One of the most memorable trips I took was to France in July of 2025. We spent time in Pau and the surrounding region, including the Armagnac countryside. That trip stood out not just for the places we visited, but for the experience of slowing down and appreciating history, culture, and time together.

As I approached retirement, I began to reflect more on the arc of my life. I officially retired on January 1, 2026, after many years of working in occupational therapy. Retirement has shifted my focus toward family, reflection, and documenting experiences.

Financially, retirement includes income from my education retirement system, a public employees system, and Social Security. Planning for that transition was an important part of the later phase of my working life.

Looking back, I see a life shaped by family, work, relationships, and growth through both positive and difficult experiences. If I were to share something with future generations, it would be to value relationships, stay resilient through challenges, and remain open to learning at every stage of life.

Even now, I am still learning how to navigate family dynamics, maintain connections, and find meaning in day-to-day life. That ongoing process of reflection and adjustment is, in many ways, what defines this stage of my life.`,

    messy: `My name is Chris Horne, well Christopher Todd Horne technically. I was born in North Dakota, Williston I think, yeah December 24th 1962. I'm the youngest, third kid, two older brothers Vince and Jay.

My dad Kent worked construction, heavy equipment kind of stuff, and my mom Janice was more focused on home and music. We lived in Bismarck mostly. Winters were brutal.

School wise I graduated Bismarck High, I think 1981. I didn't love school but I got through it.

Career took a while to figure out, I ended up in occupational therapy working in schools in Las Vegas, New Mexico.

I married Louise in 1991, we had three kids Gretchen, Amelia, Cole. That ended in 2008.

Then later I married Melanie in 2010, she's a professor, different life phase.

Family stuff hasn't always been easy especially with Gretchen.

I traveled to France in 2025 which was a highlight.

Retired January 2026.

Main thing I'd say is relationships matter, even when they're complicated.`,

    emotional: `I guess if I start at the beginning, I was born December 24th 1962 in Williston North Dakota. My name is Christopher Todd Horne.

Family was everything, sometimes in good ways and sometimes really hard ways. My parents Kent and Janice built a life around us.

I always remember the music, my mom playing, that feeling of being safe.

My brothers Vince and Jay were there through everything growing up.

I didn't always know what I wanted to do, but eventually I found occupational therapy. Working with kids felt meaningful.

I married Louise in 1991, and we had Gretchen, Amelia, and Cole. Being a father shaped everything.

But things didn't stay stable. The marriage ended in 2008. That was one of the hardest times in my life.

Later I met Melanie. We married in 2010. She brought a different energy, a new phase.

Some relationships are still hard. Especially with Gretchen. That hasn't been easy.

I retired in 2026 and now I spend more time thinking about what it all meant.

If I could say anything, it's that relationships matter, even when they're painful.`,

    fragmented: `Christopher Todd Horne. Born 1962, December 24. Williston North Dakota.

Third child. Two brothers. Vince, Jay.

Parents Kent Horne, Janice Zarr Horne.

Bismarck. Cold winters.

School. Bismarck High. 1981.

Work\u2026 took time. Occupational therapist. Schools. Las Vegas NM.

Marriage. Louise 1991. Kids: Gretchen, Amelia, Cole.

Divorce 2008.

Melanie 2010. Professor.

France 2025.

Retired 2026.

Relationships\u2026 complicated.

Important thing\u2026 stay connected.`,
  };

  /* ── TEST RUN STORAGE ───────────────────────────────────────── */
  let _testRuns = [];       // Array of { id, sample, params, score, catScores, ts, fields }
  let _goldenBaseline = null; // Best run saved as baseline

  /* ── AUTO-SCORING ENGINE ────────────────────────────────────── */

  /**
   * Score extraction results against the 28-field rubric.
   * Reads from state.interviewProjection.fields for the test PID.
   * Returns { total, pct, catScores: { Identity: {hit,max}, ... }, fields: [{id,field,expected,found,match}] }
   */
  function _scoreExtraction() {
    const proj = state.interviewProjection;
    const fields = (proj && proj.fields) || {};

    // Also check profile basics and questionnaire data
    const profile = state.profile || {};
    const basics = profile.basics || {};

    // Build a big text blob of all extracted values for fuzzy matching
    const allValues = Object.entries(fields).map(function (e) {
      var val = e[1];
      return (typeof val === "object" && val !== null) ? (val.value || "") : String(val || "");
    }).join(" ").toLowerCase();

    const profileText = [
      basics.fullName, basics.firstName, basics.lastName, basics.dob,
      basics.birthplace, basics.birthOrder, basics.gender,
    ].filter(Boolean).join(" ").toLowerCase();

    const searchText = (allValues + " " + profileText).toLowerCase();

    const results = [];
    const catScores = {};
    let total = 0;

    for (var i = 0; i < RUBRIC_28.length; i++) {
      var r = RUBRIC_28[i];
      // Initialize category
      if (!catScores[r.cat]) catScores[r.cat] = { hit: 0, max: 0 };
      catScores[r.cat].max++;

      // Fuzzy match: check if key parts of expected value appear in extracted data
      var expectedParts = r.expected.toLowerCase().split(/[,\/\s]+/).filter(function (p) { return p.length > 2; });
      var matchCount = 0;
      for (var j = 0; j < expectedParts.length; j++) {
        if (searchText.indexOf(expectedParts[j]) !== -1) matchCount++;
      }
      var match = expectedParts.length > 0 && (matchCount / expectedParts.length >= 0.5);

      // Find the actual extracted value (best effort)
      var found = _findExtractedValue(r, fields, basics);

      if (match) {
        total++;
        catScores[r.cat].hit++;
      }

      results.push({ id: r.id, field: r.field, cat: r.cat, expected: r.expected, found: found, match: match });
    }

    return {
      total: total,
      max: 28,
      pct: Math.round((total / 28) * 100),
      catScores: catScores,
      fields: results,
    };
  }

  /** Best-effort value finder for a rubric field. */
  function _findExtractedValue(rubric, fields, basics) {
    // Map rubric fields to likely projection paths
    var fieldMap = {
      "Full Name": ["personal.fullName", "personal.firstName"],
      "Date of Birth": ["personal.dob", "personal.dateOfBirth"],
      "Birthplace": ["personal.birthplace", "personal.placeOfBirth"],
      "Birth Order": ["personal.birthOrder"],
      "Gender": ["personal.gender"],
      "Father Name": ["parents[0].firstName", "parents[0].lastName"],
      "Mother Name": ["parents[1].firstName", "parents[1].lastName"],
      "Father Occupation": ["parents[0].occupation"],
      "Mother Role": ["parents[1].occupation"],
      "Sibling Names": ["siblings[0].firstName", "siblings[1].firstName"],
      "Sibling Count": [],
      "School Name": ["education.schoolName", "education[0].schoolName"],
      "Graduation Year": ["education.graduationYear", "education[0].graduationYear"],
      "Profession": ["career.profession", "career[0].profession"],
      "Work Setting": ["career.setting", "career[0].setting"],
      "Work Location": ["career.location", "career[0].location"],
      "First Spouse": ["spouse[0].firstName", "spouse.firstName"],
      "Second Spouse": ["spouse[1].firstName"],
      "Marriage Dates": ["spouse[0].marriageDate", "spouse[1].marriageDate"],
      "Divorce": ["spouse[0].divorceDate"],
      "Children Names": ["children[0].firstName", "children[1].firstName", "children[2].firstName"],
      "Children Count": [],
      "Major Travel": ["lifeEvents.travel"],
      "Retirement": ["lifeEvents.retirement"],
      "Residence Context": ["personal.residence"],
      "Life Lesson": ["narrative.lifelesson"],
      "Personal Challenge": ["narrative.challenge"],
      "Theme": ["narrative.theme"],
    };

    var paths = fieldMap[rubric.field] || [];
    var found = [];
    for (var i = 0; i < paths.length; i++) {
      var entry = fields[paths[i]];
      if (entry) {
        var val = (typeof entry === "object" && entry !== null) ? entry.value : entry;
        if (val) found.push(val);
      }
    }

    // Also check profile basics
    if (rubric.field === "Full Name" && basics.fullName) found.push(basics.fullName);
    if (rubric.field === "Date of Birth" && basics.dob) found.push(basics.dob);
    if (rubric.field === "Birthplace" && basics.birthplace) found.push(basics.birthplace);

    return found.length > 0 ? found.join("; ") : "—";
  }

  /* ── RUN TEST ───────────────────────────────────────────────── */

  /**
   * Run a test narrator sample through the system.
   * Injects the sample text as a user message and lets Hornelore process it.
   */
  function runTestNarrator(sampleKey) {
    var text = SAMPLES[sampleKey || "clean"];
    if (!text) { alert("Unknown sample: " + sampleKey); return; }

    var params = Object.assign({}, window._lv10dLlmParams || { temperature: 0.7, max_new_tokens: 512 });
    var ctxWindow = document.getElementById("lv10dLlmCtxWindow");
    if (ctxWindow) params.context_window = Number(ctxWindow.value);

    console.log("[WO-10H] Running test narrator: " + sampleKey + " with params:", params);

    // Inject sample text into chat input and send
    var chatInput = document.getElementById("chatInput");
    if (chatInput) {
      chatInput.value = text;
      chatInput.dispatchEvent(new Event("input"));
    }

    // Send after a brief delay to let UI update
    setTimeout(function () {
      if (typeof sendUserMessage === "function") sendUserMessage();

      // Score after extraction delay (give LLM + extraction 15s to complete)
      setTimeout(function () {
        var score = _scoreExtraction();
        var run = {
          id: "run_" + Date.now(),
          sample: sampleKey,
          params: params,
          score: score,
          ts: new Date().toISOString(),
        };
        _testRuns.push(run);
        _renderScorecard(run);
        _renderComparisonTable();
        console.log("[WO-10H] Test run complete:", JSON.stringify(run.score));
      }, 15000);
    }, 500);
  }
  window.lv10hRunTest = runTestNarrator;

  /** Repeat the last test with current settings. */
  function repeatLastTest() {
    if (_testRuns.length === 0) { alert("No previous test to repeat. Run a test first."); return; }
    var last = _testRuns[_testRuns.length - 1];
    clearTestData(function () { runTestNarrator(last.sample); });
  }
  window.lv10hRepeatTest = repeatLastTest;

  /* ── SAFE CLEANUP ───────────────────────────────────────────── */

  function clearTestData(callback) {
    console.log("[WO-10H] Clearing test data...");

    // Clear projection state
    if (state.interviewProjection) {
      state.interviewProjection._pendingExtraction = null;
      // Only clear if we're on the test PID
      if (state.person_id === TEST_PID || !state.person_id) {
        state.interviewProjection.fields = {};
        state.interviewProjection.pendingSuggestions = [];
        state.interviewProjection.syncLog = [];
      }
    }

    // Clear any test localStorage keys (only test PID)
    try {
      localStorage.removeItem("lorevox_proj_draft_" + TEST_PID);
      localStorage.removeItem("lorevox_qq_draft_" + TEST_PID);
      localStorage.removeItem("lorevox_ft_draft_" + TEST_PID);
      localStorage.removeItem("lorevox_lt_draft_" + TEST_PID);
      localStorage.removeItem("lorevox_sources_draft_" + TEST_PID);
      localStorage.removeItem("lorevox.spine." + TEST_PID);
      localStorage.removeItem("lorevox_offline_profile_" + TEST_PID);
    } catch (_) {}

    // Clear test-run diagnostics (keep comparison data)
    var scorecardEl = document.getElementById("lv10hScorecardContent");
    if (scorecardEl) scorecardEl.innerHTML = '<div style="color:#64748b;font-size:12px;">Test data cleared. Ready for next run.</div>';

    console.log("[WO-10H] Test data cleared — real narrator data untouched.");
    if (typeof callback === "function") setTimeout(callback, 200);
  }
  window.lv10hClearTest = clearTestData;

  /* ── GOLDEN BASELINE ────────────────────────────────────────── */

  function saveAsGolden() {
    if (_testRuns.length === 0) { alert("No test runs to save as baseline."); return; }
    _goldenBaseline = _testRuns[_testRuns.length - 1];
    console.log("[WO-10H] Golden baseline saved:", _goldenBaseline.score.total + "/28 (" + _goldenBaseline.score.pct + "%)");
    _renderComparisonTable();
    alert("Golden baseline saved: " + _goldenBaseline.score.total + "/28 (" + _goldenBaseline.score.pct + "%)");
  }
  window.lv10hSaveGolden = saveAsGolden;

  /* ── SCORECARD RENDERING ────────────────────────────────────── */

  function _renderScorecard(run) {
    var el = document.getElementById("lv10hScorecardContent");
    if (!el) return;

    var score = run.score;
    var tierColor = score.total >= 24 ? "#4ade80" : (score.total >= 18 ? "#fbbf24" : (score.total >= 12 ? "#fb923c" : "#f87171"));

    var html = '<div style="font-size:24px;font-weight:700;color:' + tierColor + ';">' + score.total + ' / ' + score.max + ' (' + score.pct + '%)</div>';
    html += '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">Sample: ' + run.sample + ' | ' + run.ts + '</div>';

    // Category breakdown
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">';
    var cats = Object.keys(score.catScores);
    for (var i = 0; i < cats.length; i++) {
      var c = score.catScores[cats[i]];
      var cColor = c.hit === c.max ? "#4ade80" : (c.hit > 0 ? "#fbbf24" : "#f87171");
      html += '<div style="font-size:11px;"><span style="color:' + cColor + ';">' + c.hit + '/' + c.max + '</span> ' + cats[i] + '</div>';
    }
    html += '</div>';

    // Field details (collapsed by default)
    html += '<details style="font-size:11px;"><summary style="cursor:pointer;color:#94a3b8;">Field details</summary>';
    html += '<div style="margin-top:4px;">';
    for (var j = 0; j < score.fields.length; j++) {
      var f = score.fields[j];
      var fIcon = f.match ? '<span style="color:#4ade80;">+</span>' : '<span style="color:#f87171;">-</span>';
      html += '<div>' + fIcon + ' ' + f.field + ': <span style="color:#475569;">' + f.found + '</span></div>';
    }
    html += '</div></details>';

    // Params used
    html += '<div style="font-size:11px;color:#64748b;margin-top:6px;">Temp=' + (run.params.temperature || "?") + ' Max=' + (run.params.max_new_tokens || "?") + (run.params.context_window ? ' Ctx=' + run.params.context_window : '') + '</div>';

    el.innerHTML = html;
  }

  /* ── COMPARISON TABLE ───────────────────────────────────────── */

  function _renderComparisonTable() {
    var el = document.getElementById("lv10hComparisonContent");
    if (!el) return;

    if (_testRuns.length === 0) {
      el.innerHTML = '<div style="color:#64748b;font-size:12px;">No test runs yet.</div>';
      return;
    }

    var html = '<table style="width:100%;font-size:11px;border-collapse:collapse;">';
    html += '<tr style="color:#a5b4fc;border-bottom:1px solid #334155;"><th>Sample</th><th>Score</th><th>%</th><th>Temp</th><th>MaxTok</th><th>Time</th></tr>';

    for (var i = _testRuns.length - 1; i >= Math.max(0, _testRuns.length - 10); i--) {
      var r = _testRuns[i];
      var isGolden = _goldenBaseline && _goldenBaseline.id === r.id;
      var rowColor = isGolden ? "color:#fbbf24;" : "";
      var tierColor = r.score.total >= 24 ? "#4ade80" : (r.score.total >= 18 ? "#fbbf24" : "#f87171");
      html += '<tr style="border-bottom:1px solid #1e293b;' + rowColor + '">';
      html += '<td style="padding:2px 4px;">' + r.sample + (isGolden ? ' *' : '') + '</td>';
      html += '<td style="padding:2px 4px;color:' + tierColor + ';">' + r.score.total + '/28</td>';
      html += '<td style="padding:2px 4px;">' + r.score.pct + '%</td>';
      html += '<td style="padding:2px 4px;">' + (r.params.temperature || "?") + '</td>';
      html += '<td style="padding:2px 4px;">' + (r.params.max_new_tokens || "?") + '</td>';
      html += '<td style="padding:2px 4px;">' + r.ts.split("T")[1].split(".")[0] + '</td>';
      html += '</tr>';
    }
    html += '</table>';

    if (_goldenBaseline) {
      html += '<div style="font-size:11px;color:#fbbf24;margin-top:4px;">* = Golden Baseline (' + _goldenBaseline.score.total + '/28)</div>';
    }

    el.innerHTML = html;
  }

  /* ── EXPOSE PUBLIC API ──────────────────────────────────────── */
  window.LV10H_TestHarness = {
    runTest:      runTestNarrator,
    repeatTest:   repeatLastTest,
    clearTest:    clearTestData,
    saveGolden:   saveAsGolden,
    getScore:     _scoreExtraction,
    getRuns:      function () { return _testRuns; },
    getGolden:    function () { return _goldenBaseline; },
    SAMPLES:      SAMPLES,
    RUBRIC:       RUBRIC_28,
    EXPECTATIONS: SAMPLE_EXPECTATIONS,
    TEST_PID:     TEST_PID,
  };

})();
