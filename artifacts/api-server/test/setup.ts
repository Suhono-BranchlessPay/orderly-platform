/**
 * Global test setup (runs before any test module is imported).
 *
 * `@workspace/db` constructs a pg Pool at import time and throws if
 * DATABASE_URL is unset. For pure unit tests we set a dummy URL that is NEVER
 * connected to (the Pool is lazy). For integration tests, set TEST_DATABASE_URL
 * to a disposable Postgres and it becomes DATABASE_URL here.
 */
// FORCE test env (override anything inherited from CI/VPS, e.g. NODE_ENV=
// production) so the dev seed fallbacks in ensure*SeedUsers are always used.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";

// The integration suite logs in as the deterministic dev-fallback accounts
// (owner@samurai.local / master@orderly.local). Any inherited ORDERLY_* seed
// overrides would seed *different* accounts and break those logins, so clear
// them for the test process only.
for (const k of [
  "ORDERLY_CLIENT_OWNER_EMAIL",
  "ORDERLY_CLIENT_OWNER_PASSWORD",
  "ORDERLY_CLIENT_OWNER_NAME",
  "ORDERLY_CLIENT_OWNER_TENANT_ID",
  "ORDERLY_DASHBOARD_MASTER_EMAIL",
  "ORDERLY_DASHBOARD_MASTER_PASSWORD",
  "ORDERLY_DASHBOARD_MASTER_NAME",
]) {
  delete process.env[k];
}

if (process.env.TEST_DATABASE_URL) {
  // Explicit opt-in for DB-backed integration tests.
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else if (!process.env.DATABASE_URL) {
  // Dummy — importing @workspace/db won't throw; unit tests never query it.
  process.env.DATABASE_URL =
    "postgres://jest:jest@127.0.0.1:5432/jest_no_connect";
}
