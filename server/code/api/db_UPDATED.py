from __future__ import annotations
import os
import json
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
DATA_DIR = Path(os.getenv("DATA_DIR", "data"))
DB_DIR = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "corkybot.sqlite3"
def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=NORMAL;")
    con.execute("PRAGMA temp_store=MEMORY;")
    return con
def init_db() -> None:
    con = _connect()
    cur = con.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
      conv_id TEXT PRIMARY KEY,
      title   TEXT,
      updated_at TEXT,
      payload_json TEXT
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conv_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ts TEXT NOT NULL,
      anchor_id TEXT,
      meta_json TEXT,
      FOREIGN KEY(conv_id) REFERENCES sessions(conv_id)
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS rag_docs (
      id TEXT PRIMARY KEY,
      title TEXT,
      source TEXT,
      created_at TEXT,
      text TEXT
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      FOREIGN KEY(doc_id) REFERENCES rag_docs(id)
    );
    """)
    # Basic indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_turns_conv_ts ON turns(conv_id, ts);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(doc_id, chunk_index);")
    con.commit()
    con.close()
def upsert_session(conv_id: str, title: str, payload: Dict[str, Any]) -> None:
    init_db()
    con = _connect()
    now = datetime.utcnow().isoformat()
    con.execute(
        "INSERT INTO sessions(conv_id,title,updated_at,payload_json) VALUES(?,?,?,?) "
        "ON CONFLICT(conv_id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at, payload_json=excluded.payload_json;",
        (conv_id, title, now, json.dumps(payload, ensure_ascii=False)),
    )
    con.commit()
    con.close()
def get_session(conv_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute("SELECT conv_id,title,updated_at,payload_json FROM sessions WHERE conv_id=?;", (conv_id,)).fetchone()
    con.close()
    if not row:
        return None
    payload = {}
    try:
        payload = json.loads(row["payload_json"] or "{}")
    except Exception:
        payload = {}
    payload.setdefault("title", row["title"] or "")
    payload.setdefault("updated_at", row["updated_at"] or "")
    return payload
def list_sessions(limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT conv_id,title,updated_at FROM sessions ORDER BY updated_at DESC LIMIT ?;",
        (int(limit),),
    ).fetchall()
    con.close()
    return [{"conv_id": r["conv_id"], "title": r["title"], "updated_at": r["updated_at"]} for r in rows]
def delete_session(conv_id: str) -> None:
    init_db()
    con = _connect()
    con.execute("DELETE FROM turns WHERE conv_id=?;", (conv_id,))
    con.execute("DELETE FROM sessions WHERE conv_id=?;", (conv_id,))
    con.commit()
    con.close()
def add_turn(conv_id: str, role: str, content: str, ts: str, anchor_id: str = "", meta: Optional[Dict[str, Any]] = None) -> None:
    init_db()
    con = _connect()
    con.execute(
        "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
        (conv_id, role, content, ts, anchor_id or "", json.dumps(meta or {}, ensure_ascii=False)),
    )
    con.commit()
    con.close()
def export_turns(conv_id: str) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT role,content,ts,anchor_id,meta_json FROM turns WHERE conv_id=? ORDER BY ts ASC, id ASC;",
        (conv_id,),
    ).fetchall()
    con.close()
    out = []
    for r in rows:
        meta = {}
        try:
            meta = json.loads(r["meta_json"] or "{}")
        except Exception:
            meta = {}
        out.append({"role": r["role"], "content": r["content"], "timestamp": r["ts"], "anchor_id": r["anchor_id"], "meta": meta})
    return out
def rag_add_doc(doc_id: str, title: str, source: str, text: str) -> None:
    init_db()
    con = _connect()
    now = datetime.utcnow().isoformat()
    con.execute(
        "INSERT OR REPLACE INTO rag_docs(id,title,source,created_at,text) VALUES(?,?,?,?,?);",
        (doc_id, title, source, now, text),
    )
    # rebuild chunks
    con.execute("DELETE FROM rag_chunks WHERE doc_id=?;", (doc_id,))
    chunks = _chunk_text(text, 900)
    for i, ch in enumerate(chunks):
        chunk_id = f"{doc_id}::c{i}"
        con.execute(
            "INSERT OR REPLACE INTO rag_chunks(id,doc_id,chunk_index,text) VALUES(?,?,?,?);",
            (chunk_id, doc_id, i, ch),
        )
    con.commit()
    con.close()
def rag_stats() -> Dict[str, int]:
    init_db()
    con = _connect()
    docs = con.execute("SELECT COUNT(*) AS n FROM rag_docs;").fetchone()["n"]
    chunks = con.execute("SELECT COUNT(*) AS n FROM rag_chunks;").fetchone()["n"]
    con.close()
    return {"docs": int(docs), "chunks": int(chunks)}
def rag_query(query: str, k: int = 5, only_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """
    Lightweight lexical scoring (fast, no heavy deps):
    score = number of query tokens found in chunk text + small doc title boost
    """
    init_db()
    con = _connect()
    q = (query or "").strip().lower()
    tokens = [t for t in _tokenize(q) if t]
    if not tokens:
        return []
    k = max(1, min(int(k), 20))
    rows = con.execute("""
      SELECT c.id AS chunk_id, c.doc_id, c.text AS chunk_text, d.title AS doc_title, d.source AS doc_source
      FROM rag_chunks c
      JOIN rag_docs d ON d.id = c.doc_id;
    """).fetchall()
    con.close()
    hits = []
    for r in rows:
        cid = r["chunk_id"]
        if only_ids and cid not in only_ids:
            continue
        txt = (r["chunk_text"] or "").lower()
        score = 0
        for t in tokens:
            if t in txt:
                score += 1
        title = (r["doc_title"] or "").lower()
        for t in tokens:
            if t in title:
                score += 1
        if score > 0:
            snippet = r["chunk_text"][:420].strip()
            hits.append({
                "id": cid,
                "doc_id": r["doc_id"],
                "title": r["doc_title"] or "",
                "source": r["doc_source"] or "",
                "score": score,
                "snippet": snippet
            })
    hits.sort(key=lambda x: (-x["score"], x["title"]))
    return hits[:k]
def get_chunks_by_ids(ids: List[str]) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    out = []
    for cid in ids:
        row = con.execute("""
          SELECT c.id AS chunk_id, c.text AS chunk_text, d.title AS doc_title, d.source AS doc_source
          FROM rag_chunks c JOIN rag_docs d ON d.id=c.doc_id
          WHERE c.id=?;
        """, (cid,)).fetchone()
        if row:
            out.append({"id": row["chunk_id"], "title": row["doc_title"] or "", "source": row["doc_source"] or "", "text": row["chunk_text"] or ""})
    con.close()
    return out
def _tokenize(s: str) -> List[str]:
    import re
    return re.findall(r"[a-z0-9']{2,}", s.lower())
def _chunk_text(text: str, size: int = 900) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    # paragraph-aware chunking
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        if len(buf) + len(p) + 1 <= size:
            buf = (buf + "\n" + p) if buf else p
        else:
            chunks.append(buf)
            buf = p
    if buf:
        chunks.append(buf)
    return chunks

# ------------------------------------------------------------
# Turn persistence (single transaction, post-stream only)
# ------------------------------------------------------------
def persist_turn_transaction(
    conv_id: str,
    user_message: str,
    assistant_message: str,
    model_name: str = "",
    meta: Optional[dict] = None,
):
    """Persist a completed (user, assistant) turn as ONE SQLite transaction.

    IMPORTANT:
      - Call this ONLY after streaming finishes (never inside token loop).
      - Writes both turns (user + assistant) atomically.
    """
    init_db()
    ts = now_iso()
    with _conn() as conn:
        cur = conn.cursor()
        cur.execute("BEGIN")
        try:
            cur.execute(
                "INSERT INTO turns (conv_id, role, content, ts, meta) VALUES (?,?,?,?,?)",
                (conv_id, "user", user_message, ts, ""),
            )
            assistant_meta = {"model": model_name, **(meta or {})}
            cur.execute(
                "INSERT INTO turns (conv_id, role, content, ts, meta) VALUES (?,?,?,?,?)",
                (conv_id, "assistant", assistant_message, ts, json.dumps(assistant_meta, ensure_ascii=False)),
            )
            cur.execute("UPDATE sessions SET updated_at=? WHERE id=?", (ts, conv_id))
            cur.execute("COMMIT")
        except Exception:
            cur.execute("ROLLBACK")
            raise
