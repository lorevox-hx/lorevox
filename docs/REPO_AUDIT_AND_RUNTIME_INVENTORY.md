# REPO_AUDIT_AND_RUNTIME_INVENTORY.md
## Lorevox Repository Audit — Runtime Inventory Pass

**Date:** 2026-03-27
**Method:** Full static inspection of repo tree, `main.py` router imports, `lori8.0.html` script/CSS includes, `db.py` path logic.
**Status:** Confirmed active / legacy classifications based on actual file inclusion chains — not assumptions.

---

## 1. Executive Summary

The repository is running as **Lorevox 8.0**. The prior README described v7.1. As of this audit:

- Active UI shell: `ui/lori8.0.html` (not `lori7.3.html` as README states)
- Backend entrypoint: `server/code/api/main.py`
- Database: `data/db/lorevox.sqlite3` (confirmed file present)
- All v7.1-era "pending" items are now either shipped or reclassified
- Six major systems have been added since the last README update: identity-first onboarding, camera preview, Bio Builder, Phase F orchestration, Media Builder, and the Meaning Engine
- The Transparency Rule (v8.0) was added to `prompt_composer.py` on 2026-03-27

The README must be updated. The current text reflects a v7.1 snapshot and will mislead any reader.

---

## 2. Current Runtime Entrypoints

| Component | File | Notes |
|---|---|---|
| **Backend entrypoint** | `server/code/api/main.py` | FastAPI app; loads `.env` from repo root; mounts `/ui`; registers all routers |
| **DB module** | `server/code/api/db.py` | SQLite CRUD; all table init; media + attachment tables; PRAGMA migration |
| **Prompt builder** | `server/code/api/prompt_composer.py` | System prompt assembly; runtime71 directives; TRANSPARENCY RULE v8.0 |
| **LLM REST router** | `server/code/api/api.py` | REST chat endpoint (imported as `llm_api` in main.py) |
| **WebSocket router** | `server/code/api/routers/chat_ws.py` | WS turn handler; runtime71 extraction; prompt dispatch |
| **Current UI shell** | `ui/lori8.0.html` | Active shell loaded by narrators; all Bio Builder + Media Builder surfaces |
| **UI launcher** | `lorevox-serve.py` | Local HTTP server; required for COOP/COEP headers (camera + WASM) |

---

## 3. Active Folders and Purpose

| Folder | Status | Purpose |
|---|---|---|
| `server/code/api/` | **Confirmed active** | FastAPI application root — all Python backend logic |
| `server/code/api/routers/` | **Confirmed active** | Individual endpoint modules; see Section 4 for active vs legacy list |
| `ui/` | **Confirmed active** | Frontend root — HTML shells, JS modules, CSS, vendored assets |
| `ui/js/` | **Confirmed active** | All frontend JavaScript modules loaded by `lori8.0.html` |
| `ui/css/` | **Confirmed active** | All CSS loaded by `lori8.0.html` |
| `ui/vendor/` | **Confirmed active** | Vendored local dependencies (MediaPipe, Floating UI, Mind Elixir) |
| `ui/docs/` | **Confirmed active** | Bio Builder + Life Map architecture/design docs |
| `data/db/` | **Confirmed active** | SQLite database file; `data/db/lorevox.sqlite3` exists and is in use |
| `data/media/` | **Confirmed active** | Uploaded photo files; created at first upload by media router |
| `docs/` | **Confirmed active** | All project documentation |
| `launchers/` | **Confirmed active** | `run_all_dev.sh`, `stop_all_dev.sh`, `run_gpu_8000.sh`, `run_tts_8001.sh` |
| `scripts/` | **Confirmed active** | Utility scripts: `inspect_db.py`, `warm_llm.py`, `warm_tts.py`, `restart_api.sh`, etc. |
| `tests/` | **Confirmed active** | Validation reports, e2e specs (Playwright), behavioral test matrices |
| `tools/` | **Confirmed active** | Debug HTML (`LOREVOX_80_DEBUG_TIMELINE_INSPECTOR.html`), scoring CSV, samples |
| `schemas/` | **Likely active** | JSON schemas for scoring and ingestion; referenced by test tooling |
| `.runtime/` | **Confirmed active** | Runtime PID files and server logs (created by launchers) |
| `.venv-gpu/` | **Confirmed active** | Python venv for LLM/API server |
| `.venv-tts/` | **Confirmed active** | Python venv for TTS server |
| `expansion ideas/` | **Legacy / historical** | Pre-v7.1 planning artifacts; not part of running system |
| `research/` | **Historical** | Design research notes; not part of running system |
| `assets/` | **Placeholder** | `.gitkeep` only; not actively used |
| `config/` | **Placeholder** | `.gitkeep` only; not actively used |
| `public_html/` | **Placeholder** | `.gitkeep` only; not actively used |

