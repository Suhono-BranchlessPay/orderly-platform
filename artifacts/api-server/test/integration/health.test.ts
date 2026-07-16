/**
 * Readiness against a real Postgres. Runs only when TEST_DATABASE_URL is set
 * (see test/setup.ts); skipped for the no-DB unit run.
 */
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import healthRouter from "../../src/routes/health";

const RUN_DB = Boolean(process.env.TEST_DATABASE_URL);
const d = RUN_DB ? describe : describe.skip;

d("health readiness (real DB)", () => {
  const app = express();
  app.use(healthRouter);

  afterAll(async () => {
    await pool.end();
  });

  it("GET /readyz returns 200 when Postgres is reachable", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.db.ok).toBe(true);
    expect(res.body.db.pool).toHaveProperty("total");
    expect(res.body.db.pool).toHaveProperty("idle");
    expect(res.body.db.pool).toHaveProperty("waiting");
  });
});
