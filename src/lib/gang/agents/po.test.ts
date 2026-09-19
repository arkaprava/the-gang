import assert from "node:assert/strict";
import { test } from "node:test";
import { producePoOutput, runProductOwner } from "./po";
import { analyzeIntent } from "../intent";
import type { LlmClient } from "../llm/types";

function fakeClient(complete: LlmClient["complete"]): LlmClient {
  return { provider: "claude", model: "test-model", complete };
}

test("producePoOutput: no client configured falls back to the deterministic PO", async () => {
  const description = "Add a waitlist with email";
  const intent = analyzeIntent(description);
  const result = await producePoOutput(null, description, [], intent);
  assert.equal(result.source, "template");
  assert.deepEqual(result.output, runProductOwner(description, [], intent));
});

test("producePoOutput: a valid LLM response is used as-is", async () => {
  const description = "Add a waitlist with email";
  const intent = analyzeIntent(description);
  const client = fakeClient(async () =>
    JSON.stringify({
      epic: "Waitlist delivery",
      summary: "LLM-written summary.",
      stories: [
        { id: "US-1", title: "t", asA: "user", iWant: "x", soThat: "y", acceptance: ["a"] },
        { id: "US-2", title: "t2", asA: "user", iWant: "x2", soThat: "y2", acceptance: [] },
      ],
      risks: [{ title: "r", severity: "low", mitigation: "m" }],
      scope: ["s1"],
      outOfScope: ["o1"],
    })
  );
  const result = await producePoOutput(client, description, [], intent);
  assert.equal(result.source, "llm");
  assert.equal(result.output.summary, "LLM-written summary.");
  assert.equal(result.output.stories.length, 2);
});

test("producePoOutput: an incomplete response falls back to the deterministic PO", async () => {
  const description = "Add a waitlist with email";
  const intent = analyzeIntent(description);
  const client = fakeClient(async () => JSON.stringify({ epic: "only an epic" }));
  const result = await producePoOutput(client, description, [], intent);
  assert.equal(result.source, "template");
});