---

## 4. Active Code Files and Purpose

### 4A. Backend — Confirmed Active (loaded by `main.py`)

| File | Purpose |
|---|---|
| `server/code/api/main.py` | FastAPI entrypoint; .env loader; CORS; mounts /ui; includes all routers |
| `server/code/api/db.py` | SQLite CRUD for all tables; `init_db()`; PRAGMA migration; media + attachments |
| `server/code/api/prompt_composer.py` | System prompt assembly; runtime71 behavioral directives; TRANSPARENCY RULE (v8.0) |
| `server/code/api/api.py` | LLM REST chat endpoint |
| `server/code/api/safety.py` | Crisis detection — local scan, no LLM; 7 crisis categories |
| `server/code/api/routers/chat_ws.py` | WebSocket turn handler — runtime71 extraction, prompt composition dispatch |
| `server/code/api/routers/people.py` | People / narrator entity CRUD |
| `server/code/api/routers/profiles.py` | Narrator profile: basics, facts, career, family map |
| `server/code/api/routers/media.py` | Photo upload, serve, delete, attach-to-section, list attachments |
| `server/code/api/routers/timeline.py` | Timeline entries — life periods, events |
| `server/code/api/routers/interview.py` | Interview session, question advancement, section completion |
| `server/code/api/routers/sessions.py` | Session management |
| `server/code/api/routers/db_inspector.py` | DB inspection endpoint (dev tool) |
| `server/code/api/routers/ping.py` | Health check `/ping` |
| `server/code/api/routers/calendar.py` | Calendar/date utilities |
| `server/code/api/routers/facts.py` | Fact extraction POST endpoint; fires after each turn |
| `server/code/api/routers/stt.py` | Speech-to-text endpoint |
| `server/code/api/routers/affect.py` | Affect event POST from browser; emotion arc logging |
| `server/code/api/routers/memoir_export.py` | DOCX memoir export; `AttachedPhoto` model; photo embed |
| `server/code/api/routers/tts.py` | TTS endpoint — only mounted when `USE_TTS=1` in .env |

### 4B. Backend — Legacy / Not Active

| File | Status | Notes |
|---|---|---|
| `server/code/api/routers/sessions_legacy.py` | **Legacy** | Superseded by `sessions.py` |
| `server/code/api/routers/sessionsv1.py` | **Legacy** | v1 sessions; superseded |
| `server/code/api/routers/timelinev1.py` | **Legacy** | v1 timeline; superseded by `timeline.py` |
| `server/code/api/routers/v16chat_ws.py` | **Legacy** | Prior WS version; superseded by `chat_ws.py` |
| `server/code/api/routers/v1chat_ws.py` | **Legacy** | v1 WS; superseded |
| `server/code/api/routers/tts_stub.py` | **Legacy stub** | Placeholder; not loaded unless explicitly imported |
| `server/code/api/routers/stream_bus.py` | **Uncertain** | Not in `main.py` imports; likely internal utility or unused |
| `server/code/api/routers/interview.py.bak_*` | **Backup** | Build artifact; not loaded |
| `server/code/test_model.py` | **Dev tool** | Manual model behavior testing; not part of running API |

