export const MIGRATIONS_005: Array<{ version: string; sql: string }> = [
  {
    version: '005_persons_persona_tone',
    sql: `ALTER TABLE persons ADD COLUMN persona TEXT;
ALTER TABLE persons ADD COLUMN tone TEXT;`,
  },
];
