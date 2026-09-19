import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "../types";

// The slice of the SDK's `messages.create` this module actually calls —
// kept narrow and structural (rather than importing the SDK's full param/
// response types) so a test double can implement it without pulling in the
// SDK's client machinery. `client` defaults to a real `new Anthropic(...)`.
export type AnthropicMessagesClient = {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{
      stop_reason: string | null;
      content: { type: string; text?: string }[];
    }>;
  };
};

export function createAnthropicClient(params: {
  apiKey: string;
  model: string;
  client?: AnthropicMessagesClient;
}): LlmClient {
  const { apiKey, model, client = new Anthropic({ apiKey }) } = params;

  return {
    provider: "claude",
    model,
    async complete({ system, prompt, maxTokens }) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens ?? 4096,
        system,
        messages: [{ role: "user", content: prompt }],
      });

      // A refusal is a normal (HTTP 200) response with a real-looking shape
      // but no usable content — surface it as a real failure rather than
      // letting empty/irrelevant text flow into the JSON parser, where it
      // would fail with a misleading "invalid JSON" reason instead of this.
      if (response.stop_reason === "refusal") {
        throw new Error("claude refused the request");
      }

      const text = response.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("");

      if (!text.trim()) {
        throw new Error("claude API returned no text content");
      }
      return text;
    },
  };
}
