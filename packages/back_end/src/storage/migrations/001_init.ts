export const INIT_SQL = `
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS persons (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  profile_card  TEXT,
  settings_json TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  title       TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_person ON sessions(person_id);

CREATE TABLE IF NOT EXISTS cases (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  person_id          TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  question           TEXT NOT NULL,
  numbers_json       TEXT,
  time_local         TEXT,
  direction          TEXT,
  object_note        TEXT,
  context_note       TEXT,
  category           TEXT,
  cast_method        TEXT,
  method_reason      TEXT,
  method_overridden  INTEGER DEFAULT 0,
  route_rounds       INTEGER DEFAULT 0,
  cast_json          TEXT,
  verdict_json       TEXT,
  status             TEXT NOT NULL DEFAULT 'draft',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_person ON cases(person_id);

CREATE TABLE IF NOT EXISTS steps (
  case_id        TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  step_id        INTEGER NOT NULL CHECK (step_id BETWEEN 1 AND 9),
  status         TEXT NOT NULL,
  conclusion     TEXT,
  evidence       TEXT,
  sources_json   TEXT,
  reasoning_note TEXT,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (case_id, step_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  case_id    TEXT REFERENCES cases(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  step_id    INTEGER,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id);

CREATE TABLE IF NOT EXISTS cases_feedback (
  case_id              TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  verdict_json         TEXT,
  actual               TEXT,
  accuracy             TEXT,
  deviation_notes      TEXT,
  deviation_steps_json TEXT,
  feedback_at          TEXT,
  created_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  session_id   TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('round','result','summary','preference')),
  content_json TEXT NOT NULL,
  tags_json    TEXT,
  rejected     INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_person ON memories(person_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

export const MIGRATIONS: { version: string; sql: string }[] = [
  { version: '001_init', sql: INIT_SQL },
];
