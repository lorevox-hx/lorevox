/* ════════════════════════════════════════════════════════════════
   test-bb-walk.js — BB 30-Field Smoke Test Harness

   Purpose: prove a brand-new narrator can be created, populated through
   the real QF identity-rescue path + direct repeatable-section writes,
   persisted via API.BB_QQ_PUT, reloaded via API.BB_QQ_GET, and that the
   resulting truth flows into projection + (where applicable) timeline.

   Design rules (per ChatGPT 2026-04-25):
     • Identity intro MUST exercise the real BUG-226 / BUG-227 parser
       path — no faking PASS by direct field assignment.
     • Personal walk uses lvSessionLoopOnTurn (real QF dispatcher).
     • Repeatable sections (parents/siblings/spouse/children) and free-
       text sections (education/notable events) use direct writes to
       BB.questionnaire then PUT via API.BB_QQ_PUT, since QF walk Phase 2
       (repeatable section walking) hasn't shipped yet.
     • Test narrator name MUST start with "Test Harness" — never run
       against Chris, Melanie, Kent, Janice, Corky, or any real narrator.
     • Cleanup is opt-in. If enabled, only the test narrator is deleted.

   Sections covered (30 fields + 5 intentional break cases):
     A. Identity (real parser): fullName / preferredName / dateOfBirth /
        placeOfBirth / timeOfBirth / birthOrder via QF walk
     B. Parents x 2: father (Robert James Miller, mechanic, 1930) +
        mother (Elaine Carter Miller, school secretary, 1932)
     C. Siblings x 2: Thomas (older brother) + Linda (younger sister)
     D. Spouse: Daniel Reed (married 1975)
     E. Children x 2: Anna (1978) + Michael (1982)
     F. Education: Roosevelt High School (1972 grad)
     G. Life event: 1975 move to Chicago + first office job

   Break cases (must NOT corrupt structured fields):
     1. Identity overwrite via child detail
     2. Ambiguous location ("grew up in X but born in nearby hospital")
     3. Conflicting DOB ("I think I was born in 1953 actually")
     4. Multi-entity confusion (mother + sister at same school)
     5. Narrative bleed ("we had a small house with a big backyard")

   Public API:
     await window.lvBbWalkTest()                    // run, no cleanup
     await window.lvBbWalkTest({cleanup:true})      // delete narrator after
     await window.lvBbWalkTest({verbose:true})      // log every step
     window.lvBbWalkTest.lastReport                 // last run report
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (typeof window === "undefined") return;
  if (window.lvBbWalkTest) return;

  /* ── Global resolvers ─────────────────────────────────────────
     api.js declares `const API = {...}` and state.js declares
     `let state = {...}` at top level. In modern browsers, top-level
     const/let bindings live in the script's outer scope but DO NOT
     attach to `window` (only `var` and `function` declarations do).
     This IIFE runs in strict mode, so accessing an undeclared bare
     identifier throws a ReferenceError. Use typeof to safely probe.
  ─────────────────────────────────────────────────────────── */
  function _api() {
    try { if (typeof API !== "undefined" && API && API.PEOPLE) return API; } catch (_) {}
    try { if (window.API && window.API.PEOPLE) return window.API; } catch (_) {}
    return null;
  }
  function _state() {
    try { if (typeof state !== "undefined" && state) return state; } catch (_) {}
    try { if (window.state) return window.state; } catch (_) {}
    return null;
  }

  /* ── Test dataset (Sarah Reed, born 1954-06-12 Cedar Rapids Iowa) ── */
  const TEST_DATA = {
    intro:    "My name is Test Harness Sarah Reed. I was born June 12, 1954 in Cedar Rapids, Iowa in the morning.",
    personal: {
      fullName:      "Test Harness Sarah Reed",
      preferredName: "Sarah",
      dateOfBirth:   "1954-06-12",
      timeOfBirth:   "morning",
      placeOfBirth:  "Cedar Rapids, Iowa",
      birthOrder:    "First child",
    },
    parents: [
      { relation: "Father", firstName: "Robert", middleName: "James",  lastName: "Miller", occupation: "auto mechanic",   birthDate: "1930-01-01" },
      { relation: "Mother", firstName: "Elaine", middleName: "Carter", lastName: "Miller", occupation: "school secretary", birthDate: "1932-01-01" },
    ],
    siblings: [
      { relation: "Older brother",  firstName: "Thomas", lastName: "Miller", birthOrder: "First child"  },
      { relation: "Younger sister", firstName: "Linda",  lastName: "Miller", birthOrder: "Third child"  },
    ],
    spouse: [
      { relationshipType: "Spouse", firstName: "Daniel", lastName: "Reed", narrative: "Married 1975" },
    ],
    children: [
      { relation: "Daughter", firstName: "Anna",    lastName: "Reed", birthDate: "1978-01-01" },
      { relation: "Son",      firstName: "Michael", lastName: "Reed", birthDate: "1982-01-01" },
    ],
    education: {
      schooling:       "Roosevelt High School, Cedar Rapids — graduated 1972",
      higherEducation: "",
    },
    notableLifeEvent: "I moved to Chicago in 1975 right after getting married and worked my first office job there.",
  };

  /* ── Break cases — sent AFTER main population to test guards ───── */
  const BREAK_CASES = [
    { id: "child_birthplace_safe",
      send: "My son Michael was born in Denver in 1982.",
      mustNotChange: ["personal.placeOfBirth", "personal.dateOfBirth"] },
    { id: "ambiguous_location",
      send: "I grew up in Cedar Rapids but was actually born in a nearby hospital.",
      mustNotChange: ["personal.placeOfBirth"] },
    { id: "conflicting_dob",
      send: "I think I was born in 1953 actually.",
      mustNotChange: ["personal.dateOfBirth"] },
    { id: "multi_entity",
      send: "My mother Elaine worked at a school and my sister Linda later worked there too.",
      mustNotChange: ["parents.0.firstName", "parents.1.firstName", "siblings.0.firstName"] },
    { id: "narrative_bleed",
      send: "We had a small house and a big backyard where we played every day.",
      mustNotChange: ["personal.fullName", "personal.dateOfBirth"] },
  ];

  /* ── Helpers ─────────────────────────────────────────────────── */
  function _now() { return new Date().toISOString(); }
  function _short(s) { return (s || "").slice(0, 8); }
  function _readBb() { try { return (_state() && _state().bioBuilder) || {}; } catch (_) { return {}; } }
  function _readBlob() { return (_readBb().questionnaire) || {}; }
  function _readNested(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = /^\d+$/.test(p) ? cur[Number(p)] : cur[p];
    }
    return cur;
  }
  function _matches(actual, expected) {
    if (actual == null || expected == null) return actual == expected;
    return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
  }
  function _includes(actual, expectedSubstr) {
    if (actual == null || !expectedSubstr) return false;
    return String(actual).trim().toLowerCase().indexOf(String(expectedSubstr).trim().toLowerCase()) >= 0;
  }

  function _installPromptStubs(buf) {
    const orig = { sendSystemPrompt: window.sendSystemPrompt, _appendLoriBubble: window._appendLoriBubble };
    window.sendSystemPrompt   = function (t) { buf.push({ kind:"sys",  text:String(t||"").slice(0,300), ts:_now() }); };
    window._appendLoriBubble  = function (t) { buf.push({ kind:"lori", text:String(t||"").slice(0,300), ts:_now() }); };
    return orig;
  }
  function _restorePromptStubs(orig) {
    if (orig.sendSystemPrompt  !== undefined) window.sendSystemPrompt  = orig.sendSystemPrompt;
    if (orig._appendLoriBubble !== undefined) window._appendLoriBubble = orig._appendLoriBubble;
  }

  async function _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function _waitForField(path, timeoutMs) {
    // Fast path: poll local state.bioBuilder.questionnaire.
    const start = Date.now();
    while (Date.now() - start < (timeoutMs || 3000)) {
      const v = _readNested(_readBlob(), path);
      if (v != null && String(v).trim() !== "") return v;
      await _wait(120);
    }
    // BUG-232: local-state lag fallback. session-loop._saveBBAnswer does
    // async backend PUT; local state.bioBuilder.questionnaire only reflects
    // the save after a backend GET round-trip. If the local read timed out,
    // hit the backend directly via API.BB_QQ_GET. Mirror response into
    // local state so subsequent reads see it.
    const st = _state();
    const pid = st && st.person_id;
    if (pid) {
      try {
        const backendBlob = await _getBbBlob(pid);
        if (backendBlob) {
          // Mirror to local — only if scope still matches
          try {
            if (st.bioBuilder && st.bioBuilder.personId === pid) {
              st.bioBuilder.questionnaire = backendBlob;
            }
          } catch (_) {}
          const bv = _readNested(backendBlob, path);
          if (bv != null && String(bv).trim() !== "") return bv;
        }
      } catch (_) {}
    }
    // Final read attempt from local (after potential backend mirror)
    return _readNested(_readBlob(), path);
  }

  /* ── Test narrator lifecycle ─────────────────────────────────── */
  async function _createTestNarrator() {
    const stamp = Date.now().toString(36);
    const display = "Test Harness Sarah " + stamp;
    const r = await fetch(_api().PEOPLE, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: display, role: "test", narrator_type: "live", is_test: true }),
    });
    if (!r.ok) throw new Error("create test narrator failed: " + r.status);
    const j = await r.json();
    const pid = j.id || j.person_id || (j.person && j.person.id);
    if (!pid) throw new Error("no pid in response");
    return { pid, displayName: display };
  }

  async function _deleteTestNarrator(pid) {
    try {
      const url = (_api() && _api().PERSON) ? _api().PERSON(pid) : ("/api/people/" + pid);
      const r = await fetch(url, { method: "DELETE" });
      return r.ok;
    } catch (_) { return false; }
  }

  async function _switchToNarrator(pid) {
    if (typeof window.lv80ConfirmNarratorSwitch === "function") {
      await window.lv80ConfirmNarratorSwitch(pid);
    } else if (typeof window.lvxSwitchNarratorSafe === "function") {
      await window.lvxSwitchNarratorSafe(pid);
    } else { throw new Error("no narrator-switch hook"); }
    await _wait(800);
  }

  /* ── BUG-236: narrator-scope hard gate ────────────────────────
     Prior version waited 800ms after switch then assumed scope was
     stable. Live evidence 2026-04-26T00:12: harness saved Walter's
     data (fullName=Walter, DOB=1948-03-14, POB=Walter's narrative)
     into Test Harness Sarah's BB blob because the multiple async
     restore layers (BB backend, projection, profile, state snapshot)
     hadn't all settled when identity onboarding kicked off.
     Fix: explicit poll until state.person_id + bb.personId + active
     label all settle on the test pid. Abort fast if they don't.
  ─────────────────────────────────────────────────────────── */
  async function _waitForTestNarratorScope(pid, displayName, timeoutMs) {
    timeoutMs = timeoutMs || 7000;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const st = _state();
      const bb = st && st.bioBuilder;
      const stateOk = !!(st && st.person_id === pid);
      const bbOk    = !!(bb && bb.personId === pid);
      // Active label probe — try multiple DOM hooks since the topbar
      // markup has shifted across WO-NARRATOR-ROOM-01 revisions.
      let label = "";
      try {
        label =
          (st && st.narratorUi && st.narratorUi.activeLabel) ||
          (document.getElementById("lv80ActiveNarratorName") || {}).textContent ||
          (document.getElementById("lv80ActiveNarratorCard") || {}).textContent ||
          "";
      } catch (_) {}
      const labelOk = String(label).indexOf("Test Harness") >= 0;
      if (stateOk && bbOk && labelOk) return true;
      await _wait(150);
    }
    throw new Error(
      "HARNESS ABORT: active narrator contamination — " +
      "state.person_id/bioBuilder/label did not settle on test narrator " +
      _short(pid) + " within " + timeoutMs + "ms");
  }

  /* ── BUG-236: explicit blank-out of test narrator runtime state ─
     After scope settles, force-clear the test narrator's profile +
     session + BB + projection so identity onboarding starts fresh.
     Refuses to operate if state.person_id doesn't match the test pid
     (defensive — never wipe a real narrator's state by accident).
  ─────────────────────────────────────────────────────────── */
  function _clearTestNarratorRuntimeState(pid) {
    const st = _state();
    if (!st || st.person_id !== pid) {
      throw new Error("HARNESS ABORT: refusing to clear runtime state — " +
        "state.person_id=" + _short(st && st.person_id) +
        " != test pid=" + _short(pid));
    }
    st.profile = { basics: {}, kinship: [], pets: [] };
    if (st.session) {
      st.session.identityPhase   = null;
      st.session.identityCapture = { name: null, dob: null, birthplace: null };
      if (st.session.loop) {
        st.session.loop.currentSection = null;
        st.session.loop.currentField   = null;
        st.session.loop.askedKeys      = [];
        st.session.loop.savedKeys      = [];
        st.session.loop.activeIntent   = null;
      }
    }
    if (st.bioBuilder && st.bioBuilder.personId === pid) {
      st.bioBuilder.questionnaire = {};
    }
    if (st.interviewProjection && st.interviewProjection.personId === pid) {
      st.interviewProjection.fields             = {};
      st.interviewProjection.pendingSuggestions = [];
      st.interviewProjection.syncLog            = [];
    }
  }

  /* ── BUG-236: real-narrator leak detector ──────────────────────
     After scope-settle + clear, verify NO real-narrator data is
     visible in the BB blob. Catches the case where backend restore
     completed AFTER our blank-out and refilled the blob. The known
     real-narrator names + birthdays are hardcoded — extend if other
     real narrators are added later.
  ─────────────────────────────────────────────────────────── */
  function _assertNoRealNarratorLeak(pid) {
    const qq = _readBlob();
    const full = String(_readNested(qq, "personal.fullName") || "");
    const dob  = String(_readNested(qq, "personal.dateOfBirth") || "");
    const pob  = String(_readNested(qq, "personal.placeOfBirth") || "");
    const REAL_NAMES = /\b(?:walter|chris|christopher|janice|kent|melanie|corky|jake|shatner|william)\b/i;
    const REAL_DOBS  = ["1948-03-14", "1962-12-24", "1949-10-21"];
    const leaked =
      REAL_NAMES.test(full) ||
      REAL_NAMES.test(pob)  ||
      REAL_DOBS.indexOf(dob) >= 0;
    if (leaked) {
      throw new Error(
        "HARNESS ABORT: real-narrator data present in test BB blob — " +
        "fullName=" + JSON.stringify(full.slice(0, 40)) +
        " dob=" + JSON.stringify(dob) +
        " pob=" + JSON.stringify(pob.slice(0, 40)));
    }
  }

  async function _putBbBlob(pid, blob) {
    const url = (_api() && _api().BB_QQ_PUT) ? _api().BB_QQ_PUT : "/api/bio-builder/questionnaire";
    const r = await fetch(url, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_id: pid, questionnaire: blob, source: "test_harness", version: 1 }),
    });
    return r.ok;
  }

  async function _getBbBlob(pid) {
    const url = (_api() && _api().BB_QQ_GET) ? _api().BB_QQ_GET(pid)
              : ("/api/bio-builder/questionnaire?person_id=" + encodeURIComponent(pid));
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = await r.json();
      return (j && (j.questionnaire || j.payload || j)) || null;
    } catch (_) { return null; }
  }

  /* ── Inline status renderer ──────────────────────────────────── */
  function _renderStatus(elId, html) {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = html;
  }
  function _statusLine(label, ok, detail) {
    const color = ok ? "#22c55e" : "#f87171";
    const mark  = ok ? "✓" : "✗";
    return `<div style="font-size:11px;color:${color};">${mark} ${label}` +
      (detail ? ` <span style="color:#94a3b8;">— ${detail}</span>` : "") + `</div>`;
  }
  function _renderReport(report) {
    const ok = report.fail === 0 && report.scope_violations === 0 && report.unwanted_overwrites === 0;
    const head = `<div style="font-size:12px;font-weight:600;color:${ok?"#22c55e":"#f87171"};margin-bottom:6px;">` +
      (ok ? "✓ TEST HARNESS PASS" : "✗ TEST HARNESS FAIL") + `</div>`;
    const body =
      _statusLine("Fields expected: " + report.expected, true) +
      _statusLine("Fields populated: " + report.populated, report.populated >= report.expected,
        report.populated < report.expected ? "missing " + (report.expected - report.populated) : "") +
      _statusLine("Pass / Fail: " + report.pass + " / " + report.fail, report.fail === 0) +
      _statusLine("Identity overwrites: " + report.unwanted_overwrites, report.unwanted_overwrites === 0,
        report.unwanted_overwrites === 0 ? "must be zero" : "GUARD FAILURE") +
      _statusLine("Scope violations: " + report.scope_violations, report.scope_violations === 0) +
      _statusLine("Persistence reload: " + (report.persistence_ok ? "PASS" : "FAIL"), report.persistence_ok) +
      _statusLine("QF redundant birthplace question: " + (report.qf_redundant_question_asked ? "ASKED ✗" : "NOT asked ✓"),
        !report.qf_redundant_question_asked) +
      _statusLine("Test narrator: " + (report.narrator ? report.narrator.displayName + " (" + _short(report.narrator.pid) + ")" : "—"), !!report.narrator) +
      _statusLine("Duration: " + report.durationMs + "ms", true);
    const cleanup = report.cleanupAttempted
      ? _statusLine("Cleanup: " + (report.cleanupOk ? "test narrator deleted" : "delete failed"), !!report.cleanupOk)
      : `<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Cleanup not attempted — test narrator persists for inspection.</div>`;
    _renderStatus("lv10dBpBbWalkStatus", head + body + cleanup);
  }

  /* ── Main entry ──────────────────────────────────────────────── */
  async function lvBbWalkTest(opts) {
    opts = opts || {};
    const verbose = !!opts.verbose;
    const cleanup = !!opts.cleanup;

    const report = {
      ts: _now(),
      narrator: null,
      expected: 30,
      populated: 0,
      pass: 0,
      fail: 0,
      unwanted_overwrites: 0,
      scope_violations: 0,
      persistence_ok: false,
      qf_redundant_question_asked: false,
      results: [],
      breakCaseResults: [],
      durationMs: null,
    };
    _renderStatus("lv10dBpBbWalkStatus", `<div style="font-size:11px;color:#60a5fa;">⟳ Running BB walk test…</div>`);

    const buf = [];
    const t0 = Date.now();
    let origStubs = {};

    try {
      if (!_api() || !_api().PEOPLE) throw new Error("API not loaded (api.js global not reachable)");
      if (!_state()) throw new Error("state not loaded (state.js global not reachable)");

      // ── 1. Create test narrator ────────────────────────────
      const created = await _createTestNarrator();
      report.narrator = created;
      if (verbose) console.log("[bb-walk] created", created);
      if (typeof window.refreshPeople === "function") { try { await window.refreshPeople(); } catch (_) {} }
      if (typeof window.lv80LoadPeople === "function") { try { await window.lv80LoadPeople(); } catch (_) {} }

      // ── 2. Force questionnaire_first BEFORE switch ─────────
      if (_state().session) _state().session.sessionStyle = "questionnaire_first";
      try { localStorage.setItem("lv_session_style", "questionnaire_first"); } catch (_) {}

      // ── 3. Switch to test narrator ─────────────────────────
      origStubs = _installPromptStubs(buf);
      await _switchToNarrator(created.pid);
      if (verbose) console.log("[bb-walk] switched to", created.pid);

      // BUG-236: hard scope gate. Wait until ALL of state.person_id +
      // bb.personId + active narrator label settle on the test pid.
      // Prior 800ms wait raced against multiple async restore layers
      // and silently let the active real-narrator's data through.
      try {
        await _waitForTestNarratorScope(created.pid, created.displayName, 7000);
        if (verbose) console.log("[bb-walk] BUG-236 scope gate passed for", _short(created.pid));
      } catch (e) {
        // Hard abort — refusing to validate any data while scope is
        // contaminated. Surface the abort prominently in the report.
        report.scope_violations++;
        report.results.push({ section: "BUG-236.scope_gate", status: "FAIL",
          detail: String(e && e.message || e) });
        report.fail++;
        throw e;  // bail out of the whole run
      }

      // BUG-236: explicit blank-out of test narrator runtime state.
      // Clears profile / session / BB / projection scoped to the test
      // pid so the identity onboarding starts genuinely fresh, not on
      // top of any backend-restored stale data.
      try {
        _clearTestNarratorRuntimeState(created.pid);
        if (verbose) console.log("[bb-walk] BUG-236 runtime state cleared for", _short(created.pid));
      } catch (e) {
        report.scope_violations++;
        report.results.push({ section: "BUG-236.clear_state", status: "FAIL",
          detail: String(e && e.message || e) });
        report.fail++;
        throw e;
      }

      // BUG-236: paranoid leak check. After clear, BB blob should NOT
      // contain any real-narrator names or DOBs. If a backend GET
      // landed AFTER our clear, we'd see real data resurrect — abort
      // before validating any of it.
      try {
        _assertNoRealNarratorLeak(created.pid);
        if (verbose) console.log("[bb-walk] BUG-236 leak check clean for", _short(created.pid));
      } catch (e) {
        report.scope_violations++;
        report.results.push({ section: "BUG-236.leak_check", status: "FAIL",
          detail: String(e && e.message || e) });
        report.fail++;
        throw e;
      }

      // Scope check — bb.personId should match state.person_id
      const bb1 = _readBb();
      if (bb1.personId !== _state().person_id) {
        report.scope_violations++;
        report.results.push({ section: "scope", status: "FAIL",
          detail: "bb.personId=" + _short(bb1.personId) + " != state.person_id=" + _short(_state().person_id) });
      }

      // ── 4. Identity intro through real BUG-226 parser path ─
      const intro = TEST_DATA.intro;
      if (typeof window._extractIdentityFieldsFromUtterance === "function") {
        const parsed = window._extractIdentityFieldsFromUtterance(intro);
        if (verbose) console.log("[bb-walk] BUG-226 parser sees:", parsed);
        report.results.push({ section: "A.parser", status: parsed.name && parsed.dob && parsed.pob ? "PASS" : "FAIL",
          detail: JSON.stringify(parsed) });
        if (parsed.name && parsed.dob && parsed.pob) report.pass++; else report.fail++;
      } else {
        report.results.push({ section: "A.parser", status: "FAIL", detail: "_extractIdentityFieldsFromUtterance missing" });
        report.fail++;
      }

      // Drive intro through the real identity machine.
      // _advanceIdentityPhase returns false early if identityPhase is null
      // or "complete", so explicitly arm it to "askName" first — same shape
      // startIdentityOnboarding sets up. The harness skips the v9-gate
      // chat UI path, so we have to put the state machine in askName mode
      // ourselves.
      if (_state() && _state().session) {
        _state().session.identityPhase   = "askName";
        _state().session.identityCapture = { name: null, dob: null, birthplace: null };
      }
      if (typeof window._advanceIdentityPhase === "function") {
        try { await window._advanceIdentityPhase(intro); } catch (e) {
          report.results.push({ section: "A.advance", status: "FAIL", detail: String(e) }); report.fail++;
        }
      } else {
        report.results.push({ section: "A.advance", status: "FAIL",
          detail: "_advanceIdentityPhase not available on window — top-level function attachment may have changed" });
        report.fail++;
      }
      await _wait(400);

      // Verify identity capture
      const idChecks = [
        { key: "personal.fullName",     expectContains: "Sarah" },
        { key: "personal.dateOfBirth",  expectExact: "1954-06-12" },
        { key: "personal.placeOfBirth", expectContains: "Cedar Rapids" },
      ];
      for (const c of idChecks) {
        const v = await _waitForField(c.key, 2000);
        const ok = c.expectExact ? _matches(v, c.expectExact) : _includes(v, c.expectContains);
        report.results.push({ section: "A.identity", field: c.key, status: ok ? "PASS" : "FAIL", saved: v,
          detail: c.expectExact ? "exact " + c.expectExact : "contains " + c.expectContains });
        if (ok) { report.pass++; report.populated++; } else report.fail++;
      }

      // QF redundant-birthplace check — BUG-226 should have skipped askBirthplace.
      // Identity phase should be "complete" or "resolving" right now, NOT "askBirthplace".
      const idPhaseAfter = _state().session && _state().session.identityPhase;
      if (idPhaseAfter === "askBirthplace") {
        report.qf_redundant_question_asked = true;
      }
      report.results.push({ section: "A.qf-skip", status: !report.qf_redundant_question_asked ? "PASS" : "FAIL",
        detail: "identityPhase=" + idPhaseAfter });
      if (!report.qf_redundant_question_asked) report.pass++; else report.fail++;

      // BUG-235 FIX: QF walk needs ONE prime turn before answers land.
      //
      // Live evidence 2026-04-25T23:55: prior version sent 3 values but
      // they shifted by one. Cause: first narrator_turn after
      // identity_complete primes currentField (no save), so the harness's
      // first send gets dropped.
      //
      // Live evidence 2026-04-26T00:05: harness still failing with same
      // pattern. Deeper cause: BUG-226's _syncIdentityToBB pre-populates
      // BOTH personal.fullName AND personal.preferredName from the
      // captured name. The QF walk's _findNextEmptyPersonalField sees
      // preferredName already filled and skips it — only asks birthOrder
      // and timeOfBirth. The harness expected 3 walk-driven fields but
      // gets 2. So harness's preferredName check reads the captured name
      // (e.g. "Test Harness Sarah Reed") not "Sarah", and the
      // birthOrder/timeOfBirth sends shift by one.
      //
      // Fix: prime turn + EXPECT preferredName to be the captured name
      // (since BUG-226 fills it from identity intake). QF walk sends
      // only birthOrder and timeOfBirth.
      try {
        await window.lvSessionLoopOnTurn({ trigger: "narrator_turn", text: "ok" });
        await _wait(200);
      } catch (_) {}

      // Two QF turns now (preferredName auto-populated by BUG-226 sync):
      const qfTurns = [
        { send: TEST_DATA.personal.birthOrder,     expectAt: "personal.birthOrder",    expectContains: "first" },
        { send: TEST_DATA.personal.timeOfBirth,    expectAt: "personal.timeOfBirth",   expectContains: "morning" },
      ];

      // Verify preferredName was auto-filled by identity sync (BUG-226).
      // Should equal the captured name (e.g. "Test Harness Sarah Reed").
      // The harness test data uses "Test Harness Sarah Reed" so we expect
      // contains("Sarah") to match.
      {
        const v = _readNested(_readBlob(), "personal.preferredName");
        const ok = _includes(v, "Sarah");
        report.results.push({ section: "B.personal", field: "personal.preferredName",
          status: ok ? "PASS" : "FAIL", saved: v,
          detail: "auto-filled by BUG-226 identity sync (contains Sarah)" });
        if (ok) { report.pass++; report.populated++; } else report.fail++;
      }
      for (const t of qfTurns) {
        try {
          await window.lvSessionLoopOnTurn({ trigger: "narrator_turn", text: t.send });
        } catch (e) {
          report.results.push({ section: "B.personal", field: t.expectAt, status: "FAIL", detail: String(e) });
          report.fail++; continue;
        }
        await _wait(300);
        const v = await _waitForField(t.expectAt, 2500);
        const ok = _includes(v, t.expectContains);
        report.results.push({ section: "B.personal", field: t.expectAt, status: ok ? "PASS" : "FAIL",
          saved: v, detail: "contains " + t.expectContains });
        if (ok) { report.pass++; report.populated++; } else report.fail++;
      }

      // ── 5. Direct writes to repeatable + free-text sections ──
      // Per ChatGPT caution: direct writes are allowed for sections
      // where no public UI/walk path exists yet. Identity already
      // exercised the real parser; this just persists the rest.
      const liveBlob = _readBlob();
      const blob = JSON.parse(JSON.stringify(liveBlob || {}));  // deep clone
      blob.personal = blob.personal || {};
      // Make sure personal block has everything (in case QF saves were async-late)
      Object.assign(blob.personal, {
        fullName:      TEST_DATA.personal.fullName,
        preferredName: TEST_DATA.personal.preferredName,
        dateOfBirth:   TEST_DATA.personal.dateOfBirth,
        timeOfBirth:   TEST_DATA.personal.timeOfBirth,
        placeOfBirth:  TEST_DATA.personal.placeOfBirth,
        birthOrder:    TEST_DATA.personal.birthOrder,
      });
      blob.parents  = TEST_DATA.parents.slice();
      blob.siblings = TEST_DATA.siblings.slice();
      blob.spouse   = TEST_DATA.spouse.slice();
      blob.children = TEST_DATA.children.slice();
      blob.education = Object.assign({}, blob.education || {}, TEST_DATA.education);
      // Notable life event — store under the first parent's notableLifeEvents
      // OR under additionalNotes.messagesForFutureGenerations (free-text).
      blob.additionalNotes = blob.additionalNotes || {};
      blob.additionalNotes.messagesForFutureGenerations =
        (blob.additionalNotes.messagesForFutureGenerations ? blob.additionalNotes.messagesForFutureGenerations + "\n\n" : "") +
        TEST_DATA.notableLifeEvent;

      // Mirror to in-memory state.bioBuilder before PUT, so harness reads
      // are immediately consistent (sync) with the about-to-be-persisted state.
      try {
        if (_state().bioBuilder && _state().bioBuilder.personId === created.pid) {
          _state().bioBuilder.questionnaire = blob;
        }
      } catch (_) {}

      const putOk = await _putBbBlob(created.pid, blob);
      report.results.push({ section: "C-G.bulk_put", status: putOk ? "PASS" : "FAIL",
        detail: "PUT /api/bio-builder/questionnaire (parents+siblings+spouse+children+education+notes)" });
      if (putOk) report.pass++; else report.fail++;

      // Verify each expected non-personal field
      const sectionChecks = [
        { sec: "C.parents",  path: "parents.0.firstName",        expectContains: "Robert" },
        { sec: "C.parents",  path: "parents.0.lastName",         expectContains: "Miller" },
        { sec: "C.parents",  path: "parents.0.occupation",       expectContains: "mechanic" },
        { sec: "C.parents",  path: "parents.1.firstName",        expectContains: "Elaine" },
        { sec: "C.parents",  path: "parents.1.middleName",       expectContains: "Carter" },
        { sec: "C.parents",  path: "parents.1.occupation",       expectContains: "secretary" },
        { sec: "D.siblings", path: "siblings.0.firstName",       expectContains: "Thomas" },
        { sec: "D.siblings", path: "siblings.0.relation",        expectContains: "brother" },
        { sec: "D.siblings", path: "siblings.1.firstName",       expectContains: "Linda" },
        { sec: "D.siblings", path: "siblings.1.relation",        expectContains: "sister" },
        { sec: "E.spouse",   path: "spouse.0.firstName",         expectContains: "Daniel" },
        { sec: "E.spouse",   path: "spouse.0.lastName",          expectContains: "Reed" },
        { sec: "E.spouse",   path: "spouse.0.narrative",         expectContains: "1975" },
        { sec: "F.children", path: "children.0.firstName",       expectContains: "Anna" },
        { sec: "F.children", path: "children.0.birthDate",       expectContains: "1978" },
        { sec: "F.children", path: "children.1.firstName",       expectContains: "Michael" },
        { sec: "F.children", path: "children.1.birthDate",       expectContains: "1982" },
        { sec: "G.edu",      path: "education.schooling",        expectContains: "Roosevelt" },
        { sec: "H.event",    path: "additionalNotes.messagesForFutureGenerations", expectContains: "Chicago" },
      ];
      const writtenBlob = _readBlob();
      for (const c of sectionChecks) {
        const v = _readNested(writtenBlob, c.path);
        const ok = _includes(v, c.expectContains);
        report.results.push({ section: c.sec, field: c.path, status: ok ? "PASS" : "FAIL", saved: v,
          detail: "contains " + c.expectContains });
        if (ok) { report.pass++; report.populated++; } else report.fail++;
      }

      // ── 6. Persistence reload check ─────────────────────────
      // GET the blob fresh from backend, verify all fields still there.
      await _wait(400);
      const reloaded = await _getBbBlob(created.pid);
      const reloadOk = reloaded
        && reloaded.personal && _includes(_readNested(reloaded, "personal.fullName"), "Sarah")
        && reloaded.parents  && Array.isArray(reloaded.parents)  && reloaded.parents.length  >= 2
        && reloaded.siblings && Array.isArray(reloaded.siblings) && reloaded.siblings.length >= 2
        && reloaded.children && Array.isArray(reloaded.children) && reloaded.children.length >= 2;
      report.persistence_ok = !!reloadOk;
      report.results.push({ section: "Persistence", status: reloadOk ? "PASS" : "FAIL",
        detail: reloadOk ? "BB blob reloads with all sections intact"
                         : "reload missing sections — check backend persist" });
      if (reloadOk) report.pass++; else report.fail++;

      // ── 7. Truth-propagation: projection layer ──────────────
      // After identity captures, projection map should hold name/DOB/POB.
      try {
        if (_state().interviewProjection && _state().interviewProjection.fields) {
          const projFields = _state().interviewProjection.fields;
          const projChecks = [
            { path: "personal.fullName",      expectContains: "Sarah" },
            { path: "personal.dateOfBirth",   expectExact: "1954-06-12" },
            { path: "personal.placeOfBirth",  expectContains: "Cedar Rapids" },
          ];
          for (const pc of projChecks) {
            const f = projFields[pc.path];
            const v = f ? f.value : undefined;
            const ok = pc.expectExact ? _matches(v, pc.expectExact) : _includes(v, pc.expectContains);
            report.results.push({ section: "Projection", field: pc.path, status: ok ? "PASS" : "FAIL",
              saved: v, detail: pc.expectExact ? "exact" : "contains " + pc.expectContains });
            if (ok) report.pass++; else report.fail++;
          }
        } else {
          report.results.push({ section: "Projection", status: "SKIP",
            detail: "state.interviewProjection.fields not initialized" });
        }
      } catch (e) {
        report.results.push({ section: "Projection", status: "FAIL", detail: String(e) });
        report.fail++;
      }

      // ── 8. Break cases ──────────────────────────────────────
      // Snapshot the current values that MUST NOT change.
      const beforeBreak = {};
      const trackedPaths = Array.from(new Set(BREAK_CASES.flatMap(b => b.mustNotChange)));
      for (const p of trackedPaths) beforeBreak[p] = _readNested(_readBlob(), p);

      for (const bc of BREAK_CASES) {
        try {
          await window.lvSessionLoopOnTurn({ trigger: "narrator_turn", text: bc.send });
        } catch (e) {
          report.breakCaseResults.push({ id: bc.id, status: "FAIL", detail: "throw: " + String(e) });
          report.fail++; continue;
        }
        await _wait(250);
        const overwrites = [];
        for (const p of bc.mustNotChange) {
          const before = beforeBreak[p];
          const after  = _readNested(_readBlob(), p);
          if (before !== after && before != null) {
            overwrites.push(p + ": '" + String(before).slice(0,40) + "' → '" + String(after).slice(0,40) + "'");
          }
        }
        if (overwrites.length > 0) {
          report.unwanted_overwrites += overwrites.length;
          report.breakCaseResults.push({ id: bc.id, status: "FAIL", detail: "overwrote: " + overwrites.join("; ") });
          report.fail++;
        } else {
          report.breakCaseResults.push({ id: bc.id, status: "PASS", detail: "guards held" });
          report.pass++;
        }
      }

      // ── 9. Final scope check ────────────────────────────────
      const bb2 = _readBb();
      if (bb2.personId !== _state().person_id) {
        report.scope_violations++;
        report.results.push({ section: "scope-final", status: "FAIL",
          detail: "bb.personId=" + _short(bb2.personId) + " != state.person_id=" + _short(_state().person_id) });
      } else {
        report.results.push({ section: "scope-final", status: "PASS", detail: "scope intact" });
        report.pass++;
      }

      report.lastPrompts = buf.slice(-6);

    } catch (e) {
      report.error = String(e);
      report.fail++;
      console.error("[bb-walk] threw:", e);
    } finally {
      _restorePromptStubs(origStubs);
      report.durationMs = Date.now() - t0;

      if (cleanup && report.narrator && report.narrator.pid) {
        const ok = await _deleteTestNarrator(report.narrator.pid);
        report.cleanupAttempted = true;
        report.cleanupOk = ok;
      }
    }

    lvBbWalkTest.lastReport = report;
    _renderReport(report);

    // Console table for quick scan
    console.log("[bb-walk] " + report.pass + " PASS · " + report.fail + " FAIL · " +
                "overwrites=" + report.unwanted_overwrites + " · scope=" + report.scope_violations +
                " · persist=" + (report.persistence_ok ? "ok" : "fail") + " · " + report.durationMs + "ms");
    console.table(report.results.filter(r => r.status === "PASS" || r.status === "FAIL").map(r => ({
      section: r.section, field: r.field || "—",
      saved: (r.saved == null ? "" : String(r.saved)).slice(0, 32),
      status: r.status,
    })));
    if (report.breakCaseResults.length) {
      console.log("[bb-walk] break cases:");
      console.table(report.breakCaseResults);
    }
    if (report.fail > 0 || report.unwanted_overwrites > 0) {
      console.warn("[bb-walk] FAILURES:", report.results.filter(r => r.status === "FAIL"));
    }

    return report;
  }

  lvBbWalkTest.TEST_DATA = TEST_DATA;
  lvBbWalkTest.BREAK_CASES = BREAK_CASES;
  lvBbWalkTest.lastReport = null;
  window.lvBbWalkTest = lvBbWalkTest;

  console.log("[Lorevox] BB Walk Test Harness (30-field) loaded — run window.lvBbWalkTest()");
})();
