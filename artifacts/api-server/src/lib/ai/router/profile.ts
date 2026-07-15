import type { AiRunOpts, AiTask } from "../types";
import { loadRouterWeights } from "./registry";
import type { RequestProfile } from "./types";

/** Rough token estimate: ~4 chars/token for Latin text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function detectLanguage(text: string): string {
  const t = text.trim();
  if (!t) return "en";
  if (/[áéíóúñ¿¡]/i.test(t) || /\b(el|la|los|las|gracias|hola)\b/i.test(t)) return "es";
  if (/\b(yang|dan|untuk|terima kasih|halo|makan)\b/i.test(t)) return "id";
  return "en";
}

export function buildRequestProfile(
  task: AiTask,
  input: unknown,
  opts?: AiRunOpts & { language?: string },
): RequestProfile {
  const weights = loadRouterWeights();
  const defaults = weights.task_defaults?.[task] ?? {};

  const textParts: string[] = [];
  let hasImage = false;
  let needsOcr = Boolean(defaults.needs_ocr);
  let needsEmbedding = Boolean(defaults.needs_embedding);
  let explicitLang: string | undefined;

  if (typeof input === "string") {
    textParts.push(input);
  } else if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["text", "body", "message", "message_text", "prompt", "content", "caption"]) {
      if (typeof obj[key] === "string") textParts.push(obj[key] as string);
    }
    if (typeof obj.language === "string" && obj.language.trim()) {
      explicitLang = obj.language.trim();
    }
    hasImage = Boolean(
      obj.hasImage ||
        obj.image ||
        obj.imageUrl ||
        obj.imageBase64 ||
        obj.photo ||
        (Array.isArray(obj.images) && obj.images.length > 0),
    );
    if (obj.needsOcr === true) needsOcr = true;
    if (obj.needsEmbedding === true) needsEmbedding = true;
    if (task === "menu_from_photo") {
      hasImage = true;
      needsOcr = true;
    }
    if (task === "embedding") {
      needsEmbedding = true;
    }
  }

  const joined = textParts.join("\n");
  const language = (
    opts?.language ||
    explicitLang ||
    detectLanguage(joined)
  )
    .toLowerCase()
    .slice(0, 8);

  const estimatedInputTokens =
    opts?.estimatedInputTokens ?? estimateTokens(joined) + (hasImage ? 1000 : 0);

  return {
    task,
    estimatedInputTokens,
    maxOutputTokens: opts?.maxTokens ?? defaults.max_output_tokens ?? 500,
    hasImage,
    needsOcr,
    needsEmbedding,
    language,
    realtime: opts?.realtime ?? defaults.realtime ?? true,
  };
}
