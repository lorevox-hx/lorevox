# Lorevox UI Audit

Two Playwright tests that together give you one complete audit pass:

- **`tests/e2e/lorevox-ui-audit.spec.ts`** — loads the real UI, checks every inline handler resolves to a JS function, exercises safe controls, captures console/page errors, and compares frontend network calls to FastAPI OpenAPI routes.
- **`tests/e2e/lorevox-smoke-flow.spec.ts`** — creates a test person, saves a profile, and starts an interview through the backend directly to verify the main API contracts are alive.

---

## Requirements

- Node.js 18+
- Lorevox backend on port 8000, or let Playwright start it automatically (see below)
- UI served at `http://127.0.0.1:8000/ui/6.1.html`
- OpenAPI at `http://127.0.0.1:8000/openapi.json`

---

## Install

```bash
npm install -D @playwright/test
npx playwright install chromium
```

---

## Start Lorevox (manual or automatic)

### Manual — start the server yourself first

```bash
# WSL / Linux
cd /mnt/c/lorevox
source .venv-gpu/bin/activate
python -m uvicorn code.api.main:app --host 0.0.0.0 --port 8000
```

Then in another terminal:

```bash
npm run audit:all
```

### Automatic — let Playwright start it

`playwright.config.ts` includes a `webServer` block that calls `scripts/start-lorevox-audit.sh`. With `reuseExistingServer: true`, it only fires if port 8000 is not already up.

Override defaults as needed:

```bash
# Linux / WSL
export LOREVOX_REPO=/mnt/c/lorevox
export LOREVOX_VENV=/mnt/c/lorevox/.venv-gpu
export DATA_DIR=/home/chris/lorevox_data
npm run audit:all

# Desktop clone (different path)
export LOREVOX_REPO=/mnt/c/Users/chris/lorevox
export LOREVOX_VENV=/mnt/c/Users/chris/lorevox/.venv-gpu
npm run audit:all
```

Windows PowerShell:

```powershell
$env:LOREVOX_REPO = "C:\lorevox"
npm run audit:all
```

---

## Run the tests

```bash
# UI contract audit only
npm run audit:ui

# Backend smoke flow only
npm run audit:smoke

# Both
npm run audit:all

# Headed (watch the browser)
npm run audit:headed

# Open HTML report after a run
npm run audit:report
```

Or directly:

```bash
npx playwright test tests/e2e/lorevox-ui-audit.spec.ts
npx playwright test tests/e2e/lorevox-smoke-flow.spec.ts
npx playwright test
```

---

## What the UI audit checks

**1. Page load** — opens `/ui/6.1.html` and verifies the body is visible.

**2. Script file health** — re-fetches every `<script src>` tag and reports 404s. Note: MediaPipe loads from `cdn.jsdelivr.net`. Offline runs will flag this — that is intentional, surfacing the pending "vendor MediaPipe locally" work item.

**3. Inline handler coverage** — scans `onclick`, `onchange`, `oninput`, `onkeydown` attributes and verifies each handler function exists on `window`. Catches things like:
```html
<button onclick="someMissingFunction()">
```

**4. Safe control exercise** — clicks a curated set of non-destructive controls (tabs, toggles, accordions, navigation buttons) and captures any runtime errors.

**5. Runtime errors** — captures browser console errors and uncaught page exceptions.

**6. Route alignment** — records all `fetch`, `XHR`, and `WebSocket` calls and compares paths against `openapi.json`. Supports parameterised templates: `/api/people/some-uuid` correctly matches `/api/people/{person_id}`.

---

## What the smoke flow checks

A real vertical slice through the backend:
1. `POST /api/people` — create person
2. `PUT /api/profiles/{person_id}` — save profile with correct body shape `{profile: {basics: {dob, pob, ...}}}`
3. `POST /api/interview/start` — start interview, verify `session_id` and `question` (not `next_question`) are returned

---

## Common failures and what they mean

| Failure | Likely cause |
|---------|-------------|
| 404 on `/ui/6.1.html` | Backend not running or UI not mounted at `/ui` |
| Broken script (MediaPipe CDN) | No internet — vendor MediaPipe locally to fix |
| Missing inline JS handlers | Function not defined globally, bad load order, or file 404 |
| Route mismatch | UI calls a path not in FastAPI OpenAPI — stale endpoint or renamed router |
| Console/page errors after clicks | Null DOM reference, missing state init, or unguarded code path |
| Smoke test fails at profile PUT | Profile body shape mismatch — check `ProfilePut` in `profiles.py` |
| Smoke test fails at interview start | Plan ID invalid or `StartInterviewResponse` shape changed |

---

## Artifacts on failure

Playwright retains traces, screenshots, and video for failing tests. Run `npm run audit:report` to open the HTML report.

---

## Recommended workflow

| When | Command |
|------|---------|
| After changing `6.1.html` or any JS module | `npm run audit:ui` |
| After changing interview/profile backend routes | `npm run audit:smoke` |
| Before committing a UI+backend integration change | `npm run audit:all` |

---

## Suggested next step

After this broad audit passes, add a seeded scenario test that:
1. Creates a person via API
2. Opens the UI in the browser
3. Selects that person from the People list
4. Clicks Begin Section
5. Verifies the first question prompt renders in chat
6. Saves an answer and checks the session state updated

That gives you one real end-to-end vertical slice, not just contract coverage.
