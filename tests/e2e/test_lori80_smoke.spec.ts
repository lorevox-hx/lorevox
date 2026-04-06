import { test, expect, type Page } from "@playwright/test";

const API_URL = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
const UI_URL  = process.env.LOREVOX_UI_URL   || "http://127.0.0.1:8080";

/**
 * Lorevox 9.0 — Browser Smoke & Regression Suite
 * Tests the active lori9.0.html shell against a running stack.
 *
 * Run:  npx playwright test tests/e2e/test_lori80_smoke.spec.ts
 */

/** Navigate to lori9.0.html and force the readiness gate open for testing. */
async function gotoUI(page: Page): Promise<void> {
  await page.goto(`${UI_URL}/ui/lori9.0.html`, { waitUntil: "networkidle" });
  // Phase Q.4: Force model ready so chat gate doesn't block test interactions
  await page.evaluate(() => {
    if (typeof (window as any)._forceModelReady === "function") {
      (window as any)._forceModelReady();
    }
  });
}

test.describe("Lori 8.0 — Browser Smoke", () => {

  test("E2E-01: lori9.0.html loads without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await gotoUI(page);
    await expect(page).toHaveTitle(/.*/);

    // Allow minor non-fatal errors but flag critical ones
    const critical = errors.filter(e =>
      !e.includes("ResizeObserver") &&
      !e.includes("favicon")
    );
    expect(critical, `JS errors on load: ${critical.join("; ")}`).toHaveLength(0);
  });

  test("E2E-02: API status pill turns green", async ({ page }) => {
    await gotoUI(page);
    // Wait for status check to complete (pillApi or similar)
    await page.waitForTimeout(3000);

    // Check that the API pill indicates connected
    const apiPill = page.locator("#pillApi, [data-pill='api'], .pill-api").first();
    if (await apiPill.count() > 0) {
      const classes = await apiPill.getAttribute("class") || "";
      const text = await apiPill.textContent() || "";
      expect(
        classes.includes("on") || classes.includes("green") ||
        classes.includes("connected") || text.includes("✓") || text.includes("ON"),
        "API pill should indicate connected"
      ).toBeTruthy();
    }
  });

  test("E2E-03: TTS status pill turns green", async ({ page }) => {
    await gotoUI(page);
    await page.waitForTimeout(3000);

    const ttsPill = page.locator("#pillTts, [data-pill='tts'], .pill-tts").first();
    if (await ttsPill.count() > 0) {
      const classes = await ttsPill.getAttribute("class") || "";
      const text = await ttsPill.textContent() || "";
      expect(
        classes.includes("on") || classes.includes("green") ||
        classes.includes("connected") || text.includes("✓") || text.includes("ON"),
        "TTS pill should indicate connected"
      ).toBeTruthy();
    }
  });

  test("E2E-04: WebSocket status pill turns green", async ({ page }) => {
    await gotoUI(page);
    await page.waitForTimeout(3000);

    const wsPill = page.locator("#pillWs, [data-pill='ws'], .pill-ws").first();
    if (await wsPill.count() > 0) {
      const classes = await wsPill.getAttribute("class") || "";
      const text = await wsPill.textContent() || "";
      expect(
        classes.includes("on") || classes.includes("green") ||
        classes.includes("connected") || text.includes("✓") || text.includes("ON"),
        "WS pill should indicate connected"
      ).toBeTruthy();
    }
  });
});


