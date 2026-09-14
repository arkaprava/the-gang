import postgres, { type Sql } from "postgres";
import { remember, SEED_MEMORY, toVectorLiteral } from "./memory";
import type { MemoryEntry, MemorySource, Run } from "./types";

let sql: Sql | null = null;
let ready: Promise<void> | null = null;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export async function closeDatabase() {
  if (sql) {
    await sql.end({ timeout: 1 });
    sql = null;
    ready = null;
  }
}

function getSql(): Sql {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, {
      max: 4,
      prepare: false,
    });
  }
  return sql;
}

export async function ensureDatabase() {
  if (!hasDatabaseUrl()) return;
  if (!ready) {
    ready = (async () => {
      const db = getSql();
      await db`CREATE EXTENSION IF NOT EXISTS vector`;
      await db`
        CREATE TABLE IF NOT EXISTS gang_runs (
          id uuid PRIMARY KEY,
          payload jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await db`
        CREATE TABLE IF NOT EXISTS gang_context (
          id uuid PRIMARY KEY,
          role text NOT NULL,
          run_id text NOT NULL,
          text text NOT NULL,
          tags text[] NOT NULL DEFAULT '{}',
          source text NOT NULL DEFAULT 'agent',
          embedding vector(48) NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await db`CREATE INDEX IF NOT EXISTS gang_context_created_idx ON gang_context (created_at DESC)`;
      await db`
        CREATE INDEX IF NOT EXISTS gang_context_embedding_hnsw_idx
        ON gang_context USING hnsw (embedding vector_cosine_ops)
      `;
      for (const seed of SEED_MEMORY) {
        const entry = remember({
          role: seed.role,
          runId: seed.runId,
          text: seed.text,
          tags: seed.tags,
          source: seed.source ?? "seed",
        });
        entry.id = seed.id;
        await insertContextRow(entry);
      }
    })();
  }
  await ready;
}

function mapContextRow(row: Record<string, unknown>): MemoryEntry {
  const embedding = row.embedding;
  let vector: number[] = [];
  if (typeof embedding === "string") {
    vector = embedding
      .replace("[", "")
      .replace("]", "")
      .split(",")
      .map((n) => Number(n));
  } else if (Array.isArray(embedding)) {
    vector = embedding.map(Number);
  }
  return {
    id: String(row.id),
    role: row.role as MemoryEntry["role"],
    runId: String(row.run_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    text: String(row.text),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    vector,
    source: (row.source as MemorySource) || "agent",
  };
}

async function insertContextRow(entry: MemoryEntry) {
  const db = getSql();
  const literal = toVectorLiteral(entry.vector);
  await db`
    INSERT INTO gang_context (id, role, run_id, text, tags, source, embedding, created_at)
    VALUES (
      ${entry.id}::uuid,
      ${entry.role},
      ${entry.runId},
      ${entry.text},
      ${entry.tags},
      ${entry.source},
      ${literal}::vector,
      ${entry.createdAt}::timestamptz
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function loadRuns(): Promise<Run[]> {
  await ensureDatabase();
  const db = getSql();
  const rows = await db`SELECT payload FROM gang_runs ORDER BY created_at DESC`;
  return rows.map((row) => row.payload as Run);
}

export async function upsertRun(run: Run) {
  await ensureDatabase();
  const db = getSql();
  await db`
    INSERT INTO gang_runs (id, payload, created_at)
    VALUES (${run.id}::uuid, ${db.json(run)}, ${run.createdAt}::timestamptz)
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
  `;
}

export async function loadContext(): Promise<MemoryEntry[]> {
  await ensureDatabase();
  const db = getSql();
  const rows = await db`
    SELECT id, role, run_id, text, tags, source, embedding, created_at
    FROM gang_context
    ORDER BY created_at DESC
  `;
  return rows.map((row) => mapContextRow(row as Record<string, unknown>));
}

export async function appendContext(entry: MemoryEntry) {
  await ensureDatabase();
  await insertContextRow(entry);
}

export async function searchContext(query: string, limit = 8) {
  await ensureDatabase();
  const db = getSql();
  const { embed } = await import("./memory");
  const literal = toVectorLiteral(embed(query));
  const rows = await db`
    SELECT
      id, role, run_id, text, tags, source, created_at,
      1 - (embedding <=> ${literal}::vector) AS score
    FROM gang_context
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${limit}
  `;
  return rows
    .map((row) => ({
      id: String(row.id),
      role: row.role as MemoryEntry["role"],
      runId: String(row.run_id),
      text: String(row.text),
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      source: (row.source as MemorySource) || "agent",
      createdAt: new Date(String(row.created_at)).toISOString(),
      score: Number(row.score) || 0,
    }))
    .filter((hit) => hit.score > 0.08);
}