### 4C. Frontend CSS — Confirmed Active (loaded by `lori8.0.html`)

| File | Purpose |
|---|---|
| `ui/css/tailwind.min.css` | Utility CSS base |
| `ui/css/base.css` | Global base styles, reset, typography |
| `ui/css/layout.css` | Shell layout: panels, sidebar, dock |
| `ui/css/safety.css` | Crisis overlay, softened-mode indicators |
| `ui/css/affect.css` | Emotion toggle button, affect arc, camera dot |
| `ui/css/lori80.css` | Primary 8.0 styles: chat, tabs, media builder, camera preview |
| `ui/css/bio-review.css` | Bio Builder candidate card styles |
| `ui/css/bio-phase-f-debug.css` | Phase F debug overlay styles |
| `ui/css/bio-phase-f-report.css` | Phase F report panel styles |
| `ui/css/bio-phase-f-tests.css` | Phase F test harness styles |
| `ui/css/bio-control-center.css` | Bio Builder control center popover styles |
| `ui/vendor/mind-elixir/mind-elixir.css` | Life Map (Mind Elixir) vendor styles |

### 4D. Frontend CSS — Present but Not Loaded by 8.0 Shell

| File | Status | Notes |
|---|---|---|
| `ui/css/interview.css` | **Uncertain** | Not in 8.0 `<link>` chain; may be superseded by `lori80.css` |
| `ui/css/lori73.css` | **Legacy** | v7.3-era stylesheet; only referenced by older shells |
| `ui/css/permissions.css` | **Uncertain** | May be loaded by `permissions.js` dynamically |
| `ui/css/facial-consent.css` | **Uncertain** | May be loaded by `facial-consent.js` dynamically |
| `ui/css/tailwind-input.css` | **Build input only** | Source file for Tailwind build; not served |

### 4E. Frontend JS — Confirmed Active (loaded by `lori8.0.html` in load order)

**Vendor (loaded in `<head>`):**

| File | Purpose |
|---|---|
| `ui/vendor/mediapipe/face_mesh/face_mesh.js` | MediaPipe Face Mesh WASM — 468-landmark facial geometry |
| `ui/vendor/mediapipe/camera_utils/camera_utils.js` | MediaPipe camera stream utilities |
| `ui/vendor/floating-ui/core.min.js` | Floating UI positioning core |
| `ui/vendor/floating-ui/dom.min.js` | Floating UI DOM adapter (tooltips, popovers) |

**Modules (loaded before `</body>`):**

| File | Purpose |
|---|---|
| `ui/js/state.js` | All shared mutable state; `state.session`, `state.interview`, `state.runtime`, etc. |
| `ui/js/data.js` | Data layer helpers; fetch wrappers; local storage access |
| `ui/js/api.js` | API client — people, profiles, facts, timeline, memoir |
| `ui/js/tabs.js` | Tab switching logic |
| `ui/js/safety-ui.js` | Crisis overlay render; softened mode UI triggers |
| `ui/js/permissions.js` | Permission card: mic/camera/location toggles |
| `ui/js/emotion.js` | `LoreVoxEmotion` — MediaPipe engine (standalone IIFE) |
| `ui/js/facial-consent.js` | `FacialConsent` — session-scoped informed consent gate |
| `ui/js/affect-bridge.js` | `AffectBridge74` — debounce and baseline; routes affect events to state |
| `ui/js/emotion-ui.js` | Emotion toggle UI, camera lifecycle, `startEmotionEngine()`, `stopEmotionEngine()` |
| `ui/js/timeline-ui.js` | Timeline render; life period bands; event slots |
| `ui/js/interview.js` | Interview session management; pass/era routing; section completion |
| `ui/js/app.js` | Core: `buildRuntime71()`, identity onboarding, send flow, meaning engine, memoir export |
| `ui/js/cognitive-auto.js` | Auto cognitive mode selection per turn from message + affect signals |
| `ui/vendor/mind-elixir/mind-elixir.js` | Mind Elixir — Life Map mind-map renderer (vendored) |
| `ui/js/life-map.js` | Life Map navigator — people, memories, events, places canvas |
| `ui/js/bio-builder.js` | Bio Builder — quick capture, NLP extraction, candidate pipeline |
| `ui/js/bio-review.js` | Bio Builder review surface — approve/edit/reject candidates |
| `ui/js/bio-promotion-adapters.js` | Promotion adapters — approved candidates → `state.structuredBio` |
| `ui/js/bio-phase-f.js` | Phase F orchestrator — approved-only downstream sync; Life Map / timeline / memoir preview feeds |
| `ui/js/bio-phase-f-report.js` | Phase F run report UI |
| `ui/js/bio-phase-f-test-harness.js` | Phase F test harness (dev/QA tool) |
| `ui/js/bio-control-center.js` | Bio Builder Control Center popover |

