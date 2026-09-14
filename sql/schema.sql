-- Shared context for The Gang (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS gang_runs (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- `embedding` is a 48-bucket hashed bag-of-words vector (src/lib/gang/memory.ts,
-- `embed()`), not a semantic embedding from a model. Cosine distance over it
-- finds shared-vocabulary text, not paraphrases — treat `context search` as
-- keyword-ish recall, not true semantic search.
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

-- Keeps `ORDER BY embedding <=> $1` (searchContext in src/lib/gang/db.ts) off
-- a full sequential scan as gang_context grows. HNSW needs no training step,
-- so it's safe to build even against an empty/small table.
CREATE INDEX IF NOT EXISTS gang_context_embedding_hnsw_idx
  ON gang_context USING hnsw (embedding vector_cosine_ops);
