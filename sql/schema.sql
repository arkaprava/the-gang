-- Shared context for The Gang (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS gang_runs (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gang_context (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  run_id text NOT NULL,
  text text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'agent',
  embedding vector(48) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gang_context_created_idx ON gang_context (created_at DESC);
