/* ═══════════════════════════════════════════════════════════════
   test-narrator-lab.js — WO-QA-01 Quality Harness operator panel
   Lorevox / Lorevox 1.0

   Thin UI over the /api/test-lab/* endpoints. Launches the harness,
   polls status, lists prior runs, renders scores / compare / summary
   / transcript samples. Does NOT score anything itself — reads the
   JSON artifacts the runner produces.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  // WO-QA-01: Lorevox's UI server on 8082 is a plain static file server —
  // it does NOT proxy /api/* to the FastAPI backend. Use the same ORIGIN
  // constant api.js uses, which points at http://localhost:8000 by default.
  const _origin = (typeof ORIGIN !== "undefined" && ORIGIN)
    ? ORIGIN
    : (window.LOREVOX_API || "http://localhost:8000");

  const API = {
    run:     _origin + "/api/test-lab/run",
    status:  _origin + "/api/test-lab/status",
    results: _origin + "/api/test-lab/results",
    result:  (id) => `${_origin}/api/test-lab/results/${encodeURIComponent(id)}`,
    reset:   _origin + "/api/test-lab/reset",
    gpu:     _origin + "/api/test-lab/gpu",
    system:  _origin + "/api/test-lab/system",
    logTail: _origin + "/api/test-lab/log-tail?lines=40",
  };

  async function jget(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  async function jpost(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  function byId(id) { return document.getElementById(id); }
  function clearNode(el) { if (el) el.innerHTML = ""; }
  function setText(id, value) {
    const el = byId(id);
    if (el) el.textContent = value ?? "";
  }

  /* ── Status ──────────────────────────────────────────────── */
  function _fmtSec(s) {
    if (s == null) return "?";
    const total = Math.round(s);
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  function renderStatus(status) {
    const el = byId("testLabStatus");
    if (!el) return;
    let txt = `Status: ${status.state || "idle"}`;
    if (status.pid)           txt += ` (pid ${status.pid})`;
    if (status.run_label)     txt += ` · label=${status.run_label}`;
    if (status.latest_run)    txt += ` · latest=${status.latest_run}`;
    if (status.compare_to)    txt += ` · compare=${status.compare_to}`;
    if (status.dry_run)       txt += ` · dry-run`;
    // WO-QA-02: live elapsed + ETA from progress.json
    if (status.progress) {
      const p = status.progress;
      if (p.cells_total) {
        txt += ` · ${p.cells_completed}/${p.cells_total} cells`;
      }
      if (p.elapsed_sec != null) {
        txt += ` · elapsed ${_fmtSec(p.elapsed_sec)}`;
      }
      if (p.eta_sec != null && status.state === "running") {
        txt += ` · ETA ${_fmtSec(p.eta_sec)}`;
      }
    }
    el.textContent = txt;
  }

  /* ── Run list / compare dropdown ─────────────────────────── */
  function renderRuns(runs) {
    const runSel = byId("testLabRuns");
    const cmpSel = byId("testLabCompareTo");
    for (const sel of [runSel, cmpSel]) {
      if (!sel) continue;
      const current = sel.value;
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = (sel.id === "testLabCompareTo")
        ? "No compare baseline"
        : "Select run to load";
      sel.appendChild(opt0);
      for (const run of runs || []) {
        const opt = document.createElement("option");
        opt.value = run;
        opt.textContent = run;
        sel.appendChild(opt);
      }
      if (current && (runs || []).includes(current)) sel.value = current;
    }
  }

  /* ── Scores table ────────────────────────────────────────── */
  function td(value, attrs) {
    const c = document.createElement("td");
    c.textContent = value == null ? "" : String(value);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, v);
    }
    return c;
  }

  function renderScores(scores) {
    const body = byId("testLabScoreBody");
    clearNode(body);
    if (!body) return;
    for (const row of scores || []) {
      const tr = document.createElement("tr");
      tr.appendChild(td(row.narrator_style));
      tr.appendChild(td(row.config_id));
      // WO-QA-02: suppression is primary; old runs fall back to inverted yield
      tr.appendChild(td(row.suppression ?? (row.proposal_row_yield != null ? -row.proposal_row_yield : null)));
      tr.appendChild(td(row.archive_yield_ceiling));
      tr.appendChild(td(row.lori_yield_total ?? row.proposal_row_yield));
      tr.appendChild(td(row.avg_ttft_ms));
      tr.appendChild(td(row.avg_tokens_per_sec));
      tr.appendChild(td(row.contamination_pass, { "data-contam": String(row.contamination_pass) }));
      tr.appendChild(td(row.blocked_cells));
      tr.appendChild(td(row.avg_human_score));
      body.appendChild(tr);
    }
  }

  function renderNarratorCeilings(ceilings) {
    const body = byId("testLabCeilingBody");
    clearNode(body);
    if (!body) return;
    if (!ceilings || typeof ceilings !== "object") return;
    for (const [style, c] of Object.entries(ceilings)) {
      const tr = document.createElement("tr");
      tr.appendChild(td(style));
      tr.appendChild(td(c.total));
      tr.appendChild(td(c.statement_count));
      tr.appendChild(td(c.avg_per_statement));
      body.appendChild(tr);
    }
  }

  function renderCompare(compareRows) {
    const body = byId("testLabCompareBody");
    clearNode(body);
    if (!body) return;
    for (const row of compareRows || []) {
      const tr = document.createElement("tr");
      tr.appendChild(td(row.narrator_style));
      tr.appendChild(td(row.config_id));
      // WO-QA-02: prefer suppression_delta; old comparisons used yield_delta
      tr.appendChild(td(row.suppression_delta ?? row.yield_delta));
      tr.appendChild(td(row.ttft_delta_ms));
      tr.appendChild(td(row.contamination_delta));
      body.appendChild(tr);
    }
  }

  function renderSummary(summary) { setText("testLabSummary", summary || ""); }

  function renderConfigs(configsDoc) {
    const el = byId("testLabConfigs");
    if (!el) return;
    const lines = [];
    for (const cfg of (configsDoc?.configs || [])) {
      lines.push(
        `${cfg.id}: temp=${cfg.temperature}, top_p=${cfg.top_p}, ` +
        `rep=${cfg.repetition_penalty}, max_new=${cfg.max_new_tokens}`
      );
    }
    el.textContent = lines.join("\n");
  }

  function renderTranscripts(transcripts) {
    const el = byId("testLabTranscripts");
    if (!el) return;
    const rows = [];
    for (const t of (transcripts || []).slice(0, 18)) {
      rows.push(`[${t.narrator_style} | ${t.config_id} | ${t.scenario_id}]`);
      rows.push(`PROMPT: ${t.prompt}`);
      rows.push(`RESPONSE: ${t.response}`);
      rows.push("");
    }
    el.textContent = rows.join("\n");
  }

  /* ── Polling + actions ───────────────────────────────────── */
  async function refreshStatus() {
    try { renderStatus(await jget(API.status)); }
    catch (e) { renderStatus({ state: `error: ${e.message}` }); }
  }

  /* ── Live console: GPU + CPU + RAM + log tail, every 2s ───── */
  function renderSystem(s) {
    const elGpu = byId("testLabGpuLine");
    const elCpu = byId("testLabCpuLine");
    if (!s || s.ok === false) {
      if (elGpu) elGpu.textContent = `GPU: ${s?.error || "unavailable"}`;
      if (elCpu) elCpu.textContent = "CPU/RAM: unavailable";
      return;
    }
    const g = s.gpu || {};
    if (elGpu) {
      if (g.ok === false) {
        elGpu.textContent = `GPU: ${g.error || "unavailable"}`;
      } else {
        elGpu.textContent =
          `GPU ${g.util_pct}%   VRAM ${g.vram_used_mib}/${g.vram_total_mib} MiB   ` +
          `${g.temp_c}°C   ${g.power_w}W`;
      }
    }
    const cpu = s.cpu || {};
    const ram = s.ram || {};
    if (elCpu) {
      elCpu.textContent =
        `CPU ${cpu.util_pct ?? "?"}%   ` +
        `RAM ${ram.used_mib ?? "?"}/${ram.total_mib ?? "?"} MiB`;
    }
  }

  function renderLogTail(data) {
    const el = byId("testLabLogTail");
    if (!el) return;
    if (!data || data.ok === false) {
      el.textContent = data?.error || "(log unavailable)";
      return;
    }
    const lines = (data.lines || []);
    el.textContent = lines.length ? lines.join("\n") : "(no runner.log yet)";
    el.scrollTop = el.scrollHeight;  // auto-scroll to bottom
  }

  function renderRunMeta(meta) {
    const el = byId("testLabTiming");
    if (!el) return;
    if (!meta) {
      el.textContent = "(no timing data for this run)";
      return;
    }
    const lines = [
      `Total: ${_fmtSec(meta.matrix_duration_sec)}`,
      `Cells: ${meta.cells_completed} / ${meta.cells_total}`,
      `Avg cell: ${_fmtSec(meta.avg_cell_sec)}    fastest: ${_fmtSec(meta.min_cell_sec)}    slowest: ${_fmtSec(meta.max_cell_sec)}`,
    ];
    if (Array.isArray(meta.per_cell) && meta.per_cell.length > 0) {
      const sorted = [...meta.per_cell].sort((a, b) => b.duration_sec - a.duration_sec);
      lines.push("");
      lines.push("Per cell (slowest first):");
      for (const c of sorted) {
        lines.push(`  ${c.narrator_style} × ${c.config_id}: ${_fmtSec(c.duration_sec)}`);
      }
    }
    el.textContent = lines.join("\n");
  }

  function renderHardwareSummary(summary) {
    const el = byId("testLabHwSummary");
    if (!el) return;
    if (!summary) {
      el.textContent = "(no hardware timeseries for this run)";
      return;
    }
    const lines = [
      `Samples: ${summary.sample_count ?? "?"} @ ${summary.interval_sec ?? "?"}s`,
      `GPU util:  avg ${summary.gpu_util_avg ?? "?"}%   peak ${summary.gpu_util_peak ?? "?"}%`,
      `VRAM:      peak ${summary.vram_peak_mib ?? "?"} MiB`,
      `CPU util:  avg ${summary.cpu_util_avg ?? "?"}%   peak ${summary.cpu_util_peak ?? "?"}%`,
      `RAM used:  peak ${summary.ram_peak_mib ?? "?"} MiB`,
      `GPU temp:  peak ${summary.gpu_temp_peak ?? "?"}°C`,
    ];
    el.textContent = lines.join("\n");
  }

  async function refreshLive() {
    try { renderSystem(await jget(API.system)); } catch (e) { renderSystem({ok:false,error:e.message}); }
    try { renderLogTail(await jget(API.logTail)); } catch (e) { renderLogTail({ok:false,error:e.message}); }
  }

  async function refreshRuns() {
    try {
      const data = await jget(API.results);
      renderRuns(data.runs || []);
    } catch (e) { console.error("[WO-QA-01] refreshRuns failed:", e); }
  }

  async function loadRun(runId) {
    if (!runId) return;
    const data = await jget(API.result(runId));
    renderNarratorCeilings(data.narrator_ceilings);   // WO-QA-02 Channel A
    renderScores(data.scores);
    renderCompare(data.compare);
    renderSummary(data.summary);
    renderTranscripts(data.transcripts);
    renderConfigs(data.configs);
    renderHardwareSummary(data.hardware_summary);
    renderRunMeta(data.run_meta);                     // WO-QA-02 timing
    setText("testLabLoadedRun", `Loaded run: ${runId}`);
  }

  async function loadSelectedRun() {
    const sel = byId("testLabRuns");
    if (!sel || !sel.value) return;
    await loadRun(sel.value);
  }

  async function startRun() {
    const compareTo = byId("testLabCompareTo")?.value || "";
    const runLabel  = byId("testLabRunLabel")?.value.trim() || "";
    const dryRun    = !!byId("testLabDryRun")?.checked;
    try {
      await jpost(API.run, {
        compare_to: compareTo || null,
        run_label:  runLabel || null,
        dry_run:    dryRun,
      });
      await refreshStatus();
      await refreshRuns();
    } catch (e) {
      alert(`Test Lab failed to start: ${e.message}`);
    }
  }

  async function resetLab() {
    await jpost(API.reset, {});
    await refreshStatus();
  }

  function wire() {
    byId("testLabRunBtn")?.addEventListener("click", startRun);
    byId("testLabResetBtn")?.addEventListener("click", resetLab);
    byId("testLabRefreshBtn")?.addEventListener("click", async () => {
      await refreshStatus();
      await refreshRuns();
    });
    byId("testLabRuns")?.addEventListener("change", loadSelectedRun);

    refreshStatus();
    refreshRuns();
    refreshLive();
    setInterval(refreshStatus, 3000);
    setInterval(refreshLive, 2000);
  }

  window.initTestNarratorLab = wire;
})();
