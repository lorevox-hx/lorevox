# Lorevox v7.0 — Master Migration Plan
**Written:** 2026-03-11
**Author:** Chris + Claude (Cowork)
**Status:** Approved — ready to build

> This document is complete enough to rebuild Lorevox v7.0 from scratch if the repo were lost tomorrow. It covers vision, architecture, every new file, every changed file, every new dependency, and the exact build order.

---

## The v7.0 Vision in One Sentence

**Lori is the app. Everything else is what she builds.**

In every version through v6.x, the UI was a data tool that happened to have a chat panel in it. v7.0 inverts that. Lori is a persistent floating presence that stays on screen at all times. The tabs behind her — Profile, Family Tree, Timeline, Memoir — are a live view of what she has learned so far. The user never operates a form. They just talk to Lori.

---

## What Changes vs. v6.x

| Aspect | v6.x | v7.0 |
|--------|------|------|
| Chat | One of three columns | Floating panel, always visible |
| Interview mode | Separate structured REST path (`/api/interview/start`) | Single chat path — Lori guides conversation naturally |
| Profile | User fills in form fields | Lori extracts facts from conversation automatically |
| Family tree | Not implemented | Dedicated conversation mode → real People+Relationships in DB |
| Emotion detection | MediaPipe browser WASM (affect states only) | face-api.js (client) + DeepFace (server) layered |
| Offline | Partial (model loads from HuggingFace on start) | Fully air-gapped after first setup |
| Layout | 3 columns | Left sidebar + tabbed content + floating Lori panel |
| DB pipeline | Answers stored in chat sessions only | Lori extracts structured facts after every response |

---

## UI Architecture — The Floating Lori Shell

### Layout

```
┌─────────────────────────────────────────────────────┬───────────────────────┐
│  [≡]  LOREVOX            [Chris Doe ▾]   [⚙]  [?]  │                       │
├─────────────────────────────────────────────────────┤   ┌───────────────┐   │
│  Profile │ Family Tree │ Timeline │ Memoir          │   │  Lori avatar  │   │
├─────────────────────────────────────────────────────┤   │  + emotion    │   │
│                                                     │   │  indicator    │   │
│   CONTENT AREA                                      │   └───────────────┘   │
│   (changes per tab — fills in as Lori learns)       │                       │
│                                                     │   "Tell me about       │
│   Profile tab: structured fields Lori has captured  │   your childhood..."  │
│   Family Tree tab: visual tree being built          │                       │
│   Timeline tab: life events as they appear          │   ───────────────────  │
│   Memoir tab: narrative draft assembling live       │   [____type here___]  │
│                                                     │   [🎤 Hold]   [Send]  │
│                                                     │                       │
│                                                     │   [_] collapse        │
└─────────────────────────────────────────────────────┴───────────────────────┘
```

### Lori Panel Behaviour

- **Always visible** — `position: fixed`, right side, full viewport height
- **Width:** 320px default, collapsible to 48px (avatar + mic button only)
- **Collapsed state:** Shows Lori avatar, pulsing mic indicator, and last message truncated. Tap to expand.
- **Mobile:** Lori docks to bottom as a drawer (slides up on tap)
- **Context-aware:** Lori's system prompt includes the currently active tab so she can comment on what the user is looking at ("I can see you're on the Family Tree tab — want to tell me about your grandparents?")
- **Emotion indicator:** Small colour ring around Lori's avatar changes based on detected affect state (green=steady, amber=reflective, blue=moved, red=distressed)

### Tab Content

Each tab is a read-only (mostly) live view that updates as the chat→DB extraction pipeline populates data:

**Profile tab:** Name, DOB, birthplace, raised-in, occupations, key relationships. Grayed-out fields show what Lori hasn't learned yet (never shows "empty" — shows "Lori will ask").

**Family Tree tab:** Visual tree rendered with D3.js or a lightweight SVG tree. Nodes appear as Lori learns about relatives. Clicking a node shows what Lori knows about that person.

**Timeline tab:** Chronological life event cards, same as existing timeline but auto-populated from extraction.

**Memoir tab:** Rolling narrative draft. Sections fill in as Lori completes each topic area.

---

## New Feature: Chat→DB Extraction Pipeline

### The Problem It Solves

Currently, everything the user says to Lori is stored as raw chat text. Lori learns nothing persistently. If you restart, she starts over. v7.0 changes this: after every assistant response, a fast extraction pass converts the conversation into structured profile data.

### How It Works

