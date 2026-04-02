# Lorevox V2 Full-Platform Test — Failure Log

## Test Date: 2026-03-29

---

## Active Bugs Found During V2 Testing

### V2-F01: FT Seed Creates Duplicate Narrator Node

| Field | Value |
|-------|-------|
| Bug ID | V2-F01 |
| Title | FT Seed from Questionnaire creates duplicate narrator node |
| Severity | Low |
| Area | Bio Builder → Family Tree → Seed Questionnaire |
| Reproduction | 1. Open Bio Builder for Mark Twain. 2. Open Family Tree tab. 3. Click "Seed Questionnaire". 4. Observe a new "Mark Twain" node with "questionnaire" source badge appears under NARRATOR section, duplicating the existing Mark Twain in OTHER. |
| Expected | Seed should recognize the existing narrator node and skip or merge rather than creating a duplicate. |
| Actual | A new node (id: ftn_*) is created with `role: "narrator"`, `source: "questionnaire"` alongside the existing Mark Twain node. |
| Impact | Cosmetic — does not cause data loss or crash. Second seed call is idempotent (no further duplicates). |
| Probable Fix | In `_ftSeedFromQuestionnaire()`, check if a node with `role: "narrator"` or matching preferred/display name already exists before creating a new one. |

---

### V2-F02: Delete Button Uses Native confirm() Dialog

| Field | Value |
|-------|-------|
| Bug ID | V2-F02 |
| Title | FT/LT node Delete button triggers native confirm() dialog |
| Severity | Low |
| Area | Bio Builder → Family Tree / Life Threads → Delete |
| Reproduction | 1. Open Family Tree. 2. Click "Delete" on any node. 3. A native browser confirm() dialog appears, blocking the page until dismissed. |
| Expected | A custom in-UI confirmation dialog (e.g., inline "Are you sure?" with Cancel/Confirm buttons) would provide a better UX and not block automated testing. |
| Actual | Native `window.confirm()` dialog blocks the entire page thread. |
| Impact | Functional — deletion works after confirming. UX concern only. Blocks browser automation tools. |
| Probable Fix | Replace `confirm()` with an inline confirmation pattern in the BB popover. |

---

### V2-F03: Session-Scoped Data Loss on Refresh (By Design, but Risky)

| Field | Value |
|-------|-------|
| Bug ID | V2-F03 |
| Title | Questionnaire, Quick Capture, Source Inbox, and Candidates data lost on browser refresh |
| Severity | Medium |
| Area | Bio Builder → All session-scoped surfaces |
| Reproduction | 1. Fill in questionnaire sections. 2. Add Quick Capture facts. 3. Add Source Inbox documents. 4. Refresh browser. 5. All data in these surfaces is lost. |
| Expected | Users expect entered data to be saved. |
| Actual | These surfaces are session-scoped by design and do not persist to localStorage or API. |
| Impact | High risk for user trust. A user who spends 30 minutes filling out the questionnaire and loses it on accidental refresh will lose trust in the system. |
| Probable Fix | Priority order: (1) Add localStorage persistence for questionnaire answers per-narrator. (2) Add localStorage persistence for Quick Capture items. (3) Source Inbox and Candidates are lower priority since they involve uploaded documents. |

---

### V2-F04: Orphan Edges Accumulate Without User Awareness

| Field | Value |
|-------|-------|
| Bug ID | V2-F04 |
| Title | Orphan edges accumulate and are not automatically cleaned |
| Severity | Low |
| Area | Bio Builder → Family Tree / Life Threads |
| Reproduction | 1. Observe FT status bar showing "10 orphan edge(s)" for Mark Twain's seeded data. 2. These are edges referencing node IDs that don't match any current node. |
| Expected | Orphan edges should either be cleaned automatically when the referenced node is removed, or the "Clean" button should be prominently surfaced. |
| Actual | Orphan edges persist silently. The "Clean" button exists but users may not understand what orphan edges are. |
| Impact | Data hygiene issue. Does not cause crashes but adds visual noise to the quality indicators. |
| Probable Fix | Auto-clean orphan edges when a node is deleted. Or explain orphan edges in a tooltip on the badge. |

