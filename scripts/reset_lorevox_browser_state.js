/**
 * reset_lorevox_browser_state.js — Lorevox 9.0 Phase O
 * ─────────────────────────────────────────────────────
 * Browser-side reset script for Lorevox test harness.
 *
 * Clears all Lorevox-scoped browser state (localStorage, sessionStorage,
 * Cache Storage, service workers) WITHOUT touching non-Lorevox data.
 *
 * Usage:
 *   Inject into browser console, or execute via automation tool.
 *   Returns a summary object: { cleared, cachesCleaned, swUnregistered }
 *
 * Modes:
 *   "clean"       — Full reset. Clears all Lorevox browser state.
 *   "persistence" — No-op. Preserves all state for continuity tests.
 *
 * Pass mode via global or query param:
 *   window.__lorevox_test_mode = "clean";          // before eval
 *   ?test_mode=clean                                // URL param
 *   Default: "clean"
 */
(function lorevoxTestReset() {
  "use strict";

  // ── Resolve mode ──────────────────────────────────────────────
  var params = new URLSearchParams(window.location.search);
  var mode = (
    window.__lorevox_test_mode ||
    params.get("test_mode") ||
    "clean"
  ).toLowerCase();

  if (mode === "persistence") {
    console.log("[lorevox-reset] Mode: persistence — skipping reset, state preserved.");
    return { mode: "persistence", cleared: 0, cachesCleaned: false, swUnregistered: false };
  }

  console.log("[lorevox-reset] Mode: clean — clearing Lorevox browser state...");

  // ── Key prefixes that belong to Lorevox ───────────────────────
  var LOREVOX_PREFIXES = [
    "lorevox_",
    "lvx_",
    "bb_",
    "lorevox_offline_profile_",
    "lorevox_qq_draft_",
    "lorevox_proj_draft_",
    "lorevox_qc_draft_",
    "lorevox_ft_draft_",
    "lorevox_lt_draft_",
    "lorevox_sources_draft_",
    "lorevox.spine."
  ];

  function isLorevoxKey(key) {
    for (var i = 0; i < LOREVOX_PREFIXES.length; i++) {
      if (key.indexOf(LOREVOX_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  // ── Clear localStorage ────────────────────────────────────────
  var cleared = 0;
  var lsKeys = Object.keys(localStorage);
  for (var i = 0; i < lsKeys.length; i++) {
    if (isLorevoxKey(lsKeys[i])) {
      console.log("[lorevox-reset]   LS remove: " + lsKeys[i]);
      localStorage.removeItem(lsKeys[i]);
      cleared++;
    }
  }

  // ── Clear sessionStorage ──────────────────────────────────────
  var ssKeys = Object.keys(sessionStorage);
  for (var j = 0; j < ssKeys.length; j++) {
    if (isLorevoxKey(ssKeys[j])) {
      console.log("[lorevox-reset]   SS remove: " + ssKeys[j]);
      sessionStorage.removeItem(ssKeys[j]);
      cleared++;
    }
  }

  // ── Clear Cache Storage ───────────────────────────────────────
  var cachesCleaned = false;
  if ("caches" in window) {
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        console.log("[lorevox-reset]   Cache delete: " + n);
        return caches.delete(n);
      }));
    }).then(function () {
      cachesCleaned = true;
      console.log("[lorevox-reset]   Cache Storage cleared.");
    }).catch(function (e) {
      console.warn("[lorevox-reset]   Cache Storage clear failed:", e);
    });
  }

  // ── Unregister service workers ────────────────────────────────
  var swUnregistered = false;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) {
        console.log("[lorevox-reset]   SW unregister: " + r.scope);
        r.unregister();
      });
      swUnregistered = regs.length > 0;
      console.log("[lorevox-reset]   Service workers unregistered: " + regs.length);
    }).catch(function (e) {
      console.warn("[lorevox-reset]   SW unregister failed:", e);
    });
  }

  console.log("[lorevox-reset] Done. Cleared " + cleared + " storage key(s).");

  return { mode: "clean", cleared: cleared, cachesCleaned: cachesCleaned, swUnregistered: swUnregistered };
})();
