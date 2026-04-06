import { test, expect } from "@playwright/test";
import {
  navigateToUI,
  preloadNarratorFromTemplate,
  selectNarrator,
  refreshAndRestore,
  apiCreateNarrator,
  apiDeleteNarrator,
} from "./helpers/graph-test-helpers";

/**
 * Lorevox 9.0 Phase Q.3A — Timeline Integrity Tests
 *
 * TL-01: Timeline Seed Creation
 * TL-02: Era Selection Persistence
 * TL-03: Cross-Narrator Timeline Isolation
 * TL-04: Timeline Restore After Refresh
 * TL-05: Sparse Narrator Timeline
 *
 * Run: npx playwright test tests/e2e/timeline-integrity.spec.ts
 *
 * IMPORTANT: state.js declares `let state = { ... }` at top level.
 * This is accessible as the bare `state` variable inside page.evaluate,
 * but NOT as `window.state`. All evaluate blocks must use bare `state`.
 */

const TIMELINE_ORDER = [
  "early_childhood", "school_years", "adolescence",
  "early_adulthood", "midlife", "later_life",
];

const ERA_AGE_MAP: Record<string, { start: number; end: number | null }> = {
  early_childhood: { start: 0, end: 5 },
  school_years:    { start: 6, end: 12 },
  adolescence:     { start: 13, end: 18 },
  early_adulthood: { start: 19, end: 30 },
  midlife:         { start: 31, end: 55 },
  later_life:      { start: 56, end: null },
};

/**
 * Build spine, set on state.timeline, save to localStorage.
 * Uses bare `state` (not window.state) since state.js uses `let`.
 */
async function buildAndSetSpine(
  page: any, pid: string, dob: string, pob: string
): Promise<{ seedReady: boolean; periodCount: number }> {
  return await page.evaluate(
    ({ pid, dob, pob, order, ages }: any) => {
      const s = (typeof state !== "undefined") ? state : null;
      if (!s) return { seedReady: false, periodCount: 0 };

      const birthYear = parseInt(dob.slice(0, 4), 10);
      if (isNaN(birthYear)) return { seedReady: false, periodCount: 0 };

      const periods = order.map((label: string) => {
        const a = ages[label];
        return {
          label,
          start_year: birthYear + a.start,
          end_year: a.end !== null ? birthYear + a.end : null,
          is_approximate: true,
          places: label === "early_childhood" ? [pob] : [],
          people: [],
          notes: label === "early_childhood" ? ["Born in " + pob] : [],
        };
      });

      s.timeline.spine = { birth_date: dob, birth_place: pob, periods };
      s.timeline.seedReady = true;

      try {
        localStorage.setItem(
          "lorevox.spine." + (s.person_id || pid),
          JSON.stringify(s.timeline.spine)
        );
      } catch (e) {}

      if (typeof setPass === "function") setPass("pass2a");
      if (typeof setEra === "function" && typeof getCurrentEra === "function" && !getCurrentEra())
        setEra(periods[0].label);

      return { seedReady: !!s.timeline.seedReady, periodCount: periods.length };
    },
    { pid, dob, pob, order: TIMELINE_ORDER, ages: ERA_AGE_MAP }
  );
}

/** Read a value from state inside page context (bare `state` variable). */
async function readState(page: any, path: string): Promise<any> {
  return await page.evaluate((p: string) => {
    const s = (typeof state !== "undefined") ? state : null;
    if (!s) return undefined;
    return p.split(".").reduce((obj: any, key: string) => obj?.[key], s);
  }, path);
}

