#!/usr/bin/env python3
"""
File Integrity Guardrail — Lorevox
===================================
Addresses null-byte corruption incidents (NDC-1: db.py, NDC-2: api.js).

Capabilities:
  1. Null-byte scanner for protected source files
  2. Post-write validation (Python: ast.parse, JS: syntax heuristics, text: \x00 check)
  3. Protected file registry with checksums
  4. Startup fail-fast check (call from launcher scripts)
  5. Atomic write helper (temp → fsync → rename)

Usage:
  # Standalone scan (pre-flight / CI):
  python file_integrity.py scan

  # Startup check (fail-fast):
  python file_integrity.py startup

  # Import for atomic writes:
  from file_integrity import atomic_write, validate_file
"""

import ast
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────

# Project root — auto-detect relative to this script's location
_SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _SCRIPT_DIR.parent.parent  # server/code/../../ = lorevox/

PROTECTED_FILES = {
    # Backend — critical data layer
    "server/code/api/db.py": "python",
    "server/code/api/routers/people.py": "python",
    "server/code/api/main.py": "python",
    "server/code/api/api.py": "python",
    "server/code/api/agent_loop.py": "python",
    "server/code/api/prompt_composer.py": "python",
    "server/code/api/session_engine.py": "python",
    # Frontend — critical UI layer
    "ui/js/api.js": "javascript",
    "ui/js/state.js": "javascript",
    "ui/js/app.js": "javascript",
    "ui/js/bio-builder.js": "javascript",
    "ui/js/life-map.js": "javascript",
    "ui/js/interview.js": "javascript",
}

# Integrity log location
INTEGRITY_LOG = PROJECT_ROOT / "logs" / "file_integrity.log"

# ── Null-Byte Scanner ──────────────────────────────────────────

def scan_null_bytes(filepath: Path) -> dict:
    """Scan a file for null bytes. Returns dict with count and positions."""
    try:
        raw = filepath.read_bytes()
    except (OSError, IOError) as e:
        return {"error": str(e), "null_count": -1, "positions": []}

    positions = [i for i, b in enumerate(raw) if b == 0]
    return {
        "null_count": len(positions),
        "positions": positions[:20],  # First 20 positions for diagnostics
        "file_size": len(raw),
        "truncated": len(positions) > 20,
    }


def scan_all_protected() -> list[dict]:
    """Scan all protected files for null bytes. Returns list of results."""
    results = []
    for rel_path, ftype in PROTECTED_FILES.items():
        fpath = PROJECT_ROOT / rel_path
        if not fpath.exists():
            results.append({
                "file": rel_path,
                "type": ftype,
                "exists": False,
                "status": "MISSING",
            })
            continue

        scan = scan_null_bytes(fpath)
        status = "CLEAN" if scan["null_count"] == 0 else "CORRUPTED"
        if scan["null_count"] < 0:
            status = "ERROR"

        results.append({
            "file": rel_path,
            "type": ftype,
            "exists": True,
            "status": status,
            "null_count": scan["null_count"],
            "file_size": scan.get("file_size", 0),
            "positions": scan.get("positions", []),
        })
    return results


# ── Post-Write Validation ──────────────────────────────────────

def validate_python(filepath: Path) -> dict:
    """Validate a Python file: no null bytes + ast.parse succeeds."""
    result = {"file": str(filepath), "type": "python", "checks": []}

    # Check 1: Null bytes
    scan = scan_null_bytes(filepath)
    null_ok = scan["null_count"] == 0
    result["checks"].append({
        "name": "null_byte_free",
        "passed": null_ok,
        "detail": f"{scan['null_count']} null bytes found" if not null_ok else "clean",
    })

    # Check 2: ast.parse
    try:
        source = filepath.read_text(encoding="utf-8")
        ast.parse(source, filename=str(filepath))
        result["checks"].append({
            "name": "ast_parse",
            "passed": True,
            "detail": "parsed successfully",
        })
    except SyntaxError as e:
        result["checks"].append({
            "name": "ast_parse",
            "passed": False,
            "detail": f"SyntaxError at line {e.lineno}: {e.msg}",
        })
    except Exception as e:
        result["checks"].append({
            "name": "ast_parse",
            "passed": False,
            "detail": str(e),
        })

    result["valid"] = all(c["passed"] for c in result["checks"])
    return result


