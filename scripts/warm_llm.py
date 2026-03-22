#!/usr/bin/env python3
"""
scripts/warm_llm.py — Lorevox LLM warmup (v7.4D)

Sends a minimal dummy message to the LLM backend via HTTP (SSE chat endpoint)
so that the model is fully loaded and cached before the first real user turn.

The script exits 0 on success, 1 on failure.
run_all_dev.sh calls this after the 8-second startup sleep and ignores failures
with a friendly message so a slow model load doesn't block the launcher.

Usage:
    python3 scripts/warm_llm.py
    LLM_BASE=http://localhost:8000 python3 scripts/warm_llm.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

LLM_BASE = os.getenv("LLM_BASE", "http://localhost:8000").rstrip("/")
CHAT_URL  = f"{LLM_BASE}/api/chat/stream"
PING_URL  = f"{LLM_BASE}/api/ping"

DUMMY_PAYLOAD = json.dumps({
    "conv_id":   "warmup-session",
    "person_id": None,
    "message":   "hi",
    "history":   [],
    "runtime71": {
        "current_pass":       "warmup",
        "current_era":        None,
        "current_mode":       "chat",
        "affect_state":       "neutral",
        "affect_confidence":  0.0,
        "cognitive_mode":     "active",
        "fatigue_score":      0.0,
        "paired":             False,
        "paired_speaker":     None,
        "visual_signals":     [],
        "assistant_role":     "interviewer",
    },
}).encode()


def _ping() -> bool:
    """Return True if the backend is accepting connections."""
    try:
        req = urllib.request.Request(PING_URL, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def _warm() -> bool:
    """
    POST to /api/chat/stream and consume at least one SSE token.
    Returns True if we got any response, False on network/HTTP error.
    """
    req = urllib.request.Request(
        CHAT_URL,
        data=DUMMY_PAYLOAD,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            # Read the first chunk — enough to confirm the model is loaded
            chunk = resp.read(512)
            return bool(chunk)
    except urllib.error.HTTPError as e:
        print(f"[warm_llm] HTTP {e.code} from {CHAT_URL}: {e.reason}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[warm_llm] Connection error: {e}", file=sys.stderr)
        return False


def main() -> int:
    print("[warm_llm] Checking LLM backend…")

    if not _ping():
        print(f"[warm_llm] Backend not reachable at {LLM_BASE} — skipping warmup.")
        return 1

    print(f"[warm_llm] Backend alive. Sending warmup turn to {CHAT_URL}…")
    ok = _warm()
    if ok:
        print("[warm_llm] ✓ LLM warmed and ready.")
        return 0
    else:
        print("[warm_llm] ✗ Warmup request failed — model may still be loading.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
