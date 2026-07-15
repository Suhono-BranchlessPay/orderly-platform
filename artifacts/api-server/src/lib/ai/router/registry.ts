import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AiProviderName, AiTask } from "../types";
import type { ModelCapability, ModelStrength, RegisteredModel, RouterWeights } from "./types";

type ProvidersFile = {
  providers: Record<
    string,
    {
      models: Record<
        string,
        {
          capabilities: ModelCapability[];
          context_limit: number;
          strengths: ModelStrength[];
          cost_per_1k: { input: number; output: number };
          languages_strong?: string[];
          quality_rank?: number;
          speed_rank?: number;
        }
      >;
    }
  >;
  task_strength: Partial<Record<AiTask, ModelStrength>>;
};

let modelsCache: RegisteredModel[] | null = null;
let taskStrengthCache: Partial<Record<AiTask, ModelStrength>> | null = null;
let weightsCache: RouterWeights | null = null;

function resolveConfigPaths(filename: string): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(process.cwd(), "config", filename),
    path.resolve(process.cwd(), "dist/config", filename),
    path.resolve(here, "../../../../config", filename),
    path.resolve(process.cwd(), "artifacts/api-server/config", filename),
  ];
}

function readJsonFile<T>(filename: string, fallback: T): T {
  for (const p of resolveConfigPaths(filename)) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as T;
    } catch {
      /* next */
    }
  }
  return fallback;
}

const DEFAULT_WEIGHTS: RouterWeights = {
  quality: 10,
  language: 4,
  cost_lo: 6,
  cost_hi: 14,
  quality_bonus: 8,
  cost_bonus: 10,
  latency: 6,
  degraded_penalty: 12,
  budget_pressure_usd: 5,
  task_defaults: {
    social_draft: { max_output_tokens: 300, realtime: true },
    classify: { max_output_tokens: 50, realtime: true },
    menu_from_photo: { max_output_tokens: 2000, realtime: false, needs_ocr: true },
  },
};

export function loadProviderRegistry(): RegisteredModel[] {
  if (modelsCache) return modelsCache;
  const file = readJsonFile<ProvidersFile>("ai-providers.json", {
    providers: {
      local: {
        models: {
          "rules-v1": {
            capabilities: ["chat"],
            context_limit: 32000,
            strengths: ["classification", "cheap", "safety"],
            cost_per_1k: { input: 0, output: 0 },
            languages_strong: ["en"],
            quality_rank: 0.4,
            speed_rank: 1,
          },
        },
      },
    },
    task_strength: {
      social_draft: "writing",
      social_post_draft: "writing",
      classify: "classification",
    },
  });

  const models: RegisteredModel[] = [];
  for (const [provider, def] of Object.entries(file.providers)) {
    for (const [model, meta] of Object.entries(def.models)) {
      models.push({
        provider: provider as AiProviderName,
        model,
        capabilities: meta.capabilities,
        context_limit: meta.context_limit,
        strengths: meta.strengths,
        cost_per_1k: meta.cost_per_1k,
        languages_strong: meta.languages_strong ?? ["en"],
        quality_rank: meta.quality_rank ?? 0.5,
        speed_rank: meta.speed_rank ?? 0.5,
      });
    }
  }
  modelsCache = models;
  taskStrengthCache = file.task_strength ?? {};
  return models;
}

export function taskStrength(task: AiTask): ModelStrength {
  if (!taskStrengthCache) loadProviderRegistry();
  return taskStrengthCache?.[task] ?? "cheap";
}

export function loadRouterWeights(): RouterWeights {
  if (weightsCache) return weightsCache;
  weightsCache = readJsonFile("ai-router-weights.json", DEFAULT_WEIGHTS);
  return weightsCache;
}

export function resetRouterCaches(): void {
  modelsCache = null;
  taskStrengthCache = null;
  weightsCache = null;
}

export function modelKey(m: RegisteredModel): string {
  return `${m.provider}/${m.model}`;
}
