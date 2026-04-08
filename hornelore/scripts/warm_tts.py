#!/usr/bin/env python3
"""
scripts/warm_tts.py — Hornelore TTS warmup

Sends a minimal dummy utterance to the TTS server so Coqui/VITS loads its
model weights into GPU/CPU memory before the first real speech request.
The first real TTS call is then fast instead of stalling for several seconds.

Exits 0 on success, 1 on failure.
run_all_dev.sh calls this after warm_llm.py and ignores failures.

Usage:
    python3 scripts/warm_tts.py
    TTS_BASE=http://localhost:8001 python3 scripts/warm_tts.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

TTS_BASE    = os.getenv("TTS_BASE", "http://localhost:8001").rstrip("/")
TTS_URL     = f"{TTS_BASE}/api/tts/speak_stream"
VOICES_URL  = f"{TTS_BASE}/api/tts/voices"

DUMMY_PAYLOAD = json.dumps({
    "text":  "hello",
    "voice": "lori",
}).encode()


def _ping() -> bool:
    """Return True if the TTS server is accepting connections."""
    try:
        req = urllib.request.Request(VOICES_URL, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def _warm() -> bool:
    """
    POST a tiny utterance to /api/tts/speak_stream.
    We just need to receive any bytes back — the wav_b64 chunk — to confirm
    the model finished loading and synthesized audio successfully.
    """
    req = urllib.request.Request(
        TTS_URL,
        data=DUMMY_PAYLOAD,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            chunk = resp.read(64)
            return bool(chunk)
    except urllib.error.HTTPError as e:
        body = e.read(256).decode(errors="replace")
        print(f"[warm_tts] HTTP {e.code}: {e.reason} — {body}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[warm_tts] Connection error: {e}", file=sys.stderr)
        return False


def main() -> int:
    print("[warm_tts] Checking TTS server…")

    if not _ping():
        print(f"[warm_tts] TTS not reachable at {TTS_BASE} — skipping warmup.")
        return 1

    print(f"[warm_tts] TTS server alive. Sending warmup utterance to {TTS_URL}…")
    print("[warm_tts] (Model load may take 10–60 s on first run — please wait)")
    ok = _warm()
    if ok:
        print("[warm_tts] ✓ TTS warmed and ready.")
        return 0
    else:
        print("[warm_tts] ✗ Warmup synthesis failed — TTS may still be loading.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