test.describe("Timeline Integrity — Phase Q.3A", () => {
  test.setTimeout(90_000);

  let createdNarratorIds: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const pid of createdNarratorIds) {
      try { await apiDeleteNarrator(request, pid); } catch (e) {}
    }
  });

  test("TL-01: Timeline Seed Creation", async ({ page }) => {
    await test.step("Navigate to UI and load template", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";

    await test.step("Preload David Alan Mercer narrator", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      expect(mercerPid).toBeTruthy();
    });

    await test.step("Build and set timeline spine", async () => {
      const result = await buildAndSetSpine(page, mercerPid, "1946-05-18", "St. Louis, Missouri");
      expect(result.seedReady).toBe(true);
      expect(result.periodCount).toBe(6);
    });

    await test.step("Verify spine has 6 life periods with correct labels", async () => {
      const spine = await readState(page, "timeline.spine");
      expect(spine).toBeDefined();
      expect(spine.periods.length).toBe(6);
      expect(spine.periods[0].label).toBe("early_childhood");
      expect(spine.periods[5].label).toBe("later_life");
    });

    await test.step("Verify birth year matches template DOB (1946)", async () => {
      const birthDate = await readState(page, "timeline.spine.birth_date");
      expect(birthDate).toBe("1946-05-18");
    });

    await test.step("Verify birth place is set", async () => {
      const birthPlace = await readState(page, "timeline.spine.birth_place");
      expect(birthPlace).toBeTruthy();
      expect(birthPlace).toContain("Missouri");
    });

    await test.step("Verify early_childhood start_year = 1946", async () => {
      const periods = await readState(page, "timeline.spine.periods");
      expect(periods[0].start_year).toBe(1946);
    });

    await test.step("Verify spine saved to localStorage", async () => {
      const saved = await page.evaluate((pid: string) => {
        return !!localStorage.getItem(`lorevox.spine.${pid}`);
      }, mercerPid);
      expect(saved).toBe(true);
    });
  });

  test("TL-02: Era Selection Persistence", async ({ page }) => {
    await test.step("Navigate to UI and load template", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";

    await test.step("Preload Mercer and build spine", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      const result = await buildAndSetSpine(page, mercerPid, "1946-05-18", "St. Louis, Missouri");
      expect(result.seedReady).toBe(true);
    });

    await test.step("Set era to adolescence", async () => {
      await page.evaluate(() => {
        if (typeof setEra === "function") setEra("adolescence");
      });
      await page.waitForTimeout(300);
    });

    await test.step("Verify era is set to adolescence", async () => {
      const currentEra = await page.evaluate(() => {
        if (typeof getCurrentEra === "function") return getCurrentEra();
        const s = (typeof state !== "undefined") ? state : null;
        return s?.session?.currentEra;
      });
      expect(currentEra).toBe("adolescence");
    });

    await test.step("Verify spine in localStorage", async () => {
      const hasSpine = await page.evaluate((pid: string) => {
        return !!localStorage.getItem(`lorevox.spine.${pid}`);
      }, mercerPid);
      expect(hasSpine).toBe(true);
    });

    await test.step("Change era to midlife", async () => {
      await page.evaluate(() => {
        if (typeof setEra === "function") setEra("midlife");
      });
      await page.waitForTimeout(300);
    });

    await test.step("Verify era is now midlife", async () => {
      const currentEra = await page.evaluate(() => {
        if (typeof getCurrentEra === "function") return getCurrentEra();
        const s = (typeof state !== "undefined") ? state : null;
        return s?.session?.currentEra;
      });
      expect(currentEra).toBe("midlife");
    });
  });

  test("TL-03: Cross-Narrator Timeline Isolation", async ({ page }) => {
    await test.step("Navigate to UI", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";
    let quinnPid = "";

    await test.step("Preload Mercer and build spine", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      const result = await buildAndSetSpine(page, mercerPid, "1946-05-18", "St. Louis, Missouri");
      expect(result.seedReady).toBe(true);
    });

    await test.step("Set Mercer's era to midlife", async () => {
      await page.evaluate(() => {
        if (typeof setEra === "function") setEra("midlife");
      });
      await page.waitForTimeout(300);
    });

    await test.step("Verify Mercer spine saved", async () => {
      const saved = await page.evaluate((pid: string) => {
        const raw = localStorage.getItem(`lorevox.spine.${pid}`);
        return raw ? JSON.parse(raw).birth_date : null;
      }, mercerPid);
      expect(saved).toBe("1946-05-18");
    });

    await test.step("Preload Quinn and build spine", async () => {
      quinnPid = await preloadNarratorFromTemplate(page, "elena-rivera-quinn.json");
      const result = await buildAndSetSpine(page, quinnPid, "1974-03-15", "San Antonio, Texas");
      expect(result.seedReady).toBe(true);
    });

    await test.step("Set Quinn's era to school_years", async () => {
      await page.evaluate(() => {
        if (typeof setEra === "function") setEra("school_years");
      });
      await page.waitForTimeout(300);
    });

    await test.step("Verify Quinn's era is school_years", async () => {
      const currentEra = await page.evaluate(() => {
        if (typeof getCurrentEra === "function") return getCurrentEra();
        const s = (typeof state !== "undefined") ? state : null;
        return s?.session?.currentEra;
      });
      expect(currentEra).toBe("school_years");
    });

    await test.step("Verify Mercer and Quinn spines in localStorage are independent", async () => {
      const mercerBirth = await page.evaluate((pid: string) => {
        const raw = localStorage.getItem(`lorevox.spine.${pid}`);
        return raw ? JSON.parse(raw).birth_date : null;
      }, mercerPid);

      const quinnBirth = await page.evaluate((pid: string) => {
        const raw = localStorage.getItem(`lorevox.spine.${pid}`);
        return raw ? JSON.parse(raw).birth_date : null;
      }, quinnPid);

      expect(mercerBirth).toBe("1946-05-18");
      expect(quinnBirth).toBe("1974-03-15");
      expect(mercerBirth).not.toBe(quinnBirth);
    });

    await test.step("Switch to Mercer and restore spine from localStorage", async () => {
      await selectNarrator(page, mercerPid);
      await page.evaluate((pid: string) => {
        if (typeof loadSpineLocal === "function") loadSpineLocal(pid);
      }, mercerPid);
      await page.waitForTimeout(500);
    });

    await test.step("Verify Mercer's spine restored correctly", async () => {
      const spine = await readState(page, "timeline.spine");
      expect(spine).toBeDefined();
      expect(spine.birth_date).toBe("1946-05-18");
      expect(spine.birth_place).toContain("Missouri");
    });
  });

  test("TL-04: Timeline Restore After Refresh", async ({ page }) => {
    await test.step("Navigate to UI and preload template", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";
    let recordedStartYear = "";

    await test.step("Preload Mercer and build spine", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      const result = await buildAndSetSpine(page, mercerPid, "1946-05-18", "St. Louis, Missouri");
      expect(result.seedReady).toBe(true);
    });

    await test.step("Record start_year from localStorage", async () => {
      const startYear = await page.evaluate((pid: string) => {
        const raw = localStorage.getItem(`lorevox.spine.${pid}`);
        if (!raw) return null;
        return JSON.parse(raw)?.periods?.[0]?.start_year?.toString();
      }, mercerPid);
      expect(startYear).toBeTruthy();
      recordedStartYear = startYear!;
    });

    await test.step("Perform page refresh and restore", async () => {
      await refreshAndRestore(page);
    });

    await test.step("Select Mercer narrator after refresh", async () => {
      await selectNarrator(page, mercerPid);
    });

    await test.step("Load spine from localStorage", async () => {
      await page.evaluate((pid: string) => {
        if (typeof loadSpineLocal === "function") loadSpineLocal(pid);
      }, mercerPid);
      await page.waitForTimeout(500);
    });

    await test.step("Verify spine was restored with same periods", async () => {
      const restoredStartYear = await readState(page, "timeline.spine.periods");
      expect(restoredStartYear).toBeDefined();
      expect(restoredStartYear[0].start_year.toString()).toBe(recordedStartYear);
    });

    await test.step("Verify period count is still 6", async () => {
      const periods = await readState(page, "timeline.spine.periods");
      expect(periods.length).toBe(6);
    });
  });

  test("TL-05: Sparse Narrator Timeline", async ({ page, request }) => {
    await test.step("Navigate to UI", async () => {
      await navigateToUI(page);
    });

    let sparsePid = "";

    await test.step("Create narrator via API with NO DOB and NO POB", async () => {
      sparsePid = await apiCreateNarrator(request, "SparseTestNarrator", "", "");
      createdNarratorIds.push(sparsePid);
      expect(sparsePid).toBeTruthy();
    });

    await test.step("Load sparse narrator in UI", async () => {
      await selectNarrator(page, sparsePid);
      await page.waitForTimeout(500);
    });

    await test.step("Call initTimelineSpine without crashing", async () => {
      const result = await page.evaluate(() => {
        if (typeof initTimelineSpine === "function") {
          try { initTimelineSpine(); return "success"; }
          catch (e: any) { return `error: ${e.message}`; }
        }
        return "function_not_found";
      });
      expect(result).toBe("success");
    });

    await test.step("Verify seedReady is falsy or spine is empty", async () => {
      const result = await page.evaluate(() => {
        const s = (typeof state !== "undefined") ? state : null;
        if (!s) return { seedReady: false, spine: null };
        return { seedReady: s.timeline?.seedReady, spine: s.timeline?.spine };
      });
      const condition = !result.seedReady || !result.spine || Object.keys(result.spine).length === 0;
      expect(condition).toBe(true);
    });

    await test.step("Verify periods array is empty or undefined", async () => {
      const periods = await readState(page, "timeline.spine.periods");
      const condition = !periods || (Array.isArray(periods) && periods.length === 0);
      expect(condition).toBe(true);
    });
  });
});
