/* Lori 7.1 — Runtime71 Debug Overlay
   Shows live runtime71 state in the UI for testing.
   Toggle: Ctrl+Shift+D  or  window.LORI71.toggleDebug()
   Namespace: window.LORI71
*/
if (typeof window.LORI71 === "undefined") window.LORI71 = {};

// ── Panel creation ────────────────────────────────────────────────────────────
window.LORI71.ensureDebugOverlay = function ensureDebugOverlay(){
  if (document.getElementById("runtime71DebugOverlay")) return;

  const panel = document.createElement("div");
  panel.id = "runtime71DebugOverlay";
  panel.style.cssText = [
    "display:none",
    "position:fixed",
    "right:14px",
    "bottom:14px",
    "width:320px",
    "max-width:calc(100vw - 28px)",
    "background:rgba(10,14,24,.95)",
    "border:1.5px solid rgba(124,156,255,.35)",
    "border-radius:12px",
    "box-shadow:0 18px 40px rgba(0,0,0,.5)",
    "padding:12px 12px 10px 12px",
    "z-index:9999",
    "font-family:Inter,system-ui,sans-serif",
    "color:#dbe4ff",
    "backdrop-filter:blur(12px)",
    "cursor:default",
  ].join(";");

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:move;" id="runtime71DragHandle">
      <div style="font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9db4ff;">⚙ runtime71</div>
      <div style="display:flex;gap:6px;">
        <button id="runtime71RefreshBtn" style="background:#1e293b;color:#dbe4ff;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;">↻</button>
        <button id="runtime71CollapseBtn" style="background:#1e293b;color:#dbe4ff;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;">Hide</button>
      </div>
    </div>
    <div id="runtime71DebugBody"></div>
    <div id="runtime71CogLog" style="display:none;margin-top:8px;"></div>
    <div id="runtime71Ts" style="font-size:9px;color:#334155;text-align:right;margin-top:6px;"></div>
  `;

  document.body.appendChild(panel);

  document.getElementById("runtime71RefreshBtn").onclick = () => window.LORI71.updateDebugOverlay();
  document.getElementById("runtime71CollapseBtn").onclick = () => {
    const body = document.getElementById("runtime71DebugBody");
    const btn  = document.getElementById("runtime71CollapseBtn");
    const log  = document.getElementById("runtime71CogLog");
    if (!body) return;
    const hidden = body.style.display === "none";
    body.style.display = hidden ? "block" : "none";
    if (log) log.style.display = hidden ? "" : "none";
    btn.textContent = hidden ? "Hide" : "Show";
  };

  // Drag support
  const handle = document.getElementById("runtime71DragHandle");
  let dragging=false, ox=0, oy=0;
  handle.addEventListener("mousedown", e => {
    dragging=true; ox=e.clientX-panel.getBoundingClientRect().left; oy=e.clientY-panel.getBoundingClientRect().top; e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    panel.style.left=(e.clientX-ox)+"px"; panel.style.top=(e.clientY-oy)+"px";
    panel.style.right="auto"; panel.style.bottom="auto";
  });
  document.addEventListener("mouseup", () => { dragging=false; });
};

// ── State snapshot ────────────────────────────────────────────────────────────
window.LORI71.runtime71Snapshot = function runtime71Snapshot(){
  const st       = window.state || {};
  const timeline = st.timeline || {};
  const session  = st.session  || {};
  const runtime  = st.runtime  || {};

  // Support both .lifePeriods (our schema) and .periods (bundle schema)
  const spine   = timeline.spine || {};
  const periods = (spine.lifePeriods || spine.periods || []).length;

  // Prefer getter functions when available (state.js exports them)
  const cp  = (typeof getCurrentPass  === "function") ? getCurrentPass()  : session.currentPass  || "pass1";
  const era = (typeof getCurrentEra   === "function") ? getCurrentEra()   : session.currentEra   || null;
  const md  = (typeof getCurrentMode  === "function") ? getCurrentMode()  : session.currentMode  || "open";

  return {
    current_pass:       cp,
    current_era:        era,
    current_mode:       md,
    affect_state:       runtime.affectState       || "neutral",
    affect_confidence:  runtime.affectConfidence  || 0,
    cognitive_mode:     runtime.cognitiveMode     || null,
    fatigue_score:      Number(runtime.fatigueScore || 0),
    seed_ready:         !!timeline.seedReady,
    life_periods:       periods,
    memories:           Array.isArray(timeline.memories) ? timeline.memories.length : 0,
    cog_reason_log:     runtime.cognitiveReasonLog || [],
  };
};

// ── Render ────────────────────────────────────────────────────────────────────
window.LORI71.updateDebugOverlay = function updateDebugOverlay(){
  window.LORI71.ensureDebugOverlay();
  const panel = document.getElementById("runtime71DebugOverlay");
  if (!panel || panel.style.display === "none") return;

  const body = document.getElementById("runtime71DebugBody");
  if (!body) return;

  const s = window.LORI71.runtime71Snapshot();

  const passColors = { pass1:"#fbbf24", pass2a:"#34d399", pass2b:"#818cf8" };
  const modeColors = { recognition:"#fb923c", grounding:"#f87171", light:"#a5b4fc", open:"#94a3b8" };
  let fatCol = "#94a3b8";
  if (s.fatigue_score >= 70) fatCol = "#f87171";
  else if (s.fatigue_score >= 50) fatCol = "#fdba74";
  else if (s.fatigue_score >= 30) fatCol = "#fbbf24";

  const row = (label, value, color) => `
    <div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);">
      <span style="font-size:10.5px;color:#64748b;">${label}</span>
      <span style="font-size:10.5px;font-weight:600;color:${color||"#e2e8f0"};text-align:right;">${value===null||value===undefined||value===""?"—":value}</span>
    </div>`;

  const fatBar = `<div style="height:3px;background:#1e293b;border-radius:2px;margin:5px 0 3px;">
    <div style="height:100%;width:${Math.min(s.fatigue_score,100)}%;background:${fatCol};border-radius:2px;transition:width .4s;"></div></div>`;

  // v7.4B — visual signals snapshot for debug
  const vs         = (window.state && window.state.session && window.state.session.visualSignals) || {};
  const vsAge      = vs.timestamp ? Math.round((Date.now() - vs.timestamp) / 1000) : null;
  const vsFresh    = vsAge !== null && vsAge < 8;
  const vsBaseline = !!(window.state && window.state.session && window.state.session.affectBaseline && window.state.session.affectBaseline.established);
  const origin     = (location.origin && location.origin !== "null") ? location.origin : "file://";
  const isLocalhost = origin.startsWith("http://localhost") || origin.startsWith("http://127.");

  body.innerHTML = [
    `<div style="font-size:9px;letter-spacing:.08em;color:#475569;text-transform:uppercase;margin-bottom:3px;">Environment</div>`,
    row("origin", origin, isLocalhost ? "#86efac" : "#f87171"),
    `<div style="font-size:9px;letter-spacing:.08em;color:#475569;text-transform:uppercase;margin:6px 0 3px;">Session</div>`,
    row("current_pass",  s.current_pass,   passColors[s.current_pass] || "#e2e8f0"),
    row("current_era",   s.current_era,    "#fb923c"),
    row("current_mode",  s.current_mode,   modeColors[s.current_mode] || "#e2e8f0"),
    `<div style="font-size:9px;letter-spacing:.08em;color:#475569;text-transform:uppercase;margin:6px 0 3px;">Affect & Cognition</div>`,
    row("affect_state",       s.affect_state,      "#f9a8d4"),
    row("affect_confidence",  (s.affect_confidence*100).toFixed(0)+"%", "#fbcfe8"),
    row("cognitive_mode",     s.cognitive_mode || "—", modeColors[s.cognitive_mode] || "#86efac"),
    `<div style="font-size:9px;letter-spacing:.08em;color:#475569;text-transform:uppercase;margin:6px 0 3px;">Visual (7.4A)</div>`,
    row("visual.affectState", vs.affectState || "—",   vsFresh ? "#f9a8d4" : "#475569"),
    row("visual.confidence",  vs.confidence ? (vs.confidence*100).toFixed(0)+"%" : "—", "#fbcfe8"),
    row("visual.age",         vsAge !== null ? vsAge+"s" : "—", vsFresh ? "#86efac" : "#f87171"),
    row("baseline",           vsBaseline ? "✓ established" : "✗ pending", vsBaseline ? "#86efac" : "#94a3b8"),
    `<div style="font-size:9px;letter-spacing:.08em;color:#475569;text-transform:uppercase;margin:6px 0 3px;">Fatigue</div>`,
    row("fatigue_score", s.fatigue_score, fatCol),
    fatBar,
    `<div style="font-size:9px;letter-spacing:.08em;color:#475569;text-transform:uppercase;margin:6px 0 3px;">Timeline</div>`,
    row("seed_ready",    s.seed_ready ? "✓ ready" : "✗ not ready", s.seed_ready ? "#86efac" : "#f87171"),
    row("life_periods",  s.life_periods, "#e2e8f0"),
    row("memories",      s.memories,     "#e2e8f0"),
  ].join("");

  // Cognitive reason log (last 5 entries)
  const logEl = document.getElementById("runtime71CogLog");
  if (logEl && s.cog_reason_log.length) {
    const recent = s.cog_reason_log.slice(-5).reverse();
    logEl.style.display = "block";
    logEl.innerHTML = `<div style="font-size:9px;letter-spacing:.08em;color:#475569;text-transform:uppercase;margin-bottom:3px;">Cognitive auto-log</div>` +
      recent.map(e => `<div style="font-size:9px;color:#64748b;padding:1px 0;">${new Date(e.at).toLocaleTimeString()} → <span style="color:#86efac;">${e.mode}</span> <span style="color:#475569;">(${e.reason})</span></div>`).join("");
  } else if (logEl) {
    logEl.style.display = "none";
  }

  const ts = document.getElementById("runtime71Ts");
  if (ts) ts.textContent = "updated " + new Date().toLocaleTimeString();

  // Tooltip hint on runtime pills if they exist
  ["lori71PassBadge","lori71EraBadge","lori71ModeBadge"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.title = "runtime71 debug overlay active";
  });
};

// ── Toggle ────────────────────────────────────────────────────────────────────
window.LORI71.toggleDebug = function toggleDebug(force){
  window.LORI71.ensureDebugOverlay();
  const panel = document.getElementById("runtime71DebugOverlay");
  if (!panel) return;
  const show = (force !== undefined) ? force : (panel.style.display === "none");
  panel.style.display = show ? "block" : "none";
  if (show) window.LORI71.updateDebugOverlay();
};
// Alias for backward compat with our earlier __loriDebug
window.__loriDebug = window.LORI71.toggleDebug;

// ── Auto-hooks: wrap setPass/setEra/setMode to refresh overlay ────────────────
window.LORI71.installDebugOverlay = function installDebugOverlay(){
  window.LORI71.ensureDebugOverlay();
  window.LORI71.updateDebugOverlay();

  ["setPass","setEra","setMode"].forEach(fnName => {
    const flagKey = "_lori71_" + fnName + "Wrapped";
    if (typeof window[fnName] === "function" && !window.LORI71[flagKey]) {
      const orig = window[fnName];
      window[fnName] = function(v){
        const res = orig(v);
        setTimeout(window.LORI71.updateDebugOverlay, 0);
        return res;
      };
      window.LORI71[flagKey] = true;
    }
  });

  // Refresh on any click or input (catches era clicks, mode button presses, etc.)
  document.addEventListener("click", () => setTimeout(window.LORI71.updateDebugOverlay, 0), true);
  document.addEventListener("input", () => setTimeout(window.LORI71.updateDebugOverlay, 0), true);
};

// ── Keyboard shortcut: Ctrl+Shift+D ──────────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.shiftKey && e.key === "D") { e.preventDefault(); window.LORI71.toggleDebug(); }
});

// ── Auto-refresh every 2s while visible ──────────────────────────────────────
setInterval(() => {
  const panel = document.getElementById("runtime71DebugOverlay");
  if (panel && panel.style.display !== "none") window.LORI71.updateDebugOverlay();
}, 2000);

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function(){
  window.LORI71.installDebugOverlay();
});