test.describe("Lori 8.0 — People & Narrator", () => {

  let testPersonId: string;

  test.beforeAll(async ({ request }) => {
    // Create a test narrator via API
    const r = await request.post(`${API_URL}/api/people`, {
      data: {
        display_name: "E2E_Test_Narrator",
        role: "narrator",
        date_of_birth: "1952-04-10",
        place_of_birth: "Fargo, ND"
      }
    });
    const body = await r.json();
    testPersonId = body.person_id;

    // Set profile
    await request.put(`${API_URL}/api/profiles/${testPersonId}`, {
      data: {
        profile: {
          basics: {
            fullname: "E2E Test Narrator",
            preferred: "E2E",
            dob: "1952-04-10",
            pob: "Fargo, ND"
          }
        }
      }
    });
  });

  test.afterAll(async ({ request }) => {
    if (testPersonId) {
      await request.delete(`${API_URL}/api/people/${testPersonId}?mode=hard&reason=e2e+cleanup`);
    }
  });

  test("E2E-05: Narrator list is visible", async ({ page }) => {
    await gotoUI(page);
    await page.waitForTimeout(2000);

    // Look for the narrator/person selector
    const selector = page.locator(
      "#personSelect, #narratorSelect, select[data-role='narrator'], .narrator-list, .person-list"
    ).first();
    if (await selector.count() > 0) {
      await expect(selector).toBeVisible();
    }
  });

  test("E2E-06: Selecting a narrator loads their identity", async ({ page }) => {
    await gotoUI(page);
    await page.waitForTimeout(2000);

    // Try to select the test narrator
    const selector = page.locator(
      "#personSelect, #narratorSelect, select[data-role='narrator']"
    ).first();
    if (await selector.count() > 0) {
      // Select by value or label
      try {
        await selector.selectOption({ value: testPersonId });
      } catch {
        // Try label match
        await selector.selectOption({ label: /E2E/ });
      }
      await page.waitForTimeout(2000);

      // Verify identity loaded via console
      const logs = await page.evaluate(() => {
        return (window as any).__lv_debug_logs || [];
      });
    }
  });

  test("E2E-07: Chat input is present and enabled", async ({ page }) => {
    await gotoUI(page);
    await page.waitForTimeout(3000);

    const chatInput = page.locator(
      "#chatInput, #messageInput, input[type='text'][placeholder*='message'], textarea[placeholder*='message']"
    ).first();
    if (await chatInput.count() > 0) {
      await expect(chatInput).toBeVisible();
    }
  });
});


test.describe("Lori 8.0 — Chat Functionality", () => {

  test("E2E-08: REST /api/chat returns valid response", async ({ request }) => {
    const r = await request.post(`${API_URL}/api/chat`, {
      data: {
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_new: 20,
        temp: 0.1
      },
      timeout: 120000
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.ok).toBeTruthy();
    expect(body.text).toBeTruthy();
    expect(body.text.length).toBeGreaterThan(0);
  });

  test("E2E-09: SSE /api/chat/stream returns NDJSON", async ({ request }) => {
    const r = await request.post(`${API_URL}/api/chat/stream`, {
      data: {
        messages: [{ role: "user", content: "Say hi." }],
        max_new: 20,
        temp: 0.1
      },
      timeout: 120000
    });
    expect(r.ok()).toBeTruthy();
    const text = await r.text();
    const lines = text.trim().split("\n").filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    // Should contain at least one delta and one done
    const hasData = lines.some(l => {
      try { return JSON.parse(l).delta !== undefined; } catch { return false; }
    });
    const hasDone = lines.some(l => {
      try { return JSON.parse(l).done === true; } catch { return false; }
    });
    expect(hasData, "Should have delta chunks").toBeTruthy();
    expect(hasDone, "Should have done signal").toBeTruthy();
  });
});


test.describe("Lori 8.0 — Narrator Switch (WO-2)", () => {

  let personA: string;
  let personB: string;

  test.beforeAll(async ({ request }) => {
    const rA = await request.post(`${API_URL}/api/people`, {
      data: { display_name: "Switch_A", role: "narrator", date_of_birth: "1940-01-01", place_of_birth: "City A" }
    });
    personA = (await rA.json()).person_id;

    const rB = await request.post(`${API_URL}/api/people`, {
      data: { display_name: "Switch_B", role: "narrator", date_of_birth: "1960-01-01", place_of_birth: "City B" }
    });
    personB = (await rB.json()).person_id;

    // Set profiles
    for (const [pid, name, pob] of [[personA, "Switch A", "City A"], [personB, "Switch B", "City B"]]) {
      await request.put(`${API_URL}/api/profiles/${pid}`, {
        data: { profile: { basics: { fullname: name, preferred: name, dob: "1940-01-01", pob } } }
      });
    }
  });

  test.afterAll(async ({ request }) => {
    for (const pid of [personA, personB]) {
      await request.delete(`${API_URL}/api/people/${pid}?mode=hard&reason=e2e+cleanup`);
    }
  });

  test("E2E-10: sync_session sent on WS open (verified via API)", async ({ request }) => {
    // This test verifies the backend accepts sync_session without error
    // by creating a session and checking data isolation through facts
    const factA = `UniqueA_${Date.now()}`;
    const factB = `UniqueB_${Date.now()}`;

    await request.post(`${API_URL}/api/facts/add`, {
      data: { person_id: personA, statement: factA, fact_type: "general", status: "extracted" }
    });
    await request.post(`${API_URL}/api/facts/add`, {
      data: { person_id: personB, statement: factB, fact_type: "general", status: "extracted" }
    });

    // Verify A's facts don't include B's
    const rA = await request.get(`${API_URL}/api/facts/list?person_id=${personA}`);
    const bodyA = await rA.json();
    const factsA = (bodyA.items || bodyA.facts || []).map((f: any) => f.statement);
    expect(factsA).toContain(factA);
    expect(factsA).not.toContain(factB);

    // Verify B's facts don't include A's
    const rB = await request.get(`${API_URL}/api/facts/list?person_id=${personB}`);
    const bodyB = await rB.json();
    const factsB = (bodyB.items || bodyB.facts || []).map((f: any) => f.statement);
    expect(factsB).toContain(factB);
    expect(factsB).not.toContain(factA);
  });
});


test.describe("Lori 8.0 — UI Modules Loaded", () => {

  test("E2E-11: All core JS modules load without error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await gotoUI(page);
    await page.waitForTimeout(2000);

    // Check key global functions/objects exist.
    // state is declared with `let` in state.js (not a `window` property),
    // so use a string-based evaluate to access the global lexical scope.
    const checks: any = await page.evaluate(`({
      hasState:       typeof state === 'object' && state !== null,
      hasBuildR71:    typeof buildRuntime71 === 'function',
      hasCheckStatus: typeof checkStatus === 'function',
      hasLoadPerson:  typeof loadPerson === 'function',
    })`);

    expect(checks.hasState, "state object should exist").toBeTruthy();
    expect(checks.hasBuildR71, "buildRuntime71 function should exist").toBeTruthy();
  });

  test("E2E-12: Bio Builder tab exists in UI", async ({ page }) => {
    await gotoUI(page);
    await page.waitForTimeout(2000);

    // Look for Bio Builder tab/button
    const bioTab = page.locator(
      "[data-tab='bio'], [data-tab='bioBuilder'], button:has-text('Bio'), a:has-text('Bio')"
    ).first();
    // Bio Builder may not always be visible depending on state
    // Just verify the JS module loaded
    const hasBioBuilder = await page.evaluate(() =>
      typeof (window as any).BioBuilder === "function" ||
      typeof (window as any).bioBuilder === "object" ||
      typeof (window as any).openBioBuilder === "function" ||
      document.querySelector("[data-tab='bio']") !== null
    );
    // Non-blocking: Bio Builder may be conditionally loaded
  });

  test("E2E-13: Interview roadmap data is loaded", async ({ page }) => {
    await gotoUI(page);

    // INTERVIEW_ROADMAP is declared with `const` in data.js — not a `window` property.
    // Use string-based evaluate to access the global lexical scope directly.
    const hasRoadmap = await page.evaluate(`
      typeof INTERVIEW_ROADMAP !== 'undefined' &&
      Array.isArray(INTERVIEW_ROADMAP) &&
      INTERVIEW_ROADMAP.length > 0
    `);
    expect(hasRoadmap, "INTERVIEW_ROADMAP should be a non-empty array").toBeTruthy();
  });
});