---

## Previously Fixed Bugs (Verified in V2 Testing)

| Bug ID | Title | Status | Fix Session |
|--------|-------|--------|-------------|
| CS-1 | Bio Builder popover render guard | VERIFIED FIXED | Cold Start Test |
| CS-2 | Life Map popover render guard | VERIFIED FIXED | Cold Start Test |
| CS-3 | Profile loading race condition | VERIFIED FIXED | Cold Start Test |
| CS-4 | FT/LT draft loading from localStorage | VERIFIED FIXED | Cold Start Test |
| CS-5 | Quick Capture placeholder hardcoded | VERIFIED FIXED | Cold Start Test |
| CS-6 | Zodiac auto-derive on hydration | VERIFIED FIXED | Cold Start Test |

---

## Bugs NOT Found (Regression Checks)

| Area | Check | Result |
|------|-------|--------|
| Narrator bleed | Any narrator data appearing in wrong narrator view | No bleed detected |
| Stale narrator resurrection | Deleted narrators reappearing | No resurrection |
| Truth-layer leakage | Draft data appearing in Archive/Facts/Timeline/Memoir | No leakage |
| Dropdown mismatch | Dropdown and actual persisted narrators disagree | No mismatch |
| Cross-narrator FT/LT contamination | FT/LT data from narrator A in narrator B's view | No contamination |
| Profile data corruption | Profile basics changed after switching/reloading | No corruption |
| Life Map blank for selected narrator | Life Map empty when narrator selected | Not blank (all 3 PASS) |
| Legal/public name collapse | Legal name and preferred name merged incorrectly | No collapse |
| Stepmother→mother flattening | Relationship types silently changed | No flattening observed |
| Same-sex spouse mislabeling | Gender-based assumptions in relationship model | No assumptions — model is gender-neutral |
| Deceased infant disappearing | Child node removed after save/seed/switch | Child remains visible |
| Source seeding duplicates endlessly | Repeated seeding causes infinite growth | No — seed is near-idempotent |
| Fuzzy dates breaking timeline | Approximate dates causing crash | No crash — renders gracefully |

---

## Prioritized Next Fixes

### Must-Fix (Before More Real Narrators)

1. **V2-F03 — Questionnaire persistence**: Add localStorage persistence for questionnaire answers per narrator. This is the #1 trust issue for real users who will spend time filling out personal information.

### Should-Fix (Recommended)

2. **V2-F01 — Duplicate narrator node on seed**: Add de-duplication check in `_ftSeedFromQuestionnaire()`.
3. **V2-F04 — Orphan edge cleanup**: Auto-clean orphan edges on node deletion, or add explanatory tooltip.

### Nice-to-Fix (Polish)

4. **V2-F02 — Native confirm() dialog**: Replace with inline confirmation UI.
5. **"MEMORYS" typo**: The Life Threads section header says "MEMORYS" instead of "MEMORIES".

---

## Structural Classification

| Issue Type | Count | Examples |
|-----------|-------|---------|
| Session-scoped data loss risk | 1 | V2-F03 — questionnaire, QC, source inbox, candidates |
| Seed idempotency gap | 1 | V2-F01 — duplicate narrator node |
| UX/interaction pattern | 1 | V2-F02 — native confirm() dialog |
| Data hygiene | 1 | V2-F04 — orphan edge accumulation |
| Typo | 1 | "MEMORYS" → "MEMORIES" |
| Previously fixed and verified | 6 | CS-1 through CS-6 |

---

## Real-User Readiness Statement

**Lorevox is ready for real family capture** with the 6 cold-start fixes applied. The core architecture is sound: narrator isolation works, draft-vs-truth boundaries are respected, persistence covers the critical data surfaces (profiles, FT/LT drafts, dropdown, active narrator), and the data model handles complex human situations including grief, unknown origins, chosen family, and estrangement.

The primary risk is **V2-F03 (session-scoped questionnaire data loss)**, which should be addressed before encouraging users to spend significant time on questionnaire sections. All other findings are low severity and do not block real-user entry.

Add Janice's real family data. Add Kent. Proceed with confidence.