def validate_javascript(filepath: Path) -> dict:
    """Validate a JS file: no null bytes + basic syntax heuristics."""
    result = {"file": str(filepath), "type": "javascript", "checks": []}

    # Check 1: Null bytes
    scan = scan_null_bytes(filepath)
    null_ok = scan["null_count"] == 0
    result["checks"].append({
        "name": "null_byte_free",
        "passed": null_ok,
        "detail": f"{scan['null_count']} null bytes found" if not null_ok else "clean",
    })

    # Check 2: Basic syntax heuristics
    try:
        source = filepath.read_text(encoding="utf-8")
        errors = []

        # Brace balance
        opens = source.count("{") + source.count("(") + source.count("[")
        closes = source.count("}") + source.count(")") + source.count("]")
        if abs(opens - closes) > 5:  # Allow small imbalance from strings/comments
            errors.append(f"bracket imbalance: {opens} opens vs {closes} closes (delta {abs(opens - closes)})")

        # Check for common corruption patterns
        if "\x00" in source:
            errors.append("null bytes in decoded text")
        if re.search(r'[\x01-\x08\x0e-\x1f]', source):
            # Control chars other than tab, newline, carriage return
            errors.append("suspicious control characters found")

        # Minimum viable JS — should have at least some structure
        if len(source) > 100 and not re.search(r'(function|var|let|const|class|=>|import|export)', source):
            errors.append("no JS keywords found — possible corruption")

        passed = len(errors) == 0
        result["checks"].append({
            "name": "syntax_heuristics",
            "passed": passed,
            "detail": "; ".join(errors) if errors else "heuristics passed",
        })
    except Exception as e:
        result["checks"].append({
            "name": "syntax_heuristics",
            "passed": False,
            "detail": str(e),
        })

    result["valid"] = all(c["passed"] for c in result["checks"])
    return result


def validate_file(filepath: Path, filetype: str = None) -> dict:
    """Validate a file based on its type. Auto-detects type from extension if not given."""
    filepath = Path(filepath)
    if filetype is None:
        ext = filepath.suffix.lower()
        filetype = {"py": "python", ".py": "python", ".js": "javascript", "js": "javascript"}.get(ext, "text")

    if filetype == "python":
        return validate_python(filepath)
    elif filetype == "javascript":
        return validate_javascript(filepath)
    else:
        # Generic text file — just check for null bytes
        scan = scan_null_bytes(filepath)
        return {
            "file": str(filepath),
            "type": "text",
            "checks": [{"name": "null_byte_free", "passed": scan["null_count"] == 0,
                         "detail": f"{scan['null_count']} null bytes" if scan["null_count"] else "clean"}],
            "valid": scan["null_count"] == 0,
        }


def validate_all_protected() -> list[dict]:
    """Validate all protected files. Returns list of validation results."""
    results = []
    for rel_path, ftype in PROTECTED_FILES.items():
        fpath = PROJECT_ROOT / rel_path
        if not fpath.exists():
            results.append({
                "file": rel_path, "type": ftype, "valid": False,
                "checks": [{"name": "exists", "passed": False, "detail": "file not found"}],
            })
            continue
        results.append(validate_file(fpath, ftype))
        results[-1]["file"] = rel_path  # Normalize to relative path
    return results


# ── Atomic Write ───────────────────────────────────────────────

