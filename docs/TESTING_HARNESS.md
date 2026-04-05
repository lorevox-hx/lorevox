# Lorevox 8.0 — Testing Harness Guide

**Phase O — Pre-Test Reset and Clean Browser Harness**
Established: April 2026

---

## Standard Testing Policy

> Before any formal regression or verification test, run the Phase O **clean-state** harness.
> Before any persistence or continuity verification, run the Phase O **persistence-mode** harness.
> Do not rely on manual hard refresh as a substitute for pre-test reset.

This policy applies to all Lorevox test work orders going forward.

---

## Why This Exists

Recent testing (Phases L and M) documented recurring problems caused by stale browser state:

- **Cached JS/CSS/HTML** prevented updated code from executing even after hard refresh (Ctrl+Shift+R).
- **Stale offline profile cache** in localStorage caused old kinship data to appear after code changes, masking whether fixes actually worked.
- **Narrator-scoped draft state** survived between test runs and contaminated clean regression testing (QC drafts, QQ drafts, projection drafts, FT/LT drafts).

The Phase O harness eliminates these problems by providing a formal, repeatable preflight step.

---

## Two Test Modes

### Clean-State Mode

**Use for:** regression tests, new phase verification, preload tests, narrator isolation tests, Family Tree seed tests, Life Map navigation tests, candidate generation tests, code change verification.

**What it does:**
- Clears all Lorevox-scoped localStorage and sessionStorage keys
- Clears Cache Storage and unregisters service workers
- Opens Lorevox in a dedicated test browser profile (isolated from everyday browsing)
- Appends a cache-busting `?test_run=<timestamp>` URL parameter

**Command:**
```bash
bash scripts/test_preflight_lorevox.sh --mode clean
```

### Persistence Mode

**Use for:** reload persistence tests, Quick Capture durability tests, resume-after-switch tests, draft continuity tests, user-return simulation.

**What it does:**
- Opens Lorevox in the same dedicated test browser profile
- Does NOT clear any browser state
- Appends `?test_mode=persistence` so the reset script is a no-op

**Command:**
```bash
bash scripts/test_preflight_lorevox.sh --mode persistence
```

---

## Scripts Reference

### `scripts/test_preflight_lorevox.sh` — Main Entrypoint

The standard preflight script. Run this before every test.

```
bash scripts/test_preflight_lorevox.sh                         # clean (default)
bash scripts/test_preflight_lorevox.sh --mode persistence      # persistence
bash scripts/test_preflight_lorevox.sh --cleanup               # also show test-data cleanup
bash scripts/test_preflight_lorevox.sh --restart               # restart Lorevox stack first
bash scripts/test_preflight_lorevox.sh --no-browser            # skip browser launch
bash scripts/test_preflight_lorevox.sh --browser edge          # use Edge instead of Chrome
```

**Sequence:**
1. Check (or restart) Lorevox stack health
2. Prepare browser-state reset (clean mode) or skip (persistence mode)
3. Optionally preview test-data cleanup
4. Launch dedicated test browser
5. Print status

### `scripts/reset_lorevox_browser_state.js` — Browser Reset

JavaScript that runs in the browser to clear Lorevox-scoped state.

**Cleared keys (prefixes):**
- `lorevox_` (offline profiles, drafts, spine data)
- `lvx_` (app state)
- `bb_` (legacy Bio Builder keys)
- `lorevox_offline_profile_*`
- `lorevox_qq_draft_*`
- `lorevox_proj_draft_*`
- `lorevox_qc_draft_*`
- `lorevox_ft_draft_*`
- `lorevox_lt_draft_*`
- `lorevox_sources_draft_*`
- `lorevox.spine.*`

**Also clears:** Cache Storage entries, service worker registrations.

**Does NOT clear:** Non-Lorevox browser data, cookies, browser history.

**Usage:** Paste into browser console, or it auto-executes when `?test_mode=clean` is detected.

### `scripts/launch_lorevox_test_browser.sh` — Dedicated Profile Launcher

Opens Chrome/Edge with an isolated `--user-data-dir` so test runs don't share state with normal browsing.

```
bash scripts/launch_lorevox_test_browser.sh                     # clean (default)
bash scripts/launch_lorevox_test_browser.sh --persistence       # preserve state
bash scripts/launch_lorevox_test_browser.sh --browser edge      # use Edge
```

Profile location: `.runtime/test-browser-profile/` (auto-created).

### `scripts/cleanup_lorevox_test_data.sh` — Backend Cleanup (Optional)

Removes test-only narrators from the backend. Targets narrators whose names start with `[test]` or `[QA]`.

```
bash scripts/cleanup_lorevox_test_data.sh --dry-run     # preview only
bash scripts/cleanup_lorevox_test_data.sh --confirm     # actually delete
bash scripts/cleanup_lorevox_test_data.sh --all-test    # include PIDs from test log
```

**Safety:** Requires typing `YES` to confirm. Never touches real family archive data.

---

## Typical Workflows

### Before a regression test (e.g., verifying Phase N changes)

```bash
bash scripts/test_preflight_lorevox.sh --mode clean
# Browser opens with fresh state
# Run your tests
```

### Before a persistence test (e.g., verifying QC survives reload)

```bash
# First: set up state in a clean run
bash scripts/test_preflight_lorevox.sh --mode clean
# Add QC items, switch narrators, etc.

# Then: verify persistence
bash scripts/test_preflight_lorevox.sh --mode persistence
# Confirm QC items survived
```

### Full cleanup after a QA session

```bash
bash scripts/cleanup_lorevox_test_data.sh --dry-run    # review
bash scripts/cleanup_lorevox_test_data.sh --confirm    # clean up
```

---

## Integration with Existing Scripts

The preflight harness uses `scripts/common.sh` for service health checks and port configuration. It integrates with the existing `start_all.sh` / `stop_all.sh` lifecycle when `--restart` is used. The `test_all.sh` unified test runner can be extended to call the preflight harness as its first step.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOREVOX_UI_PORT` | `8080` | UI server port |
| `LOREVOX_API_PORT` | `8000` | API server port |
| `LOREVOX_TEST_BROWSER` | `chrome` | Browser to use (`chrome` or `edge`) |
| `LOREVOX_TEST_PROFILE` | `.runtime/test-browser-profile` | Path to dedicated test profile |

---

## Adding to Future Work Orders

Include this block at the top of every test section:

```
Preflight: Run Phase O clean-state harness before testing.
  bash scripts/test_preflight_lorevox.sh --mode clean
```

Or for persistence tests:

```
Preflight: Run Phase O persistence-mode harness.
  bash scripts/test_preflight_lorevox.sh --mode persistence
```
