#!/usr/bin/env node
/**
 * Staging peak simulation — N virtual outlets hitting menu/config/health
 * concurrently. Does NOT charge Square. Point at a staging host only.
 *
 * Usage:
 *   STAGING_BASE=https://staging.example.com \
 *   OUTLETS=27 CONCURRENCY=54 DURATION_S=60 \
 *   node scripts/loadtest-peak-sim.mjs
 *
 * Optional HOSTS_JSON='["kirinhibachiexpress.com","samurairesto.com",...]'
 * to rotate Host headers (multi-tenant on one IP).
 */
const BASE = (process.env.STAGING_BASE || "").replace(/\/$/, "");
const OUTLETS = Math.max(1, Number(process.env.OUTLETS || 27));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || OUTLETS * 2));
const DURATION_S = Math.max(5, Number(process.env.DURATION_S || 60));
const PATHS = (process.env.PATHS || "/api/healthz,/api/config/checkout,/api/menu/items")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let hosts = [];
try {
  if (process.env.HOSTS_JSON) hosts = JSON.parse(process.env.HOSTS_JSON);
} catch {
  hosts = [];
}

if (!BASE) {
  console.error("Set STAGING_BASE to a staging URL (never production money path).");
  process.exit(1);
}
if (/samurairesto\.com|kirinhibachiexpress\.com|orderlyfoods\.com/i.test(BASE) && !process.env.ALLOW_PROD_LOADTEST) {
  console.error("Refusing known production hosts without ALLOW_PROD_LOADTEST=1");
  process.exit(1);
}

const stats = { ok: 0, fail: 0, latencies: [] };

async function oneHit(i) {
  const path = PATHS[i % PATHS.length];
  const host = hosts.length ? hosts[i % hosts.length] : null;
  const t0 = Date.now();
  try {
    const headers = { Accept: "application/json" };
    if (host) headers.Host = host;
    const r = await fetch(`${BASE}${path}`, { headers });
    const ms = Date.now() - t0;
    stats.latencies.push(ms);
    if (r.ok) stats.ok += 1;
    else stats.fail += 1;
  } catch {
    stats.fail += 1;
    stats.latencies.push(Date.now() - t0);
  }
}

async function worker(id, stopAt) {
  let i = id;
  while (Date.now() < stopAt) {
    await oneHit(i);
    i += CONCURRENCY;
  }
}

const stopAt = Date.now() + DURATION_S * 1000;
console.log(
  JSON.stringify({
    base: BASE,
    outlets: OUTLETS,
    concurrency: CONCURRENCY,
    duration_s: DURATION_S,
    paths: PATHS,
    hosts: hosts.length || "none",
  }),
);

await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, id) => worker(id, stopAt)),
);

stats.latencies.sort((a, b) => a - b);
const p = (q) =>
  stats.latencies.length
    ? stats.latencies[Math.min(stats.latencies.length - 1, Math.floor(q * (stats.latencies.length - 1)))]
    : 0;

console.log(
  JSON.stringify(
    {
      ok: stats.ok,
      fail: stats.fail,
      total: stats.ok + stats.fail,
      p50_ms: p(0.5),
      p95_ms: p(0.95),
      p99_ms: p(0.99),
      note: `${OUTLETS}-outlet peak sketch — expand with cart/checkout dry-runs on staging only`,
    },
    null,
    2,
  ),
);
