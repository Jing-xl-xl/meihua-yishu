export const ADD_PERSONS_ROLE_CARD = `
ALTER TABLE persons ADD COLUMN role_card TEXT;
`;

export const MIGRATIONS_003: { version: string; sql: string }[] = [
  { version: '003_persons_role_card', sql: ADD_PERSONS_ROLE_CARD },
];
