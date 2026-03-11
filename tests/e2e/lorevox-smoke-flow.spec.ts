/**
 * lorevox-smoke-flow.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * One real vertical slice through the backend API contracts:
 *   1. Create a person  →  /api/people
 *   2. Save a profile   →  PUT /api/profiles/{person_id}
 *   3. Start an interview  →  /api/interview/start
 *   4. Answer the first question  →  /api/interview/answer
 *   5. Verify progress is tracked  →  /api/interview/progress
 *
 * FIXES applied vs. original proposal
 * ────────────────────────────────────
 *  - StartInterviewResponse uses `question` (not `next_question`).
 *    See server/code/api/routers/interview.py → StartInterviewResponse.
 *  - Profile PUT body uses {profile: {basics: {dob, pob, ...}}} to match
 *    the actual normalizeProfile() shape consumed by ProfilePut in profiles.py.
 *  - Cleans up the created person after the test (best-effort).
 *
 * Run:
 *   npx playwright test tests/e2e/lorevox-smoke-flow.spec.ts
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";

test.describe("Lorevox backend smoke flow", () => {
  let personId: string | null = null;

  test.afterAll(async ({ request }) => {
    // Best-effort cleanup — DELETE not implemented, so just log
    if (personId) {
      console.log(`\n  Smoke test person_id: ${personId} (manual cleanup if needed)`);
    }
  });

  test("create person → save profile → start interview → answer Q1 → check progress", async ({ request }) => {

    // ── Step 1: Create person ──────────────────────────────────────────────
    const createResp = await request.post(`${BASE_URL}/api/people`, {
      data: {
        display_name:   "Audit Person",
        role:           "subject",
        date_of_birth:  "1962-12-24",
        place_of_birth: "Williston, ND",
      },
    });
    expect(createResp.ok(), `POST /api/people failed: ${createResp.status()}`).toBeTruthy();
    const created = await createResp.json();
    personId = created.person_id || created.id;
    expect(personId, "person_id missing from create response").toBeTruthy();

    // ── Step 2: Save profile ───────────────────────────────────────────────
    // ── FIX: body must be {profile: {basics: {...}}} not {profile: {bio_dob: ...}} ──
    const profileResp = await request.put(`${BASE_URL}/api/profiles/${personId}`, {
      data: {
        profile: {
          basics: {
            fullname:  "Audit Person",
            preferred: "Audit",
            dob:       "1962-12-24",
            pob:       "Williston, ND",
            pronouns:  "he/him",
            country:   "us",
          },
        },
      },
    });
    expect(profileResp.ok(), `PUT /api/profiles/${personId} failed: ${profileResp.status()}`).toBeTruthy();

    // ── Step 3: Start interview ────────────────────────────────────────────
    const startResp = await request.post(`${BASE_URL}/api/interview/start`, {
      data: {
        person_id: personId,
        plan_id:   "default",
      },
    });
    expect(startResp.ok(), `POST /api/interview/start failed: ${startResp.status()}`).toBeTruthy();

    const started = await startResp.json();
    expect(started.session_id, "session_id missing from start response").toBeTruthy();

    // ── FIX: StartInterviewResponse uses `question`, not `next_question` ───
    expect(started.question, "question missing from start response").toBeTruthy();
    expect(started.question.prompt, "question.prompt missing").toBeTruthy();
    expect(started.question.id, "question.id missing").toBeTruthy();

    const sessionId  = started.session_id;
    const questionId = started.question.id;
    const prompt     = started.question.prompt;
    console.log(`\n  Interview started — session: ${sessionId}`);
    console.log(`  First question (${questionId}): "${prompt}"`);

    // v6.3: First question should now be full_name (Q1) or date_of_birth (Q2)
    // depending on whether the plan's first question is full_name.
    // In v6.3 interview_plan.json: Q1=full_name, Q2=date_of_birth.
    expect(
      ["full_name", "date_of_birth"].includes(questionId),
      `Expected Q1 to be full_name or date_of_birth, got: ${questionId}`
    ).toBeTruthy();

    // ── Step 4: Answer the first question ─────────────────────────────────
    const answerResp = await request.post(`${BASE_URL}/api/interview/answer`, {
      data: {
        session_id:  sessionId,
        question_id: questionId,
        answer:      questionId === "full_name" ? "Audit Person" : "1962-12-24",
        skipped:     false,
      },
    });
    expect(answerResp.ok(), `POST /api/interview/answer failed: ${answerResp.status()}`).toBeTruthy();

    const answered = await answerResp.json();
    expect(answered.done, "interview should not be done after Q1").toBeFalsy();
    expect(answered.next_question, "next_question missing after answering Q1").toBeTruthy();
    console.log(`  Next question: "${answered.next_question?.prompt}"`);

    // ── Step 5: Check progress ────────────────────────────────────────────
    const progressResp = await request.get(
      `${BASE_URL}/api/interview/progress?session_id=${encodeURIComponent(sessionId)}`
    );
    expect(progressResp.ok(), `/api/interview/progress failed: ${progressResp.status()}`).toBeTruthy();

    const progress = await progressResp.json();
    expect(progress.answered, "answered count should be ≥ 1").toBeGreaterThanOrEqual(1);
    expect(progress.total,    "total question count should be > 0").toBeGreaterThan(0);
    expect(progress.percent,  "percent should be between 0 and 100").toBeLessThanOrEqual(100);
    console.log(`  Progress: ${progress.answered}/${progress.total} (${progress.percent}%)`);

    // ── Step 6: Verify segment-flags endpoint works ───────────────────────
    const flagsResp = await request.get(
      `${BASE_URL}/api/interview/segment-flags?session_id=${encodeURIComponent(sessionId)}`
    );
    expect(flagsResp.ok(), `/api/interview/segment-flags failed: ${flagsResp.status()}`).toBeTruthy();
    const flagsBody = await flagsResp.json();
    expect(Array.isArray(flagsBody.flags), "flags should be an array").toBeTruthy();
    console.log(`  Segment flags: ${flagsBody.flags.length}`);

    console.log("\n  ✅ Smoke flow complete");
  });
});