```
User speaks → WebSocket → LLM responds to user →
  (async, non-blocking):
  extraction_pass(person_id, last_6_turns) →
    structured_facts = LLM extraction call →
      update_profile_json(person_id, structured_facts, merge=True) →
        UI tabs update via polling
```

### Extraction Prompt (appended silently, never shown to user)

```
You are a biographical data extractor. Review the last few turns of conversation
and extract any newly mentioned facts about the subject. Return ONLY a JSON object.
Omit any field not clearly mentioned. Do not infer or guess.

{
  "full_name": "string",
  "preferred_name": "string",
  "date_of_birth": "YYYY-MM-DD or YYYY or uncertain:raw_string",
  "place_of_birth": "string",
  "raised_in": "string",
  "occupation_history": ["string"],
  "education": ["string"],
  "family_members": [{"name": "string", "relation": "string", "birth_year": "string", "notes": "string"}],
  "key_life_events": [{"year": "string", "description": "string"}],
  "places_lived": ["string"],
  "interests": ["string"],
  "values": ["string"]
}

Return {} if nothing new was learned in these turns.
```

### Rate Limiting

- Only runs if ≥2 new turns since last extraction
- Max 1 extraction call per 15 seconds
- Extraction is async — never blocks the main chat response
- Failures are logged and silently skipped (never interrupt the conversation)

### New File: `server/code/api/extract_facts.py`

```python
async def extract_facts_from_turns(
    person_id: str,
    turns: list[dict],  # [{"role": "user"|"assistant", "content": str}]
    llm_caller: callable,
) -> dict:
    """Run extraction pass on recent turns. Returns extracted facts dict or {}."""
    ...

async def schedule_extraction(person_id: str, session_id: str) -> None:
    """Called after each assistant turn. Rate-limited, non-blocking."""
    ...
```

---

## New Feature: Family Tree Interview Mode

### Activation

User says "let's work on the family tree" or clicks the Family Tree tab → Lori detects intent and switches to family-tree mode.

Alternatively: Lori proactively suggests it after she's learned the subject's name and DOB ("Now that I know a bit about you, would you like to tell me about your family?").

### Lori's Approach in Family Tree Mode

Lori works through relatives in a natural order:
1. Parents (names, origins, occupations, how they met)
2. Grandparents (both sides)
3. Siblings (names, birth years, relationships)
4. Spouse/partner(s)
5. Children and grandchildren
6. Key extended family (aunts/uncles/cousins who mattered)

She never uses genealogy jargon. She says "Tell me about your mum" not "Enter maternal lineage record."

### DB Output

Each relative mentioned gets:
- A `people` row with `role="relative"`
- A `relationships` row linking them to the subject
- Their facts stored in their own `profile_json`

### New Columns in `relationships` Table

```sql
ALTER TABLE relationships ADD COLUMN relation_type TEXT DEFAULT '';
-- e.g. "mother", "father", "sibling", "spouse", "child", "grandparent"
ALTER TABLE relationships ADD COLUMN birth_year TEXT DEFAULT '';
ALTER TABLE relationships ADD COLUMN death_year TEXT DEFAULT '';
ALTER TABLE relationships ADD COLUMN notes TEXT DEFAULT '';
```

### Family Tree Extraction Prompt (separate from main extraction)

```
Extract all relatives mentioned. For each, return:
{
  "relatives": [
    {
      "name": "string",
      "relation": "mother|father|sibling|spouse|child|grandparent|aunt|uncle|cousin|other",
      "birth_year": "string or ''",
      "birthplace": "string or ''",
      "death_year": "string or ''",
      "notes": "string or ''"
    }
  ]
}
Return {"relatives": []} if no relatives mentioned.
```

---

## New Feature: Emotion Detection — Layered Approach

### Layer 1: Client-Side (face-api.js) — Real-Time

**Library:** face-api.js (MIT licence, ~6MB total with models)
**Runs:** Entirely in browser, WebGL-accelerated, no server round-trip
**Output:** 7 raw emotions (happy, sad, fearful, angry, surprised, disgusted, neutral) → mapped to 6 Lorevox affect states (same as existing: steady, engaged, reflective, moved, distressed, overwhelmed)
**Offline:** Models vendored locally at `ui/vendor/face-api/`

**How it integrates:**
- Replaces the existing MediaPipe WASM approach (same affect state output, different detection library)
- Same 2s sustain + 3s debounce before posting to backend
- Same affect event API (`POST /api/interview/affect-event`)
- Lori avatar ring colour updates in real-time (client-side only, no backend call for display)

