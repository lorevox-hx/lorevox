from __future__ import annotations

import logging
import os
import re
import json
import shutil
import sqlite3
import uuid
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)


# ── DOB sanitisation ─────────────────────────────────────────────────────────
_ISO_DATE_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")


def _sanitise_dob(raw: Optional[str]) -> str:
    """Normalise a date-of-birth string.

    Accepts ISO format (YYYY, YYYY-MM, YYYY-MM-DD) as-is.
    Fuzzy/uncertain strings (e.g. "1947, I think?") are stored prefixed with
    ``uncertain:`` so downstream code can distinguish validated from raw input.
    Empty input returns empty string.
    """
    if not raw:
        return ""
    raw = raw.strip()
    if _ISO_DATE_RE.match(raw):
        return raw
    # Preserve uncertain input but flag it clearly
    if not raw.startswith("uncertain:"):
        return f"uncertain:{raw}"
    return raw


# -----------------------------------------------------------------------------
# Paths / connection
# -----------------------------------------------------------------------------
DATA_DIR = Path(os.getenv("DATA_DIR", "data")).expanduser()
DB_DIR = DATA_DIR / "db"
DB_DIR.mkdir(parents=True, exist_ok=True)

DB_NAME = os.getenv("DB_NAME", "lorevox.sqlite3").strip() or "lorevox.sqlite3"
DB_PATH = DB_DIR / DB_NAME

# v7.4D — log DB path at import time so startup output confirms the right file.
logger.info("Lorevox DB: %s", DB_PATH)


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=NORMAL;")
    con.execute("PRAGMA temp_store=MEMORY;")
    con.execute("PRAGMA foreign_keys=ON;")
    return con


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


def _json_load(s: str | None, default: Any) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


def _json_dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


# -----------------------------------------------------------------------------
# WO-13 Phase 1 — Legacy facts → family_truth_rows backfill
#
# Called from init_db() after the family_truth_* schema is created. The
# unique partial index on family_truth_rows.source_fact_id makes this
# idempotent: re-running on an already-migrated DB is a no-op.
#
# Policy:
#   - The legacy `facts` table is NEVER modified, deleted, or truncated.
#   - Every legacy fact becomes a `needs_verify` row in family_truth_rows so
#     a human reviewer can approve/qualify/reject it.
#   - Rows matching the WO-12B contamination patterns get legacy_suspect=1
#     so the UI can offer bulk dismiss.
# -----------------------------------------------------------------------------
_WO13_FACT_TYPE_TO_FIELD = {
    "birth": "date_of_birth",
    "birthplace": "place_of_birth",
    "death": "date_of_death",
    "marriage": "marriage",
    "children": "children",
    "employment_start": "employment",
    "employment_end": "employment",
    "education": "education",
    "residence": "residence",
    "family_relationship": "family_relationship",
}

_WO13_SENTENCE_TERMINATORS = set(".!?\"')”’…")


def _wo13_flag_legacy_suspect(
    statement: str,
    narrator_name: str,
    meta: Dict[str, Any],
    narrative_role: str,
    meaning_tags: List[str],
) -> int:
    """Return 1 if the legacy fact matches a WO-12B contamination pattern.

    Patterns:
      (a) Truncation: statement does not end with a sentence terminator.
      (b) Cross-narrator bleed: statement mentions 'Williston' but the
          narrator is not Chris (the known stress-test source).
      (c) chat_extraction origin: meta.source set by the broken client-side
          regex path in ui/js/app.js.
      (d) Climax + loss combo: narrative_role='climax' with a 'loss' tag
          (matches the climax-stamping routing bug).
    """
    s = (statement or "").strip()
    if s:
        last_char = s[-1]
        if last_char not in _WO13_SENTENCE_TERMINATORS:
            return 1
    if s and "williston" in s.lower() and "chris" not in (narrator_name or "").lower():
        return 1
    try:
        if str((meta or {}).get("source", "")).lower() == "chat_extraction":
            return 1
    except Exception:
        pass
    if (narrative_role or "").lower() == "climax":
        for t in meaning_tags or []:
            if str(t).lower() == "loss":
                return 1
    return 0


def _wo13_backfill_facts_to_family_truth_rows(
    con: sqlite3.Connection, cur: sqlite3.Cursor
) -> None:
    """Idempotent one-time backfill. Safe to run on every boot."""
    try:
        facts_rows = cur.execute(
            "SELECT id,person_id,session_id,fact_type,statement,date_text,"
            "date_normalized,confidence,status,inferred,source_turn_index,"
            "created_at,updated_at,meta_json,meaning_tags_json,narrative_role,"
            "experience,reflection FROM facts;"
        ).fetchall()
    except sqlite3.Error as e:
        logger.warning("WO-13 backfill: facts table not queryable (%s); skipping", e)
        return

    if not facts_rows:
        return

    people_map = {
        r[0]: (r[1] or "")
        for r in cur.execute("SELECT id, display_name FROM people;").fetchall()
    }

    now = _now_iso()
    inserted = 0
    suspect = 0
    for f in facts_rows:
        fid = f["id"]
        existing = cur.execute(
            "SELECT 1 FROM family_truth_rows WHERE source_fact_id=? LIMIT 1;",
            (fid,),
        ).fetchone()
        if existing:
            continue

        meta = _json_load(f["meta_json"], {}) or {}
        meaning_tags = _json_load(f["meaning_tags_json"], []) or []
        statement = (f["statement"] or "").strip()
        fact_type = (f["fact_type"] or "general").strip() or "general"
        person_id = f["person_id"] or ""
        narrator_name = people_map.get(person_id, "")
        narrative_role = f["narrative_role"] or ""

        legacy_suspect = _wo13_flag_legacy_suspect(
            statement, narrator_name, meta, narrative_role, meaning_tags
        )
        if legacy_suspect:
            suspect += 1

        field = _WO13_FACT_TYPE_TO_FIELD.get(fact_type, fact_type)

        provenance = {
            "session_id": f["session_id"] or "",
            "source_turn_index": f["source_turn_index"],
            "legacy_meta": meta,
            "legacy_fact_type": fact_type,
            "legacy_status": f["status"] or "",
            "legacy_experience": f["experience"] or "",
            "legacy_reflection": f["reflection"] or "",
            "backfilled_at": now,
        }

        cur.execute(
            """
            INSERT INTO family_truth_rows(
              id, person_id, note_id, subject_name, relationship, field,
              source_says, approved_value, status, qualification,
              reviewer, reviewed_at, confidence, narrative_role, meaning_tags,
              provenance, legacy_suspect, extraction_method, source_fact_id,
              created_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
            """,
            (
                _uuid(),
                person_id,
                None,
                narrator_name,            # subject defaults to narrator (self-claim)
                "self",
                field,
                statement,                # source_says = raw statement (preserved)
                "",                       # approved_value — empty until reviewer sets it
                "needs_verify",           # every backfilled row must be reviewed
                "",                       # qualification
                "",                       # reviewer
                "",                       # reviewed_at
                float(f["confidence"] or 0.0),
                narrative_role,
                _json_dump(meaning_tags),
                _json_dump(provenance),
                legacy_suspect,
                "backfill",
                fid,
                f["created_at"] or now,
                now,
            ),
        )
        inserted += 1

    if inserted:
        logger.info(
            "WO-13 backfill: migrated %d legacy facts → family_truth_rows "
            "(%d flagged legacy_suspect=1). facts table untouched.",
            inserted,
            suspect,
        )


# -----------------------------------------------------------------------------
# WO-13 Phase 3 — Reference narrator seeding
#
# Known reference narrators are seeded by display_name substring match. The
# seed is idempotent — it only promotes a person from 'live' → 'reference'.
# It never demotes. To demote, use PATCH /api/people/{id}.
#
# Env override:
#   LOREVOX_REFERENCE_NARRATORS="Shatner,Dolly,Other Name"
# -----------------------------------------------------------------------------
_WO13_DEFAULT_REFERENCE_NAMES = ("shatner", "dolly")


def _wo13_reference_name_patterns() -> List[str]:
    raw = os.getenv("LOREVOX_REFERENCE_NARRATORS", "")
    if not raw.strip():
        return list(_WO13_DEFAULT_REFERENCE_NAMES)
    return [p.strip().lower() for p in raw.split(",") if p.strip()]


def _wo13_seed_reference_narrators(
    con: sqlite3.Connection, cur: sqlite3.Cursor
) -> None:
    patterns = _wo13_reference_name_patterns()
    if not patterns:
        return
    rows = cur.execute(
        "SELECT id, display_name, narrator_type FROM people;"
    ).fetchall()
    promoted = 0
    for r in rows:
        name = (r["display_name"] or "").lower()
        current = (r["narrator_type"] or "live").lower()
        if current == "reference":
            continue
        if any(pat in name for pat in patterns):
            cur.execute(
                "UPDATE people SET narrator_type='reference', updated_at=? WHERE id=?;",
                (_now_iso(), r["id"]),
            )
            promoted += 1
    if promoted:
        logger.info(
            "WO-13 narrator_type seed: promoted %d people to reference (patterns=%s)",
            promoted,
            patterns,
        )


