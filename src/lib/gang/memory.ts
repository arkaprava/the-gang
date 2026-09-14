import type { AgentRole, MemoryEntry, MemorySource } from "./types";
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
  source?: MemorySource;
}): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    role: input.role,
    runId: input.runId,
    createdAt: new Date().toISOString(),
    text: input.text,
    tags: input.tags,
    vector: embed(input.text),
    source: input.source ?? "agent",
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

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => (Number.isFinite(n) ? n.toFixed(6) : "0")).join(",")}]`;
}

export const SEED_MEMORY: (Omit<MemoryEntry, "createdAt" | "vector">)[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    role: "PO",
    runId: "seed",
    tags: ["conventions", "planning"],
    source: "seed",
    text: "The Gang convention: every feature starts with user stories and explicit acceptance criteria before any code is written.",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    role: "BA",
    runId: "seed",
    tags: ["architecture", "stack"],
    source: "seed",
    text: "Preferred stack is TypeScript, REST handlers, and a typed in-memory store. Avoid extra services unless the feature requires them.",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    role: "DEV",
    runId: "seed",
    tags: ["code", "a11y"],
    source: "seed",
    text: "UI convention: every input has a visible label, destructive actions confirm intent, and empty states explain the next step.",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    role: "QA",
    runId: "seed",
    tags: ["testing"],
    source: "seed",
    text: "QA convention: cover unit validation, the create/list path, and accessibility labels. Fail the run if a required field is unvalidated.",
  },
];
