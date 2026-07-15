/**
 * Golden / unit checks for AI Router (filter → score).
 * Run: node --experimental-strip-types ./scripts/verify-ai-router.mjs
 * or:  pnpm exec tsx ./scripts/verify-ai-router.ts  (if using .ts twin)
 *
 * This file mirrors imports via dynamic import after building a tiny bundle.
 */
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(root, "src/lib/ai/router/index.ts");
const outDir = mkdtempSync(path.join(tmpdir(), "ai-router-"));
const outfile = path.join(outDir, "router.mjs");

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  packages: "external",
  logLevel: "silent",
});

const {
  route,
  resetRouterCaches,
  filterCapableModels,
  loadProviderRegistry,
  healthWithOverrides,
} = await import(pathToFileURL(outfile).href);

resetRouterCaches();

const healthyAll = healthWithOverrides({
  local: { status: "healthy", p95LatencyMs: 10, errorRate: 0 },
  openai: { status: "healthy", p95LatencyMs: 200, errorRate: 0 },
  anthropic: { status: "healthy", p95LatencyMs: 400, errorRate: 0 },
  gemini: { status: "healthy", p95LatencyMs: 150, errorRate: 0 },
});

function baseCtx(over = {}) {
  return {
    tenantId: "t1",
    tenantPlan: "standard",
    budgetRemainingUsd: 100,
    slaTier: "standard",
    providerHealth: healthyAll,
    ...over,
  };
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

// 1) Filter: image → vision only
{
  const models = loadProviderRegistry();
  const profile = {
    task: "menu_from_photo",
    estimatedInputTokens: 1200,
    maxOutputTokens: 500,
    hasImage: true,
    needsOcr: false,
    needsEmbedding: false,
    language: "en",
    realtime: false,
  };
  const { capable } = filterCapableModels(models, profile, baseCtx());
  assert(
    capable.every((m) => m.capabilities.includes("vision")),
    "image filter → only vision models",
  );
  assert(capable.length > 0, "image filter → at least one vision model");
}

// 2) Filter: provider down
{
  const models = loadProviderRegistry();
  const profile = {
    task: "social_draft",
    estimatedInputTokens: 300,
    maxOutputTokens: 300,
    hasImage: false,
    needsOcr: false,
    needsEmbedding: false,
    language: "en",
    realtime: true,
  };
  const ctx = baseCtx({
    providerHealth: healthWithOverrides({
      openai: { status: "down", p95LatencyMs: 0, errorRate: 1 },
      anthropic: { status: "down", p95LatencyMs: 0, errorRate: 1 },
      gemini: { status: "down", p95LatencyMs: 0, errorRate: 1 },
      local: { status: "healthy", p95LatencyMs: 5, errorRate: 0 },
    }),
  });
  const { capable } = filterCapableModels(models, profile, ctx);
  assert(
    capable.every((m) => m.provider === "local"),
    "down providers filtered → only local",
  );
}

// 3) Score: free plan prefers cheap
{
  const profile = {
    task: "classify",
    estimatedInputTokens: 100,
    maxOutputTokens: 50,
    hasImage: false,
    needsOcr: false,
    needsEmbedding: false,
    language: "en",
    realtime: true,
  };
  const free = route(profile, baseCtx({ tenantPlan: "free" }));
  const premium = route(profile, baseCtx({ tenantPlan: "premium" }));
  assert(free.ok && premium.ok, "classify routes ok for free+premium");
  assert(free.primary, "free has primary");
  // free should not pick expensive sonnet over local/mini when classify
  assert(
    free.primary.provider !== "anthropic" || free.primary.model !== "claude-sonnet",
    "free classify avoids expensive primary when cheaper exists",
  );
  assert(
    premium.primary.quality_rank >= free.primary.quality_rank ||
      premium.primary.provider === "anthropic" ||
      premium.primary.provider === "openai",
    "premium classify leans quality (or equal)",
  );
}

// 4) NO_CANDIDATE: vision needed + all vision down
{
  const profile = {
    task: "menu_from_photo",
    estimatedInputTokens: 2000,
    maxOutputTokens: 500,
    hasImage: true,
    needsOcr: true,
    needsEmbedding: false,
    language: "en",
    realtime: false,
  };
  const ctx = baseCtx({
    providerHealth: healthWithOverrides({
      local: { status: "healthy", p95LatencyMs: 5, errorRate: 0 },
      openai: { status: "down", p95LatencyMs: 0, errorRate: 1 },
      anthropic: { status: "down", p95LatencyMs: 0, errorRate: 1 },
      gemini: { status: "down", p95LatencyMs: 0, errorRate: 1 },
    }),
  });
  const d = route(profile, ctx);
  assert(!d.ok && d.error === "NO_CANDIDATE", "NO_CANDIDATE when vision providers down");
  assert(typeof d.reason === "string" && d.reason.includes("NO_CANDIDATE"), "reason explains NO_CANDIDATE");
}

// 5) Determinism
{
  const profile = {
    task: "social_draft",
    estimatedInputTokens: 300,
    maxOutputTokens: 300,
    hasImage: false,
    needsOcr: false,
    needsEmbedding: false,
    language: "en",
    realtime: true,
  };
  const ctx = baseCtx({ tenantPlan: "standard" });
  const a = route(profile, ctx);
  const b = route(profile, ctx);
  assert(
    a.primary?.provider === b.primary?.provider && a.primary?.model === b.primary?.model,
    "same profile+context → same decision",
  );
  assert(Boolean(a.reason), "decision has reason");
}

// 6) OCR filter
{
  const models = loadProviderRegistry();
  const profile = {
    task: "menu_from_photo",
    estimatedInputTokens: 1500,
    maxOutputTokens: 500,
    hasImage: true,
    needsOcr: true,
    needsEmbedding: false,
    language: "en",
    realtime: false,
  };
  const { capable } = filterCapableModels(models, profile, baseCtx());
  assert(
    capable.every((m) => m.capabilities.includes("ocr") && m.capabilities.includes("vision")),
    "ocr+image → only ocr+vision",
  );
}

rmSync(outDir, { recursive: true, force: true });

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAI Router verify: all passed");