# -----------------------------------------------------------------------------
# Schema
# -----------------------------------------------------------------------------
def init_db() -> None:
    con = _connect()
    cur = con.cursor()

    # -----------------------------
    # Sessions + turns (chat persistence)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
          conv_id TEXT PRIMARY KEY,
          title TEXT DEFAULT '',
          updated_at TEXT,
          payload_json TEXT DEFAULT '{}'
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS turns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conv_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          ts TEXT NOT NULL,
          anchor_id TEXT DEFAULT '',
          meta_json TEXT DEFAULT '{}',
          FOREIGN KEY(conv_id) REFERENCES sessions(conv_id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_turns_conv_ts ON turns(conv_id, ts, id);")

    # -----------------------------
    # People + profiles
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS people (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          role TEXT DEFAULT '',
          date_of_birth TEXT DEFAULT '',
          place_of_birth TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS profiles (
          person_id TEXT PRIMARY KEY,
          profile_json TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )

    # -----------------------------
    # Media
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY,
          person_id TEXT,
          kind TEXT NOT NULL DEFAULT 'image',
          filename TEXT NOT NULL DEFAULT '',
          mime TEXT NOT NULL DEFAULT '',
          bytes INTEGER NOT NULL DEFAULT 0,
          sha256 TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_media_person_created ON media(person_id, created_at);")

    # -----------------------------
    # Timeline
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS timeline_events (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          date TEXT NOT NULL,                 -- ISO date or datetime string
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL DEFAULT 'event',
          created_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_timeline_person_date ON timeline_events(person_id, date);")

    # -----------------------------
    # Interview plans / questions / sessions / answers
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_plans (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_sections (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          title TEXT NOT NULL,
          ord INTEGER NOT NULL,
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_questions (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          section_id TEXT NOT NULL,
          ord INTEGER NOT NULL,
          prompt TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'text',
          required INTEGER NOT NULL DEFAULT 0,
          profile_path TEXT,
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE,
          FOREIGN KEY(section_id) REFERENCES interview_sections(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_interview_q_plan_ord ON interview_questions(plan_id, ord);")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_sessions (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          active_question_id TEXT,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
          FOREIGN KEY(plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_answers (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          person_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          answer TEXT NOT NULL DEFAULT '',
          skipped INTEGER NOT NULL DEFAULT 0,
          ts TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
          FOREIGN KEY(question_id) REFERENCES interview_questions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_interview_a_session_ts ON interview_answers(session_id, ts);")

    # -----------------------------
    # Facts  (atomic, source-backed claims)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS facts (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          session_id TEXT,
          fact_type TEXT NOT NULL DEFAULT 'general',
          statement TEXT NOT NULL,
          date_text TEXT DEFAULT '',
          date_normalized TEXT DEFAULT '',
          confidence REAL DEFAULT 0.0,
          status TEXT NOT NULL DEFAULT 'extracted',
          inferred INTEGER NOT NULL DEFAULT 0,
          source_turn_index INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_facts_person ON facts(person_id, created_at);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(session_id);")

    # -----------------------------
    # Life phases  (e.g. "childhood", "first marriage", "OT career")
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS life_phases (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          title TEXT NOT NULL,
          start_date TEXT DEFAULT '',
          end_date TEXT DEFAULT '',
          date_precision TEXT DEFAULT 'year',
          description TEXT DEFAULT '',
          ord INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          meta_json TEXT NOT NULL DEFAULT '{}',
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_life_phases_person ON life_phases(person_id, ord);")

    # -----------------------------
    # Migrate timeline_events: add new calendar columns if missing
    # -----------------------------
    existing_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(timeline_events);").fetchall()
    }
    calendar_cols = {
        "end_date": "ALTER TABLE timeline_events ADD COLUMN end_date TEXT DEFAULT '';",
        "date_precision": "ALTER TABLE timeline_events ADD COLUMN date_precision TEXT DEFAULT 'exact_day';",
        "is_approximate": "ALTER TABLE timeline_events ADD COLUMN is_approximate INTEGER DEFAULT 0;",
        "confidence": "ALTER TABLE timeline_events ADD COLUMN confidence REAL DEFAULT 1.0;",
        "status": "ALTER TABLE timeline_events ADD COLUMN status TEXT DEFAULT 'reviewed';",
        "source_session_ids": "ALTER TABLE timeline_events ADD COLUMN source_session_ids TEXT DEFAULT '[]';",
        "source_fact_ids": "ALTER TABLE timeline_events ADD COLUMN source_fact_ids TEXT DEFAULT '[]';",
        "tags": "ALTER TABLE timeline_events ADD COLUMN tags TEXT DEFAULT '[]';",
        "display_date": "ALTER TABLE timeline_events ADD COLUMN display_date TEXT DEFAULT '';",
        "phase_id": "ALTER TABLE timeline_events ADD COLUMN phase_id TEXT DEFAULT '';",
    }
    for col_name, alter_sql in calendar_cols.items():
        if col_name not in existing_cols:
            cur.execute(alter_sql)

    # -----------------------------
    # Migrate facts: add Meaning Engine fields if missing (Bug MAT-01 fix)
    # These fields were sent by the frontend in POST /api/facts/add but not persisted.
    # Added in the meaning engine implementation (Phase A+B).
    # -----------------------------
    facts_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(facts);").fetchall()
    }
    meaning_cols = {
        "meaning_tags_json": "ALTER TABLE facts ADD COLUMN meaning_tags_json TEXT NOT NULL DEFAULT '[]';",
        "narrative_role":    "ALTER TABLE facts ADD COLUMN narrative_role TEXT DEFAULT NULL;",
        "experience":        "ALTER TABLE facts ADD COLUMN experience TEXT DEFAULT NULL;",
        "reflection":        "ALTER TABLE facts ADD COLUMN reflection TEXT DEFAULT NULL;",
    }
    for col_name, alter_sql in meaning_cols.items():
        if col_name not in facts_cols:
            cur.execute(alter_sql)

    # -----------------------------
    # Migrate media: add rich metadata columns if missing (Bug MB-01 fix)
    # Original table only had kind/filename/mime/bytes/sha256/meta_json.
    # Router expected description/taken_at/location_name/latitude/longitude/exif_json.
    # -----------------------------
    media_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(media);").fetchall()
    }
    media_new_cols = {
        "description":   "ALTER TABLE media ADD COLUMN description TEXT NOT NULL DEFAULT '';",
        "taken_at":      "ALTER TABLE media ADD COLUMN taken_at TEXT DEFAULT NULL;",
        "location_name": "ALTER TABLE media ADD COLUMN location_name TEXT DEFAULT NULL;",
        "latitude":      "ALTER TABLE media ADD COLUMN latitude REAL DEFAULT NULL;",
        "longitude":     "ALTER TABLE media ADD COLUMN longitude REAL DEFAULT NULL;",
        "exif_json":     "ALTER TABLE media ADD COLUMN exif_json TEXT NOT NULL DEFAULT '{}';",
    }
    for col_name, alter_sql in media_new_cols.items():
        if col_name not in media_cols:
            cur.execute(alter_sql)

    # -----------------------------
    # Media attachments — links a photo to a memoir section or fact (Media Builder)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS media_attachments (
          id TEXT PRIMARY KEY,
          media_id TEXT NOT NULL,
          entity_type TEXT NOT NULL DEFAULT 'memoir_section',
          entity_id TEXT NOT NULL,
          person_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_attachments_media ON media_attachments(media_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_attachments_entity ON media_attachments(entity_type, entity_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_attachments_person ON media_attachments(person_id);"
    )

    # -----------------------------
    # Migrate people: add soft-delete columns if missing (Phase 2 — narrator delete)
    # -----------------------------
    people_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(people);").fetchall()
    }
    people_delete_cols = {
        "is_deleted":     "ALTER TABLE people ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;",
        "deleted_at":     "ALTER TABLE people ADD COLUMN deleted_at TEXT DEFAULT NULL;",
        "deleted_by":     "ALTER TABLE people ADD COLUMN deleted_by TEXT DEFAULT NULL;",
        "delete_reason":  "ALTER TABLE people ADD COLUMN delete_reason TEXT DEFAULT '';",
        "undo_expires_at":"ALTER TABLE people ADD COLUMN undo_expires_at TEXT DEFAULT NULL;",
    }
    for col_name, alter_sql in people_delete_cols.items():
        if col_name not in people_cols:
            cur.execute(alter_sql)

    # Index for fast active-narrator queries (exclude soft-deleted)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_people_active ON people(is_deleted, updated_at);"
    )

    # -----------------------------
    # WO-13 Phase 3 — narrator_type (live | reference)
    #
    # live:       a real, interviewable narrator whose memories feed the memoir
    #             (Kent, Janice, Chris, Maggie, etc). Writable through the normal
    #             extraction + family-truth pipeline.
    # reference:  an illustrative / role-model narrator seeded from structuredBio
    #             or profile (Shatner, Dolly). Fully read-only from the
    #             narrative-memory pipeline — facts.add and family_truth writes
    #             are rejected with 403. Profile writes are still allowed so the
    #             canonical seed data can be maintained.
    #
    # Default 'live' for all existing rows; the seed routine below promotes
    # known reference narrators by display_name match.
    # -----------------------------
    if "narrator_type" not in people_cols:
        cur.execute(
            "ALTER TABLE people ADD COLUMN narrator_type TEXT NOT NULL DEFAULT 'live';"
        )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_people_narrator_type ON people(narrator_type, is_deleted);"
    )
    _wo13_seed_reference_narrators(con, cur)

    # -----------------------------
    # Narrator delete audit log (Phase 2 — append-only)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS narrator_delete_audit (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          person_id TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          requested_by TEXT DEFAULT NULL,
          dependency_counts_json TEXT NOT NULL DEFAULT '{}',
          result TEXT NOT NULL DEFAULT 'success',
          error_detail TEXT DEFAULT NULL,
          ts TEXT NOT NULL
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_narrator_audit_ts ON narrator_delete_audit(ts);"
    )

    # Default plan (safe even if empty)
    now = _now_iso()
    cur.execute(
        "INSERT OR IGNORE INTO interview_plans(id,title,created_at) VALUES(?,?,?);",
        ("default", "Default Plan", now),
    )

    # -----------------------------
    # RAG (optional; used by inspector/router if you keep it)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_docs (
          id TEXT PRIMARY KEY,
          title TEXT,
          source TEXT,
          created_at TEXT,
          text TEXT
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_chunks (
          id TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          FOREIGN KEY(doc_id) REFERENCES rag_docs(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks(doc_id, chunk_index);")

    # -----------------------------
    # Section summaries  (persisted at section boundaries)
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS section_summaries (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          person_id TEXT NOT NULL,
          section_id TEXT NOT NULL,
          section_title TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_section_summaries_session ON section_summaries(session_id, section_id);")

    # -----------------------------
    # Segment flags  (Track A — Safety)
    # Sensitive flags on individual answer/segment records
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS segment_flags (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          question_id TEXT,
          section_id TEXT,
          sensitive INTEGER NOT NULL DEFAULT 0,
          sensitive_category TEXT DEFAULT '',
          excluded_from_memoir INTEGER NOT NULL DEFAULT 1,
          private INTEGER NOT NULL DEFAULT 1,
          deleted INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_segment_flags_session ON segment_flags(session_id);")
    # v6.2: UNIQUE constraint on (session_id, question_id) prevents duplicate flags on answer retry.
    # SQLite requires CREATE UNIQUE INDEX rather than ALTER TABLE ADD CONSTRAINT.
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_seg_flags_session_question "
        "ON segment_flags(session_id, question_id) WHERE question_id IS NOT NULL;"
    )

    # -----------------------------
    # Affect events  (Track B — Emotion Signal)
    # Derived affect state events from browser MediaPipe pipeline
    # Never stores raw landmarks or raw emotion labels
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS affect_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          section_id TEXT DEFAULT '',
          affect_state TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 0.0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          source TEXT NOT NULL DEFAULT 'camera',
          ts TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES interview_sessions(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_affect_events_session_ts ON affect_events(session_id, ts);")

    # -----------------------------
    # Migrate interview_sessions: add softened mode columns if missing
    # -----------------------------
    existing_isess_cols = {
        row[1] for row in cur.execute("PRAGMA table_info(interview_sessions);").fetchall()
    }
    softened_cols = {
        "interview_softened": "ALTER TABLE interview_sessions ADD COLUMN interview_softened INTEGER DEFAULT 0;",
        "softened_until_turn": "ALTER TABLE interview_sessions ADD COLUMN softened_until_turn INTEGER DEFAULT 0;",
        "turn_count": "ALTER TABLE interview_sessions ADD COLUMN turn_count INTEGER DEFAULT 0;",
    }
    for col_name, alter_sql in softened_cols.items():
        if col_name not in existing_isess_cols:
            cur.execute(alter_sql)

    _ensure_phase_g_tables(con, cur)
    _ensure_phase_q1_tables(con, cur)

    # -----------------------------
    # WO-13 Phase 1 — Family Truth tables (Shadow Archive + Proposal + Promoted)
    #
    # family_truth_notes : append-only raw shadow archive (freeform body a user
    #                      or the extractor dropped in, never promoted directly)
    # family_truth_rows  : structured proposals that may be approved / qualified
    #                      / flagged for verify / kept as source-only / rejected.
    #                      Promoted truth = rows with status in ('approve','approve_q').
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS family_truth_notes (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          body TEXT NOT NULL,
          source_kind TEXT NOT NULL DEFAULT 'chat',
          source_ref TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL DEFAULT 'system',
          review_locked INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ft_notes_person ON family_truth_notes(person_id, created_at);"
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS family_truth_rows (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          note_id TEXT,
          subject_name TEXT NOT NULL DEFAULT '',
          relationship TEXT NOT NULL DEFAULT '',
          field TEXT NOT NULL,
          source_says TEXT NOT NULL DEFAULT '',
          approved_value TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'needs_verify',
          qualification TEXT NOT NULL DEFAULT '',
          reviewer TEXT NOT NULL DEFAULT '',
          reviewed_at TEXT NOT NULL DEFAULT '',
          confidence REAL NOT NULL DEFAULT 0.0,
          narrative_role TEXT NOT NULL DEFAULT '',
          meaning_tags TEXT NOT NULL DEFAULT '[]',
          provenance TEXT NOT NULL DEFAULT '{}',
          legacy_suspect INTEGER NOT NULL DEFAULT 0,
          extraction_method TEXT NOT NULL DEFAULT '',
          source_fact_id TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
          FOREIGN KEY(note_id)  REFERENCES family_truth_notes(id) ON DELETE SET NULL
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ft_rows_person_status ON family_truth_rows(person_id, status);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ft_rows_subject_field ON family_truth_rows(person_id, subject_name, field);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ft_rows_note ON family_truth_rows(note_id);"
    )
    # Idempotency guard: a given legacy facts.id may only produce ONE backfilled row.
    # Uses a partial unique index so non-backfilled rows (source_fact_id='') are unconstrained.
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_rows_source_fact "
        "ON family_truth_rows(source_fact_id) WHERE source_fact_id <> '';"
    )

    # -----------------------------
    # WO-13 Phase 7 — Promoted Truth table.
    #
    # This is the FOURTH layer of the four-layer truth pipeline:
    #
    #   Shadow Archive (notes) → Proposal (rows) → Review → Promoted Truth
    #
    # Each record is the canonical value for one (person_id, subject_name,
    # field) triple. `ft_promote_row` UPSERTs into this table using that key
    # as the uniqueness constraint, so re-running a promotion on an identical
    # row is a true no-op (same values → same hash → updated_at not touched).
    #
    # Rules enforced at promotion time:
    #   - Protected identity fields coming from `rules_fallback` are refused.
    #   - Reference narrators are refused upstream by the router's 403 guard.
    #   - Only rows with status IN ('approve','approve_q') are eligible.
    # -----------------------------
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS family_truth_promoted (
          id TEXT PRIMARY KEY,
          person_id TEXT NOT NULL,
          subject_name TEXT NOT NULL DEFAULT '',
          relationship TEXT NOT NULL DEFAULT 'self',
          field TEXT NOT NULL,
          value TEXT NOT NULL DEFAULT '',
          qualification TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'approve',
          source_row_id TEXT NOT NULL DEFAULT '',
          source_note_id TEXT NOT NULL DEFAULT '',
          source_says TEXT NOT NULL DEFAULT '',
          extraction_method TEXT NOT NULL DEFAULT '',
          confidence REAL NOT NULL DEFAULT 0.0,
          reviewer TEXT NOT NULL DEFAULT '',
          content_hash TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    # The PRIMARY uniqueness key for promoted truth. Enforces one row per
    # (person, subject, field). ON CONFLICT DO UPDATE keyed off this index.
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ft_promoted_subject_field "
        "ON family_truth_promoted(person_id, subject_name, field);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ft_promoted_person "
        "ON family_truth_promoted(person_id, updated_at);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_ft_promoted_source_row "
        "ON family_truth_promoted(source_row_id);"
    )

    # One-time (idempotent) backfill of legacy facts rows into family_truth_rows.
    _wo13_backfill_facts_to_family_truth_rows(con, cur)

    con.commit()

    # WO-LORI-PHOTO-SHARED-01 — apply post-legacy migrations in
    # server/code/db/migrations/*.sql. Runner is idempotent (tracked in
    # schema_migrations). Kept AFTER the legacy CREATE TABLE block so any
    # failure here never truncates the pre-WO schema.
    try:
        from ..db.migrations_runner import run_pending_migrations  # type: ignore
        run_pending_migrations(con)
    except Exception:
        logger.exception("Post-legacy migrations failed")
        con.close()
        raise

    con.close()


# -----------------------------------------------------------------------------
# Sessions / turns (UI + SSE + WS)
# -----------------------------------------------------------------------------
def new_conv_id() -> str:
    return _uuid()


def ensure_session(conv_id: str, title: str = "") -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        """
        INSERT INTO sessions(conv_id,title,updated_at,payload_json)
        VALUES(?,?,?,?)
        ON CONFLICT(conv_id) DO UPDATE SET
          title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE sessions.title END,
          updated_at=excluded.updated_at;
        """,
        (conv_id, title or "", now, "{}"),
    )
    con.commit()
    con.close()


def upsert_session(conv_id: str, title: str, payload: Dict[str, Any]) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        """
        INSERT INTO sessions(conv_id,title,updated_at,payload_json)
        VALUES(?,?,?,?)
        ON CONFLICT(conv_id) DO UPDATE SET
          title=excluded.title,
          updated_at=excluded.updated_at,
          payload_json=excluded.payload_json;
        """,
        (conv_id, title or "", now, _json_dump(payload or {})),
    )
    con.commit()
    con.close()


def get_session_payload(conv_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT conv_id,title,updated_at,payload_json FROM sessions WHERE conv_id=?;",
        (conv_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    payload = _json_load(row["payload_json"], {})
    payload.setdefault("conv_id", row["conv_id"])
    payload.setdefault("title", row["title"] or "")
    payload.setdefault("updated_at", row["updated_at"] or "")
    return payload


def get_session(conv_id: str) -> Optional[Dict[str, Any]]:
    """Back-compat shim for api.py and older callers."""
    return get_session_payload(conv_id)


def list_sessions(limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT conv_id,title,updated_at FROM sessions ORDER BY updated_at DESC LIMIT ?;",
        (int(limit),),
    ).fetchall()
    con.close()
    return [{"conv_id": r["conv_id"], "title": r["title"] or "", "updated_at": r["updated_at"] or ""} for r in rows]


def delete_session(conv_id: str) -> None:
    init_db()
    con = _connect()
    con.execute("DELETE FROM turns WHERE conv_id=?;", (conv_id,))
    con.execute("DELETE FROM sessions WHERE conv_id=?;", (conv_id,))
    con.commit()
    con.close()


def add_turn(
    conv_id: str,
    role: str,
    content: str,
    ts: Optional[str] = None,
    anchor_id: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    init_db()
    ensure_session(conv_id)
    con = _connect()
    ts = ts or _now_iso()
    con.execute(
        "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
        (conv_id, role, content, ts, anchor_id or "", _json_dump(meta or {})),
    )
    con.execute("UPDATE sessions SET updated_at=? WHERE conv_id=?;", (ts, conv_id))
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
    out: List[Dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "role": r["role"],
                "content": r["content"],
                "timestamp": r["ts"],
                "anchor_id": r["anchor_id"] or "",
                "meta": _json_load(r["meta_json"], {}),
            }
        )
    return out


def clear_turns(conv_id: str) -> int:
    """WO-2: Delete all turns for a conversation, returning count deleted."""
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM turns WHERE conv_id=?;", (conv_id,))
    con.commit()
    n = cur.rowcount
    con.close()
    return n


def persist_turn_transaction(
    conv_id: str,
    user_message: str,
    assistant_message: str,
    model_name: str = "",
    meta: Optional[dict] = None,
) -> None:
    init_db()
    ensure_session(conv_id)
    ts = _now_iso()

    con = _connect()
    cur = con.cursor()
    cur.execute("BEGIN")
    try:
        cur.execute(
            "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
            (conv_id, "user", user_message, ts, "", "{}"),
        )
        assistant_meta = {"model": model_name or "", **(meta or {})}
        cur.execute(
            "INSERT INTO turns(conv_id,role,content,ts,anchor_id,meta_json) VALUES(?,?,?,?,?,?);",
            (conv_id, "assistant", assistant_message, ts, "", _json_dump(assistant_meta)),
        )
        cur.execute("UPDATE sessions SET updated_at=? WHERE conv_id=?;", (ts, conv_id))
        cur.execute("COMMIT")
    except Exception:
        cur.execute("ROLLBACK")
        raise
    finally:
        con.close()


# -----------------------------------------------------------------------------
# People (routers/people.py)
# -----------------------------------------------------------------------------
# WO-13 Phase 3 — narrator_type constants
NARRATOR_TYPES = ("live", "reference")


def _normalise_narrator_type(value: Optional[str]) -> str:
    if value is None:
        return "live"
    v = str(value).strip().lower()
    if v not in NARRATOR_TYPES:
        raise ValueError(f"narrator_type must be one of {NARRATOR_TYPES}; got {value!r}")
    return v


def create_person(
    display_name: str,
    role: str = "",
    date_of_birth: str = "",
    place_of_birth: str = "",
    narrator_type: str = "live",
) -> Dict[str, Any]:
    init_db()
    pid = _uuid()
    now = _now_iso()
    nt = _normalise_narrator_type(narrator_type)
    con = _connect()
    con.execute(
        """
        INSERT INTO people(id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at,narrator_type)
        VALUES(?,?,?,?,?,?,?,?);
        """,
        (pid, display_name, role or "", _sanitise_dob(date_of_birth), place_of_birth or "", now, now, nt),
    )
    con.commit()
    con.close()
    ensure_profile(pid)
    # v7.4D — log person creation for DB verification (Phase 0)
    logger.info(
        "DB create_person: id=%s name=%r dob=%r pob=%r narrator_type=%s",
        pid, display_name, date_of_birth, place_of_birth, nt,
    )
    return get_person(pid) or {"id": pid, "display_name": display_name}


def update_person(
    person_id: str,
    display_name: Optional[str] = None,
    role: Optional[str] = None,
    date_of_birth: Optional[str] = None,
    place_of_birth: Optional[str] = None,
    narrator_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    init_db()
    now = _now_iso()
    nt = _normalise_narrator_type(narrator_type) if narrator_type is not None else None
    con = _connect()
    row = con.execute("SELECT id FROM people WHERE id=?;", (person_id,)).fetchone()
    if not row:
        con.close()
        return None
    con.execute(
        """
        UPDATE people
        SET display_name=COALESCE(?,display_name),
            role=COALESCE(?,role),
            date_of_birth=COALESCE(?,date_of_birth),
            place_of_birth=COALESCE(?,place_of_birth),
            narrator_type=COALESCE(?,narrator_type),
            updated_at=?
        WHERE id=?;
        """,
        (
            display_name,
            role,
            _sanitise_dob(date_of_birth) if date_of_birth is not None else None,
            place_of_birth,
            nt,
            now,
            person_id,
        ),
    )
    con.commit()
    con.close()
    return get_person(person_id)


def list_people(limit: int = 50, offset: int = 0, include_deleted: bool = False) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    if include_deleted:
        rows = con.execute(
            """
            SELECT id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at,
                   narrator_type,is_deleted,deleted_at,undo_expires_at
            FROM people
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?;
            """,
            (int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            """
            SELECT id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at,
                   narrator_type
            FROM people
            WHERE is_deleted = 0
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?;
            """,
            (int(limit), int(offset)),
        ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def get_person(person_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        """
        SELECT id,display_name,role,date_of_birth,place_of_birth,created_at,updated_at,
               narrator_type
        FROM people WHERE id=?;
        """,
        (person_id,),
    ).fetchone()
    con.close()
    return dict(row) if row else None


# -----------------------------------------------------------------------------
# WO-13 Phase 3 — Reference narrator helpers
# -----------------------------------------------------------------------------
def get_narrator_type(person_id: str) -> Optional[str]:
    """Return 'live' | 'reference' | None (if person does not exist)."""
    p = get_person(person_id)
    if not p:
        return None
    return (p.get("narrator_type") or "live").lower()


def is_reference_narrator(person_id: str) -> bool:
    return get_narrator_type(person_id) == "reference"


def set_narrator_type(person_id: str, narrator_type: str) -> Optional[Dict[str, Any]]:
    return update_person(person_id, narrator_type=narrator_type)


# -----------------------------------------------------------------------------
# Profiles (routers/profiles.py)
# -----------------------------------------------------------------------------
def ensure_profile(person_id: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        "INSERT OR IGNORE INTO profiles(person_id,profile_json,updated_at) VALUES(?,?,?);",
        (person_id, "{}", now),
    )
    con.commit()
    con.close()


def get_profile(person_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT person_id,profile_json,updated_at FROM profiles WHERE person_id=?;",
        (person_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    return {
        "person_id": row["person_id"],
        "profile_json": _json_load(row["profile_json"], {}),
        "updated_at": row["updated_at"],
    }


def update_profile_json(person_id: str, profile_json: Dict[str, Any], merge: bool = True, reason: str = "") -> Dict[str, Any]:
    init_db()
    ensure_profile(person_id)
    cur_prof = get_profile(person_id) or {"profile_json": {}}
    merged: Dict[str, Any]
    if merge:
        merged = dict(cur_prof.get("profile_json") or {})
        merged.update(profile_json or {})
    else:
        merged = profile_json or {}

    now = _now_iso()
    con = _connect()
    con.execute(
        "UPDATE profiles SET profile_json=?, updated_at=? WHERE person_id=?;",
        (_json_dump(merged), now, person_id),
    )
    con.commit()
    con.close()
    # v7.4D — log profile saves for DB verification (Phase 0)
    logger.info("DB update_profile_json: person_id=%s reason=%r keys=%s", person_id, reason or "unspecified", list(merged.keys()))
    return get_profile(person_id) or {"person_id": person_id, "profile_json": merged, "updated_at": now}


def ingest_basic_info_document(
    person_id: str,
    document: Any,
    create_relatives: bool = False,
) -> Dict[str, Any]:
    """Ingest a basic-info form document into the profile.

    ``document`` may be a dict (from the JSON form) or a legacy plain-text string.
    ``create_relatives`` is accepted and stored; relative creation is not yet
    implemented — the flag is preserved so callers do not crash.
    """
    init_db()
    p = get_profile(person_id) or {"profile_json": {}}
    prof = dict(p.get("profile_json") or {})
    ingest = dict(prof.get("ingest") or {})
    if isinstance(document, str):
        ingest["basic_info"] = {"text": document, "ts": _now_iso()}
    else:
        ingest["basic_info"] = {
            "document": document or {},
            "create_relatives": create_relatives,
            "ts": _now_iso(),
        }
    prof["ingest"] = ingest
    return update_profile_json(person_id, prof, merge=False)


def _set_path(obj: Dict[str, Any], path: str, value: Any) -> None:
    keys = [k for k in (path or "").split(".") if k]
    if not keys:
        return
    cur: Any = obj
    for k in keys[:-1]:
        if not isinstance(cur, dict):
            return
        if k not in cur or not isinstance(cur[k], dict):
            cur[k] = {}
        cur = cur[k]
    if isinstance(cur, dict):
        cur[keys[-1]] = value


def update_profile_field(person_id: str, profile_path: str, value: Any) -> None:
    init_db()
    ensure_profile(person_id)
    p = get_profile(person_id) or {"profile_json": {}}
    prof = dict(p.get("profile_json") or {})
    _set_path(prof, profile_path, value)
    update_profile_json(person_id, prof, merge=False)


# -----------------------------------------------------------------------------
# Media (routers/media.py)
# Bug MB-01 fix: updated signatures to match what the router actually sends.
# Original function accepted (kind, filename, mime, bytes, sha256, meta) but
# the router called with (file_path, mime_type, description, taken_at, ...).
# -----------------------------------------------------------------------------
def add_media(
    person_id: Optional[str],
    filename: str,
    mime: str,
    bytes: int = 0,
    sha256: str = "",
    kind: str = "image",
    description: str = "",
    taken_at: Optional[str] = None,
    location_name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    exif: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    mid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO media(
          id, person_id, kind, filename, mime, bytes, sha256, created_at,
          description, taken_at, location_name, latitude, longitude, exif_json, meta_json
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            mid, person_id, kind or "image", filename or "", mime or "",
            int(bytes or 0), sha256 or "", now,
            description or "", taken_at, location_name,
            latitude, longitude,
            _json_dump(exif or {}), "{}",
        ),
    )
    con.commit()
    con.close()
    return {
        "id": mid, "person_id": person_id, "kind": kind, "filename": filename,
        "mime": mime, "bytes": int(bytes or 0), "sha256": sha256, "created_at": now,
        "description": description, "taken_at": taken_at, "location_name": location_name,
        "latitude": latitude, "longitude": longitude, "exif": exif or {},
    }


def list_media(person_id: Optional[str] = None, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    cols = (
        "id, person_id, kind, filename, mime, bytes, sha256, created_at, "
        "description, taken_at, location_name, latitude, longitude, exif_json"
    )
    if person_id:
        rows = con.execute(
            f"SELECT {cols} FROM media WHERE person_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?;",
            (person_id, int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            f"SELECT {cols} FROM media ORDER BY created_at DESC LIMIT ? OFFSET ?;",
            (int(limit), int(offset)),
        ).fetchall()
    con.close()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["exif"] = _json_load(d.pop("exif_json", "{}"), {})
        out.append(d)
    return out


def get_media_item(media_id: str) -> Optional[Dict[str, Any]]:
    """Return a single media row by id, or None if not found."""
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT id,person_id,kind,filename,mime,bytes,sha256,created_at,"
        "description,taken_at,location_name,latitude,longitude,exif_json "
        "FROM media WHERE id=?;",
        (media_id,),
    ).fetchone()
    con.close()
    if not row:
        return None
    d = dict(row)
    d["exif"] = _json_load(d.pop("exif_json", "{}"), {})
    return d


def delete_media(media_id: str) -> bool:
    """Delete a media row. Returns True if a row was deleted."""
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM media WHERE id=?;", (media_id,))
    deleted = cur.rowcount > 0
    con.commit()
    con.close()
    return deleted


# Media attachments — links a photo to a memoir section or fact
# -----------------------------------------------------------------------------
def add_media_attachment(
    media_id: str,
    entity_type: str,
    entity_id: str,
    person_id: Optional[str] = None,
) -> Dict[str, Any]:
    init_db()
    aid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        "INSERT INTO media_attachments(id,media_id,entity_type,entity_id,person_id,created_at) VALUES(?,?,?,?,?,?);",
        (aid, media_id, entity_type, entity_id, person_id, now),
    )
    con.commit()
    con.close()
    return {"id": aid, "media_id": media_id, "entity_type": entity_type,
            "entity_id": entity_id, "person_id": person_id, "created_at": now}


def delete_media_attachment(attachment_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM media_attachments WHERE id=?;", (attachment_id,))
    deleted = cur.rowcount > 0
    con.commit()
    con.close()
    return deleted


def list_media_attachments(person_id: Optional[str] = None, media_id: Optional[str] = None) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    if media_id:
        rows = con.execute(
            "SELECT id,media_id,entity_type,entity_id,person_id,created_at "
            "FROM media_attachments WHERE media_id=? ORDER BY created_at ASC;",
            (media_id,),
        ).fetchall()
    elif person_id:
        rows = con.execute(
            "SELECT id,media_id,entity_type,entity_id,person_id,created_at "
            "FROM media_attachments WHERE person_id=? ORDER BY created_at ASC;",
            (person_id,),
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT id,media_id,entity_type,entity_id,person_id,created_at "
            "FROM media_attachments ORDER BY created_at ASC;"
        ).fetchall()
    con.close()
    return [dict(r) for r in rows]


# -----------------------------------------------------------------------------
# Timeline (routers/timeline.py)
# -----------------------------------------------------------------------------
def add_timeline_event(
    person_id: str,
    date: str,
    title: str,
    body: str = "",
    kind: str = "event",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    eid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO timeline_events(id,person_id,date,title,body,kind,created_at,meta_json)
        VALUES(?,?,?,?,?,?,?,?);
        """,
        (eid, person_id, date, title, body or "", kind or "event", now, _json_dump(meta or {})),
    )
    con.commit()
    con.close()
    return {"id": eid, "person_id": person_id, "date": date, "title": title, "body": body or "", "kind": kind or "event", "created_at": now, "meta": meta or {}}


def list_timeline_events(person_id: str, limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,person_id,date,title,body,kind,created_at,meta_json
        FROM timeline_events
        WHERE person_id=?
        ORDER BY date ASC, created_at ASC
        LIMIT ? OFFSET ?;
        """,
        (person_id, int(limit), int(offset)),
    ).fetchall()
    con.close()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        out.append(d)
    return out


def delete_timeline_event(event_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM timeline_events WHERE id=?;", (event_id,))
    con.commit()
    con.close()
    return cur.rowcount > 0


# -----------------------------------------------------------------------------
# Interview helpers (routers/interview.py)
# -----------------------------------------------------------------------------
def start_session(person_id: str, plan_id: str = "default") -> Dict[str, Any]:
    init_db()
    sid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO interview_sessions(id,person_id,plan_id,started_at,updated_at,active_question_id)
        VALUES(?,?,?,?,?,NULL);
        """,
        (sid, person_id, plan_id or "default", now, now),
    )
    con.commit()
    con.close()
    return {"id": sid, "person_id": person_id, "plan_id": plan_id or "default", "started_at": now, "updated_at": now}


def get_interview_session(session_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT id,person_id,plan_id,started_at,updated_at,active_question_id FROM interview_sessions WHERE id=?;",
        (session_id,),
    ).fetchone()
    con.close()
    return dict(row) if row else None


def set_session_active_question(session_id: str, question_id: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        "UPDATE interview_sessions SET active_question_id=?, updated_at=? WHERE id=?;",
        (question_id, now, session_id),
    )
    con.commit()
    con.close()


def get_question(question_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    row = con.execute(
        """
        SELECT id,plan_id,section_id,ord,prompt,kind,required,profile_path
        FROM interview_questions WHERE id=?;
        """,
        (question_id,),
    ).fetchone()
    con.close()
    return dict(row) if row else None


def count_plan_questions(plan_id: str) -> int:
    """Return the number of questions seeded for plan_id. Used as a startup guard."""
    init_db()
    con = _connect()
    row = con.execute(
        "SELECT COUNT(*) AS n FROM interview_questions WHERE plan_id=?;",
        (plan_id or "default",),
    ).fetchone()
    con.close()
    return int(row["n"]) if row else 0


def get_next_question(session_id: str, plan_id: str, current_question_id: Optional[str]) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    plan_id = plan_id or "default"

    if not current_question_id:
        row = con.execute(
            """
            SELECT id,section_id,prompt,kind,required,profile_path,ord
            FROM interview_questions
            WHERE plan_id=?
            ORDER BY ord ASC
            LIMIT 1;
            """,
            (plan_id,),
        ).fetchone()
        con.close()
        return dict(row) if row else None

    cur_row = con.execute(
        "SELECT ord FROM interview_questions WHERE id=? AND plan_id=?;",
        (current_question_id, plan_id),
    ).fetchone()
    cur_ord = int(cur_row["ord"]) if cur_row else -1

    row = con.execute(
        """
        SELECT id,section_id,prompt,kind,required,profile_path,ord
        FROM interview_questions
        WHERE plan_id=? AND ord>?
        ORDER BY ord ASC
        LIMIT 1;
        """,
        (plan_id, cur_ord),
    ).fetchone()

    con.close()
    return dict(row) if row else None


def add_answer(session_id: str, question_id: str, answer: str, skipped: bool, person_id: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        """
        INSERT INTO interview_answers(id,session_id,person_id,question_id,answer,skipped,ts)
        VALUES(?,?,?,?,?,?,?);
        """,
        (_uuid(), session_id, person_id, question_id, answer or "", 1 if skipped else 0, now),
    )
    con.execute("UPDATE interview_sessions SET updated_at=? WHERE id=?;", (now, session_id))
    con.commit()
    con.close()


# -----------------------------------------------------------------------------
# RAG minimal
# -----------------------------------------------------------------------------
def _tokenize(s: str) -> List[str]:
    import re
    return re.findall(r"[a-z0-9']{2,}", (s or "").lower())


def _chunk_text(text: str, size: int = 900) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    paras = [p.strip() for p in text.split("\n") if p.strip()]
    chunks: List[str] = []
    buf = ""
    for p in paras:
        if len(buf) + len(p) + 1 <= size:
            buf = (buf + "\n" + p) if buf else p
        else:
            if buf:
                chunks.append(buf)
            buf = p
    if buf:
        chunks.append(buf)
    return chunks




def rag_get_doc_text(doc_id: str) -> str:
    """Return the raw text for a specific RAG doc id, or '' if missing."""
    init_db()
    con = _connect()
    row = con.execute("SELECT text FROM rag_docs WHERE id=?;", (doc_id,)).fetchone()
    con.close()
    return row["text"] if row else ""

def rag_add_doc(doc_id: str, title: str, source: str, text: str) -> None:
    init_db()
    con = _connect()
    now = _now_iso()
    con.execute(
        "INSERT OR REPLACE INTO rag_docs(id,title,source,created_at,text) VALUES(?,?,?,?,?);",
        (doc_id, title, source, now, text),
    )
    con.execute("DELETE FROM rag_chunks WHERE doc_id=?;", (doc_id,))
    for i, ch in enumerate(_chunk_text(text, 900)):
        con.execute(
            "INSERT OR REPLACE INTO rag_chunks(id,doc_id,chunk_index,text) VALUES(?,?,?,?);",
            (f"{doc_id}::c{i}", doc_id, i, ch),
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


def rag_query(query: str, k: int = 5, only_ids: Optional[List[str]] = None, only_doc_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    tokens = [t for t in _tokenize((query or "").strip()) if t]
    if not tokens:
        return []
    k = max(1, min(int(k), 20))
    rows = con.execute(
        """
        SELECT c.id AS chunk_id, c.doc_id, c.text AS chunk_text, d.title AS doc_title, d.source AS doc_source
        FROM rag_chunks c JOIN rag_docs d ON d.id = c.doc_id;
        """
    ).fetchall()
    con.close()

    hits: List[Dict[str, Any]] = []
    for r in rows:
        cid = r["chunk_id"]
        # Back-compat: only_ids filters by chunk_id; only_doc_ids filters by doc_id.
        if only_doc_ids and r["doc_id"] not in only_doc_ids:
            continue
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
            hits.append(
                {
                    "id": cid,
                    "doc_id": r["doc_id"],
                    "title": r["doc_title"] or "",
                    "source": r["doc_source"] or "",
                    "score": score,
                    "snippet": (r["chunk_text"] or "")[:420].strip(),
                }
            )
    hits.sort(key=lambda x: (-x["score"], x["title"]))
    return hits[:k]


# -----------------------------------------------------------------------------
# Section summaries
# -----------------------------------------------------------------------------
def save_section_summary(
    session_id: str,
    person_id: str,
    section_id: str,
    section_title: str,
    summary: str,
) -> Dict[str, Any]:
    init_db()
    sid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT OR REPLACE INTO section_summaries(id,session_id,person_id,section_id,section_title,summary,created_at)
        VALUES(?,?,?,?,?,?,?);
        """,
        (sid, session_id, person_id, section_id, section_title or "", summary or "", now),
    )
    con.commit()
    con.close()
    return {
        "id": sid, "session_id": session_id, "person_id": person_id,
        "section_id": section_id, "section_title": section_title,
        "summary": summary, "created_at": now,
    }


def list_section_summaries(session_id: str) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,session_id,person_id,section_id,section_title,summary,created_at
        FROM section_summaries WHERE session_id=? ORDER BY created_at ASC;
        """,
        (session_id,),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


# -----------------------------------------------------------------------------
# Interview progress helper
# -----------------------------------------------------------------------------
def get_interview_progress(session_id: str, plan_id: str) -> Dict[str, Any]:
    """
    Return total questions, answered count, and current section info.
    Used for the UI progress indicator.
    """
    init_db()
    con = _connect()

    total = con.execute(
        "SELECT COUNT(*) AS n FROM interview_questions WHERE plan_id=?;",
        (plan_id,),
    ).fetchone()["n"]

    answered = con.execute(
        "SELECT COUNT(*) AS n FROM interview_answers WHERE session_id=?;",
        (session_id,),
    ).fetchone()["n"]

    # Current active question details
    sess_row = con.execute(
        "SELECT active_question_id FROM interview_sessions WHERE id=?;",
        (session_id,),
    ).fetchone()
    active_qid = sess_row["active_question_id"] if sess_row else None

    current_section_title = ""
    current_question_ord = 0
    if active_qid:
        q_row = con.execute(
            """
            SELECT iq.ord, isec.title
            FROM interview_questions iq
            LEFT JOIN interview_sections isec ON isec.id = iq.section_id
            WHERE iq.id=?;
            """,
            (active_qid,),
        ).fetchone()
        if q_row:
            current_question_ord = int(q_row["ord"] or 0)
            current_section_title = q_row["title"] or ""

    con.close()

    pct = round((answered / total * 100)) if total > 0 else 0
    return {
        "total": int(total),
        "answered": int(answered),
        "remaining": max(0, int(total) - int(answered)),
        "percent": pct,
        "current_ord": current_question_ord,
        "current_section": current_section_title,
    }


# -----------------------------------------------------------------------------
# Facts  (atomic, source-backed claims)
# -----------------------------------------------------------------------------
def add_fact(
    person_id: str,
    statement: str,
    fact_type: str = "general",
    date_text: str = "",
    date_normalized: str = "",
    confidence: float = 0.0,
    status: str = "extracted",
    inferred: bool = False,
    session_id: Optional[str] = None,
    source_turn_index: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
    # Meaning Engine fields (Phase A+B — Bug MAT-01 fix)
    meaning_tags: Optional[List[str]] = None,
    narrative_role: Optional[str] = None,
    experience: Optional[str] = None,
    reflection: Optional[str] = None,
) -> Dict[str, Any]:
    init_db()
    fid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO facts(
          id,person_id,session_id,fact_type,statement,
          date_text,date_normalized,confidence,status,inferred,
          source_turn_index,created_at,updated_at,meta_json,
          meaning_tags_json,narrative_role,experience,reflection
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            fid, person_id, session_id, fact_type or "general", statement,
            date_text or "", date_normalized or "",
            float(confidence or 0.0), status or "extracted",
            1 if inferred else 0, source_turn_index, now, now,
            _json_dump(meta or {}),
            _json_dump(meaning_tags or []),
            narrative_role or None,
            experience or None,
            reflection or None,
        ),
    )
    con.commit()
    con.close()
    return {
        "id": fid, "person_id": person_id, "session_id": session_id,
        "fact_type": fact_type, "statement": statement,
        "date_text": date_text, "date_normalized": date_normalized,
        "confidence": float(confidence or 0.0), "status": status or "extracted",
        "inferred": bool(inferred), "created_at": now,
        "meaning_tags": meaning_tags or [],
        "narrative_role": narrative_role,
        "experience": experience,
        "reflection": reflection,
    }


def list_facts(
    person_id: str,
    status: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    _FACTS_COLS = """
        id,person_id,session_id,fact_type,statement,date_text,
        date_normalized,confidence,status,inferred,source_turn_index,
        created_at,meta_json,meaning_tags_json,narrative_role,experience,reflection
    """
    if status:
        rows = con.execute(
            f"SELECT {_FACTS_COLS} FROM facts WHERE person_id=? AND status=? "
            "ORDER BY created_at ASC LIMIT ? OFFSET ?;",
            (person_id, status, int(limit), int(offset)),
        ).fetchall()
    else:
        rows = con.execute(
            f"SELECT {_FACTS_COLS} FROM facts WHERE person_id=? "
            "ORDER BY created_at ASC LIMIT ? OFFSET ?;",
            (person_id, int(limit), int(offset)),
        ).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        d["meaning_tags"] = _json_load(d.pop("meaning_tags_json", "[]"), [])
        d["inferred"] = bool(d.get("inferred"))
        out.append(d)
    return out


def update_fact_status(fact_id: str, status: str) -> bool:
    init_db()
    now = _now_iso()
    con = _connect()
    cur = con.execute(
        "UPDATE facts SET status=?, updated_at=? WHERE id=?;",
        (status, now, fact_id),
    )
    con.commit()
    con.close()
    return cur.rowcount > 0


def delete_fact(fact_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM facts WHERE id=?;", (fact_id,))
    con.commit()
    con.close()
    return cur.rowcount > 0


# -----------------------------------------------------------------------------
# WO-13 — Family Truth helpers (notes + rows)
#
# This is the new write path for narrative memory. Legacy `facts` stays frozen.
#   * family_truth_notes  = shadow archive (raw text, append-only)
#   * family_truth_rows   = structured proposals; promoted truth is the subset
#                           with status in ('approve','approve_q')
#
# Valid row statuses (five-status vocabulary from WO-13 v2):
#   approve | approve_q | needs_verify | source_only | reject
# -----------------------------------------------------------------------------
FT_ROW_STATUSES = ("approve", "approve_q", "needs_verify", "source_only", "reject")
FT_EXTRACTION_METHODS = ("llm", "rules", "hybrid", "rules_fallback", "backfill", "manual", "questionnaire")

# WO-13 Phase 4/6/7 — The five identity-critical fields.
# These fields can NEVER be promoted from a rules_fallback row (regex-based
# client-side extraction). They MAY be promoted from a manual, llm, or
# questionnaire source, but the rules_fallback path is permanently blocked
# as defence in depth against the WO-12B contamination class.
FT_PROTECTED_IDENTITY_FIELDS = (
    "personal.fullName",
    "personal.preferredName",
    "personal.dateOfBirth",
    "personal.placeOfBirth",
    "personal.birthOrder",
)


def ft_add_note(
    person_id: str,
    body: str,
    source_kind: str = "chat",
    source_ref: str = "",
    created_by: str = "system",
) -> Dict[str, Any]:
    """Append a raw shadow-archive note. Never promoted directly."""
    init_db()
    nid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO family_truth_notes(
          id, person_id, body, source_kind, source_ref,
          created_at, created_by, review_locked
        ) VALUES(?,?,?,?,?,?,?,0);
        """,
        (nid, person_id, body or "", source_kind or "chat", source_ref or "", now, created_by or "system"),
    )
    con.commit()
    con.close()
    return {
        "id": nid,
        "person_id": person_id,
        "body": body or "",
        "source_kind": source_kind or "chat",
        "source_ref": source_ref or "",
        "created_at": now,
        "created_by": created_by or "system",
        "review_locked": 0,
    }


def ft_list_notes(person_id: str, limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        "SELECT id,person_id,body,source_kind,source_ref,created_at,created_by,review_locked "
        "FROM family_truth_notes WHERE person_id=? "
        "ORDER BY created_at ASC LIMIT ? OFFSET ?;",
        (person_id, int(limit), int(offset)),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def ft_get_note(note_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    r = con.execute(
        "SELECT id,person_id,body,source_kind,source_ref,created_at,created_by,review_locked "
        "FROM family_truth_notes WHERE id=?;",
        (note_id,),
    ).fetchone()
    con.close()
    return dict(r) if r else None


def ft_add_row(
    person_id: str,
    field: str,
    source_says: str,
    note_id: Optional[str] = None,
    subject_name: str = "",
    relationship: str = "self",
    status: str = "needs_verify",
    approved_value: str = "",
    qualification: str = "",
    confidence: float = 0.0,
    narrative_role: str = "",
    meaning_tags: Optional[List[str]] = None,
    provenance: Optional[Dict[str, Any]] = None,
    extraction_method: str = "manual",
    legacy_suspect: int = 0,
    source_fact_id: str = "",
) -> Dict[str, Any]:
    """Create a new structured proposal row in family_truth_rows.

    Status defaults to `needs_verify`. `approve` and `approve_q` are only set
    through the review endpoints or the promotion flow.
    """
    if status not in FT_ROW_STATUSES:
        raise ValueError(f"invalid status {status!r}, expected one of {FT_ROW_STATUSES}")
    init_db()
    rid = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO family_truth_rows(
          id, person_id, note_id, subject_name, relationship, field,
          source_says, approved_value, status, qualification,
          reviewer, reviewed_at, confidence, narrative_role, meaning_tags,
          provenance, legacy_suspect, extraction_method, source_fact_id,
          created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            rid,
            person_id,
            note_id,
            subject_name or "",
            relationship or "self",
            field,
            source_says or "",
            approved_value or "",
            status,
            qualification or "",
            "",
            "",
            float(confidence or 0.0),
            narrative_role or "",
            _json_dump(meaning_tags or []),
            _json_dump(provenance or {}),
            int(legacy_suspect or 0),
            extraction_method or "manual",
            source_fact_id or "",
            now,
            now,
        ),
    )
    con.commit()
    con.close()
    return ft_get_row(rid) or {}


def ft_get_row(row_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    con = _connect()
    r = con.execute(
        "SELECT * FROM family_truth_rows WHERE id=?;", (row_id,)
    ).fetchone()
    con.close()
    if not r:
        return None
    d = dict(r)
    d["meaning_tags"] = _json_load(d.get("meaning_tags"), [])
    d["provenance"] = _json_load(d.get("provenance"), {})
    return d


def ft_list_rows(
    person_id: str,
    status: Optional[Union[str, List[str]]] = None,
    include_suspect: bool = True,
    subject_name: Optional[str] = None,
    field: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    where = ["person_id = ?"]
    params: List[Any] = [person_id]
    if status:
        if isinstance(status, str):
            status_list = [s.strip() for s in status.split(",") if s.strip()]
        else:
            status_list = list(status)
        if status_list:
            where.append(f"status IN ({','.join('?' * len(status_list))})")
            params.extend(status_list)
    if not include_suspect:
        where.append("legacy_suspect = 0")
    if subject_name:
        where.append("subject_name = ?")
        params.append(subject_name)
    if field:
        where.append("field = ?")
        params.append(field)
    sql = (
        "SELECT * FROM family_truth_rows WHERE " + " AND ".join(where) +
        " ORDER BY created_at ASC LIMIT ? OFFSET ?;"
    )
    params.extend([int(limit), int(offset)])
    rows = con.execute(sql, tuple(params)).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meaning_tags"] = _json_load(d.get("meaning_tags"), [])
        d["provenance"] = _json_load(d.get("provenance"), {})
        out.append(d)
    return out


def ft_update_row(
    row_id: str,
    status: Optional[str] = None,
    approved_value: Optional[str] = None,
    qualification: Optional[str] = None,
    reviewer: Optional[str] = None,
    subject_name: Optional[str] = None,
    relationship: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Reviewer-facing partial update. Records `reviewed_at` whenever status changes."""
    if status is not None and status not in FT_ROW_STATUSES:
        raise ValueError(f"invalid status {status!r}, expected one of {FT_ROW_STATUSES}")
    init_db()
    current = ft_get_row(row_id)
    if not current:
        return None
    fields: List[str] = []
    params: List[Any] = []
    if status is not None and status != current.get("status"):
        fields.append("status = ?")
        params.append(status)
        fields.append("reviewed_at = ?")
        params.append(_now_iso())
        if reviewer is not None:
            fields.append("reviewer = ?")
            params.append(reviewer)
    elif reviewer is not None:
        fields.append("reviewer = ?")
        params.append(reviewer)
    if approved_value is not None:
        fields.append("approved_value = ?")
        params.append(approved_value)
    if qualification is not None:
        fields.append("qualification = ?")
        params.append(qualification)
    if subject_name is not None:
        fields.append("subject_name = ?")
        params.append(subject_name)
    if relationship is not None:
        fields.append("relationship = ?")
        params.append(relationship)
    if not fields:
        return current
    fields.append("updated_at = ?")
    params.append(_now_iso())
    params.append(row_id)
    con = _connect()
    con.execute(
        f"UPDATE family_truth_rows SET {', '.join(fields)} WHERE id = ?;",
        tuple(params),
    )
    con.commit()
    con.close()
    return ft_get_row(row_id)


def ft_bulk_update_rows(
    row_ids: List[str],
    status: str,
    reviewer: Optional[str] = None,
) -> int:
    """Bulk status update used for e.g. 'bulk dismiss legacy_suspect'. Returns count."""
    if status not in FT_ROW_STATUSES:
        raise ValueError(f"invalid status {status!r}")
    if not row_ids:
        return 0
    init_db()
    now = _now_iso()
    con = _connect()
    placeholders = ",".join("?" * len(row_ids))
    con.execute(
        f"UPDATE family_truth_rows SET status=?, reviewer=COALESCE(?, reviewer), "
        f"reviewed_at=?, updated_at=? WHERE id IN ({placeholders});",
        tuple([status, reviewer, now, now, *row_ids]),
    )
    n = con.total_changes
    con.commit()
    con.close()
    return n


def ft_row_audit(row_id: str) -> Optional[Dict[str, Any]]:
    """Return provenance + full row snapshot for audit UI (Phase 2 surface).

    A full append-only audit log is deferred to Phase 7; for now we return
    the row's current state plus its provenance JSON, which is sufficient
    for the review UI to display where a claim came from.
    """
    row = ft_get_row(row_id)
    if not row:
        return None
    return {
        "row": row,
        "provenance": row.get("provenance") or {},
        "legacy_suspect": row.get("legacy_suspect") or 0,
        "extraction_method": row.get("extraction_method") or "",
        "source_fact_id": row.get("source_fact_id") or "",
    }


def _ft_is_protected_identity_field(field: str) -> bool:
    """True when `field` is one of the five identity-critical fields that
    can never be promoted from a rules_fallback row."""
    return str(field or "").strip() in FT_PROTECTED_IDENTITY_FIELDS


def _ft_promoted_content_hash(
    value: str,
    qualification: str,
    status: str,
    extraction_method: str,
    subject_name: str,
    relationship: str,
    source_says: str,
) -> str:
    """Stable hash over the fields that define 'meaning' of a promoted row.

    If this hash is unchanged on an upsert, the row is considered a no-op
    and `updated_at` is NOT touched — which is what makes idempotency
    directly provable with a timestamp check.
    """
    import hashlib
    payload = "\x1e".join([
        value or "",
        qualification or "",
        status or "",
        extraction_method or "",
        subject_name or "",
        relationship or "",
        source_says or "",
    ])
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def ft_get_promoted(person_id: str, subject_name: str, field: str) -> Optional[Dict[str, Any]]:
    """Fetch a single promoted row by the natural key."""
    init_db()
    con = _connect()
    r = con.execute(
        "SELECT * FROM family_truth_promoted "
        "WHERE person_id=? AND subject_name=? AND field=?;",
        (person_id, subject_name or "", field),
    ).fetchone()
    con.close()
    return dict(r) if r else None


def ft_list_promoted(
    person_id: str,
    subject_name: Optional[str] = None,
    field: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List promoted rows for a person. Optional filters by subject/field."""
    init_db()
    con = _connect()
    where = ["person_id = ?"]
    params: List[Any] = [person_id]
    if subject_name is not None:
        where.append("subject_name = ?")
        params.append(subject_name)
    if field is not None:
        where.append("field = ?")
        params.append(field)
    sql = (
        "SELECT * FROM family_truth_promoted WHERE " + " AND ".join(where) +
        " ORDER BY updated_at DESC LIMIT ? OFFSET ?;"
    )
    params.extend([int(limit), int(offset)])
    rows = con.execute(sql, tuple(params)).fetchall()
    con.close()
    return [dict(r) for r in rows]


def ft_promoted_upsert(row_id: str, reviewer: str = "") -> Dict[str, Any]:
    """Upsert a proposal row into family_truth_promoted, keyed by
    (person_id, subject_name, field).

    Returns a dict with:
      - ok          : bool
      - op          : 'created' | 'updated' | 'noop' | 'blocked' | 'skipped'
      - reason      : str  (only for blocked/skipped)
      - record      : dict (the promoted row, or None)
      - row_id      : the source row id
      - from_status : the source row status at time of promotion

    Rules:
      - Source row must exist and have status in ('approve','approve_q').
        Anything else returns op='skipped' with reason='not_approved'.
      - Protected identity fields coming from rules_fallback are refused
        with op='blocked' reason='protected_identity_rules_fallback'.
      - When the content hash is unchanged the existing record's
        updated_at is not touched; op='noop' is returned.
      - When no prior record exists the row is INSERTed; op='created'.
      - When values differ from the existing record the row is UPDATEd;
        op='updated' and updated_at is refreshed.
    """
    init_db()
    src = ft_get_row(row_id)
    if not src:
        return {"ok": False, "op": "skipped", "reason": "row_not_found",
                "record": None, "row_id": row_id, "from_status": None}

    if src.get("status") not in ("approve", "approve_q"):
        return {"ok": False, "op": "skipped", "reason": "not_approved",
                "record": None, "row_id": row_id,
                "from_status": src.get("status")}

    field = (src.get("field") or "").strip()
    extraction = (src.get("extraction_method") or "").strip()
    if _ft_is_protected_identity_field(field) and extraction == "rules_fallback":
        return {"ok": False, "op": "blocked",
                "reason": "protected_identity_rules_fallback",
                "record": None, "row_id": row_id,
                "from_status": src.get("status")}

    person_id = src["person_id"]
    subject_name = (src.get("subject_name") or "").strip()
    relationship = (src.get("relationship") or "self").strip()
    source_says = src.get("source_says") or ""
    qualification = src.get("qualification") or ""
    status = src.get("status") or "approve"
    # The canonical value: prefer a reviewer-approved value; otherwise fall
    # back to the narrator's source_says. This matches the review UI, which
    # stores explicit approved_value only when the reviewer edits the text.
    value = (src.get("approved_value") or "").strip() or source_says
    confidence = float(src.get("confidence") or 0.0)
    note_id = src.get("note_id") or ""

    new_hash = _ft_promoted_content_hash(
        value=value,
        qualification=qualification,
        status=status,
        extraction_method=extraction,
        subject_name=subject_name,
        relationship=relationship,
        source_says=source_says,
    )

    existing = ft_get_promoted(person_id, subject_name, field)
    now = _now_iso()
    con = _connect()
    if existing is None:
        pid = _uuid()
        con.execute(
            """
            INSERT INTO family_truth_promoted(
              id, person_id, subject_name, relationship, field, value,
              qualification, status, source_row_id, source_note_id,
              source_says, extraction_method, confidence, reviewer,
              content_hash, created_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
            """,
            (
                pid, person_id, subject_name, relationship, field, value,
                qualification, status, row_id, note_id, source_says,
                extraction, confidence, reviewer or "",
                new_hash, now, now,
            ),
        )
        con.commit()
        con.close()
        record = ft_get_promoted(person_id, subject_name, field)
        return {"ok": True, "op": "created", "record": record,
                "row_id": row_id, "from_status": status}

    # Already exists — compare hashes for true no-op semantics.
    if existing.get("content_hash") == new_hash:
        con.close()
        return {"ok": True, "op": "noop", "record": existing,
                "row_id": row_id, "from_status": status}

    con.execute(
        """
        UPDATE family_truth_promoted SET
          subject_name = ?, relationship = ?, field = ?, value = ?,
          qualification = ?, status = ?, source_row_id = ?,
          source_note_id = ?, source_says = ?, extraction_method = ?,
          confidence = ?, reviewer = ?, content_hash = ?, updated_at = ?
        WHERE id = ?;
        """,
        (
            subject_name, relationship, field, value, qualification, status,
            row_id, note_id, source_says, extraction, confidence,
            reviewer or existing.get("reviewer") or "",
            new_hash, now, existing["id"],
        ),
    )
    con.commit()
    con.close()
    record = ft_get_promoted(person_id, subject_name, field)
    return {"ok": True, "op": "updated", "record": record,
            "row_id": row_id, "from_status": status}


def ft_promote_row(row_id: str, reviewer: str = "", qualification: str = "") -> Dict[str, Any]:
    """WO-13 Phase 7 — real promotion semantics.

    Flow:
      1. Flip the source row's status to 'approve' (or 'approve_q' if a
         qualification is supplied) — preserves prior Phase 2 semantics.
      2. UPSERT into family_truth_promoted keyed by
         (person_id, subject_name, field). This is the authoritative truth
         layer that downstream consumers will read from in Phase 8.

    The return shape is:
      {
        "row":      <updated proposal row>,
        "promoted": <op result from ft_promoted_upsert>,
      }

    Idempotency is guaranteed by the content_hash check inside
    ft_promoted_upsert — calling ft_promote_row a second time with the same
    inputs returns op='noop' and does NOT advance updated_at.

    Protected identity fields from rules_fallback are still blocked: the
    source row's status flip still happens (a reviewer DID approve the
    claim, after all), but the UPSERT returns op='blocked' so no
    promoted-truth record is ever created for a rules_fallback identity
    field. Downstream readers never see it.
    """
    target_status = "approve_q" if (qualification or "").strip() else "approve"
    updated = ft_update_row(
        row_id,
        status=target_status,
        qualification=qualification or None,
        reviewer=reviewer or None,
    )
    if not updated:
        return {"row": None, "promoted": {
            "ok": False, "op": "skipped", "reason": "row_not_found",
            "record": None, "row_id": row_id, "from_status": None,
        }}
    promoted = ft_promoted_upsert(row_id, reviewer=reviewer or "")
    return {"row": updated, "promoted": promoted}


def ft_promote_all_approved(person_id: str, reviewer: str = "") -> Dict[str, Any]:
    """Bulk-upsert every approve/approve_q row for a person into
    family_truth_promoted. Drives the 'Promote approved' button in the
    Phase 6 review drawer.

    Returns counts per op-class plus the full list of results so the
    caller can show a detailed summary if desired.
    """
    init_db()
    approved = ft_list_rows(person_id=person_id, status=["approve", "approve_q"])
    results: List[Dict[str, Any]] = []
    counts = {"created": 0, "updated": 0, "noop": 0, "blocked": 0, "skipped": 0}
    for r in approved:
        res = ft_promoted_upsert(r["id"], reviewer=reviewer or "")
        results.append(res)
        op = res.get("op", "skipped")
        if op in counts:
            counts[op] += 1
    return {
        "person_id": person_id,
        "eligible": len(approved),
        "counts": counts,
        "results": results,
    }


# -----------------------------------------------------------------------------
# WO-13 Phase 8 — profile builder + backfill
# -----------------------------------------------------------------------------
#
# build_profile_from_promoted assembles a profile_json-shaped dict from
# family_truth_promoted. It is the single server-side rewire that makes
# Phase 8's "make truth visible" guarantee work — every downstream
# surface (profile form, obituary, memoir source, timeline spine, chat
# context) reads from state.profile on the client, which is populated
# from GET /api/profiles/{id}, which calls this function when
# LOREVOX_TRUTH_V2_PROFILE is on.
#
# The mapping from promoted-truth field names to profile_json.basics
# keys is deliberately narrow: only the 5 protected identity fields
# overlap directly. Everything else in basics.* (culture, country,
# pronouns, language, legal*, timeOfBirth*, zodiac*, placeOfBirth{Raw,
# Normalized}) passes through unchanged from the legacy profile_json
# blob, as do kinship[] and pets[]. This is a hybrid read: truth for
# what has been promoted, legacy for everything else.
#
# Free-form promoted rows (employment, marriage, residence, education,
# ...) go into a new basics.truth[] sidecar list. approve_q rows carry
# their qualification into basics._qualifications[field] AND into the
# truth[] entry for the same field.
#
# Empty-promoted fallback: if a person has zero promoted rows, the
# function returns the legacy profile_json unchanged so the first
# flag-flip on an unreviewed narrator produces the same output as
# flag-off. No empty-UI regression.

_PROMOTED_TO_BASICS: Dict[str, str] = {
    "personal.fullName":      "fullname",
    "personal.preferredName": "preferred",
    "personal.dateOfBirth":   "dob",
    "personal.placeOfBirth":  "pob",
    "personal.birthOrder":    "birthOrder",
}

# Inverse of _PROMOTED_TO_BASICS — used by the backfill helper.
_BASICS_TO_PROMOTED: Dict[str, str] = {v: k for k, v in _PROMOTED_TO_BASICS.items()}


def build_profile_from_promoted(person_id: str) -> Dict[str, Any]:
    """Assemble a profile_json-shaped dict from family_truth_promoted.

    Hybrid read: promoted-truth data takes precedence where it exists,
    legacy profile_json fills in everywhere else.

    Returns a dict with the same shape api_get_profile currently
    returns under key ``profile``:

        {
          "basics": {
              "fullname": ..., "preferred": ..., "dob": ..., "pob": ...,
              "birthOrder": ...,
              # unmapped basics pass through from legacy:
              "culture": ..., "country": ..., "pronouns": ...,
              "phonetic": ..., "language": ...,
              "legalFirstName": ..., "legalMiddleName": ..., "legalLastName": ...,
              "timeOfBirth": ..., "timeOfBirthDisplay": ...,
              "birthOrderCustom": ..., "zodiacSign": ...,
              "placeOfBirthRaw": ..., "placeOfBirthNormalized": ...,
              # new sidecar keys (additive — normalizeProfile tolerates them):
              "_qualifications": { "<field>": "<qualification text>" },
              "truth": [ { "subject_name", "relationship", "field",
                           "value", "qualification", "status", "reviewer",
                           "source_row_id", "updated_at" }, ... ],
          },
          "kinship": [ ... ],   # passed through unchanged
          "pets":    [ ... ],   # passed through unchanged
        }
    """
    init_db()

    # Always start from the legacy blob — this is the passthrough layer
    # for unmapped basics.* fields, kinship, and pets.
    legacy = get_profile(person_id) or {"profile_json": {}}
    legacy_profile = dict(legacy.get("profile_json") or {})
    legacy_basics = dict(legacy_profile.get("basics") or {})
    legacy_kinship = list(legacy_profile.get("kinship") or [])
    legacy_pets = list(legacy_profile.get("pets") or [])

    promoted_rows = ft_list_promoted(person_id, limit=10_000, offset=0)

    if not promoted_rows:
        # Empty-promoted fallback: behave exactly like flag-off.
        return {
            "basics": legacy_basics,
            "kinship": legacy_kinship,
            "pets": legacy_pets,
        }

    # Start from the legacy basics so unmapped fields pass through.
    basics: Dict[str, Any] = dict(legacy_basics)

    # approve_q qualification sidecar (by promoted-truth field name).
    qualifications: Dict[str, str] = {}

    # Free-form promoted rows go here (everything that doesn't map to a
    # protected identity field).
    truth_rows: List[Dict[str, Any]] = []

    for row in promoted_rows:
        field = str(row.get("field") or "")
        status = str(row.get("status") or "")
        value = row.get("value") or ""
        qualification = row.get("qualification") or ""

        if field in _PROMOTED_TO_BASICS:
            # Protected identity field — write directly into basics.
            # The Phase 7 blocking rule already filtered out
            # rules_fallback for protected fields, so anything in
            # promoted here is safe to render.
            target_key = _PROMOTED_TO_BASICS[field]
            basics[target_key] = value
            if qualification:
                qualifications[field] = qualification
        else:
            # Free-form field — append to truth[] sidecar.
            truth_rows.append({
                "subject_name":  row.get("subject_name") or "",
                "relationship":  row.get("relationship") or "self",
                "field":         field,
                "value":         value,
                "qualification": qualification,
                "status":        status,
                "reviewer":      row.get("reviewer") or "",
                "source_row_id": row.get("source_row_id") or "",
                "updated_at":    row.get("updated_at") or "",
            })
            if qualification:
                qualifications[field] = qualification

    if qualifications:
        basics["_qualifications"] = qualifications
    if truth_rows:
        basics["truth"] = truth_rows

    return {
        "basics": basics,
        "kinship": legacy_kinship,
        "pets": legacy_pets,
    }


def ft_backfill_from_profile_json(person_id: str) -> Dict[str, Any]:
    """Seed shadow notes + proposal rows from existing profile_json.

    For each protected identity field (5) that is present and
    non-empty on the legacy basics.*, create:
      1. A shadow note in family_truth_notes with
           source_kind='backfill'
           source_ref='profile_json.basics.<key>'
           created_by='backfill'
      2. A proposal row in family_truth_rows with
           status            = 'needs_verify'
           extraction_method = 'manual'
           confidence        = 1.0
           source_says       = <current value>
           subject_name      = <display_name>
           relationship      = 'self'
           field             = <promoted-truth field name>

    Does NOT auto-promote. Does NOT write to family_truth_promoted.

    Idempotent: skips any field that already has ANY row (in any
    status) for (person_id, subject_name=display_name, field=<name>),
    so re-running the backfill on a partially-reviewed narrator
    doesn't create duplicates.

    Returns {person_id, created_rows, skipped_existing, skipped_empty,
             reference_refused}.
    """
    init_db()

    person = get_person(person_id)
    if not person:
        return {
            "person_id": person_id,
            "created_rows": 0,
            "skipped_existing": 0,
            "skipped_empty": 0,
            "reference_refused": False,
            "error": "person_not_found",
        }

    # Reference narrators never get a backfill — same guard as the rest
    # of the FT write path.
    if is_reference_narrator(person_id):
        return {
            "person_id": person_id,
            "created_rows": 0,
            "skipped_existing": 0,
            "skipped_empty": 0,
            "reference_refused": True,
        }

    display_name = str(person.get("display_name") or "").strip() or "(unknown)"

    legacy = get_profile(person_id) or {"profile_json": {}}
    legacy_profile = dict(legacy.get("profile_json") or {})
    legacy_basics = dict(legacy_profile.get("basics") or {})

    # Build an index of existing proposal rows for this person so we
    # can do idempotent skip on (subject_name, field).
    existing_rows = ft_list_rows(person_id=person_id, limit=10_000, offset=0)
    existing_keys: set = set()
    for r in existing_rows:
        k = (str(r.get("subject_name") or ""), str(r.get("field") or ""))
        existing_keys.add(k)

    created = 0
    skipped_existing = 0
    skipped_empty = 0

    for basics_key, ft_field in _BASICS_TO_PROMOTED.items():
        raw_value = legacy_basics.get(basics_key)
        value = str(raw_value or "").strip()
        if not value:
            skipped_empty += 1
            continue

        key = (display_name, ft_field)
        if key in existing_keys:
            skipped_existing += 1
            continue

        note = ft_add_note(
            person_id=person_id,
            body=value,
            source_kind="backfill",
            source_ref=f"profile_json.basics.{basics_key}",
            created_by="backfill",
        )
        ft_add_row(
            person_id=person_id,
            note_id=note["id"],
            subject_name=display_name,
            relationship="self",
            field=ft_field,
            source_says=value,
            status="needs_verify",
            confidence=1.0,
            extraction_method="manual",
        )
        created += 1

    logger.info(
        "ft_backfill_from_profile_json: person_id=%s created=%d skipped_existing=%d skipped_empty=%d",
        person_id, created, skipped_existing, skipped_empty,
    )

    return {
        "person_id": person_id,
        "created_rows": created,
        "skipped_existing": skipped_existing,
        "skipped_empty": skipped_empty,
        "reference_refused": False,
    }


# -----------------------------------------------------------------------------
# Life phases
# -----------------------------------------------------------------------------
def add_life_phase(
    person_id: str,
    title: str,
    start_date: str = "",
    end_date: str = "",
    date_precision: str = "year",
    description: str = "",
    ord: int = 0,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    init_db()
    pid_val = _uuid()
    now = _now_iso()
    con = _connect()
    con.execute(
        """
        INSERT INTO life_phases(
          id,person_id,title,start_date,end_date,date_precision,
          description,ord,created_at,meta_json
        ) VALUES(?,?,?,?,?,?,?,?,?,?);
        """,
        (
            pid_val, person_id, title,
            start_date or "", end_date or "", date_precision or "year",
            description or "", int(ord or 0), now, _json_dump(meta or {}),
        ),
    )
    con.commit()
    con.close()
    return {
        "id": pid_val, "person_id": person_id, "title": title,
        "start_date": start_date, "end_date": end_date,
        "date_precision": date_precision, "description": description,
        "ord": int(ord or 0), "created_at": now,
    }


def list_life_phases(person_id: str) -> List[Dict[str, Any]]:
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,person_id,title,start_date,end_date,date_precision,
               description,ord,created_at,meta_json
        FROM life_phases WHERE person_id=? ORDER BY ord ASC, start_date ASC;
        """,
        (person_id,),
    ).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        out.append(d)
    return out


def delete_life_phase(phase_id: str) -> bool:
    init_db()
    con = _connect()
    cur = con.execute("DELETE FROM life_phases WHERE id=?;", (phase_id,))
    con.commit()
    con.close()
    return cur.rowcount > 0


# -----------------------------------------------------------------------------
# Enhanced timeline event  (wraps existing add_timeline_event with new fields)
# -----------------------------------------------------------------------------
def add_calendar_event(
    person_id: str,
    title: str,
    start_date: str,
    end_date: str = "",
    date_precision: str = "exact_day",
    display_date: str = "",
    body: str = "",
    kind: str = "event",
    is_approximate: bool = False,
    confidence: float = 1.0,
    status: str = "reviewed",
    source_session_ids: Optional[List[str]] = None,
    source_fact_ids: Optional[List[str]] = None,
    tags: Optional[List[str]] = None,
    phase_id: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Extended timeline event with full calendar metadata.
    Adds to timeline_events table using the new columns.
    """
    init_db()
    eid = _uuid()
    now = _now_iso()
    full_meta = dict(meta or {})
    con = _connect()
    con.execute(
        """
        INSERT INTO timeline_events(
          id,person_id,date,title,body,kind,created_at,meta_json,
          end_date,date_precision,is_approximate,confidence,status,
          source_session_ids,source_fact_ids,tags,display_date,phase_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
        """,
        (
            eid, person_id, start_date, title, body or "", kind or "event", now,
            _json_dump(full_meta),
            end_date or "", date_precision or "exact_day",
            1 if is_approximate else 0, float(confidence or 1.0),
            status or "reviewed",
            _json_dump(source_session_ids or []),
            _json_dump(source_fact_ids or []),
            _json_dump(tags or []),
            display_date or start_date,
            phase_id or "",
        ),
    )
    con.commit()
    con.close()
    return {
        "id": eid, "person_id": person_id,
        "start_date": start_date, "end_date": end_date,
        "title": title, "body": body, "kind": kind,
        "date_precision": date_precision, "display_date": display_date or start_date,
        "is_approximate": is_approximate, "confidence": float(confidence or 1.0),
        "status": status, "created_at": now,
        "source_session_ids": source_session_ids or [],
        "source_fact_ids": source_fact_ids or [],
        "tags": tags or [],
        "phase_id": phase_id,
    }


def list_calendar_events(
    person_id: str, limit: int = 500, offset: int = 0
) -> List[Dict[str, Any]]:
    """Return enriched timeline events with calendar fields."""
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id,person_id,date,title,body,kind,created_at,meta_json,
               COALESCE(end_date,'') as end_date,
               COALESCE(date_precision,'exact_day') as date_precision,
               COALESCE(is_approximate,0) as is_approximate,
               COALESCE(confidence,1.0) as confidence,
               COALESCE(status,'reviewed') as status,
               COALESCE(source_session_ids,'[]') as source_session_ids,
               COALESCE(source_fact_ids,'[]') as source_fact_ids,
               COALESCE(tags,'[]') as tags,
               COALESCE(display_date,'') as display_date,
               COALESCE(phase_id,'') as phase_id
        FROM timeline_events
        WHERE person_id=?
        ORDER BY date ASC, created_at ASC
        LIMIT ? OFFSET ?;
        """,
        (person_id, int(limit), int(offset)),
    ).fetchall()
    con.close()
    out = []
    for r in rows:
        d = dict(r)
        d["meta"] = _json_load(d.pop("meta_json", "{}"), {})
        d["is_approximate"] = bool(d.get("is_approximate"))
        d["source_session_ids"] = _json_load(d.get("source_session_ids"), [])
        d["source_fact_ids"] = _json_load(d.get("source_fact_ids"), [])
        d["tags"] = _json_load(d.get("tags"), [])
        d["start_date"] = d.pop("date", "")
        if not d.get("display_date"):
            d["display_date"] = d["start_date"]
        out.append(d)
    return out

# =============================================================================
# v6.1 Track A — Segment Flags (Safety)
# =============================================================================

def save_segment_flag(
    session_id: str,
    question_id: Optional[str],
    section_id: Optional[str],
    sensitive: bool,
    sensitive_category: str,
    excluded_from_memoir: bool = True,
    private: bool = True,
) -> str:
    """Create a segment flag record. Returns the flag id.
    Uses INSERT OR IGNORE so retrying the same answer never creates duplicates.
    """
    con = _connect()
    now = _now_iso()
    flag_id = _uuid()
    con.execute(
        """
        INSERT OR IGNORE INTO segment_flags
          (id, session_id, question_id, section_id,
           sensitive, sensitive_category, excluded_from_memoir, private, deleted, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?);
        """,
        (flag_id, session_id, question_id, section_id,
         int(sensitive), sensitive_category, int(excluded_from_memoir), int(private), now),
    )
    # If a flag for this (session, question) pair already existed, fetch the existing id
    existing = con.execute(
        "SELECT id FROM segment_flags WHERE session_id=? AND question_id=?;",
        (session_id, question_id),
    ).fetchone()
    con.commit()
    con.close()
    return (existing["id"] if existing else flag_id)


def get_segment_flags(session_id: str) -> List[Dict]:
    """Return all segment flags for a session."""
    con = _connect()
    rows = con.execute(
        "SELECT * FROM segment_flags WHERE session_id=? AND deleted=0 ORDER BY created_at;",
        (session_id,),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def delete_segment_flag(flag_id: str) -> bool:
    """Soft-delete a segment flag (user elected to remove sensitive segment)."""
    con = _connect()
    con.execute(
        "UPDATE segment_flags SET deleted=1 WHERE id=?;",
        (flag_id,),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


def include_segment_in_memoir(flag_id: str) -> bool:
    """User explicitly opts a sensitive segment into memoir drafts."""
    con = _connect()
    con.execute(
        "UPDATE segment_flags SET excluded_from_memoir=0, private=0 WHERE id=?;",
        (flag_id,),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


# v6.2 — lookup-by-(session_id, question_id) for frontend which uses those identifiers
def update_segment_flag_by_question(
    session_id: str, question_id: str, include_in_memoir: bool
) -> bool:
    """Toggle memoir inclusion for the flag matching (session_id, question_id)."""
    con = _connect()
    excluded = 0 if include_in_memoir else 1
    private_val = 0 if include_in_memoir else 1
    con.execute(
        "UPDATE segment_flags SET excluded_from_memoir=?, private=? "
        "WHERE session_id=? AND question_id=? AND deleted=0;",
        (excluded, private_val, session_id, question_id),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


def delete_segment_flag_by_question(session_id: str, question_id: str) -> bool:
    """Soft-delete the flag matching (session_id, question_id)."""
    con = _connect()
    con.execute(
        "UPDATE segment_flags SET deleted=1 WHERE session_id=? AND question_id=?;",
        (session_id, question_id),
    )
    changed = con.total_changes
    con.commit()
    con.close()
    return changed > 0


# =============================================================================
# v6.1 Track A — Softened Interview Mode
# =============================================================================

def set_session_softened(session_id: str, current_turn: int, softened_turns: int = 3) -> None:
    """Mark session as softened for the next N turns."""
    con = _connect()
    con.execute(
        """
        UPDATE interview_sessions
        SET interview_softened=1,
            softened_until_turn=?
        WHERE id=?;
        """,
        (current_turn + softened_turns, session_id),
    )
    con.commit()
    con.close()


def increment_session_turn(session_id: str) -> int:
    """Increment turn counter, returns new count."""
    con = _connect()
    con.execute(
        "UPDATE interview_sessions SET turn_count=COALESCE(turn_count,0)+1 WHERE id=?;",
        (session_id,),
    )
    con.commit()
    row = con.execute(
        "SELECT COALESCE(turn_count,0) as tc FROM interview_sessions WHERE id=?;",
        (session_id,),
    ).fetchone()
    con.close()
    return int(row["tc"]) if row else 0


def get_session_softened_state(session_id: str) -> Dict:
    """Return softened mode info for a session."""
    con = _connect()
    row = con.execute(
        """
        SELECT COALESCE(interview_softened,0) as interview_softened,
               COALESCE(softened_until_turn,0) as softened_until_turn,
               COALESCE(turn_count,0) as turn_count
        FROM interview_sessions WHERE id=?;
        """,
        (session_id,),
    ).fetchone()
    con.close()
    if not row:
        return {"interview_softened": False, "softened_until_turn": 0, "turn_count": 0}
    d = dict(row)
    # Auto-clear if we've passed the expiry turn
    is_softened = bool(d["interview_softened"]) and d["turn_count"] <= d["softened_until_turn"]
    return {
        "interview_softened": is_softened,
        "softened_until_turn": d["softened_until_turn"],
        "turn_count": d["turn_count"],
    }


def clear_session_softened(session_id: str) -> None:
    """Explicitly clear softened mode."""
    con = _connect()
    con.execute(
        "UPDATE interview_sessions SET interview_softened=0, softened_until_turn=0 WHERE id=?;",
        (session_id,),
    )
    con.commit()
    con.close()


# =============================================================================
# v6.1 Track B — Affect Events
# =============================================================================

def save_affect_event(
    session_id: str,
    timestamp: float,
    section_id: Optional[str],
    affect_state: str,
    confidence: float,
    duration_ms: int,
    source: str = "camera",
) -> str:
    """Persist a derived affect event. Returns the event id."""
    con = _connect()
    now = _now_iso()
    eid = _uuid()
    con.execute(
        """
        INSERT INTO affect_events
          (id, session_id, section_id, affect_state, confidence, duration_ms, source, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """,
        (eid, session_id, section_id or "", affect_state,
         round(confidence, 4), duration_ms, source, now),
    )
    con.commit()
    con.close()
    return eid


def list_affect_events(session_id: str, limit: int = 50) -> List[Dict]:
    """Return stored affect events for a session, newest first."""
    con = _connect()
    rows = con.execute(
        """
        SELECT id, session_id, section_id, affect_state, confidence, duration_ms, source, ts
        FROM affect_events
        WHERE session_id=?
        ORDER BY ts DESC
        LIMIT ?;
        """,
        (session_id, limit),
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


# -----------------------------------------------------------------------------
# Narrator Delete — Phase 2 (dependency inventory, soft/hard delete, restore, audit)
# -----------------------------------------------------------------------------

def person_delete_inventory(person_id: str) -> Optional[Dict[str, Any]]:
    """Return dependency counts for a person, used before deletion confirmation."""
    init_db()
    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None

    counts = {}
    tables = [
        ("profiles", "person_id"),
        ("timeline_events", "person_id"),
        ("interview_sessions", "person_id"),
        ("interview_answers", "person_id"),
        ("facts", "person_id"),
        ("life_phases", "person_id"),
    ]
    for table, col in tables:
        row = con.execute(
            f"SELECT COUNT(*) AS cnt FROM {table} WHERE {col}=?;",  # noqa: S608
            (person_id,),
        ).fetchone()
        counts[table] = row["cnt"] if row else 0

    # Media: count rows where person_id matches (ON DELETE SET NULL)
    media_row = con.execute(
        "SELECT COUNT(*) AS cnt FROM media WHERE person_id=?;",
        (person_id,),
    ).fetchone()
    counts["media_owned"] = media_row["cnt"] if media_row else 0

    attach_row = con.execute(
        "SELECT COUNT(*) AS cnt FROM media_attachments WHERE person_id=?;",
        (person_id,),
    ).fetchone()
    counts["media_attachments"] = attach_row["cnt"] if attach_row else 0

    # Kawa segments (JSON files on disk, not in SQLite)
    kawa_seg_dir = DATA_DIR / "kawa" / "people" / person_id / "segments"
    if kawa_seg_dir.exists():
        counts["kawa_segments"] = len(list(kawa_seg_dir.glob("*.json")))
    else:
        counts["kawa_segments"] = 0

    con.close()
    return {
        "person_id": person["id"],
        "display_name": person["display_name"],
        "counts": counts,
        "has_soft_delete": True,
        "is_deleted": bool(person["is_deleted"]),
    }


def _log_delete_audit(
    con: sqlite3.Connection,
    action: str,
    person_id: str,
    display_name: str,
    counts: Dict[str, Any],
    result: str = "success",
    error_detail: Optional[str] = None,
    requested_by: Optional[str] = None,
) -> None:
    """Append a row to the narrator_delete_audit table (within caller's transaction)."""
    con.execute(
        """
        INSERT INTO narrator_delete_audit
            (id, action, person_id, display_name, requested_by, dependency_counts_json, result, error_detail, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """,
        (
            _uuid(),
            action,
            person_id,
            display_name,
            requested_by,
            _json_dump(counts),
            result,
            error_detail,
            _now_iso(),
        ),
    )


def soft_delete_person(
    person_id: str,
    undo_minutes: int = 10,
    requested_by: Optional[str] = None,
    reason: str = "",
) -> Optional[Dict[str, Any]]:
    """Mark a person as soft-deleted. Reversible within undo_minutes."""
    init_db()
    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None
    if person["is_deleted"]:
        con.close()
        return {"error": "already_deleted", "person_id": person_id}

    now = _now_iso()
    from datetime import timedelta
    undo_expires = (datetime.utcnow() + timedelta(minutes=undo_minutes)).isoformat()

    # Get inventory counts before marking deleted
    inv = person_delete_inventory(person_id)
    counts = inv["counts"] if inv else {}

    con.execute(
        """
        UPDATE people
        SET is_deleted = 1,
            deleted_at = ?,
            deleted_by = ?,
            delete_reason = ?,
            undo_expires_at = ?,
            updated_at = ?
        WHERE id = ?;
        """,
        (now, requested_by, reason or "", undo_expires, now, person_id),
    )

    _log_delete_audit(con, "soft_delete", person_id, person["display_name"], counts,
                       result="success", requested_by=requested_by)

    con.commit()
    con.close()

    logger.info("soft_delete_person: id=%s name=%r undo_expires=%s", person_id, person["display_name"], undo_expires)

    return {
        "status": "soft_deleted",
        "person_id": person_id,
        "display_name": person["display_name"],
        "undo_expires_at": undo_expires,
        "counts": counts,
    }


def restore_person(person_id: str, requested_by: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Restore a soft-deleted person if within the undo window."""
    init_db()
    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted, undo_expires_at FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None
    if not person["is_deleted"]:
        con.close()
        return {"error": "not_deleted", "person_id": person_id}

    # Check undo window
    undo_exp = person["undo_expires_at"]
    if undo_exp:
        try:
            exp_dt = datetime.fromisoformat(undo_exp)
            if datetime.utcnow() > exp_dt:
                con.close()
                return {"error": "undo_expired", "person_id": person_id, "undo_expires_at": undo_exp}
        except ValueError:
            pass  # If parse fails, allow restore anyway

    now = _now_iso()
    con.execute(
        """
        UPDATE people
        SET is_deleted = 0,
            deleted_at = NULL,
            deleted_by = NULL,
            delete_reason = '',
            undo_expires_at = NULL,
            updated_at = ?
        WHERE id = ?;
        """,
        (now, person_id),
    )

    _log_delete_audit(con, "restore", person_id, person["display_name"], {},
                       result="success", requested_by=requested_by)

    con.commit()
    con.close()

    logger.info("restore_person: id=%s name=%r", person_id, person["display_name"])

    return {
        "status": "restored",
        "person_id": person_id,
        "display_name": person["display_name"],
    }


def hard_delete_person(person_id: str, requested_by: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Permanently and transactionally delete a person and all dependent records.

    The SQLite FK cascade handles most deletions automatically:
    - profiles, timeline_events, interview_sessions, interview_answers, facts, life_phases → CASCADE
    - media, media_attachments → SET NULL (person_id nulled, records preserved)
    - Kawa segment JSON files → removed from disk after DB commit

    This function wraps the delete in a transaction for all-or-nothing safety.
    """
    init_db()

    # Get inventory before deletion
    inv = person_delete_inventory(person_id)
    if not inv:
        return None

    con = _connect()
    person = con.execute(
        "SELECT id, display_name, is_deleted FROM people WHERE id=?;",
        (person_id,),
    ).fetchone()
    if not person:
        con.close()
        return None

    display_name = person["display_name"]
    counts = inv["counts"]

    try:
        # FK CASCADE handles dependent rows automatically when we delete the people row.
        # media.person_id and media_attachments.person_id get SET NULL.
        con.execute("DELETE FROM people WHERE id = ?;", (person_id,))

        _log_delete_audit(con, "hard_delete", person_id, display_name, counts,
                           result="success", requested_by=requested_by)

        con.commit()
        logger.info("hard_delete_person: id=%s name=%r counts=%s", person_id, display_name, counts)

        # Clean up Kawa segment files (stored on disk, not in SQLite)
        kawa_person_dir = DATA_DIR / "kawa" / "people" / person_id
        if kawa_person_dir.exists():
            shutil.rmtree(kawa_person_dir, ignore_errors=True)
            logger.info("hard_delete_person: removed Kawa dir %s", kawa_person_dir)

    except Exception as exc:
        con.rollback()
        # Log the failure
        try:
            _log_delete_audit(con, "hard_delete", person_id, display_name, counts,
                               result="rollback", error_detail=str(exc), requested_by=requested_by)
            con.commit()
        except Exception:
            pass
        con.close()
        logger.error("hard_delete_person ROLLBACK: id=%s error=%s", person_id, exc)
        return {"error": "rollback", "person_id": person_id, "detail": str(exc)}

    con.close()

    return {
        "status": "hard_deleted",
        "person_id": person_id,
        "display_name": display_name,
        "counts_removed": counts,
    }


def list_delete_audit(limit: int = 50) -> List[Dict[str, Any]]:
    """Return recent narrator delete audit log entries."""
    init_db()
    con = _connect()
    rows = con.execute(
        """
        SELECT id, action, person_id, display_name, requested_by,
               dependency_counts_json, result, error_detail, ts
        FROM narrator_delete_audit
        ORDER BY ts DESC
        LIMIT ?;
        """,
        (int(limit),),
    ).fetchall()
    con.close()
    results = []
    for r in rows:
        d = dict(r)
        d["dependency_counts"] = _json_load(d.pop("dependency_counts_json", "{}"), {})
        results.append(d)
    return results


# ── Phase G: Ensure Phase G tables ──────────────────────────────────────────

def _ensure_phase_g_tables(con: sqlite3.Connection, cur: sqlite3.Cursor) -> None:
    """Create Phase G tables: questionnaires, projections, identity change log."""

    # ─────────────────────────────────────────────────────────────────────────
    # bio_builder_questionnaires: canonical questionnaire state
    # ─────────────────────────────────────────────────────────────────────────
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS bio_builder_questionnaires (
            person_id TEXT PRIMARY KEY,
            questionnaire_json TEXT NOT NULL DEFAULT '{}',
            source TEXT NOT NULL DEFAULT 'unknown',
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )

    # ─────────────────────────────────────────────────────────────────────────
    # interview_projections: canonical projection state
    # ─────────────────────────────────────────────────────────────────────────
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS interview_projections (
            person_id TEXT PRIMARY KEY,
            projection_json TEXT NOT NULL DEFAULT '{}',
            source TEXT NOT NULL DEFAULT 'unknown',
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )

    # ─────────────────────────────────────────────────────────────────────────
    # identity_change_log: audit trail of proposed identity changes
    # ─────────────────────────────────────────────────────────────────────────
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS identity_change_log (
            id TEXT PRIMARY KEY,
            person_id TEXT NOT NULL,
            field_path TEXT NOT NULL,
            old_value TEXT DEFAULT '',
            new_value TEXT DEFAULT '',
            source TEXT NOT NULL DEFAULT 'unknown',
            status TEXT NOT NULL DEFAULT 'proposed',
            accepted_by TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            resolved_at TEXT DEFAULT '',
            meta_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_identity_change_person_created "
        "ON identity_change_log(person_id, created_at);"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Questionnaire canonical persistence
# ─────────────────────────────────────────────────────────────────────────────

def get_questionnaire(person_id: str) -> Dict[str, Any]:
    """Load canonical questionnaire state from backend DB."""
    con = _connect()
    try:
        row = con.execute(
            "SELECT questionnaire_json, source, version, updated_at "
            "FROM bio_builder_questionnaires WHERE person_id = ?",
            (person_id,),
        ).fetchone()
        if not row:
            return {
                "person_id": person_id,
                "questionnaire": {},
                "source": "empty",
                "version": 0,
                "updated_at": "",
            }
        return {
            "person_id": person_id,
            "questionnaire": json.loads(row["questionnaire_json"] or "{}"),
            "source": row["source"],
            "version": row["version"],
            "updated_at": row["updated_at"],
        }
    finally:
        con.close()


def upsert_questionnaire(
    person_id: str,
    questionnaire: Dict[str, Any],
    source: str = "ui",
    version: int = 1,
) -> Dict[str, Any]:
    """Save canonical questionnaire state to backend DB."""
    now = datetime.utcnow().isoformat()
    q_json = json.dumps(questionnaire, ensure_ascii=False)
    con = _connect()
    try:
        con.execute(
            """INSERT INTO bio_builder_questionnaires
                   (person_id, questionnaire_json, source, version, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(person_id) DO UPDATE SET
                   questionnaire_json = excluded.questionnaire_json,
                   source = excluded.source,
                   version = excluded.version,
                   updated_at = excluded.updated_at""",
            (person_id, q_json, source, version, now),
        )
        con.commit()
        return {
            "person_id": person_id,
            "questionnaire": questionnaire,
            "source": source,
            "version": version,
            "updated_at": now,
        }
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Projection canonical persistence
# ─────────────────────────────────────────────────────────────────────────────

def get_projection(person_id: str) -> Dict[str, Any]:
    """Load canonical interview projection state from backend DB."""
    con = _connect()
    try:
        row = con.execute(
            "SELECT projection_json, source, version, updated_at "
            "FROM interview_projections WHERE person_id = ?",
            (person_id,),
        ).fetchone()
        if not row:
            return {
                "person_id": person_id,
                "projection": {},
                "source": "empty",
                "version": 0,
                "updated_at": "",
            }
        return {
            "person_id": person_id,
            "projection": json.loads(row["projection_json"] or "{}"),
            "source": row["source"],
            "version": row["version"],
            "updated_at": row["updated_at"],
        }
    finally:
        con.close()


def upsert_projection(
    person_id: str,
    projection: Dict[str, Any],
    source: str = "projection_sync",
    version: int = 1,
) -> Dict[str, Any]:
    """Save canonical projection state to backend DB."""
    now = datetime.utcnow().isoformat()
    p_json = json.dumps(projection, ensure_ascii=False)
    con = _connect()
    try:
        con.execute(
            """INSERT INTO interview_projections
                   (person_id, projection_json, source, version, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(person_id) DO UPDATE SET
                   projection_json = excluded.projection_json,
                   source = excluded.source,
                   version = excluded.version,
                   updated_at = excluded.updated_at""",
            (person_id, p_json, source, version, now),
        )
        con.commit()
        return {
            "person_id": person_id,
            "projection": projection,
            "source": source,
            "version": version,
            "updated_at": now,
        }
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Combined narrator state snapshot
# ─────────────────────────────────────────────────────────────────────────────

def get_narrator_state_snapshot(person_id: str) -> Dict[str, Any]:
    """
    Return combined backend canonical state for a narrator.
    Used by frontend on startup/switch to hydrate from backend authority.
    """
    person = get_person(person_id) or {}
    profile_row = get_profile(person_id) or {}
    profile = {}
    if isinstance(profile_row, str):
        try:
            profile = json.loads(profile_row)
        except Exception:
            profile = {}
    elif isinstance(profile_row, dict):
        profile = profile_row

    qq = get_questionnaire(person_id)
    proj = get_projection(person_id)

    # Build protected identity snapshot from person record + profile basics
    basics = profile.get("basics", {}) if isinstance(profile, dict) else {}
    protected_identity = {
        "personal.fullName": person.get("display_name", ""),
        "personal.preferredName": basics.get("preferred", ""),
        "personal.dateOfBirth": person.get("date_of_birth", ""),
        "personal.placeOfBirth": person.get("place_of_birth", ""),
        "personal.birthOrder": basics.get("birthOrder", ""),
    }

    # WO-13: Count prior user-authored turns for this narrator.
    # Used by the UI to gate the session-resume prompt — a fresh narrator with
    # zero real user turns should NOT trigger a "welcome back" greeting.
    # Turns are joined to the person via sessions.payload_json.active_person_id.
    # Internal system prompts (role='user' but content starts with '[SYSTEM:')
    # are excluded so they never inflate the count.
    user_turn_count = 0
    try:
        con = _connect()
        row = con.execute(
            """
            SELECT COUNT(*) AS n
              FROM turns t
              JOIN sessions s ON s.conv_id = t.conv_id
             WHERE t.role = 'user'
               AND t.content NOT LIKE '[SYSTEM:%'
               AND json_extract(s.payload_json, '$.active_person_id') = ?
            """,
            (person_id,),
        ).fetchone()
        con.close()
        if row is not None:
            user_turn_count = int(row["n"] if hasattr(row, "keys") else row[0])
    except Exception:
        user_turn_count = 0

    now = datetime.utcnow().isoformat()
    return {
        "person_id": person_id,
        "person": person,
        "profile": profile,
        "questionnaire": qq.get("questionnaire", {}),
        "projection": proj.get("projection", {}),
        "protected_identity": protected_identity,
        "user_turn_count": user_turn_count,
        "updated_at": now,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Phase G: Identity change log
# ─────────────────────────────────────────────────────────────────────────────

def log_identity_change_proposal(
    person_id: str,
    field_path: str,
    old_value: str,
    new_value: str,
    source: str,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Log a proposed change to a protected identity field."""
    proposal_id = "chg_" + uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat()
    meta_json = json.dumps(meta or {}, ensure_ascii=False)
    con = _connect()
    try:
        con.execute(
            """INSERT INTO identity_change_log
                   (id, person_id, field_path, old_value, new_value, source,
                    status, created_at, meta_json)
               VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?)""",
            (proposal_id, person_id, field_path, old_value, new_value,
             source, now, meta_json),
        )
        con.commit()
        return {
            "proposal_id": proposal_id,
            "person_id": person_id,
            "field_path": field_path,
            "old_value": old_value,
            "new_value": new_value,
            "source": source,
            "status": "proposed",
            "created_at": now,
        }
    finally:
        con.close()


def approve_identity_change_proposal(
    proposal_id: str,
    accepted_by: str = "human",
) -> Dict[str, Any]:
    """
    Accept a proposed identity change, apply it to the person/profile record,
    and mark the log entry as accepted.
    """
    now = datetime.utcnow().isoformat()
    con = _connect()
    try:
        row = con.execute(
            "SELECT * FROM identity_change_log WHERE id = ?",
            (proposal_id,),
        ).fetchone()
        if not row:
            return {"ok": False, "error": "proposal_not_found"}
        row = dict(row)

        if row["status"] != "proposed":
            return {"ok": False, "error": f"proposal already {row['status']}"}

        # Apply the change to canonical person/profile data
        person_id = row["person_id"]
        field_path = row["field_path"]
        new_value = row["new_value"]

        # Map field_path to actual DB column/field
        _applied = False
        if field_path == "personal.fullName":
            con.execute(
                "UPDATE people SET display_name = ?, updated_at = ? WHERE id = ?",
                (new_value, now, person_id),
            )
            _applied = True
        elif field_path == "personal.dateOfBirth":
            con.execute(
                "UPDATE people SET date_of_birth = ?, updated_at = ? WHERE id = ?",
                (new_value, now, person_id),
            )
            _applied = True
        elif field_path == "personal.placeOfBirth":
            con.execute(
                "UPDATE people SET place_of_birth = ?, updated_at = ? WHERE id = ?",
                (new_value, now, person_id),
            )
            _applied = True
        elif field_path in ("personal.preferredName", "personal.birthOrder"):
            # These live in profile basics JSON
            prof_row = con.execute(
                "SELECT profile_json FROM profiles WHERE person_id = ?",
                (person_id,),
            ).fetchone()
            if prof_row:
                profile = json.loads(prof_row["profile_json"] or "{}")
                basics = profile.setdefault("basics", {})
                key = "preferred" if field_path == "personal.preferredName" else "birthOrder"
                basics[key] = new_value
                con.execute(
                    "UPDATE profiles SET profile_json = ?, updated_at = ? WHERE person_id = ?",
                    (json.dumps(profile, ensure_ascii=False), now, person_id),
                )
                _applied = True

        # Mark proposal as accepted
        con.execute(
            """UPDATE identity_change_log
               SET status = 'accepted', accepted_by = ?, resolved_at = ?
               WHERE id = ?""",
            (accepted_by, now, proposal_id),
        )
        con.commit()

        return {
            "ok": True,
            "proposal_id": proposal_id,
            "person_id": person_id,
            "field_path": field_path,
            "new_value": new_value,
            "applied": _applied,
            "accepted_by": accepted_by,
            "resolved_at": now,
        }
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────────────────────
# Phase Q.1: Relationship Graph Layer
# ─────────────────────────────────────────────────────────────────────────────

def _ensure_phase_q1_tables(con: sqlite3.Connection, cur: sqlite3.Cursor) -> None:
    """Create Phase Q.1 tables: graph_persons and graph_relationships."""

    # graph_persons: every person node in the relationship graph
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_persons (
            id TEXT PRIMARY KEY,
            narrator_id TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            first_name TEXT NOT NULL DEFAULT '',
            middle_name TEXT NOT NULL DEFAULT '',
            last_name TEXT NOT NULL DEFAULT '',
            maiden_name TEXT NOT NULL DEFAULT '',
            birth_date TEXT NOT NULL DEFAULT '',
            birth_place TEXT NOT NULL DEFAULT '',
            occupation TEXT NOT NULL DEFAULT '',
            deceased INTEGER NOT NULL DEFAULT 0,
            is_narrator INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'manual',
            provenance TEXT NOT NULL DEFAULT '',
            confidence REAL NOT NULL DEFAULT 1.0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            meta_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(narrator_id) REFERENCES people(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_persons_narrator "
        "ON graph_persons(narrator_id);"
    )

    # graph_relationships: edges between graph_persons
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS graph_relationships (
            id TEXT PRIMARY KEY,
            narrator_id TEXT NOT NULL,
            from_person_id TEXT NOT NULL,
            to_person_id TEXT NOT NULL,
            relationship_type TEXT NOT NULL DEFAULT '',
            subtype TEXT NOT NULL DEFAULT '',
            label TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'manual',
            provenance TEXT NOT NULL DEFAULT '',
            confidence REAL NOT NULL DEFAULT 1.0,
            start_date TEXT NOT NULL DEFAULT '',
            end_date TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            meta_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(narrator_id) REFERENCES people(id) ON DELETE CASCADE,
            FOREIGN KEY(from_person_id) REFERENCES graph_persons(id) ON DELETE CASCADE,
            FOREIGN KEY(to_person_id) REFERENCES graph_persons(id) ON DELETE CASCADE
        );
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_rels_narrator "
        "ON graph_relationships(narrator_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_rels_from "
        "ON graph_relationships(from_person_id);"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_graph_rels_to "
        "ON graph_relationships(to_person_id);"
    )


# ── Graph Persons CRUD ──

def graph_upsert_person(
    narrator_id: str,
    person_id: Optional[str] = None,
    display_name: str = "",
    first_name: str = "",
    middle_name: str = "",
    last_name: str = "",
    maiden_name: str = "",
    birth_date: str = "",
    birth_place: str = "",
    occupation: str = "",
    deceased: bool = False,
    is_narrator: bool = False,
    source: str = "manual",
    provenance: str = "",
    confidence: float = 1.0,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert or update a person node in the relationship graph."""
    pid = person_id or _uuid()
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            """INSERT INTO graph_persons
                   (id, narrator_id, display_name, first_name, middle_name,
                    last_name, maiden_name, birth_date, birth_place, occupation,
                    deceased, is_narrator, source, provenance, confidence,
                    created_at, updated_at, meta_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                   display_name=excluded.display_name,
                   first_name=excluded.first_name,
                   middle_name=excluded.middle_name,
                   last_name=excluded.last_name,
                   maiden_name=excluded.maiden_name,
                   birth_date=excluded.birth_date,
                   birth_place=excluded.birth_place,
                   occupation=excluded.occupation,
                   deceased=excluded.deceased,
                   is_narrator=excluded.is_narrator,
                   source=excluded.source,
                   provenance=excluded.provenance,
                   confidence=excluded.confidence,
                   updated_at=excluded.updated_at,
                   meta_json=excluded.meta_json""",
            (pid, narrator_id, display_name, first_name, middle_name,
             last_name, maiden_name, birth_date, birth_place, occupation,
             1 if deceased else 0, 1 if is_narrator else 0,
             source, provenance, confidence,
             now, now, _json_dump(meta or {})),
        )
        con.commit()
        return {
            "id": pid, "narrator_id": narrator_id,
            "display_name": display_name,
            "first_name": first_name, "middle_name": middle_name,
            "last_name": last_name, "maiden_name": maiden_name,
            "birth_date": birth_date, "birth_place": birth_place,
            "occupation": occupation, "deceased": deceased,
            "is_narrator": is_narrator,
            "source": source, "provenance": provenance,
            "confidence": confidence,
            "created_at": now, "updated_at": now,
            "meta": meta or {},
        }
    finally:
        con.close()


def graph_list_persons(narrator_id: str) -> List[Dict[str, Any]]:
    """List all person nodes for a narrator."""
    con = _connect()
    try:
        rows = con.execute(
            "SELECT * FROM graph_persons WHERE narrator_id=? ORDER BY created_at",
            (narrator_id,),
        ).fetchall()
        out = []
        for r in rows:
            out.append({
                "id": r["id"], "narrator_id": r["narrator_id"],
                "display_name": r["display_name"],
                "first_name": r["first_name"], "middle_name": r["middle_name"],
                "last_name": r["last_name"], "maiden_name": r["maiden_name"],
                "birth_date": r["birth_date"], "birth_place": r["birth_place"],
                "occupation": r["occupation"],
                "deceased": bool(r["deceased"]),
                "is_narrator": bool(r["is_narrator"]),
                "source": r["source"], "provenance": r["provenance"],
                "confidence": r["confidence"],
                "created_at": r["created_at"], "updated_at": r["updated_at"],
                "meta": _json_load(r["meta_json"], {}),
            })
        return out
    finally:
        con.close()


def graph_delete_person(person_id: str) -> bool:
    """Delete a person node (cascades to relationship edges)."""
    con = _connect()
    try:
        con.execute("DELETE FROM graph_relationships WHERE from_person_id=? OR to_person_id=?", (person_id, person_id))
        cur = con.execute("DELETE FROM graph_persons WHERE id=?", (person_id,))
        con.commit()
        return cur.rowcount > 0
    finally:
        con.close()


# ── Graph Relationships CRUD ──

def graph_upsert_relationship(
    narrator_id: str,
    rel_id: Optional[str] = None,
    from_person_id: str = "",
    to_person_id: str = "",
    relationship_type: str = "",
    subtype: str = "",
    label: str = "",
    status: str = "active",
    notes: str = "",
    source: str = "manual",
    provenance: str = "",
    confidence: float = 1.0,
    start_date: str = "",
    end_date: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Insert or update a relationship edge."""
    rid = rel_id or _uuid()
    now = _now_iso()
    con = _connect()
    try:
        con.execute(
            """INSERT INTO graph_relationships
                   (id, narrator_id, from_person_id, to_person_id,
                    relationship_type, subtype, label, status, notes,
                    source, provenance, confidence, start_date, end_date,
                    created_at, updated_at, meta_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                   from_person_id=excluded.from_person_id,
                   to_person_id=excluded.to_person_id,
                   relationship_type=excluded.relationship_type,
                   subtype=excluded.subtype,
                   label=excluded.label,
                   status=excluded.status,
                   notes=excluded.notes,
                   source=excluded.source,
                   provenance=excluded.provenance,
                   confidence=excluded.confidence,
                   start_date=excluded.start_date,
                   end_date=excluded.end_date,
                   updated_at=excluded.updated_at,
                   meta_json=excluded.meta_json""",
            (rid, narrator_id, from_person_id, to_person_id,
             relationship_type, subtype, label, status, notes,
             source, provenance, confidence, start_date, end_date,
             now, now, _json_dump(meta or {})),
        )
        con.commit()
        return {
            "id": rid, "narrator_id": narrator_id,
            "from_person_id": from_person_id, "to_person_id": to_person_id,
            "relationship_type": relationship_type, "subtype": subtype,
            "label": label, "status": status, "notes": notes,
            "source": source, "provenance": provenance,
            "confidence": confidence,
            "start_date": start_date, "end_date": end_date,
            "created_at": now, "updated_at": now,
            "meta": meta or {},
        }
    finally:
        con.close()


def graph_list_relationships(narrator_id: str) -> List[Dict[str, Any]]:
    """List all relationship edges for a narrator."""
    con = _connect()
    try:
        rows = con.execute(
            "SELECT * FROM graph_relationships WHERE narrator_id=? ORDER BY created_at",
            (narrator_id,),
        ).fetchall()
        out = []
        for r in rows:
            out.append({
                "id": r["id"], "narrator_id": r["narrator_id"],
                "from_person_id": r["from_person_id"],
                "to_person_id": r["to_person_id"],
                "relationship_type": r["relationship_type"],
                "subtype": r["subtype"],
                "label": r["label"], "status": r["status"],
                "notes": r["notes"],
                "source": r["source"], "provenance": r["provenance"],
                "confidence": r["confidence"],
                "start_date": r["start_date"], "end_date": r["end_date"],
                "created_at": r["created_at"], "updated_at": r["updated_at"],
                "meta": _json_load(r["meta_json"], {}),
            })
        return out
    finally:
        con.close()


def graph_delete_relationship(rel_id: str) -> bool:
    """Delete a relationship edge."""
    con = _connect()
    try:
        cur = con.execute("DELETE FROM graph_relationships WHERE id=?", (rel_id,))
        con.commit()
        return cur.rowcount > 0
    finally:
        con.close()


def graph_get_full(narrator_id: str) -> Dict[str, Any]:
    """Load the full relationship graph for a narrator (persons + relationships)."""
    return {
        "narrator_id": narrator_id,
        "persons": graph_list_persons(narrator_id),
        "relationships": graph_list_relationships(narrator_id),
    }


def graph_replace_full(narrator_id: str, persons: List[Dict[str, Any]], relationships: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Replace the entire relationship graph for a narrator (atomic)."""
    now = _now_iso()
    con = _connect()
    try:
        # Clear existing graph
        con.execute("DELETE FROM graph_relationships WHERE narrator_id=?", (narrator_id,))
        con.execute("DELETE FROM graph_persons WHERE narrator_id=?", (narrator_id,))

        # Insert persons
        for p in persons:
            con.execute(
                """INSERT INTO graph_persons
                       (id, narrator_id, display_name, first_name, middle_name,
                        last_name, maiden_name, birth_date, birth_place, occupation,
                        deceased, is_narrator, source, provenance, confidence,
                        created_at, updated_at, meta_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (p.get("id") or _uuid(), narrator_id,
                 p.get("display_name", ""), p.get("first_name", ""),
                 p.get("middle_name", ""), p.get("last_name", ""),
                 p.get("maiden_name", ""), p.get("birth_date", ""),
                 p.get("birth_place", ""), p.get("occupation", ""),
                 1 if p.get("deceased") else 0,
                 1 if p.get("is_narrator") else 0,
                 p.get("source", "manual"), p.get("provenance", ""),
                 p.get("confidence", 1.0),
                 p.get("created_at", now), now,
                 _json_dump(p.get("meta", {}))),
            )

        # Insert relationships
        for r in relationships:
            con.execute(
                """INSERT INTO graph_relationships
                       (id, narrator_id, from_person_id, to_person_id,
                        relationship_type, subtype, label, status, notes,
                        source, provenance, confidence, start_date, end_date,
                        created_at, updated_at, meta_json)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (r.get("id") or _uuid(), narrator_id,
                 r.get("from_person_id", ""), r.get("to_person_id", ""),
                 r.get("relationship_type", ""), r.get("subtype", ""),
                 r.get("label", ""), r.get("status", "active"),
                 r.get("notes", ""),
                 r.get("source", "manual"), r.get("provenance", ""),
                 r.get("confidence", 1.0),
                 r.get("start_date", ""), r.get("end_date", ""),
                 r.get("created_at", now), now,
                 _json_dump(r.get("meta", {}))),
            )

        con.commit()
        return graph_get_full(narrator_id)
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()
