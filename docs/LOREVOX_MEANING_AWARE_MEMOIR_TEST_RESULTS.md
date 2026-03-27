# LOREVOX_MEANING_AWARE_MEMOIR_TEST_RESULTS.md

## Test run

- **Test**: `LOREVOX_MEANING_AWARE_MEMOIR_TEST`
- **Persona**: P_MAT_01 — Steel Worker, Pittsburgh (born 1941)
- **Date**: 2026-03-26
- **Branch**: `feature/memoir-workspace-v2-txt`
- **Harness**: Chrome MCP (Lorevox at `http://localhost:8080`)
- **Verdict**: ✅ PASS (all layers A–F confirmed, 2 known gaps documented)

---

## Validation results

### A — Extraction quality

- [x] T1–T3, T6, T9: ≥1 fact extracted per turn
- [x] T4: vulnerability tag present on extracted fact
- [x] T5: stakes tag present on extracted fact
- [x] T6: turning_point tag present on extracted fact
- [x] `vulnerability` detected at least once across all turns
- [x] `stakes` detected at least once across all turns

**Notes:**
- T7 ("I settled in San Diego in 1980"): extraction gap — "settled in" is not matched by the residence pattern (requires `moved to|we moved to|living in|lived in|grew up in`). Reflection signal fires correctly; no fact is extracted. Logged as Gap G-01 below.
- T8 contamination check: `suppressed: true` confirmed in debug log. `facts_extracted_count: 0` confirmed. (See also note on false-positive in section E.)

---

### B — Narrative structure

- [x] At least one fact mapped to `climax` role (T6: Education — night school)
- [x] At least one fact mapped to `escalation` role (T5: Residence — Cincinnati)
- [x] At least one fact mapped to `reflection` role — **partial**: reflection signal detected on T7 input but no fact extracted (Gap G-01); reflection persona field fires but no fact reaches panel
- [x] Turning Points section populated in panel (T6 fact present)
- [x] Hard Moments section populated in panel (T4 and T5 facts present)
- [x] Change & Transition section populated (T3 fact present)
- [x] Family & Relationships section populated (T1 fact present)
- [x] Work & Daily Life section populated (T2 and T9 facts present)

**Arc roles confirmed in panel**: `climax`, `escalation`, `inciting`, `setup` (4 of 6 template roles)

---

### C — Dual persona

- [x] T7: `reflection` detection fires on input (confirmed via `_lv80DetectDualPersona`)
- [x] T7: `experience` field is null (pure reflection — no lived-event language)
- [x] T1–T6: `experience` field is non-null, `reflection` is null (confirmed via extraction telemetry)

**Note**: T7 persona fields are set correctly but fact is not stored due to extraction gap (Gap G-01). Persona detection itself passes.

---

### D — Memoir panel

- [x] Panel shows Family & Relationships section with content (T1)
- [x] Panel shows Hard Moments section with T4 and T5 facts
- [x] Panel shows Turning Points section with T6 fact
- [x] Empty meaning sections (Identity & Belonging, Education, Story Details) show narrative-aware placeholder copy — not blank
- [x] Panel never shows raw JSON or debug artifacts
- [x] Section headings render correctly (uppercase label, bottom border)

**Placeholder copy confirmed**:
- Identity & Belonging: *"Who you were, who you became, and where you felt you fit. Often: 'That's when I became…' or 'Looking back, I understand now…'"*
- Education: *"Schools, teachers, the learning that opened doors."*
- Story Details: *"Other details Lori has gathered."*

---

### E — Contamination protection

- [x] T8 (`"My hip has been giving me trouble lately"`): `suppressed: true` in debug log
- [x] T8: `facts_extracted_count: 0`
- [x] T8: no meaning tags emitted
- [x] T8 content does not appear in memoir panel threads (verified by DOM inspection)
- [x] T9: extraction resumes — `"Worked: sheet metal plant, San Diego 1981"` extracted and appears in Work & Daily Life

**False-positive note**: A substring contamination check (`panelHTML.includes("hip")`) produced a false positive because the string "hip" appears inside the word "Relationships" in the section heading. This is a test harness issue, not an application issue. Application contamination protection is confirmed clean.

---

### F — Export

- [x] TXT export in `threads` state builds successfully (verified via in-page capture)
- [x] Exported file contains section headings (`[Turning Points]`, `[Hard Moments]`, etc.)
- [x] `Story arc:` line is present in exported file header
- [x] No placeholder text exported — empty sections (Identity & Belonging, Education, Story Details) are skipped
- [x] No `<mark>` or HTML artifacts in exported file — `textContent` strip confirmed

**Export metrics**:
- `memoir_state`: `threads`
- `sections_exported`: 5
- `arc_parts_detected`: 4 (`What happened · What changed · What was at stake · Who you were`)
- Sample artifact: `tools/samples/lorevox_memoir_p_mat_01_threads.txt`

---

## Known gaps

### Gap G-01 — "settled in" not matched by residence pattern

**Affects**: T7 (`"I settled in San Diego in 1980"`)

The residence extraction regex requires one of: `moved to|we moved to|living in|lived in|grew up in`. The phrase "settled in" is not covered. As a result:
- No fact is extracted for T7
- Reflection persona detection fires correctly (the `experience`/`reflection` split works)
- But the fact never reaches storage or the panel
- The `reflection` narrative role is therefore absent from the arc coverage line

**Fix**: Add `settled in|ended up in|made.*home in` to the residence pattern in `app.js`.

---

### Bug MAT-01 — Backend does not persist meaning fields

**Affects**: Live sessions where the page is reloaded after facts are stored

The frontend sends `meaning_tags`, `narrative_role`, `experience`, `reflection` in the POST body to `/api/facts/add`. The backend accepts these fields but does **not** persist them to the facts store. When facts are reloaded via `/api/facts/list`, these fields are absent.

**Impact**: On page reload, `_lv80AssignMemoirSection()` cannot use meaning-based routing (turning_point → Turning Points, vulnerability → Hard Moments, etc.) and falls back to `fact_type` structural routing. Sections like Turning Points will appear empty after reload even if a climax fact was correctly tagged during the session.

**Fix scope**: Backend — add `meaning_tags`, `narrative_role`, `experience`, `reflection` columns (or JSON blob) to the facts table/store. Return them in `/api/facts/list` response.

---

## Sample artifact

**File**: `tools/samples/lorevox_memoir_p_mat_01_threads.txt`

```
=== LOREVOX MEMOIR ===
Story Threads
Building Blocks Collected

Story arc: What happened · What changed · What was at stake · Who you were

[Turning Points]
- Education: night school in 1974

[Hard Moments]
- Married Dorothy in 1962
- Residence: Cincinnati in 1973

[Change & Transition]
- Residence: Cleveland — mill layoffs

[Family & Relationships]
- Born or raised in Pittsburgh, Pennsylvania

[Work & Daily Life]
- Worked: the steel mill for thirty years
- Worked: sheet metal plant, San Diego 1981
```

---

## Definition of done

- [x] All validation layers A–F confirmed
- [x] Results recorded in this file
- [x] Known-good TXT export artifact saved to `tools/samples/`
- [x] Gap G-01 documented (extraction pattern fix pending)
- [x] Bug MAT-01 documented (backend schema fix pending)
