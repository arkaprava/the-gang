import assert from "node:assert/strict";
import { test } from "node:test";
import { generateWithFallback } from "./withFallback";
import type { LlmClient } from "./types";

function fakeClient(complete: LlmClient["complete"]): LlmClient {
  return { provider: "claude", model: "test-model", complete };
}

test("no client configured falls back to the template", async () => {
  const result = await generateWithFallback({
    client: null,
    system: "s",
    prompt: "p",
    parse: (raw) => raw as string,
    fallback: () => "template-output",
  });
  assert.equal(result.source, "template");
  assert.equal(result.output, "template-output");
  assert.match(result.note ?? "", /no LLM provider configured/);
});

test("a successful, valid response is used as-is", async () => {
  const client = fakeClient(async () => JSON.stringify({ ok: true }));
  const result = await generateWithFallback({
    client,
    system: "s",
    prompt: "p",
    parse: (raw) => raw as { ok: boolean },
    fallback: () => ({ ok: false }),
  });
  assert.equal(result.source, "llm");
  assert.deepEqual(result.output, { ok: true });
  assert.equal(result.provider, "claude");
  assert.equal(result.model, "test-model");
});

test("a thrown network error falls back to the template", async () => {
  const client = fakeClient(async () => {
    throw new Error("ECONNREFUSED");
  });
  const result = await generateWithFallback({
    client,
    system: "s",
    prompt: "p",
    parse: (raw) => raw as string,
    fallback: () => "template-output",
  });
  assert.equal(result.source, "template");
  assert.equal(result.output, "template-output");
  assert.match(result.note ?? "", /ECONNREFUSED/);
});

test("non-JSON text falls back to the template", async () => {
  const client = fakeClient(async () => "sorry, I can't do that");
  const result = await generateWithFallback({
    client,
    system: "s",
    prompt: "p",
    parse: (raw) => raw as string,
    fallback: () => "template-output",
  });
  assert.equal(result.source, "template");
});

test("a `parse` that rejects the shape falls back to the template", async () => {
  const client = fakeClient(async () => JSON.stringify({ wrong: "shape" }));
  const result = await generateWithFallback({
    client,
    system: "s",
    prompt: "p",
    parse: () => {
      throw new Error("missing required field");
    },
    fallback: () => "template-output",
  });
  assert.equal(result.source, "template");
  assert.match(result.note ?? "", /missing required field/);
});
