/* ═══════════════════════════════════════════════════════════════
   chronology-accordion.js — WO-CR-01 Left Chronology Accordion
   Lorevox / Lorevox 1.0

   Read-only UI: fetches merged chronology payload from the API,
   renders a collapsible decade→year→event accordion in the left
   column, and bridges clicks to the existing era navigation chain.

   Authority contract: NEVER writes to facts, timeline, questionnaire,
   archive, or any truth table.  State writes are limited to
   state.chronologyAccordion (UI display state only).

   Load order: after app.js, api.js, state.js, interview.js
═══════════════════════════════════════════════════════════════ */

/* ── DOM References ─────────────────────────────────────────── */
function _crCol()  { return document.getElementById("crAccordionCol"); }
function _crBody() { return document.getElementById("crAccordionBody"); }

/* ── Toggle expand / collapse ───────────────────────────────── */
function crToggleExpand() {
  const col = _crCol();
  if (!col) return;
  const wasCollapsed = state.chronologyAccordion.collapsed;
  state.chronologyAccordion.collapsed = !wasCollapsed;
  col.classList.toggle("cr-expanded", wasCollapsed);
}

/* ── Show / hide the accordion column ───────────────────────── */
function crShowAccordion() {
  const col = _crCol();
  if (!col) return;
  state.chronologyAccordion.visible = true;
  col.classList.add("cr-visible");
}

function crHideAccordion() {
  const col = _crCol();
  if (!col) return;
  state.chronologyAccordion.visible = false;
  col.classList.remove("cr-visible");
}

/* ── Trainer isolation ──────────────────────────────────────── */
function crCheckTrainerIsolation() {
  try {
    if (state.trainerNarrators && state.trainerNarrators.active) {
      crHideAccordion();
      return true;
    }
  } catch (_) {}
  return false;
}

/* ── Fetch payload from API ─────────────────────────────────── */
async function crFetchAccordion(personId) {
  if (!personId) return null;
  if (crCheckTrainerIsolation()) return null;

  state.chronologyAccordion.loading = true;
  state.chronologyAccordion.error = null;

  try {
    const url = API.CHRONOLOGY_ACCORDION(personId);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    state.chronologyAccordion.payload = data;
    state.chronologyAccordion.loading = false;

    if (data.error === "no_dob") {
      console.log("[WO-CR-01] No DOB available — accordion empty");
      return data;
    }

    console.log(
      "[WO-CR-01] Accordion loaded: %d decades, %d world, %d personal, %d ghost",
      (data.decades || []).length,
      data.lane_counts?.world || 0,
      data.lane_counts?.personal || 0,
      data.lane_counts?.ghost || 0,
    );
    return data;
  } catch (err) {
    console.error("[WO-CR-01] Failed to load accordion:", err);
    state.chronologyAccordion.error = err.message;
    state.chronologyAccordion.loading = false;
    return null;
  }
}

/* ── Render the accordion ───────────────────────────────────── */
function crRenderAccordion(data) {
  const body = _crBody();
  if (!body) return;

  if (!data || !data.decades || data.decades.length === 0) {
    body.innerHTML = '<div style="padding:12px;color:#475569;font-size:11px;text-align:center;">No timeline data yet</div>';
    return;
  }

  let html = "";
  for (const decade of data.decades) {
    const decadeKey = String(decade.decade);
    const isOpen = !!state.chronologyAccordion.openDecades[decadeKey];
    const totalItems = decade.years.reduce((n, y) => n + y.items.length, 0);

    html += `<div class="cr-decade${isOpen ? " cr-open" : ""}" data-decade="${decadeKey}">`;
    html += `<div class="cr-decade-header" onclick="crToggleDecade('${decadeKey}')">`;
    html += `<span class="cr-decade-caret">▸</span>`;
    html += `<span>${decade.decade_label}</span>`;
    html += `<span class="cr-decade-count">${totalItems}</span>`;
    html += `</div>`;
    html += `<div class="cr-decade-body">`;

    for (const yearGroup of decade.years) {
      const yrKey = String(yearGroup.year);
      const yearOpenMap = state.chronologyAccordion.openYears[decadeKey] || {};
      const yrOpen = !!yearOpenMap[yrKey];
      const eraTag = yearGroup.era
        ? `<span class="cr-era-tag">${_crPrettyEra(yearGroup.era)}</span>`
        : "";

      // CR-03 active-era emphasis: mark the year container when its era
      // matches the currently selected interview era.
      const currentEra = _crCurrentEra();
      const isActiveEra = !!(yearGroup.era && currentEra && yearGroup.era === currentEra);

      html += `<div class="cr-year${yrOpen ? " cr-open" : ""}${isActiveEra ? " cr-active-era" : ""}" data-year="${yrKey}">`;
      html += `<div class="cr-year-header" onclick="crToggleYear('${decadeKey}','${yrKey}')">`;
      html += `<span class="cr-year-caret">▸</span>`;
      html += `<span>${yrKey}</span>${eraTag}`;
      html += `</div>`;
      html += `<div class="cr-year-body">`;

      for (const item of yearGroup.items) {
        const lane = item.lane || "world";
        // Provenance → CSS hook (promoted_truth renders stronger)
        const src  = item.source || "";
        // CR-04: all lanes become clickable so Lori can use year as focus cue.
        // Personal and ghost still drive era navigation; world items now
        // also set focus without asserting era shift.
        const clickAttr = ` onclick="crOnItemClick('${yearGroup.year}','${yearGroup.era || ""}','${lane}',event)" `;
        const srcAttr = src ? ` data-source="${_crAttr(src)}"` : "";
        const kindAttr = item.event_kind ? ` data-kind="${_crAttr(item.event_kind)}"` : "";
        html += `<div class="cr-event" data-lane="${lane}"${srcAttr}${kindAttr}${clickAttr}>`;
        html += _crEscapeHtml(item.label);
        html += `</div>`;
      }

      html += `</div></div>`; // /cr-year-body /cr-year
    }

    html += `</div></div>`; // /cr-decade-body /cr-decade
  }

  body.innerHTML = html;
}

