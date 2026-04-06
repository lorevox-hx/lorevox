/**
 * graph-test-helpers.ts — Phase Q.2 Break-Test Helpers
 *
 * Reusable helpers for Playwright e2e tests targeting the
 * Lorevox 9.0 relationship graph layer.
 */

import { Page, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/* ── Environment ─────────────────────────────────────────── */

const API_URL = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";
const UI_URL  = process.env.LOREVOX_UI_URL   || "http://127.0.0.1:8080";
const TEMPLATE_DIR = path.resolve(__dirname, "../../../ui/templates");

/* ── Types ───────────────────────────────────────────────── */

export interface GraphPerson {
  id: string;
  narratorId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  isNarrator: boolean;
  [key: string]: any;
}

export interface GraphRelationship {
  id: string;
  narratorId: string;
  fromPersonId: string;
  toPersonId: string;
  relationshipType: string;
  subtype: string;
  label: string;
  [key: string]: any;
}

export interface GraphSnapshot {
  persons: GraphPerson[];
  relationships: GraphRelationship[];
}

export interface GraphStats {
  personCount: number;
  relationshipCount: number;
  typeCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  narratorNode: GraphPerson | null;
}

export interface GraphCounts {
  persons: number;
  relationships: number;
}

/* ── Template Helpers ────────────────────────────────────── */

export function loadTemplate(filename: string): any {
  const p = path.join(TEMPLATE_DIR, filename);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/* ── API Helpers (direct REST, bypass UI) ────────────────── */

/** Create a narrator person via API and return the person_id */
export async function apiCreateNarrator(
  request: any,
  name: string,
  dob = "1950-01-01",
  pob = "Test City"
): Promise<string> {
  const r = await request.post(`${API_URL}/api/people`, {
    data: { display_name: name, role: "narrator", date_of_birth: dob, place_of_birth: pob },
  });
  const body = await r.json();
  return body.person_id;
}

/** Hard-delete a narrator via API */
export async function apiDeleteNarrator(request: any, pid: string): Promise<void> {
  await request.delete(`${API_URL}/api/people/${pid}?mode=hard&reason=e2e+cleanup`);
}

/** GET the full graph for a narrator via REST */
export async function apiGetGraph(request: any, pid: string): Promise<GraphSnapshot> {
  const r = await request.get(`${API_URL}/api/graph/${pid}`);
  return await r.json();
}

/** PUT a full graph replacement via REST */
export async function apiPutGraph(
  request: any,
  pid: string,
  data: { persons: any[]; relationships: any[] }
): Promise<void> {
  await request.put(`${API_URL}/api/graph/${pid}`, { data });
}

/** POST a single person to a narrator's graph via REST */
export async function apiAddPerson(request: any, narratorId: string, person: any): Promise<any> {
  const r = await request.post(`${API_URL}/api/graph/${narratorId}/person`, { data: person });
  return await r.json();
}

/** POST a single relationship to a narrator's graph via REST */
export async function apiAddRelationship(request: any, narratorId: string, rel: any): Promise<any> {
  const r = await request.post(`${API_URL}/api/graph/${narratorId}/relationship`, { data: rel });
  return await r.json();
}

/** DELETE a person from the graph */
export async function apiDeletePerson(request: any, personId: string): Promise<void> {
  await request.delete(`${API_URL}/api/graph/person/${personId}`);
}

/** DELETE a relationship from the graph */
export async function apiDeleteRelationship(request: any, relId: string): Promise<void> {
  await request.delete(`${API_URL}/api/graph/relationship/${relId}`);
}

/* ── UI Navigation Helpers ───────────────────────────────── */

/** Navigate to the Lori 9.0 UI and wait for load */
export async function navigateToUI(page: Page): Promise<void> {
  await page.goto(`${UI_URL}/ui/lori9.0.html`);
  await expect(page.locator("body")).toBeVisible();
  // Wait for app init
  await page.waitForFunction(() => !!(window as any).LorevoxBioBuilderModules);
  // Phase Q.4: Force model ready in test environment so chat/onboarding gates open.
  // In production, pollModelReady() handles this via /api/warmup.
  await page.evaluate(() => {
    if (typeof (window as any)._forceModelReady === "function") {
      (window as any)._forceModelReady();
    }
  });
}

/** Preload a narrator from a JSON template file via the in-page preload API */
export async function preloadNarratorFromTemplate(
  page: Page,
  templateFilename: string
): Promise<string> {
  const tpl = loadTemplate(templateFilename);
  const pid: string = await page.evaluate(async (template: any) => {
    return await (window as any).lv80PreloadNarrator(template);
  }, tpl);
  // Wait for graph sync to complete
  await page.waitForTimeout(500);
  return pid;
}

/** Select an existing narrator by person ID */
export async function selectNarrator(page: Page, pid: string): Promise<void> {
  await page.evaluate(async (personId: string) => {
    await (window as any).loadPerson(personId);
    // Ensure Bio Builder state is also switched — loadPerson only sets
    // state.person_id; the graph module needs bb.personId to be set.
    // _personChanged() normally fires only when Bio Builder popover opens.
    const coreMod = (window as any).LorevoxBioBuilderModules?.core;
    if (coreMod && typeof coreMod._personChanged === "function") {
      coreMod._personChanged(personId);
    }
  }, pid);
  // Wait for post-switch hooks (graph restore, QQ hydration)
  await page.waitForTimeout(600);
}

/** Open the Bio Builder popover */
export async function openBioBuilder(page: Page): Promise<void> {
  await page.locator("#lv80BioBuilderBtn").click();
  await expect(page.locator("#bioBuilderPopover")).toBeVisible();
}

/** Switch to the Questionnaire tab inside Bio Builder */
export async function openQuestionnaireTab(page: Page): Promise<void> {
  await page.locator("#bbTabQuestionnaire").click();
  await page.waitForTimeout(300);
}

/** Trigger a questionnaire save from the UI */
export async function triggerSave(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const qqMod = (window as any).LorevoxBioBuilderModules?.questionnaire;
    if (qqMod && typeof qqMod._saveSection === "function") {
      await qqMod._saveSection("personal");
    }
    // Also trigger graph fullSync
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    if (graphMod && typeof graphMod.fullSync === "function") {
      await graphMod.fullSync();
    }
  });
  await page.waitForTimeout(300);
}

