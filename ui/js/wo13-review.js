/* ═══════════════════════════════════════════════════════════════════════
   wo13-review.js — WO-13 Phase 6 Review UI
   Lorevox / Lorevox v6.1
   Load order: after api.js, app.js (needs API and state to exist).

   This file wires the Review Queue drawer, the row-detail modal,
   the help popup, the contamination banner and the bulk-dismiss flow
   on top of the family-truth endpoints introduced in WO-13 phases 1–4:

     GET    /api/family-truth/rows?person_id=...
     PATCH  /api/family-truth/row/{row_id}
     GET    /api/family-truth/audit/{row_id}
     POST   /api/family-truth/promote
     POST   /api/transcript/rolling-summary/clean?person_id=...

   The five-status review vocabulary is:
     approve         — confirmed truth, safe to promote
     approve_q       — approved with a follow-up question
     needs_verify    — maybe true, needs more evidence (default for rules_fallback)
     source_only     — recorded as "the narrator said X" but never promoted
                       (the only status allowed for protected identity fields
                        like personal.fullName, personal.dateOfBirth, etc.)
     reject          — wrong, contamination, stress-test, meta-command junk
═══════════════════════════════════════════════════════════════════════ */
(function(global){
  "use strict";

  // ── Status vocabulary ────────────────────────────────────────────────────
  // ORDER MATTERS — drives tab order in the drawer.
  const WO13_STATUSES = Object.freeze([
    "needs_verify",
    "approve",
    "approve_q",
    "source_only",
    "reject",
  ]);

  const WO13_STATUS_LABEL = Object.freeze({
    needs_verify: "Needs verify",
    approve:      "Approve",
    approve_q:    "Approve + question",
    source_only:  "Source only",
    reject:       "Reject",
  });

  const WO13_STATUS_HELP = Object.freeze({
    needs_verify: "Maybe true — we don't have enough to promote yet.",
    approve:      "Confirmed. Safe to promote into the family-truth layer.",
    approve_q:    "Confirmed, but we want to circle back and ask a follow-up.",
    source_only:  "Record that the narrator said this, but never promote it. "
                 +"Identity fields (fullName, DOB, POB, preferredName, birthOrder) "
                 +"can only ever land here from the rules_fallback extractor.",
    reject:       "Not true. Stress-test junk, meta-commands, contamination, "
                 +"or a misread — don't propagate it anywhere.",
  });

  // Five identity fields that cannot be promoted via rules_fallback.
  // This MUST match app.js _WO13_PROTECTED_IDENTITY_FIELDS and the server.
  const WO13_PROTECTED_IDENTITY_FIELDS = Object.freeze([
    "personal.fullName",
    "personal.preferredName",
    "personal.dateOfBirth",
    "personal.placeOfBirth",
    "personal.birthOrder",
  ]);

  // Four extraction method tags from Phase 4 (+ a few legacy ones that may
  // still live in the DB from before the flip). Anything else renders as
  // "other".
  const WO13_EXTRACTION_METHODS = Object.freeze([
    "llm", "rules", "hybrid", "rules_fallback",
    "backfill", "manual", "questionnaire",
  ]);

  // ── Pure helpers — no DOM, no fetch, unit-testable ──────────────────────

  /**
   * Normalise a row coming from /api/family-truth/rows so the UI never has
   * to think about missing fields. Returns a shallow copy with the same
   * id/field semantics but guaranteed string/array defaults.
   */
  function wo13NormaliseRow(row){
    if(!row || typeof row !== "object") return null;
    const out = Object.assign({}, row);
    out.id            = String(row.id || row.row_id || "");
    out.subject_name  = String(row.subject_name || "").trim();
    out.relationship  = String(row.relationship || "").trim();
    out.field         = String(row.field || "").trim();
    out.source_says   = String(row.source_says || "").trim();
    out.status        = String(row.status || "needs_verify").trim();
    out.confidence    = typeof row.confidence === "number" ? row.confidence : 0.5;
    out.narrative_role= row.narrative_role || null;
    out.meaning_tags  = Array.isArray(row.meaning_tags) ? row.meaning_tags.slice() : [];
    out.extraction_method = String(row.extraction_method || "rules_fallback").trim();
    out.provenance    = (row.provenance && typeof row.provenance === "object") ? row.provenance : {};
    out.created_at    = row.created_at || null;
    out.note_id       = row.note_id || null;
    return out;
  }

  /** Group rows by status and return `{status: [rows]}` using the canonical
   *  order. Unknown statuses are dropped into "needs_verify" so nothing
   *  goes missing from the drawer. */
  function wo13GroupByStatus(rows){
    const groups = {};
    for(const s of WO13_STATUSES) groups[s] = [];
    for(const raw of (rows || [])){
      const r = wo13NormaliseRow(raw);
      if(!r) continue;
      const bucket = WO13_STATUSES.includes(r.status) ? r.status : "needs_verify";
      groups[bucket].push(r);
    }
    return groups;
  }

  /** Produce `{status: count}` counts for the filter tabs. Always returns
   *  every status, even ones with zero rows, so the tab layout is stable. */
  function wo13CountByStatus(rows){
    const counts = {};
    for(const s of WO13_STATUSES) counts[s] = 0;
    counts.all = 0;
    for(const raw of (rows || [])){
      const r = wo13NormaliseRow(raw);
      if(!r) continue;
      counts.all += 1;
      const bucket = WO13_STATUSES.includes(r.status) ? r.status : "needs_verify";
      counts[bucket] += 1;
    }
    return counts;
  }

  /** True when the field name is a protected identity field. */
  function wo13IsProtectedIdentityField(field){
    return WO13_PROTECTED_IDENTITY_FIELDS.includes(String(field || "").trim());
  }

  /** Return the set of statuses the UI should ALLOW the user to pick for a
   *  given row. Protected identity fields collapse to just two:
   *    - source_only (accept that the narrator said this)
   *    - reject      (mark it as wrong)
   *  Everything else has access to all five statuses. */
  function wo13AllowedStatusesForRow(row){
    const r = wo13NormaliseRow(row) || {};
    if(wo13IsProtectedIdentityField(r.field)){
      return ["source_only", "reject"];
    }
    return WO13_STATUSES.slice();
  }

  /** Decide whether a row is promotable. A row is promotable iff
   *  status==="approve" AND it is NOT a protected identity field coming
   *  from rules_fallback AND the row has a subject_name + field. */
  function wo13IsPromotable(row){
    const r = wo13NormaliseRow(row);
    if(!r) return false;
    if(r.status !== "approve") return false;
    if(!r.subject_name || !r.field) return false;
    if(wo13IsProtectedIdentityField(r.field)
       && r.extraction_method === "rules_fallback"){
      return false;
    }
    return true;
  }

  /**
   * Decide whether the contamination banner should show up, based on the
   * rolling-summary payload (the one served by
   * /api/transcript/rolling-summary, which filter_rolling_summary_for_narrator
   * now stamps with a `wo13_filtered` block).
   *
   * Returns { show, total, reasons } — `show` is true when anything has
   * actually been dropped. `reasons` is a {reason: count} object copied
   * directly from the server payload so the UI can render a breakdown.
   */
  function wo13ContaminationBannerState(rollingSummary){
    const f = rollingSummary && rollingSummary.wo13_filtered;
    if(!f) return { show: false, total: 0, reasons: {} };
    const dropped = (f.dropped_scored_items || 0)
                  + (f.dropped_threads || 0)
                  + (f.dropped_facts || 0);
    const reasons = (f.dropped_reasons && typeof f.dropped_reasons === "object")
      ? Object.assign({}, f.dropped_reasons) : {};
    return {
      show: dropped > 0 || Object.keys(reasons).length > 0,
      total: dropped,
      reasons,
    };
  }

  /**
   * Select the row IDs to target with a bulk action. Given the full row
   * list and a filter status ("all" or one of WO13_STATUSES), return the
   * IDs currently visible. Used by the bulk-dismiss button, which flips
   * everything in the visible tab to `reject`.
   */
  function wo13BulkTargetIds(rows, filterStatus){
    const out = [];
    for(const raw of (rows || [])){
      const r = wo13NormaliseRow(raw);
      if(!r || !r.id) continue;
      if(filterStatus === "all" || r.status === filterStatus){
        out.push(r.id);
      }
    }
    return out;
  }

  /**
   * Check whether the current narrator is read-only (reference narrator).
   * Mirrors _wo13IsReferenceNarrator from app.js but falls back safely if
   * the app.js helper isn't loaded (unit-test context).
   */
  function wo13IsCurrentNarratorReadOnly(){
    try{
      if(typeof global._wo13IsReferenceNarrator === "function"
         && global.state && global.state.person_id){
        return !!global._wo13IsReferenceNarrator(global.state.person_id);
      }
    }catch(e){}
    return false;
  }

  // ── Network glue (thin wrappers over the Phase 1–5 endpoints) ──────────

  async function wo13FetchRows(personId){
    if(!personId || typeof global.fetch !== "function"
       || typeof global.API === "undefined") return [];
    try{
      const res = await global.fetch(global.API.FT_ROWS_LIST(personId));
      if(!res.ok) return [];
      const data = await res.json().catch(()=>null);
      return Array.isArray(data && data.rows) ? data.rows : (Array.isArray(data) ? data : []);
    }catch(e){ return []; }
  }

  async function wo13PatchRowStatus(rowId, status, reviewerNote){
    if(!rowId || !status) return { ok: false };
    if(!WO13_STATUSES.includes(status)){
      return { ok: false, error: "invalid_status" };
    }
    try{
      const body = { status };
      if(reviewerNote) body.reviewer_note = String(reviewerNote).slice(0, 1000);
      const res = await global.fetch(global.API.FT_ROW_PATCH(rowId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: !!res.ok, status: res.status };
    }catch(e){ return { ok: false, error: String(e) }; }
  }

  async function wo13FetchAudit(rowId){
    if(!rowId) return null;
    try{
      const res = await global.fetch(global.API.FT_AUDIT(rowId));
      if(!res.ok) return null;
      return await res.json().catch(()=>null);
    }catch(e){ return null; }
  }

  async function wo13PromoteApproved(personId){
    if(!personId) return { ok: false };
    try{
      const res = await global.fetch(global.API.FT_PROMOTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId }),
      });
      return { ok: !!res.ok, status: res.status };
    }catch(e){ return { ok: false, error: String(e) }; }
  }

  async function wo13RunRollingSummaryClean(personId){
    if(!personId) return { ok: false };
    try{
      const res = await global.fetch(global.API.ROLLING_SUMMARY_CLEAN(personId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return { ok: !!res.ok, status: res.status };
    }catch(e){ return { ok: false, error: String(e) }; }
  }

  // ── DOM layer ───────────────────────────────────────────────────────────

  const WO13_IDS = {
    popover:  "wo13ReviewPopover",
    filters:  "wo13ReviewFilters",
    list:     "wo13ReviewList",
    banner:   "wo13ContaminationBanner",
    readOnly: "wo13ReadOnlyNotice",
    modal:    "wo13RowDetailModal",
    modalBody:"wo13RowDetailBody",
    help:     "wo13ReviewHelpPopover",
    bulkBtn:  "wo13BulkDismissBtn",
    promoteBtn:"wo13PromoteBtn",
  };

  const _wo13State = {
    rows: [],
    filter: "all",
    loading: false,
    rollingSummary: null,
  };

  function _wo13CurrentPersonId(){
    try{ return (global.state && global.state.person_id) || null; }
    catch(e){ return null; }
  }

  function _wo13H(str){
    return String(str == null ? "" : str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function _wo13RenderFilters(){
    const host = global.document && global.document.getElementById(WO13_IDS.filters);
    if(!host) return;
    const counts = wo13CountByStatus(_wo13State.rows);
    const tabs = [
      { key: "all", label: "All", count: counts.all },
      ...WO13_STATUSES.map(s => ({ key: s, label: WO13_STATUS_LABEL[s], count: counts[s] })),
    ];
    host.innerHTML = tabs.map(t => {
      const active = (_wo13State.filter === t.key) ? " wo13-tab-active" : "";
      return `<button class="wo13-tab${active}" data-wo13-filter="${_wo13H(t.key)}">`
           + `${_wo13H(t.label)} <span class="wo13-tab-count">${t.count}</span></button>`;
    }).join("");
    host.querySelectorAll("button[data-wo13-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        _wo13State.filter = btn.getAttribute("data-wo13-filter") || "all";
        _wo13RenderFilters();
        _wo13RenderList();
      });
    });
  }

  function _wo13RenderRow(row){
    const allowed = wo13AllowedStatusesForRow(row);
    const protectedField = wo13IsProtectedIdentityField(row.field);
    const methodBadge = `<span class="wo13-method wo13-method-${_wo13H(row.extraction_method)}">${_wo13H(row.extraction_method)}</span>`;
    const statusBadge = `<span class="wo13-status wo13-status-${_wo13H(row.status)}">${_wo13H(WO13_STATUS_LABEL[row.status] || row.status)}</span>`;
    const protBadge   = protectedField ? `<span class="wo13-protected" title="Protected identity field — rules_fallback can never promote this">identity</span>` : "";
    const conf        = (typeof row.confidence === "number") ? row.confidence.toFixed(2) : "—";
    const subj        = _wo13H(row.subject_name || "?");
    const field       = _wo13H(row.field || "?");
    const says        = _wo13H((row.source_says || "").slice(0, 260));
    const checkbox    = `<input type="checkbox" class="wo13-row-check" data-wo13-row-id="${_wo13H(row.id)}">`;
    const actions     = allowed.map(s => {
      const active = row.status === s ? " wo13-action-active" : "";
      return `<button class="wo13-action wo13-action-${s}${active}" data-wo13-row-id="${_wo13H(row.id)}" data-wo13-set="${s}" title="${_wo13H(WO13_STATUS_HELP[s] || s)}">${_wo13H(WO13_STATUS_LABEL[s] || s)}</button>`;
    }).join("");
    return `
      <div class="wo13-row" data-wo13-row-id="${_wo13H(row.id)}">
        <div class="wo13-row-head">
          ${checkbox}
          <div class="wo13-row-subject"><strong>${subj}</strong> · <code>${field}</code> ${protBadge}</div>
          <div class="wo13-row-badges">${statusBadge}${methodBadge}<span class="wo13-conf">conf ${conf}</span></div>
        </div>
        <div class="wo13-row-says">&ldquo;${says}&rdquo;</div>
        <div class="wo13-row-actions">
          ${actions}
          <button class="wo13-action wo13-action-detail" data-wo13-row-id="${_wo13H(row.id)}" data-wo13-detail="1">Details</button>
        </div>
      </div>`;
  }

  function _wo13RenderList(){
    const host = global.document && global.document.getElementById(WO13_IDS.list);
    if(!host) return;
    if(wo13IsCurrentNarratorReadOnly()){
      host.innerHTML = `<div id="${WO13_IDS.readOnly}" class="wo13-readonly-notice">
        <strong>Reference narrator — read only.</strong>
        Reference narrators (Shatner, Dolly, …) never produce proposal rows,
        so there is nothing here to review. Select a live narrator to see the queue.
      </div>`;
      const bulk = global.document.getElementById(WO13_IDS.bulkBtn);
      const promote = global.document.getElementById(WO13_IDS.promoteBtn);
      if(bulk) bulk.disabled = true;
      if(promote) promote.disabled = true;
      return;
    }
    const bulk = global.document.getElementById(WO13_IDS.bulkBtn);
    const promote = global.document.getElementById(WO13_IDS.promoteBtn);
    if(bulk) bulk.disabled = false;
    if(promote) promote.disabled = false;

    const filter = _wo13State.filter || "all";
    const visible = _wo13State.rows
      .map(wo13NormaliseRow)
      .filter(r => r && (filter === "all" || r.status === filter));

    if(!visible.length){
      host.innerHTML = _wo13State.loading
        ? `<div class="wo13-empty">Loading proposals…</div>`
        : `<div class="wo13-empty">No rows in <strong>${_wo13H(filter)}</strong>.</div>`;
      return;
    }
    host.innerHTML = visible.map(_wo13RenderRow).join("");

    // Wire row action buttons
    host.querySelectorAll("button[data-wo13-set]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const rowId = btn.getAttribute("data-wo13-row-id");
        const next = btn.getAttribute("data-wo13-set");
        btn.disabled = true;
        const res = await wo13PatchRowStatus(rowId, next);
        btn.disabled = false;
        if(res.ok){
          const row = _wo13State.rows.find(r => String(r.id) === String(rowId));
          if(row) row.status = next;
          _wo13RenderFilters();
          _wo13RenderList();
        }
      });
    });
    host.querySelectorAll("button[data-wo13-detail]").forEach(btn => {
      btn.addEventListener("click", () => {
        const rowId = btn.getAttribute("data-wo13-row-id");
        wo13OpenDetail(rowId).catch(()=>{});
      });
    });
  }

  function _wo13RenderBanner(){
    const host = global.document && global.document.getElementById(WO13_IDS.banner);
    if(!host) return;
    const state = wo13ContaminationBannerState(_wo13State.rollingSummary);
    if(!state.show){ host.style.display = "none"; host.innerHTML = ""; return; }
    const rows = Object.entries(state.reasons)
      .map(([k,v]) => `<li><code>${_wo13H(k)}</code> <span class="wo13-count">× ${v}</span></li>`)
      .join("");
    host.style.display = "block";
    host.innerHTML = `
      <div class="wo13-banner-head">
        <strong>Rolling-summary contamination filter active.</strong>
        <span class="wo13-banner-total">${state.total} item(s) dropped</span>
        <button class="wo13-banner-clean" type="button">Run cleanup again</button>
      </div>
      <ul class="wo13-banner-reasons">${rows}</ul>`;
    const btn = host.querySelector(".wo13-banner-clean");
    if(btn){
      btn.addEventListener("click", async () => {
        const pid = _wo13CurrentPersonId();
        if(!pid) return;
        btn.disabled = true;
        await wo13RunRollingSummaryClean(pid);
        btn.disabled = false;
        await wo13RefreshRollingSummary();
        _wo13RenderBanner();
      });
    }
  }

  async function wo13RefreshRollingSummary(){
    const pid = _wo13CurrentPersonId();
    if(!pid) return;
    try{
      const res = await global.fetch(global.API.ROLLING_SUMMARY_GET(pid));
      if(!res.ok) return;
      _wo13State.rollingSummary = await res.json().catch(()=>null);
    }catch(e){}
  }

  async function wo13OpenReviewDrawer(){
    const pop = global.document && global.document.getElementById(WO13_IDS.popover);
    if(pop && typeof pop.showPopover === "function" && !pop.matches(":popover-open")){
      try{ pop.showPopover(); }catch(e){}
    }
    await wo13ReloadReviewQueue();
  }

  async function wo13ReloadReviewQueue(){
    const pid = _wo13CurrentPersonId();
    if(!pid){
      _wo13State.rows = [];
      _wo13RenderFilters(); _wo13RenderList();
      return;
    }
    _wo13State.loading = true;
    _wo13RenderList();
    const rows = await wo13FetchRows(pid);
    _wo13State.rows = rows;
    _wo13State.loading = false;
    await wo13RefreshRollingSummary();
    _wo13RenderFilters();
    _wo13RenderList();
    _wo13RenderBanner();
  }

  async function wo13OpenDetail(rowId){
    const modal = global.document && global.document.getElementById(WO13_IDS.modal);
    const body  = global.document && global.document.getElementById(WO13_IDS.modalBody);
    if(!modal || !body) return;
    body.innerHTML = `<div class="wo13-empty">Loading audit trail…</div>`;
    if(typeof modal.showPopover === "function" && !modal.matches(":popover-open")){
      try{ modal.showPopover(); }catch(e){}
    }
    const audit = await wo13FetchAudit(rowId);
    const row = _wo13State.rows.find(r => String(r.id) === String(rowId));
    if(!row){ body.innerHTML = `<div class="wo13-empty">Row not found.</div>`; return; }
    const prov = row.provenance || {};
    body.innerHTML = `
      <div class="wo13-detail-head">
        <strong>${_wo13H(row.subject_name)}</strong> · <code>${_wo13H(row.field)}</code>
        <span class="wo13-status wo13-status-${_wo13H(row.status)}">${_wo13H(WO13_STATUS_LABEL[row.status] || row.status)}</span>
      </div>
      <div class="wo13-detail-says">&ldquo;${_wo13H(row.source_says || "")}&rdquo;</div>
      <div class="wo13-detail-meta">
        <div><b>Extraction method</b>: <code>${_wo13H(row.extraction_method)}</code></div>
        <div><b>Confidence</b>: ${_wo13H(row.confidence)}</div>
        <div><b>Narrative role</b>: ${_wo13H(row.narrative_role || "—")}</div>
        <div><b>Meaning tags</b>: ${(row.meaning_tags || []).map(_wo13H).join(", ") || "—"}</div>
        <div><b>Identity conflict</b>: ${prov.identity_conflict ? "yes" : "no"}</div>
        <div><b>Protected field</b>: ${_wo13H(prov.protected_field || "—")}</div>
      </div>
      <pre class="wo13-detail-audit">${_wo13H(JSON.stringify(audit || prov || {}, null, 2))}</pre>
    `;
  }

  async function wo13BulkDismissVisible(){
    if(wo13IsCurrentNarratorReadOnly()) return { ok: false, reason: "read_only" };
    const ids = wo13BulkTargetIds(_wo13State.rows, _wo13State.filter);
    if(!ids.length) return { ok: true, dismissed: 0 };
    let ok = 0;
    for(const id of ids){
      const res = await wo13PatchRowStatus(id, "reject");
      if(res.ok) ok += 1;
    }
    // Update local state
    _wo13State.rows = _wo13State.rows.map(r => {
      if(ids.includes(String(r.id))) return Object.assign({}, r, { status: "reject" });
      return r;
    });
    _wo13RenderFilters();
    _wo13RenderList();
    return { ok: true, dismissed: ok };
  }

  async function wo13PromoteClicked(){
    if(wo13IsCurrentNarratorReadOnly()) return { ok: false, reason: "read_only" };
    const pid = _wo13CurrentPersonId();
    if(!pid) return { ok: false };
    const res = await wo13PromoteApproved(pid);
    if(res.ok){
      await wo13ReloadReviewQueue();
      // WO-13 Phase 8: after a successful bulk promote, pull the fresh
      // promoted-truth profile back into state so memoir/obituary/chat
      // surfaces reflect it without a manual reload.
      try{
        if(typeof global.lvxRefreshProfileFromServer === "function"){
          await global.lvxRefreshProfileFromServer(pid);
        }
      }catch(e){ /* non-fatal — promote already succeeded */ }
    }
    return res;
  }

  function wo13OpenHelp(){
    const pop = global.document && global.document.getElementById(WO13_IDS.help);
    if(pop && typeof pop.showPopover === "function" && !pop.matches(":popover-open")){
      try{ pop.showPopover(); }catch(e){}
    }
  }

  function wo13AttachGlobalHandlers(){
    if(!global.document) return;
    const bulk = global.document.getElementById(WO13_IDS.bulkBtn);
    if(bulk && !bulk._wo13Wired){
      bulk.addEventListener("click", () => {
        if(!global.confirm || global.confirm("Reject every row in the current tab?"))
          wo13BulkDismissVisible().catch(()=>{});
      });
      bulk._wo13Wired = true;
    }
    const promote = global.document.getElementById(WO13_IDS.promoteBtn);
    if(promote && !promote._wo13Wired){
      promote.addEventListener("click", () => { wo13PromoteClicked().catch(()=>{}); });
      promote._wo13Wired = true;
    }
  }

  // ── Exports ─────────────────────────────────────────────────────────────
  const api = {
    // constants
    WO13_STATUSES,
    WO13_STATUS_LABEL,
    WO13_STATUS_HELP,
    WO13_PROTECTED_IDENTITY_FIELDS,
    WO13_EXTRACTION_METHODS,
    WO13_IDS,
    // pure helpers
    wo13NormaliseRow,
    wo13GroupByStatus,
    wo13CountByStatus,
    wo13IsProtectedIdentityField,
    wo13AllowedStatusesForRow,
    wo13IsPromotable,
    wo13ContaminationBannerState,
    wo13BulkTargetIds,
    wo13IsCurrentNarratorReadOnly,
    // network
    wo13FetchRows,
    wo13PatchRowStatus,
    wo13FetchAudit,
    wo13PromoteApproved,
    wo13RunRollingSummaryClean,
    // UI entry points
    wo13OpenReviewDrawer,
    wo13ReloadReviewQueue,
    wo13OpenDetail,
    wo13BulkDismissVisible,
    wo13PromoteClicked,
    wo13OpenHelp,
    wo13AttachGlobalHandlers,
    wo13RefreshRollingSummary,
    // internal, exported for tests
    _wo13State,
  };

  Object.assign(global, api);
  if(typeof module !== "undefined" && module.exports){ module.exports = api; }

  // Auto-wire when DOM is ready in a real browser.
  if(global.document && global.document.addEventListener){
    global.document.addEventListener("DOMContentLoaded", () => {
      try{ wo13AttachGlobalHandlers(); }catch(e){}
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
