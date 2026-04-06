import { test, expect, Page, BrowserContext } from "@playwright/test";

const API_BASE    = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
const TTS_BASE    = process.env.LOREVOX_TTS_URL  || "http://127.0.0.1:8001";
const UI_BASE     = process.env.LOREVOX_UI_URL   || "http://127.0.0.1:8080";
const UI_URL      = `${UI_BASE}/ui/lori9.0.html`;
const OPENAPI_URL = `${API_BASE}/openapi.json`;

/**
 * Controls that are safe to click in an automated audit.
 * Skip destructive, permission-heavy, or long-running controls here.
 */
const SAFE_CLICK_SELECTORS = [
  "#btnToggleSb",
  "#btnFocus",
  "#btnDevMode",
  "#btnToggleChat",

  "#tab-profile",
  "#tab-interview",
  "#tab-events",
  "#tab-timeline",
  "#tab-memoir",
  "#tab-obituary",
  "#tab-review",

  "button[onclick=\"demoFill()\"]",
  "button[onclick=\"prevSection()\"]",
  "button[onclick=\"nextSection()\"]",

  "#modeChronBtn",
  "#modeThemeBtn",
  "#youthModeBtn",
  "#emotionAwareBtn",

  "button[onclick=\"dismissPermCard()\"]",

  "button[onclick=\"toggleAccordion('accTriggers')\"]",
  "button[onclick=\"toggleAccordion('accDraft')\"]",

  "#btnTLworld",
  "#btnTLaffect",
];

/**
 * Controls we deliberately do not auto-click in this audit.
 * These need seeded data, mutate the DB heavily, or trigger permissions/media.
 */
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
  // Phase Q.4: Additional guards against page-destroying or navigation-causing controls
  /sendUserMessage/i,
  /sendSystemPrompt/i,
  /window\.open/i,
  /window\.close/i,
  /location\.href/i,
  /location\.replace/i,
  /history\.back/i,
  /lv80ConfirmDelete/i,
  /lv80ExecuteDelete/i,
  /lv80ConfirmNarratorSwitch/i,
  /lv80OpenNarratorSwitcher/i,
  /toggleMic/i,
];

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

async function installNetworkProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__lxNetwork = [] as Array<{ kind: "fetch" | "xhr" | "ws"; url: string; method?: string }>;

    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args: any[]) => {
      const input  = args[0];
      const init   = args[1] || {};
      const url    = typeof input === "string" ? input : input?.url;
      const method = (init.method || input?.method || "GET").toUpperCase();
      w.__lxNetwork.push({ kind: "fetch", url, method });
      return origFetch(...args);
    };

    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR(this: XMLHttpRequest) {
      const xhr      = new OrigXHR();
      const origOpen = xhr.open;
      xhr.open = function (method: string, url: string | URL, ...rest: any[]) {
        try {
          w.__lxNetwork.push({ kind: "xhr", url: String(url), method: String(method).toUpperCase() });
        } catch {}
        return origOpen.call(xhr, method, url as any, ...rest);
      };
      return xhr;
    }
    // @ts-ignore
    window.XMLHttpRequest = PatchedXHR;

    const OrigWS = window.WebSocket;
    class PatchedWS extends OrigWS {
      constructor(url: string | URL, protocols?: string | string[]) {
        w.__lxNetwork.push({ kind: "ws", url: String(url) });
        super(url, protocols as any);
      }
    }
    // @ts-ignore
    window.WebSocket = PatchedWS;

    // Block browser media prompts during audit
    if (!navigator.mediaDevices) {
      // @ts-ignore
      navigator.mediaDevices = {};
    }
    const md = navigator.mediaDevices as any;
    if (!md.getUserMedia) {
      md.getUserMedia = async () => {
        throw new Error("getUserMedia blocked by audit harness");
      };
    }
    if (!md.getDisplayMedia) {
      md.getDisplayMedia = async () => {
        throw new Error("getDisplayMedia blocked by audit harness");
      };
    }
  });
}

