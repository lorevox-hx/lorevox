import { test, expect } from "@playwright/test";
import {
  navigateToUI,
  preloadNarratorFromTemplate,
  selectNarrator,
} from "./helpers/graph-test-helpers";

/**
 * Lorevox 9.0 Phase Q.3C — Projection Integrity Tests
 *
 * Validates the Interview Projection Sync Layer: write mode enforcement,
 * locking semantics, narrator-switch reset, suggestion queue, persistence,
 * and audit logging.
 *
 * PR-01: Projection Reset on Narrator Switch
 * PR-02: Prefill-if-Blank Rule
 * PR-03: Candidate-Only Behavior
 * PR-04: Suggest-Only Queue
 * PR-05: Projection Persistence (localStorage Round-Trip)
 * PR-06: Audit Log (syncLog)
 *
 * Run: npx playwright test tests/e2e/projection-integrity.spec.ts
 */

const API_URL = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
const UI_URL = process.env.LOREVOX_UI_URL || "http://127.0.0.1:8080";

test.describe("Projection Integrity — Phase Q.3C", () => {
  test.setTimeout(90_000);

  test("PR-01: Projection Reset on Narrator Switch", async ({ page }) => {
    await test.step("Navigate to UI", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";
    let quinnPid = "";

    await test.step("Preload Mercer and Quinn", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      expect(mercerPid).toBeTruthy();
      quinnPid = await preloadNarratorFromTemplate(page, "elena-rivera-quinn.json");
      expect(quinnPid).toBeTruthy();
    });

    await test.step("Verify LorevoxProjectionSync API exists", async () => {
      const hasSync = await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        return ps &&
          typeof ps.projectValue === "function" &&
          typeof ps.resetForNarrator === "function" &&
          typeof ps.getValue === "function" &&
          typeof ps.getStats === "function";
      });
      expect(hasSync).toBe(true);
    });

    await test.step("Initialize projection for Mercer", async () => {
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(300);
    });

    await test.step("Project a value into Mercer's projection", async () => {
      const result = await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        return ps.projectValue("personal.fullName", "David Alan Mercer", {
          source: "preload",
          confidence: 0.95,
        });
      });
      expect(result).toBe(true);
    });

    await test.step("Verify Mercer projection has 1 field", async () => {
      const stats = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getStats();
      });
      expect(stats.total).toBeGreaterThanOrEqual(1);
    });

    await test.step("Force persist Mercer projection to localStorage", async () => {
      await page.evaluate(() => {
        (window as any).LorevoxProjectionSync.forcePersist();
      });
      await page.waitForTimeout(500);
    });

    await test.step("Verify Mercer projection is in localStorage", async () => {
      const hasData = await page.evaluate((pid: string) => {
        const key = "lorevox_proj_draft_" + pid;
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed?.d?.fields?.["personal.fullName"]);
      }, mercerPid);
      expect(hasData).toBe(true);
    });

    await test.step("Switch to Quinn — should reset projection", async () => {
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, quinnPid);
      await page.waitForTimeout(300);
    });

    await test.step("Verify projection is clean for Quinn (no Mercer bleed)", async () => {
      const mercerName = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.fullName");
      });
      // Quinn's projection should NOT contain Mercer's name
      expect(mercerName).not.toBe("David Alan Mercer");
    });

    await test.step("Verify Quinn's projection has zero or different fields", async () => {
      const stats = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getStats();
      });
      // Quinn has no prior projection data, so total should be 0
      // (or at most whatever the backend returned, which shouldn't include Mercer's data)
      const fullName = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.fullName");
      });
      expect(fullName).not.toBe("David Alan Mercer");
    });

    await test.step("Switch back to Mercer — projection should restore", async () => {
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(500);
    });

    await test.step("Verify Mercer's fullName was restored from localStorage", async () => {
      const name = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.fullName");
      });
      expect(name).toBe("David Alan Mercer");
    });
  });

  test("PR-02: Prefill-if-Blank Rule", async ({ page }) => {
    await test.step("Navigate to UI and preload narrator", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";

    await test.step("Preload Mercer and init projection", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(300);
    });

    await test.step("Confirm personal.fullName is prefill_if_blank write mode", async () => {
      const writeMode = await page.evaluate(() => {
        const pm = (window as any).LorevoxProjectionMap;
        return pm ? pm.getWriteMode("personal.fullName") : null;
      });
      expect(writeMode).toBe("prefill_if_blank");
    });

    await test.step("Project fullName via interview source", async () => {
      const result = await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        return ps.projectValue("personal.fullName", "David Alan Mercer", {
          source: "interview",
          confidence: 0.9,
        });
      });
      expect(result).toBe(true);
    });

    await test.step("Verify value is stored in projection", async () => {
      const val = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.fullName");
      });
      expect(val).toBe("David Alan Mercer");
    });

    await test.step("Mark human edit — should lock the field", async () => {
      await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.markHumanEdit("personal.fullName", "David A. Mercer");
      });
    });

    await test.step("Verify field is now locked", async () => {
      const locked = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.isLocked("personal.fullName");
      });
      expect(locked).toBe(true);
    });

    await test.step("Verify human edit value persisted", async () => {
      const val = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.fullName");
      });
      expect(val).toBe("David A. Mercer");
    });

    await test.step("Attempt AI overwrite on locked field — should be blocked", async () => {
      const result = await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        return ps.projectValue("personal.fullName", "David Alan Mercer Jr.", {
          source: "interview",
          confidence: 0.99,
        });
      });
      expect(result).toBe(false);
    });

    await test.step("Verify value unchanged after blocked AI overwrite", async () => {
      const val = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.fullName");
      });
      expect(val).toBe("David A. Mercer");
    });
  });

  test("PR-03: Candidate-Only Behavior", async ({ page }) => {
    await test.step("Navigate to UI and preload narrator", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";

    await test.step("Preload Mercer and init projection", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(300);
    });

    await test.step("Confirm parents section is candidate_only write mode", async () => {
      const writeMode = await page.evaluate(() => {
        const pm = (window as any).LorevoxProjectionMap;
        return pm ? pm.getWriteMode("parents[0].firstName") : null;
      });
      expect(writeMode).toBe("candidate_only");
    });

    await test.step("Project a parent's firstName via candidate_only path", async () => {
      const result = await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        return ps.projectValue("parents[0].firstName", "Robert", {
          source: "interview",
          confidence: 0.85,
        });
      });
      expect(result).toBe(true);
    });

    await test.step("Verify value is stored in projection fields", async () => {
      const val = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("parents[0].firstName");
      });
      expect(val).toBe("Robert");
    });

    await test.step("Verify candidate_only did NOT write directly to BB questionnaire parents array", async () => {
      const directWrite = await page.evaluate(() => {
        const bb = (window as any).state?.bioBuilder;
        if (!bb || !bb.questionnaire || !bb.questionnaire.parents) return false;
        const parents = bb.questionnaire.parents;
        if (!Array.isArray(parents) || parents.length === 0) return false;
        // Check if projection wrote "Robert" directly — it shouldn't have
        return parents.some((p: any) => p.firstName === "Robert");
      });
      // candidate_only should create a candidate, NOT write to BB questionnaire directly
      expect(directWrite).toBe(false);
    });
  });

  test("PR-04: Suggest-Only Queue", async ({ page }) => {
    await test.step("Navigate to UI and preload narrator", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";

    await test.step("Preload Mercer and init projection", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(300);
    });

    await test.step("Confirm earlyMemories.firstMemory is suggest_only", async () => {
      const writeMode = await page.evaluate(() => {
        const pm = (window as any).LorevoxProjectionMap;
        return pm ? pm.getWriteMode("earlyMemories.firstMemory") : null;
      });
      expect(writeMode).toBe("suggest_only");
    });

    await test.step("Project a suggest_only value", async () => {
      const result = await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        return ps.projectValue("earlyMemories.firstMemory", "Playing in the backyard with the dog", {
          source: "interview",
          confidence: 0.7,
        });
      });
      expect(result).toBe(true);
    });

    await test.step("Verify suggestion was queued", async () => {
      const suggestions = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getPendingSuggestions();
      });
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      const match = suggestions.find((s: any) => s.fieldPath === "earlyMemories.firstMemory");
      expect(match).toBeTruthy();
      expect(match.value).toBe("Playing in the backyard with the dog");
    });

    await test.step("Accept the suggestion", async () => {
      const accepted = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.acceptSuggestion("earlyMemories.firstMemory");
      });
      expect(accepted).toBe(true);
    });

    await test.step("Verify suggestion removed from pending", async () => {
      const suggestions = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getPendingSuggestions();
      });
      const match = suggestions.find((s: any) => s.fieldPath === "earlyMemories.firstMemory");
      expect(match).toBeFalsy();
    });

    await test.step("Queue another suggestion and dismiss it", async () => {
      await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.projectValue("earlyMemories.favoriteToy", "A wooden train set", {
          source: "interview",
          confidence: 0.6,
        });
      });

      const beforeDismiss = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getPendingSuggestions();
      });
      const hasToy = beforeDismiss.find((s: any) => s.fieldPath === "earlyMemories.favoriteToy");
      expect(hasToy).toBeTruthy();

      await page.evaluate(() => {
        (window as any).LorevoxProjectionSync.dismissSuggestion("earlyMemories.favoriteToy");
      });

      const afterDismiss = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getPendingSuggestions();
      });
      const stillHasToy = afterDismiss.find((s: any) => s.fieldPath === "earlyMemories.favoriteToy");
      expect(stillHasToy).toBeFalsy();
    });
  });

  test("PR-05: Projection Persistence (localStorage Round-Trip)", async ({ page }) => {
    await test.step("Navigate to UI and preload narrator", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";

    await test.step("Preload Mercer and init projection", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(300);
    });

    await test.step("Project multiple values", async () => {
      await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.projectValue("personal.fullName", "David Alan Mercer", { source: "preload", confidence: 0.95 });
        ps.projectValue("personal.dateOfBirth", "1946-05-18", { source: "preload", confidence: 0.95 });
        ps.projectValue("personal.placeOfBirth", "Joplin, Missouri", { source: "preload", confidence: 0.95 });
      });
    });

    await test.step("Force persist to localStorage", async () => {
      await page.evaluate(() => {
        (window as any).LorevoxProjectionSync.forcePersist();
      });
      await page.waitForTimeout(300);
    });

    await test.step("Verify localStorage has projection data", async () => {
      const hasData = await page.evaluate((pid: string) => {
        const key = "lorevox_proj_draft_" + pid;
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed && parsed.d && parsed.d.fields);
      }, mercerPid);
      expect(hasData).toBe(true);
    });

    await test.step("Clear in-memory projection, then restore from localStorage", async () => {
      await page.evaluate((pid: string) => {
        const proj = (window as any).state?.interviewProjection;
        if (proj) {
          proj.fields = {};
          proj.pendingSuggestions = [];
        }
        // Restore
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(500);
    });

    await test.step("Verify values were restored from localStorage", async () => {
      const fullName = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.fullName");
      });
      const dob = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.dateOfBirth");
      });
      const pob = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getValue("personal.placeOfBirth");
      });
      expect(fullName).toBe("David Alan Mercer");
      expect(dob).toBe("1946-05-18");
      expect(pob).toBe("Joplin, Missouri");
    });
  });

  test("PR-06: Audit Log (syncLog)", async ({ page }) => {
    await test.step("Navigate to UI and preload narrator", async () => {
      await navigateToUI(page);
    });

    let mercerPid = "";

    await test.step("Preload Mercer and init projection", async () => {
      mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
      await page.evaluate((pid: string) => {
        const ps = (window as any).LorevoxProjectionSync;
        ps.resetForNarrator(pid);
      }, mercerPid);
      await page.waitForTimeout(300);
    });

    await test.step("Perform several projection operations", async () => {
      await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        // 1. Project a value
        ps.projectValue("personal.fullName", "David Alan Mercer", { source: "preload", confidence: 0.9 });
        // 2. Human edit (locks it)
        ps.markHumanEdit("personal.fullName", "David A. Mercer");
        // 3. AI overwrite attempt (should be blocked — locked field)
        ps.projectValue("personal.fullName", "Dave Mercer", { source: "interview", confidence: 0.8 });
        // 4. Suggest-only queued
        ps.projectValue("earlyMemories.firstMemory", "The creek behind the house", { source: "interview", confidence: 0.7 });
      });
    });

    await test.step("Verify syncLog has entries", async () => {
      const log = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getSyncLog();
      });
      expect(log.length).toBeGreaterThanOrEqual(3);
    });

    await test.step("Verify syncLog contains expected action types", async () => {
      const log: any[] = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getSyncLog();
      });

      const actions = log.map((e: any) => e.action);

      // Should have at least: projected, projected (human), blocked_locked
      expect(actions).toContain("projected");
      expect(actions).toContain("blocked_locked");
    });

    await test.step("Verify syncLog entries have required fields", async () => {
      const log: any[] = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getSyncLog();
      });

      for (const entry of log) {
        expect(entry).toHaveProperty("fieldPath");
        expect(entry).toHaveProperty("action");
        expect(entry).toHaveProperty("ts");
        expect(typeof entry.ts).toBe("number");
      }
    });

    await test.step("Verify syncLog is capped at 200 entries", async () => {
      // Generate many log entries to test cap
      await page.evaluate(() => {
        const ps = (window as any).LorevoxProjectionSync;
        for (let i = 0; i < 210; i++) {
          ps.projectValue("hobbies.travel", "Trip " + i, {
            source: "interview",
            confidence: 0.5 + (i * 0.001),
          });
        }
      });

      const log = await page.evaluate(() => {
        return (window as any).LorevoxProjectionSync.getSyncLog();
      });
      expect(log.length).toBeLessThanOrEqual(200);
    });

    await test.step("Verify syncLog is NOT persisted (session-only)", async () => {
      // Force persist, then check localStorage does NOT contain syncLog
      await page.evaluate(() => {
        (window as any).LorevoxProjectionSync.forcePersist();
      });
      await page.waitForTimeout(300);

      const syncLogInStorage = await page.evaluate((pid: string) => {
        const key = "lorevox_proj_draft_" + pid;
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed?.d?.syncLog);
      }, mercerPid);
      expect(syncLogInStorage).toBe(false);
    });
  });
});
