# Lorevox v4 — DB-first (UI Evolution)

## What you get
- **/ui/lorevox-v4.html** — 3-column UI (Sessions · Intake · Chat)
- **SQLite DB** — durable sessions + transcript turns + interview answers + interview pointer
- **Interview plan** — loads from `DATA_DIR/interview/interview_plan.json` and is imported into DB
- **Two-process runtime**
  - `:8000` Chat/API/UI
  - `:8001` TTS

## 1) Create data folder + init DB
From the `server/` folder:

```bash
export DATA_DIR="$HOME/lorevox_data"
mkdir -p "$DATA_DIR/interview"
cp ./data/interview/interview_plan.json "$DATA_DIR/interview/interview_plan.json"

python3 ./scripts/init_db.py
```

## 2) Run chat server (:8000)
```bash
cd server
# activate your LLM venv first
./scripts/run_chat.sh
```

Open UI:
- http://localhost:8000/ui/lorevox-v4.html

## 3) Run TTS server (:8001) in a second terminal
```bash
cd server
# activate your TTS venv first
./scripts/run_tts.sh
```

In the UI, click **Enable Audio** once (browser gesture), then TTS can play.

## Notes
- “Save to DB & Notify” uses **/api/session/put** then injects the saved baseline JSON into the next chat call.
- Transcript persistence is handled by your existing `/api/chat/stream` router (it calls `add_turn()`).
