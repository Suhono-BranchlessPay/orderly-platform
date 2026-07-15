/**
 * Gateway guardrails — CODE, not prompt-only.
 * Pre: block unsafe tasks before vendor call.
 * Post: validate structured output.
 */

const ALLERGY_HEALTH_RE =
  /\b(allerg|anaphyla|epipen|peanut|shellfish|gluten|celiac|coeliac|lactose|halal|kosher|food\s*poison|vomit|diarrhea|hospital)\b/i;

export function preflightBlocksAi(task: string, input: Record<string, unknown>): string | null {
  if (task === "social_draft" || task === "review_draft") {
    const text = String(input.message_text ?? input.body ?? "");
    // Defense in depth — social.ts already blocks allergy rows, but gateway must too.
    if (ALLERGY_HEALTH_RE.test(text)) {
      return "pre_block:allergy_health — never send allergy/health/halal questions to AI vendors";
    }
  }
  return null;
}

export type SocialDraftLlmOutput = {
  classification: "reply" | "escalate" | "skip";
  reason: string;
  confidence: number;
  draft: string;
  language: string;
};

export type SocialPostDraftLlmOutput = {
  caption: string;
  language: string;
  notes: string;
};

export function parseSocialPostDraftOutput(
  raw: string,
): SocialPostDraftLlmOutput | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<SocialPostDraftLlmOutput>;
    const caption = String(obj.caption ?? "").trim();
    if (!caption) return null;
    return {
      caption,
      language: String(obj.language ?? "en").trim() || "en",
      notes: String(obj.notes ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function parseSocialDraftOutput(raw: string): SocialDraftLlmOutput | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<SocialDraftLlmOutput>;
    const classification = obj.classification;
    if (classification !== "reply" && classification !== "escalate" && classification !== "skip") {
      return null;
    }
    const draft = classification === "reply" ? String(obj.draft ?? "").trim() : "";
    if (classification === "reply" && !draft) return null;
    return {
      classification,
      reason: String(obj.reason ?? ""),
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
      draft,
      language: String(obj.language ?? "en"),
    };
  } catch {
    return null;
  }
}
