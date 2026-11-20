export const MIGRATIONS_007: Array<{ version: string; sql: string }> = [
  {
    version: '007_cases_dialogue_stage',
    sql: `ALTER TABLE cases ADD COLUMN dialogue_stage TEXT;
ALTER TABLE cases ADD COLUMN stage_updated_at TEXT;`,
  },
];
