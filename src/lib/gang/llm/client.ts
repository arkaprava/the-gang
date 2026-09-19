import { createAnthropicClient } from "./providers/anthropic";
import { createOpenAiCompatibleClient } from "./providers/openaiCompatible";
import type { LlmClient, LlmProvider } from "./types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

const PROVIDER_KEY_ENV: Record<LlmProvider, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

function isLlmProvider(value: string): value is LlmProvider {
  return value === "claude" || value === "openai" || value === "deepseek";
}

// Decided once per process and cached — the same idiom as store.ts's
// backend detection (getStore()'s `backend`/`cache`). Config is read once;
// a key added/changed mid-process needs a restart to take effect, exactly
// like the Postgres-vs-file decision.
let cached: LlmClient | null | undefined;

export function resetLlmClientCache() {
  cached = undefined;
}

// `env` defaults to `process.env` but is a real parameter so provider-
// selection logic is unit-testable without mutating global state.
export function getLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  if (cached !== undefined) return cached;

  const providerRaw = env.GANG_LLM_PROVIDER?.trim();
  const model = env.GANG_LLM_MODEL?.trim();

  // No baked-in default model id: provider/model names go stale (this repo
  // learned that the hard way researching this feature — "the current GPT
  // model" and "the current DeepSeek model" both moved during this same
  // project). Require the user to name one explicitly rather than silently
  // guessing a model that may no longer exist.
  if (!providerRaw || !model || !isLlmProvider(providerRaw)) {
    cached = null;
    return cached;
  }

  const apiKey = env[PROVIDER_KEY_ENV[providerRaw]]?.trim();
  if (!apiKey) {
    cached = null;
    return cached;
  }

  cached =
    providerRaw === "claude"
      ? createAnthropicClient({ apiKey, model })
      : createOpenAiCompatibleClient({
          provider: providerRaw,
          baseUrl: providerRaw === "openai" ? OPENAI_BASE_URL : DEEPSEEK_BASE_URL,
          apiKey,
          model,
        });
  return cached;
}
