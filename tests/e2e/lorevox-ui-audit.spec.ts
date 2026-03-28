import { test, expect, Page, BrowserContext } from "@playwright/test";

const BASE_URL    = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
const UI_URL      = `${BASE_URL}/ui/6.1.html`;
const OPENAPI_URL = `${BASE_URL}/openapi.json`;

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

    function extractHandlerName(code: string): string {
      const trimmed = (code || "").trim();
      const match   = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
      return match ? match[1] : trimmed;
    }

    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      for (const attr of attrs) {
        const raw = el.getAttribute(attr);
        if (!raw) continue;
        const handler = extractHandlerName(raw);
        const fn      = (window as any)[handler];
        out.push({
          element: `${el.tagName.toLowerCase()}#${el.id || ""}.${[...el.classList].join(".")}`,
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

async function exerciseSafeControls(page: Page) {
  for (const selector of SAFE_CLICK_SELECTORS) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 2000 });
        await page.waitForTimeout(150);
      } catch {}
    }
  }

  const clickable = await page.locator("[onclick]").evaluateAll((els) =>
    els.map((el: any) => ({
      selector: el.id
        ? `#${el.id}`
        : el.getAttribute("onclick")
        ? `${el.tagName.toLowerCase()}[onclick="${el.getAttribute("onclick")}"]`
        : null,
      onclick: el.getAttribute("onclick") || "",
      text:    (el.textContent || "").trim(),
    }))
  );

  for (const item of clickable) {
    if (!item.selector) continue;
    if (SKIP_CLICK_MATCHERS.some((re) => re.test(item.onclick) || re.test(item.text))) continue;
    const locator = page.locator(item.selector).first();
    if (!(await locator.count())) continue;
    try {
      await locator.click({ timeout: 1500 });
      await page.waitForTimeout(120);
    } catch {}
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
  test("audits controls, JS bindings, and backend route alignment", async ({ page, context }) => {
    const consoleErrors: string[] = [];
    const pageErrors:    string[] = [];

    page.on("console",   (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => { pageErrors.push(String(err)); });

    await installNetworkProbe(page);
    await page.goto(UI_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();

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
    const handlers        = await collectInlineHandlers(page);
    const missingHandlers = handlers.filter((h) => !h.exists);
    expect.soft(
      missingHandlers,
      `Missing inline JS handlers:\n${JSON.stringify(missingHandlers, null, 2)}`
    ).toEqual([]);

    // 3 ── Exercise safe controls ─────────────────────────────────────────────
    await exerciseSafeControls(page);

    // 4 ── Network event collection ───────────────────────────────────────────
    const networkEvents: NetworkEvent[] = await page.evaluate(() => (window as any).__lxNetwork || []);
    const openApiPaths  = await getOpenApiPaths(context);

    // 5 ── HTTP route alignment ───────────────────────────────────────────────
    const httpCalls = networkEvents.filter((e) => e.kind === "fetch" || e.kind === "xhr");
    const routeMismatches = httpCalls
      .map((e) => ({ method: e.method || "GET", path: normalizePath(e.url), url: e.url }))
      .filter((e) => e.path.startsWith("/"))
      .filter((e) => {
        if (e.path.startsWith("/ui/"))   return false;
        if (e.path === "/openapi.json") return false;
        if (e.path === "/favicon.ico")  return false;
        return !openApiHasPath(openApiPaths, e.path);
      });

    expect.soft(
      routeMismatches,
      `Frontend called routes not present in OpenAPI:\n${JSON.stringify(routeMismatches, null, 2)}`
    ).toEqual([]);

    // 6 ── WebSocket alignment ────────────────────────────────────────────────
    const wsCalls = networkEvents.filter((e) => e.kind === "ws").map((e) => wsToHttpPath(e.url));
    const wsBad   = wsCalls.filter((p) => p.startsWith("/") && !openApiHasPath(openApiPaths, p));
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