**Inline IIFEs (in `lori8.0.html` `<script>` blocks):**

| IIFE | Purpose |
|---|---|
| Media Builder IIFE | Full photo lifecycle: `_loadGallery`, `_renderGallery`, `_onFileSelected`, `_submitUpload`, `_openLightbox`, `_lbAttach`, `_lbDelete`, `_renderSectionThumbs`. Exposes `window._lv80*` API. |
| Camera Preview IIFE | `window.lv74.showCameraPreview()` — draggable floating preview panel; separate display stream |

### 4F. Frontend JS — Present but NOT Loaded by 8.0 Shell

| File | Status | Notes |
|---|---|---|
| `ui/js/lori73-shell.js` | **Legacy** | v7.3 shell script; deliberately NOT loaded by 8.0 (onboarding conflicts) |
| `ui/js/debug-overlay.js` | **Dev tool** | Not confirmed in 8.0 `<script>` chain; may be conditionally loaded |

### 4G. Frontend HTML — Legacy Shells

| File | Status |
|---|---|
| `ui/lori8.0.html` | **Active shell** |
| `ui/lori7.5.html` | **Legacy / transitional** |
| `ui/lori7.4c.html` | **Legacy** |
| `ui/lori7.3.html` | **Legacy** |
| `ui/lori7.3 - Copy.html` | **Legacy copy** |
| `ui/lori7.3 - Copy (2).html` | **Legacy copy** |
| `ui/lori7.1.html` | **Legacy** |
| `ui/6.1.html` | **Legacy** |
| `ui/chris.html` | **Dev/test** — non-production test shell |

---

## 5. Active Vendored Dependencies and Purpose

| Vendor | Files | Purpose |
|---|---|---|
| **MediaPipe Face Mesh** | `vendor/mediapipe/face_mesh/face_mesh.js` | 468-landmark facial geometry — WASM, runs locally |
| **MediaPipe Camera Utils** | `vendor/mediapipe/camera_utils/camera_utils.js` | Camera stream utilities for MediaPipe |
| **Floating UI** | `vendor/floating-ui/core.min.js`, `dom.min.js` | Tooltip / popover positioning |
| **Mind Elixir** | `vendor/mind-elixir/mind-elixir.js`, `mind-elixir.css` | Life Map mind-map renderer |

All vendor assets are stored locally. No CDN dependencies at runtime. MediaPipe WASM runs fully in-browser. No vendor code contacts external services.

---

## 6. Database Path Logic

Source: `server/code/api/db.py` lines 42–54.

```python
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_DIR   = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_NAME  = os.getenv("DB_NAME", "lorevox.sqlite3").strip() or "lorevox.sqlite3"
DB_PATH  = DB_DIR / DB_NAME
```

| Variable | Default | Override |
|---|---|---|
| `DATA_DIR` | `data` (relative to server CWD) | `DATA_DIR=<path>` in `.env` |
| `DB_DIR` | `data/db` | Derived from `DATA_DIR` |
| `DB_NAME` | `lorevox.sqlite3` | `DB_NAME=<filename>` in `.env` |
| `DB_PATH` | `data/db/lorevox.sqlite3` | Derived from `DB_DIR / DB_NAME` |

