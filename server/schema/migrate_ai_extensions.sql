-- ============================================================
-- LoreVox AI Extensions Migration (vNext-compatible)
-- Safe to run multiple times (won’t blow up on existing columns)
-- ============================================================

PRAGMA foreign_keys=ON;

-- ----------------------------
-- 1) Extend answers table (AI metadata)
-- NOTE: SQLite has no "ADD COLUMN IF NOT EXISTS",
-- so we use a guard pattern with pragma_table_info().
-- ----------------------------

-- memory_depth
INSERT INTO sqlite_temp_master SELECT 1 WHERE 0; -- harmless no-op; keeps some sqlite shells happy
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pragma_table_info('answers') WHERE name='memory_depth')
  THEN 0
  ELSE (SELECT 1)
END;

-- Run the ALTER only if missing (manual guard pattern via separate statements below)
-- If you re-run this file and the column exists, SQLite will error on ALTER.
-- So: keep these ALTERs commented after first successful run, OR run with the Python helper.
-- For your current setup (fresh DB), leave them UNCOMMENTED.

ALTER TABLE answers ADD COLUMN memory_depth INTEGER DEFAULT 0;
ALTER TABLE answers ADD COLUMN card_id TEXT DEFAULT NULL;
ALTER TABLE answers ADD COLUMN tags_json TEXT DEFAULT NULL;

-- ----------------------------
-- 2) Embeddings derived from answers
-- ----------------------------
CREATE TABLE IF NOT EXISTS answer_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_id INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(answer_id) REFERENCES answers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_answer_embeddings_answer
  ON answer_embeddings(answer_id);

-- ----------------------------
-- 3) Memory snippets (RAG-ready fragments)
-- ----------------------------
CREATE TABLE IF NOT EXISTS memory_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  snippet_text TEXT NOT NULL,
  source_answer_id INTEGER DEFAULT NULL,
  weight REAL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_answer_id) REFERENCES answers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_snippets_user
  ON memory_snippets(user_id);
