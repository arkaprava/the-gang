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

async function readStore(): Promise<StoreShape> {
  if (hasDatabaseUrl()) {
    try {
      const [runs, memory] = await Promise.all([loadRuns(), loadContext()]);
      return { runs, memory };
    } catch (error) {
      console.error("Postgres store unavailable, using local file", error);
    }
  }
  return readFileStore();
}

async function persist(store: StoreShape, previous?: StoreShape) {
  if (hasDatabaseUrl()) {
    try {
      const prevIds = new Set((previous?.runs ?? []).map((run) => run.id));
      const prevMemory = new Set((previous?.memory ?? []).map((entry) => entry.id));
      for (const run of store.runs) {
        if (!prevIds.has(run.id) || JSON.stringify(previous?.runs.find((item) => item.id === run.id)) !== JSON.stringify(run)) {
          await upsertRun(run);
        }
      }
      for (const entry of store.memory) {
        if (!prevMemory.has(entry.id)) {
          await appendContext(entry);
        }
      }
      return;
    } catch (error) {
      console.error("Postgres persist failed, writing local file", error);
    }
  }
  await persistFile(store);
}

export async function getStore() {
  return withLock(() => readStore());
}

export async function updateStore(mutator: (store: StoreShape) => void | Promise<void>) {
  return withLock(async () => {
    const store = await readStore();
    const previous = structuredClone(store);
    await mutator(store);
    await persist(store, previous);
    return store;
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
  if (hasDatabaseUrl()) {
    try {
      return await searchContextDb(query, limit);
    } catch (error) {
      console.error("pgvector search failed, using local cosine", error);
    }
  }
  const store = await getStore();
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
  await updateStore((store) => {
    store.memory.unshift(entry);
  });
  return entry;
}
