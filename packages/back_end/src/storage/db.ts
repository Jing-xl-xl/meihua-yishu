import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import { MIGRATIONS } from './migrations/001_init';
import { MIGRATIONS_002 } from './migrations/002_session_route_rounds';
import { MIGRATIONS_003 } from './migrations/003_persons_role_card';
import { MIGRATIONS_004 } from './migrations/004_memories_anchor';

export type Db = Database.Database;

export function openDb(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

/** 迁移表方案：已应用 version 跳过；重复启动安全 */
export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => (r as { version: string }).version),
  );
  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
  );
  for (const m of [...MIGRATIONS, ...MIGRATIONS_002, ...MIGRATIONS_003, ...MIGRATIONS_004]) {
    if (applied.has(m.version)) continue;
    const run = db.transaction(() => {
      db.exec(m.sql);
      insert.run(m.version, new Date().toISOString());
    });
    run();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