/* ── Toggle decade open/close ───────────────────────────────── */
function crToggleDecade(decadeKey) {
  const wasOpen = !!state.chronologyAccordion.openDecades[decadeKey];
  state.chronologyAccordion.openDecades[decadeKey] = !wasOpen;

  const el = _crBody()?.querySelector(`.cr-decade[data-decade="${decadeKey}"]`);
  if (el) el.classList.toggle("cr-open", !wasOpen);
}

/* ── Toggle year open/close ─────────────────────────────────── */
function crToggleYear(decadeKey, yearKey) {
  if (!state.chronologyAccordion.openYears[decadeKey]) {
    state.chronologyAccordion.openYears[decadeKey] = {};
  }
  const wasOpen = !!state.chronologyAccordion.openYears[decadeKey][yearKey];
  state.chronologyAccordion.openYears[decadeKey][yearKey] = !wasOpen;

  const el = _crBody()?.querySelector(`.cr-year[data-year="${yearKey}"]`);
  if (el) el.classList.toggle("cr-open", !wasOpen);

  // Auto-expand parent decade if not already open
  if (!wasOpen && !state.chronologyAccordion.openDecades[decadeKey]) {
    crToggleDecade(decadeKey);
  }
}

/* ── Navigation bridge ──────────────────────────────────────── */
function crJumpToEra(eraLabel) {
  if (!eraLabel) return;

  // Use the same navigation chain as roadmap clicks and life-map
  if (typeof setEra === "function") setEra(eraLabel);
  if (typeof setPass === "function") setPass("pass2a");
  if (typeof update71RuntimeUI === "function") update71RuntimeUI();
  if (typeof renderRoadmap === "function") renderRoadmap();
  if (typeof renderInterview === "function") renderInterview();
  if (typeof updateContextTriggers === "function") updateContextTriggers();
  if (typeof showTab === "function") showTab("interview");

  console.log("[WO-CR-01] Navigation bridge → era:", eraLabel);
}

/* ── CR-04: Item click — track focus + optionally shift era ──
   Sets state.chronologyAccordion.focus = {year, era, lane} so the
   runtime payload builder can attach a chronology_context slice
   to the next turn. Only personal/ghost clicks trigger era navigation;
   world items update focus silently so they remain contextual-only. */
function crOnItemClick(year, era, lane, ev) {
  try {
    if (ev && ev.stopPropagation) ev.stopPropagation();
  } catch (_) {}

  const y = parseInt(year, 10) || null;
  state.chronologyAccordion.focus = {
    year: y,
    era: era || null,
    lane: lane || null,
    at:   Date.now(),
  };

  // Visually mark the focused item (scoped to accordion body)
  try {
    const body = _crBody();
    if (body) {
      body.querySelectorAll(".cr-event.cr-focused").forEach(el => el.classList.remove("cr-focused"));
      if (ev && ev.currentTarget) ev.currentTarget.classList.add("cr-focused");
    }
  } catch (_) {}

  // Personal / ghost click → era navigation (existing bridge).
  // World click → focus update only (no era shift).
  if ((lane === "personal" || lane === "ghost") && era) {
    crJumpToEra(era);
  }

  console.log("[WO-CR-PACK-01] focus:", state.chronologyAccordion.focus);
}

/* ── Return the currently selected interview era, best-effort.  ─
   Used for active-era visual emphasis in the accordion. */
function _crCurrentEra() {
  try {
    if (typeof getCurrentEra === "function") {
      const e = getCurrentEra();
      if (e) return e;
    }
    return state?.session?.currentEra || null;
  } catch (_) { return null; }
}

/* ── Safe attribute escaper (small subset; not HTML content) ── */
function _crAttr(s) {
  return String(s || "").replace(/[<>"'&]/g, c => ({
    "<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;","&":"&amp;"
  }[c]));
}

