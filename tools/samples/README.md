# tools/samples/

Known-good `window.__lv80TurnDebug` session exports for regression comparison.

## How to add a sample

1. Run a Lori 8.0 session — ideally one that exercises a specific posture path
2. In the browser console: `copy(JSON.stringify(window.__lv80TurnDebug))`
3. Paste into a `.json` file here with a descriptive name

## Naming convention

```
YYYY-MM-DD_<scenario>.json
```

Examples:
- `2026-03-26_toilet_paper_to_minot_recovery.json` — non_memoir detection + memoir recovery
- `2026-03-26_memory_exercise_hedged_suppression.json` — memory exercise mode, hedged facts filtered
- `2026-03-26_safety_override_narrator_reset.json` — safety mode + narrator switch

## Loading in the inspector

Drag-and-drop any `.json` file from this directory directly onto the inspector page:

```
http://localhost:8080/tools/LOREVOX_80_DEBUG_TIMELINE_INSPECTOR.html
```

Or paste its contents into the JSON input field and click **Render Timeline**.

## Note

These files contain session transcripts with turn content. Do not commit samples that include real personal or sensitive user data.
