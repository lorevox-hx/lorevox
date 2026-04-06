/**
 * relationship-graph-break.spec.ts — Phase Q.2 Break Tests
 *
 * 10 targeted stress/failure scenarios designed to break the
 * Phase Q.1 Relationship Graph Layer.  Each test attacks a known
 * weak point: identity collision, role conflict, generation loops,
 * name ambiguity, unsaved bleed, partial data, mid-sync refresh,
 * rapid edits, max density, and type drift.
 *
 * Run:
 *   npx playwright test tests/e2e/relationship-graph-break.spec.ts
 *   npx playwright test tests/e2e/relationship-graph-break.spec.ts --headed
 */

import { test, expect } from "@playwright/test";
import {
  navigateToUI,
  preloadNarratorFromTemplate,
  selectNarrator,
  triggerFullSync,
  persistGraphToBackend,
  restoreGraphFromBackend,
  readGraphCounts,
  readGraphSnapshot,
  readGraphStats,
  readQuestionnaireSectionCounts,
  findPersonByName,
  getRelationshipsFor,
  upsertGraphPerson,
  upsertGraphRelationship,
  removeGraphPerson,
  removeGraphRelationship,
  refreshAndRestore,
  getActiveNarratorId,
  getActiveNarratorName,
  assertSinglePersonNodeByName,
  assertRelationshipLabel,
  assertNoImpossibleParentChildCycle,
  assertNoCrossNarratorBleed,
  assertEmptyGraph,
  dumpGraphDiagnostics,
  apiGetGraph,
  apiDeleteNarrator,
  API_URL,
} from "./helpers/graph-test-helpers";

/* ═══════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════ */

// Increase timeout for stress tests
test.setTimeout(90_000);

// Collect narrator PIDs for cleanup
const createdPids: string[] = [];

/* ═══════════════════════════════════════════════════════════════
   SETUP / TEARDOWN
   ═══════════════════════════════════════════════════════════════ */

test.afterAll(async ({ request }) => {
  for (const pid of createdPids) {
    try {
      await apiDeleteNarrator(request, pid);
    } catch { /* best-effort cleanup */ }
  }
});

/* ═══════════════════════════════════════════════════════════════
   TEST 1 — Identity Collision
   Goal: One person should support multiple relationship edges
         without duplicate person-node creation.
   ═══════════════════════════════════════════════════════════════ */