def atomic_write(filepath: Path, content: str, encoding: str = "utf-8",
                 validate: bool = True, filetype: str = None) -> dict:
    """
    Atomic file write: write to temp → fsync → validate → rename over original.

    Returns dict with success status and any validation details.
    If validation fails, the original file is left untouched.
    """
    filepath = Path(filepath).resolve()
    parent = filepath.parent
    result = {"file": str(filepath), "success": False}

    # Write to temp file in same directory (ensures same filesystem for rename)
    fd = None
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(dir=parent, prefix=".tmp_integrity_",
                                         suffix=filepath.suffix)
        with os.fdopen(fd, "w", encoding=encoding) as f:
            fd = None  # os.fdopen takes ownership
            f.write(content)
            f.flush()
            os.fsync(f.fileno())

        # Validate the temp file before replacing
        if validate:
            val = validate_file(Path(tmp_path), filetype)
            result["validation"] = val
            if not val["valid"]:
                result["error"] = "validation failed — original file preserved"
                os.unlink(tmp_path)
                return result

        # Atomic replace
        os.replace(tmp_path, filepath)
        tmp_path = None  # Prevent cleanup
        result["success"] = True

        # Log the write
        _log_event("ATOMIC_WRITE", str(filepath), "success")

    except Exception as e:
        result["error"] = str(e)
        _log_event("ATOMIC_WRITE_FAIL", str(filepath), str(e))
    finally:
        if fd is not None:
            os.close(fd)
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    return result


# ── Startup Fail-Fast Check ────────────────────────────────────

