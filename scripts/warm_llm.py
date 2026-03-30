#!/usr/bin/env python3
"""
scripts/warm_llm.py — Lorevox LLM warmup (v8.0)

Sends a minimal dummy message to the LLM backend via HTTP (SSE chat endpoint)
so that the model is fully loaded and cached before the first real user turn.

Exit codes:
  0 = success (model warm and generating)
  1 = backend not reachable / still loading (retry is worthwhile)
  2 = CUDA OOM or fatal error (retrying won't help — stop)

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
    "messages": [
        {"role": "system", "content": "You are a warmup test. Respond with one word."},
        {"role": "user",   "content": "hi"},
    ],
    "temp":     0.7,
    "max_new":  16,
    "conv_id":  "warmup-session",
}).encode()


def _ping() -> bool:
    """Return True if the backend is accepting connections."""
    try:
        req = urllib.request.Request(PING_URL, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def _warm() -> int:
    """
    POST to /api/chat/stream and inspect the response.

    Returns:
      0 = got real token data (model is warm)
      1 = connection/HTTP error (model still loading, retry ok)
      2 = CUDA OOM or fatal error (don't retry)
    """
    req = urllib.request.Request(
        CHAT_URL,
        data=DUMMY_PAYLOAD,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            # Read enough to see if we got real tokens or an OOM error
            data = b""
            while len(data) < 4096:
                chunk = resp.read(1024)
                if not chunk:
                    break
                data += chunk
                # Check early if we already have a done or error signal
                text = data.decode("utf-8", errors="replace")
                if '"CUDA_OOM"' in text or "out of memory" in text.lower():
                    print("[warm_llm] CUDA OOM detected — GPU memory exhausted.", file=sys.stderr)
                    return 2
                if '"delta"' in text:
                    # Got a real token — model is warm
                    return 0
                if '"done"' in text:
                    break

            text = data.decode("utf-8", errors="replace")
            if '"CUDA_OOM"' in text or "out of memory" in text.lower():
                print("[warm_llm] CUDA OOM detected — GPU memory exhausted.", file=sys.stderr)
                return 2
            if '"error"' in text:
                print(f"[warm_llm] Backend error: {text[:300]}", file=sys.stderr)
                return 2
            if '"delta"' in text:
                return 0
            # Got a response but no tokens — ambiguous
            print(f"[warm_llm] Unexpected response: {text[:200]}", file=sys.stderr)
            return 1

    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        print(f"[warm_llm] HTTP {e.code} from {CHAT_URL}: {e.reason} {body}", file=sys.stderr)
        if "out of memory" in body.lower() or "CUDA" in body:
            return 2
        return 1
    except Exception as e:
        print(f"[warm_llm] Connection error: {e}", file=sys.stderr)
        return 1


def main() -> int:
    print("[warm_llm] Checking LLM backend...")

    if not _ping():
        print(f"[warm_llm] Backend not reachable at {LLM_BASE} — skipping warmup.")
        return 1

    print(f"[warm_llm] Backend alive. Sending warmup turn to {CHAT_URL}...")
    result = _warm()
    if result == 0:
        print("[warm_llm] LLM warmed and ready.")
        return 0
    elif result == 2:
        print("[warm_llm] FATAL: CUDA OOM — model loaded but GPU cannot allocate inference memory.")
        print("[warm_llm] VRAM may have been freed. A second attempt might succeed.")
        return 2
    else:
        print("[warm_llm] Warmup request failed — model may still be loading.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
