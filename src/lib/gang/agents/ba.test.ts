import assert from "node:assert/strict";
import { test } from "node:test";
import { produceBaOutput, runBusinessAnalyst } from "./ba";
import { analyzeIntent } from "../intent";
import type { LlmClient } from "../llm/types";

function fakeClient(complete: LlmClient["complete"]): LlmClient {
  return { provider: "claude", model: "test-model", complete };
}

test("produceBaOutput: no client configured falls back to the deterministic BA", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const result = await produceBaOutput(null, intent, []);
  assert.equal(result.source, "template");
  assert.deepEqual(result.output, runBusinessAnalyst(intent, []));
});

test("produceBaOutput: valid prose overlays reasons/approach/notes without touching the structural stack/entities/apis", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const deterministic = runBusinessAnalyst(intent, []);
  const client = fakeClient(async () =>
    JSON.stringify({
      stackReasons: deterministic.stack.map((_, i) => `llm reason ${i}`),
      approach: ["llm approach bullet"],
      dataModelNotes: "llm data model notes",
    })
  );
  const result = await produceBaOutput(client, intent, []);
  assert.equal(result.source, "llm");
  // structural facts unchanged
  assert.deepEqual(result.output.entities, deterministic.entities);
  assert.deepEqual(result.output.apis, deterministic.apis);
  assert.deepEqual(result.output.stack.map((s) => s.name), deterministic.stack.map((s) => s.name));
  // prose overlaid
  assert.deepEqual(result.output.stack.map((s) => s.reason), deterministic.stack.map((_, i) => `llm reason ${i}`));
  assert.equal(result.output.dataModelNotes, "llm data model notes");
});

test("produceBaOutput: a stackReasons length mismatch falls back to the deterministic BA", async () => {
  const intent = analyzeIntent("Add a waitlist with email");
  const client = fakeClient(async () =>
    JSON.stringify({ stackReasons: ["only one reason"], approach: ["a"], dataModelNotes: "n" })
  );
  const result = await produceBaOutput(client, intent, []);
  assert.equal(result.source, "template");
  assert.match(result.note ?? "", /stackReasons has/);
});
