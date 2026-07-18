import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedPrompt: string | null = null;

function loadPromptFile(): string {
  if (cachedPrompt) return cachedPrompt;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "config/prompts/PROMPT_Daily_Report.txt"),
    path.resolve(process.cwd(), "dist/config/prompts/PROMPT_Daily_Report.txt"),
    path.resolve(here, "../../../config/prompts/PROMPT_Daily_Report.txt"),
    path.resolve(
      process.cwd(),
      "artifacts/api-server/config/prompts/PROMPT_Daily_Report.txt",
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
  cachedPrompt = `You write a warm, short morning restaurant report from FACTS only.
Never invent metrics or forecasts. Square = all-channel totals; Orderly channels = subset.
Return ONLY JSON: {"greeting":"...","narrative":"...","attention":"","idea_for_today":"...","insights":[]}`;
  return cachedPrompt;
}

export function buildDailyReportMessages(facts: Record<string, unknown>): {
  system: string;
  user: string;
} {
  const system = loadPromptFile();
  const user = [
    "Write today's owner report from these FACTS only.",
    "",
    JSON.stringify(facts, null, 2),
    "",
    'Return ONLY JSON: {"greeting":"...","narrative":"...","attention":"","idea_for_today":"...","insights":[]}',
  ].join("\n");
  return { system, user };
}
