## Lorevox — Developer README

This repository contains Lorevox, a local-first interviewing system with an optional static website front-end.

Design priorities:
- Durable local sessions (return weeks/months later)
- Calm, deterministic interviewer behavior
- Clear separation between website hosting and local app runtime
- Data ownership and portability

---

## 1) Recommended repo layout


orevox/
README.md
README.DEV.md
public_html/ # website deployment target (Hostinger)
index.html
robots.txt
assets/
css/
js/
images/
server/ # optional local app stack (runs on a laptop/desktop)
code/
api/
tools/
ui/
requirements.blackwell.txt
requirements.tts.txt


### Hostinger deployment notes
- Upload **contents** of `public_html/` into Hostinger’s `public_html/` directory.
- Do NOT upload `server/` to Hostinger shared hosting (FastAPI/WebSockets/TTS usually require VPS or separate hosting).

---

## 2) Local app architecture (optional)

Typical local setup is a **two-process** design:

- **Port 8000** — FastAPI + WebSockets + sessions + SQLite (LLM / interview core)
- **Port 8001** — Text-to-Speech service (optional), isolated environment

Why two processes:
- prevents TTS from blocking token generation
- keeps GPU memory reserved for the LLM
- simplifies debugging and restart loops

---

## 3) Data model (baseline + interview)
Lorevox uses a baseline questionnaire to seed structured context:
- profile (name/birth info)
- family relationships
- narrative blocks (early years, school, career, etc.)

Recommended storage:
- SQLite DB inside `DATA_DIR` (local filesystem), WAL enabled
- optional export/import as JSON for portability

---

## 4) Persona: Lori (developer prompt spec)

Lori is designed for interview capture (not advice, not therapy, not debate).

Core rules:
- Ask one question at a time.
- Use short acknowledgements.
- Ask gentle follow-ups for clarity (who/where/when/what happened next).
- Do not correct the speaker’s facts; let them narrate.
- Prefer preserving raw narrative over summarizing.
- When the baseline profile exists, use it to personalize questions without inventing details.

Example “voice”:
- “Thank you. What do you remember most clearly about that day?”
- “Who was there with you?”
- “About what year would that have been?”

---

## 5) Environment variables (local app)
Common variables:
- `DATA_DIR` — where SQLite + memory artifacts live (recommended on Linux filesystem)
- `USE_TTS` — enable/disable TTS service integration

---

## 6) Build & run (local app example)
(Adjust paths for your environment.)

**Terminal A (API/LLM):**
```bash
fuser -k 8000/tcp || true
cd /path/to/lorevox/server
source .venv-blackwell/bin/activate

export USE_TTS=0
export DATA_DIR="/home/$USER/lorevox_data"

python -m uvicorn code.api.main:app --host 0.0.0.0 --port 8000

Terminal B (TTS optional):

fuser -k 8001/tcp || true
cd /path/to/lorevox/server
source .venv-tts/bin/activate

export USE_TTS=1
export DATA_DIR="/home/$USER/lorevox_data"
export TTS_MODEL="tts_models/en/vctk/vits"
export TTS_GPU=0
export TTS_SPEAKER_LORI="p335"

python -m uvicorn code.api.main:app --host 0.0.0.0 --port 8001

7) Deployment guidance

Static website → Hostinger shared hosting (upload public_html/)

Local app → runs on a laptop/desktop

Remote app hosting (if needed later) → VPS or a platform that supports WebSockets + Python services

8) Roadmap (practical)

Baseline Intake tab → SQLite save/load

Interview tab → inject baseline summary into interviewer context

RAG layer → retrieve narrative chunks from transcripts + baseline

Export → JSON + printable PDF baseline summary
