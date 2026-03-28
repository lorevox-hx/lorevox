"""Interview flow helpers for Lorevox.

Adds higher-level helpers on top of `code.api.db` WITHOUT requiring DB migrations:

- Fetch a section transcript or whole-session transcript (from interview_answers)
- Detect whether follow-ups have been generated
- Insert a 'followups' section and follow-up questions into interview_questions

Database remains the source of truth.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from . import db


def get_section_meta(plan_id: str, section_id: str) -> Optional[dict]:
    db.init_db()
    con = db._connect()  # type: ignore
    row = con.execute(
        "SELECT id, plan_id, title, ord FROM interview_sections WHERE plan_id = ? AND id = ?",
        (plan_id, section_id),
    ).fetchone()
    con.close()
    return dict(row) if row else None


def get_section_transcript(session_id: str, section_id: str, *, include_skipped: bool = False) -> str:
    """Return Q&A text for a specific section in a session."""
    db.init_db()
    con = db._connect()  # type: ignore

    sql = (
        "SELECT q.ord, q.prompt, a.answer, a.skipped, a.ts "
        "FROM interview_answers a "
        "JOIN interview_questions q ON q.id = a.question_id "
        "WHERE a.session_id = ? AND q.section_id = ?"
    )
    params: list = [session_id, section_id]
    if not include_skipped:
        sql += " AND a.skipped = 0"
    sql += " ORDER BY q.ord ASC, a.ts ASC"

    rows = con.execute(sql, params).fetchall()
    con.close()

    out: List[str] = []
    for r in rows:
        ans = (r["answer"] or "").strip()
        if not ans:
            continue
        out.append(f"Interviewer: {r['prompt']}")
        out.append(f"Speaker: {ans}")
        out.append("")

    return "\n".join(out).strip()


def get_session_transcript(session_id: str, *, include_skipped: bool = False, with_section_headers: bool = True) -> str:
    """Return Q&A text for the whole session (ordered by question ord)."""
    db.init_db()
    con = db._connect()  # type: ignore

    sql = (
        "SELECT s.title AS section_title, q.section_id, q.ord, q.prompt, a.answer, a.skipped "
        "FROM interview_answers a "
        "JOIN interview_questions q ON q.id = a.question_id "
        "LEFT JOIN interview_sections s ON s.id = q.section_id AND s.plan_id = q.plan_id "
        "WHERE a.session_id = ?"
    )
    params: list = [session_id]
    if not include_skipped:
        sql += " AND a.skipped = 0"
    sql += " ORDER BY q.ord ASC"

    rows = con.execute(sql, params).fetchall()
    con.close()

    out: List[str] = []
    last_section: Optional[str] = None
    for r in rows:
        ans = (r["answer"] or "").strip()
        if not ans:
            continue

        section_id = r["section_id"]
        section_title = (r["section_title"] or section_id or "").strip()

        if with_section_headers and section_id != last_section:
            if out:
                out.append("")
            out.append(f"=== {section_title} ===")
            out.append("")
            last_section = section_id

        out.append(f"Interviewer: {r['prompt']}")
        out.append(f"Speaker: {ans}")
        out.append("")

    return "\n".join(out).strip()


def followups_exist(plan_id: str) -> bool:
    db.init_db()
    con = db._connect()  # type: ignore
    n = con.execute(
        "SELECT COUNT(*) AS n FROM interview_questions WHERE plan_id = ? AND section_id = 'followups'",
        (plan_id,),
    ).fetchone()["n"]
    con.close()
    return int(n) > 0


def ensure_followups_section(plan_id: str) -> None:
    """Create the followups section if missing."""
    db.init_db()
    con = db._connect()  # type: ignore
    row = con.execute("SELECT 1 FROM interview_sections WHERE id = 'followups' LIMIT 1").fetchone()
    if not row:
        con.execute(
            "INSERT INTO interview_sections(id, plan_id, title, ord) VALUES(?, ?, ?, ?)",
            ("followups", plan_id, "Follow-up Questions", 99),
        )
        con.commit()
    con.close()


def _next_followup_ord(plan_id: str) -> int:
    db.init_db()
    con = db._connect()  # type: ignore
    max_ord = con.execute(
        "SELECT COALESCE(MAX(ord), -1) AS m FROM interview_questions WHERE plan_id = ?",
        (plan_id,),
    ).fetchone()["m"]
    con.close()

    max_ord = int(max_ord)
    if max_ord < 0:
        return 0

    # Keep your 2000 spacing convention.
    step = 2000
    return ((max_ord // step) + 1) * step


def add_followup_questions(plan_id: str, questions: List[str]) -> List[dict]:
    """Insert follow-up questions into interview_questions and return the inserted question dicts."""
    questions = [q.strip() for q in questions if q and q.strip()]
    if not questions:
        return []

    ensure_followups_section(plan_id)
    start_ord = _next_followup_ord(plan_id)

    inserted: List[dict] = []

    db.init_db()
    con = db._connect()  # type: ignore

    for i, prompt in enumerate(questions):
        qid = f"fu_{uuid.uuid4().hex[:10]}"
        ordv = start_ord + i
        con.execute(
            "INSERT INTO interview_questions(id, plan_id, section_id, ord, prompt, kind, required, profile_path) "
            "VALUES(?, ?, ?, ?, ?, ?, 0, NULL)",
            (qid, plan_id, "followups", ordv, prompt, "followup"),
        )
        inserted.append({"id": qid, "section_id": "followups", "ord": ordv, "prompt": prompt, "kind": "followup"})

    con.commit()
    con.close()

    return inserted
