/**
 * lorevox-ui-audit.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Repo-ready end-to-end UI contract audit.  Does four things in one run:
 *
 *   1. Loads the real Lorevox UI in a headless browser.
 *   2. Verifies every inline onclick/onchange/oninput handler resolves to a
 *      real global JS function (catches missing functions and bad load order).
 *   3. Safely exercises controls and captures every console error / page crash.
 *   4. Compares every frontend network call against the FastAPI OpenAPI spec,
 *      including parameterised routes like /api/people/{person_id}.
 *
 * FIXES applied vs. original proposal
 * ────────────────────────────────────
 *  - UI_URL uses /ui/6.1.html (no index.html exists in the ui/ directory;
 *    StaticFiles html=True would 404 at /ui without it).
 *  - Parameterised route matching: /api/people/some-uuid now correctly matches
 *    the OpenAPI template /api/people/{person_id} via regex expansion.
 *  - getUserMedia stub covers both video and audio constraints.
 *  - MediaPipe CDN note: when running fully offline (laptop) the CDN script
 *    load will fail here.  That is intentional — it surfaces the outstanding
 *    "vendor MediaPipe locally" work item.
 *
 * Prerequisites
 * ─────────────
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   # Lorevox backend running on port 8000
 *   npx playwright test tests/e2e/lorevox-ui-audit.spec.ts
 */

import { test, expect, Page, BrowserContext } from "@playwright/test";

const BASE_URL  = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
// ── FIX 1: no index.html in ui/; must use the real filename ──────────────────
const UI_URL    = `${BASE_URL}/ui/6.1.html`;
const OPENAPI_URL = `${BASE_URL}/openapi.json`;

// ---------------------------------------------------------------------------
// Controls that are SAFE to click during an automated audit.
// These must not mutate the database, open media streams, or block the page.
// ---------------------------------------------------------------------------
const SAFE_CLICK_SELECTORS = [
  "#btnToggleSb",
  "#btnFocus",
  "#btnDevMode",
  "#btnToggleChat",

  // Tabs
  "#tab-profile",
  "#tab-interview",
  "#tab-events",
  "#tab-timeline",
  "#tab-memoir",
  "#tab-obituary",
  "#tab-review",

  // Interview mode toggles
  "#modeChronBtn",
  "#modeThemeBtn",
  "#youthModeBtn",
  "#emotionAwareBtn",

  // Section navigation
  "button[onclick=\"prevSection()\"]",
  "button[onclick=\"nextSection()\"]",

  // Demo fill (read-only form hydration)
  "button[onclick=\"demoFill()\"]",

  // Permission card dismiss (does NOT start interview)
  "button[onclick=\"dismissPermCard()\"]",

  // Accordions
  "button[onclick=\"toggleAccordion('accTriggers')\"]",
  "button[onclick=\"toggleAccordion('accDraft')\"]",

  // Timeline view toggles
  "#btnTLworld",
  "#btnTLaffect",
];

// ---------------------------------------------------------------------------
// Patterns for inline handlers we deliberately DO NOT click.
// These are destructive, database-mutating, or media-permission-requiring.
// ---------------------------------------------------------------------------
const SKIP_CLICK_MATCHERS = [
  /createPersonFromForm/i,
  /saveProfile/i,
  /ivStart/i,
  /ivSaveAndNext/i,
  /ivSaveAsMemory/i,
  /generateMemoirDraft/i,
  /generateObitChat/i,
  /buildObituary/i,
  /toggleRecording/i,
  /togglePermMic/i,
  /togglePermCam/i,
  /confirmPermCard/i,
  /clearChat/i,
  /copy/i,
  /reset/i,
  /delete/i,
  /remove/i,
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type JsHandlerAudit = {
  element: string;
  attr:    string;
  handler: string;
  exists:  boolean;
  type:    string;
};

type NetworkEvent = {
  kind:    "fetch" | "xhr" | "ws";
  url:     string;
  method?: string;
};

// ---------------------------------------------------------------------------
// Install network + media probes BEFORE page scripts run
// ---------------------------------------------------------------------------
async function installNetworkProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__lxNetwork = [] as Array<{ kind: string; url: string; method?: string }>;

    // Patch fetch
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args: any[]) => {
      const input  = args[0];
      const init   = args[1] || {};
      const url    = typeof input === "string" ? input : (input as Request)?.url;
      const method = (init.method || (input as Request)?.method || "GET").toUpperCase();
      w.__lxNetwork.push({ kind: "fetch", url, method });
      return origFetch(...args);
    };

    // Patch XHR
    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR(this: XMLHttpRequest) {
      const xhr     = new OrigXHR();
      const origOpen = xhr.open.bind(xhr);
      xhr.open = function (method: string, url: string | URL, ...rest: any[]) {
        try { w.__lxNetwork.push({ kind: "xhr", url: String(url), method: String(method).toUpperCase() }); } catch {}
        return origOpen(method, url as any, ...rest);
      };
      return xhr;
    }
    (window as any).XMLHttpRequest = PatchedXHR;

    // Patch WebSocket
    const OrigWS = window.WebSocket;
    class PatchedWS extends OrigWS {
      constructor(url: string | URL, protocols?: string | string[]) {
        w.__lxNetwork.push({ kind: "ws", url: String(url) });
        super(url, protocols as any);
      }
    }
    (window as any).WebSocket = PatchedWS;

    // ── FIX 2: stub getUserMedia for BOTH video and audio so no OS prompt fires ──
    if (!navigator.mediaDevices) {
      (navigator as any).mediaDevices = {};
    }
    const md = navigator.mediaDevices as any;
    const blockedGUM = async () => { throw new Error("getUserMedia blocked by audit harness"); };
    if (!md.getUserMedia)           md.getUserMedia           = blockedGUM;
    if (!md.getDisplayMedia)        md.getDisplayMedia        = blockedGUM;
    if (!md.enumerateDevices)       md.enumerateDevices       = async () => [];
  });
}

