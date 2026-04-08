#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_DIR = Path("/mnt/c/Users/chris/lorevox")
UI_URL = "http://127.0.0.1:8080/ui/lori9.0.html"
HEADLESS = False

# Template resolution: DATA_DIR/templates/ first, then repo ui/templates/
_data_dir = os.environ.get("DATA_DIR", "/mnt/c/lorevox_data")
_data_tpl = Path(_data_dir) / "templates" / "kent-james-horne.json"
_repo_tpl = REPO_DIR / "ui" / "templates" / "kent-james-horne.json"
JSON_PATH = _data_tpl if _data_tpl.exists() else _repo_tpl

def fail(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)

def main() -> None:
    if not JSON_PATH.exists():
        fail(f"Template not found: {JSON_PATH}")

    try:
        tpl = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"Failed to parse JSON template: {exc}")

    narrator = tpl.get("_narrator") or tpl.get("personal", {}).get("fullName") or "Unknown Narrator"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        page = browser.new_page()
        page.set_default_timeout(45000)

        try:
            print(f"[import] Opening UI: {UI_URL}")
            page.goto(UI_URL, wait_until="domcontentloaded")

            page.wait_for_function(
                "() => typeof window.lv80PreloadNarrator === 'function'",
                timeout=45000
            )

            page.wait_for_function(
                """async () => {
                    try {
                      const r = await fetch((window.API && window.API.PING) || 'http://localhost:8000/api/ping');
                      return !!r.ok;
                    } catch (_) { return false; }
                }""",
                timeout=45000,
            )

            print(f"[import] Preloading narrator: {narrator}")
            result = page.evaluate(
                """async (tpl) => {
                    const out = await window.lv80PreloadNarrator(tpl);
                    const pid =
                      (typeof out === "string" ? out : null) ||
                      (out && (out.person_id || out.pid || out.id || null));
                    const qqKey = pid ? ("lorevox_qq_draft_" + pid) : null;
                    const qqRaw = qqKey ? localStorage.getItem(qqKey) : null;
                    return {
                      out,
                      pid,
                      qqKey,
                      hasQuestionnaire: !!qqRaw
                    };
                }""",
                tpl,
            )

            pid = result.get("pid")
            if not pid:
                fail(f"Preload did not return a person id. Raw result: {result.get('out')}")

            print("[import] Success")
            print(f"[import] Narrator: {narrator}")
            print(f"[import] Person ID: {pid}")
            print(f"[import] Questionnaire key: {result.get('qqKey')}")
            print(f"[import] Questionnaire stored: {result.get('hasQuestionnaire')}")
            print("")
            print("Next step:")
            print("1. In Hornelore, select Kent James Horne")
            print("2. Open Bio Builder")
            print("3. Confirm questionnaire fields are filled")
        finally:
            browser.close()

if __name__ == "__main__":
    main()
PY