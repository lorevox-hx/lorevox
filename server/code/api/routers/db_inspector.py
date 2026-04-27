from fastapi import APIRouter, HTTPException
import sqlite3
import os
from pathlib import Path

router = APIRouter(tags=["db"])

def _db_path() -> str:
    # Match your existing pattern: DATA_DIR + /db/lorevox.sqlite3 (or DB_NAME)
    data_dir = Path(os.getenv("DATA_DIR", "data")).expanduser()
    db_name = os.getenv("DB_NAME", "lorevox.sqlite3")
    return str(data_dir / "db" / db_name)

@router.get("/db/tables")
def list_tables():
    dbp = _db_path()
    if not Path(dbp).exists():
        raise HTTPException(404, f"DB not found: {dbp}")

    conn = sqlite3.connect(dbp)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        return {"db_path": dbp, "tables": [r[0] for r in cur.fetchall()]}
    finally:
        conn.close()

@router.get("/db/table/{table_name}")
def preview_table(table_name: str, limit: int = 50):
    dbp = _db_path()
    if not Path(dbp).exists():
        raise HTTPException(404, f"DB not found: {dbp}")

    conn = sqlite3.connect(dbp)
    try:
        cur = conn.cursor()
        # basic safety: allow only simple table names
        if not table_name.replace("_", "").isalnum():
            raise HTTPException(400, "Invalid table name")

        cur.execute(f"SELECT * FROM {table_name} LIMIT ?", (limit,))
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description] if cur.description else []
        return {"db_path": dbp, "table": table_name, "columns": cols, "rows": rows}
    except sqlite3.OperationalError as e:
        raise HTTPException(400, str(e))
    finally:
        conn.close()