`DB_DIR` is created automatically (`mkdir parents=True`). DB_PATH is logged at startup: `Lorevox DB: <path>`.

**Confirmed:** `data/db/lorevox.sqlite3` exists on disk.

**Important:** `DATA_DIR` is evaluated relative to the server's working directory, which is typically the repo root (when launched from `launchers/run_gpu_8000.sh`). If the process is started from a different directory, the path will differ. The `.env` `DATA_DIR` override should be an absolute path for production reliability.

---

## 7. Data Folders in Use

| Folder | Status | Contents |
|---|---|---|
| `data/db/` | **Confirmed active** | `lorevox.sqlite3` (main DB), `lorevox.sqlite3-journal` (WAL journal) |
| `data/media/` | **Active at runtime** | Uploaded photos; created on first upload; subdirectory per person via media router |
| `.runtime/logs/` | **Active at runtime** | `api.log`, `tts.log`, `ui.log` — written by launchers |
| `.runtime/pids/` | **Active at runtime** | `api.pid`, `tts.pid`, `ui.pid` — written by launchers for `stop_all_dev.sh` |

---

## 8. Legacy or Outdated Files / Docs to Review

### Documentation (outdated — should be marked historical)

| File | Issue |
|---|---|
| `README.md` | Describes v7.1; launch URL points to `lori7.3.html`; repo structure is wrong; pending list is stale — **replaced by this audit** |
| `LOREVOX_ARCHITECTURE.md` (root) | Pre-v8.0 architecture document; needs verification |
| `HANDOFF_MEDIAPIPE_OFFLINE.md` (root) | MediaPipe offline bundling issue — may be resolved or still pending |
| `docs/MOVE_TO_V7.md` | Historical migration notes; no longer current |
| `docs/7.3handoff.md` | v7.3 handoff notes; historical |
| `docs/7.4_WORKLOG.md` | v7.4 work log; historical |
| `docs/7.4spec.md` | v7.4 spec; historical |
| `docs/7.4C_dev_session_report.md` | v7.4C dev session; historical |
| `docs/REDESIGN_PLAN_v6_4.md` | v6.4 redesign plan; historical |
| `docs/RELEASE_NOTES_v6_2.md` | v6.2 release notes; historical |
| `docs/RELEASE_NOTES_v6_3.md` | v6.3 release notes; historical |
| `docs/RELEASE_NOTES_v6_4_PLAN.md` | v6.4 plan; historical |
| `docs/PVDhandoff.md` | Master handoff from an earlier milestone; verify if still accurate |
| `docs/README.March.md` | March 2026 interim status; superseded by this audit |
| `docs/handoff.md` | Prior handoff; verify if superseded |
| `expansion ideas/` | Pre-v7.1 expansion planning; entirely historical |
| `research/` | Design research notes; historical |

### Code (legacy — not in active load chain)

| File | Recommendation |
|---|---|
| `ui/lori7.1.html`, `lori7.3.html`, `lori7.3 - Copy*.html`, `lori7.4c.html`, `lori7.5.html`, `6.1.html` | Mark as legacy; keep for reference; do not delete |
| `ui/js/lori73-shell.js` | Legacy; deliberately not loaded by 8.0 |
| `server/code/api/routers/sessions_legacy.py`, `sessionsv1.py`, `timelinev1.py`, `v16chat_ws.py`, `v1chat_ws.py`, `tts_stub.py` | Mark as legacy; keep for reference; do not delete |
| `server/code/api/routers/interview.py.bak_*` | Build artifact; safe to remove if desired (not loaded) |

---

## 9. Recommended Cleanup List (Documentation Only — No Code Deletion)

