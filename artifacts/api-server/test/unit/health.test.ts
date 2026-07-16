/**
 * Health probes. Liveness must never touch the DB; readiness logic must report
 * failure/timeout instead of hanging (so a stuck DB fails the probe fast rather
 * than wedging the load balancer).
 */
import express from "express";
import request from "supertest";
import healthRouter, { checkReadiness } from "../../src/routes/health";

describe("health: checkReadiness", () => {
  it("is ok when the ping resolves", async () => {
    const r = await checkReadiness(() => Promise.resolve(1));
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.error).toBeUndefined();
  });

  it("is not ok when the ping rejects (surfaces the error)", async () => {
    const r = await checkReadiness(() => Promise.reject(new Error("boom")));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("boom");
  });

  it("times out a hung ping instead of hanging", async () => {
    const r = await checkReadiness(() => new Promise(() => {}), 50);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timeout/);
  });
});

describe("health: GET /healthz (liveness)", () => {
  const app = express();
  app.use(healthRouter);

  it("returns 200 without touching the DB", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime_s).toBe("number");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
