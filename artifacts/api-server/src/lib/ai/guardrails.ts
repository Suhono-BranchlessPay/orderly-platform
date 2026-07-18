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
  /** Finer intent for inbox + daily report (optional; heuristic fallback if absent). */
  label?:
    | "praise"
    | "question"
    | "complaint"
    | "allergy_health"
    | "spam"
    | "menu_suggestion"
    | "ordering_interest"
    | "off_topic"
    | "other";
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

export type DailyReportLlmOutput = {
  greeting: string;
  narrative: string;
  attention: string;
  ideaForToday: string;
  insights: string[];
};

export function parseDailyReportOutput(raw: string): DailyReportLlmOutput | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const narrative = String(obj.narrative ?? "").trim();
    if (!narrative) return null;
    const insightsRaw = Array.isArray(obj.insights) ? obj.insights : [];
    return {
      greeting: String(obj.greeting ?? "").trim(),
      narrative,
      attention: String(obj.attention ?? "").trim(),
      ideaForToday: String(obj.idea_for_today ?? obj.ideaForToday ?? "").trim(),
      insights: insightsRaw
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .slice(0, 3),
    };
  } catch {
    return null;
  }
}

export type ContentCalendarLlmPost = {
  date: string;
  suggested_time: string;
  pillar: string;
  target_item_id: string | null;
  target_item_name: string | null;
  hook: string;
  caption: string;
  hashtags: string[];
  cta_type: string;
  platform?: string;
  photo_needed?: boolean;
};

export type ContentCalendarLlmOutput = {
  posts: ContentCalendarLlmPost[];
};

const CONTENT_BANNED_RE =
  /\b(best|#1|number\s*one|top[\s-]?rated|award[\s-]?winning|healthiest|gluten[\s-]?free|allergen[\s-]?free)\b/i;

export function parseContentCalendarOutput(
  raw: string,
): ContentCalendarLlmOutput | null {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) {
      // also accept bare array
      const a0 = raw.indexOf("[");
      const a1 = raw.lastIndexOf("]");
      if (a0 >= 0 && a1 > a0) {
        const arr = JSON.parse(raw.slice(a0, a1 + 1)) as unknown[];
        return { posts: normalizeCalendarPosts(arr) };
      }
      return null;
    }
    const obj = JSON.parse(raw.slice(start, end + 1)) as {
      posts?: unknown[];
    };
    const posts = normalizeCalendarPosts(
      Array.isArray(obj.posts) ? obj.posts : [],
    );
    if (!posts.length) return null;
    return { posts };
  } catch {
    return null;
  }
}

function normalizeCalendarPosts(arr: unknown[]): ContentCalendarLlmPost[] {
  const out: ContentCalendarLlmPost[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const hook = String(p.hook ?? "").trim();
    const caption = String(p.caption ?? "").trim();
    if (!hook || !caption) continue;
    if (CONTENT_BANNED_RE.test(hook) || CONTENT_BANNED_RE.test(caption)) {
      continue; // drop inventing posts — generator will fill gaps
    }
    const words = hook.split(/\s+/).filter(Boolean);
    out.push({
      date: String(p.date ?? "").slice(0, 10),
      suggested_time: String(p.suggested_time ?? p.suggestedTime ?? "").slice(
        0,
        8,
      ),
      pillar: String(p.pillar ?? "hero_product"),
      target_item_id: p.target_item_id
        ? String(p.target_item_id)
        : p.targetItemId
          ? String(p.targetItemId)
          : null,
      target_item_name: p.target_item_name
        ? String(p.target_item_name)
        : p.targetItemName
          ? String(p.targetItemName)
          : null,
      hook: words.slice(0, 8).join(" "),
      caption,
      hashtags: Array.isArray(p.hashtags)
        ? p.hashtags.map((h) => String(h)).slice(0, 10)
        : [],
      cta_type: String(p.cta_type ?? p.ctaType ?? "order_online"),
      platform: String(p.platform ?? "facebook"),
      photo_needed: Boolean(p.photo_needed ?? p.photoNeeded),
    });
  }
  return out;
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
    const labelRaw = String(obj.label ?? "").trim().toLowerCase();
    const labelOk = [
      "praise",
      "question",
      "complaint",
      "allergy_health",
      "spam",
      "menu_suggestion",
      "ordering_interest",
      "off_topic",
      "other",
    ] as const;
    const label = (labelOk as readonly string[]).includes(labelRaw)
      ? (labelRaw as SocialDraftLlmOutput["label"])
      : undefined;
    return {
      classification,
      label,
      reason: String(obj.reason ?? ""),
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
      draft,
      language: String(obj.language ?? "en"),
    };
  } catch {
    return null;
  }
}