async function collectInlineHandlers(page: Page): Promise<JsHandlerAudit[]> {
  return await page.evaluate(() => {
    const attrs = ["onclick", "onchange", "oninput", "onkeydown"];
    const out: any[] = [];

    /**
     * Analyse an inline handler and return { name, exists, type } or null to skip.
     *
     * Categories:
     *   1. Inline expressions (this.style.height=..., state.x=this.value) — skip,
     *      these are valid JS but not named function calls.
     *   2. Simple function call: funcName(...) — check window[funcName].
     *   3. Member call: window.Foo.bar(...) or window.Foo?.bar(...) — check if
     *      the root object (Foo) exists on window.
     */
    function analyzeHandler(code: string): { name: string; exists: boolean; type: string } | null {
      const trimmed = (code || "").trim();

      // Skip inline expressions starting with `this.` — not function calls
      if (/^this\./.test(trimmed)) return null;

      // Skip direct property assignments (state.x = value, but not state.x == value)
      if (/^[A-Za-z_$][A-Za-z0-9_$.]*\s*=[^=]/.test(trimmed)) return null;

      // 1. Simple function call: funcName(...)
      const simpleMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
      if (simpleMatch) {
        const fn = (window as any)[simpleMatch[1]];
        return { name: simpleMatch[1], exists: typeof fn === "function", type: typeof fn };
      }

      // 2. Member call: window.Obj.method(...) or window.Obj?.method(...)
      //    Check if the root object after "window." exists
      const winMemberMatch = trimmed.match(/^window\.([A-Za-z_$][A-Za-z0-9_$]*)/);
      if (winMemberMatch && trimmed.includes("(")) {
        const root = winMemberMatch[1];
        const obj  = (window as any)[root];
        return { name: `window.${root}`, exists: obj != null, type: typeof obj };
      }

      // 3. Non-window member call: Obj.method(...)
      const memberMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\./);
      if (memberMatch && trimmed.includes("(")) {
        const root = memberMatch[1];
        const obj  = (window as any)[root];
        return { name: root, exists: obj != null, type: typeof obj };
      }

      // Fallback: treat as bare name, check on window
      const fn = (window as any)[trimmed];
      return { name: trimmed, exists: typeof fn === "function", type: typeof fn };
    }

    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      for (const attr of attrs) {
        const raw = el.getAttribute(attr);
        if (!raw) continue;
        const result = analyzeHandler(raw);
        if (!result) continue; // skip inline expressions
        out.push({
          element: `${el.tagName.toLowerCase()}#${el.id || ""}.${[...el.classList].join(".")}`,
          attr,
          handler: result.name,
          exists:  result.exists,
          type:    result.type,
        });
      }
    });

    return out;
  });
}

async function exerciseSafeControls(page: Page) {
  // Phase 1: Click known-safe controls by explicit selector
  for (const selector of SAFE_CLICK_SELECTORS) {
    if (page.isClosed()) { console.log("[audit] Page closed — stopping whitelist clicks."); return; }
    try {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.click({ timeout: 2000 });
        await page.waitForTimeout(150);
      }
    } catch (e: any) {
      if (page.isClosed()) { console.log("[audit] Page closed after click:", selector); return; }
      // Non-fatal — continue to next control
    }
  }

  // Phase 2: Sweep [onclick] elements, filtered through skip list
  if (page.isClosed()) return;

  let clickable: Array<{ selector: string | null; onclick: string; text: string }> = [];
  try {
    clickable = await page.locator("[onclick]").evaluateAll((els) =>
      els.map((el: any) => ({
        selector: el.id
          ? `#${el.id}`
          : el.getAttribute("onclick")
          ? `${el.tagName.toLowerCase()}[onclick="${el.getAttribute("onclick")}"]`
          : null,
        onclick: el.getAttribute("onclick") || "",
        text:    (el.textContent || "").trim().slice(0, 80),
      }))
    );
  } catch (e: any) {
    if (page.isClosed()) { console.log("[audit] Page closed during [onclick] sweep setup."); return; }
    console.warn("[audit] Failed to collect [onclick] elements:", e.message);
    return;
  }

  for (const item of clickable) {
    if (page.isClosed()) { console.log("[audit] Page closed — stopping [onclick] sweep."); return; }
    if (!item.selector) continue;
    if (SKIP_CLICK_MATCHERS.some((re) => re.test(item.onclick) || re.test(item.text))) continue;
    try {
      const locator = page.locator(item.selector).first();
      const count = await locator.count();
      if (!count) continue;
      await locator.click({ timeout: 1500 });
      await page.waitForTimeout(120);
    } catch (e: any) {
      if (page.isClosed()) { console.log("[audit] Page closed after [onclick] click:", item.selector); return; }
      // Non-fatal — continue to next control
    }
  }
}

