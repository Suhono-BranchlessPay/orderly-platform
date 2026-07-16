# Load / stress testing

Capacity checks ahead of scaling (Aug/Sep). Two harnesses:

- **`run.mjs`** — zero-dependency Node runner (works everywhere, no install).
- **`k6-read-endpoints.js`** — standard [k6](https://k6.io) script (ramping VUs, thresholds) for richer scenarios once k6 is installed.

## ⚠️ Safety rules

- **DEV/LOCAL only.** Never against production.
- **Read-only endpoints only.** NEVER load-test `POST /api/orders` — it triggers a **real Square charge + BranchlessPay anchor**. Same for refund/webhook endpoints.
- Safe targets: `/api/healthz` (no DB), `/api/readyz` (DB ping, isolated pool), `/api/menu/items?tenant=<slug>` (public tenant-scoped read).

## 1. Start a local server against the sandbox DB

```bash
# from artifacts/api-server
node build.mjs   # build dist (esbuild)
PORT=4010 \
DATABASE_URL="postgres://openpg:openpgpwd@127.0.0.1:5432/orderly_sandbox" \
NODE_ENV=production LOG_LEVEL=warn \
node dist/index.mjs
```

## 2a. Run the zero-dep harness

```bash
# liveness (pure app throughput, no DB)
node scripts/loadtest/run.mjs --url http://127.0.0.1:4010/api/healthz --duration 20 --concurrency 50 --label healthz

# DB-backed public read (exercises the main pg pool)
node scripts/loadtest/run.mjs --url "http://127.0.0.1:4010/api/menu/items?tenant=samurai" --duration 20 --concurrency 50 --label menu
```

Reports throughput (req/s), latency p50/p90/p95/p99/max, errors, and status distribution.

## 2b. Or run k6

```bash
BASE_URL=http://127.0.0.1:4010 TENANT=samurai k6 run scripts/loadtest/k6-read-endpoints.js
```

## Baseline (15 Jul 2026, local dev box + local Postgres)

Client (`run.mjs`) ran on the same machine as the server, so these are
conservative; dedicated hardware will do better. Server: `NODE_ENV=production`,
`LOG_LEVEL=warn`, default pg Pool `max=10`.

| Endpoint | Concurrency | Throughput | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|---|
| `/api/healthz` (no DB) | 50 | ~1,200 req/s | 34ms | 78ms | 109ms | 0 |
| `/api/menu/items` (DB) | 50 | ~820 req/s | 54ms | 102ms | 143ms | 0 |
| `/api/menu/items` (DB) | 200 | ~726 req/s | 239ms | 430ms | 547ms | 0 |

**Findings**
- The DB read plateaus near ~800 req/s; past ~50 concurrent, extra load only
  raises latency (requests **queue**, they don't fail) — the ceiling is pg Pool
  `max=10` × per-query time. At 200 concurrency `/api/readyz` reported the app
  pool pegged at `total=10, idle=0, waiting≈185`.
- `/api/readyz` stayed **200 at 1–95ms even while ~185 queries were queued** on
  the app pool — the isolated health pool keeps liveness/readiness honest during
  DB pressure (this is why the probe uses its own `max:1` pool).
- **Before scaling outlets:** raise pg Pool `max` (now tunable via `PG_POOL_MAX`,
  default 10) and load-test again **in a production-like environment**; once
  Postgres itself is the limit, add pgbouncer / a read replica.

## Pool-size experiment (PG_POOL_MAX) — inconclusive on a single box

The app pool `max` is now env-tunable: set `PG_POOL_MAX` (default 10, so no
behavior change unless set). We A/B'd 10/30/50 at 200 concurrency on the DB read:

| PG_POOL_MAX | Throughput | p95 | p99 | Errors |
|---|---|---|---|---|
| 10 (run A) | ~726 req/s | 430ms | 547ms | 0 |
| 10 (run B, control) | ~430 req/s | 599ms | 813ms | 0 |
| 30 | ~372 req/s | 834ms | 1505ms | 0 |
| 50 | ~425 req/s | 646ms | 1878ms | 0 |

**Conclusion: do not size the pool from these numbers.** The two `PG_POOL_MAX=10`
runs differ more (726 vs 430) than 10-vs-30-vs-50 do — because Postgres, the app,
and the load client all share one laptop's CPU, so extra pool concurrency just
adds contention and results are dominated by run-to-run noise. Correct method:
run this on **separate hosts** (isolated Postgres, app, and load-gen), then raise
`PG_POOL_MAX` until Postgres CPU/`max_connections` is the ceiling. Encouraging
sign: **0 errors at every setting** — under overload the app queues, it doesn't fail.

> ⚠️ **Decision (16 Jul 2026): do NOT repeat the single-box experiment.** The
> laptop rig is noise-dominated and cannot size the pool — re-running it wastes
> time and produces misleading numbers. The `PG_POOL_MAX` knob is merged with a
> safe default (10, unchanged behavior). **Real sizing is deferred until a
> separate staging host exists** (isolated Postgres/app/load-gen) and must be
> done before the Aug/Sep scale-up. When staging is ready: run this harness from
> a 3rd host, watch `/api/readyz` pool `waiting`, and raise `PG_POOL_MAX` until
> Postgres CPU / `max_connections` is the bottleneck (then consider pgbouncer /
> read replica).

## 3. Watch pool saturation while load runs

```bash
curl -s http://127.0.0.1:4010/api/readyz | jq .db.pool
# { "total": N, "idle": M, "waiting": W }  — waiting > 0 for sustained periods
# means the app pool is the bottleneck; raise the pg Pool `max` (lib/db) and/or
# add read replicas / connection pooling (pgbouncer) before scaling outlets.
```
