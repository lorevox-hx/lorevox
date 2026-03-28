#!/usr/bin/env bash
# bootstrap.sh — One-shot DB initialisation for a fresh Lorevox install.
#
# Run this once after cloning (or any time you want to reset/refresh the DB).
# Safe to re-run — all inserts use INSERT OR IGNORE / INSERT OR REPLACE.
#
# Usage:
#   cd /mnt/c/Users/chris/lorevox
#   bash scripts/bootstrap.sh
#
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Load .env ────────────────────────────────────────────────────────────────
if [ -f "$REPO_DIR/.env" ]; then
    set -a
    source "$REPO_DIR/.env"
    set +a
    echo "[bootstrap] Loaded .env"
fi

export DATA_DIR="${DATA_DIR:-/mnt/c/lorevox_data}"
echo "[bootstrap] DATA_DIR=$DATA_DIR"

# ── Create data dirs ─────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR"/{db,voices,cache_audio,memory,projects,interview,logs}
echo "[bootstrap] Data dirs ready"

# ── Activate venv ────────────────────────────────────────────────────────────
source "$REPO_DIR/.venv-gpu/bin/activate"
echo "[bootstrap] venv-gpu activated"

# ── Step 1: Init DB schema ────────────────────────────────────────────────────
echo "[bootstrap] Initialising DB schema..."
python - <<'PYEOF'
import sys, os
sys.path.insert(0, os.path.join(os.environ.get("REPO_DIR", "."), "server"))
from code.api.db import init_db
init_db()
print("[bootstrap] DB schema OK")
PYEOF

# ── Step 2: Seed interview plan ───────────────────────────────────────────────
echo "[bootstrap] Seeding interview plan..."
python "$REPO_DIR/scripts/seed_interview_plan.py"

# ── Step 3: Verify ────────────────────────────────────────────────────────────
echo "[bootstrap] Verifying..."
python - <<'PYEOF'
import sys, os
sys.path.insert(0, os.path.join(os.environ.get("REPO_DIR", "."), "server"))
from code.api.db import count_plan_questions
n = count_plan_questions("default")
if n == 0:
    print("[bootstrap] ERROR: interview_questions is still empty after seeding.")
    sys.exit(1)
print(f"[bootstrap] Verified — {n} questions in plan 'default'")
PYEOF

deactivate
echo ""
echo "Bootstrap complete. You can now run the servers."
echo "  Terminal 1: bash launchers/run_gpu_8000.sh"
echo "  Terminal 2: bash launchers/run_tts_8001.sh"