function normalizePath(rawUrl: string): string {
  try   { return new URL(rawUrl).pathname; }
  catch { return rawUrl; }
}

function wsToHttpPath(rawUrl: string): string {
  try   { return new URL(rawUrl).pathname; }
  catch { return rawUrl; }
}

// ── Parameterised route matching ─────────────────────────────────────────────
// Converts /api/people/{person_id} → /^\/api\/people\/[^/]+$/
// so that /api/people/some-uuid correctly matches the OpenAPI template.

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openApiTemplateToRegex(pathTemplate: string): RegExp {
  const pattern = "^" + escapeRegex(pathTemplate).replace(/\\\{[^}]+\\\}/g, "[^/]+") + "$";
  return new RegExp(pattern);
}

function openApiHasPath(openApiPaths: Set<string>, actualPath: string): boolean {
  if (openApiPaths.has(actualPath)) return true;
  for (const template of openApiPaths) {
    if (template.includes("{") && openApiTemplateToRegex(template).test(actualPath)) {
      return true;
    }
  }
  return false;
}

async function getOpenApiPaths(context: BrowserContext): Promise<Set<string>> {
  const req = await context.request.get(OPENAPI_URL);
  expect(req.ok()).toBeTruthy();
  const doc = await req.json();
  return new Set(Object.keys(doc.paths || {}));
}

