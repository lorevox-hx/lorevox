# WO-10 Operator Validation Script

Run these tests manually with the three-service stack running (API :8000, TTS :8001, UI :8082).

---

## Test A — Startup Race

1. Open Hornelore in browser
2. IMMEDIATELY select a narrator before the "Warming up..." banner clears
3. Watch browser console for `[WO-9] Queued system prompt until model ready.`
4. Wait for model to warm up (banner clears)
5. Watch console for `[WO-9] Draining queued system prompt.`
6. **PASS** if: exactly one resume prompt fires, no duplicate Lori startup bubbles
7. **FAIL** if: prompt is silently dropped, or Lori greets twice

---

## Test B — Long-Turn Capture

1. Open any narrator who has prior sessions
2. Paste this 2000+ character test text into the chat input:

```
Well, let me tell you about that summer of 1961. It started with my dad taking me aside after Sunday dinner. He said "Kent, you know I need you on the farm this summer, but I also know you've been talking to that Army recruiter." He was right — I'd been going to the recruiting office in Minot every Saturday for three weeks. Sergeant Morrison, big Irish fellow, had all these brochures about seeing the world. The thing is, I wanted to go, but I also felt guilty about leaving. My brother Harold had already gone to work at the grain elevator, and my sister Margaret was only fourteen. Dad was getting older — he was already fifty-five, which seemed ancient to me then. The farm was 640 acres of wheat and some cattle. You needed at least three men during harvest, and with Harold gone, it was just Dad and me and old Mr. Peterson from the next section over who helped out sometimes. But I'd signed the papers. I'd committed. And something in me knew that if I didn't leave then, I never would. I'd end up like my uncle Ray, who always talked about going to California but never made it past Bismarck. So I told Dad at that Sunday dinner. Mom was there, and she started crying before I even finished the sentence. Dad just got real quiet and pushed his plate away. He said "When?" and I said "Two weeks." He nodded and went out to the barn. I found him later, fixing a harness that didn't need fixing. He said "You'll write your mother." Not a question. "Yes sir." That was the end of the conversation. Two weeks later, he drove me to the bus station in Minot. Shook my hand. Said "Make us proud." Didn't hug me. That's just how he was.
```

3. After Lori responds, check browser console for:
   - `[WO-9] Thread anchor saved:` with topic label
   - `[WO-9] Rolling summary saved, facts:` with count > 0
   - `[WO-10] Thread update sent for:` with topic label
4. Check archive: `GET /api/transcript/history?person_id={pid}` — full text should be stored
5. Check extraction: console should show chunk counts if text > 1200 chars
6. **PASS** if: full text stored, extraction runs, summary updated, thread tracked
7. **FAIL** if: text truncated, extraction skipped, or summary empty

---

## Test C — Resume Continuity

1. Complete a conversation with at least 3 turns on a specific topic (e.g., "Army service")
2. Close the narrator (switch to another narrator or refresh)
3. Reopen the same narrator
4. Watch Lori's first message
5. **PASS** if: Lori references the specific topic (Army, farm, etc.), NOT generic "where were you born"
6. **FAIL** if: Lori asks about birthplace or starts generic onboarding

---

## Test D — Multi-Thread Selection

1. Open the Transcript Viewer (click "Transcript" button)
2. Switch to the "Resume Preview" tab
3. Check the "Active Threads" section
4. Verify threads are listed with scores
5. Click a different thread chip to override
6. Click "Use This Resume" — verify Lori uses the selected thread
7. **PASS** if: multiple threads shown, scores visible, override works
8. **FAIL** if: only one thread, no scores, or override has no effect

---

## Test E — Transcript Viewer

1. Click the "Transcript" button in the header
2. Verify the Transcript tab shows:
   - Session dividers with dates
   - Narrator messages (indigo left border)
   - Lori messages (teal left border)
   - Timestamps on each message
3. Click "Show System" toggle — system messages should appear (yellow left border)
4. Click "Hide System" — they should disappear
5. Switch to "Session Timeline" tab — verify session list with topics and turn counts
6. Click "Export TXT" and "Export All Sessions" — verify downloads
7. **PASS** if: all elements visible, filtering works, export works
8. **FAIL** if: missing timestamps, wrong colors, or export fails

---

## Test F — Pause Behavior Regression

1. Start recording (mic on)
2. Click Pause button
3. Wait 60+ seconds
4. Verify: NO idle nudge appears, NO Lori check-in fires
5. Click Resume
6. Verify: mic restarts, idle timer re-arms
7. **PASS** if: pause completely suppresses idle, resume restores normal behavior
8. **FAIL** if: idle fires while paused, or resume doesn't restart

---

## Test G — Voice Send Shortcut Disabled

1. Start recording (mic on)
2. Say or paste "go ahead" or "send" during narration
3. Verify: text appears in the input box as content, NOT triggering a send
4. To re-enable (operator only): in console, run `window._wo9VoiceSendEnabled = true`
5. **PASS** if: words treated as content by default
6. **FAIL** if: message auto-sends on "go ahead" or "send"

---

## Test H — Resume Confidence

1. Open Resume Preview tab for a narrator with rich history
2. Check confidence badge: should show HIGH/MEDIUM/LOW with percentage
3. Check reasons list (e.g., "anchor_exists", "anchor_fresh", "thread_active")
4. Open a brand-new narrator (no history) — confidence should be LOW
5. **PASS** if: confidence accurately reflects data quality
6. **FAIL** if: always HIGH or always LOW regardless of data

---

## Test I — Conversation State Detection

1. Send a short direct answer ("Yes, that's right") — check console for state detection
2. Send a long narrative (200+ chars with "and then", "so we") — should detect "storytelling"
3. Send "no, actually that's not right, I meant..." — should detect "correcting"
4. Send "hmm" or "yeah" (very short) — should detect "emotional_pause"
5. Send "I'm trying to remember..." — should detect "searching_memory"
6. **PASS** if: states match expectations in console logs
7. **FAIL** if: always returns null or wrong state

---

## Synthetic Fixture Validation

Load each test fixture and verify expected behaviors:

### Sparse Kent (`test/fixtures/sparse-kent.json`)
- Resume confidence: LOW (very few turns)
- Thread: should detect "Farm & rural life" or "Parents & family"
- Resume: should NOT repeat birthplace question

### Verbose Kent (`test/fixtures/verbose-kent.json`)
- Resume confidence: HIGH (rich multi-session context)
- Chunking: first user turn (~1800 chars) should chunk
- Threads: Military service, Parents & family, Marriage & family
- Dominant thread: Military service (most turns)

### Multi-thread Kent (`test/fixtures/multithread-kent.json`)
- Resume: should reference Army/Germany incident (most recent)
- Threads: Military service (active), Career (dormant), Marriage & family (dormant)
- Thread selection: Military service (most recent, open loop about incident)

---

## Results Template

| Test | Result | Notes |
|------|--------|-------|
| A — Startup Race | | |
| B — Long-Turn Capture | | |
| C — Resume Continuity | | |
| D — Multi-Thread Selection | | |
| E — Transcript Viewer | | |
| F — Pause Regression | | |
| G — Voice Send Disabled | | |
| H — Resume Confidence | | |
| I — Conversation State | | |
| Sparse Kent | | |
| Verbose Kent | | |
| Multi-thread Kent | | |
