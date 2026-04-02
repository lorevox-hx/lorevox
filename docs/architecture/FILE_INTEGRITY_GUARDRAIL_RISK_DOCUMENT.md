# Named Risk: Null-Byte File Corruption

**Risk ID:** RISK-INTEGRITY-001
**Date Identified:** 2026-03-28 (NDC-1, NDC-2 in NARRATOR_DELETE_CASCADE_BUG_LOG.md)
**Severity:** High (can silently corrupt critical source files)
**Status:** Mitigated (guardrails deployed 2026-03-30)

---

## Incident History

Two null-byte corruption events were logged during the Narrator Delete Cascade implementation:

| Bug ID | File | Null Bytes | Discovery Method | Fix |
|--------|------|------------|------------------|-----|
| NDC-1 | server/code/api/db.py | 1,955 | API server crash (SyntaxError) | `perl -i -pe 's/\x00//g'` |
| NDC-2 | ui/js/api.js | Unknown count | JS console errors | Same perl one-liner |

**Root cause:** Suspected partial write or tool-level corruption during automated file editing. The exact trigger was not conclusively identified, but the pattern suggests a write operation was interrupted or a buffer containing null bytes was flushed to disk.

---

## Guardrail: file_integrity.py

**Location:** `server/code/file_integrity.py`
**Type:** Standalone CLI tool + importable Python module

### Capabilities

| # | Capability | Description |
|---|-----------|-------------|
| 1 | **Null-byte scanner** | Scans all protected files for `\x00` bytes. Reports count and byte positions. |
| 2 | **Post-write validation** | Python files: `ast.parse()` — catches syntax corruption. JS files: bracket balance + control character detection + keyword presence heuristic. All files: null-byte check. |
| 3 | **Protected file registry** | 13 critical files across backend (7) and frontend (6) with type annotations for type-specific validation. |
| 4 | **Startup fail-fast** | `python file_integrity.py startup` — exits non-zero if any protected file is corrupted. Designed for integration into launcher scripts. |
| 5 | **Atomic writes** | `atomic_write(path, content)` — writes to temp file → fsync → validates → renames over original. If validation fails, original file is preserved. |
| 6 | **Repair** | `python file_integrity.py repair` — strips null bytes from corrupted files using the atomic write pattern. `repair-dry` for preview. |

### Protected Files

**Backend (Python — validated with ast.parse):**
- server/code/api/db.py
- server/code/api/routers/people.py
- server/code/api/main.py
- server/code/api/api.py
- server/code/api/agent_loop.py
- server/code/api/prompt_composer.py
- server/code/api/session_engine.py

**Frontend (JavaScript — validated with syntax heuristics):**
- ui/js/api.js
- ui/js/state.js
- ui/js/app.js
- ui/js/bio-builder.js
- ui/js/life-map.js
- ui/js/interview.js

### CLI Usage

```bash
# Pre-flight scan (CI or manual):
python server/code/file_integrity.py scan

# Full validation (ast.parse + heuristics):
python server/code/file_integrity.py validate

# Startup fail-fast (integrate into launcher):
python server/code/file_integrity.py startup

# Repair corrupted files:
python server/code/file_integrity.py repair-dry   # preview
python server/code/file_integrity.py repair        # execute
```

### Python API

```python
from file_integrity import atomic_write, validate_file, startup_check

# Atomic write with auto-validation:
result = atomic_write(Path("ui/js/app.js"), new_content, filetype="javascript")
if not result["success"]:
    print(f"Write rejected: {result['error']}")

# Validate a specific file:
val = validate_file(Path("server/code/api/db.py"), "python")
assert val["valid"], f"Validation failed: {val['checks']}"

# Startup check (returns dict with all_clear boolean):
summary = startup_check()
if not summary["all_clear"]:
    sys.exit(1)
```

---

## Recovery Procedure

If null-byte corruption is detected:

1. **Stop the API server** — corrupted Python files will crash uvicorn with SyntaxError.
2. **Run dry repair:** `python server/code/file_integrity.py repair-dry` — see which files are affected and how many null bytes.
3. **Run repair:** `python server/code/file_integrity.py repair` — strips null bytes atomically.
4. **Validate:** `python server/code/file_integrity.py validate` — confirm ast.parse/heuristics pass.
5. **Restart API server** — via `reload_api.bat` or manual uvicorn restart.
6. **Check integrity log:** `logs/file_integrity.log` — timestamp + event audit trail.

If repair does not restore a valid file (e.g., corruption beyond null bytes), restore from git: `git checkout -- <file>`.

---

## Integration Recommendations

| Integration Point | How | Priority |
|-------------------|-----|----------|
| API server startup | Add `startup_check()` call to `main.py` before uvicorn starts | High |
| Development scripts | Add `python file_integrity.py startup` to `reload_api.bat` | High |
| Pre-commit hook | `python file_integrity.py scan` — reject commits with corrupted files | Medium |
| Automated editing workflows | Use `atomic_write()` instead of direct `Path.write_text()` | Medium |

---

## Residual Risk

The guardrail is **detective** (detects corruption after the fact) and **partially preventive** (atomic writes prevent partial-write corruption). It does not address:

- Corruption that happens at the OS/filesystem level below Python
- Corruption patterns other than null bytes (e.g., byte shifts, truncation)
- Files not in the protected list

The protected file list should be expanded as new critical files are added to the codebase.
