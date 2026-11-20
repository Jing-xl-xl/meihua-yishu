export const MIGRATIONS_006: Array<{ version: string; sql: string }> = [
  {
    version: '006_persons_profile_relations',
    sql: `ALTER TABLE persons ADD COLUMN profile_info TEXT;
CREATE TABLE IF NOT EXISTS person_relations (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rel_code TEXT NOT NULL,
  label TEXT,
  closeness INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);`,
  },
];
