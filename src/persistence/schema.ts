/**
 * SQL schema for the calculations ledger. Applied idempotently at startup.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS calculations (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request    JSONB NOT NULL,
  result     JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS calculations_created_at_idx
  ON calculations (created_at DESC);
`;