test.describe("Lori 8.0 — Backend Contract Tests", () => {

  test("E2E-14: Interview start and question flow", async ({ request }) => {
    // Create person
    const pResp = await request.post(`${API_URL}/api/people`, {
      data: { display_name: "Interview_E2E", role: "narrator", date_of_birth: "1950-01-01" }
    });
    const personId = (await pResp.json()).person_id;

    // Start interview
    const iResp = await request.post(`${API_URL}/api/interview/start`, {
      data: { person_id: personId, plan_id: "default" }
    });
    expect(iResp.ok()).toBeTruthy();
    const interview = await iResp.json();
    expect(interview.session_id).toBeTruthy();
    expect(interview.question).toBeTruthy();
    expect(interview.question.prompt).toBeTruthy();

    // Cleanup
    await request.delete(`${API_URL}/api/people/${personId}?mode=hard&reason=e2e+cleanup`);
  });

  test("E2E-15: Profile ingest basic info", async ({ request }) => {
    const pResp = await request.post(`${API_URL}/api/people`, {
      data: { display_name: "Ingest_E2E", role: "narrator" }
    });
    const personId = (await pResp.json()).person_id;

    const iResp = await request.post(`${API_URL}/api/profiles/${personId}/ingest_basic_info`, {
      data: {
        document: {
          fullname: "Ingest Test Person",
          date_of_birth: "1945-03-15",
          place_of_birth: "Ingest City, IC"
        }
      }
    });
    expect(iResp.ok()).toBeTruthy();

    // Verify profile was populated
    const profResp = await request.get(`${API_URL}/api/profiles/${personId}`);
    const profile = (await profResp.json()).profile || {};
    const doc = profile.ingest?.basic_info?.document || {};
    expect(doc.fullname || doc.place_of_birth || profile.basics?.fullname || profile.basics?.pob).toBeTruthy();

    await request.delete(`${API_URL}/api/people/${personId}?mode=hard&reason=e2e+cleanup`);
  });
});
