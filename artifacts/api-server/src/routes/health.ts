/**
 * Operational health endpoints (unauthenticated, host-agnostic).
 *
 *   GET /healthz  — liveness. 200 as long as the process is up. No DB. Cheap;
 *                   safe for a load balancer / uptime monitor to hit often.
 *   GET /readyz   — readiness. 200 only if Postgres answers a trivial query
 *                   within a timeout; 503 otherwise. Also reports pg Pool
 *                   saturation (total/idle/waiting) — watch these under load.
 *
 * These MUST be registered before the tenant middleware and the SPA catch-all
 * so probes never get a tenant-resolved 404 or an HTML page.
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export type ReadinessResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Pure readiness check: runs `ping` under a timeout and reports latency.
 * Injecting `ping` keeps this deterministically unit-testable (no real DB).
 */
export async function checkReadiness(
  ping: () => Promise<unknown>,
  timeoutMs = 2000,
): Promise<ReadinessResult> {
  const start = Date.now();
  try {
    await withTimeout(Promise.resolve(ping()), timeoutMs);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const router = Router();

router.get("/healthz", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    status: "ok",
    uptime_s: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.GIT_SHA || process.env.npm_package_version || null,
  });
});

router.get("/readyz", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const db = await checkReadiness(() => pool.query("SELECT 1"));
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? "ready" : "unavailable",
    db: {
      ok: db.ok,
      latency_ms: db.latencyMs,
      ...(db.error ? { error: db.error } : {}),
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
