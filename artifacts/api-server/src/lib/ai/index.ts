/**
 * AI Gateway — sole entry for features.
 * import { run } from "../lib/ai"  — never import vendor SDKs in feature code.
 */
export { run } from "./run";
export { isAiGatewayEnabled, resolveTaskRoute, getAiRoutingConfig } from "./config";
export { looksLikePeerConversation } from "./peerChat";
export { route, replayRoute, resolveRouteForRun } from "./router";
export type {
  AiTask,
  AiRunInput,
  AiRunResult,
  AiRunOpts,
  AiProviderName,
} from "./types";
export type { RequestProfile, RoutingContext, RoutingDecision } from "./router";