/* ── Utilities ──────────────────────────────────────────────── */
function _crPrettyEra(label) {
  if (!label) return "";
  return String(label)
    .replaceAll("_", " ")
    .replace(/\b\w/g, m => m.toUpperCase());
}

function _crEscapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text || "";
  return d.innerHTML;
}

/* ── CR-04: Build lightweight chronology_context slice ────────
   Returns a compact, provenance-aware snapshot for the runtime
   payload. NEVER returns the full accordion. Trainer mode and
   absent payloads both yield null (Lori gets no context).

   Priority:
     1. explicit focus (user clicked year/item) — narrow, per-year
     2. current era                             — wide, era-bounded
     3. nothing                                 — null

   Guardrails (enforced by the runtime contract, not this function):
     - personal items carry source: profile | questionnaire |
       promoted_truth — only promoted_truth is assert-grade.
     - world items carry source: historical_json (context only).
     - ghost items carry source: life_stage_template (prompt shaping).
   ─────────────────────────────────────────────────────────────── */
function crBuildChronologyContext() {
  try {
    // Trainer mode: suppress entirely
    if (state.trainerNarrators && state.trainerNarrators.active) return null;

    const cs = state.chronologyAccordion;
    if (!cs || !cs.visible) return null;

    const payload = cs.payload;
    if (!payload || !payload.decades || payload.decades.length === 0) return null;

    const focus = cs.focus || null;
    const focusYear = focus && Number.isFinite(focus.year) ? focus.year : null;

    // Determine era scope: explicit focus era → current era → null
    const focusEra = (focus && focus.era) || _crCurrentEra() || null;

    // Hard caps to keep the block small (never ship the whole accordion)
    const MAX_WORLD = 3;
    const MAX_GHOST = 2;
    const MAX_PERSONAL = 3;

    const personal_items = [];
    const world_items = [];
    const ghost_items = [];

    // Walk decades → years. Only gather from the focused year (when
    // present) or from years matching the focused era.
    for (const decade of payload.decades) {
      for (const yr of decade.years || []) {
        const matchYear = focusYear ? (yr.year === focusYear) : false;
        const matchEra  = focusEra  ? (yr.era === focusEra)  : false;
        if (!matchYear && !matchEra) continue;

        for (const it of yr.items || []) {
          if (it.lane === "personal" && personal_items.length < MAX_PERSONAL) {
            personal_items.push({
              label:   String(it.label || ""),
              year:    yr.year,
              source:  String(it.source || "profile"),
              event_kind: it.event_kind || null,
            });
          } else if (it.lane === "world" && world_items.length < MAX_WORLD) {
            world_items.push({
              label:   String(it.label || ""),
              year:    yr.year,
              source:  "historical_json",
            });
          } else if (it.lane === "ghost" && ghost_items.length < MAX_GHOST) {
            ghost_items.push({
              label:   String(it.label || ""),
              year:    yr.year,
              source:  "life_stage_template",
            });
          }
        }
      }
    }

    // If we have nothing to say, return null so Lori isn't nudged
    // by an empty chronology block.
    if (!personal_items.length && !world_items.length && !ghost_items.length) {
      return null;
    }

    return {
      visible: true,
      focus_year: focusYear,
      focus_era:  focusEra,
      personal_items,
      world_items,
      ghost_items,
    };
  } catch (err) {
    console.warn("[WO-CR-PACK-01] crBuildChronologyContext failed:", err);
    return null;
  }
}

/* ── Init: load accordion on narrator switch ────────────────── */
async function crInitAccordion() {
  if (crCheckTrainerIsolation()) return;

  const pid = state.person_id;
  if (!pid) {
    crHideAccordion();
    return;
  }

  // CR-04: clear any stale focus from the previous narrator
  if (state.chronologyAccordion) {
    state.chronologyAccordion.focus = null;
  }

  const data = await crFetchAccordion(pid);
  if (!data || data.error === "no_dob") {
    crHideAccordion();
    return;
  }

  crRenderAccordion(data);
  crShowAccordion();
}

/* ── Hook into narrator load cycle ──────────────────────────── */
// Called after narrator is fully loaded.  Hooks are set up in the
// inline <script> block in lorevox10.0.html that wraps the
// existing window.onload.
//
// We expose crInitAccordion globally so it can be called from:
//   1. Narrator switch completion
//   2. Timeline spine initialization
//   3. After identity onboarding completes (DOB captured)
window.crInitAccordion = crInitAccordion;
window.crHideAccordion = crHideAccordion;
window.crShowAccordion = crShowAccordion;
window.crCheckTrainerIsolation = crCheckTrainerIsolation;
window.crToggleExpand = crToggleExpand;
window.crToggleDecade = crToggleDecade;
window.crToggleYear = crToggleYear;
window.crJumpToEra = crJumpToEra;
window.crOnItemClick = crOnItemClick;
window.crBuildChronologyContext = crBuildChronologyContext;
