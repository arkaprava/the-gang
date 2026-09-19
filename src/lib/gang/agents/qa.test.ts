import assert from "node:assert/strict";
import { test } from "node:test";
import { runBusinessAnalyst } from "./ba";
import { runDeveloper } from "./dev";
import { produceQaOutput, runQa } from "./qa";
import { producePoOutput } from "./po";
import { analyzeIntent } from "../intent";
import type { LlmClient } from "../llm/types";

function fakeClient(complete: LlmClient["complete"]): LlmClient {
  return { provider: "claude", model: "test-model", complete };
}

async function setup() {
  const description = "Add a waitlist with email";
  const intent = analyzeIntent(description);
  const po = (await producePoOutput(null, description, [], intent)).output;
  const ba = runBusinessAnalyst(intent, []);
  const dev = runDeveloper(intent, ba);
  return { po, dev };
}

test("produceQaOutput: no client configured falls back to the deterministic QA verdicts and summary", async () => {
  const { po, dev } = await setup();
  const result = await produceQaOutput(null, po, dev);
  assert.equal(result.source, "template");
  assert.deepEqual(result.output, runQa(po, dev));
});

test("produceQaOutput: verdicts/coverage/issues NEVER come from the LLM, even on a successful call", async () => {
  const { po, dev } = await setup();
  const deterministic = runQa(po, dev);
  const client = fakeClient(async () =>
    JSON.stringify({ summary: "llm-written summary", advisoryNotes: ["watch out for X"] })
  );
  const result = await produceQaOutput(client, po, dev);
  assert.equal(result.source, "llm");
  // The parts that must never be LLM-influenced are byte-for-byte identical
  // to the deterministic run.
  assert.deepEqual(result.output.tests, deterministic.tests);
  assert.equal(result.output.coverage, deterministic.coverage);
  assert.deepEqual(result.output.issues, deterministic.issues);
  // Only the prose changed.
  assert.equal(result.output.summary, "llm-written summary");
  assert.deepEqual(result.output.advisoryNotes, ["watch out for X"]);
});

test("produceQaOutput: an LLM failure still returns the full deterministic QA output, not a degraded one", async () => {
  const { po, dev } = await setup();
  const deterministic = runQa(po, dev);
  const client = fakeClient(async () => {
    throw new Error("timeout");
  });
  const result = await produceQaOutput(client, po, dev);
  assert.equal(result.source, "template");
  assert.deepEqual(result.output, deterministic);
});
