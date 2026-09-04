import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { remember, SEED_MEMORY } from "./memory";
import type { MemoryEntry, Run, StoreShape } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "nova.json");

let cache: StoreShape | null = null;
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
  const memory: MemoryEntry[] = SEED_MEMORY.map((entry) =>
    remember({
      role: entry.role,
      runId: entry.runId,
      text: entry.text,
      tags: entry.tags,
    })
  );
  return { runs: [], memory };
}

async function readStore(): Promise<StoreShape> {
  if (cache) return cache;
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    cache = JSON.parse(raw) as StoreShape;
    cache.runs ??= [];
    cache.memory ??= [];
    return cache;
  } catch {
    cache = seed();
    await persist(cache);
    return cache;
  }
}

async function persist(store: StoreShape) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
  cache = store;
}

export async function getStore() {
  return withLock(() => readStore());
}

export async function updateStore(mutator: (store: StoreShape) => void | Promise<void>) {
  return withLock(async () => {
    const store = await readStore();
    await mutator(store);
    await persist(store);
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
