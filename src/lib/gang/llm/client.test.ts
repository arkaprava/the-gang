import assert from "node:assert/strict";
import { test } from "node:test";
import { getLlmClient, resetLlmClientCache } from "./client";

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

test("no provider/model configured -> null", () => {
  resetLlmClientCache();
  assert.equal(getLlmClient(env({})), null);
});

test("provider set but model missing -> null (no baked-in default model)", () => {
  resetLlmClientCache();
  assert.equal(getLlmClient(env({ GANG_LLM_PROVIDER: "claude", ANTHROPIC_API_KEY: "sk-ant-x" })), null);
});

test("provider+model set but the matching key is missing -> null", () => {
  resetLlmClientCache();
  assert.equal(getLlmClient(env({ GANG_LLM_PROVIDER: "claude", GANG_LLM_MODEL: "claude-test" })), null);
});

test("an unknown provider name -> null", () => {
  resetLlmClientCache();
  assert.equal(
    getLlmClient(env({ GANG_LLM_PROVIDER: "mistral", GANG_LLM_MODEL: "x", ANTHROPIC_API_KEY: "sk-ant-x" })),
    null
  );
});

test("fully configured claude -> a claude client with the given model", () => {
  resetLlmClientCache();
  const client = getLlmClient(env({ GANG_LLM_PROVIDER: "claude", GANG_LLM_MODEL: "claude-test", ANTHROPIC_API_KEY: "sk-ant-x" }));
  assert.equal(client?.provider, "claude");
  assert.equal(client?.model, "claude-test");
});

test("fully configured openai -> an openai client", () => {
  resetLlmClientCache();
  const client = getLlmClient(env({ GANG_LLM_PROVIDER: "openai", GANG_LLM_MODEL: "gpt-test", OPENAI_API_KEY: "sk-test" }));
  assert.equal(client?.provider, "openai");
});

test("fully configured deepseek -> a deepseek client", () => {
  resetLlmClientCache();
  const client = getLlmClient(env({ GANG_LLM_PROVIDER: "deepseek", GANG_LLM_MODEL: "deepseek-v4-pro", DEEPSEEK_API_KEY: "ds-test" }));
  assert.equal(client?.provider, "deepseek");
});

test("the result is cached across calls until reset", () => {
  resetLlmClientCache();
  const first = getLlmClient(env({ GANG_LLM_PROVIDER: "claude", GANG_LLM_MODEL: "claude-test", ANTHROPIC_API_KEY: "sk-ant-x" }));
  // A second call with a *different* env is ignored — this documents the
  // decide-once-per-process behavior (mirrors store.ts's backend caching);
  // resetLlmClientCache() is the explicit escape hatch tests use.
  const second = getLlmClient(env({ GANG_LLM_PROVIDER: "openai", GANG_LLM_MODEL: "gpt-test", OPENAI_API_KEY: "sk-test" }));
  assert.equal(second, first);
});