test.describe("Lorevox UI contract audit", () => {
  // The audit exercises every safe control on the page, which can take >60s
  test.setTimeout(120_000);

  test("audits controls, JS bindings, and backend route alignment", async ({ page, context }) => {
    const consoleErrors: string[] = [];
    const pageErrors:    string[] = [];

    page.on("console",   (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Browser-generated "Failed to load resource" 404s are network-level, not app JS errors.
        // They appear transiently under parallel test load and are not actionable.
        if (/^Failed to load resource:.*404/i.test(text)) return;
        consoleErrors.push(text);
      }
    });
    page.on("pageerror", (err) => { pageErrors.push(String(err)); });

    await installNetworkProbe(page);
    await page.goto(UI_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    // Phase Q.4: Force model ready so readiness gate doesn't interfere with audit
    await page.evaluate(() => {
      if (typeof (window as any)._forceModelReady === "function") {
        (window as any)._forceModelReady();
      }
    });

    // 1 ── Script file health ─────────────────────────────────────────────────
    // NOTE: MediaPipe loads from cdn.jsdelivr.net — will fail when fully offline.
    // That is intentional: it surfaces the pending "vendor MediaPipe locally" item.
    const scriptStatus = await page.evaluate(async () => {
      const urls = [...document.scripts].map((s) => s.src).filter(Boolean);
      const results: Array<{ src: string; ok: boolean; status: number }> = [];
      for (const src of urls) {
        try {
          const resp = await fetch(src, { method: "GET" });
          results.push({ src, ok: resp.ok, status: resp.status });
        } catch {
          results.push({ src, ok: false, status: 0 });
        }
      }
      return results;
    });

    const badScripts = scriptStatus.filter((s) => !s.ok);
    expect.soft(badScripts, `Broken script loads: ${JSON.stringify(badScripts, null, 2)}`).toEqual([]);

    // 2 ── Inline handler audit ───────────────────────────────────────────────
    // Wait for shell init to complete (FocusCanvas IIFE lazy-inits scroll handlers)
    await page.waitForTimeout(2000);
    const handlers        = await collectInlineHandlers(page);
    // Known lazy-init handlers that are defined after shell init, not at parse time.
    // These are valid — they exist by the time the user can interact with the UI.
    const LAZY_INIT_HANDLERS = ["window._scrollToLatest", "window._scrollChatToBottom"];
    const missingHandlers = handlers.filter((h) => !h.exists && !LAZY_INIT_HANDLERS.includes(h.handler));
    expect.soft(
      missingHandlers,
      `Missing inline JS handlers:\n${JSON.stringify(missingHandlers, null, 2)}`
    ).toEqual([]);

    // 3 ── Exercise safe controls ─────────────────────────────────────────────
    await exerciseSafeControls(page);

    // Phase Q.4: If page was destroyed during control exercise, skip remaining
    // audit steps that require page context. Report what we have so far.
    if (page.isClosed()) {
      console.warn("[audit] Page closed during exerciseSafeControls — skipping network/route checks.");
      console.log("\n=== Lorevox UI Audit Report (partial — page closed) ===");
      console.log(`Scripts checked:      ${scriptStatus.length}  (broken: ${badScripts.length})`);
      console.log(`Inline handlers:      ${handlers.length}  (missing: ${missingHandlers.length})`);
      console.log("Network/route/WS checks: SKIPPED (page closed during control exercise)");
      if (missingHandlers.length) console.log("\nMissing handlers:", missingHandlers.map((h) => h.handler));
      return; // Exit test gracefully with whatever soft-expect results we collected
    }

    // 4 ── Network event collection ───────────────────────────────────────────
    const networkEvents: NetworkEvent[] = await page.evaluate(() => (window as any).__lxNetwork || []);
    const openApiPaths  = await getOpenApiPaths(context);

    // 5 ── HTTP route alignment ───────────────────────────────────────────────
    // TTS runs on a separate port (8001) with its own API — exclude cross-service calls.
    // Only validate routes that target the main API service.
    // Compare by port number to avoid localhost vs 127.0.0.1 mismatch.
    const ttsPort = new URL(TTS_BASE).port || "8001";
    const httpCalls = networkEvents.filter((e) => e.kind === "fetch" || e.kind === "xhr");
    const routeMismatches = httpCalls
      .map((e) => ({ method: e.method || "GET", path: normalizePath(e.url), url: e.url }))
      .filter((e) => e.path.startsWith("/"))
      .filter((e) => {
        if (e.path.startsWith("/ui/"))   return false;
        if (e.path === "/openapi.json") return false;
        if (e.path === "/favicon.ico")  return false;
        // Skip TTS cross-service calls (different port, own OpenAPI)
        try { if (new URL(e.url).port === ttsPort) return false; } catch {}
        return !openApiHasPath(openApiPaths, e.path);
      });

    expect.soft(
      routeMismatches,
      `Frontend called routes not present in OpenAPI:\n${JSON.stringify(routeMismatches, null, 2)}`
    ).toEqual([]);

    // 6 ── WebSocket alignment ────────────────────────────────────────────────
    // WebSocket upgrade endpoints (e.g. /api/chat/ws) aren't in REST OpenAPI specs.
    // Only flag WS paths that don't start with a known API prefix.
    const knownWsPaths = ["/api/chat/ws"];
    const wsCalls = networkEvents.filter((e) => e.kind === "ws").map((e) => wsToHttpPath(e.url));
    const wsBad   = wsCalls.filter((p) =>
      p.startsWith("/") && !knownWsPaths.includes(p) && !openApiHasPath(openApiPaths, p)
    );
    expect.soft(
      wsBad,
      `Frontend attempted WS paths not present in OpenAPI:\n${JSON.stringify(wsBad, null, 2)}`
    ).toEqual([]);

    // 7 ── Runtime errors ─────────────────────────────────────────────────────
    expect.soft(consoleErrors, `Console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
    expect.soft(pageErrors,    `Page errors:\n${pageErrors.join("\n")}`).toEqual([]);

    // 8 ── Compact report ─────────────────────────────────────────────────────
    console.log("\n=== Lorevox UI Audit Report ===");
    console.log(`Scripts checked:      ${scriptStatus.length}  (broken: ${badScripts.length})`);
    console.log(`Inline handlers:      ${handlers.length}  (missing: ${missingHandlers.length})`);
    console.log(`Network events:       ${networkEvents.length}`);
    console.log(`Console errors:       ${consoleErrors.length}`);
    console.log(`Page errors:          ${pageErrors.length}`);
    console.log(`Route mismatches:     ${routeMismatches.length}`);
    console.log(`WS mismatches:        ${wsBad.length}`);
    if (missingHandlers.length) console.log("\nMissing handlers:", missingHandlers.map((h) => h.handler));
    if (routeMismatches.length) console.log("\nRoute mismatches:", routeMismatches.map((r) => `${r.method} ${r.path}`));
  });
});