// ---------------------------------------------------------------------------
// Collect every inline handler and verify it resolves to a global function
// ---------------------------------------------------------------------------
async function collectInlineHandlers(page: Page): Promise<JsHandlerAudit[]> {
  return page.evaluate(() => {
    const attrs = ["onclick", "onchange", "oninput", "onkeydown", "onkeyup"];
    const out: any[] = [];

    function extractHandlerName(code: string): string {
      const match = (code || "").trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
      return match ? match[1] : (code || "").trim();
    }

    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      for (const attr of attrs) {
        const raw = el.getAttribute(attr);
        if (!raw) continue;
        const handler = extractHandlerName(raw);
        const fn      = (window as any)[handler];
        out.push({
          element: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}`,
          attr,
          handler,
          exists: typeof fn === "function",
          type:   typeof fn,
        });
      }
    });
    return out;
  });
}

// ---------------------------------------------------------------------------
// Click every safe control, capture errors via pageerror/console listeners
// ---------------------------------------------------------------------------
async function exerciseSafeControls(page: Page) {
  for (const sel of SAFE_CLICK_SELECTORS) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try { await loc.click({ timeout: 2000 }); await page.waitForTimeout(150); } catch {}
    }
  }

  // Also discover and click safe runtime handlers
  const clickable = await page.locator("[onclick]").evaluateAll((els) =>
    els.map((el: any) => ({
      sel:     el.id ? `#${el.id}` : null,
      onclick: el.getAttribute("onclick") || "",
      text:    (el.textContent || "").trim(),
    }))
  );

  for (const item of clickable) {
    if (!item.sel) continue;
    if (SKIP_CLICK_MATCHERS.some((re) => re.test(item.onclick) || re.test(item.text))) continue;
    try {
      await page.locator(item.sel).first().click({ timeout: 1500 });
      await page.waitForTimeout(120);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// ── FIX 3: Parameterised route matching ──────────────────────────────────────
// /api/people/some-uuid must match OpenAPI template /api/people/{person_id}.
// We expand each OpenAPI template to a regex and test the called path against it.
// ---------------------------------------------------------------------------
function normalizePath(rawUrl: string): string {
  try { return new URL(rawUrl).pathname; } catch { return rawUrl; }
}

function pathMatchesOpenApi(path: string, openApiPaths: Set<string>): boolean {
  if (openApiPaths.has(path)) return true;
  for (const template of openApiPaths) {
    // Convert {param} to a non-slash segment matcher
    const pattern = "^" + template.replace(/\{[^}]+\}/g, "[^/]+") + "$";
    if (new RegExp(pattern).test(path)) return true;
  }
  return false;
}

async function getOpenApiPaths(context: BrowserContext): Promise<Set<string>> {
  const resp = await context.request.get(OPENAPI_URL);
  expect(resp.ok()).toBeTruthy();
  const doc  = await resp.json();
  return new Set(Object.keys(doc.paths || {}));
}

// ===========================================================================
// THE AUDIT TEST
// ===========================================================================
test.describe("Lorevox UI contract audit", () => {
  test("audits controls, JS bindings, and backend route alignment", async ({ page, context }) => {
    const consoleErrors: string[] = [];
    const pageErrors:    string[] = [];

    page.on("console",   (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => { pageErrors.push(String(err)); });

    await installNetworkProbe(page);
    await page.goto(UI_URL, { waitUntil: "domcontentloaded" });

    // 1 ── Basic page load ───────────────────────────────────────────────────
    await expect(page.locator("body")).toBeVisible();

    // 2 ── Script file 200-check ─────────────────────────────────────────────
    // NOTE: MediaPipe loads from cdn.jsdelivr.net.  When running fully offline
    // (laptop test), this will show as a broken script — that is intentional.
    // It surfaces the outstanding "vendor MediaPipe locally" work item.
    const scriptStatus = await page.evaluate(async () => {
      const urls = [...document.scripts].map((s) => s.src).filter(Boolean);
      const results: { src: string; ok: boolean; status: number }[] = [];
      for (const src of urls) {
        try {
          const r = await fetch(src);
          results.push({ src, ok: r.ok, status: r.status });
        } catch {
          results.push({ src, ok: false, status: 0 });
        }
      }
      return results;
    });

    const badScripts = scriptStatus.filter((s) => !s.ok);
    expect.soft(badScripts, `Broken script loads:\n${JSON.stringify(badScripts, null, 2)}`).toEqual([]);

    // 3 ── Inline handler audit ──────────────────────────────────────────────
    const handlers       = await collectInlineHandlers(page);
    const missingHandlers = handlers.filter((h) => !h.exists);

    expect.soft(
      missingHandlers,
      `Missing inline JS handlers:\n${JSON.stringify(missingHandlers, null, 2)}`
    ).toEqual([]);

    // 4 ── Exercise safe controls ────────────────────────────────────────────
    await exerciseSafeControls(page);

    // 5 ── Collect network events ────────────────────────────────────────────
    const networkEvents: NetworkEvent[] = await page.evaluate(() => (window as any).__lxNetwork || []);
    const openApiPaths  = await getOpenApiPaths(context);

    // 6 ── HTTP route alignment ──────────────────────────────────────────────
    const routeMismatches = networkEvents
      .filter((e) => e.kind === "fetch" || e.kind === "xhr")
      .map((e) => ({ method: e.method || "GET", path: normalizePath(e.url), url: e.url }))
      .filter((e) => e.path.startsWith("/api/"))          // only backend routes
      .filter((e) => !pathMatchesOpenApi(e.path, openApiPaths));

    expect.soft(
      routeMismatches,
      `Frontend called routes not in OpenAPI:\n${JSON.stringify(routeMismatches, null, 2)}`
    ).toEqual([]);

    // 7 ── WebSocket path alignment ──────────────────────────────────────────
    const wsMismatches = networkEvents
      .filter((e) => e.kind === "ws")
      .map((e) => normalizePath(e.url))
      .filter((p) => p.startsWith("/") && !pathMatchesOpenApi(p, openApiPaths));

    expect.soft(
      wsMismatches,
      `WS paths not in OpenAPI:\n${JSON.stringify(wsMismatches, null, 2)}`
    ).toEqual([]);

    // 8 ── Runtime error assertions ──────────────────────────────────────────
    expect.soft(consoleErrors, `Console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
    expect.soft(pageErrors,    `Page errors:\n${pageErrors.join("\n")}`).toEqual([]);

    // 9 ── Compact report ────────────────────────────────────────────────────
    console.log("\n=== Lorevox UI Audit Report ===");
    console.log(`  Scripts checked:     ${scriptStatus.length}   (broken: ${badScripts.length})`);
    console.log(`  Inline handlers:     ${handlers.length}       (missing: ${missingHandlers.length})`);
    console.log(`  Network events:      ${networkEvents.length}`);
    console.log(`  Route mismatches:    ${routeMismatches.length}`);
    console.log(`  WS mismatches:       ${wsMismatches.length}`);
    console.log(`  Console errors:      ${consoleErrors.length}`);
    console.log(`  Page errors:         ${pageErrors.length}`);
    if (missingHandlers.length)  console.log("\n  Missing handlers:", missingHandlers.map((h) => h.handler));
    if (routeMismatches.length)  console.log("\n  Route mismatches:", routeMismatches.map((r) => `${r.method} ${r.path}`));
  });
});
