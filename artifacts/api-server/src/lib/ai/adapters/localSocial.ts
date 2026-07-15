import { buildDraftReply } from "../../socialDraft";
import type { SocialClassification } from "@workspace/db";
import { looksLikePeerConversation } from "../peerChat";
import type { NormalizedChatRequest, NormalizedChatResponse } from "../types";
import type { ProviderAdapter } from "./types";

/**
 * Deterministic local "provider" for social_draft when no vendor key is set,
 * or as primary until LLM is enabled. Implements peer-SKIP from production bug.
 */
export function createLocalSocialAdapter(): ProviderAdapter {
  return {
    name: "local",
    isAvailable() {
      return true;
    },
    async chat(req: NormalizedChatRequest): Promise<NormalizedChatResponse> {
      // User payload is JSON from buildSocialDraftRequest.
      let payload: {
        message_text?: string;
        author_name?: string | null;
        tenant_name?: string;
        heuristic_classification?: SocialClassification;
        brand_voice?: string;
      } = {};
      try {
        payload = JSON.parse(req.user) as typeof payload;
      } catch {
        payload = { message_text: req.user };
      }

      const messageText = String(payload.message_text ?? "");
      const peer = looksLikePeerConversation(messageText);
      if (peer.peer) {
        const out = {
          classification: "skip",
          reason: peer.reason,
          confidence: 0.92,
          draft: "",
          language: "en",
        };
        return { text: JSON.stringify(out), inputTokens: 0, outputTokens: 0 };
      }

      const classification = (payload.heuristic_classification ?? "unknown") as SocialClassification;
      if (classification === "allergy_health") {
        return {
          text: JSON.stringify({
            classification: "escalate",
            reason: "allergy_health",
            confidence: 0.99,
            draft: "",
            language: "en",
          }),
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      if (classification === "spam") {
        return {
          text: JSON.stringify({
            classification: "skip",
            reason: "spam",
            confidence: 0.9,
            draft: "",
            language: "en",
          }),
          inputTokens: 0,
          outputTokens: 0,
        };
      }

      // Unknown without peer signals: escalate rather than generic follow-up spam.
      if (classification === "unknown") {
        return {
          text: JSON.stringify({
            classification: "escalate",
            reason: "unknown_needs_human",
            confidence: 0.55,
            draft: "",
            language: "en",
          }),
          inputTokens: 0,
          outputTokens: 0,
        };
      }

      const draft = buildDraftReply({
        classification,
        authorName: payload.author_name ?? null,
        tenantName: payload.tenant_name ?? "our restaurant",
        brandVoiceHint: payload.brand_voice ?? "",
      });

      // Complaint still gets a review draft; social.ts flags escalate from heuristic.
      return {
        text: JSON.stringify({
          classification: "reply",
          reason: classification,
          confidence: classification === "complaint" ? 0.9 : 0.75,
          draft: draft ?? "",
          language: "en",
        }),
        inputTokens: 0,
        outputTokens: 0,
      };
    },
    estimateCost() {
      return 0;
    },
  };
}
