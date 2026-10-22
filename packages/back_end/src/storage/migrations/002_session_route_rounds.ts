export const ADD_SESSION_ROUTE_ROUNDS = `
ALTER TABLE sessions ADD COLUMN route_rounds INTEGER DEFAULT 0;
`;

export const MIGRATIONS_002: { version: string; sql: string }[] = [
  { version: '002_session_route_rounds', sql: ADD_SESSION_ROUTE_ROUNDS },
];
