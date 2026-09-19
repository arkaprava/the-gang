import { extractJson } from "./jsonExtract";
import type { LlmClient } from "./types";

export type GenerateResult<T> = {
  output: T;
  source: "llm" | "template";
  provider?: string;
  model?: string;
  note?: string;
};

// The one piece of logic every LLM-backed stage shares: try the model, and
// on ANY failure — no client configured, network error, non-JSON response,
// a `parse` that rejects the shape — fall back to the existing deterministic
// function for that stage. This mirrors the Postgres->local-file fallback
// already in store.ts (decide once, degrade gracefully, the run still
// completes) and is fully unit-testable with a fake LlmClient — no network.
export async function generateWithFallback<T>(params: {
  client: LlmClient | null;
  system: string;
  prompt: string;
  parse: (raw: unknown) => T; // throws (or returns a value that fails validation) on a bad shape
  fallback: () => T;
}): Promise<GenerateResult<T>> {
  const { client, system, prompt, parse, fallback } = params;

  if (!client) {
    return { output: fallback(), source: "template", note: "no LLM provider configured" };
  }

  try {
    const raw = await client.complete({ system, prompt });
    const json = extractJson(raw);
    const output = parse(json);
    return { output, source: "llm", provider: client.provider, model: client.model };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      output: fallback(),
      source: "template",
      provider: client.provider,
      model: client.model,
      note: `LLM call failed, used the deterministic template instead: ${reason}`,
    };
  }
}
