import type { LlmClient, LlmProvider } from "../types";

type FetchLike = typeof fetch;

// Covers both OpenAI and DeepSeek (DeepSeek's API is documented as
// OpenAI-compatible chat-completions-shaped at https://api.deepseek.com) —
// one thin raw-fetch client parameterized by base URL, no SDK dependency.
export function createOpenAiCompatibleClient(params: {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
}): LlmClient {
  const { provider, baseUrl, apiKey, model, fetchImpl = fetch } = params;

  return {
    provider,
    model,
    async complete({ system, prompt, maxTokens }) {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`${provider} API error ${response.status}: ${body.slice(0, 500)}`);
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`${provider} API returned no message content`);
      }
      return content;
    },
  };
}
