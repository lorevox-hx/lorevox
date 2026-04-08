#!/usr/bin/env python3
"""
scripts/warm_llm.py — Hornelore LLM warmup

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
WARMUP_URL = f"{LLM_BASE}/api/warmup"     # lightweight endpoint (no RAG/prompt bloat)
CHAT_URL   = f"{LLM_BASE}/api/chat/stream" # fallback if /api/warmup doesn't exist
PING_URL   = f"{LLM_BASE}/api/ping"

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


def _warm_lightweight() -> int:
    """Try the lightweight /api/warmup endpoint (no RAG, no prompt bloat).

    Returns: 0=warm, 1=retry, 2=OOM/fatal, -1=endpoint doesn't exist (fallback)
    """
    req = urllib.request.Request(
        WARMUP_URL,
        data=b"{}",
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=210) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            data = json.loads(body)
            if data.get("ok"):
                vram = data.get("vram_free_mb", "?")
                tokens = data.get("prompt_tokens", "?")
                print(f"[warm_llm] Warmup OK via /api/warmup "
                      f"(prompt_tokens={tokens}, VRAM_free={vram}MB, text={data.get('text', '')!r})")
                return 0
            return 1
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        if e.code == 404:
            return -1  # endpoint doesn't exist — fall back to chat/stream
        if e.code == 507 or "CUDA_OOM" in body or "out of memory" in body.lower():
            print(f"[warm_llm] CUDA OOM via /api/warmup: {body[:300]}", file=sys.stderr)
            return 2
        print(f"[warm_llm] HTTP {e.code} from {WARMUP_URL}: {body[:200]}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"[warm_llm] /api/warmup error: {e}", file=sys.stderr)
        return 1


def _warm_via_chat() -> int:
    """Fallback: POST to /api/chat/stream (heavier — full prompt composition).

    Returns: 0=warm, 1=retry, 2=OOM/fatal
    """
    req = urllib.request.Request(
        CHAT_URL,
        data=DUMMY_PAYLOAD,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
    )
    try:
        with urllib.request.urlopen(req, timeout=210) as resp:
            data = b""
            while len(data) < 4096:
                chunk = resp.read(1024)
                if not chunk:
                    break
                data += chunk
                text = data.decode("utf-8", errors="replace")
                if '"CUDA_OOM"' in text or "out of memory" in text.lower():
                    print("[warm_llm] CUDA OOM detected via chat/stream.", file=sys.stderr)
                    return 2
                if '"delta"' in text:
                    return 0
                if '"done"' in text:
                    break

            text = data.decode("utf-8", errors="replace")
            if '"CUDA_OOM"' in text or "out of memory" in text.lower():
                return 2
            if '"error"' in text:
                print(f"[warm_llm] Backend error: {text[:300]}", file=sys.stderr)
                return 2
            if '"delta"' in text:
                return 0
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


def _warm() -> int:
    """Try lightweight warmup first, fall back to chat/stream.

    Returns: 0=warm, 1=retry, 2=OOM/fatal
    """
    result = _warm_lightweight()
    if result == -1:
        print("[warm_llm] /api/warmup not available — falling back to /api/chat/stream")
        return _warm_via_chat()
    return result


def main() -> int:
    print("[warm_llm] ── Readiness check ──")
    print("[warm_llm]   State: checking process")

    if not _ping():
        print(f"[warm_llm]   State: process NOT reachable at {LLM_BASE}")
        print("[warm_llm]   Model shards may still be loading. This is normal for the first 1–2 minutes.")
        return 1

    print("[warm_llm]   State: API healthy — process running")
    print("[warm_llm]   State: model loading / sending warmup (timeout 210s)...")
    result = _warm()
    if result == 0:
        print("[warm_llm]   State: MODEL READY")
        print("[warm_llm] LLM warmed and ready.")
        return 0
    elif result == 2:
        print("[warm_llm]   State: CUDA OOM — model loaded but GPU cannot allocate inference memory.")
        print("[warm_llm] VRAM may have been freed. A second attempt might succeed.")
        return 2
    else:
        print("[warm_llm]   State: model still loading (warmup timed out or failed)")
        print("[warm_llm] Model is not ready yet — this can take 2–3 minutes on first load.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
