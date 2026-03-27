#!/usr/bin/env python3
"""
Lorevox local UI server — v7.5
=================================
Required for reliable camera + WASM operation.

Cross-origin isolation (COOP/COEP) headers enable:
  - SharedArrayBuffer (multi-threaded WASM execution path)
  - Consistent camera permission grants under localhost origin
  - Reliable MediaPipe WASM loading across machines and browsers

Port layout:
  8000  — LLM backend  (launchers/run_gpu_8000.sh)
  8001  — TTS server   (launchers/run_tts_8001.sh)
  8080  — UI server    (this file)

Run:
    python lorevox-serve.py

Then open:
    http://localhost:8080/ui/lori7.4c.html

Or use the single launcher to start all three services at once:
    bash launchers/run_all_dev.sh

file:// will NOT work reliably for camera + WASM. Always use localhost:8080.
"""

import http.server
import socketserver
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8080


class LorevoxHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Cross-origin isolation — required for SharedArrayBuffer + multi-threaded WASM
        self.send_header("Cross-Origin-Opener-Policy",   "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        # Dev: prevent browser caching of JS/CSS so patched files take effect on reload
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Suppress per-request noise; only log non-200 responses
        code = args[1] if len(args) > 1 else "?"
        if not str(code).startswith("2"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"Lorevox UI  -> http://localhost:{PORT}/ui/lori8.0.html")
    print(f"Classic UI  -> http://localhost:{PORT}/ui/lori7.4c.html")
    print(f"Serving from: {ROOT}")
    print("Press Ctrl+C to stop.\n")
    with socketserver.TCPServer(("127.0.0.1", PORT), LorevoxHandler) as httpd:
        httpd.serve_forever()
