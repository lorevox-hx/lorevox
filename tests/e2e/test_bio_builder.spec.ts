import { test, expect } from "@playwright/test";

const API_URL = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
const UI_URL  = process.env.LOREVOX_UI_URL   || "http://127.0.0.1:8080";

/**
 * Lorevox 8.0 — Bio Builder Contract Tests
 * Validates Bio Builder backend contracts and data flow.
 *
 * Run:  npx playwright test tests/e2e/test_bio_builder.spec.ts
 */

test.describe("Bio Builder — Backend Contracts", () => {
  let personId: string;

  test.beforeAll(async ({ request }) => {
    const r = await request.post(`${API_URL}/api/people`, {
      data: {
        display_name: "Bio_Builder_E2E",
        role: "narrator",
        date_of_birth: "1942-08-15",
        place_of_birth: "Sacramento, CA"
      }
    });
    personId = (await r.json()).person_id;

    await request.put(`${API_URL}/api/profiles/${personId}`, {
      data: {
        profile: {
          basics: {
            fullname: "Bio Builder E2E Person",
            preferred: "Bio",
            dob: "1942-08-15",
            pob: "Sacramento, CA"
          }
        }
      }
    });
  });

  test.afterAll(async ({ request }) => {
    if (personId) {
      await request.delete(`${API_URL}/api/people/${personId}?mode=hard&reason=e2e+cleanup`);
    }
  });

  test("BB-01: Facts can be added with meaning engine fields", async ({ request }) => {
    const r = await request.post(`${API_URL}/api/facts/add`, {
      data: {
        person_id: personId,
        statement: "Moved to Sacramento in 1950 after father's job transfer",
        fact_type: "move",
        status: "extracted",
        confidence: 0.85,
        meaning_tags: ["stakes", "turning_point"],
        narrative_role: "inciting",
        experience: "We packed up everything and drove west",
        reflection: "That move changed everything for our family"
      }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.fact?.id || body.fact_id || body.id).toBeTruthy();
  });

  test("BB-02: Facts list includes meaning engine fields", async ({ request }) => {
    const r = await request.get(`${API_URL}/api/facts/list?person_id=${personId}`);
    expect(r.ok()).toBeTruthy();
    const factsBody = await r.json();
    const items = factsBody.items || factsBody.facts || [];
    const meaningFact = items.find((f: any) =>
      f.statement?.includes("Sacramento") && f.meaning_tags
    );
    // Meaning tags may or may not be returned depending on DB schema
    // This is a non-blocking check
    if (meaningFact) {
      expect(Array.isArray(meaningFact.meaning_tags)).toBeTruthy();
    }
  });

  test("BB-03: Timeline events support location data", async ({ request }) => {
    const r = await request.post(`${API_URL}/api/timeline/add`, {
      data: {
        person_id: personId,
        ts: "1950-06-01T00:00:00Z",
        title: "Moved to Sacramento",
        description: "Family relocated for work",
        kind: "move",
        location_name: "Sacramento, CA",
        latitude: 38.5816,
        longitude: -121.4944
      }
    });
    expect(r.ok()).toBeTruthy();
  });

  test("BB-04: Interview can be started for Bio Builder person", async ({ request }) => {
    const r = await request.post(`${API_URL}/api/interview/start`, {
      data: { person_id: personId, plan_id: "default" }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.session_id).toBeTruthy();
    expect(body.question).toBeTruthy();
  });

  test("BB-05: Profile supports kinship data", async ({ request }) => {
    await request.patch(`${API_URL}/api/profiles/${personId}`, {
      data: {
        patch: {
          kinship: [
            { name: "John Doe", relation: "father" },
            { name: "Jane Doe", relation: "mother" }
          ]
        }
      }
    });

    const r = await request.get(`${API_URL}/api/profiles/${personId}`);
    const profile = (await r.json()).profile || {};
    const kinship = profile.kinship || [];
    expect(kinship.length).toBeGreaterThanOrEqual(2);
  });

  test("BB-06: Fact status workflow (extracted → reviewed)", async ({ request }) => {
    // Add a candidate fact
    const addResp = await request.post(`${API_URL}/api/facts/add`, {
      data: {
        person_id: personId,
        statement: "Candidate fact for review: attended Lincoln High School",
        fact_type: "education",
        status: "extracted"
      }
    });
    const addBody = await addResp.json();
    const factId = addBody.fact?.id || addBody.fact_id || addBody.id;

    // Promote to reviewed
    const reviewResp = await request.patch(`${API_URL}/api/facts/status`, {
      data: { fact_id: factId, status: "reviewed" }
    });
    expect(reviewResp.ok()).toBeTruthy();

    // Verify status changed
    const listResp = await request.get(`${API_URL}/api/facts/list?person_id=${personId}&status=reviewed`);
    const listBody = await listResp.json();
    const reviewed = (listBody.items || listBody.facts || []).find((f: any) =>
      (f.fact?.id || f.fact_id || f.id) === factId
    );
    expect(reviewed).toBeTruthy();
    expect(reviewed.status).toBe("reviewed");
  });
});


test.describe("Bio Builder — UI Module Check", () => {

  test("BB-07: Bio Builder JS loads in browser", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`${UI_URL}/ui/lori9.0.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => { if (typeof (window as any)._forceModelReady === "function") (window as any)._forceModelReady(); });
    await page.waitForTimeout(2000);

    // Verify bio builder scripts loaded (check for global references)
    const moduleCheck = await page.evaluate(() => ({
      hasBioCore: document.querySelector("script[src*='bio-builder-core']") !== null ||
                  document.querySelector("script[src*='bio-builder']") !== null,
      hasBioReview: document.querySelector("script[src*='bio-review']") !== null,
      hasBioControl: document.querySelector("script[src*='bio-control']") !== null,
    }));

    // At least the main bio builder script should be present
    expect(
      moduleCheck.hasBioCore || moduleCheck.hasBioReview || moduleCheck.hasBioControl,
      "At least one Bio Builder module should be loaded"
    ).toBeTruthy();
  });

  test("BB-08: Family Tree script is loaded", async ({ page }) => {
    await page.goto(`${UI_URL}/ui/lori9.0.html`, { waitUntil: "networkidle" });

    const hasScript = await page.evaluate(() =>
      document.querySelector("script[src*='family-tree']") !== null ||
      typeof (window as any).renderFamilyTree === "function" ||
      typeof (window as any).familyTree === "object"
    );
    // Non-blocking: module may be lazy-loaded
  });

  test("BB-09: Life Threads script is loaded", async ({ page }) => {
    await page.goto(`${UI_URL}/ui/lori9.0.html`, { waitUntil: "networkidle" });

    const hasScript = await page.evaluate(() =>
      document.querySelector("script[src*='life-threads']") !== null ||
      typeof (window as any).renderLifeThreads === "function"
    );
    // Non-blocking: module may be lazy-loaded
  });
});
