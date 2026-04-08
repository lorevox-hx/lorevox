import { test, expect } from "@playwright/test";

const BASE_URL = process.env.LOREVOX_BASE_URL || "http://127.0.0.1:8000";

test("can create a person and start an interview via backend contracts", async ({ request }) => {

  // ── 1. Create person ───────────────────────────────────────────────────────
  const createResp = await request.post(`${BASE_URL}/api/people`, {
    data: {
      display_name:   "Audit Person",
      role:           "subject",
      date_of_birth:  "1962-12-24",
      place_of_birth: "Williston, ND",
    },
  });
  expect(createResp.ok(), `POST /api/people failed: ${createResp.status()}`).toBeTruthy();
  const created  = await createResp.json();
  const personId = created.person_id;
  expect(personId, "person_id missing from response").toBeTruthy();

  // ── 2. Save profile ────────────────────────────────────────────────────────
  // Body shape must match {profile: {basics: {...}}} as consumed by ProfilePut
  // and normalizeProfile() in app.js.  Keys: fullname, preferred, dob, pob.
  const profileResp = await request.put(`${BASE_URL}/api/profiles/${personId}`, {
    data: {
      profile: {
        basics: {
          fullname:  "Audit Person",
          preferred: "Audit",
          dob:       "1962-12-24",
          pob:       "Williston, ND",
        },
      },
    },
  });
  expect(profileResp.ok(), `PUT /api/profiles/${personId} failed: ${profileResp.status()}`).toBeTruthy();

  // ── 3. Start interview ────────────────────────────────────────────────────
  const startResp = await request.post(`${BASE_URL}/api/interview/start`, {
    data: {
      person_id: personId,
      plan_id:   "default",
    },
  });
  expect(startResp.ok(), `POST /api/interview/start failed: ${startResp.status()}`).toBeTruthy();

  const started = await startResp.json();
  expect(started.session_id, "session_id missing").toBeTruthy();

  // StartInterviewResponse uses `question`, not `next_question`
  // (see server/code/api/routers/interview.py → StartInterviewResponse)
  expect(started.question, "question missing from start response").toBeTruthy();
  expect(started.question.prompt, "question.prompt missing").toBeTruthy();

  console.log(`\n  Created person:  ${personId}`);
  console.log(`  Session:         ${started.session_id}`);
  console.log(`  First question:  "${started.question.prompt}"`);
});
