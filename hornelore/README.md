# Hornelore 1.0

**A curated, hardened production build of Lorevox — locked to the Horne family.**

Hornelore captures the life stories of Christopher Todd Horne, Kent James Horne, and Janice Josephine Horne. It is not a general-purpose memoir platform. It is a family archive with a fixed narrator universe, pre-seeded identity data, and no way to create or delete narrators through the UI.

Built from a live-audited subset of Lorevox 9.0. Every included file was verified against actual browser network requests — not inferred from imports or guessed from the repo tree.

---

## Narrators

| Name | Template | Born |
|---|---|---|
| Christopher Todd Horne | `christopher-todd-horne.json` | March 20, 1985 — Duluth, MN |
| Kent James Horne | `kent-james-horne.json` | July 5, 1956 — Two Harbors, MN |
| Janice Josephine Horne | `janice-josephine-horne.json` | December 14, 1958 — Duluth, MN |

Each narrator is pre-seeded on first startup from their JSON template. Templates contain full biographical data: parents, grandparents, siblings, children, spouse, education, occupation, military service, pets, and core memories. The interview expands this baseline — it never has to establish it from scratch.

---

## Three-Service Stack

```
Port 8000  —  LLM API (FastAPI + Llama 3.1 8B Instruct, 4-bit quantized)
Port 8001  —  TTS Server (Coqui VITS)
Port 8082  —  Hornelore UI (hornelore-serve.py, static files)
```

The API and TTS services are shared with Lorevox. Data isolation is enforced at the database and filesystem level, not the service level. Hornelore writes to its own SQLite database (`hornelore.sqlite3`) in its own data directory (`/mnt/c/hornelore_data/`).

---

## Hardening

**No new narrators.** The +New button is hidden and disabled. `lv80NewPerson()` is a stub that logs a warning. There is no UI path to create a fourth narrator.

**No deletion.** Delete buttons are removed from narrator cards. `lvxStageDeleteNarrator()` is overridden to block deletion and display a warning. All three narrators are protected.

**Identity bypass on switch.** When switching to a known narrator, the identity phase is automatically set to `complete`. The system never re-asks name, DOB, or birthplace for a narrator whose identity is already established.

**Fresh session isolation.** Every narrator switch generates a unique `conv_id`. The LLM backend cannot carry turn history from one narrator into another's session.

**Auto-seeding on startup.** `_horneloreEnsureNarrators()` checks the people cache on load. Any missing narrator is seeded from their template. If all three exist, the function is a no-op.

---

## Data Isolation

| Resource | Lorevox | Hornelore |
|---|---|---|
| Database | `lorevox.sqlite3` | `hornelore.sqlite3` |
| Data directory | `/mnt/c/lorevox_data/` | `/mnt/c/hornelore_data/` |
| Uploads | `lorevox_data/uploads/` | `hornelore_data/uploads/` |
| Media | `lorevox_data/media/` | `hornelore_data/media/` |
| UI port | 8080 | 8082 |
| Model cache | shared | shared |
| TTS cache | shared | shared |

Model and TTS caches are shared because they are read-only weights — not a contamination boundary.

---

## Quick Start

1. Create the data directory:
   ```bash
   mkdir -p /mnt/c/hornelore_data/{uploads,media,authors,templates}
   ```

2. Copy narrator templates for DATA_DIR resolution:
   ```bash
   cp hornelore/ui/templates/*.json /mnt/c/hornelore_data/templates/
   ```

3. Start the API server (needs GPU):
   ```bash
   cd hornelore && source .env
   python server/code/api/main.py
   ```

4. Start TTS:
   ```bash
   ./launchers/run_tts_8001.sh
   ```

5. Start the UI server:
   ```bash
   python hornelore-serve.py
   ```

6. Open in Chrome:
   ```
   http://localhost:8082/ui/hornelore1.0.html
   ```

On first load, Hornelore seeds Chris, Kent, and Janice from templates and auto-selects the first narrator.

---

## File Inventory

131 files total. 6 new (created for Hornelore), 125 copied from Lorevox 9.0.

| Category | Count |
|---|---|
| JavaScript (UI) | 34 |
| CSS | 11 |
| HTML shell | 1 (`hornelore1.0.html`) |
| Narrator templates | 4 (3 family + 1 base) |
| Vendor libraries | 12 (MediaPipe, Floating UI, Mind Elixir) |
| Static assets | 2 |
| Server code | 23 (API routers + services) |
| Scripts | 11 |
| Tests | 5 |
| Launchers | 4 |
| Config | 4 (.env, package.json, playwright.config.ts, tsconfig) |
| Schema | 1 |

---

## Key Differences from Lorevox

Hornelore is not a fork. It is a curated subset with a different product surface.

- **Closed narrator universe** — Lorevox allows creating unlimited narrators. Hornelore is locked to three.
- **Pre-seeded identity** — Lorevox interviews each narrator to establish identity. Hornelore loads identity from templates.
- **No creation or deletion** — UI controls for adding and removing narrators are disabled.
- **Separate data** — Hornelore uses its own database and filesystem. Running both products simultaneously is safe.
- **Renamed shell** — `hornelore1.0.html` instead of `lori9.0.html`. Brand reads "Hornelore 1.0 — Horne Family Archive".

Everything else — the interview engine, Bio Builder, safety layer, emotion pipeline, memoir export, Focus Canvas — works identically.
