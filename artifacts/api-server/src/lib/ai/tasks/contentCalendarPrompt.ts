import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedPrompt: string | null = null;

function loadPromptFile(): string {
  if (cachedPrompt) return cachedPrompt;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "config/prompts/PROMPT_Content_Calendar.txt"),
    path.resolve(process.cwd(), "dist/config/prompts/PROMPT_Content_Calendar.txt"),
    path.resolve(here, "../../../config/prompts/PROMPT_Content_Calendar.txt"),
    path.resolve(
      process.cwd(),
      "artifacts/api-server/config/prompts/PROMPT_Content_Calendar.txt",
    ),
  ];
  for (const p of candidates) {
    try {
      cachedPrompt = readFileSync(p, "utf8");
      return cachedPrompt;
    } catch {
      /* next */
    }
  }
  cachedPrompt = `You write a monthly restaurant content calendar from REAL sales/inbox data only.
Return ONLY JSON: {"posts":[{"date":"YYYY-MM-DD","suggested_time":"HH:MM","pillar":"...","target_item_id":null,"target_item_name":"...","hook":"...","caption":"...","hashtags":[],"cta_type":"order_online","platform":"facebook","photo_needed":false}]}
No invented claims, prices, or health claims.`;
  return cachedPrompt;
}

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function j(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "[]";
  }
}

export function buildContentCalendarMessages(
  input: Record<string, unknown>,
): { system: string; user: string } {
  const system = fill(loadPromptFile(), {
    tenant_name: String(input.tenant_name ?? "Restaurant"),
    cuisine: String(input.cuisine ?? "restaurant"),
    city: String(input.city ?? ""),
    state: String(input.state ?? ""),
    tenant_tone: String(input.tenant_tone ?? "warm, local, concrete"),
    tenant_language: String(input.tenant_language ?? "en"),
    month: String(input.month ?? ""),
    n_posts: String(input.n_posts ?? 14),
    pillar_mix: j(input.pillar_mix),
    top_items_with_qty_and_sales: j(input.top_items_with_qty_and_sales),
    underperforming_items: j(input.underperforming_items),
    peak_hours: j(input.peak_hours),
    praise_themes: j(input.praise_themes),
    menu_requests: j(input.menu_requests),
    faq_from_inbox: j(input.faq_from_inbox),
    past_content_performance: j(input.past_content_performance),
    items_with_photos: j(input.items_with_photos),
    unavailable_items: j(input.unavailable_items),
    local_events: j(input.local_events),
    verified_quotes: j(input.verified_quotes),
    suggested_dates: j(input.suggested_dates),
    suggested_pillars: j(input.suggested_pillars),
    suggested_time: String(input.suggested_time ?? "16:30"),
  });

  return {
    system,
    user: [
      `Generate the JSON calendar for ${String(input.month)} now.`,
      `Target about ${String(input.n_posts)} posts.`,
      "Return JSON only.",
    ].join("\n"),
  };
}
