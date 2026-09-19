import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnthropicClient, type AnthropicMessagesClient } from "./anthropic";

test("sends an Anthropic Messages-shaped request and concatenates text blocks", async () => {
  let captured: any;
  const fakeSdkClient: AnthropicMessagesClient = {
    messages: {
      async create(params) {
        captured = params;
        return {
          stop_reason: "end_turn",
          content: [
            { type: "text", text: '{"ok":' },
            { type: "text", text: "true}" },
          ],
        };
      },
    },
  };

  const client = createAnthropicClient({ apiKey: "sk-ant-test", model: "claude-test", client: fakeSdkClient });
  const text = await client.complete({ system: "sys", prompt: "usr" });

  assert.equal(text, '{"ok":true}');
  assert.equal(captured.model, "claude-test");
  assert.equal(captured.system, "sys");
  assert.deepEqual(captured.messages, [{ role: "user", content: "usr" }]);
  assert.equal(client.provider, "claude");
});

test("throws on a refusal instead of returning empty/misleading content", async () => {
  const fakeSdkClient: AnthropicMessagesClient = {
    messages: {
      async create() {
        return { stop_reason: "refusal", content: [] };
      },
    },
  };
  const client = createAnthropicClient({ apiKey: "sk-ant-test", model: "claude-test", client: fakeSdkClient });
  await assert.rejects(() => client.complete({ system: "s", prompt: "p" }), /refused/);
});

test("throws when there are no text content blocks", async () => {
  const fakeSdkClient: AnthropicMessagesClient = {
    messages: {
      async create() {
        return { stop_reason: "end_turn", content: [{ type: "tool_use" }] };
      },
    },
  };
  const client = createAnthropicClient({ apiKey: "sk-ant-test", model: "claude-test", client: fakeSdkClient });
  await assert.rejects(() => client.complete({ system: "s", prompt: "p" }));
});

test("ignores non-text blocks mixed in with text blocks", async () => {
  const fakeSdkClient: AnthropicMessagesClient = {
    messages: {
      async create() {
        return {
          stop_reason: "end_turn",
          content: [
            { type: "thinking" },
            { type: "text", text: "hello" },
          ],
        };
      },
    },
  };
  const client = createAnthropicClient({ apiKey: "sk-ant-test", model: "claude-test", client: fakeSdkClient });
  assert.equal(await client.complete({ system: "s", prompt: "p" }), "hello");
});
