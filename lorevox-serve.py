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
    http://localhost:8080/ui/lori9.0.html

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

# ── Template resolution ──────────────────────────────────────────────────────
# Templates are served at /templates/*.json.
# Resolution order:
#   1. DATA_DIR/templates/  (user data — editable, backed up with lorevox_data)
#   2. ui/templates/        (repo defaults — read-only fallback)
#
# This lets users add/edit templates in lorevox_data while repo defaults
# continue to work if DATA_DIR isn't set or file doesn't exist there yet.
_data_dir = os.environ.get("DATA_DIR", "")
if _data_dir:
    DATA_TEMPLATES = Path(_data_dir) / "templates"
else:
    # Try the default production path
    _default = Path("/mnt/c/lorevox_data/templates")
    DATA_TEMPLATES = _default if _default.is_dir() else None
REPO_TEMPLATES = ROOT / "ui" / "templates"


class LorevoxHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        """Override GET to resolve /templates/ from DATA_DIR first."""
        if self.path.startswith("/templates/"):
            # Strip query params for file lookup
            clean = self.path.split("?")[0]
            rel = clean[len("/templates/"):]  # e.g. "janice-josephine-horne.json"

            # Try DATA_DIR/templates/ first
            if DATA_TEMPLATES:
                data_file = DATA_TEMPLATES / rel
                if data_file.is_file():
                    self._serve_file(data_file)
                    return

            # Fall back to repo ui/templates/
            repo_file = REPO_TEMPLATES / rel
            if repo_file.is_file():
                self._serve_file(repo_file)
                return

            # Not found
            self.send_error(404, f"Template not found: {rel}")
            return

        # Also handle legacy /ui/templates/ path for backward compatibility
        if self.path.startswith("/ui/templates/"):
            clean = self.path.split("?")[0]
            rel = clean[len("/ui/templates/"):]

            # Try DATA_DIR/templates/ first (new canonical location)
            if DATA_TEMPLATES:
                data_file = DATA_TEMPLATES / rel
                if data_file.is_file():
                    self._serve_file(data_file)
                    return

            # Fall through to default handler (serves from repo ui/templates/)

        super().do_GET()

    def _serve_file(self, filepath: Path):
        """Serve a single file with correct headers."""
        import mimetypes
        content = filepath.read_bytes()
        mime = mimetypes.guess_type(str(filepath))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

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


class ReusableTCPServer(socketserver.TCPServer):
    """TCPServer with SO_REUSEADDR so port is immediately available after restart."""
    allow_reuse_address = True


if __name__ == "__main__":
    os.chdir(ROOT)
    print(f"Lorevox UI  -> http://localhost:{PORT}/ui/lori9.0.html")
    print(f"Serving from: {ROOT}")
    print("Press Ctrl+C to stop.\n")
    with ReusableTCPServer(("127.0.0.1", PORT), LorevoxHandler) as httpd:
        httpd.serve_forever()
