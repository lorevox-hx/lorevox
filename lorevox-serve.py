#!/usr/bin/env python3
"""
Lorevox local UI server — v7.4B
=================================
Required for reliable camera + WASM operation.

Cross-origin isolation (COOP/COEP) headers enable:
  - SharedArrayBuffer (multi-threaded WASM execution path)
  - Consistent camera permission grants under localhost origin
  - Reliable MediaPipe WASM loading across machines and browsers

Run:
    python lorevox-serve.py

Then open:
    http://localhost:8000/ui/lori7.3.html

file:// may still open the UI on some machines, but localhost is the
supported default for 7.4+ camera + WASM behavior.
"""

import http.server
import socketserver
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8000


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
        super().end_headers()

    def log_message(self, fmt, *args):
        # Suppress per-request noise; only log non-200 responses
        code = args[1] if len(args) > 1 else "?"
        if not str(code).startswith("2"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"Lorevox UI → http://localhost:{PORT}/ui/lori7.3.html")
    print(f"Serving from: {ROOT}")
    print("Press Ctrl+C to stop.\n")
    with socketserver.TCPServer(("127.0.0.1", PORT), LorevoxHandler) as httpd:
        httpd.serve_forever()
