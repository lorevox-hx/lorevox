#!/usr/bin/env python3
"""
Hornelore UI server — v1.0
=================================
Horne Family Archive — locked build based on Lorevox 9.0.

Port layout:
  8000  — LLM backend  (launchers/run_gpu_8000.sh)
  8001  — TTS server   (launchers/run_tts_8001.sh)
  8082  — Hornelore UI  (this file — uses 8082 to avoid conflict with Lorevox on 8080)

Run:
    python hornelore-serve.py

Then open:
    http://localhost:8082/ui/hornelore1.0.html
"""

import http.server
import socketserver
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8082

# ── Template resolution ──────────────────────────────────────────────────────
# Hornelore templates: hornelore_data/templates/ → ui/templates/ fallback
_data_dir = os.environ.get("HORNELORE_DATA_DIR", os.environ.get("DATA_DIR", ""))
if _data_dir:
    DATA_TEMPLATES = Path(_data_dir) / "templates"
else:
    _default = Path("/mnt/c/hornelore_data/templates")
    DATA_TEMPLATES = _default if _default.is_dir() else None
REPO_TEMPLATES = ROOT / "ui" / "templates"


class HorneloreHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        """Override GET to resolve /templates/ from DATA_DIR first."""
        if self.path.startswith("/templates/"):
            clean = self.path.split("?")[0]
            rel = clean[len("/templates/"):]

            if DATA_TEMPLATES:
                data_file = DATA_TEMPLATES / rel
                if data_file.is_file():
                    self._serve_file(data_file)
                    return

            repo_file = REPO_TEMPLATES / rel
            if repo_file.is_file():
                self._serve_file(repo_file)
                return

            self.send_error(404, f"Template not found: {rel}")
            return

        if self.path.startswith("/ui/templates/"):
            clean = self.path.split("?")[0]
            rel = clean[len("/ui/templates/"):]
            if DATA_TEMPLATES:
                data_file = DATA_TEMPLATES / rel
                if data_file.is_file():
                    self._serve_file(data_file)
                    return

        super().do_GET()

    def _serve_file(self, filepath: Path):
        import mimetypes
        content = filepath.read_bytes()
        mime = mimetypes.guess_type(str(filepath))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def end_headers(self):
        # Hornelore v1.0: skip cross-origin isolation headers for now.
        # The original Lorevox needed them for SharedArrayBuffer (MediaPipe WASM).
        # MediaPipe still works without them (single-threaded fallback).
        # This avoids browser COEP/COOP errors when API is on a different port.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        code = args[1] if len(args) > 1 else "?"
        if not str(code).startswith("2"):
            super().log_message(fmt, *args)


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"Hornelore UI -> http://localhost:{PORT}/ui/hornelore1.0.html")
    print(f"Serving from: {ROOT}")
    print("Press Ctrl+C to stop.\n")
    with ReusableTCPServer(("0.0.0.0", PORT), HorneloreHandler) as httpd:
        httpd.serve_forever()