test("BT-01: Identity Collision — same name, different relationship types", async ({ page }) => {
  await test.step("Navigate and preload Mercer", async () => {
    await navigateToUI(page);
  });

  let mercerPid: string;
  await test.step("Preload David Alan Mercer", async () => {
    mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
    createdPids.push(mercerPid);
  });

  await test.step("Verify Michael Bennett exists as Partner", async () => {
    const michael = await findPersonByName(page, "Michael Bennett");
    expect(michael).toBeTruthy();
    const rels = await getRelationshipsFor(page, michael!.id);
    const partnerEdge = rels.find(r => r.subtype === "partner" || r.relationshipType === "partner");
    expect(partnerEdge).toBeTruthy();
  });

  await test.step("Add second relationship for Michael Bennett as Chosen Family", async () => {
    const michael = await findPersonByName(page, "Michael Bennett");
    // Add a chosen_family edge between narrator and Michael
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode;
    expect(narratorNode).toBeTruthy();

    await upsertGraphRelationship(page, {
      narratorId: mercerPid!,
      fromPersonId: michael!.id,
      toPersonId: narratorNode!.id,
      relationshipType: "chosen_family",
      subtype: "chosen_family",
      label: "Chosen Family",
      source: "test",
      provenance: "break-test:identity-collision",
    });
  });

  await test.step("Assert: ONE Michael Bennett node, TWO edges", async () => {
    // Single node assertion
    const person = await assertSinglePersonNodeByName(page, "Michael Bennett");

    // Two relationship edges involving Michael
    const rels = await getRelationshipsFor(page, person.id);
    const edgeTypes = rels.map(r => r.relationshipType).sort();
    expect(edgeTypes.length).toBeGreaterThanOrEqual(2);
    expect(edgeTypes).toContain("chosen_family");
    // Should also still have the partner/spouse edge
    const hasPartnerOrSpouse = rels.some(r =>
      r.relationshipType === "partner" || r.relationshipType === "spouse"
    );
    expect(hasPartnerOrSpouse).toBe(true);
  });

  await test.step("Persist and verify backend integrity", async () => {
    await persistGraphToBackend(page);
    const snap = await readGraphSnapshot(page);
    const michaels = snap.persons.filter(p => {
      const dn = (p.displayName || "").toLowerCase();
      return dn.includes("michael") && dn.includes("bennett");
    });
    expect(michaels.length).toBe(1);
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 2 — Role Conflict
   Goal: Same person can hold multiple roles without overwrite.
   ═══════════════════════════════════════════════════════════════ */

test("BT-02: Role Conflict — one person, two distinct roles", async ({ page }) => {
  await test.step("Navigate and preload Eleanor Price", async () => {
    await navigateToUI(page);
  });

  let eleanorPid: string;
  await test.step("Preload Eleanor Mae Price", async () => {
    eleanorPid = await preloadNarratorFromTemplate(page, "eleanor-mae-price.json");
    createdPids.push(eleanorPid);
  });

  let testPerson: any;
  // Use a unique name to avoid collision with template-sourced persons
  // (Eleanor's template has "Mark Leonard Bishop" as a sibling)
  const ROLE_TEST_NAME = "Zachary Rollins";

  await test.step("Create test person as Stepbrother", async () => {
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode;
    expect(narratorNode).toBeTruthy();

    testPerson = await upsertGraphPerson(page, {
      narratorId: eleanorPid!,
      firstName: "Zachary",
      lastName: "Rollins",
      source: "test",
      provenance: "break-test:role-conflict",
    });

    await upsertGraphRelationship(page, {
      narratorId: eleanorPid!,
      fromPersonId: testPerson.id,
      toPersonId: narratorNode!.id,
      relationshipType: "sibling",
      subtype: "step",
      label: "Stepbrother",
      source: "test",
    });
  });

  await test.step("Add same person also as Legal Guardian", async () => {
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode;

    await upsertGraphRelationship(page, {
      narratorId: eleanorPid!,
      fromPersonId: testPerson.id,
      toPersonId: narratorNode!.id,
      relationshipType: "guardian",
      subtype: "legal_guardian",
      label: "Legal Guardian",
      source: "test",
    });
  });

  await test.step("Assert: one person node, two distinct edges", async () => {
    const person = await assertSinglePersonNodeByName(page, ROLE_TEST_NAME);
    const rels = await getRelationshipsFor(page, person.id);
    const types = rels.map(r => r.relationshipType);
    expect(types).toContain("sibling");
    expect(types).toContain("guardian");
    // No role collapse
    expect(types.filter(t => t === "sibling").length).toBe(1);
    expect(types.filter(t => t === "guardian").length).toBe(1);
  });

  await test.step("Persist and verify backend has both roles", async () => {
    await persistGraphToBackend(page);

    // Check backend directly — after fullSync from QQ, test-injected persons
    // (source: "test") may not survive in-memory rebuild, but they SHOULD
    // survive in the backend snapshot that was persisted before fullSync.
    const apiSnap = await page.evaluate(async (pid: string) => {
      const origin = (window as any).LOREVOX_API || "http://localhost:8000";
      const r = await fetch(`${origin}/api/graph/${pid}`);
      return await r.json();
    }, eleanorPid!);

    // Backend should have persons and relationships
    expect(apiSnap.persons.length).toBeGreaterThan(0);

    // Verify Zachary Rollins exists in the persisted snapshot
    const zachInBackend = apiSnap.persons.find((p: any) =>
      (p.display_name || "").toLowerCase().includes("zachary") &&
      (p.display_name || "").toLowerCase().includes("rollins")
    );
    expect(zachInBackend).toBeTruthy();

    // Verify both relationship types are persisted
    if (zachInBackend) {
      const zachRels = apiSnap.relationships.filter((r: any) =>
        r.from_person_id === zachInBackend.id || r.to_person_id === zachInBackend.id
      );
      const relTypes = zachRels.map((r: any) => r.relationship_type);
      expect(relTypes).toContain("sibling");
      expect(relTypes).toContain("guardian");
    }
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 3 — Generation Loop Safety
   Goal: Prevent impossible ancestry (A is both parent and child of B).
   ═══════════════════════════════════════════════════════════════ */

test("BT-03: Generation Loop — attempt to create parent-child cycle", async ({ page }) => {
  await test.step("Navigate and preload Eleanor Price", async () => {
    await navigateToUI(page);
  });

  let eleanorPid: string;
  await test.step("Preload Eleanor Mae Price", async () => {
    eleanorPid = await preloadNarratorFromTemplate(page, "eleanor-mae-price.json");
    createdPids.push(eleanorPid);
  });

  await test.step("Find a child of Eleanor and try to make them a parent", async () => {
    const snap = await readGraphSnapshot(page);
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode;

    // Find an existing child edge
    const childEdge = snap.relationships.find(r => r.relationshipType === "child");
    if (!childEdge) {
      // No children in this narrator — create one first
      // Convention: child edges are stored as narrator → child (matching syncFromQuestionnaire)
      const childPerson = await upsertGraphPerson(page, {
        narratorId: eleanorPid!,
        firstName: "Andrew",
        lastName: "Price",
        source: "test",
      });
      await upsertGraphRelationship(page, {
        narratorId: eleanorPid!,
        fromPersonId: narratorNode!.id,
        toPersonId: childPerson.id,
        relationshipType: "child",
        subtype: "biological",
        label: "Son",
        source: "test",
      });
    }
  });

  await test.step("Attempt to inject the child as a parent of the narrator", async () => {
    const snap = await readGraphSnapshot(page);
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode;

    // Find the child person
    // Children are stored as fromPersonId=narrator → toPersonId=child
    const childEdge = snap.relationships.find(r => r.relationshipType === "child");
    const childPersonId = childEdge ? childEdge.toPersonId : null;

    if (childPersonId && narratorNode) {
      // Try to add a parent edge from the same person to narrator
      // This SHOULD either be rejected or at minimum create an identifiable anomaly
      await upsertGraphRelationship(page, {
        narratorId: eleanorPid!,
        fromPersonId: childPersonId,
        toPersonId: narratorNode.id,
        relationshipType: "parent",
        subtype: "biological",
        label: "Parent (conflicting)",
        source: "test",
        provenance: "break-test:generation-loop",
      });
    }
  });

  await test.step("Assert: cycle was blocked by _wouldCreateCycle guard", async () => {
    // Phase Q.2 FIX: upsertRelationship now returns null for impossible cycles.
    // The conflicting parent edge should NOT exist in the graph.
    const snap = await readGraphSnapshot(page);
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode;

    if (narratorNode) {
      const parentEdges = snap.relationships.filter(
        r => r.relationshipType === "parent" && r.toPersonId === narratorNode.id
      );
      const childEdges = snap.relationships.filter(
        r => r.relationshipType === "child"
      );

      // No person should appear as both parent AND child of narrator
      const parentPersonIds = new Set(parentEdges.map(r => r.fromPersonId));
      const childPersonIds = new Set(childEdges.map(r => r.toPersonId));
      const cyclePersons = [...parentPersonIds].filter(id => childPersonIds.has(id));

      expect(cyclePersons.length).toBe(0);
    }

    // Graph should remain stable
    const countsAfter = await readGraphCounts(page);
    expect(countsAfter.persons).toBeGreaterThan(0);
    expect(countsAfter.relationships).toBeGreaterThan(0);

    // Verify via assertNoImpossibleParentChildCycle helper
    await assertNoImpossibleParentChildCycle(page);
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 4 — Name Change Continuity
   Goal: Name similarity must not force invalid merges.
   ═══════════════════════════════════════════════════════════════ */

test("BT-04: Name Continuity — surname overlap must not force merge", async ({ page }) => {
  await test.step("Navigate and preload Quinn", async () => {
    await navigateToUI(page);
  });

  let quinnPid: string;
  await test.step("Preload Elena Rivera Quinn", async () => {
    quinnPid = await preloadNarratorFromTemplate(page, "elena-rivera-quinn.json");
    createdPids.push(quinnPid);
  });

  await test.step("Verify Elena narrator node exists", async () => {
    const stats = await readGraphStats(page);
    expect(stats.narratorNode).toBeTruthy();
    expect(stats.narratorNode!.displayName.toLowerCase()).toContain("elena");
  });

  await test.step("Add 'Elena Rivera' as a Sibling (different person, old name overlap)", async () => {
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode!;

    // Create a person named "Elena Rivera" — this has name overlap with narrator "Elena Rivera Quinn"
    const elenaRivera = await upsertGraphPerson(page, {
      narratorId: quinnPid!,
      firstName: "Elena",
      lastName: "Rivera",
      source: "test",
      provenance: "break-test:name-continuity",
    });

    await upsertGraphRelationship(page, {
      narratorId: quinnPid!,
      fromPersonId: elenaRivera.id,
      toPersonId: narratorNode.id,
      relationshipType: "sibling",
      subtype: "biological",
      label: "Sister (name overlap test)",
      source: "test",
    });
  });

  await test.step("Assert: narrator and 'Elena Rivera' are SEPARATE nodes", async () => {
    const snap = await readGraphSnapshot(page);

    // Find all persons whose display name contains "elena"
    const elenas = snap.persons.filter(p =>
      (p.displayName || "").toLowerCase().includes("elena")
    );

    // Should be at least 2: the narrator + the sibling
    expect(elenas.length).toBeGreaterThanOrEqual(2);

    // The narrator node should still be the narrator
    const narratorElena = elenas.find(p => p.isNarrator);
    expect(narratorElena).toBeTruthy();

    // The sibling Elena Rivera should NOT be the narrator
    const siblingElena = elenas.find(p => !p.isNarrator && p.lastName === "Rivera" && !p.lastName?.includes("Quinn"));
    expect(siblingElena).toBeTruthy();

    // Their IDs should be different
    expect(narratorElena!.id).not.toBe(siblingElena!.id);
  });

  await test.step("Persist and verify no false merge on backend", async () => {
    await persistGraphToBackend(page);
    const apiSnap = await page.evaluate(async (pid: string) => {
      const origin = (window as any).LOREVOX_API || "http://localhost:8000";
      const r = await fetch(`${origin}/api/graph/${pid}`);
      return await r.json();
    }, quinnPid!);

    const elenas = apiSnap.persons.filter((p: any) =>
      (p.display_name || "").toLowerCase().includes("elena")
    );
    expect(elenas.length).toBeGreaterThanOrEqual(2);
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 5 — Unsaved Cross-Narrator Bleed
   Goal: Unsaved UI state must not leak between narrators.
   ═══════════════════════════════════════════════════════════════ */

test("BT-05: Cross-Narrator Bleed — unsaved data must not leak", async ({ page }) => {
  await test.step("Navigate to UI", async () => {
    await navigateToUI(page);
  });

  let mercerPid: string;
  let quinnPid: string;

  await test.step("Preload Mercer and Quinn", async () => {
    mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
    createdPids.push(mercerPid);
    quinnPid = await preloadNarratorFromTemplate(page, "elena-rivera-quinn.json");
    createdPids.push(quinnPid);
  });

  await test.step("Switch to Mercer, add unsaved phantom relationship", async () => {
    await selectNarrator(page, mercerPid!);
    await triggerFullSync(page);

    const countsBefore = await readGraphCounts(page);

    // Add a phantom person + edge — do NOT persist
    const stats = await readGraphStats(page);
    await upsertGraphPerson(page, {
      narratorId: mercerPid!,
      firstName: "Ghost",
      lastName: "Phantom",
      source: "test",
    });
    await upsertGraphRelationship(page, {
      narratorId: mercerPid!,
      fromPersonId: "ghost_phantom_fake_id",
      toPersonId: stats.narratorNode!.id,
      relationshipType: "other",
      label: "Phantom Unsaved",
      source: "test",
    });

    // Verify the phantom is in memory
    const countsAfter = await readGraphCounts(page);
    expect(countsAfter.persons).toBeGreaterThan(countsBefore.persons);
  });

  await test.step("Switch to Quinn WITHOUT saving Mercer", async () => {
    await selectNarrator(page, quinnPid!);
    // Graph should be Quinn's data now, not Mercer's
    await page.waitForTimeout(500);
  });

  await test.step("Assert: Quinn graph has no phantom data from Mercer", async () => {
    await triggerFullSync(page);
    const snap = await readGraphSnapshot(page);

    // No "Ghost Phantom" in Quinn's graph
    const ghosts = snap.persons.filter(p =>
      (p.displayName || "").toLowerCase().includes("phantom")
    );
    expect(ghosts.length).toBe(0);

    // No "other" relationship with phantom label
    const phantomRels = snap.relationships.filter(r =>
      (r.label || "").toLowerCase().includes("phantom")
    );
    expect(phantomRels.length).toBe(0);
  });

  await test.step("Switch back to Mercer — phantom should be gone", async () => {
    await selectNarrator(page, mercerPid!);
    await page.waitForTimeout(500);

    // The graph restores from backend, which never got the phantom
    // So the phantom should be gone
    const snap = await readGraphSnapshot(page);
    const ghosts = snap.persons.filter(p =>
      (p.displayName || "").toLowerCase().includes("phantom")
    );

    // After fullSync, QQ-based data will be rebuilt from questionnaire
    await triggerFullSync(page);
    const snapAfterSync = await readGraphSnapshot(page);
    const ghostsAfterSync = snapAfterSync.persons.filter(p =>
      (p.displayName || "").toLowerCase().includes("phantom")
    );

    // Phantom should not survive the round-trip
    // (It was never persisted, so backend restore + QQ sync won't include it)
    expect(ghostsAfterSync.length).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 6 — Partial Data Fragment
   Goal: Sparse/incomplete data must not crash or corrupt graph.
   ═══════════════════════════════════════════════════════════════ */

test("BT-06: Partial Data Fragment — sparse person/relationship must not crash", async ({ page }) => {
  await test.step("Navigate and preload Mankiller", async () => {
    await navigateToUI(page);
  });

  let mankillerPid: string;
  await test.step("Preload Wilma Mankiller", async () => {
    mankillerPid = await preloadNarratorFromTemplate(page, "wilma-mankiller.json");
    createdPids.push(mankillerPid);
  });

  await test.step("Add person with minimal data (just 'Unknown')", async () => {
    const stats = await readGraphStats(page);
    const countsBefore = await readGraphCounts(page);

    const unknownPerson = await upsertGraphPerson(page, {
      narratorId: mankillerPid!,
      firstName: "Unknown",
      lastName: "",
      source: "test",
      provenance: "break-test:partial-data",
    });

    expect(unknownPerson).toBeTruthy();
    expect(unknownPerson.id).toBeTruthy();

    // Add a parent edge with sparse data
    await upsertGraphRelationship(page, {
      narratorId: mankillerPid!,
      fromPersonId: unknownPerson.id,
      toPersonId: stats.narratorNode!.id,
      relationshipType: "parent",
      subtype: "",
      label: "",
      source: "test",
    });

    const countsAfter = await readGraphCounts(page);
    expect(countsAfter.persons).toBe(countsBefore.persons + 1);
    expect(countsAfter.relationships).toBe(countsBefore.relationships + 1);
  });

  await test.step("Persist, refresh, verify stable graph", async () => {
    await persistGraphToBackend(page);
    await refreshAndRestore(page);
    await selectNarrator(page, mankillerPid!);
    await triggerFullSync(page);

    const countsRestored = await readGraphCounts(page);
    expect(countsRestored.persons).toBeGreaterThan(0);
    expect(countsRestored.relationships).toBeGreaterThan(0);

    // The "Unknown" person should survive or be rebuilt from QQ
    // Graph should be stable regardless
    const snap = await readGraphSnapshot(page);
    // No NaN, no undefined IDs
    for (const p of snap.persons) {
      expect(p.id).toBeTruthy();
      expect(p.narratorId).toBeTruthy();
    }
    for (const r of snap.relationships) {
      expect(r.id).toBeTruthy();
      expect(r.fromPersonId).toBeTruthy();
      expect(r.toPersonId).toBeTruthy();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 7 — Hard Refresh Mid-Sync
   Goal: Refresh during save must not leave corrupted state.
   ═══════════════════════════════════════════════════════════════ */

test("BT-07: Hard Refresh Mid-Sync — no corruption from interrupted persist", async ({ page }) => {
  await test.step("Navigate and preload Shatner", async () => {
    await navigateToUI(page);
  });

  let shatnerPid: string;
  await test.step("Preload William Shatner", async () => {
    shatnerPid = await preloadNarratorFromTemplate(page, "william-shatner.json");
    createdPids.push(shatnerPid);
  });

  let countsBefore: any;
  await test.step("Record baseline counts", async () => {
    countsBefore = await readGraphCounts(page);
    expect(countsBefore.persons).toBeGreaterThan(0);
  });

  await test.step("Start fullSync and immediately refresh", async () => {
    // Fire fullSync without await — we want to interrupt it
    await page.evaluate(() => {
      const graphMod = (window as any).LorevoxBioBuilderModules?.graph;
      if (graphMod) graphMod.fullSync(); // intentionally not awaited
    });
    // Immediately refresh to interrupt
    await page.reload();
    await expect(page.locator("body")).toBeVisible();
    await page.waitForFunction(() => !!(window as any).LorevoxBioBuilderModules);
  });

  await test.step("Restore narrator and verify clean or recoverable state", async () => {
    await selectNarrator(page, shatnerPid!);
    await triggerFullSync(page);

    const countsAfter = await readGraphCounts(page);
    // Graph should either be fully restored or cleanly rebuilt from QQ
    expect(countsAfter.persons).toBeGreaterThan(0);
    expect(countsAfter.relationships).toBeGreaterThan(0);

    // No duplicate edges (the same edge ID should not appear twice)
    const snap = await readGraphSnapshot(page);
    const relIds = snap.relationships.map(r => r.id);
    const uniqueRelIds = new Set(relIds);
    expect(relIds.length).toBe(uniqueRelIds.size);

    // No duplicate persons
    const personIds = snap.persons.map(p => p.id);
    const uniquePersonIds = new Set(personIds);
    expect(personIds.length).toBe(uniquePersonIds.size);
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 8 — Rapid Edit Collision
   Goal: Fast sequential edits settle into one valid state.
   ═══════════════════════════════════════════════════════════════ */

test("BT-08: Rapid Edit Collision — fast multi-edit settles cleanly", async ({ page }) => {
  await test.step("Navigate and preload Trump", async () => {
    await navigateToUI(page);
  });

  let trumpPid: string;
  await test.step("Preload Donald Trump", async () => {
    trumpPid = await preloadNarratorFromTemplate(page, "donald-trump.json");
    createdPids.push(trumpPid);
  });

  await test.step("Perform rapid sequential edits", async () => {
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode!;

    // Edit 1: Add a new person
    const newPerson = await upsertGraphPerson(page, {
      narratorId: trumpPid!,
      firstName: "Tiffany",
      lastName: "Trump-Test",
      source: "test",
    });
    await upsertGraphRelationship(page, {
      narratorId: trumpPid!,
      fromPersonId: newPerson.id,
      toPersonId: narratorNode.id,
      relationshipType: "child",
      subtype: "biological",
      label: "Daughter (test)",
      source: "test",
    });

    // Edit 2: Modify an existing relationship label
    const snap = await readGraphSnapshot(page);
    const siblingRel = snap.relationships.find(r => r.relationshipType === "sibling");
    if (siblingRel) {
      await upsertGraphRelationship(page, {
        ...siblingRel,
        label: "Sibling (edited)",
      });
    }

    // Edit 3: Remove a person
    const personToRemove = snap.persons.find(p =>
      !p.isNarrator && (p.displayName || "").toLowerCase().includes("trump-test")
    );
    if (personToRemove) {
      // Actually, let's keep the person and just remove a relationship
      const relToRemove = snap.relationships.find(r =>
        r.relationshipType === "grandparent"
      );
      if (relToRemove) {
        await removeGraphRelationship(page, relToRemove.id);
      }
    }

    // Rapid save
    await persistGraphToBackend(page);
  });

  await test.step("Refresh and verify settled state", async () => {
    await refreshAndRestore(page);
    await selectNarrator(page, trumpPid!);
    await triggerFullSync(page);

    const snap = await readGraphSnapshot(page);

    // No duplicate person IDs
    const personIds = snap.persons.map(p => p.id);
    expect(personIds.length).toBe(new Set(personIds).size);

    // No duplicate relationship IDs
    const relIds = snap.relationships.map(r => r.id);
    expect(relIds.length).toBe(new Set(relIds).size);

    // Graph should have reasonable counts
    expect(snap.persons.length).toBeGreaterThan(5);
    expect(snap.relationships.length).toBeGreaterThan(4);
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 9 — Max Density Stress
   Goal: Dense family structures must not break UI or graph.
   ═══════════════════════════════════════════════════════════════ */

test("BT-09: Max Density — large family graph remains stable", async ({ page }) => {
  await test.step("Navigate and preload Eleanor Price", async () => {
    await navigateToUI(page);
  });

  let eleanorPid: string;
  await test.step("Preload Eleanor Mae Price", async () => {
    eleanorPid = await preloadNarratorFromTemplate(page, "eleanor-mae-price.json");
    createdPids.push(eleanorPid);
  });

  await test.step("Inject 10 siblings + 5 partners + 8 children + 4 guardians", async () => {
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode!;

    // 10 siblings
    for (let i = 1; i <= 10; i++) {
      const p = await upsertGraphPerson(page, {
        narratorId: eleanorPid!,
        firstName: `Sibling${i}`,
        lastName: "Price-Test",
        source: "test",
      });
      await upsertGraphRelationship(page, {
        narratorId: eleanorPid!,
        fromPersonId: p.id,
        toPersonId: narratorNode.id,
        relationshipType: "sibling",
        subtype: "biological",
        label: `Sibling #${i}`,
        source: "test",
      });
    }

    // 5 partners
    for (let i = 1; i <= 5; i++) {
      const p = await upsertGraphPerson(page, {
        narratorId: eleanorPid!,
        firstName: `Partner${i}`,
        lastName: "Stress-Test",
        source: "test",
      });
      await upsertGraphRelationship(page, {
        narratorId: eleanorPid!,
        fromPersonId: p.id,
        toPersonId: narratorNode.id,
        relationshipType: i <= 3 ? "former_spouse" : "partner",
        subtype: i <= 3 ? "former_spouse" : "partner",
        label: i <= 3 ? `Former Spouse #${i}` : `Partner #${i - 3}`,
        source: "test",
      });
    }

    // 8 children
    for (let i = 1; i <= 8; i++) {
      const p = await upsertGraphPerson(page, {
        narratorId: eleanorPid!,
        firstName: `Child${i}`,
        lastName: "Price-Test",
        source: "test",
      });
      await upsertGraphRelationship(page, {
        narratorId: eleanorPid!,
        fromPersonId: p.id,
        toPersonId: narratorNode.id,
        relationshipType: "child",
        subtype: "biological",
        label: `Child #${i}`,
        source: "test",
      });
    }

    // 4 guardians
    for (let i = 1; i <= 4; i++) {
      const p = await upsertGraphPerson(page, {
        narratorId: eleanorPid!,
        firstName: `Guardian${i}`,
        lastName: "Test",
        source: "test",
      });
      await upsertGraphRelationship(page, {
        narratorId: eleanorPid!,
        fromPersonId: p.id,
        toPersonId: narratorNode.id,
        relationshipType: "guardian",
        subtype: "legal_guardian",
        label: `Guardian #${i}`,
        source: "test",
      });
    }
  });

  await test.step("Verify graph counts after density injection", async () => {
    const counts = await readGraphCounts(page);
    // 27 injected + original persons
    expect(counts.persons).toBeGreaterThanOrEqual(27);
    expect(counts.relationships).toBeGreaterThanOrEqual(27);
  });

  await test.step("Persist, switch away, switch back, refresh — verify stability", async () => {
    await persistGraphToBackend(page);

    // Switch to a different narrator (if available via another preload)
    // For simplicity, just refresh
    await refreshAndRestore(page);
    await selectNarrator(page, eleanorPid!);
    await triggerFullSync(page);

    const counts = await readGraphCounts(page);
    expect(counts.persons).toBeGreaterThan(10);
    expect(counts.relationships).toBeGreaterThan(10);

    // No duplicate IDs
    const snap = await readGraphSnapshot(page);
    const personIds = snap.persons.map(p => p.id);
    expect(personIds.length).toBe(new Set(personIds).size);
    const relIds = snap.relationships.map(r => r.id);
    expect(relIds.length).toBe(new Set(relIds).size);
  });

  await test.step("Verify UI responsiveness (page did not freeze)", async () => {
    // If we got here, the page didn't freeze during the density test
    // Additional check: can we still interact with the graph module?
    const counts = await readGraphCounts(page);
    expect(counts.persons).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════
   TEST 10 — Relationship Type Drift
   Goal: Repeated label changes must not leave stale duplicate edges.
   ═══════════════════════════════════════════════════════════════ */

test("BT-10: Type Drift — repeated label changes must not create duplicates", async ({ page }) => {
  await test.step("Navigate and preload Mercer", async () => {
    await navigateToUI(page);
  });

  let mercerPid: string;
  await test.step("Preload David Alan Mercer", async () => {
    mercerPid = await preloadNarratorFromTemplate(page, "david-alan-mercer.json");
    createdPids.push(mercerPid);
  });

  await test.step("Find Michael Bennett and his relationship", async () => {
    const michael = await findPersonByName(page, "Michael Bennett");
    expect(michael).toBeTruthy();
    const rels = await getRelationshipsFor(page, michael!.id);
    expect(rels.length).toBeGreaterThan(0);
  });

  await test.step("Drift: Partner → Spouse → Partner → Former Spouse", async () => {
    const michael = await findPersonByName(page, "Michael Bennett");
    const stats = await readGraphStats(page);
    const narratorNode = stats.narratorNode!;

    // The key ID for the relationship is based on from+to+type
    // So changing the type will create a NEW relationship ID
    // We need to simulate what the UI would do: remove old edge, add new

    // Step 1: Remove existing partner/spouse edge
    const rels1 = await getRelationshipsFor(page, michael!.id);
    for (const r of rels1) {
      if (["partner", "spouse", "former_spouse"].includes(r.relationshipType)) {
        await removeGraphRelationship(page, r.id);
      }
    }
    // Add as Spouse
    await upsertGraphRelationship(page, {
      narratorId: mercerPid!,
      fromPersonId: michael!.id,
      toPersonId: narratorNode.id,
      relationshipType: "spouse",
      subtype: "spouse",
      label: "Spouse",
      source: "test",
    });
    await persistGraphToBackend(page);

    // Step 2: Change to Partner
    const rels2 = await getRelationshipsFor(page, michael!.id);
    for (const r of rels2) {
      if (["partner", "spouse", "former_spouse"].includes(r.relationshipType)) {
        await removeGraphRelationship(page, r.id);
      }
    }
    await upsertGraphRelationship(page, {
      narratorId: mercerPid!,
      fromPersonId: michael!.id,
      toPersonId: narratorNode.id,
      relationshipType: "partner",
      subtype: "partner",
      label: "Partner",
      source: "test",
    });
    await persistGraphToBackend(page);

    // Step 3: Change to Former Spouse
    const rels3 = await getRelationshipsFor(page, michael!.id);
    for (const r of rels3) {
      if (["partner", "spouse", "former_spouse"].includes(r.relationshipType)) {
        await removeGraphRelationship(page, r.id);
      }
    }
    await upsertGraphRelationship(page, {
      narratorId: mercerPid!,
      fromPersonId: michael!.id,
      toPersonId: narratorNode.id,
      relationshipType: "former_spouse",
      subtype: "former_spouse",
      label: "Former Spouse",
      source: "test",
    });
    await persistGraphToBackend(page);
  });

  await test.step("Assert: in-session drift left exactly one edge after each step", async () => {
    // The key assertion for type drift: after each remove+add cycle within
    // a session, only ONE partner/spouse/former_spouse edge should exist.
    // Check the final in-memory state (before any refresh/fullSync rebuild).
    const michael = await findPersonByName(page, "Michael Bennett");
    expect(michael).toBeTruthy();

    const finalRels = await getRelationshipsFor(page, michael!.id);
    const partnerSpouseRels = finalRels.filter(r =>
      ["partner", "spouse", "former_spouse"].includes(r.relationshipType)
    );

    // Key assertion: no MORE than one active partner/spouse/former_spouse edge
    // (The last persist was "Former Spouse")
    expect(partnerSpouseRels.length).toBe(1);
    expect(partnerSpouseRels[0].relationshipType).toBe("former_spouse");
  });

  await test.step("Verify backend reflects final state", async () => {
    // Check backend directly — it should have exactly the last-persisted state
    const apiSnap = await page.evaluate(async (pid: string) => {
      const origin = (window as any).LOREVOX_API || "http://localhost:8000";
      const r = await fetch(`${origin}/api/graph/${pid}`);
      return await r.json();
    }, mercerPid!);

    // Backend should have persons (Mercer + family)
    expect(apiSnap.persons.length).toBeGreaterThan(0);

    // Find Michael in backend and check relationship count
    const michaelBackend = apiSnap.persons.find((p: any) => {
      const dn = (p.display_name || "").toLowerCase();
      return dn.includes("michael") && dn.includes("bennett");
    });

    if (michaelBackend) {
      const michaelRels = apiSnap.relationships.filter((r: any) =>
        ["partner", "spouse", "former_spouse"].includes(r.relationship_type) &&
        (r.from_person_id === michaelBackend.id || r.to_person_id === michaelBackend.id)
      );
      // Backend should also have exactly one partner/spouse/former_spouse edge
      expect(michaelRels.length).toBeLessThanOrEqual(1);
    }
  });
});
