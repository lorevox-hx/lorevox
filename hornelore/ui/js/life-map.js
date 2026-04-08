/* ═══════════════════════════════════════════════════════════════
   life-map.js — Mind Elixir Life Map prototype for Lorevox
   Branch: feature/mind-elixir-life-map

   Load order: after timeline-ui.js and interview.js, before or
   after app.js (uses only global functions, no hard dependency).

   Exposes:  window.LorevoxLifeMap
   ──────────────────────────────────────────────────────────────
   PURPOSE
   -------
   Render a read-only, navigation-first Life Map from the Lorevox
   timeline spine.  Clicking a life-period node calls setEra() and
   the existing runtime refresh chain — it never writes to the
   archive, facts, or timeline spine directly.

   ARCHITECTURE CONTRACT
   ─────────────────────
   • state.timeline.spine.periods  → authoritative source for life periods
   • state.timeline.memories       → local memory items (optional, display only)
   • setEra() / setPass()          → existing era-navigation functions
   • renderRoadmap / renderInterview / updateContextTriggers / renderTimeline
                                   → existing UI refresh chain
   • The map is a VIEW + NAVIGATION layer only.
   • No parallel state is created or maintained.

   See also: docs/MIND_ELIXIR_PROTOTYPE.md
═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  // Guard against double-registration (e.g. hot reload in dev)
  if (typeof window.LorevoxLifeMap !== "undefined") return;

  var NS       = {};
  var _map     = null;
  var _lastSig = null;

  /* ── DOM helpers ─────────────────────────────────────────── */
  function _el(id) { return document.getElementById(id); }

  function _safeText(v) { return String(v || "").trim(); }

  /* ── Era label prettifier ────────────────────────────────── */
  function _prettyEra(v) {
    if (typeof prettyEra === "function") return prettyEra(v);
    return _safeText(v)
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  /* ── Default 6-period life-arc scaffold ──────────────────── */
  /* Used when a narrator is selected but no spine periods exist yet.
     Keeps Life Map from ever appearing empty — the user always sees
     a meaningful narrative structure they can click into.

     If DOB is available the scaffold computes approximate year ranges;
     otherwise the periods render with labels only (no dates).          */
  var _DEFAULT_ERA_DEFS = [
    { label: "early_childhood",  title: "Early Childhood",  offsetStart: 0,  offsetEnd: 5   },
    { label: "school_years",     title: "School Years",     offsetStart: 6,  offsetEnd: 12  },
    { label: "adolescence",      title: "Adolescence",      offsetStart: 13, offsetEnd: 17  },
    { label: "early_adulthood",  title: "Early Adulthood",  offsetStart: 18, offsetEnd: 30  },
    { label: "midlife",          title: "Midlife",          offsetStart: 31, offsetEnd: 59  },
    { label: "later_life",       title: "Later Life",       offsetStart: 60, offsetEnd: null }
  ];

  function _buildDefaultLifePeriods() {
    var birthYear = _getBirthYear();
    return _DEFAULT_ERA_DEFS.map(function (def) {
      var p = {
        label:      def.label,
        start_year: birthYear ? (birthYear + def.offsetStart) : null,
        end_year:   (birthYear && def.offsetEnd != null) ? (birthYear + def.offsetEnd) : null,
        places:     [],
        notes:      [],
        isScaffold: true           // marks this as a fallback period, not real spine data
      };
      return p;
    });
  }

  /* ── State accessors (defensive) ─────────────────────────── */
  function _personName() {
    return (
      (typeof state !== "undefined" &&
        state.profile && state.profile.basics &&
        (state.profile.basics.preferred || state.profile.basics.fullname)) ||
      "Life Story"
    );
  }

  function _getPeriods() {
    if (typeof state === "undefined") return [];

    // Try real spine periods first
    var hasSpine = state.timeline && state.timeline.spine;
    if (hasSpine) {
      var periods = state.timeline.spine.periods;
      if (Array.isArray(periods)) {
        var real = periods.filter(function (p) {
          return p && typeof p.label === "string" && p.label.trim() !== "";
        });
        if (real.length > 0) return real;
      }
    }

    // Fallback: narrator selected but no spine periods → scaffold
    var pid = state.person_id || null;
    if (pid) return _buildDefaultLifePeriods();

    return [];
  }

  function _getLocalMemories() {
    if (typeof state === "undefined") return [];
    if (!state.timeline || !Array.isArray(state.timeline.memories)) return [];
    return state.timeline.memories;
  }

  function _currentEra() {
    if (typeof getCurrentEra === "function") return getCurrentEra();
    return (
      (typeof state !== "undefined" && state.session && state.session.currentEra) ||
      null
    );
  }

  function _getBirthYear() {
    if (typeof getBirthYear === "function") return getBirthYear();
    return null;
  }

  /* ── Memory helpers — multi-schema defensive ──────────────── */
  function _yearFromMemory(m) {
    if (!m) return null;
    var raw = m.year     != null ? m.year
            : m.start_year != null ? m.start_year
            : m.ts       != null ? m.ts
            : m.date     != null ? m.date
            : m.when     != null ? m.when
            : null;
    if (raw == null) return null;
    if (typeof raw === "number" && isFinite(raw)) return raw;
    var match = String(raw).match(/\b(18|19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : null;
  }

  function _memoryTitle(m) {
    return (
      m.title ||
      m.label ||
      m.name  ||
      (m.description ? String(m.description).slice(0, 48) : null) ||
      "Memory"
    );
  }

  function _memoryDesc(m) {
    return m.description || m.notes || m.summary || m.text || "";
  }

  function _memoryNodeId(periodLabel, idx, m) {
    var slug = _safeText(_memoryTitle(m))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 32);
    return "memory:" + periodLabel + ":" + idx + ":" + (slug || "item");
  }

  function _memoryBelongsToPeriod(memory, period) {
    var y     = _yearFromMemory(memory);
    if (!y) return false;
    var start = Number(period.start_year);
    var end   = period.end_year != null ? Number(period.end_year) : null;
    if (!isFinite(start)) return false;
    if (end == null) return y >= start;
    return y >= start && y <= end;
  }

  /* ── Build grandchildren (memory nodes) for a period ─────── */
  function _buildMemoryChildren(period) {
    var memories = _getLocalMemories();
    return memories
      .filter(function (m) { return _memoryBelongsToPeriod(m, period); })
      .map(function (m, idx) {
        var y     = _yearFromMemory(m);
        var title = _memoryTitle(m);
        var desc  = _memoryDesc(m);
        // Topic format: "◦ Title · Year"
        // ◦ (hollow bullet) marks this as an anchor / navigation cue,
        // not a verified fact.  "·" separator mirrors era node style.
        var anchorLabel = y ? ("◦ " + title + " · " + y) : ("◦ " + title);
        return {
          id:    _memoryNodeId(period.label, idx, m),
          topic: anchorLabel,
          style: {
            background: "rgba(52,211,153,.08)",
            color:      "#94a3b8",
            border:     "1px dashed rgba(52,211,153,.25)"
          },
          tags: ["memory"],
          data: {
            kind:        "memory",
            era:         period.label,
            year:        y,
            title:       title,
            description: desc
          },
          children: []
        };
      });
  }

  /* ── v5 — Draft context accessor ─────────────────────────── */
  /* Reads FT/LT draft surfaces (read-only, never writes to truth).
     Returns { ftNodes: [], ltNodes: [], ftEdges: [], ltEdges: [] } */
  function _getDraftContext() {
    if (typeof window.LorevoxBioBuilder === "undefined" || !window.LorevoxBioBuilder._getDraftFamilyContext) {
      return { ftNodes: [], ltNodes: [], ftEdges: [], ltEdges: [] };
    }
    var ctx = window.LorevoxBioBuilder._getDraftFamilyContext();
    if (!ctx) return { ftNodes: [], ltNodes: [], ftEdges: [], ltEdges: [] };
    return {
      ftNodes: (ctx.familyTree && ctx.familyTree.nodes) || [],
      ltNodes: (ctx.lifeThreads && ctx.lifeThreads.nodes) || [],
      ftEdges: (ctx.familyTree && ctx.familyTree.edges) || [],
      ltEdges: (ctx.lifeThreads && ctx.lifeThreads.edges) || []
    };
  }

  /* ── v6 — Era-aware draft context accessor ─────────────── */
  /* Returns era-scoped draft items when the v6 accessor exists,
     otherwise falls back to the global v5 path.
     Returns { ftItems: [], ltItems: [], era: string|null, isEraAware: bool } */
  function _getDraftContextForEra(era) {
    var BB = window.LorevoxBioBuilder;
    // v6 path: era-aware accessor available and era specified
    if (era && BB && typeof BB._getDraftFamilyContextForEra === "function") {
      var eraCtx = BB._getDraftFamilyContextForEra(null, era);
      if (eraCtx) {
        // primary = high-relevance items for this era, secondary = moderate
        var items = (eraCtx.primary || []).concat(eraCtx.secondary || []);
        var ftItems = [], ltItems = [];
        items.forEach(function (it) {
          if (it.source === "familyTree" || it.role) ftItems.push(it);
          else ltItems.push(it);
        });
        return { ftItems: ftItems, ltItems: ltItems, era: era, isEraAware: true };
      }
    }
    // v5 fallback: global context (no era filtering)
    var g = _getDraftContext();
    var ftFallback = g.ftNodes.filter(function (n) { return n.role !== "narrator"; });
    var ltFallback = g.ltNodes;
    return { ftItems: ftFallback, ltItems: ltFallback, era: era || null, isEraAware: false };
  }

  /* ── Core data transform ──────────────────────────────────── */
  function buildLifeMapFromLorevoxState() {
    var periods    = _getPeriods();
    var name       = _personName();
    var activeEra  = _currentEra();
    var birthPlace = (
      (typeof state !== "undefined" && state.profile && state.profile.basics && state.profile.basics.pob) ||
      (typeof state !== "undefined" && state.timeline && state.timeline.spine && state.timeline.spine.birth_place) ||
      ""
    );
    var birthYear  = _getBirthYear();

    // Map each life period → a branch node
    // Status mirrors memoir chapter list: active / has-memories / not-started
    var periodNodes = periods.map(function (period) {
      var isActive     = (activeEra === period.label);
      var isScaffold   = !!period.isScaffold;
      var memChildren  = _buildMemoryChildren(period);
      var memCount     = memChildren.length;
      var hasMemories  = memCount > 0;

      // Subtitle: year range when available, plain label otherwise
      var subtitle;
      if (period.start_year != null) {
        var start = period.start_year;
        var end   = period.end_year != null ? period.end_year : null;
        subtitle  = start + (end != null ? ("–" + end) : "+");
      } else {
        subtitle = isScaffold ? "awaiting story" : "—";
      }

      // Memory count suffix mirrors chapter-status badges in memoir preview
      var countSuffix = memCount > 0 ? (" · " + memCount + " memor" + (memCount === 1 ? "y" : "ies")) : "";

      // v6 integration — era-specific draft enrichment (v5 fallback: global counts)
      var draftSuffix = "";
      var eraDraft = _getDraftContextForEra(period.label);
      var ftPeopleCount = eraDraft.ftItems.length;
      var ltThemeCount  = eraDraft.ltItems.filter(function (n) { return n.type === "theme"; }).length;
      if (ftPeopleCount > 0 || ltThemeCount > 0) {
        var parts = [];
        if (ftPeopleCount > 0) parts.push(ftPeopleCount + " family");
        if (ltThemeCount  > 0) parts.push(ltThemeCount  + " theme" + (ltThemeCount > 1 ? "s" : ""));
        draftSuffix = " · " + parts.join(", ");
        if (eraDraft.isEraAware) draftSuffix += " (era)";
      }

      var topicStr = _prettyEra(period.label) + " · " + subtitle + countSuffix + draftSuffix;

      // Style tiers:
      //  active          → indigo solid       (current working period)
      //  has content     → teal solid         (in-progress equivalent)
      //  scaffold/empty  → dim dashed         (awaiting story)
      //  real empty      → dim solid          (mapped but no memories yet)
      var style = isActive
        ? { background: "rgba(99,102,241,.22)", color: "#e2e8f0", border: "1px solid rgba(99,102,241,.55)" }
        : hasMemories
          ? { background: "rgba(20,184,166,.10)", color: "#cbd5e1", border: "1px solid rgba(20,184,166,.28)" }
          : isScaffold
            ? { background: "rgba(255,255,255,.02)", color: "#64748b", border: "1px dashed rgba(255,255,255,.12)" }
            : { background: "rgba(255,255,255,.04)", color: "#94a3b8", border: "1px solid rgba(255,255,255,.10)" };

      return {
        id:    "era:" + period.label,
        topic: topicStr,
        style: style,
        tags:  isScaffold ? ["life-period", "scaffold"] : ["life-period"],
        data: {
          kind:       "era",
          era:        period.label,
          isScaffold: isScaffold,
          start_year: period.start_year != null ? period.start_year : null,
          end_year:   period.end_year   != null ? period.end_year   : null,
          places:     Array.isArray(period.places) ? period.places.filter(Boolean) : [],
          notes:      Array.isArray(period.notes)  ? period.notes.filter(Boolean)  : []
        },
        children: memChildren
      };
    });

    // Optional birth seed node (display-only, no click action)
    var rootChildren = [];
    if (birthYear || birthPlace) {
      rootChildren.push({
        id:    "seed:birth",
        topic: birthYear ? ("Born · " + birthYear) : "Born",
        style: {
          background: "rgba(255,155,107,.10)",
          color:      "#e2e8f0",
          border:     "1px solid rgba(255,155,107,.22)"
        },
        tags:  ["seed"],
        data: {
          kind:  "seed",
          title: "Birth",
          place: birthPlace,
          year:  birthYear
        },
        children: []
      });
    }

    rootChildren = rootChildren.concat(periodNodes);

    return {
      nodeData: {
        id:    "root:person",
        topic: name,
        style: {
          background: "rgba(124,156,255,.16)",
          color:      "#f8fafc",
          border:     "1px solid rgba(124,156,255,.35)"
        },
        tags:  ["person"],
        data: {
          kind:      "person",
          person_id: (typeof state !== "undefined" && state.person_id) || null,
          name:      name
        },
        children: rootChildren
      }
    };
  }

  /* ── Change-detection signature ───────────────────────────── */
  function _signature() {
    var periods  = _getPeriods();
    var memories = _getLocalMemories();
    var era      = _currentEra();
    var pid      = (typeof state !== "undefined" && state.person_id) || null;
    return JSON.stringify({
      pid:  pid,
      name: _personName(),
      era:  era,
      periods: periods.map(function (p) {
        return { label: p.label, sy: p.start_year, ey: p.end_year };
      }),
      mems: memories.map(function (m) {
        return { t: _memoryTitle(m), y: _yearFromMemory(m) };
      })
    });
  }

  /* ── Host / empty-state visibility ───────────────────────── */
  // Empty-state messages mirror memoir preview clarity:
  // each state tells the user exactly what is missing and what to do next.
  function _syncHostVisibility() {
    var host  = _el("lifeMapHost");
    var empty = _el("lifeMapEmpty");
    if (!host || !empty) return;

    var pid     = (typeof state !== "undefined" && state.person_id) || null;
    var periods = _getPeriods();   // now returns scaffold when pid exists but spine is empty
    var ready   = !!(pid && periods.length > 0);

    host.classList.toggle("hidden", !ready);
    empty.classList.toggle("hidden", ready);

    if (!ready) {
      // Only reachable when no narrator is selected (scaffold covers the rest)
      var msg  = "No narrator selected.";
      var hint = "Choose a person from the selector above to view their Life Map.";
      var target =
        '<div style="text-align:center; padding: 32px 16px;">' +
          '<div style="font-size:14px; color:#64748b; font-weight:500; margin-bottom:8px;">' + msg + "</div>" +
          '<div style="font-size:13px; color:#475569; font-style:italic; line-height:1.6; max-width:320px; margin:0 auto;">' + hint + "</div>" +
        "</div>";
      if (empty.innerHTML !== target) empty.innerHTML = target;
    }
  }

  /* ── MindElixir availability guard ───────────────────────── */
  function _libraryReady() {
    if (typeof MindElixir !== "undefined") return true;
    var host  = _el("lifeMapHost");
    var empty = _el("lifeMapEmpty");
    if (host)  host.classList.add("hidden");
    if (empty) {
      empty.classList.remove("hidden");
      empty.innerHTML =
        '<div class="text-sm text-amber-300 text-center py-8 italic">' +
        'Mind Elixir is not loaded. Ensure <code>vendor/mind-elixir/mind-elixir.js</code> ' +
        'is included in the HTML shell before life-map.js.</div>';
    }
    return false;
  }

  /* ── Shared era navigation (used by both era + memory clicks) */
  function _navigateToEra(era) {
    if (!era) return;
    if (typeof setEra === "function") setEra(era);
    if (typeof setPass === "function" &&
        typeof interviewMode !== "undefined" &&
        interviewMode === "chronological") {
      setPass("pass2a");
    }
    if (typeof update71RuntimeUI     === "function") update71RuntimeUI();
    if (typeof renderRoadmap         === "function") renderRoadmap();
    if (typeof renderInterview       === "function") renderInterview();
    if (typeof updateContextTriggers === "function") updateContextTriggers();
  }

  /**
   * _jumpToInterview — mirror jumpToSection()'s final step.
   *
   * In lori8.0 the Life Map is a popover; dismissing it returns the user
   * to the chat window, which IS the interview surface.
   *
   * In lori7.4c the Life Map is a tab pane; calling showTab("interview")
   * switches directly to the Interview tab, identical to jumpToSection().
   *
   * Either way: the user lands in the interview context after clicking a
   * map node, mirroring the exact behaviour of memoir chapter row clicks.
   */
  function _jumpToInterview() {
    // lori9.0 / lori8.0 popover path
    // The Popover API uses the :popover-open pseudo-class, NOT an "open" attribute.
    // Use matches(":popover-open") to detect open state correctly.
    var popover = _el("lifeMapPopover");
    if (popover && typeof popover.hidePopover === "function") {
      try {
        if (popover.matches(":popover-open")) {
          popover.hidePopover();
          console.log("[life-map] Popover closed via hidePopover()");
          return;
        }
      } catch (_) {
        // Fallback for browsers without :popover-open support
        try { popover.hidePopover(); return; } catch (_2) {}
      }
    }
    // lori7.4c tab path
    if (typeof showTab === "function") showTab("interview");
  }

  /* ── Node-click handler ───────────────────────────────────── */
  function _onNodeSelect(rawNode) {
    if (!rawNode || !rawNode.data) return;
    var data = rawNode.data;

    // ── Life-period click ─────────────────────────────────────
    // Mirrors jumpToSection(): navigate era → jump to interview.
    // Phase L fix: set era FIRST so the meta bar updates correctly,
    // then re-render the Life Map to show the new era, then dismiss.
    if (data.kind === "era" && data.era) {
      // ① Set era state
      if (typeof setEra  === "function") setEra(data.era);
      if (typeof setPass === "function" &&
          typeof interviewMode !== "undefined" &&
          interviewMode === "chronological") {
        setPass("pass2a");
      }
      // ② UI refresh — wrapped individually so one failure doesn't
      //   block the rest.  In lori8.0 several of these are no-ops
      //   (their root elements don't exist in the 8.0 DOM).
      try { if (typeof update71RuntimeUI     === "function") update71RuntimeUI();     } catch (_) {}
      try { if (typeof renderRoadmap         === "function") renderRoadmap();         } catch (_) {}
      try { if (typeof renderInterview       === "function") renderInterview();       } catch (_) {}
      try { if (typeof updateContextTriggers === "function") updateContextTriggers(); } catch (_) {}
      try { if (typeof renderTimeline        === "function") renderTimeline();        } catch (_) {}

      // ③ Phase L: Re-render the Life Map so meta bar + button label update
      // immediately to reflect the new era, giving visible state-change feedback.
      _lastSig = null; // force fresh build
      render(true);

      // ④ Phase L: Visible confirmation toast
      var prettyName = _prettyEra(data.era);
      if (typeof sysBubble === "function") {
        sysBubble("Interview moved to " + prettyName);
      }
      console.log("[life-map] Era changed to: " + data.era + " (" + prettyName + ")");

      // ⑤ Dismiss popover / switch tab (delayed slightly so user sees the update)
      setTimeout(function () {
        _jumpToInterview();
        // ⑥ v9.0: After closing the popover, send a system prompt so Lori
        // asks her first question about the selected era. Without this,
        // the era is set in state but Lori stays silent until the user types.
        setTimeout(function () {
          if (typeof sendSystemPrompt === "function") {
            sendSystemPrompt(
              "[SYSTEM: The narrator just selected the '" + prettyName +
              "' era from the Life Map. Begin exploring this period with them. " +
              "Ask ONE warm, open question about this time in their life.]"
            );
            console.log("[life-map] System prompt sent for era:", prettyName);
          }
        }, 300);
      }, 400);
      return;
    }

    // ── Memory click ──────────────────────────────────────────
    // Set era context, surface memory meta, then jump to interview.
    // Memory nodes are navigation cues — they are NOT truth assertions.
    if (data.kind === "memory" && data.era) {
      // Update meta bar before jumping so user sees the selection cue
      var meta = _el("lifeMapSelectionMeta");
      if (meta) {
        var bits = [
          data.title || "Memory",
          data.year  ? ("" + data.year) : null,
          data.description ? data.description.slice(0, 60) : null
        ].filter(Boolean);
        meta.textContent = bits.join(" · ") + " — navigating…";
      }
      // Navigate era state (same defensive pattern as era click)
      if (typeof setEra  === "function") setEra(data.era);
      if (typeof setPass === "function" &&
          typeof interviewMode !== "undefined" &&
          interviewMode === "chronological") {
        setPass("pass2a");
      }
      try { if (typeof update71RuntimeUI     === "function") update71RuntimeUI();     } catch (_) {}
      try { if (typeof renderRoadmap         === "function") renderRoadmap();         } catch (_) {}
      try { if (typeof renderInterview       === "function") renderInterview();       } catch (_) {}
      try { if (typeof updateContextTriggers === "function") updateContextTriggers(); } catch (_) {}
      // Brief pause so user sees the "navigating…" cue, then jump
      var memTitle = data.title || "a memory";
      var memEra = data.era;
      setTimeout(function () {
        _jumpToInterview();
        // v9.0: Trigger Lori to ask about the selected memory's era
        setTimeout(function () {
          if (typeof sendSystemPrompt === "function") {
            var prettyEra = _prettyEra(memEra);
            sendSystemPrompt(
              "[SYSTEM: The narrator just selected '" + memTitle +
              "' from the Life Map (era: " + prettyEra +
              "). Ask ONE warm follow-up question about this memory or this period.]"
            );
            console.log("[life-map] System prompt sent for memory:", memTitle, "era:", prettyEra);
          }
        }, 300);
      }, 220);
    }
  }

  /* ── Create and mount a new map instance ─────────────────── */
  function _mountMap(data) {
    var host = _el("lifeMapHost");
    if (!host) return null;
    host.innerHTML = "";

    var map = new MindElixir({
      el:               "#lifeMapHost",
      direction:        MindElixir.LEFT,
      draggable:        false,
      contextMenu:      false,
      toolBar:          false,
      nodeMenu:         false,
      keypress:         false,
      locale:           "en",
      overflowHidden:   false,
      primaryLinkStyle: 2,
      allowUndo:        false,
      data:             data
    });

    map.init();

    // Wire selectNode event (Mind Elixir bus API)
    if (map.bus && typeof map.bus.addListener === "function") {
      map.bus.addListener("selectNode", _onNodeSelect);
    }

    return map;
  }

  /* ── Public API ───────────────────────────────────────────── */

  /**
   * destroy() — tear down the current map instance and clear local state.
   * Safe to call repeatedly.
   */
  function destroy() {
    if (_map && typeof _map.destroy === "function") {
      try { _map.destroy(); } catch (e) {}
    }
    var host = _el("lifeMapHost");
    if (host) host.innerHTML = "";
    _map     = null;
    _lastSig = null;
  }

  /**
   * render(force) — (re)build the map if data has changed.
   * Always pass force=true after a tab switch or explicit refresh.
   *
   * Design note: if the Life Map pane is not the active tab (hidden),
   * we skip the SVG mount entirely because offsetWidth = 0 inside a
   * display:none parent produces wrong layout dimensions.  We reset
   * _lastSig so the next tab-open forces a full rebuild with correct dims.
   */
  function render(force) {
    _syncHostVisibility();
    if (!_libraryReady()) return;

    var host = _el("lifeMapHost");
    if (!host || host.classList.contains("hidden")) return;

    // Skip expensive SVG build when the Life Map panel is not visible.
    // In lori8.0 the panel is a popover; the browser sets the `open`
    // attribute when it is shown.  render(true) is called by the
    // popover "toggle" listener (lv80Init) on open.
    // In lori7.4c the panel is a tab-pane with class "hidden".
    // We support both patterns by checking each in turn.
    var pane    = _el("pane-lifemap");        // 7.4c tab pane (may be null in 8.0)
    var popover = _el("lifeMapPopover");      // 8.0 popover panel (may be null in 7.4c)
    var isHidden =
      (pane    && pane.classList.contains("hidden")) ||
      (popover && !popover.hasAttribute("open") && !popover.matches(":popover-open"));
    if (isHidden) {
      _lastSig = null;  // force fresh build next time the panel opens
      return;
    }

    var sig = _signature();
    if (!force && _map && sig === _lastSig) return;

    var data = buildLifeMapFromLorevoxState();
    destroy();
    _map     = _mountMap(data);
    _lastSig = sig;

    // Update meta bar — mirrors chapter-status in memoir preview.
    // Shows current era + memory count for that era, or a clear invitation.
    var meta      = _el("lifeMapSelectionMeta");
    var activeEra = _currentEra();
    if (meta) {
      if (activeEra) {
        var activePeriodObj = _getPeriods().filter(function (p) { return p.label === activeEra; })[0];
        var activeMemCount  = activePeriodObj ? _buildMemoryChildren(activePeriodObj).length : 0;
        var memNote = activeMemCount > 0
          ? " · " + activeMemCount + " memor" + (activeMemCount === 1 ? "y" : "ies") + " anchored"
          : "";

        // v6 integration — era-specific draft context summary in meta bar
        var draftMeta = "";
        var metaDraft = _getDraftContextForEra(activeEra);
        var dftPeople = metaDraft.ftItems.length;
        var dltThemes = metaDraft.ltItems.filter(function (n) { return n.type === "theme"; }).length;
        if (dftPeople > 0 || dltThemes > 0) {
          var bits = [];
          if (dftPeople > 0) bits.push(dftPeople + " family member" + (dftPeople > 1 ? "s" : ""));
          if (dltThemes > 0) bits.push(dltThemes + " life theme" + (dltThemes > 1 ? "s" : ""));
          draftMeta = " · Draft: " + bits.join(", ");
          if (metaDraft.isEraAware) draftMeta += " (era-matched)";
        }

        meta.textContent = "Lori is in: " + _prettyEra(activeEra) + memNote + draftMeta + " — click a period to navigate, or use the button below.";
      } else {
        meta.textContent = "Click a life period to move Lori into that era and continue the interview.";
      }
    }

    // Sync the persistent "Continue in Interview" button label
    var goBtn = _el("lifeMapGoBtn");
    if (goBtn) {
      goBtn.textContent = activeEra
        ? "→ Continue in " + _prettyEra(activeEra)
        : "→ Continue in Interview";
    }
  }

  /**
   * refresh() — force a full rebuild (called by app.js after
   * person load or profile save).
   */
  function refresh() {
    render(true);
  }

  /**
   * jumpToCurrentEra() — persistent "Continue in Interview" action.
   *
   * Invoked by the #lifeMapGoBtn button in the Life Map popover.
   * Refreshes context for the current era (if one is active) and
   * then dismisses the popover / switches to Interview tab.
   *
   * Mirrors the memoir chapter-row click: user jumps into interview
   * work at the currently active life period without needing to click
   * a specific SVG node first.
   */
  function jumpToCurrentEra() {
    var era = _currentEra();
    if (era) {
      if (typeof setEra  === "function") setEra(era);
      if (typeof setPass === "function" &&
          typeof interviewMode !== "undefined" &&
          interviewMode === "chronological") {
        setPass("pass2a");
      }
      try { if (typeof update71RuntimeUI     === "function") update71RuntimeUI();     } catch (_) {}
      try { if (typeof renderRoadmap         === "function") renderRoadmap();         } catch (_) {}
      try { if (typeof renderInterview       === "function") renderInterview();       } catch (_) {}
      try { if (typeof updateContextTriggers === "function") updateContextTriggers(); } catch (_) {}
      try { if (typeof renderTimeline        === "function") renderTimeline();        } catch (_) {}
    }
    _jumpToInterview();
    // v9.0: Trigger Lori to ask about the current era
    if (era) {
      var prettyName = _prettyEra(era);
      setTimeout(function () {
        if (typeof sendSystemPrompt === "function") {
          sendSystemPrompt(
            "[SYSTEM: The narrator clicked 'Continue in Interview' for the '" + prettyName +
            "' era. Ask ONE warm, open question about this time in their life.]"
          );
        }
      }, 300);
    }
  }

  /* ── Register global ──────────────────────────────────────── */
  NS.buildLifeMapFromLorevoxState = buildLifeMapFromLorevoxState;
  NS._buildDefaultLifePeriods     = _buildDefaultLifePeriods;
  NS._DEFAULT_ERA_DEFS            = _DEFAULT_ERA_DEFS;
  NS.render                       = render;
  NS.refresh                      = refresh;
  NS.destroy                      = destroy;
  NS.jumpToCurrentEra             = jumpToCurrentEra;
  window.LorevoxLifeMap           = NS;

  // Sync host visibility once DOM is ready (handles cold-load no-person state)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _syncHostVisibility);
  } else {
    _syncHostVisibility();
  }

})();
