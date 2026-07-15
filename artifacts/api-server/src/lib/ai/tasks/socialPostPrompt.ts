import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedPrompt: string | null = null;

function loadPromptFile(): string {
  if (cachedPrompt) return cachedPrompt;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "config/prompts/PROMPT_Social_Post_Draft.txt"),
    path.resolve(process.cwd(), "dist/config/prompts/PROMPT_Social_Post_Draft.txt"),
    path.resolve(here, "../../../config/prompts/PROMPT_Social_Post_Draft.txt"),
    path.resolve(process.cwd(), "artifacts/api-server/config/prompts/PROMPT_Social_Post_Draft.txt"),
    path.resolve(process.cwd(), "docs/prompts/PROMPT_Social_Post_Draft.txt"),
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
  cachedPrompt = `You write ONE ready-to-post, warm, local social caption for a restaurant.
Talk to neighbors in the town — not a nationwide audience. Soft-sell, human, not a template.
Use ONLY the facts given. Never invent ingredients, health/diet claims, awards, or discounts.
Always include the order link EXACTLY as given (with its ?src= and item=). 1-3 emojis max.
Return ONLY JSON: {"caption":"<caption incl. link + 2-4 hashtags>","language":"en","notes":""}`;
  return cachedPrompt;
}

export type SocialPostDraftContext = {
  restaurantName: string;
  cuisineType: string;
  city: string;
  state: string;
  nearbyTowns: string;
  hours: string;
  itemName: string;
  itemDescription: string;
  price: string;
  orderUrl: string;
  brandVoiceNotes: string;
  angle: string;
  language: string;
};

export function buildSocialPostMessages(ctx: SocialPostDraftContext): {
  system: string;
  user: string;
} {
  const system = loadPromptFile();
  const user = [
    "Write ONE ready-to-post caption for this item, following the rules exactly.",
    "",
    `Restaurant: ${ctx.restaurantName}`,
    `Cuisine: ${ctx.cuisineType}`,
    `City/State: ${ctx.city}, ${ctx.state}`,
    `Nearby towns: ${ctx.nearbyTowns}`,
    `Hours today: ${ctx.hours}`,
    `Item name: ${ctx.itemName}`,
    `Item contents/description: ${ctx.itemDescription}`,
    `Price: ${ctx.price}`,
    `Order link (use EXACTLY): ${ctx.orderUrl}`,
    `Brand voice notes: ${ctx.brandVoiceNotes}`,
    `Angle hint: ${ctx.angle}`,
    `Language: ${ctx.language}`,
    "",
    "Return ONLY the JSON object: {\"caption\":\"...\",\"language\":\"...\",\"notes\":\"...\"}",
  ].join("\n");

  return { system, user };
}