/** Hard refresh the page */
export async function refreshAndRestore(page: Page): Promise<void> {
  await page.reload();
  await expect(page.locator("body")).toBeVisible();
  await page.waitForFunction(() => !!(window as any).LorevoxBioBuilderModules);
  await page.waitForTimeout(500);
}

/* ── Graph State Read Helpers (via page.evaluate) ─────── */

/** Read graph counts from the in-memory graph */
export async function readGraphCounts(page: Page): Promise<GraphCounts> {
  return await page.evaluate(() => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    if (graphMod && typeof graphMod.getStats === "function") {
      const s = graphMod.getStats();
      return { persons: s.personCount, relationships: s.relationshipCount };
    }
    return { persons: 0, relationships: 0 };
  });
}

/** Read full graph stats */
export async function readGraphStats(page: Page): Promise<GraphStats> {
  return await page.evaluate(() => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    if (graphMod && typeof graphMod.getStats === "function") {
      return graphMod.getStats();
    }
    return { personCount: 0, relationshipCount: 0, typeCounts: {}, sourceCounts: {}, narratorNode: null };
  });
}

/** Read the full in-memory graph as arrays */
export async function readGraphSnapshot(page: Page): Promise<GraphSnapshot> {
  return await page.evaluate(() => {
    const bb = (window as any).LorevoxBioBuilderModules?.core?._bb?.();
    if (!bb?.graph) return { persons: [], relationships: [] };
    return {
      persons: Object.values(bb.graph.persons),
      relationships: Object.values(bb.graph.relationships),
    };
  });
}

/** Count QQ sections that have data */
export async function readQuestionnaireSectionCounts(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const bb = (window as any).LorevoxBioBuilderModules?.core?._bb?.();
    if (!bb?.questionnaire) return 0;
    return Object.keys(bb.questionnaire).filter((k: string) => {
      const v = bb.questionnaire[k];
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "object" && v) return Object.values(v).some((x: any) => !!x);
      return !!v;
    }).length;
  });
}

/** Get the currently active narrator person ID */
export async function getActiveNarratorId(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return (window as any).state?.activePersonId || "";
  });
}

/** Get the currently active narrator name */
export async function getActiveNarratorName(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return (window as any).state?.profile?.basics?.fullname ||
           (window as any).state?.profile?.basics?.preferred || "";
  });
}

/* ── Graph Mutation Helpers (via page.evaluate) ──────── */

/** Upsert a person into the in-memory graph */
export async function upsertGraphPerson(page: Page, opts: Record<string, any>): Promise<GraphPerson> {
  return await page.evaluate((personOpts: any) => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    return graphMod.upsertPerson(personOpts);
  }, opts);
}

/** Upsert a relationship into the in-memory graph */
export async function upsertGraphRelationship(page: Page, opts: Record<string, any>): Promise<GraphRelationship> {
  return await page.evaluate((relOpts: any) => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    return graphMod.upsertRelationship(relOpts);
  }, opts);
}

/** Remove a person from the in-memory graph */
export async function removeGraphPerson(page: Page, personId: string): Promise<void> {
  await page.evaluate((pid: string) => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    graphMod.removePerson(pid);
  }, personId);
}

/** Remove a relationship from the in-memory graph */
export async function removeGraphRelationship(page: Page, relId: string): Promise<void> {
  await page.evaluate((rid: string) => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    graphMod.removeRelationship(rid);
  }, relId);
}

/** Find a person by display name in the in-memory graph.
 *  Uses substring matching: "Michael Bennett" matches "Michael Thomas Bennett".
 *  Falls back to the module's exact-match findPersonByName first. */
