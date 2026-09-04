import type { LlmId } from "./types";

export const LLM_CATALOG: Record<
  LlmId,
  { id: LlmId; name: string; badge: string; costPer1k: number; local: boolean }
> = {
  claude: {
    id: "claude",
    name: "Claude",
    badge: "Best Quality",
    costPer1k: 0.008,
    local: false,
  },
  mistral: {
    id: "mistral",
    name: "Mistral (Local)",
    badge: "Free · Local",
    costPer1k: 0,
    local: true,
  },
  qwen: {
    id: "qwen",
    name: "Qwen 2.5 Coder",
    badge: "32k · Code",
    costPer1k: 0,
    local: true,
  },
};

export const SKILL_CATALOG = [
  {
    id: "code-review",
    name: "Code Review",
    desc: "Security, performance, and style analysis on every diff.",
  },
  {
    id: "documentation",
    name: "Documentation",
    desc: "API docs, README, and inline comments kept in sync with the code.",
  },
  {
    id: "security-audit",
    name: "Security Audit",
    desc: "Auth, input validation, secrets handling, and dependency review.",
  },
] as const;

export const DEFAULT_MODELS: Record<"PO" | "BA" | "DEV" | "QA", LlmId> = {
  PO: "claude",
  BA: "mistral",
  DEV: "qwen",
  QA: "mistral",
};

export function estimateRunCost(
  models: Record<"PO" | "BA" | "DEV" | "QA", LlmId>,
  skillCount: number
) {
  const baTokens = 900;
  const devTokens = 4200;
  const skillTokens = 500 * skillCount;
  const tokens = baTokens + devTokens + skillTokens;
  const usd =
    (baTokens / 1000) * LLM_CATALOG[models.BA].costPer1k +
    (devTokens / 1000) * LLM_CATALOG[models.DEV].costPer1k +
    (skillTokens / 1000) * LLM_CATALOG[models.DEV].costPer1k;
  const notes =
    "PO and QA are deterministic (no API calls). BA/DEV token estimates shown before the run.";
  return { estimatedUsd: Number(usd.toFixed(4)), tokens, notes };
}
