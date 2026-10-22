export const REBUILD_MEMORIES_ANCHOR = `
CREATE TABLE IF NOT EXISTS memories_v2 (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  session_id   TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('round','result','summary','preference','anchor')),
  content_json TEXT NOT NULL,
  tags_json    TEXT,
  rejected     INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL
);
INSERT INTO memories_v2 (id, person_id, session_id, case_id, type, content_json, tags_json, rejected, created_at)
  SELECT id, person_id, session_id, case_id, type, content_json, tags_json, rejected, created_at FROM memories;
DROP TABLE memories;
ALTER TABLE memories_v2 RENAME TO memories;
CREATE INDEX IF NOT EXISTS idx_memories_person ON memories(person_id);
`;

export const MIGRATIONS_004: { version: string; sql: string }[] = [
  { version: '004_memories_anchor', sql: REBUILD_MEMORIES_ANCHOR },
];
