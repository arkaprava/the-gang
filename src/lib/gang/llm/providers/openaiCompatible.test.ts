import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAiCompatibleClient } from "./openaiCompatible";

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  return (async (url: string | URL, init?: RequestInit) => {
    const { status, body } = handler(String(url), init ?? {});
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

test("sends an OpenAI-shaped chat-completions request", async () => {
  let capturedUrl = "";
  let capturedBody: any;
  const fetchImpl = fakeFetch((url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(String(init.body));
    return { status: 200, body: { choices: [{ message: { content: '{"ok":true}' } }] } };
  });

  const client = createOpenAiCompatibleClient({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    model: "gpt-test",
    fetchImpl,
  });

  const text = await client.complete({ system: "sys", prompt: "usr" });

  assert.equal(text, '{"ok":true}');
  assert.equal(capturedUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(capturedBody.model, "gpt-test");
  assert.deepEqual(capturedBody.messages, [
    { role: "system", content: "sys" },
    { role: "user", content: "usr" },
  ]);
});

test("works identically for the deepseek provider (same OpenAI-compatible shape)", async () => {
  let capturedUrl = "";
  const fetchImpl = fakeFetch((url) => {
    capturedUrl = url;
    return { status: 200, body: { choices: [{ message: { content: "hi" } }] } };
  });

  const client = createOpenAiCompatibleClient({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "ds-test",
    model: "deepseek-v4-pro",
    fetchImpl,
  });

  await client.complete({ system: "sys", prompt: "usr" });
  assert.equal(capturedUrl, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(client.provider, "deepseek");
});

test("throws on a non-2xx response", async () => {
  const fetchImpl = fakeFetch(() => ({ status: 401, body: { error: "invalid api key" } }));
  const client = createOpenAiCompatibleClient({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "bad",
    model: "gpt-test",
    fetchImpl,
  });
  await assert.rejects(() => client.complete({ system: "s", prompt: "p" }), /401/);
});

test("throws when there is no message content", async () => {
  const fetchImpl = fakeFetch(() => ({ status: 200, body: { choices: [{ message: {} }] } }));
  const client = createOpenAiCompatibleClient({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    model: "gpt-test",
    fetchImpl,
  });
  await assert.rejects(() => client.complete({ system: "s", prompt: "p" }));
});