1. **Update README.md** — replace v7.1 content with v8.0 reality (see updated README)
2. **Add "HISTORICAL" header** to all docs in the v6/v7.x handoff category:
   - `docs/7.3handoff.md`, `docs/7.4_WORKLOG.md`, `docs/7.4spec.md`, `docs/MOVE_TO_V7.md`, `docs/REDESIGN_PLAN_v6_4.md`, `docs/RELEASE_NOTES_v6_*.md`
3. **Mark legacy HTML shells** in a `ui/legacy/` note or README comment (no file moves needed)
4. **Verify `docs/PVDhandoff.md`** — check if still accurate as a startup reference or needs a v8.0 replacement
5. **Add `# LEGACY` comment** to top of legacy router files so any reader is immediately aware
6. **Resolve ISSUE-17** (camera stream unification) before first narrator session — logged in `docs/LOREVOX_ACTION_PLAN.md`
7. **Update `.env.example`** — verify the env var names match current `db.py` (`DATA_DIR`, `DB_NAME`, not `LV_DB_PATH` as referenced in old README)

---

## Appendix — Active Shipped Systems Summary

| System | Status | Key Files |
|---|---|---|
| Identity-first onboarding | **Shipped** | `app.js` (`_advanceIdentityPhase`, `startIdentityOnboarding74`) |
| Runtime71 cognitive state | **Shipped** | `app.js` (`buildRuntime71`), `prompt_composer.py` |
| Three-pass interview model | **Shipped** | `interview.js`, `app.js`, `prompt_composer.py` |
| Cognitive auto-mode | **Shipped** | `cognitive-auto.js`, `prompt_composer.py` |
| Affect / emotion pipeline | **Shipped** | `emotion.js`, `affect-bridge.js`, `emotion-ui.js`, `affect.py` |
| Camera consent + preview | **Shipped** | `facial-consent.js`, `emotion-ui.js`, camera preview IIFE in `lori8.0.html` |
| Transparency Rule (trust) | **Shipped v8.0** | `prompt_composer.py` (TRANSPARENCY RULE directive) |
| Safety scan | **Shipped** | `safety.py`, `safety-ui.js` |
| Bio Builder D/E/F | **Shipped** | `bio-builder.js`, `bio-review.js`, `bio-promotion-adapters.js` |
| Phase F orchestration | **Shipped** | `bio-phase-f.js`, `bio-phase-f-report.js`, `bio-phase-f-test-harness.js`, `bio-control-center.js` |
| Media Builder | **Shipped** | Media IIFE in `lori8.0.html`, `routers/media.py`, `db.py` (media + attachments tables) |
| Memoir DOCX export | **Shipped** | `routers/memoir_export.py` (with `AttachedPhoto` + photo embed) |
| Life Map navigator | **Shipped** | `life-map.js`, Mind Elixir vendor |
| Meaning engine | **Shipped** | `app.js` (`_LV80_TURNING_POINT_RX`, `_LV80_REFLECTION_RX`), `prompt_composer.py` |
| Paired interview mode | **Shipped** | `app.js` (`paired`, `paired_speaker` in runtime71), `prompt_composer.py` |
| TTS voice | **Shipped** | `.venv-tts`, `launchers/run_tts_8001.sh`, `routers/tts.py` (optional mount) |
| Debug Timeline Inspector | **Shipped** | `tools/LOREVOX_80_DEBUG_TIMELINE_INSPECTOR.html` |

| System | Status | Notes |
|---|---|---|
| MediaPipe offline bundle | **Pending** | Camera requires internet today if vendor assets need update; see `HANDOFF_MEDIAPIPE_OFFLINE.md` |
| Camera stream unification | **Tracked (ISSUE-17)** | Preview and emotion engine use separate `getUserMedia` calls |
| Phase 8 — MediaPipe WASM crash fix | **Pending** | See `docs/LOREVOX_ACTION_PLAN.md` |
| Phase 9 — UI scale / focus mode | **Pending** | See `docs/LOREVOX_ACTION_PLAN.md` |
