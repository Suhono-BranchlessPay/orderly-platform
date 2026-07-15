import type {
  AiProviderName,
  NormalizedChatRequest,
  NormalizedChatResponse,
} from "../types";

export type ProviderAdapter = {
  name: AiProviderName;
  /** False when required API key is missing. */
  isAvailable(): boolean;
  chat(req: NormalizedChatRequest): Promise<NormalizedChatResponse>;
  estimateCost(model: string, inputTokens: number, outputTokens: number): number;
};