**Why face-api.js over MediaPipe for v7.0:**
- Simpler emotion model (no face mesh geometry needed)
- Smaller bundle (6MB vs MediaPipe's full suite)
- Better offline story (all model files vendored)
- Sufficient accuracy for interview affect sensing (not clinical)

### Layer 2: Server-Side (DeepFace + RTX 5080) — Deep Analysis

**Library:** DeepFace (`pip install deepface`)
**Runs:** On the server, GPU-accelerated via `tf-gpu` or `torch`
**Trigger:** Browser sends a JPEG frame to `POST /api/emotion/frame` every 5 seconds
**Output:** More precise emotion + additional signals (eye openness, head pose, micro-expressions)
**Use case:** Confirming distress signals, feeding into safety system, session emotion arc

**New endpoint:** `POST /api/emotion/frame`
```python
# Accepts: multipart/form-data with image/jpeg frame
# Returns: {"affect_state": "distressed", "confidence": 0.84, "raw": {...}}
```

**New file:** `server/code/api/routers/emotion.py`

**New dependency (add to requirements.blackwell.txt):**
```
deepface>=0.0.93
```

### Emotion → Safety Integration

When DeepFace returns `affect_state: "distressed"` with confidence >0.75 AND the transcript in the same window contains no verbal distress indicators, Lori receives a silent nudge in her system prompt:

```
[AFFECT NOTE: subject's facial expression suggests distress — proceed gently, do not push on current topic]
```

This is the first version of Lorevox where **non-verbal signals can trigger a safety-aware response** without the person having to say anything.

---

## Offline-First Architecture

### The Human Reason This Matters

The people Lorevox is built for — older adults telling their life stories — should never have to think about WiFi, cloud services, or whether their memories are going somewhere they didn't authorise. Many of them don't have reliable internet. Many don't understand what "the cloud" means and shouldn't need to. Lori should work the way a lamp works: you plug it in and it's on. No connection required. No accounts. No subscriptions. Their stories stay on their machine, in their home, forever.

This is not a technical feature. It is a commitment to the people using it.

---

### What "Fully Offline" Means for v7.0

After one-time setup (internet required once), the entire system runs permanently air-gapped:

- Server starts in under 60 seconds with no network calls
- Browser UI loads with no external requests (no CDN, no fonts from Google, nothing)
- All three AI models (LLM, STT, TTS) load from local disk
- Both emotion detection systems (face-api.js client, DeepFace server) load from local files
- `pip install` is never needed after setup — all wheels cached locally
- The database never leaves the machine
- No telemetry, no analytics, no usage pings — ever

---

### Model 1 — LLM (Llama 3.1-8B, ~16GB)

**Downloads on first run to:** `~/.cache/huggingface/hub/models--meta-llama--Meta-Llama-3.1-8B-Instruct/`

**4 files that must be present:**
```
model-00001-of-00004.safetensors   ~4.98 GB
model-00002-of-00004.safetensors   ~5.00 GB
model-00003-of-00004.safetensors   ~4.92 GB
model-00004-of-00004.safetensors   ~1.17 GB
```

**To confirm cached (run in WSL2):**
```bash
python scripts/check_model_cached.py
# Output: ✓ LLM: all 4 shards present (16.07 GB)
```

**To go offline after confirming:**
```bash
# In .env:
LLM_LOCAL_ONLY=true
```

**Code change in LLM loader (`server/code/api/api.py` or wherever transformers is called):**
```python
local_files_only = os.getenv("LLM_LOCAL_ONLY", "false").lower() == "true"
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    local_files_only=local_files_only,
    ...
)
```

---

### Model 2 — Whisper STT (large-v3, ~3GB)

**Downloads on first run to:** `~/.cache/huggingface/hub/models--openai--whisper-large-v3/`

**Files that must be present:**
```
model.safetensors   ~3.09 GB
config.json
tokenizer files (several small JSONs)
```

**To confirm cached:**
```bash
python scripts/check_model_cached.py
# Output: ✓ Whisper: model.safetensors present (3.09 GB)
```

**Code change in STT loader:**
```python
local_files_only = os.getenv("LLM_LOCAL_ONLY", "false").lower() == "true"
# Whisper uses the same flag — both are HuggingFace models
model = WhisperForConditionalGeneration.from_pretrained(
    "openai/whisper-large-v3",
    local_files_only=local_files_only,
)
```

---

### Model 3 — TTS (Coqui VITS p335, ~100MB)

**Downloads on first run to:** `~/.local/share/tts/tts_models--en--vctk--vits/`

**Files that must be present:**
```
model_file.pth      ~95 MB
config.json
speaker_ids.json
```

**To confirm cached:**
```bash
python scripts/check_model_cached.py
# Output: ✓ TTS: model_file.pth present (95 MB)
```

**Code change in TTS server (`server/tts_server.py` or equivalent):**
```python
# TTS (Coqui) respects the same pattern — check local path before downloading
tts = TTS(model_name="tts_models/en/vctk/vits", progress_bar=False)
# Coqui caches automatically; to force local-only, check path exists first:
if not Path(tts_model_path).exists():
    raise RuntimeError("TTS model not cached. Run setup with internet first.")
```

---

### Model 4 — Emotion Detection Client (face-api.js, ~6MB)

**Not downloaded at runtime — vendored into the repo at setup time.**

**Files vendored to `ui/vendor/face-api/`:**
```
face-api.min.js                          ~900 KB
weights/
  tiny_face_detector_model-weights_manifest.json
  tiny_face_detector_model-shard1         ~190 KB
  face_expression_model-weights_manifest.json
  face_expression_model-shard1            ~310 KB
```

**Download script (run once, internet required):**
```bash
bash scripts/vendor_assets.sh
# Downloads face-api.js and model weights to ui/vendor/face-api/
# Also downloads Bootstrap and Inter font
```

After this, the browser loads everything from `http://localhost:8000/ui/vendor/` — no outbound requests.

---

### Model 5 — Emotion Detection Server (DeepFace, ~700MB)

**Downloads on first use to:** `~/.deepface/weights/`

**Models used (VGG-Face for accuracy on RTX 5080):**
```
vgg_face_weights.h5    ~574 MB
age_model_weights.h5   ~95 MB   (if age estimation enabled)
```

**To pre-download before going offline:**
```bash
source .venv-gpu/bin/activate
python scripts/prefetch_deepface.py
# Output: ✓ DeepFace: VGG-Face weights present (574 MB)
```

**New file: `scripts/prefetch_deepface.py`**
```python
from deepface import DeepFace
# Force a warmup analysis on a blank image to trigger model download
import numpy as np
blank = np.zeros((224, 224, 3), dtype=np.uint8)
try:
    DeepFace.analyze(blank, actions=["emotion"], enforce_detection=False, silent=True)
    print("✓ DeepFace: VGG-Face weights cached")
except Exception as e:
    print(f"✗ DeepFace prefetch failed: {e}")
```

**`.env` flag:**
```
DEEPFACE_ENABLED=true
```

---

### Pip Wheel Cache (Python packages, offline install)

If setting up on a new machine with no internet, `pip install` will fail. The solution is a local wheel cache — downloaded once on an internet-connected machine, bundled with the repo or on a USB drive.

**Step 1 — Download all wheels (internet-connected machine):**
```bash
# In WSL2, with internet:
source .venv-gpu/bin/activate
pip download -r server/requirements.blackwell.txt -d ./pip-cache/gpu/
pip download -r server/requirements.tts.txt -d ./pip-cache/tts/
echo "✓ Wheel cache ready — $(du -sh pip-cache | cut -f1) total"
```

**Step 2 — Install from cache (offline machine):**
```bash
pip install --no-index --find-links=./pip-cache/gpu/ -r server/requirements.blackwell.txt
pip install --no-index --find-links=./pip-cache/tts/ -r server/requirements.tts.txt
```

**New `.gitignore` entry:**
```
pip-cache/    # Too large for git — copy manually or via USB
```

**New file: `scripts/download_wheels.sh`**
```bash
#!/bin/bash
# Run once with internet to pre-download all Python packages for offline install
set -e
source .venv-gpu/bin/activate
pip download -r server/requirements.blackwell.txt -d ./pip-cache/gpu/
pip download -r server/requirements.tts.txt -d ./pip-cache/tts/
echo "✓ Wheel cache complete: $(du -sh pip-cache)"
```

---

### UI Vendor Assets (Bootstrap, Fonts, face-api.js)

**New file: `scripts/vendor_assets.sh`**
```bash
#!/bin/bash
# Run once with internet to bundle all UI assets for offline use
set -e
mkdir -p ui/vendor/bootstrap ui/vendor/fonts ui/vendor/face-api/weights

# Bootstrap 5.3
curl -sL https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css \
  -o ui/vendor/bootstrap/bootstrap.min.css
curl -sL https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js \
  -o ui/vendor/bootstrap/bootstrap.bundle.min.js

# Inter variable font (woff2)
curl -sL https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2 \
  -o ui/vendor/fonts/inter-variable.woff2

# face-api.js
curl -sL https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js \
  -o ui/vendor/face-api/face-api.min.js

# face-api model weights
BASE="https://github.com/justadudewhohacks/face-api.js/raw/master/weights"
for f in tiny_face_detector_model-weights_manifest.json \
          tiny_face_detector_model-shard1 \
          face_expression_model-weights_manifest.json \
          face_expression_model-shard1; do
  curl -sL "$BASE/$f" -o "ui/vendor/face-api/weights/$f"
done

echo "✓ All UI vendor assets downloaded"
echo "  $(du -sh ui/vendor)"
```

---

### `check_model_cached.py` — Full Implementation

**New file: `scripts/check_model_cached.py`**

```python
#!/usr/bin/env python3
"""
check_model_cached.py
Verifies all required model files are locally cached.
Returns exit code 0 if all present, 1 if any missing.
Run before going offline.
"""
import os
import sys
from pathlib import Path

HF_CACHE = Path(os.getenv("HF_HOME", Path.home() / ".cache" / "huggingface" / "hub"))
TTS_CACHE = Path(os.getenv("TTS_HOME", Path.home() / ".local" / "share" / "tts"))
DEEPFACE_CACHE = Path(os.getenv("DEEPFACE_HOME", Path.home() / ".deepface" / "weights"))

CHECKS = [
    # (label, path_glob_or_file, min_size_mb)
    ("LLM shard 1", HF_CACHE / "models--meta-llama--Meta-Llama-3.1-8B-Instruct" / "**" / "model-00001-of-00004.safetensors", 4000),
    ("LLM shard 2", HF_CACHE / "models--meta-llama--Meta-Llama-3.1-8B-Instruct" / "**" / "model-00002-of-00004.safetensors", 4000),
    ("LLM shard 3", HF_CACHE / "models--meta-llama--Meta-Llama-3.1-8B-Instruct" / "**" / "model-00003-of-00004.safetensors", 4000),
    ("LLM shard 4", HF_CACHE / "models--meta-llama--Meta-Llama-3.1-8B-Instruct" / "**" / "model-00004-of-00004.safetensors", 1000),
    ("Whisper large-v3", HF_CACHE / "models--openai--whisper-large-v3" / "**" / "model.safetensors", 3000),
    ("TTS VITS model", TTS_CACHE / "tts_models--en--vctk--vits" / "model_file.pth", 80),
    ("face-api.js", Path("ui/vendor/face-api/face-api.min.js"), 0),
    ("face-api weights", Path("ui/vendor/face-api/weights/face_expression_model-shard1"), 0),
    ("DeepFace VGG-Face", DEEPFACE_CACHE / "vgg_face_weights.h5", 500),
]

all_ok = True
for label, path, min_mb in CHECKS:
    matches = list(Path("/").glob(str(path).lstrip("/"))) if "**" in str(path) else ([path] if path.exists() else [])
    found = next((m for m in matches if m.stat().st_size > min_mb * 1024 * 1024), None) if matches else None
    if found:
        size_mb = found.stat().st_size / (1024 * 1024)
        print(f"  ✓ {label}: {size_mb:.0f} MB")
    else:
        print(f"  ✗ {label}: NOT FOUND (expected at {path})")
        all_ok = False

print()
if all_ok:
    print("✓ ALL MODELS CACHED — safe to go offline")
    sys.exit(0)
else:
    print("✗ SOME MODELS MISSING — stay connected and run server once to download")
    sys.exit(1)
```

---

### Complete Offline Setup Checklist

Run this checklist once on a machine with internet. After completing it, Lorevox runs forever with no connection required.

```
LOREVOX v7.0 — OFFLINE SETUP CHECKLIST
=======================================

STEP 1 — Clone and configure
[ ] git clone git@github.com:lorevox-hx/lorevox.git
[ ] cd lorevox
[ ] cp .env.example .env
[ ] Edit .env — set DATA_DIR, DB_NAME (defaults work for most installs)

STEP 2 — Create Python environments
[ ] python3 -m venv .venv-gpu
[ ] source .venv-gpu/bin/activate
[ ] pip install -r server/requirements.blackwell.txt
[ ] deactivate
[ ] python3 -m venv .venv-tts
[ ] source .venv-tts/bin/activate
[ ] pip install -r server/requirements.tts.txt
[ ] deactivate

STEP 3 — Download Python wheel cache (for future offline installs)
[ ] bash scripts/download_wheels.sh
[ ] Copy pip-cache/ to USB drive or second machine if needed

STEP 4 — Download UI vendor assets
[ ] bash scripts/vendor_assets.sh
[ ] Confirm: ui/vendor/bootstrap/, ui/vendor/fonts/, ui/vendor/face-api/ all exist

STEP 5 — First server start (downloads LLM + Whisper, ~16GB + ~3GB)
[ ] source .venv-gpu/bin/activate
[ ] bash scripts/bootstrap.sh           ← seeds DB, starts server
[ ] Wait for "Model loaded" in server log (can take 30-60 min on first run)
[ ] Say hi to Lori in the browser — confirm voice response plays

STEP 6 — Download TTS model (downloads ~100MB)
[ ] In a second terminal: source .venv-tts/bin/activate
[ ] python server/tts_server.py         ← first run downloads VITS weights
[ ] Wait for "TTS ready" in log

STEP 7 — Pre-download DeepFace weights (~700MB)
[ ] source .venv-gpu/bin/activate
[ ] python scripts/prefetch_deepface.py
[ ] Confirm: ✓ DeepFace: VGG-Face weights cached

STEP 8 — Verify everything cached
[ ] python scripts/check_model_cached.py
[ ] All items show ✓
[ ] Output: "ALL MODELS CACHED — safe to go offline"

STEP 9 — Enable offline mode
[ ] In .env: set LLM_LOCAL_ONLY=true
[ ] In .env: set DEEPFACE_ENABLED=true (if using emotion detection)
[ ] Save .env

STEP 10 — Test offline
[ ] Disconnect from WiFi / unplug ethernet
[ ] Restart both servers
[ ] Open http://localhost:8000/ui/7.0.html
[ ] Confirm page loads (no CDN requests failing)
[ ] Confirm Lori responds to a message
[ ] Confirm voice playback works
[ ] Confirm mic input works
[ ] (Optional) Enable camera — confirm emotion ring responds
[ ] Reconnect to internet when done testing

SETUP COMPLETE — Lorevox is fully offline.
The person using it never needs to think about the internet again.
```

---

### `.env` Reference — Offline-Related Keys

```bash
# ── Offline / Local-only ─────────────────────────────────────────
LLM_LOCAL_ONLY=true          # true after model download confirmed
DEEPFACE_ENABLED=true        # true after DeepFace weights confirmed

# ── Data paths ───────────────────────────────────────────────────
DATA_DIR=/mnt/c/lorevox_data # Where the DB and archive live
DB_NAME=lorevox.sqlite3

# ── HuggingFace cache (change only if you moved the cache) ───────
# HF_HOME=/custom/path/.cache/huggingface
# TTS_HOME=/custom/path/.local/share/tts
```

---

## Complete File Plan — v7.0

### New Files

| File | Purpose |
|------|---------|
| `ui/7.0.html` | New shell — tabbed layout + floating Lori panel |
| `ui/css/lori-panel.css` | Floating panel styles, collapsed/expanded states, mobile drawer |
| `ui/css/family-tree.css` | Family tree SVG/D3 styles |
| `ui/js/lori-panel.js` | Floating panel logic, expand/collapse, tab context-awareness |
| `ui/js/family-tree.js` | D3 tree renderer, node click → detail view |
| `ui/js/emotion-v2.js` | face-api.js wrapper → affect states (replaces emotion.js) |
| `ui/js/extraction-poll.js` | Polls /api/profiles/{id} every 8s → updates tab content live |
| `ui/vendor/` | All vendored assets (Bootstrap, fonts, face-api) |
| `server/code/api/extract_facts.py` | Chat→DB extraction pipeline |
| `server/code/api/routers/emotion.py` | DeepFace frame analysis endpoint |
| `server/code/api/routers/family_tree.py` | Family tree CRUD — relatives + relationships |
| `server/code/api/routers/memoir.py` | Memoir generation endpoint (SSE stream) |
| `scripts/check_model_cached.py` | Checks all model weights are locally cached |
| `scripts/vendor_assets.sh` | Downloads and bundles all UI vendor assets for offline use |

### Modified Files

| File | Change |
|------|--------|
| `server/code/api/db.py` | Add `relationships` table columns (relation_type, birth_year, death_year, notes) |
| `server/code/api/db.py` | Add `create_relative()`, `link_relative()` helpers |
| `server/code/api/db.py` | Add `_sanitise_dob()` — **already done 2026-03-11** |
| `server/code/api/db.py` | Add `ingest_basic_info_document(dict, create_relatives)` — **already done 2026-03-11** |
| `server/code/api/main.py` | Register `emotion`, `family_tree`, `memoir` routers |
| `server/code/api/main.py` | Auto-load `.env` on startup — **already done 2026-03-11** |
| `server/code/api/routers/chat_ws.py` | After each assistant turn, call `schedule_extraction()` |
| `server/code/api/prompt_composer.py` | Add `FAMILY_TREE_MODE` context injection |
| `server/code/api/prompt_composer.py` | Add `CURRENT_TAB` context injection |
| `server/code/api/prompt_composer.py` | Add logging on PROFILE_JSON parse failure — **already done 2026-03-11** |
| `server/code/api/safety.py` | Add `cognitive_distress` category — **already done 2026-03-11** |
| `.env` | Add `LLM_LOCAL_ONLY`, `DEEPFACE_ENABLED` flags |
| `requirements.blackwell.txt` | Add `deepface>=0.0.93` |
| `README.md` | Full rewrite for v7.0 |

### Deleted / Retired Files

| File | Reason |
|------|--------|
| `ui/6.1.html` | Replaced by `ui/7.0.html` (keep in git history) |
| `ui/js/interview.js` | Structured interview panel removed from primary UI |
| `ui/css/interview.css` | Structured interview styles no longer needed |
| `ui/js/emotion.js` | Replaced by `ui/js/emotion-v2.js` (face-api.js) |

---

## Database Schema Changes

### New Columns on `relationships`

```sql
ALTER TABLE relationships ADD COLUMN relation_type TEXT DEFAULT '';
ALTER TABLE relationships ADD COLUMN birth_year TEXT DEFAULT '';
ALTER TABLE relationships ADD COLUMN death_year TEXT DEFAULT '';
ALTER TABLE relationships ADD COLUMN notes TEXT DEFAULT '';
```

### New Table: `emotion_events`

```sql
CREATE TABLE IF NOT EXISTS emotion_events (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    session_id TEXT,
    affect_state TEXT NOT NULL,
    confidence REAL DEFAULT 0.0,
    source TEXT DEFAULT 'client',   -- 'client' (face-api) or 'server' (deepface)
    raw_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (person_id) REFERENCES people(id)
);
```

### Migration Strategy

`db.py` `init_db()` already uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern via try/except. New columns and tables are added there — safe to run on existing databases.

---

## Build Order (If Starting From Scratch)

Follow this sequence. Each phase produces something usable.

### Phase 0 — Foundation (Day 1 morning)

1. Clone repo, run `bootstrap.sh`, confirm smoke test passes
2. Verify 5-step smoke test green (create person → profile → interview/start → ingest_basic_info → fuzzy DOB)
3. Confirm `main.py` loads `.env` automatically
4. Set `LLM_LOCAL_ONLY=true` in `.env` after model download confirms cached

**Checkpoint:** Server starts in <30 seconds. All API endpoints respond.

### Phase 1 — Shell Layout (Day 1 afternoon)

Build `ui/7.0.html` with:
- Left sidebar (person switcher, basic nav)
- Tab bar (Profile, Family Tree, Timeline, Memoir)
- Floating Lori panel (right side, full height)
- WebSocket connection wired to existing `/api/chat/ws`
- Lori can chat — voice input and TTS output working
- Tab content areas are empty placeholders

**Checkpoint:** Chris can have a live voice conversation with Lori in the new layout.

### Phase 2 — Vendor Assets (Day 1 end)

1. Run `scripts/vendor_assets.sh` — downloads Bootstrap, Inter font, face-api.js + models
2. Update all `<link>`/`<script>` tags to point to `/ui/vendor/`
3. Confirm UI loads with no external network requests (test by disabling WiFi)

**Checkpoint:** Full UI runs offline.

### Phase 3 — Chat→DB Extraction (Day 2)

1. Write `server/code/api/extract_facts.py`
2. Wire it into `chat_ws.py` after each assistant turn
3. Build `ui/js/extraction-poll.js` — polls profile every 8s, updates Profile tab
4. Chris does a live interview pass — watch Profile tab fill in as he talks

**Checkpoint:** After a 10-minute chat with Lori, the Profile tab shows name, DOB, birthplace, and at least 2 family members — without Chris ever touching a form.

### Phase 4 — Family Tree Mode (Day 3)

1. Write `server/code/api/routers/family_tree.py`
2. Write family tree extraction in `extract_facts.py`
3. Add `create_relative()` and `link_relative()` to `db.py`
4. Build `ui/js/family-tree.js` — D3 SVG tree renderer
5. Wire Lori's family tree mode prompt to `prompt_composer.py`

**Checkpoint:** Chris says "let's do the family tree" — Lori leads the conversation — Family Tree tab shows nodes appearing as relatives are mentioned.

### Phase 5 — Emotion Detection Layer 1 (Day 4 morning)

1. Add `ui/vendor/face-api/` (models + JS already vendored in Phase 2)
2. Write `ui/js/emotion-v2.js` — face-api wrapper → affect states
3. Wire affect states to Lori avatar ring colour (client-side only)
4. Wire affect events to existing `/api/interview/affect-event` endpoint

**Checkpoint:** Camera opt-in button works. Lori's avatar ring changes colour in real time. Distressed affect state triggers softened mode in Lori's responses.

### Phase 6 — Emotion Detection Layer 2 (Day 4 afternoon)

1. `pip install deepface` in `.venv-gpu`
2. Write `server/code/api/routers/emotion.py`
3. Register in `main.py`
4. Add `emotion_events` table to `db.py init_db()`
5. Wire browser to send a frame every 5 seconds via `POST /api/emotion/frame`
6. Wire DeepFace result to `[AFFECT NOTE]` injection in `prompt_composer.py`

**Checkpoint:** Facial distress detected server-side without any verbal signal → Lori responds gently on next turn.

### Phase 7 — Memoir Generation (Day 5)

1. Write `server/code/api/routers/memoir.py` — SSE stream endpoint
2. Wire memoir tab in UI to poll/stream generation
3. Wire "Generate draft" button → streams narrative into Memoir tab

**Checkpoint:** After a full interview session, "Generate Memoir Draft" produces flowing prose in the Memoir tab.

### Phase 8 — Polish & Offline Packaging (Day 6)

1. Support-person/proxy mode (Bug G from 30-persona test)
2. Session pause/resume (Bug H)
3. Export: PDF memoir, printable family tree
4. `scripts/vendor_assets.sh` finalised and documented
5. `LEGION_SETUP.md` updated for v7.0
6. Full 30-persona test run against v7.0

---

## v7.0 Guiding Principles (Additions to Existing 10)

The existing 10 product principles (README.md) remain. v7.0 adds:

**11. Lori is always present, never a feature.** She is not a tab, a panel, or a mode. She is the constant. Everything else is what she's building.

**12. The face is part of the conversation.** With consent, emotion detection makes Lori a better listener. She reads what people feel, not just what they say.

**13. Offline is a right, not a premium.** A person's life story should not require a cloud subscription. Everything works on a local machine with no internet, forever.

**14. Relatives are real people.** Every family member Lori learns about gets a proper record in the database — not a text field. The family tree is a living structure, not a note.

---

## Open Questions Before Building

These need a decision before or during Phase 1:

1. **Lori panel width:** 320px fixed, or resizable? Resizable is nicer but adds complexity.
2. **Tab persistence:** Does switching tabs pause the conversation? (Recommendation: no — conversation continues regardless of active tab.)
3. **Family tree layout:** Top-down (subject at root) or generational (oldest at top)? Generational is more natural for memoir but harder to implement.
4. **Extraction model:** Use the same Llama 3.1-8B for extraction, or a smaller/faster model? Same model is simpler; a smaller model (e.g. 1B) would be faster and leave more VRAM for the main chat.
5. **DeepFace model size:** `VGG-Face` (large, accurate) vs `Facenet512` (smaller, fast). For RTX 5080, VGG-Face is fine.

---

## Current State of v6.3 Fixes (Carry Forward to v7.0)

These are already in the codebase and should be preserved:

| Fix | File | Date |
|-----|------|------|
| `update_profile_json(reason="")` param | db.py | Earlier session |
| `count_plan_questions()` + 503 guard | db.py, interview.py | Earlier session |
| NDJSON TTS parsing (`wav_b64`) | ui/js/app.js | Earlier session |
| Persistent `_ttsAudio` element | ui/js/app.js | Earlier session |
| `_ensureRecognition()` singleton | ui/js/app.js | Earlier session |
| `_normalisePunctuation()` | ui/js/app.js | 2026-03-11 |
| `ingest_basic_info` dict + create_relatives | db.py | 2026-03-11 |
| DOB `_sanitise_dob()` validation | db.py | 2026-03-11 |
| `cognitive_distress` safety category | safety.py | 2026-03-11 |
| PROFILE_JSON parse failure logging | prompt_composer.py | 2026-03-11 |
| `main.py` auto-loads `.env` | main.py | 2026-03-11 |

---

*Lorevox v7.0 — local-first, privacy-first, human-first. Lori is the app.*
