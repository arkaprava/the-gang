import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appendContext,
  hasDatabaseUrl,
  loadContext,
  loadRuns,
  searchContext as searchContextDb,
  upsertRun,
} from "./db";
import { remember, retrieveMemory, SEED_MEMORY } from "./memory";
import type { MemoryEntry, Run, StoreShape } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "gang.json");

let lock: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function seed(): StoreShape {
  const memory: MemoryEntry[] = SEED_MEMORY.map((entry) => {
    const item = remember({
      role: entry.role,
      runId: entry.runId,
      text: entry.text,
      tags: entry.tags,
      source: entry.source ?? "seed",
    });
    item.id = entry.id;
    return item;
  });
  return { runs: [], memory };
}

async function readFileStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const store = JSON.parse(raw) as StoreShape;
    store.runs ??= [];
    store.memory ??= [];
    for (const entry of store.memory) {
      entry.source ??= "agent";
    }
    return store;
  } catch {
    const seeded = seed();
    await persistFile(seeded);
    return seeded;
  }
}

async function persistFile(store: StoreShape) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

// The backend (Postgres vs. local file) is decided once per process, the
// first time the store is touched, and a hydrated copy is kept in memory
// from then on. Callers mutate that cached object directly and then persist
// only the row(s) they changed — no more "read everything, clone it, diff
// it against a snapshot" on every single mutation, and no more silently
// hopping between backends mid-session if Postgres has a blip.
type Backend = "postgres" | "file";
let backend: Backend | null = null;
let cache: StoreShape | null = null;
let hydrating: Promise<StoreShape> | null = null;

// Exposed so callers can report where a write actually landed (e.g. CLI
// confirmation messages) instead of assuming Postgres. Resolves once the
// store has been touched at least once; call it after an operation that
// already awaited getStore()/addMemoryEntry()/etc., not before.
export async function activeBackend(): Promise<Backend> {
  await getStore();
  return backend!;
}

async function hydrate(): Promise<StoreShape> {
  if (hasDatabaseUrl()) {
    try {
      const [runs, memory] = await Promise.all([loadRuns(), loadContext()]);
      backend = "postgres";
      return { runs, memory };
    } catch (error) {
      console.error("Postgres store unavailable — using the local file store for this session.", error);
    }
  }
  backend = "file";
  return readFileStore();
}

export async function getStore(): Promise<StoreShape> {
  if (cache) return cache;
  if (!hydrating) hydrating = hydrate();
  cache = await hydrating;
  return cache;
}

async function persistRun(run: Run) {
  if (backend === "postgres") {
    try {
      await upsertRun(run);
      return;
    } catch (error) {
      console.error("Postgres write failed — falling back to the local file store for this session.", error);
      backend = "file";
    }
  }
  await persistFile(await getStore());
}

async function persistMemoryEntry(entry: MemoryEntry) {
  if (backend === "postgres") {
    try {
      await appendContext(entry);
      return;
    } catch (error) {
      console.error("Postgres write failed — falling back to the local file store for this session.", error);
      backend = "file";
    }
  }
  await persistFile(await getStore());
}

export async function createRunRecord(run: Run): Promise<Run> {
  return withLock(async () => {
    const store = await getStore();
    store.runs.unshift(run);
    await persistRun(run);
    return run;
  });
}

export async function mutateRun(id: string, mutator: (run: Run) => void): Promise<Run> {
  return withLock(async () => {
    const store = await getStore();
    const run = store.runs.find((item) => item.id === id);
    if (!run) throw new Error("Run not found");
    mutator(run);
    await persistRun(run);
    return run;
  });
}

export async function addMemoryEntry(entry: MemoryEntry): Promise<MemoryEntry> {
  return withLock(async () => {
    const store = await getStore();
    store.memory.unshift(entry);
    await persistMemoryEntry(entry);
    return entry;
  });
}

export async function getRun(id: string): Promise<Run | undefined> {
  const store = await getStore();
  return store.runs.find((run) => run.id === id);
}

export function summarizeRun(run: Run) {
  return {
    id: run.id,
    title: run.title,
    description: run.description,
    createdAt: run.createdAt,
    status: run.status,
    currentStage: run.currentStage,
    skills: run.skills,
  };
}

export async function querySharedContext(query: string, limit = 8) {
  const store = await getStore(); // ensures `backend` has been decided
  if (backend === "postgres") {
    try {
      return await searchContextDb(query, limit);
    } catch (error) {
      console.error("pgvector search failed, using local cosine", error);
    }
  }
  return retrieveMemory(store.memory, query, limit).map((hit) => {
    const entry = store.memory.find((item) => item.id === hit.id);
    return {
      ...hit,
      runId: entry?.runId ?? "",
      tags: entry?.tags ?? [],
      source: entry?.source ?? "agent",
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    };
  });
}

export async function addUserContext(text: string, tags: string[] = ["user"]) {
  const entry = remember({
    role: "PO",
    runId: "user",
    text: text.trim(),
    tags: tags.length ? tags : ["user"],
    source: "user",
  });
  await addMemoryEntry(entry);
  return entry;
}
