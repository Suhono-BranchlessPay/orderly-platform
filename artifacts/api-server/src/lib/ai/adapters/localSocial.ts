import { buildDraftReply } from "../../socialDraft";
import { answerMenuAvailabilityQuestion } from "../../socialMenuAnswer";
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
        menu_item_names?: string;
        knowledge_base?: string;
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

      // Prefer catalog/knowledge for "do you have X?" over the generic question template.
      if (classification === "question") {
        const names = String(payload.menu_item_names ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const menuAnswer = answerMenuAvailabilityQuestion({
          message: messageText,
          authorName: payload.author_name ?? null,
          catalog: names.map((name) => ({ name })),
          knowledge: payload.knowledge_base ?? "",
        });
        if (menuAnswer.ok) {
          return {
            text: JSON.stringify({
              classification: "reply",
              label: "question",
              reason: "menu_catalog_answer",
              confidence: 0.9,
              draft: menuAnswer.draft,
              language: "en",
            }),
            inputTokens: 0,
            outputTokens: 0,
          };
        }
        if (
          menuAnswer.reason === "needs_human" &&
          (menuAnswer.riskFlags.includes("alcohol_ask") ||
            menuAnswer.riskFlags.includes("knowledge_escalate"))
        ) {
          return {
            text: JSON.stringify({
              classification: "escalate",
              label: "question",
              reason: "menu_question_needs_human",
              confidence: 0.85,
              draft: "",
              language: "en",
            }),
            inputTokens: 0,
            outputTokens: 0,
          };
        }
      }

      const draft = buildDraftReply({
        classification,
        authorName: payload.author_name ?? null,
        tenantName: payload.tenant_name ?? "our restaurant",
        brandVoiceHint: payload.brand_voice ?? "",
      });

      if (!draft?.trim()) {
        return {
          text: JSON.stringify({
            classification: "skip",
            label: "other",
            reason: "no_safe_template",
            confidence: 0.7,
            draft: "",
            language: "en",
          }),
          inputTokens: 0,
          outputTokens: 0,
        };
      }

      // Complaint still gets a review draft; social.ts flags escalate from heuristic.
      return {
        text: JSON.stringify({
          classification: "reply",
          label: classification,
          reason: classification,
          confidence: classification === "complaint" ? 0.9 : 0.75,
          draft,
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
