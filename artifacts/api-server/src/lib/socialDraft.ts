/**
 * Blok 4.1 — draft reply templates by classification.
 * Templates only — a human always reviews/edits before anything is approved,
 * and approval alone still never sends (see routes/social.ts /send).
 */
import type { SocialClassification } from "@workspace/db";

export type DraftTemplateInput = {
  classification: SocialClassification;
  authorName: string | null;
  tenantName: string;
  brandVoiceHint: string;
  /** Tracked short link (must include ?src=) for ordering_interest. */
  orderUrl?: string | null;
};

/**
 * Returns null when a classification must never get an auto-generated draft
 * (allergy_health, spam) — the caller is responsible for setting the row's
 * status accordingly (blocked / skipped) and escalating to the owner.
 */
export function buildDraftReply(input: DraftTemplateInput): string | null {
  const name = input.authorName?.trim() ? input.authorName.trim().split(" ")[0] : "there";

  switch (input.classification) {
    case "allergy_health":
    case "spam":
      return null;

    case "praise":
      return `Hi ${name}, thank you so much for the kind words — it really means a lot to our team at ${input.tenantName}! We hope to see you again soon. 🙏`;

    case "question":
      return `Hi ${name}, thanks for reaching out! Let me get you the exact answer — one moment while a member of our team follows up here. If it's urgent, feel free to call us directly.`;

    case "complaint":
      return `Hi ${name}, we're really sorry to hear this — that's not the experience we want for you. We'd like to make it right. Could you share your order details (date/time) so our manager can look into it directly?`;

    case "menu_suggestion":
      return `Thanks for the suggestion — we've noted it for the team. You can browse our current menu here anytime.`;

    case "ordering_interest": {
      const link =
        input.orderUrl?.trim() ||
        "https://samurairesto.com/r/samurai?src=social-reply";
      return `Hi ${name}, so glad you're ready to order! 🙌 Grab pickup or delivery here: ${link} — can't wait to see what you pick!`;
    }

    case "unknown":
    default:
      // Silence > wrong generic thank-you. Callers should skip when this is null.
      return null;
  }
}

/** Human-readable escalation note stored on blocked/skipped rows — never sent anywhere. */
export function buildEscalationNote(classification: SocialClassification): string {
  if (classification === "allergy_health") {
    return (
      "BLOCKED — allergy/health/halal keyword detected. Hard rule: never auto-answer " +
      "allergy, health, or halal questions. Escalate to the owner/manager to answer " +
      "directly and verbatim; do not paraphrase medical/ingredient claims."
    );
  }
  if (classification === "spam") {
    return "SKIPPED — looks like spam/troll content. Hard rule: do not reply.";
  }
  return "";
}
