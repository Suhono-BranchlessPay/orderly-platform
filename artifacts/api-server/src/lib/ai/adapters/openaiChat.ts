import { estimateCostUsd } from "../config";
import type { NormalizedChatRequest, NormalizedChatResponse } from "../types";
import type { ProviderAdapter } from "./types";

export function createOpenAiAdapter(): ProviderAdapter {
  return {
    name: "openai",
    isAvailable() {
      return Boolean(process.env.OPENAI_API_KEY?.trim());
    },
    async chat(req: NormalizedChatRequest): Promise<NormalizedChatResponse> {
      const key = process.env.OPENAI_API_KEY?.trim();
      if (!key) throw new Error("OPENAI_API_KEY not configured");

      const body: Record<string, unknown> = {
        model: req.model,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      };
      if (req.responseFormat === "json") {
        body.response_format = { type: "json_object" };
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return {
        text,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    },
    estimateCost(model, inputTokens, outputTokens) {
      return estimateCostUsd(model, inputTokens, outputTokens);
    },
  };
}
