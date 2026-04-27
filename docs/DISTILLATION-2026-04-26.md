# Lorevox v10 Distillation Pass — 2026-04-26

**Status:** Code landed in working tree. Not yet committed/pushed.
**Author:** Claude (sandboxed working session, unsupervised per Chris's directive "do path b... strip out hornelore labels and make it lorevox").

---

## What changed (summary)

The Lorevox repo has been brought from an empty `server/code/api/routers/` (with only orphaned `__pycache__` after the WO-11 rename of April 12) up to a full v10 product surface, distilled from the Hornelore R&D crucible. Every Hornelore-derived file was renamed and rebranded; every Horne-family-specific assumption was stripped.

This is the first execution of Path B from the lab/gold framing: **build a fresh Lorevox `server/` from Hornelore code, generalized.** It implements the bucket-A "promote" list from the Promotion Queue documented in the Lorevox README.

---

## Decisions made (override any of these by editing + recommitting)

These are the architectural calls I made unilaterally because Chris was at work and the work was authorized to proceed. Each is reversible with a small change.

| # | Decision | Rationale | Override path |
|---|---|---|---|
| 1 | UI shell: new `ui/lorevox10.0.html` | Clean break for v10; preserves `lori9.0.html` as v9 baseline reference | Rename `lorevox10.0.html` to whatever you prefer; update launchers |
| 2 | Database: `lorevox.sqlite3` (already in `db.py` after rename) | Matches existing `.env.example` pattern + WO-11 plan | Override via `DB_NAME` env var |
| 3 | Data dir: `/mnt/c/lorevox_data/` (already in `.env.example`) | Matches existing v9 pattern | Override via `DATA_DIR` env var |
| 4 | Env var prefix: `LOREVOX_*` (was `HORNELORE_*`) | Strips Hornelore branding from production flags | Globally `sed` if you change brands |
| 5 | Ports: API 8000 / TTS 8001 / UI 8080 | Lorevox v9 default; UI 8080 avoids collision with Hornelore on 8082 | `LOREVOX_*_PORT` env vars |
| 6 | No pre-seeded narrators (`LOREVOX_NARRATORS = []`) | Open-narrator-universe per the lab/gold framing | Add a templates/*.json file + repopulate the array if you want to ship example narrators |
| 7 | Open narrator creation/deletion (no overrides on `lvxStageDeleteNarrator` or `lv80SwitchPerson`) | Hornelore-only-by-design list explicitly excludes the family-lock guards | Add overrides back if you ever want a locked-universe Lorevox build |
| 8 | Bucket B (extractor experiments) ports COME OVER but flag-OFF in `.env.example` | Operator has the code surface but production stays stable | Flip flags to `1` in `.env` to opt in |
| 9 | Bucket C (BB Walk Test, Quality Harness fixtures, family templates) NOT copied | Hornelore-only-by-design | Symlink or copy from Hornelore repo if you ever want them in Lorevox |
| 10 | `server.STALE_do_not_import/` LEFT IN PLACE | Historical reference per your April 12 decision; not needed but harmless | `git rm -r server.STALE_do_not_import/` if you want it gone |
| 11 | UI file `lori9.0.html` LEFT IN PLACE | v9 baseline reference; useful for diff/comparison | `git rm ui/lori9.0.html` (and `lori7.5.html`, `lori8.0.html`) if you want only v10 |
| 12 | Existing `scripts/hornelore_common.sh` LEFT IN PLACE | Sandbox can't `rm` it; obsolete (replaced by new `scripts/common.sh`) | `git rm scripts/hornelore_common.sh scripts/import_kent_james_horne.py` |
| 13 | Existing `server/data/qa/` and `server/data/test_lab/` LEFT IN PLACE | Sandbox couldn't delete; eval-lane fixtures (Hornelore-only) | `git rm -rf server/data/qa server/data/test_lab` |

---

## Files changed

### Server-side (new in Lorevox)

The entire `server/code/` tree is freshly copied from Hornelore and rebranded:

```
server/code/
├── __init__.py
├── api/
│   ├── __init__.py
│   ├── api.py               # WO-13 truth pipeline + LLM REST surface
│   ├── archive.py           # legacy archive (still active)
│   ├── db.py                # SQLite setup + migrations runner call
│   ├── flags.py             # LOREVOX_* feature flag helper (was HORNELORE_*)
│   ├── interview_engine.py
│   ├── llm_interview.py
│   ├── main.py              # FastAPI app, all routers registered
│   ├── phase_aware_composer.py
│   ├── prompt_composer.py   # carries WO-10C cognitive-support prompt content
│   ├── routers/             # 31 routers including:
│   │   ├── photos.py
│   │   ├── media_archive.py
│   │   ├── memory_archive.py
│   │   ├── family_truth.py
│   │   ├── chronology_accordion.py
│   │   └── ... (28 more)
│   └── safety.py
├── db/
│   ├── __init__.py
│   ├── migrations_runner.py
│   └── migrations/
│       ├── 0001_lori_photo_shared.sql
│       ├── 0002_memory_archive.sql
│       └── 0003_media_archive.sql
├── services/
│   ├── media_archive/        # WO-MEDIA-ARCHIVE-01 service layer
│   ├── memory_archive/       # WO-ARCHIVE-AUDIO-01 service layer
│   ├── photo_intake/         # Phase 2 EXIF + geocoder + Plus Code
│   ├── photo_elicit/         # Phase 2 (specced, partial impl)
│   └── photos/               # Phase 1 photo authority layer
└── (other supporting modules)
```

89 Python files total. All passed `ast.parse()` syntax check.

### UI-side

```
ui/
├── lorevox10.0.html         # NEW v10 shell (renamed from hornelore1.0.html)
├── lori9.0.html             # PRESERVED — v9 baseline (untouched)
├── lori8.0.html             # PRESERVED — v8 baseline (untouched)
├── lori7.5.html             # PRESERVED — v7 baseline (untouched)
├── media-archive.html       # NEW — Document Archive curator page
├── photo-intake.html        # NEW — Photo Intake curator page
├── photo-elicit.html        # NEW — Photo Session narrator page
├── photo-timeline.html      # NEW — Photo Timeline browse page
├── js/
│   ├── (existing v9 files preserved)
│   └── + 23 NEW files from Hornelore (archive-writer, chronology-accordion,
│       media-archive, narrator-audio-recorder, photo-intake, photo-timeline,
│       session-loop, session-style-router, transcript-guard, ui-health-check,
│       wo13-review, etc.)
└── css/
    └── (merged Hornelore + Lorevox; Hornelore-derived files newer)
```

57 JS files total. All passed `node --check` syntax check.

### Data + scripts

```
server/data/                  # narrator_templates (test_*.json only),
                              #   prompts, historical, db
                              # qa/ and test_lab/ inherited from copy but
                              #   should be deleted (eval-lane fixtures)
scripts/
├── common.sh                 # NEW — Lorevox-correct shell helpers
├── start_all.sh              # UPDATED — points to /ui/lorevox10.0.html
├── (pre-existing scripts preserved)
└── hornelore_common.sh       # OBSOLETE — supersede by common.sh; rm
```

### Config

- `.env.example` — extended with all new LOREVOX_* feature flags (WO-13 truth pipeline, photo system, document archive, memory archive, plus extractor lane flags default-OFF)
- `README.md` — header bumped to v10; "Hornelore Promotion Queue" section added (in earlier commit before this distillation pass)

---

## Mass rename pass

Single Python script in this session executed against `server/code/`, `server/data/`, `ui/`:

| Pattern | Replacement | Notes |
|---|---|---|
| `hornelore1.0.html` | `lorevox10.0.html` | Specific HTML shell name (done first) |
| `HORNELORE_` | `LOREVOX_` | All env var prefixes |
| `Hornelore` | `Lorevox` | Proper noun in comments/docs/UI text |
| `hornelore` | `lorevox` | Lowercase identifier / file path / db / domain |

**Result:** 280 replacements across 59 files. Zero `HORNELORE_` left. Zero `hornelore` left. One legitimate `Hornelore` reference left in my own intentional comment block in the v10 shell explaining the lab/gold relationship (lines 7867, 7885, 7887 of `ui/lorevox10.0.html`).

`WO-HORNELORE-SESSION-LOOP-01` → `WO-SESSION-LOOP-01` in app.js (3 sites).

---

## Family-lock removal

The most consequential semantic change. The Hornelore shell (`hornelore1.0.html`) had a 110-line block that:

1. Pre-seeded three Horne narrators on first boot from JSON templates
2. Blocked `lvxStageDeleteNarrator` to prevent deletion
3. Overrode `lv80SwitchPerson` to force `identityPhase = "complete"` (skipping onboarding for known narrators)

In Lorevox, that block has been replaced with:

- An empty `LOREVOX_NARRATORS = []` (kept as a constant so callers don't break)
- A no-op `_lorevoxEnsureNarrators()` (kept as a function so init code doesn't break)
- No override of `lvxStageDeleteNarrator` (deletion works as v9 baseline expects)
- No override of `lv80SwitchPerson` (identity onboarding fires for new narrators as v9 baseline expects)
- A clear comment block explaining that family-locked builds (Hornelore) override these in their own shell

**Net effect:** Lorevox v10 is open-narrator-universe. New narrators get standard identity onboarding. Any narrator can be deleted. No pre-seeded data.

---

## What was deliberately NOT promoted

From the bucket B and bucket C lists in the Promotion Queue:

- **Eval lane** (`scripts/run_question_bank_extraction_eval.py`, `run_canon_grounded_eval.py`, `run_section_effect_matrix.py`, `run_stubborn_pack_eval.py`, `run_test_lab.sh`, `failure_pack.py`, `audit_canon_gaps.py`, `dump_cases_per_narrator.py`, `debug_twopass_stage_loss.py`) — too tied to Hornelore's measurement cadence
- **Quality Harness fixtures** (`server/data/test_lab/narrator_statements.json`, `server/data/qa/*.json`) — currently shaped to Hornelore's eval surface
- **BB Walk Test harness UI** (`ui/js/test-bb-walk.js`, `test-harness.js`) — operator-only dev surface, came over via the bulk rsync but stays default-off in production. If you want them gone, `git rm` after the initial commit
- **Family templates** (`kent-james-horne.json`, `janice-josephine-horne.json`, `christopher-todd-horne.json`) — never copied
- **Parent-session readiness runbook** + **Bug Panel narrator-specific utilities** (Reset Identity, Purge Test Narrators) — operator-only Hornelore-side tooling

---

## Open questions for you

1. **Brand/positioning text in the README's intro paragraph.** I bumped the version line but left the v9 product description ("local-first, privacy-first memoir and life-story platform for older adults") intact. Want a fresh tagline that reflects v10's surfaces (photo + document archive + cognitive support model)? I can write one.
2. **Should `lori7.5.html` and `lori8.0.html` be deleted?** They're stale historical references. v9 alone is enough as a baseline diff target.
3. **Should the test narrator templates (`test_storyteller.json`, `test_structured.json`) be promoted as built-in demo narrators?** Right now they exist in `server/data/narrator_templates/` but no UI flow loads them automatically. Could be useful as "click here to try Lorevox with a synthetic narrator."
4. **Should `server.STALE_do_not_import/` and the orphan `__pycache__/` directories be deleted?** Pure historical residue; safe to remove.
5. **Should the `hornelore/` subdirectory at Lorevox repo root be deleted?** It's a folder of historical Hornelore reports from April 12 era. Out of place in v10 Lorevox.

---

## What still needs hands-on testing

I can't run the stack from the sandbox, so the following are unverified:

- Server boots cleanly with the new `server/code/` (`bash launchers/run_gpu_8000.sh` should work; cold boot ~4 min)
- Migrations apply cleanly on first boot (the runner is idempotent + tracked in `schema_migrations`)
- UI loads at `http://localhost:8080/ui/lorevox10.0.html`
- `/api/photos/health`, `/api/media-archive/health`, `/api/memory-archive/health` all return `{"ok":true,"enabled":true}` after `.env` is copied from `.env.example`
- Browser smoke: create a narrator, run a chat turn, verify transcript writes, upload a photo, upload a PDF to Document Archive

After your `git pull` on the laptop, the standard bring-up should work:

```bash
cp .env.example .env       # then edit your local paths if different from defaults
bash scripts/start_all.sh
```

---

## Recommended commit plan

Per CLAUDE.md hygiene: code isolated from docs, specific paths only. Five commits in this order so the bisect surface stays clean:

```bash
cd /mnt/c/Users/chris/lorevox

# Commit 1 — Backend: server/code/ tree (the meat)
git add \
  server/code/__init__.py \
  server/code/api \
  server/code/db \
  server/code/services
git commit -m "$(cat <<'EOF'
Lorevox v10 distillation: server/code/ from Hornelore (generalized)

Bring the full server-side surface up from empty (only orphan
__pycache__ since the WO-11 rename of April 12) to a complete
v10 backend, distilled from the Hornelore R&D crucible.

Promotes (bucket A from the Promotion Queue):
- Four-layer truth pipeline (WO-13)
- Photo system (router + services + Phase 2 EXIF + geocoder)
- Document Archive (WO-MEDIA-ARCHIVE-01: router + services + migration)
- Memory Archive (WO-ARCHIVE-AUDIO-01: router + services + migration)
- Per-turn audio capture endpoint (WO-AUDIO-NARRATOR-ONLY-01 backend)
- Cognitive Support Model prompt content (WO-10C in prompt_composer)
- Bio Builder contamination hardening (BUG-208 stack)
- Chronology Accordion router (WO-CR)
- 31 routers total, 89 Python files, all syntax-clean

Mass rename HORNELORE_* -> LOREVOX_* across 59 files; 280 replacements.
DB defaults to lorevox.sqlite3 in /mnt/c/lorevox_data/.

Bucket B (extractor experiments: SPANTAG, BINDING, NARRATIVE,
PROMPTSHRINK, ATTRIB_BOUNDARY, AGE_VALIDATOR, PHASE_AWARE,
TWOPASS) carried over but flag-OFF in .env.example.

Bucket C (Hornelore-only by design: Bug Panel dev utilities, BB
Walk Test harness, Quality Harness fixtures, family templates,
parent-session runbook) NOT promoted. The eval-lane fixtures
under server/data/qa/ and server/data/test_lab/ landed via the
copy and should be removed in a follow-up commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Commit 2 — Server data (templates + prompts + historical events seed)
git add server/data
git commit -m "$(cat <<'EOF'
Lorevox v10 distillation: server/data (test narrators + prompts)

Bring over the supporting data tree:
- server/data/narrator_templates/ -- two synthetic test narrators
  (test_storyteller, test_structured). No Horne family templates.
- server/data/prompts/ -- question bank + interview opener content
- server/data/historical/ -- 152 world events 1900-2026 (used by
  Chronology Accordion world lane)
- server/data/db/ -- empty placeholder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Commit 3 — UI: new v10 shell + curator pages + js/css from Hornelore
git add \
  ui/lorevox10.0.html \
  ui/media-archive.html \
  ui/photo-intake.html \
  ui/photo-elicit.html \
  ui/photo-timeline.html \
  ui/js \
  ui/css \
  ui/vendor \
  ui/templates \
  ui/assets
git commit -m "$(cat <<'EOF'
Lorevox v10 distillation: ui/ — new v10 shell + curator surfaces

Add the v10 product surface:
- ui/lorevox10.0.html (renamed from Hornelore's hornelore1.0.html;
  family-lock block stripped, replaced with empty no-op so caller
  surfaces don't break; LOREVOX_NARRATORS = [], no creation/deletion
  guards, identity onboarding fires standard-v9 for any narrator)
- ui/media-archive.html, photo-intake.html, photo-elicit.html,
  photo-timeline.html -- new curator/narrator surfaces
- ui/js/ — 23 new modules from Hornelore (archive-writer,
  chronology-accordion, media-archive, narrator-audio-recorder,
  photo-intake, photo-timeline, session-loop, session-style-router,
  transcript-guard, ui-health-check, wo13-review, etc.) plus
  Hornelore-newer overlapping files
- ui/css/ — merged
- v9 / v8 / v7.5 shells preserved as historical references

All 57 JS files syntax-clean (node --check). Mass rename
HORNELORE_*/Hornelore/hornelore -> LOREVOX_*/Lorevox/lorevox.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Commit 4 — Launcher infra (common.sh + start_all.sh update)
git add \
  scripts/common.sh \
  scripts/start_all.sh
git commit -m "$(cat <<'EOF'
Lorevox v10 distillation: scripts/common.sh + start_all.sh -> v10 shell

Add scripts/common.sh — the proper Lorevox shell helpers (port
assignments, PID/log paths, command lookup, process helpers) used
across the launcher scripts. Replaces the misnamed
hornelore_common.sh which was leftover from the WO-11 split.

Update start_all.sh to point operators at /ui/lorevox10.0.html
(the v9 baseline still loads at /ui/lori9.0.html for comparison).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Commit 5 — Config + docs
git add \
  .env.example \
  README.md \
  docs/DISTILLATION-2026-04-26.md
git commit -m "$(cat <<'EOF'
Lorevox v10 distillation: .env.example + README v10 banner + decisions doc

- .env.example extended with all new LOREVOX_* feature flags:
  TRUTH_V2, TRUTH_V2_PROFILE (WO-13 truth pipeline)
  PHOTO_ENABLED, PHOTO_INTAKE (photo system + Phase 2)
  MEDIA_ARCHIVE_ENABLED (Document Archive)
  ARCHIVE_ENABLED (Memory Archive + caps)
  Plus extractor lane flags (default OFF, experimental)
  Plus port overrides
- README.md header bumped to v10 with one-paragraph status note
  pointing to the Promotion Queue
- docs/DISTILLATION-2026-04-26.md: full record of every architectural
  decision made in the unsupervised distillation session, including
  the override path for each. Captures open questions for review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Commit 6 (optional) — Cleanup of obsolete files (after review)
# The sandbox couldn't delete these; do it locally if you agree:
# git rm scripts/hornelore_common.sh scripts/import_kent_james_horne.py
# git rm -rf server/data/qa server/data/test_lab
# git commit -m "Lorevox v10 cleanup: remove Hornelore-specific leftover files"

git status
git log --oneline -8
git push
```

---

## Verification checklist (after pushing + cycling stack)

```bash
# 1. Stack starts
bash scripts/start_all.sh

# 2. After ~4 min cold boot, all three health endpoints return enabled=true
curl -s http://127.0.0.1:8000/api/ping            # {"ok":true,...}
curl -s http://127.0.0.1:8000/api/photos/health   # enabled:true
curl -s http://127.0.0.1:8000/api/media-archive/health  # enabled:true
curl -s http://127.0.0.1:8000/api/memory-archive/health # enabled:true

# 3. Migrations applied
sqlite3 /mnt/c/lorevox_data/db/lorevox.sqlite3 \
  "SELECT filename, applied_at FROM schema_migrations ORDER BY filename;"
# Expect three rows: 0001_lori_photo_shared, 0002_memory_archive, 0003_media_archive

# 4. UI loads
# Open http://localhost:8080/ui/lorevox10.0.html in Chrome.
# Operator tab loads. Narrator dropdown is EMPTY (not pre-seeded).
# Click +New, create a narrator, give them a name, run a chat turn,
# verify the chat works.

# 5. Bug Panel health harness — should show 15+ green categories with
# Document Archive present (ui/js/ui-health-check.js was rebranded and
# all four media_archive checks are still wired)
```

---

## What I'd recommend doing next

1. **Land the five commits** above and push. Lorevox v10 is now ready for first boot test.
2. **Boot test on your machine** with the verification checklist. Expect to find at least one or two small bugs the syntax-check didn't catch (likely import paths or asset references).
3. **Optional cleanup commit** to remove the obsolete files the sandbox couldn't delete (`hornelore_common.sh`, `import_kent_james_horne.py`, `server/data/qa/`, `server/data/test_lab/`, `lori7.5.html`, `lori8.0.html`, `server.STALE_do_not_import/`, the `hornelore/` reports subdirectory).
4. **Decide on the open questions** at the top of this doc and apply.
5. **Once Lorevox v10 boots clean**, share the GitHub link wherever you want — Kai (HKUST) and anyone else who searches for Lorevox now finds a real product surface, not a frozen v9 + an internal lab.
