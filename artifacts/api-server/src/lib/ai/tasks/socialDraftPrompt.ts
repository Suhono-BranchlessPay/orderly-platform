import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedPrompt: string | null = null;

function loadPromptFile(): string {
  if (cachedPrompt) return cachedPrompt;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "config/prompts/PROMPT_Social_Inbox_Draft.txt"),
    path.resolve(process.cwd(), "dist/config/prompts/PROMPT_Social_Inbox_Draft.txt"),
    path.resolve(here, "../../../config/prompts/PROMPT_Social_Inbox_Draft.txt"),
    path.resolve(process.cwd(), "artifacts/api-server/config/prompts/PROMPT_Social_Inbox_Draft.txt"),
    path.resolve(process.cwd(), "docs/prompts/PROMPT_Social_Inbox_Draft.txt"),
  ];
  for (const p of candidates) {
    try {
      cachedPrompt = readFileSync(p, "utf8");
      return cachedPrompt;
    } catch {
      /* next */
    }
  }
  // Compact fallback if file missing in deploy bundle.
  cachedPrompt = `You draft social replies for a restaurant. A human always reviews.
Return ONLY JSON: {"classification":"reply"|"escalate"|"skip","reason":"","confidence":0.0,"draft":"","language":"en"}
SKIP peer-to-peer plans (e.g. "Joni Haryono lets try tomorrow"). Never invent facts. Escalate allergy/health.`;
  return cachedPrompt;
}

export type SocialDraftContext = {
  restaurantName: string;
  cuisineType: string;
  city: string;
  state: string;
  address: string;
  hours: string;
  menuItemNames: string;
  orderUrl: string;
  brandVoiceNotes: string;
  platform: string;
  messageType: string;
  authorFirstName: string;
  authorDisplayName: string;
  messageText: string;
  engagementMode: string;
  tenantLanguages: string;
  /** Google reviews only — 1..5, or null. Triggers BAGIAN F handling. */
  starRating?: number | null;
};

export function buildSocialDraftMessages(ctx: SocialDraftContext): { system: string; user: string } {
  const system = loadPromptFile();
  const isGoogleReview =
    ctx.messageType === "review" || ctx.platform.toLowerCase().includes("google");
  const lines = [
    "Fill the context and classify+draft for this message.",
    "",
    `Restaurant: ${ctx.restaurantName}`,
    `Cuisine: ${ctx.cuisineType}`,
    `City/State: ${ctx.city}, ${ctx.state}`,
    `Address: ${ctx.address}`,
    `Hours: ${ctx.hours}`,
    `Menu: ${ctx.menuItemNames}`,
    `Order link: ${ctx.orderUrl}`,
    `engagement_mode: ${ctx.engagementMode}`,
    `tenant_languages: ${ctx.tenantLanguages}`,
    `brand_voice_notes: ${ctx.brandVoiceNotes}`,
    "",
    `Platform: ${ctx.platform}`,
    `Type: ${ctx.messageType}`,
    `Author first name: ${ctx.authorFirstName}`,
    `Author display name: ${ctx.authorDisplayName}`,
  ];
  if (isGoogleReview) {
    lines.push(
      `Star rating: ${ctx.starRating ?? "unknown"}`,
      "This is a GOOGLE REVIEW — apply BAGIAN F: positive (4-5\u2605) reply warmly and a bit more polite; negative (1-3\u2605) ESCALATE (do not draft a public reply).",
    );
  }
  lines.push(
    `Message text: "${ctx.messageText}"`,
    "",
    "Return ONLY the JSON object from BAGIAN C.",
  );

  return { system, user: lines.join("\n") };
}

/** Compact JSON user payload for the local adapter. */
export function buildLocalSocialUserPayload(input: {
  messageText: string;
  authorName: string | null;
  tenantName: string;
  heuristicClassification: string;
  brandVoice: string;
}): string {
  return JSON.stringify({
    message_text: input.messageText,
    author_name: input.authorName,
    tenant_name: input.tenantName,
    heuristic_classification: input.heuristicClassification,
    brand_voice: input.brandVoice,
  });
}