export async function findPersonByName(page: Page, name: string): Promise<GraphPerson | null> {
  return await page.evaluate((n: string) => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    // Try exact match first
    const exact = graphMod.findPersonByName(n);
    if (exact) return exact;
    // Fallback: substring match on displayName (handles middle names)
    const bb = (window as any).LorevoxBioBuilderModules?.core?._bb?.();
    if (!bb?.graph?.persons) return null;
    const needle = n.toLowerCase().trim();
    const parts = needle.split(/\s+/);
    const persons = Object.values(bb.graph.persons) as any[];
    for (const p of persons) {
      const dn = (p.displayName || "").toLowerCase().trim();
      // All parts of the search name must appear in the displayName
      if (parts.every((part: string) => dn.includes(part))) return p;
    }
    return null;
  }, name);
}

/** Get all relationship edges for a person */
export async function getRelationshipsFor(page: Page, personId: string): Promise<GraphRelationship[]> {
  return await page.evaluate((pid: string) => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    return graphMod.getRelationshipsFor(pid);
  }, personId);
}

/** Trigger a graph fullSync (QQ → graph → backend) */
export async function triggerFullSync(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    if (graphMod && typeof graphMod.fullSync === "function") {
      await graphMod.fullSync();
    }
  });
  await page.waitForTimeout(300);
}

/** Persist the in-memory graph to the backend without full sync */
export async function persistGraphToBackend(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    if (graphMod && typeof graphMod.persistToBackend === "function") {
      await graphMod.persistToBackend();
    }
  });
  await page.waitForTimeout(200);
}

/** Restore graph from backend for given narrator */
export async function restoreGraphFromBackend(page: Page, pid: string): Promise<void> {
  await page.evaluate(async (narratorId: string) => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    if (graphMod && typeof graphMod.restoreFromBackend === "function") {
      await graphMod.restoreFromBackend(narratorId);
    }
  }, pid);
  await page.waitForTimeout(300);
}

/* ── Assertion Helpers ───────────────────────────────────── */

/** Assert exactly one person node exists with the given display name.
 *  Uses substring matching: all parts of `name` must appear in displayName. */
export async function assertSinglePersonNodeByName(page: Page, name: string): Promise<GraphPerson> {
  const snap = await readGraphSnapshot(page);
  const parts = name.toLowerCase().trim().split(/\s+/);
  const matches = snap.persons.filter((p) => {
    const dn = (p.displayName || "").toLowerCase().trim();
    return parts.every((part) => dn.includes(part));
  });
  expect(matches.length).toBe(1);
  return matches[0];
}

/** Assert a relationship with the given label/type exists for a person */
export async function assertRelationshipLabel(
  page: Page,
  personId: string,
  relType: string
): Promise<GraphRelationship> {
  const rels = await getRelationshipsFor(page, personId);
  const match = rels.find((r) => r.relationshipType === relType);
  expect(match).toBeTruthy();
  return match!;
}

/** Assert no impossible parent-child cycle exists (A is both parent and child of B) */
export async function assertNoImpossibleParentChildCycle(page: Page): Promise<void> {
  const snap = await readGraphSnapshot(page);
  const parentEdges = snap.relationships.filter((r) => r.relationshipType === "parent");
  const childEdges = snap.relationships.filter((r) => r.relationshipType === "child");

  for (const pe of parentEdges) {
    // Check: if A→B is parent, there should not be B→A as parent (or A→B as child)
    const cycle = parentEdges.find(
      (other) => other.fromPersonId === pe.toPersonId && other.toPersonId === pe.fromPersonId
    );
    expect(cycle).toBeFalsy();
  }
}

/** Assert no cross-narrator bleed (all persons/rels belong to the given narrator) */
export async function assertNoCrossNarratorBleed(page: Page, expectedNarratorId: string): Promise<void> {
  const snap = await readGraphSnapshot(page);
  for (const p of snap.persons) {
    expect(p.narratorId).toBe(expectedNarratorId);
  }
  for (const r of snap.relationships) {
    expect(r.narratorId).toBe(expectedNarratorId);
  }
}

/** Assert graph is completely empty */
export async function assertEmptyGraph(page: Page): Promise<void> {
  const counts = await readGraphCounts(page);
  expect(counts.persons).toBe(0);
  expect(counts.relationships).toBe(0);
}

/** Dump graph state to console for diagnostics */
export async function dumpGraphDiagnostics(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
    if (!graphMod) return "graph module not loaded";
    const stats = graphMod.getStats();
    const bb = (window as any).LorevoxBioBuilderModules?.core?._bb?.();
    const persons = bb?.graph?.persons ? Object.values(bb.graph.persons) : [];
    const rels = bb?.graph?.relationships ? Object.values(bb.graph.relationships) : [];
    return JSON.stringify({ stats, persons, rels }, null, 2);
  });
}

export { API_URL, UI_URL, TEMPLATE_DIR };