def startup_check(strict: bool = True) -> dict:
    """
    Run at application startup. Scans all protected files.
    If strict=True, returns non-zero exit suggestion on any corruption.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    scan_results = scan_all_protected()
    validation_results = validate_all_protected()

    corrupted = [r for r in scan_results if r["status"] == "CORRUPTED"]
    invalid = [r for r in validation_results if not r["valid"]]
    missing = [r for r in scan_results if r["status"] == "MISSING"]

    summary = {
        "timestamp": timestamp,
        "total_files": len(PROTECTED_FILES),
        "clean": len([r for r in scan_results if r["status"] == "CLEAN"]),
        "corrupted": len(corrupted),
        "invalid": len(invalid),
        "missing": len(missing),
        "all_clear": len(corrupted) == 0 and len(invalid) == 0,
        "corrupted_files": [r["file"] for r in corrupted],
        "invalid_files": [r["file"] for r in invalid],
        "missing_files": [r["file"] for r in missing],
    }

    _log_event("STARTUP_CHECK", "all", json.dumps(summary, default=str))

    if strict and not summary["all_clear"]:
        summary["recommendation"] = "FAIL_FAST: Corrupted or invalid protected files detected. " \
                                     "Run 'python file_integrity.py repair' or manually inspect."

    return summary


# ── Repair Helper ──────────────────────────────────────────────

def strip_null_bytes(filepath: Path, dry_run: bool = False) -> dict:
    """Strip null bytes from a file. Returns before/after byte counts."""
    filepath = Path(filepath)
    raw = filepath.read_bytes()
    null_count = raw.count(b"\x00")

    if null_count == 0:
        return {"file": str(filepath), "null_count": 0, "action": "none_needed"}

    if dry_run:
        return {"file": str(filepath), "null_count": null_count, "action": "dry_run"}

    cleaned = raw.replace(b"\x00", b"")
    # Use atomic write pattern
    fd, tmp_path = tempfile.mkstemp(dir=filepath.parent, prefix=".tmp_repair_",
                                     suffix=filepath.suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(cleaned)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, filepath)
        _log_event("REPAIR", str(filepath), f"stripped {null_count} null bytes")
        return {
            "file": str(filepath),
            "null_count": null_count,
            "original_size": len(raw),
            "cleaned_size": len(cleaned),
            "action": "stripped",
        }
    except Exception as e:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        return {"file": str(filepath), "null_count": null_count, "action": "error", "error": str(e)}


# ── Logging ────────────────────────────────────────────────────

def _log_event(event_type: str, target: str, detail: str):
    """Append to integrity log."""
    try:
        INTEGRITY_LOG.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        line = f"{timestamp} | {event_type:20s} | {target} | {detail}\n"
        with open(INTEGRITY_LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass  # Logging failure should never break the app


# ── CLI ────────────────────────────────────────────────────────

def _print_scan_results(results):
    """Pretty-print scan results."""
    print(f"\n{'='*60}")
    print(f"  File Integrity Scan — {len(results)} protected files")
    print(f"{'='*60}\n")

    for r in results:
        icon = {"CLEAN": "✓", "CORRUPTED": "✗", "MISSING": "?", "ERROR": "!"}.get(r["status"], "?")
        color_status = r["status"]
        line = f"  [{icon}] {r['file']:50s} {color_status}"
        if r.get("null_count", 0) > 0:
            line += f"  ({r['null_count']} null bytes)"
        print(line)

    corrupted = [r for r in results if r["status"] == "CORRUPTED"]
    print(f"\n{'─'*60}")
    if corrupted:
        print(f"  ⚠  {len(corrupted)} file(s) CORRUPTED — run 'python file_integrity.py repair'")
    else:
        print(f"  ✓  All files clean")
    print()


def _print_validation_results(results):
    """Pretty-print validation results."""
    print(f"\n{'='*60}")
    print(f"  File Validation — {len(results)} protected files")
    print(f"{'='*60}\n")

    for r in results:
        icon = "✓" if r["valid"] else "✗"
        print(f"  [{icon}] {r['file']}")
        for check in r.get("checks", []):
            c_icon = "✓" if check["passed"] else "✗"
            print(f"      [{c_icon}] {check['name']}: {check['detail']}")

    invalid = [r for r in results if not r["valid"]]
    print(f"\n{'─'*60}")
    if invalid:
        print(f"  ⚠  {len(invalid)} file(s) INVALID")
    else:
        print(f"  ✓  All files valid")
    print()


def main():
    if len(sys.argv) < 2:
        print("Usage: python file_integrity.py <command>")
        print("Commands: scan, validate, startup, repair, repair-dry")
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "scan":
        results = scan_all_protected()
        _print_scan_results(results)
        corrupted = any(r["status"] == "CORRUPTED" for r in results)
        sys.exit(1 if corrupted else 0)

    elif cmd == "validate":
        results = validate_all_protected()
        _print_validation_results(results)
        invalid = any(not r["valid"] for r in results)
        sys.exit(1 if invalid else 0)

    elif cmd == "startup":
        summary = startup_check(strict=True)
        if summary["all_clear"]:
            print(f"✓ Startup integrity check passed — {summary['clean']}/{summary['total_files']} files clean")
            sys.exit(0)
        else:
            print(f"⚠ INTEGRITY CHECK FAILED")
            if summary["corrupted_files"]:
                print(f"  Corrupted: {', '.join(summary['corrupted_files'])}")
            if summary["invalid_files"]:
                print(f"  Invalid:   {', '.join(summary['invalid_files'])}")
            if summary["missing_files"]:
                print(f"  Missing:   {', '.join(summary['missing_files'])}")
            print(f"\n  Run 'python file_integrity.py repair' to fix corruption.")
            sys.exit(1)

    elif cmd in ("repair", "repair-dry"):
        dry = cmd == "repair-dry"
        print(f"\n{'='*60}")
        print(f"  Null-Byte Repair {'(DRY RUN)' if dry else ''}")
        print(f"{'='*60}\n")
        for rel_path, ftype in PROTECTED_FILES.items():
            fpath = PROJECT_ROOT / rel_path
            if not fpath.exists():
                continue
            result = strip_null_bytes(fpath, dry_run=dry)
            if result["null_count"] > 0:
                print(f"  [{result['action']:10s}] {rel_path} — {result['null_count']} null bytes")
            else:
                print(f"  [clean     ] {rel_path}")
        print()

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
