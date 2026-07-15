import { estimateCostUsd } from "../config";
import type { NormalizedChatRequest, NormalizedChatResponse } from "../types";
import type { ProviderAdapter } from "./types";

export function createAnthropicAdapter(): ProviderAdapter {
  return {
    name: "anthropic",
    isAvailable() {
      return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    },
    async chat(req: NormalizedChatRequest): Promise<NormalizedChatResponse> {
      const key = process.env.ANTHROPIC_API_KEY?.trim();
      if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text =
        data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
      return {
        text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    },
    estimateCost(model, inputTokens, outputTokens) {
      return estimateCostUsd(model, inputTokens, outputTokens);
    },
  };
}
