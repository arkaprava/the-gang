export type LlmProvider = "claude" | "openai" | "deepseek";

// One narrow interface every provider adapter implements. Each adapter owns
// its own wire shape internally (Anthropic's content-block messages vs. an
// OpenAI-compatible chat-completions body) — "one string of assistant text
// out" is the common denominator. Callers (the agents' `produce*Output`
// functions) parse and validate their own JSON out of that text; there is
// no shared schema library, matching this repo's existing hand-rolled
// validator style (see src/lib/gang/agents/dev.ts's generated validators).
export type LlmClient = {
  provider: LlmProvider;
  model: string;
  complete(params: { system: string; prompt: string; maxTokens?: number }): Promise<string>;
};
