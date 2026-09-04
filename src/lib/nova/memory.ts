import type { AgentRole, MemoryEntry } from "./types";
import { tokenize } from "./text";

const DIM = 48;

export function embed(text: string): number[] {
  const vector = Array.from({ length: DIM }, () => 0);
  const tokens = tokenize(text);
  if (!tokens.length) return vector;
  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    vector[(hash >>> 0) % DIM] += 1;
  }
  const mag = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0)) || 1;
  return vector.map((n) => n / mag);
}

export function cosine(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) sum += a[i] * b[i];
  return sum;
}

export function remember(input: {
  role: AgentRole;
  runId: string;
  text: string;
  tags: string[];
}): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    role: input.role,
    runId: input.runId,
    createdAt: new Date().toISOString(),
    text: input.text,
    tags: input.tags,
    vector: embed(input.text),
  };
}

export function retrieveMemory(entries: MemoryEntry[], query: string, limit = 4) {
  const q = embed(query);
  return entries
    .map((entry) => ({
      id: entry.id,
      text: entry.text,
      role: entry.role,
      score: cosine(q, entry.vector),
    }))
    .filter((hit) => hit.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export const SEED_MEMORY: Omit<MemoryEntry, "id" | "createdAt" | "vector">[] = [
  {
    role: "PO",
    runId: "seed",
    tags: ["conventions", "planning"],
    text: "Company convention: every feature starts with user stories and explicit acceptance criteria before any code is written.",
  },
  {
    role: "BA",
    runId: "seed",
    tags: ["architecture", "stack"],
    text: "Preferred stack is TypeScript, REST handlers, and a typed in-memory store. Avoid extra services unless the feature requires them.",
  },
  {
    role: "DEV",
    runId: "seed",
    tags: ["code", "a11y"],
    text: "UI convention: every input has a visible label, destructive actions confirm intent, and empty states explain the next step.",
  },
  {
    role: "QA",
    runId: "seed",
    tags: ["testing"],
    text: "QA convention: cover unit validation, the create/list path, and accessibility labels. Fail the run if a required field is unvalidated.",
  },
];
